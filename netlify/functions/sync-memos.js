const { MongoClient } = require('mongodb');

let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) {
        return cachedDb;
    }
    
    const client = await MongoClient.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
    
    const db = client.db('memo_app');
    cachedDb = db;
    return db;
}

exports.handler = async (event, context) => {
    // 验证用户
    const user = context.clientContext?.user;
    if (!user) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: '未授权' })
        };
    }
    
    const userId = user.sub;
    const db = await connectToDatabase();
    
    try {
        const data = JSON.parse(event.body);
        
        switch (event.httpMethod) {
            case 'GET':
                // 获取用户的备忘录
                const memos = await db.collection('memos')
                    .find({ userId, isDeleted: false })
                    .sort({ updatedAt: -1 })
                    .toArray();
                
                const tags = await db.collection('tags')
                    .find({ userId })
                    .toArray();
                
                return {
                    statusCode: 200,
                    body: JSON.stringify({ memos, tags })
                };
                
            case 'POST':
                // 同步备忘录
                const { memos: memosToSync, tags: tagsToSync } = data;
                
                // 同步备忘录
                for (const memo of memosToSync) {
                    memo.userId = userId;
                    await db.collection('memos').updateOne(
                        { id: memo.id, userId },
                        { $set: memo },
                        { upsert: true }
                    );
                }
                
                // 同步标签
                for (const tag of tagsToSync) {
                    tag.userId = userId;
                    await db.collection('tags').updateOne(
                        { id: tag.id, userId },
                        { $set: tag },
                        { upsert: true }
                    );
                }
                
                return {
                    statusCode: 200,
                    body: JSON.stringify({ message: '同步成功' })
                };
                
            default:
                return {
                    statusCode: 405,
                    body: JSON.stringify({ error: '方法不允许' })
                };
        }
    } catch (error) {
        console.error('数据库错误:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: '服务器错误' })
        };
    }
};