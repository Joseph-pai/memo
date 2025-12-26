const jwt = require('jsonwebtoken');

// Netlify Identity認證回調函數
exports.handler = async (event, context) => {
    // 只處理POST請求
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: '方法不允許' })
        };
    }
    
    try {
        // 解析請求體
        const body = JSON.parse(event.body || '{}');
        const { token, action } = body;
        
        // 驗證必需參數
        if (!token || !action) {
            return {
                statusCode: 400,
                body: JSON.stringify({ 
                    error: '缺少必要參數',
                    required: ['token', 'action']
                })
            };
        }
        
        // 根據動作類型處理
        switch (action) {
            case 'verify':
                return await handleVerify(token, event);
            case 'login':
                return await handleLogin(token, event);
            case 'signup':
                return await handleSignup(token, event);
            case 'logout':
                return await handleLogout(token, event);
            case 'recover':
                return await handleRecover(token, event);
            default:
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: '未知的動作類型' })
                };
        }
    } catch (error) {
        console.error('認證回調錯誤:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: '服務器錯誤',
                message: error.message 
            })
        };
    }
};

// 驗證Token
async function handleVerify(token, event) {
    try {
        // 這裡應該使用Netlify Identity的JWT密鑰進行驗證
        // 實際部署時，Netlify會自動處理Identity，這裡是示例
        const secret = process.env.NETLIFY_IDENTITY_JWT_SECRET || 'your-jwt-secret';
        
        // 驗證JWT
        const decoded = jwt.verify(token, secret);
        
        // 檢查Token是否過期
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp < now) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Token已過期' })
            };
        }
        
        // 返回用戶信息
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: true,
                user: {
                    id: decoded.sub,
                    email: decoded.email,
                    name: decoded.user_metadata?.full_name || decoded.email.split('@')[0],
                    avatar: decoded.user_metadata?.avatar_url,
                    confirmed: decoded.confirmed_at !== null
                }
            })
        };
    } catch (error) {
        console.error('Token驗證錯誤:', error);
        
        return {
            statusCode: 401,
            body: JSON.stringify({ 
                error: 'Token驗證失敗',
                message: error.message 
            })
        };
    }
}

// 處理登入
async function handleLogin(token, event) {
    try {
        // 驗證Token
        const verifyResult = await handleVerify(token, event);
        if (verifyResult.statusCode !== 200) {
            return verifyResult;
        }
        
        const userData = JSON.parse(verifyResult.body);
        
        // 創建會話
        const sessionToken = jwt.sign(
            {
                sub: userData.user.id,
                email: userData.user.email,
                name: userData.user.name,
                exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7天過期
            },
            process.env.JWT_SESSION_SECRET || 'session-secret-key'
        );
        
        // 記錄登入日誌（可選）
        if (process.env.LOG_LEVEL === 'debug') {
            console.log('用戶登入:', userData.user.email, new Date().toISOString());
        }
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Set-Cookie': `session=${sessionToken}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Strict${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
            },
            body: JSON.stringify({
                success: true,
                user: userData.user,
                session: sessionToken,
                message: '登入成功'
            })
        };
    } catch (error) {
        console.error('登入處理錯誤:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: '登入失敗',
                message: error.message 
            })
        };
    }
}

// 處理註冊
async function handleSignup(token, event) {
    try {
        // 解析請求體獲取額外信息
        const body = JSON.parse(event.body || '{}');
        const { user_metadata } = body;
        
        // 驗證Token（新用戶的Token）
        const secret = process.env.NETLIFY_IDENTITY_JWT_SECRET || 'your-jwt-secret';
        const decoded = jwt.verify(token, secret);
        
        // 創建用戶記錄（這裡可以連接到數據庫）
        const newUser = {
            id: decoded.sub,
            email: decoded.email,
            name: user_metadata?.full_name || decoded.email.split('@')[0],
            avatar: user_metadata?.avatar_url,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_login: new Date().toISOString(),
            settings: {
                theme: 'light',
                language: 'zh-TW',
                notifications: true
            }
        };
        
        // 這裡可以保存用戶到數據庫
        // await saveUserToDatabase(newUser);
        
        // 發送歡迎郵件（可選）
        if (process.env.SENDGRID_API_KEY && decoded.email) {
            await sendWelcomeEmail(decoded.email, newUser.name);
        }
        
        return {
            statusCode: 201,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: true,
                user: newUser,
                message: '註冊成功，歡迎使用！'
            })
        };
    } catch (error) {
        console.error('註冊處理錯誤:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: '註冊失敗',
                message: error.message 
            })
        };
    }
}

// 處理登出
async function handleLogout(token, event) {
    try {
        // 驗證Token
        await handleVerify(token, event);
        
        // 清除會話
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Set-Cookie': 'session=; HttpOnly; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
            },
            body: JSON.stringify({
                success: true,
                message: '已登出'
            })
        };
    } catch (error) {
        console.error('登出處理錯誤:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: '登出失敗',
                message: error.message 
            })
        };
    }
}

// 處理密碼恢復
async function handleRecover(token, event) {
    try {
        // 這裡處理密碼恢復邏輯
        const body = JSON.parse(event.body || '{}');
        const { email } = body;
        
        if (!email) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: '需要電子郵件地址' })
            };
        }
        
        // 生成重置Token
        const resetToken = jwt.sign(
            { email, action: 'password_reset' },
            process.env.JWT_RESET_SECRET || 'reset-secret-key',
            { expiresIn: '1h' }
        );
        
        // 發送重置郵件
        if (process.env.SENDGRID_API_KEY) {
            await sendPasswordResetEmail(email, resetToken);
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: '重置鏈接已發送到您的郵箱',
                // 開發環境下返回Token用於測試
                ...(process.env.NODE_ENV !== 'production' && { resetToken })
            })
        };
    } catch (error) {
        console.error('密碼恢復錯誤:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: '密碼恢復失敗',
                message: error.message 
            })
        };
    }
}

// 發送歡迎郵件（示例）
async function sendWelcomeEmail(email, name) {
    // 這裡實現發送郵件的邏輯
    // 可以使用SendGrid、AWS SES等服務
    console.log(`發送歡迎郵件給 ${email} (${name})`);
    return true;
}

// 發送密碼重置郵件（示例）
async function sendPasswordResetEmail(email, resetToken) {
    // 這裡實現發送重置郵件的邏輯
    const resetUrl = `${process.env.APP_URL || 'https://your-app.netlify.app'}/reset-password?token=${resetToken}`;
    console.log(`發送重置郵件給 ${email}: ${resetUrl}`);
    return true;
}