const { MongoClient, ObjectId } = require('mongodb');
const sgMail = require('@sendgrid/mail');

// 連接緩存
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

// 發送提醒函數（計劃任務）
exports.handler = async (event, context) => {
    // 這個函數通常由計劃任務觸發，不需要用戶認證
    // 但可以設置API密鑰進行保護
    const apiKey = event.headers['x-api-key'];
    if (apiKey !== process.env.REMINDER_API_KEY) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: '未授權訪問' })
        };
    }
    
    try {
        const { db } = await connectToDatabase();
        
        // 獲取需要發送提醒的備忘錄
        const now = new Date();
        const reminders = await getDueReminders(db, now);
        
        if (reminders.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({ 
                    message: '沒有需要發送的提醒',
                    timestamp: now.toISOString()
                })
            };
        }
        
        // 發送提醒
        const results = await sendReminders(reminders);
        
        // 更新發送狀態
        await updateRemindersStatus(db, results);
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: true,
                message: `處理了 ${reminders.length} 個提醒`,
                sent: results.sent,
                failed: results.failed,
                timestamp: now.toISOString()
            })
        };
    } catch (error) {
        console.error('發送提醒錯誤:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: '服務器錯誤',
                message: error.message 
            })
        };
    }
};

// 獲取到期的提醒
async function getDueReminders(db, now) {
    // 獲取所有未通知且提醒時間已到的備忘錄
    // 考慮時區：允許±5分鐘的窗口
    const windowStart = new Date(now.getTime() - 5 * 60 * 1000); // 5分鐘前
    const windowEnd = new Date(now.getTime() + 5 * 60 * 1000);   // 5分鐘後
    
    const memos = await db.collection('memos').find({
        reminder: {
            $gte: windowStart,
            $lte: windowEnd
        },
        reminderNotified: false,
        isDeleted: false
    }).toArray();
    
    // 獲取用戶信息
    const userIds = [...new Set(memos.map(memo => memo.userId))];
    const users = await db.collection('users').find({
        userId: { $in: userIds }
    }).toArray();
    
    const userMap = {};
    users.forEach(user => {
        userMap[user.userId] = user;
    });
    
    // 組合數據
    const reminders = memos.map(memo => ({
        memoId: memo._id,
        userId: memo.userId,
        userEmail: userMap[memo.userId]?.email || memo.userEmail,
        userName: userMap[memo.userId]?.name || memo.userName,
        title: memo.title || '無標題備忘錄',
        content: memo.content ? memo.content.substring(0, 200) + '...' : '',
        reminderTime: memo.reminder,
        timezone: userMap[memo.userId]?.timezone || 'Asia/Taipei',
        notificationPreferences: userMap[memo.userId]?.notificationPreferences || {
            email: true,
            push: true,
            inApp: true
        }
    }));
    
    return reminders;
}

// 發送提醒
async function sendReminders(reminders) {
    const results = {
        sent: [],
        failed: []
    };
    
    // 初始化SendGrid（如果配置了）
    if (process.env.SENDGRID_API_KEY) {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    }
    
    for (const reminder of reminders) {
        try {
            // 發送電子郵件提醒
            if (reminder.notificationPreferences.email && reminder.userEmail) {
                await sendEmailReminder(reminder);
            }
            
            // 發送推送通知（需要配置）
            if (reminder.notificationPreferences.push) {
                await sendPushNotification(reminder);
            }
            
            // 記錄為已發送
            results.sent.push({
                memoId: reminder.memoId,
                userId: reminder.userId,
                emailSent: reminder.notificationPreferences.email && !!reminder.userEmail,
                pushSent: reminder.notificationPreferences.push,
                sentAt: new Date()
            });
        } catch (error) {
            console.error(`發送提醒失敗 ${reminder.memoId}:`, error);
            results.failed.push({
                memoId: reminder.memoId,
                userId: reminder.userId,
                error: error.message,
                failedAt: new Date()
            });
        }
    }
    
    return results;
}

