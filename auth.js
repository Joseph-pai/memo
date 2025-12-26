// 用户认证管理
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isGuest = false;
        this.isOnline = navigator.onLine;
        this.syncQueue = [];
        this.init();
        this.setupNetworkListener();
        this.setupAutoSync();
        this.requestNotificationPermission();
    }

    init() {
        // 检查是否有存储的用户信息
        const savedUser = localStorage.getItem('memo_user');
        if (savedUser) {
            try {
                this.currentUser = JSON.parse(savedUser);
                this.isGuest = this.currentUser.id === 'guest-user';
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

    setupNetworkListener() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.showNotification('网络已连接，开始同步...', 'info');
            this.syncData();
            
            // 显示在线状态
            const badge = document.getElementById('sync-status-badge');
            if (badge) {
                badge.innerHTML = '<i class="fas fa-wifi"></i> 在线';
                badge.className = 'sync-badge online';
            }
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.showNotification('网络已断开，切换到离线模式', 'warning');
            
            // 显示离线状态
            const badge = document.getElementById('sync-status-badge');
            if (badge) {
                badge.innerHTML = '<i class="fas fa-wifi-slash"></i> 离线';
                badge.className = 'sync-badge offline';
            }
        });
        
        // 初始化网络状态显示
        this.updateNetworkStatus();
    }

    updateNetworkStatus() {
        const badge = document.getElementById('sync-status-badge');
        if (!badge) return;
        
        if (this.isOnline) {
            badge.innerHTML = '<i class="fas fa-wifi"></i> 在线';
            badge.className = 'sync-badge online';
        } else {
            badge.innerHTML = '<i class="fas fa-wifi-slash"></i> 离线';
            badge.className = 'sync-badge offline';
        }
    }

    setupAutoSync() {
        // 每5分钟自动同步一次
        setInterval(() => {
            if (this.isOnline && !this.isGuest && this.currentUser) {
                this.syncData();
            }
        }, 5 * 60 * 1000);
        
        // 页面显示时同步
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isOnline && !this.isGuest && this.currentUser) {
                this.syncData();
            }
        });
    }

    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    showLogin() {
        document.getElementById('login-screen')?.classList.remove('hidden');
        document.getElementById('app-screen')?.classList.add('hidden');
    }

    showApp() {
        document.getElementById('login-screen')?.classList.add('hidden');
        document.getElementById('app-screen')?.classList.remove('hidden');
        this.updateUserInfo();
        
        // 初始化应用
        if (typeof memoApp !== 'undefined') {
            memoApp.init();
        }
        
        // 更新网络状态
        this.updateNetworkStatus();
        
        // 如果是演示账户，显示提示
        if (this.currentUser?.email === 'demo@example.com') {
            setTimeout(() => {
                this.showNotification('您正在使用演示账户，数据仅保存在本地', 'info');
            }, 1000);
        }
    }

    updateUserInfo() {
        const email = this.currentUser?.email || '访客用户';
        const userEmailElement = document.getElementById('user-email');
        if (userEmailElement) {
            userEmailElement.textContent = email;
        }
    }

    async handleLogin() {
        const email = document.getElementById('login-email')?.value;
        const password = document.getElementById('login-password')?.value;
        
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
                
                // 触发数据同步
                this.syncData();
            } else {
                this.showNotification('邮箱或密码不正确', 'error');
            }
        } catch (error) {
            console.error('登录失败:', error);
            this.showNotification('登录失败，请稍后重试', 'error');
        }
    }

    async handleSignup() {
        const email = document.getElementById('login-email')?.value;
        const password = document.getElementById('login-password')?.value;
        
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
            
            // 触发数据同步
            setTimeout(() => this.syncData(), 1000);
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
        if (confirm('确定要退出登录吗？' + (this.isGuest ? '访客数据将被清除。' : ''))) {
            if (this.isGuest) {
                // 清除访客数据
                localStorage.removeItem('memo_user');
                localStorage.removeItem('memo_app_data');
            }
            
            this.currentUser = null;
            this.isGuest = false;
            this.showLogin();
            
            // 清除表单
            const loginEmail = document.getElementById('login-email');
            const loginPassword = document.getElementById('login-password');
            if (loginEmail) loginEmail.value = '';
            if (loginPassword) loginPassword.value = '';
            
            this.showNotification('已退出登录', 'info');
        }
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
        
        if (!notification || !text) {
            // 如果没有通知元素，创建临时通知
            console.log(`${type}: ${message}`);
            return;
        }
        
        text.textContent = message;
        notification.className = 'notification';
        
        // 根据类型设置颜色
        switch (type) {
            case 'error':
                notification.style.backgroundColor = '#ff3b30';
                break;
            case 'success':
                notification.style.backgroundColor = '#34c759';
                break;
            case 'warning':
                notification.style.backgroundColor = '#ff9500';
                break;
            case 'info':
            default:
                notification.style.backgroundColor = '#007aff';
                break;
        }
        
        notification.classList.add('show');
        
        // 3秒后隐藏
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    async syncData() {
        if (!this.isOnline || this.isGuest) return;
        
        const syncBtn = document.getElementById('sync-btn');
        const syncStatus = document.getElementById('sync-status');
        
        if (syncBtn && syncStatus) {
            syncBtn.disabled = true;
            syncStatus.textContent = '同步中...';
            syncStatus.className = 'sync-status syncing';
        }
        
        try {
            // 获取本地数据
            const localData = JSON.parse(localStorage.getItem('memo_app_data') || '{}');
            
            // 模拟API调用 - 实际部署时替换为真实API
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 模拟同步过程
            const localChanges = this.syncQueue.length;
            
            // 处理同步队列中的操作
            while (this.syncQueue.length > 0) {
                const operation = this.syncQueue.shift();
                await this.processSyncOperation(operation);
            }
            
            // 模拟从服务器获取最新数据
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 保存同步时间
            localData.lastSynced = new Date().toISOString();
            localStorage.setItem('memo_app_data', JSON.stringify(localData));
            
            if (syncBtn && syncStatus) {
                syncStatus.textContent = localChanges > 0 ? '同步成功' : '已是最新';
                syncStatus.className = 'sync-status success';
                setTimeout(() => {
                    syncStatus.textContent = '';
                    syncBtn.disabled = false;
                }, 2000);
            }
            
            if (localChanges > 0) {
                this.showNotification(`数据同步完成（${localChanges}个更新）`, 'success');
                
                // 刷新应用数据
                if (typeof memoApp !== 'undefined') {
                    memoApp.loadData();
                    memoApp.renderMemos();
                    memoApp.updateCounts();
                }
            }
            
        } catch (error) {
            console.error('同步失败:', error);
            
            if (syncBtn && syncStatus) {
                syncStatus.textContent = '同步失败';
                syncStatus.className = 'sync-status error';
                setTimeout(() => {
                    syncStatus.textContent = '';
                    syncBtn.disabled = false;
                }, 2000);
            }
            
            this.showNotification('同步失败，请检查网络', 'error');
        }
    }

    async processSyncOperation(operation) {
        // 模拟API调用
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // 这里可以记录操作到日志
        console.log('同步操作:', operation.type, operation.data?.id || '');
        
        switch (operation.type) {
            case 'CREATE_MEMO':
                // 调用创建API
                break;
            case 'UPDATE_MEMO':
                // 调用更新API
                break;
            case 'DELETE_MEMO':
                // 调用删除API
                break;
            case 'UPLOAD_ATTACHMENT':
                // 调用上传API
                break;
            case 'CREATE_TAG':
                // 调用创建标签API
                break;
            case 'UPDATE_TAG':
                // 调用更新标签API
                break;
        }
        
        return { success: true };
    }

    addToSyncQueue(operation) {
        this.syncQueue.push(operation);
        
        // 如果在线，立即同步
        if (this.isOnline && !this.isGuest) {
            setTimeout(() => this.syncData(), 100);
        }
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isGuestUser() {
        return this.isGuest;
    }

    isUserOnline() {
        return this.isOnline;
    }

    getSyncStatus() {
        return {
            isOnline: this.isOnline,
            isGuest: this.isGuest,
            queueLength: this.syncQueue.length,
            lastSynced: localStorage.getItem('memo_app_data') ? 
                JSON.parse(localStorage.getItem('memo_app_data')).lastSynced : null
        };
    }
}

// 初始化认证管理器
const authManager = new AuthManager();