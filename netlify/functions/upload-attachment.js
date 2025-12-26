const { MongoClient, ObjectId } = require('mongodb');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// 連接緩存
let cachedDb = null;
let s3Client = null;

// 初始化S3客戶端
function getS3Client() {
    if (!s3Client) {
        s3Client = new S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });
    }
    return s3Client;
}

// 連接數據庫
async function connectToDatabase() {
    if (cachedDb) {
        return cachedDb;
    }
    
    if (!process.env.MONGODB_URI) {
        throw new Error('請設置MONGODB_URI環境變量');
    }
    
    const client = await MongoClient.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
    
    const db = client.db('memo_app');
    cachedDb = { db, client };
    return cachedDb;
}

// 上傳附件函數
exports.handler = async (event, context) => {
    // 驗證用戶
    const user = context.clientContext?.user;
    if (!user) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: '未授權訪問' })
        };
    }
    
    const userId = user.sub;
    const { db } = await connectToDatabase();
    
    try {
        switch (event.httpMethod) {
            case 'POST':
                return await generateUploadUrl(db, userId, JSON.parse(event.body || '{}'));
            case 'GET':
                return await getAttachments(db, userId, event.queryStringParameters);
            case 'DELETE':
                return await deleteAttachment(db, userId, JSON.parse(event.body || '{}'));
            default:
                return {
                    statusCode: 405,
                    body: JSON.stringify({ error: '方法不允許' })
                };
        }
    } catch (error) {
        console.error('附件處理錯誤:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: '服務器錯誤',
                message: error.message 
            })
        };
    }
};