// 發送電子郵件提醒
async function sendEmailReminder(reminder) {
    if (!process.env.SENDGRID_API_KEY) {
        console.log('SendGrid未配置，跳過郵件發送');
        return;
    }
    
    // 格式化時間
    const reminderTime = new Date(reminder.reminderTime);
    const formattedTime = reminderTime.toLocaleString('zh-TW', {
        timeZone: reminder.timezone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // 創建查看鏈接
    const memoUrl = `${process.env.APP_URL || 'https://your-app.netlify.app'}/memo/${reminder.memoId}`;
    
    const msg = {
        to: reminder.userEmail,
        from: process.env.FROM_EMAIL || 'noreply@yourdomain.com',
        subject: `📝 備忘錄提醒：${reminder.title}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    .header {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 30px;
                        border-radius: 10px;
                        text-align: center;
                        margin-bottom: 30px;
                    }
                    .header h1 {
                        margin: 0;
                        font-size: 24px;
                    }
                    .content {
                        background-color: #f8f9fa;
                        padding: 25px;
                        border-radius: 8px;
                        margin-bottom: 25px;
                    }
                    .content h2 {
                        color: #2c3e50;
                        margin-top: 0;
                        border-bottom: 2px solid #e0e0e0;
                        padding-bottom: 10px;
                    }
                    .preview {
                        background-color: white;
                        padding: 20px;
                        border-radius: 6px;
                        border-left: 4px solid #007aff;
                        margin: 20px 0;
                    }
                    .button {
                        display: inline-block;
                        background-color: #007aff;
                        color: white;
                        text-decoration: none;
                        padding: 14px 28px;
                        border-radius: 8px;
                        font-weight: 600;
                        font-size: 16px;
                        margin: 20px 0;
                        transition: all 0.3s;
                    }
                    .button:hover {
                        background-color: #0056cc;
                        transform: translateY(-2px);
                        box-shadow: 0 5px 15px rgba(0, 122, 255, 0.3);
                    }
                    .footer {
                        text-align: center;
                        color: #666;
                        font-size: 14px;
                        margin-top: 40px;
                        padding-top: 20px;
                        border-top: 1px solid #eee;
                    }
                    .time-info {
                        background-color: #e8f4ff;
                        padding: 15px;
                        border-radius: 6px;
                        margin: 15px 0;
                        text-align: center;
                    }
                    .time-info i {
                        color: #007aff;
                        margin-right: 8px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1><i class="fas fa-bell"></i> 備忘錄提醒</h1>
                </div>
                
                <div class="content">
                    <h2>${reminder.title}</h2>
                    
                    <div class="time-info">
                        <p><i class="fas fa-clock"></i> 提醒時間：${formattedTime}</p>
                    </div>
                    
                    <div class="preview">
                        ${reminder.content || '點擊下方按鈕查看完整內容...'}
                    </div>
                    
                    <div style="text-align: center;">
                        <a href="${memoUrl}" class="button">
                            <i class="fas fa-external-link-alt"></i> 查看備忘錄
                        </a>
                    </div>
                    
                    <p style="color: #666; font-size: 14px; margin-top: 25px;">
                        如果您不再需要此提醒，可以在備忘錄中取消設置。
                    </p>
                </div>
                
                <div class="footer">
                    <p>這是來自 <strong>我的備忘錄</strong> 的自動提醒</p>
                    <p>© ${new Date().getFullYear()} 我的備忘錄 | <a href="${process.env.APP_URL}" style="color: #007aff;">訪問網站</a></p>
                    <p style="font-size: 12px; color: #999;">
                        如果您不希望收到此類郵件，可以在帳戶設置中關閉郵件提醒。
                    </p>
                </div>
            </body>
            </html>
        `,
        // 文本版本（用於不支持HTML的客戶端）
        text: `
            備忘錄提醒：${reminder.title}
            
            提醒時間：${formattedTime}
            
            內容預覽：
            ${reminder.content || '點擊鏈接查看完整內容'}
            
            查看完整內容：${memoUrl}
            
            --
            我的備忘錄
            ${process.env.APP_URL || 'https://your-app.netlify.app'}
        `
    };
    
    await sgMail.send(msg);
    console.log(`郵件提醒已發送給 ${reminder.userEmail}`);
}

// 發送推送通知
async function sendPushNotification(reminder) {
    // 這裡實現推送通知邏輯
    // 可以使用Firebase Cloud Messaging (FCM)、OneSignal等服務
    
    console.log(`推送通知給用戶 ${reminder.userId}: ${reminder.title}`);
    
    // 示例：使用Firebase Admin SDK
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            const admin = require('firebase-admin');
            
            // 初始化Firebase（如果還沒初始化）
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(
                        JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
                    )
                });
            }
            
            // 獲取用戶的設備令牌
            const tokens = await getUserDeviceTokens(reminder.userId);
            
            if (tokens.length > 0) {
                const message = {
                    notification: {
                        title: '📝 備忘錄提醒',
                        body: reminder.title
                    },
                    data: {
                        memoId: reminder.memoId.toString(),
                        type: 'reminder',
                        timestamp: new Date().toISOString()
                    },
                    tokens: tokens
                };
                
                const response = await admin.messaging().sendEachForMulticast(message);
                console.log(`推送發送成功：${response.successCount}成功，${response.failureCount}失敗`);
            }
        } catch (error) {
            console.error('推送通知失敗:', error);
            throw error;
        }
    }
}

