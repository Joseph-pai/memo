const { MongoClient, ObjectId } = require('mongodb');

// MongoDB連接緩存
let cachedDb = null;

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

// 分享備忘錄函數
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
    const { db, client } = await connectToDatabase();
    
    try {
        const data = JSON.parse(event.body || '{}');
        
        switch (event.httpMethod) {
            case 'POST':
                return await shareMemo(db, userId, data);
            case 'GET':
                return await getSharedMemos(db, userId, event.queryStringParameters);
            case 'PUT':
                return await updateShareSettings(db, userId, data);
            case 'DELETE':
                return await unshareMemo(db, userId, data);
            default:
                return {
                    statusCode: 405,
                    body: JSON.stringify({ error: '方法不允許' })
                };
        }
    } catch (error) {
        console.error('分享功能錯誤:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: '服務器錯誤',
                message: error.message 
            })
        };
    } finally {
        // 不關閉連接，使用連接池
    }
};

// 分享備忘錄
async function shareMemo(db, userId, data) {
    const { memoId, shareType, recipients = [], expiresAt } = data;
    
    // 驗證參數
    if (!memoId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: '需要備忘錄ID' })
        };
    }
    
    // 檢查備忘錄是否存在且屬於用戶
    const memo = await db.collection('memos').findOne({
        _id: new ObjectId(memoId),
        userId
    });
    
    if (!memo) {
        return {
            statusCode: 404,
            body: JSON.stringify({ error: '備忘錄不存在或無權訪問' })
        };
    }
    
    // 檢查用戶是否超過分享限制
    const shareCount = await db.collection('shared_memos').countDocuments({
        ownerId: userId,
        status: 'active'
    });
    
    const maxShares = parseInt(process.env.MAX_SHARES_PER_USER || '100');
    if (shareCount >= maxShares) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: '分享數量達到上限' })
        };
    }
    
    // 生成分享ID
    const shareId = generateShareId();
    
    // 設置過期時間
    let expiryDate = null;
    if (expiresAt) {
        expiryDate = new Date(expiresAt);
    } else {
        // 默認30天後過期
        expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
    }
    
    // 創建分享記錄
    const shareRecord = {
        shareId,
        memoId: new ObjectId(memoId),
        ownerId: userId,
        ownerEmail: memo.ownerEmail || user.email,
        memoTitle: memo.title || '無標題',
        shareType: shareType || 'link', // 'link', 'email', 'private'
        recipients: Array.isArray(recipients) ? recipients : [recipients],
        permissions: {
            canView: true,
            canEdit: data.permissions?.canEdit || false,
            canComment: data.permissions?.canComment || false,
            canShare: data.permissions?.canShare || false
        },
        expiresAt: expiryDate,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'active',
        viewCount: 0,
        lastViewed: null
    };
    
    // 保存到數據庫
    await db.collection('shared_memos').insertOne(shareRecord);
    
    // 更新備忘錄的分享狀態
    await db.collection('memos').updateOne(
        { _id: new ObjectId(memoId) },
        {
            $set: {
                isShared: true,
                shareId,
                sharedAt: new Date(),
                updatedAt: new Date()
            }
        }
    );
    
    // 生成分享鏈接
    const shareLink = `${process.env.APP_URL || 'https://your-app.netlify.app'}/shared/${shareId}`;
    
    // 如果通過郵件分享，發送郵件
    if (shareType === 'email' && recipients.length > 0) {
        await sendShareEmails(recipients, memo.title, shareLink, user.email);
    }
    
    return {
        statusCode: 201,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            shareId,
            shareLink,
            message: '分享成功',
            shareRecord: {
                ...shareRecord,
                memoId: undefined,
                _id: undefined
            }
        })
    };
}

// 獲取分享的備忘錄
async function getSharedMemos(db, userId, queryParams) {
    const { type = 'shared_by_me', page = 1, limit = 20 } = queryParams || {};
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let query = {};
    let countQuery = {};
    
    if (type === 'shared_by_me') {
        // 我分享的
        query.ownerId = userId;
        countQuery.ownerId = userId;
    } else if (type === 'shared_with_me') {
        // 分享給我的
        query.recipients = userId;
        countQuery.recipients = userId;
    } else if (type === 'public') {
        // 公開分享
        query.shareType = 'link';
        query.status = 'active';
        countQuery.shareType = 'link';
        countQuery.status = 'active';
    }
    
    // 只獲取未過期的
    query.expiresAt = { $gt: new Date() };
    query.status = 'active';
    
    countQuery.expiresAt = { $gt: new Date() };
    countQuery.status = 'active';
    
    // 獲取分享記錄
    const shares = await db.collection('shared_memos')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();
    
    // 獲取總數
    const total = await db.collection('shared_memos').countDocuments(countQuery);
    
    // 獲取相關的備忘錄內容
    const memoIds = shares.map(share => share.memoId);
    const memos = await db.collection('memos')
        .find({ _id: { $in: memoIds } })
        .toArray();
    
    const memoMap = {};
    memos.forEach(memo => {
        memoMap[memo._id.toString()] = memo;
    });
    
    // 合併數據
    const result = shares.map(share => {
        const memo = memoMap[share.memoId.toString()];
        return {
            shareId: share.shareId,
            memoId: share.memoId,
            memoTitle: memo?.title || share.memoTitle,
            memoPreview: memo?.content?.substring(0, 100) || '',
            shareType: share.shareType,
            recipients: share.recipients,
            permissions: share.permissions,
            expiresAt: share.expiresAt,
            createdAt: share.createdAt,
            viewCount: share.viewCount,
            lastViewed: share.lastViewed,
            shareLink: `${process.env.APP_URL || 'https://your-app.netlify.app'}/shared/${share.shareId}`
        };
    });
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            data: result,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        })
    };
}