// 生成上傳URL
async function generateUploadUrl(db, userId, data) {
    const { filename, fileType, fileSize, memoId } = data;
    
    // 驗證參數
    if (!filename || !fileType || !fileSize) {
        return {
            statusCode: 400,
            body: JSON.stringify({ 
                error: '缺少必要參數',
                required: ['filename', 'fileType', 'fileSize']
            })
        };
    }
    
    // 檢查文件大小限制
    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 默認10MB
    if (fileSize > maxSize) {
        return {
            statusCode: 400,
            body: JSON.stringify({ 
                error: '文件太大',
                maxSize: maxSize,
                currentSize: fileSize
            })
        };
    }
    
    // 檢查文件類型
    const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'image/*,.pdf,.doc,.docx,.txt,.zip').split(',');
    const isAllowed = allowedTypes.some(type => {
        if (type.includes('*')) {
            const regex = new RegExp('^' + type.replace('*', '.*').replace('.', '\\.') + '$');
            return regex.test(fileType);
        }
        return fileType.includes(type.replace('.', ''));
    });
    
    if (!isAllowed) {
        return {
            statusCode: 400,
            body: JSON.stringify({ 
                error: '不允許的文件類型',
                allowedTypes: allowedTypes
            })
        };
    }
    
    // 檢查用戶存儲限制
    const userStorage = await getUserStorage(db, userId);
    const storageLimit = parseInt(process.env.USER_STORAGE_LIMIT || '1073741824'); // 默認1GB
    
    if (userStorage.totalSize + fileSize > storageLimit) {
        return {
            statusCode: 403,
            body: JSON.stringify({ 
                error: '存儲空間不足',
                currentUsage: userStorage.totalSize,
                storageLimit: storageLimit,
                available: storageLimit - userStorage.totalSize
            })
        };
    }
    
    // 生成唯一文件名
    const fileId = new ObjectId().toString();
    const fileExt = filename.split('.').pop();
    const s3Key = `attachments/${userId}/${fileId}.${fileExt}`;
    
    // 生成預簽名URL（用於直接上傳到S3）
    const s3 = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;
    
    const putCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        ContentType: fileType,
        ContentLength: fileSize,
        Metadata: {
            userId,
            memoId: memoId || '',
            originalName: filename
        }
    });
    
    const uploadUrl = await getSignedUrl(s3, putCommand, { expiresIn: 3600 }); // 1小時過期
    
    // 生成訪問URL
    const accessUrl = `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
    
    // 創建附件記錄
    const attachmentRecord = {
        fileId,
        userId,
        memoId: memoId || null,
        filename,
        originalName: filename,
        fileType,
        fileSize,
        s3Key,
        accessUrl,
        thumbnailUrl: await generateThumbnailUrl(fileType, s3Key), // 如果是圖片，生成縮略圖URL
        uploadStatus: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
            width: null,
            height: null,
            duration: null // 視頻時長
        }
    };
    
    // 保存到數據庫
    await db.collection('attachments').insertOne(attachmentRecord);
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            uploadUrl,
            fileId,
            attachment: {
                id: fileId,
                filename,
                fileType,
                fileSize,
                accessUrl,
                thumbnailUrl: attachmentRecord.thumbnailUrl,
                createdAt: attachmentRecord.createdAt
            },
            expiresIn: 3600
        })
    };
}

// 確認上傳完成
async function confirmUpload(db, userId, data) {
    const { fileId, memoId } = data;
    
    if (!fileId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: '需要文件ID' })
        };
    }
    
    // 更新附件狀態
    const result = await db.collection('attachments').updateOne(
        {
            fileId,
            userId,
            uploadStatus: 'pending'
        },
        {
            $set: {
                uploadStatus: 'completed',
                updatedAt: new Date()
            }
        }
    );
    
    if (result.matchedCount === 0) {
        return {
            statusCode: 404,
            body: JSON.stringify({ error: '文件不存在或已確認' })
        };
    }
    
    // 如果提供了memoId，關聯到備忘錄
    if (memoId) {
        // 檢查備忘錄是否存在且屬於用戶
        const memo = await db.collection('memos').findOne({
            _id: new ObjectId(memoId),
            userId
        });
        
        if (memo) {
            // 更新附件記錄
            await db.collection('attachments').updateOne(
                { fileId },
                { $set: { memoId: new ObjectId(memoId) } }
            );
            
            // 更新備忘錄的附件列表
            await db.collection('memos').updateOne(
                { _id: new ObjectId(memoId) },
                {
                    $addToSet: { attachments: fileId },
                    $set: { updatedAt: new Date() }
                }
            );
        }
    }
    
    // 更新用戶存儲使用量
    const attachment = await db.collection('attachments').findOne({ fileId });
    if (attachment) {
        await updateUserStorage(db, userId, attachment.fileSize);
    }
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            message: '上傳確認成功',
            fileId
        })
    };
}

// 獲取附件列表
async function getAttachments(db, userId, queryParams) {
    const { memoId, page = 1, limit = 50 } = queryParams || {};
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // 構建查詢條件
    let query = { userId, uploadStatus: 'completed' };
    
    if (memoId) {
        query.memoId = new ObjectId(memoId);
    }
    
    // 獲取附件列表
    const attachments = await db.collection('attachments')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();
    
    // 獲取總數
    const total = await db.collection('attachments').countDocuments(query);
    
    // 格式化返回數據
    const formattedAttachments = attachments.map(attachment => ({
        id: attachment.fileId,
        filename: attachment.filename,
        originalName: attachment.originalName,
        fileType: attachment.fileType,
        fileSize: attachment.fileSize,
        accessUrl: attachment.accessUrl,
        thumbnailUrl: attachment.thumbnailUrl,
        memoId: attachment.memoId,
        createdAt: attachment.createdAt,
        updatedAt: attachment.updatedAt,
        metadata: attachment.metadata
    }));
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            data: formattedAttachments,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        })
    };
}

// 獲取附件詳情
async function getAttachment(db, userId, fileId) {
    const attachment = await db.collection('attachments').findOne({
        fileId,
        userId,
        uploadStatus: 'completed'
    });
    
    if (!attachment) {
        return {
            statusCode: 404,
            body: JSON.stringify({ error: '附件不存在或無權訪問' })
        };
    }
    
    // 生成臨時訪問URL（如果需要）
    let signedUrl = null;
    if (process.env.GENERATE_SIGNED_URLS === 'true') {
        const s3 = getS3Client();
        const getCommand = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: attachment.s3Key
        });
        
        signedUrl = await getSignedUrl(s3, getCommand, { expiresIn: 3600 });
    }
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            attachment: {
                id: attachment.fileId,
                filename: attachment.filename,
                originalName: attachment.originalName,
                fileType: attachment.fileType,
                fileSize: attachment.fileSize,
                accessUrl: signedUrl || attachment.accessUrl,
                thumbnailUrl: attachment.thumbnailUrl,
                memoId: attachment.memoId,
                createdAt: attachment.createdAt,
                updatedAt: attachment.updatedAt,
                metadata: attachment.metadata
            }
        })
    };
}

// 刪除附件
async function deleteAttachment(db, userId, data) {
    const { fileId, memoId } = data;
    
    if (!fileId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: '需要文件ID' })
        };
    }
    
    // 查找附件
    const attachment = await db.collection('attachments').findOne({
        fileId,
        userId
    });
    
    if (!attachment) {
        return {
            statusCode: 404,
            body: JSON.stringify({ error: '附件不存在或無權刪除' })
        };
    }
    
    // 從S3刪除文件
    const s3 = getS3Client();
    const deleteCommand = new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: attachment.s3Key
    });
    
    try {
        await s3.send(deleteCommand);
        
        // 刪除縮略圖（如果存在）
        if (attachment.thumbnailUrl) {
            const thumbnailKey = attachment.s3Key.replace('/', '/thumbnails/');
            await s3.send(new DeleteObjectCommand({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: thumbnailKey
            }));
        }
    } catch (error) {
        console.error('刪除S3文件失敗:', error);
        // 繼續刪除數據庫記錄
    }
    
    // 從數據庫刪除記錄
    await db.collection('attachments').deleteOne({ fileId });
    
    // 從相關備忘錄中移除附件ID
    if (attachment.memoId) {
        await db.collection('memos').updateOne(
            { _id: attachment.memoId },
            {
                $pull: { attachments: fileId },
                $set: { updatedAt: new Date() }
            }
        );
    }
    
    // 如果提供了memoId，也從該備忘錄中移除
    if (memoId && memoId !== attachment.memoId?.toString()) {
        await db.collection('memos').updateOne(
            { _id: new ObjectId(memoId) },
            {
                $pull: { attachments: fileId },
                $set: { updatedAt: new Date() }
            }
        );
    }
    
    // 更新用戶存儲使用量
    await updateUserStorage(db, userId, -attachment.fileSize);
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            message: '附件已刪除',
            fileId
        })
    };
}

// 生成縮略圖URL
async function generateThumbnailUrl(fileType, s3Key) {
    // 只有圖片需要縮略圖
    if (!fileType.startsWith('image/')) {
        return null;
    }
    
    // 使用CloudFront或Lambda@Edge生成縮略圖
    if (process.env.CLOUDFRONT_DOMAIN) {
        // 使用CloudFront的縮略圖功能
        return `https://${process.env.CLOUDFRONT_DOMAIN}/${s3Key}?thumb=200x200`;
    } else if (process.env.THUMBNAIL_LAMBDA) {
        // 使用Lambda函數生成縮略圖
        return `https://${process.env.API_GATEWAY_URL}/thumbnail/${s3Key}`;
    }
    
    // 直接返回原圖（生產環境應該配置縮略圖服務）
    return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
}