// 獲取用戶設備令牌
async function getUserDeviceTokens(userId) {
    // 這裡應該從數據庫獲取用戶註冊的設備令牌
    const { db } = await connectToDatabase();
    
    const devices = await db.collection('user_devices').find({
        userId,
        notificationEnabled: true,
        deviceToken: { $exists: true, $ne: null }
    }).toArray();
    
    return devices.map(device => device.deviceToken);
}

// 更新提醒狀態
async function updateRemindersStatus(db, results) {
    const sentMemoIds = results.sent.map(r => r.memoId);
    const failedMemoIds = results.failed.map(r => r.memoId);
    
    // 更新已成功發送的提醒
    if (sentMemoIds.length > 0) {
        await db.collection('memos').updateMany(
            { _id: { $in: sentMemoIds } },
            {
                $set: {
                    reminderNotified: true,
                    lastNotified: new Date(),
                    updatedAt: new Date()
                }
            }
        );
        
        // 記錄發送日誌
        const sentLogs = results.sent.map(result => ({
            ...result,
            memoId: result.memoId,
            _id: new ObjectId()
        }));
        
        await db.collection('notification_logs').insertMany(sentLogs);
    }
    
    // 記錄失敗的提醒
    if (failedMemoIds.length > 0) {
        const failedLogs = results.failed.map(result => ({
            ...result,
            memoId: result.memoId,
            _id: new ObjectId()
        }));
        
        await db.collection('notification_logs').insertMany(failedLogs);
        
        // 可以設置重試機制
        await scheduleRetry(failedMemoIds);
    }
}

// 安排重試
async function scheduleRetry(failedMemoIds) {
    // 這裡可以實現重試邏輯
    // 例如：5分鐘後重試，最多重試3次
    
    console.log(`安排重試：${failedMemoIds.length} 個失敗的提醒`);
    
    // 可以將重試任務添加到隊列中（如Redis、RabbitMQ）
    // 或設置延遲的定時任務
}

// 手動觸發提醒（用於測試）
async function triggerManualReminder(event, context) {
    // 驗證用戶
    const user = context.clientContext?.user;
    if (!user) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: '未授權訪問' })
        };
    }
    
    const { db } = await connectToDatabase();
    const userId = user.sub;
    const data = JSON.parse(event.body || '{}');
    
    const { memoId, testEmail } = data;
    
    if (!memoId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: '需要備忘錄ID' })
        };
    }
    
    // 獲取備忘錄
    const memo = await db.collection('memos').findOne({
        _id: new ObjectId(memoId),
        userId
    });
    
    if (!memo) {
        return {
            statusCode: 404,
            body: JSON.stringify({ error: '備忘錄不存在' })
        };
    }
    
    // 獲取用戶信息
    const userInfo = await db.collection('users').findOne({ userId });
    
    // 創建測試提醒
    const testReminder = {
        memoId: memo._id,
        userId,
        userEmail: testEmail || userInfo?.email || user.email,
        userName: userInfo?.name || user.email.split('@')[0],
        title: memo.title || '測試提醒',
        content: memo.content ? memo.content.substring(0, 200) + '...' : '這是一個測試提醒',
        reminderTime: new Date(),
        timezone: userInfo?.timezone || 'Asia/Taipei',
        notificationPreferences: {
            email: true,
            push: false,
            inApp: true
        }
    };
    
    try {
        // 發送測試提醒
        if (process.env.SENDGRID_API_KEY) {
            await sendEmailReminder(testReminder);
            
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    message: '測試提醒已發送',
                    sentTo: testReminder.userEmail
                })
            };
        } else {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: '郵件服務未配置',
                    message: '請配置SendGrid API密鑰'
                })
            };
        }
    } catch (error) {
        console.error('測試提醒失敗:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: '發送測試提醒失敗',
                message: error.message
            })
        };
    }
}