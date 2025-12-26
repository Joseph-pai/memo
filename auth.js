// 用户认证管理
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isGuest = false;
        this.init();
    }

    init() {
        // 检查是否有存储的用户信息
        const savedUser = localStorage.getItem('memo_user');
        if (savedUser) {
            try {
                this.currentUser = JSON.parse(savedUser);
                this.showApp();
            } catch (e) {
                console.error('解析用户数据失败:', e);
                this.showLogin();
            }
        } else {
            this.showLogin();
        }

        // 绑定事件
        document.getElementById('login-btn')?.addEventListener('click', () => this.handleLogin());
        document.getElementById('signup-btn')?.addEventListener('click', () => this.handleSignup());
        document.getElementById('guest-btn')?.addEventListener('click', () => this.handleGuestLogin());
        document.getElementById('logout-btn')?.addEventListener('click', () => this.handleLogout());
        
        // 允许按Enter键登录
        document.getElementById('login-password')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });
    }

    showLogin() {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
    }

    showApp() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        this.updateUserInfo();
        
        // 初始化应用
        if (typeof memoApp !== 'undefined') {
            memoApp.init();
        }
    }

    updateUserInfo() {
        const email = this.currentUser?.email || '访客用户';
        document.getElementById('user-email').textContent = email;
    }

    async handleLogin() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        if (!email || !password) {
            this.showNotification('请输入邮箱和密码', 'error');
            return;
        }

        // 演示账户检查
        if (email === 'demo@example.com' && password === 'demo123') {
            this.currentUser = {
                id: 'demo-user-123',
                email: 'demo@example.com',
                name: '演示用户'
            };
            this.isGuest = false;
            this.saveUserData();
            this.showApp();
            this.showNotification('登录成功！使用演示账户', 'success');
            return;
        }

        // 在实际部署中，这里会调用Netlify Identity服务
        // 以下是模拟的API调用
        this.showNotification('正在验证...', 'info');
        
        try {
            // 模拟网络延迟
            await new Promise(resolve => setTimeout(resolve, 800));
            
            // 模拟验证（实际部署中需要替换为真实API）
            if (this.isValidEmail(email) && password.length >= 6) {
                this.currentUser = {
                    id: `user-${Date.now()}`,
                    email: email,
                    name: email.split('@')[0]
                };
                this.isGuest = false;
                this.saveUserData();
                this.showApp();
                this.showNotification('登录成功！', 'success');
            } else {
                this.showNotification('邮箱或密码不正确', 'error');
            }
        } catch (error) {
            console.error('登录失败:', error);
            this.showNotification('登录失败，请稍后重试', 'error');
        }
    }

    async handleSignup() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        if (!email || !password) {
            this.showNotification('请输入邮箱和密码', 'error');
            return;
        }

        if (!this.isValidEmail(email)) {
            this.showNotification('请输入有效的邮箱地址', 'error');
            return;
        }

        if (password.length < 6) {
            this.showNotification('密码至少需要6个字符', 'error');
            return;
        }

        this.showNotification('正在创建账户...', 'info');

        try {
            // 模拟网络延迟
            await new Promise(resolve => setTimeout(resolve, 800));
            
            // 模拟注册（实际部署中需要替换为真实API）
            this.currentUser = {
                id: `user-${Date.now()}`,
                email: email,
                name: email.split('@')[0]
            };
            this.isGuest = false;
            this.saveUserData();
            this.showApp();
            this.showNotification('账户创建成功！', 'success');
        } catch (error) {
            console.error('注册失败:', error);
            this.showNotification('注册失败，请稍后重试', 'error');
        }
    }

    handleGuestLogin() {
        this.currentUser = {
            id: 'guest-user',
            email: 'guest@example.com',
            name: '访客'
        };
        this.isGuest = true;
        this.saveUserData();
        this.showApp();
        this.showNotification('以访客身份登录，数据仅保存在本地', 'info');
    }

    handleLogout() {
        if (this.isGuest) {
            // 清除访客数据
            localStorage.removeItem('memo_user');
            localStorage.removeItem('memo_app_data');
        }
        
        this.currentUser = null;
        this.isGuest = false;
        this.showLogin();
        
        // 清除表单
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        
        this.showNotification('已退出登录', 'info');
    }

    saveUserData() {
        if (this.currentUser) {
            localStorage.setItem('memo_user', JSON.stringify(this.currentUser));
        }
    }

    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        const text = document.getElementById('notification-text');
        
        if (!notification || !text) return;
        
        text.textContent = message;
        notification.className = 'notification';
        
        // 根据类型设置颜色
        if (type === 'error') {
            notification.style.backgroundColor = '#ff3b30';
        } else if (type === 'success') {
            notification.style.backgroundColor = '#34c759';
        } else if (type === 'info') {
            notification.style.backgroundColor = '#007aff';
        }
        
        notification.classList.add('show');
        
        // 3秒后隐藏
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isGuestUser() {
        return this.isGuest;
    }
}

// 初始化认证管理器
const authManager = new AuthManager();