// 獲取用戶存儲使用情況
async function getUserStorage(db, userId) {
    const result = await db.collection('attachments').aggregate([
        {
            $match: {
                userId,
                uploadStatus: 'completed'
            }
        },
        {
            $group: {
                _id: null,
                totalSize: { $sum: '$fileSize' },
                fileCount: { $sum: 1 }
            }
        }
    ]).toArray();
    
    return result[0] || { totalSize: 0, fileCount: 0 };
}

// 更新用戶存儲使用量
async function updateUserStorage(db, userId, sizeDelta) {
    // 更新用戶存儲統計
    await db.collection('users').updateOne(
        { userId },
        {
            $inc: { storageUsed: sizeDelta },
            $set: { storageUpdatedAt: new Date() }
        },
        { upsert: true }
    );
}

// 清理過期的暫存文件
async function cleanupExpiredUploads() {
    const { db } = await connectToDatabase();
    
    // 找到超過24小時的pending文件
    const expiredTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const expiredUploads = await db.collection('attachments').find({
        uploadStatus: 'pending',
        createdAt: { $lt: expiredTime }
    }).toArray();
    
    // 刪除S3文件和數據庫記錄
    const s3 = getS3Client();
    
    for (const upload of expiredUploads) {
        try {
            await s3.send(new DeleteObjectCommand({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: upload.s3Key
            }));
        } catch (error) {
            console.error(`刪除過期文件失敗 ${upload.s3Key}:`, error);
        }
        
        await db.collection('attachments').deleteOne({ _id: upload._id });
    }
    
    console.log(`清理了 ${expiredUploads.length} 個過期的上傳`);
}