// 獲取特定分享的內容
async function getSharedMemoByShareId(db, shareId, userId = null) {
    const share = await db.collection('shared_memos').findOne({
        shareId,
        status: 'active',
        expiresAt: { $gt: new Date() }
    });
    
    if (!share) {
        return null;
    }
    
    // 檢查權限
    if (share.shareType === 'private') {
        if (!userId || (share.ownerId !== userId && !share.recipients.includes(userId))) {
            return null;
        }
    }
    
    // 獲取備忘錄內容
    const memo = await db.collection('memos').findOne({
        _id: new ObjectId(share.memoId)
    });
    
    if (!memo) {
        return null;
    }
    
    // 更新查看統計
    await db.collection('shared_memos').updateOne(
        { shareId },
        {
            $inc: { viewCount: 1 },
            $set: { lastViewed: new Date() }
        }
    );
    
    // 根據權限過濾內容
    let memoContent = memo.content;
    if (!share.permissions.canEdit) {
        // 移除編輯相關的元數據
        memoContent = memoContent.replace(/contenteditable="true"/g, '');
    }
    
    return {
        shareId: share.shareId,
        memoId: memo._id,
        title: memo.title,
        content: memoContent,
        tags: memo.tags || [],
        attachments: memo.attachments || [],
        createdAt: memo.createdAt,
        updatedAt: memo.updatedAt,
        permissions: share.permissions,
        owner: {
            id: share.ownerId,
            email: share.ownerEmail
        },
        sharedAt: share.createdAt,
        expiresAt: share.expiresAt
    };
}

// 更新分享設置
async function updateShareSettings(db, userId, data) {
    const { shareId, permissions, recipients, expiresAt } = data;
    
    if (!shareId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: '需要分享ID' })
        };
    }
    
    // 檢查分享是否存在且屬於用戶
    const share = await db.collection('shared_memos').findOne({
        shareId,
        ownerId: userId
    });
    
    if (!share) {
        return {
            statusCode: 404,
            body: JSON.stringify({ error: '分享不存在或無權修改' })
        };
    }
    
    // 準備更新數據
    const updateData = {
        updatedAt: new Date()
    };
    
    if (permissions) {
        updateData.permissions = {
            ...share.permissions,
            ...permissions
        };
    }
    
    if (recipients) {
        updateData.recipients = Array.isArray(recipients) ? recipients : [recipients];
    }
    
    if (expiresAt) {
        updateData.expiresAt = new Date(expiresAt);
    }
    
    // 更新數據庫
    await db.collection('shared_memos').updateOne(
        { shareId },
        { $set: updateData }
    );
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            message: '分享設置已更新',
            shareId
        })
    };
}

// 取消分享
async function unshareMemo(db, userId, data) {
    const { shareId, memoId } = data;
    
    if (!shareId && !memoId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: '需要分享ID或備忘錄ID' })
        };
    }
    
    let query = {};
    if (shareId) {
        query.shareId = shareId;
    } else if (memoId) {
        query.memoId = new ObjectId(memoId);
    }
    
    query.ownerId = userId;
    
    // 檢查分享是否存在
    const share = await db.collection('shared_memos').findOne(query);
    if (!share) {
        return {
            statusCode: 404,
            body: JSON.stringify({ error: '分享不存在或無權取消' })
        };
    }
    
    // 軟刪除（標記為已取消）
    await db.collection('shared_memos').updateOne(
        query,
        {
            $set: {
                status: 'cancelled',
                cancelledAt: new Date(),
                updatedAt: new Date()
            }
        }
    );
    
    // 如果這是該備忘錄的唯一分享，更新備忘錄狀態
    const activeShares = await db.collection('shared_memos').countDocuments({
        memoId: share.memoId,
        status: 'active'
    });
    
    if (activeShares === 0) {
        await db.collection('memos').updateOne(
            { _id: share.memoId },
            {
                $set: {
                    isShared: false,
                    shareId: null,
                    updatedAt: new Date()
                }
            }
        );
    }
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            message: '分享已取消',
            shareId: share.shareId
        })
    };
}

// 生成分享ID
function generateShareId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 16; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 發送分享郵件
async function sendShareEmails(recipients, memoTitle, shareLink, ownerEmail) {
    // 這裡實現發送郵件的邏輯
    // 可以使用SendGrid、AWS SES等服務
    
    console.log('發送分享郵件:');
    console.log('收件人:', recipients);
    console.log('備忘錄標題:', memoTitle);
    console.log('分享鏈接:', shareLink);
    console.log('分享者:', ownerEmail);
    
    // 示例：使用SendGrid發送郵件
    if (process.env.SENDGRID_API_KEY) {
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        
        const msg = {
            to: recipients,
            from: process.env.FROM_EMAIL || 'noreply@yourdomain.com',
            subject: `備忘錄分享：${memoTitle}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>備忘錄分享</h2>
                    <p>${ownerEmail} 與您分享了一個備忘錄：</p>
                    <div style="background-color: #f5f5f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0;">${memoTitle}</h3>
                        <p>點擊下方鏈接查看內容：</p>
                        <a href="${shareLink}" style="display: inline-block; background-color: #007aff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px;">
                            查看備忘錄
                        </a>
                    </div>
                    <p style="color: #666; font-size: 14px;">
                        此鏈接將在30天後過期。如果您不希望收到此類郵件，請忽略此郵件。
                    </p>
                </div>
            `
        };
        
        try {
            await sgMail.send(msg);
            console.log('分享郵件發送成功');
        } catch (error) {
            console.error('發送郵件失敗:', error);
        }
    }
    
    return true;
}