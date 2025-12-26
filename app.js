// 主备忘录应用
class MemoApp {
    constructor() {
        this.memos = [];
        this.tags = [];
        this.attachments = [];
        this.sharedMemos = [];
        this.currentMemo = null;
        this.currentFolder = 'all';
        this.viewMode = 'list';
        this.searchQuery = '';
        this.autoSaveTimer = null;
        this.reminderChecker = null;
        this.isDarkTheme = localStorage.getItem('dark_theme') === 'true';
        this.isDataLoaded = false;
        this.init();
    }

    init() {
        this.loadData();
        this.applyTheme();
        this.setupEventListeners();
        this.setupReminderChecker();
        this.setupDragAndDrop();
        this.setupKeyboardShortcuts();
        this.renderMemos();
        this.renderTags();
        this.updateCounts();
        this.setupShareTypeListeners();
        
        // 创建示例数据（首次使用）
        if (this.memos.length === 0 && this.tags.length === 0) {
            setTimeout(() => this.createSampleData(), 500);
        }
        
        this.isDataLoaded = true;
    }

    loadData() {
        // 加载保存的数据
        const savedData = localStorage.getItem('memo_app_data');
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                this.memos = data.memos || [];
                this.tags = data.tags || [];
                this.attachments = data.attachments || [];
                this.sharedMemos = data.sharedMemos || [];
                
                // 恢复主题设置
                if (data.theme === 'dark') {
                    this.isDarkTheme = true;
                } else if (data.theme === 'light') {
                    this.isDarkTheme = false;
                }
                
            } catch (e) {
                console.error('解析保存数据失败:', e);
                this.memos = [];
                this.tags = [];
                this.attachments = [];
                this.sharedMemos = [];
            }
        }
    }

    saveData() {
        const data = {
            memos: this.memos,
            tags: this.tags,
            attachments: this.attachments,
            sharedMemos: this.sharedMemos,
            lastSaved: new Date().toISOString(),
            theme: this.isDarkTheme ? 'dark' : 'light'
        };
        
        localStorage.setItem('memo_app_data', JSON.stringify(data));
        
        // 如果在线且不是访客，添加到同步队列
        if (authManager && !authManager.isGuestUser() && this.currentMemo) {
            authManager.addToSyncQueue({
                type: 'UPDATE_MEMO',
                data: {
                    id: this.currentMemo.id,
                    title: this.currentMemo.title,
                    content: this.currentMemo.content,
                    updatedAt: this.currentMemo.updatedAt
                }
            });
        }
    }

    setupEventListeners() {
        // 新建备忘录
        const newMemoBtn = document.getElementById('new-memo-btn');
        if (newMemoBtn) {
            newMemoBtn.addEventListener('click', () => this.createNewMemo());
        }
        
        // 主题切换
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
        
        // 同步按钮
        const syncBtn = document.getElementById('sync-btn');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => this.manualSync());
        }
        
        // 文件夹切换
        document.querySelectorAll('.folder').forEach(folder => {
            folder.addEventListener('click', (e) => {
                const folderType = e.currentTarget.dataset.folder;
                this.switchFolder(folderType);
            });
        });
        
        // 视图切换
        const listViewBtn = document.getElementById('list-view-btn');
        if (listViewBtn) {
            listViewBtn.addEventListener('click', () => this.switchView('list'));
        }
        
        const gridViewBtn = document.getElementById('grid-view-btn');
        if (gridViewBtn) {
            gridViewBtn.addEventListener('click', () => this.switchView('grid'));
        }
        
        // 搜索
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value;
                this.renderMemos();
            });
        }
        
        // 编辑器操作
        const memoTitle = document.getElementById('memo-title');
        if (memoTitle) {
            memoTitle.addEventListener('input', () => this.startAutoSave());
        }
        
        const memoContent = document.getElementById('memo-content');
        if (memoContent) {
            memoContent.addEventListener('input', () => {
                this.updateCharCount();
                this.startAutoSave();
            });
        }
        
        // 保存按钮
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveCurrentMemo());
        }
        
        // 收藏按钮
        const favoriteBtn = document.getElementById('favorite-btn');
        if (favoriteBtn) {
            favoriteBtn.addEventListener('click', () => this.toggleFavorite());
        }
        
        // 锁定按钮
        const lockBtn = document.getElementById('lock-btn');
        if (lockBtn) {
            lockBtn.addEventListener('click', () => this.toggleLock());
        }
        
        // 提醒按钮
        const reminderBtn = document.getElementById('reminder-btn');
        if (reminderBtn) {
            reminderBtn.addEventListener('click', () => this.showReminderModal());
        }
        
        // 删除按钮
        const deleteBtn = document.getElementById('delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteCurrentMemo());
        }
        
        // 分享按钮
        const shareBtn = document.getElementById('share-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', () => this.showShareModal());
        }
        
        // 更多选项
        const moreBtn = document.getElementById('more-btn');
        if (moreBtn) {
            moreBtn.addEventListener('click', () => this.showMoreOptions());
        }
        
        // 工具栏按钮
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const command = e.currentTarget.dataset.command;
                this.execCommand(command);
            });
        });
        
        // 附件按钮
        const attachImageBtn = document.getElementById('attach-image-btn');
        if (attachImageBtn) {
            attachImageBtn.addEventListener('click', () => this.attachImage());
        }
        
        const attachFileBtn = document.getElementById('attach-file-btn');
        if (attachFileBtn) {
            attachFileBtn.addEventListener('click', () => this.attachFile());
        }
        
        // 上传相关
        const uploadArea = document.getElementById('upload-area');
        if (uploadArea) {
            uploadArea.addEventListener('click', () => document.getElementById('file-input').click());
        }
        
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        }
        
        const cancelUploadBtn = document.getElementById('cancel-upload-btn');
        if (cancelUploadBtn) {
            cancelUploadBtn.addEventListener('click', () => this.hideUploadModal());
        }
        
        // 标签选择
        const tagSelect = document.getElementById('tag-select');
        if (tagSelect) {
            tagSelect.addEventListener('change', (e) => {
                if (e.target.value && this.currentMemo) {
                    this.addTagToCurrentMemo(e.target.value);
                    e.target.value = '';
                }
            });
        }
        
        // 新建标签
        const newTagBtn = document.getElementById('new-tag-btn');
        if (newTagBtn) {
            newTagBtn.addEventListener('click', () => this.showNewTagModal());
        }
        
        const createTagBtn = document.getElementById('create-tag-btn');
        if (createTagBtn) {
            createTagBtn.addEventListener('click', () => this.createNewTag());
        }
        
        const cancelTagBtn = document.getElementById('cancel-tag-btn');
        if (cancelTagBtn) {
            cancelTagBtn.addEventListener('click', () => this.hideNewTagModal());
        }
        
        // 导出选项
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportMemo());
        }
        
        const printBtn = document.getElementById('print-btn');
        if (printBtn) {
            printBtn.addEventListener('click', () => this.printMemo());
        }
        
        const duplicateBtn = document.getElementById('duplicate-btn');
        if (duplicateBtn) {
            duplicateBtn.addEventListener('click', () => this.duplicateMemo());
        }
        
        // 回收站相关
        const trashFolder = document.querySelector('.folder[data-folder="trash"]');
        if (trashFolder) {
            trashFolder.addEventListener('click', () => this.showTrashModal());
        }
        
        const emptyTrashBtn = document.getElementById('empty-trash-btn');
        if (emptyTrashBtn) {
            emptyTrashBtn.addEventListener('click', () => this.emptyTrash());
        }
        
        const closeTrashBtn = document.getElementById('close-trash-btn');
        if (closeTrashBtn) {
            closeTrashBtn.addEventListener('click', () => this.hideTrashModal());
        }
        
        // 提醒模态框
        const saveReminderBtn = document.getElementById('save-reminder-btn');
        if (saveReminderBtn) {
            saveReminderBtn.addEventListener('click', () => this.saveReminder());
        }
        
        const cancelReminderBtn = document.getElementById('cancel-reminder-btn');
        if (cancelReminderBtn) {
            cancelReminderBtn.addEventListener('click', () => this.hideReminderModal());
        }
        
        // 分享模态框
        const confirmShareBtn = document.getElementById('confirm-share-btn');
        if (confirmShareBtn) {
            confirmShareBtn.addEventListener('click', () => this.confirmShare());
        }
        
        const cancelShareBtn = document.getElementById('cancel-share-btn');
        if (cancelShareBtn) {
            cancelShareBtn.addEventListener('click', () => this.hideShareModal());
        }
        
        const copyLinkBtn = document.getElementById('copy-link-btn');
        if (copyLinkBtn) {
            copyLinkBtn.addEventListener('click', () => this.copyShareLink());
        }
        
        // 更多选项模态框
        const closeOptionsBtn = document.getElementById('close-options-btn');
        if (closeOptionsBtn) {
            closeOptionsBtn.addEventListener('click', () => this.hideMoreOptions());
        }
        
        // 模态框背景点击关闭
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // 忽略在输入框中的快捷键
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                if (e.key === 'Escape') {
                    // ESC键可以关闭模态框
                    this.closeAllModals();
                }
                return;
            }
            
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                switch(e.key.toLowerCase()) {
                    case 'n':
                        this.createNewMemo();
                        break;
                    case 's':
                        this.saveCurrentMemo();
                        break;
                    case 'f':
                        document.getElementById('search-input')?.focus();
                        break;
                    case 'd':
                        if (this.currentMemo) this.duplicateMemo();
                        break;
                    case 'e':
                        if (this.currentMemo) this.exportMemo();
                        break;
                    case 'l':
                        this.toggleTheme();
                        break;
                    case 'p':
                        if (this.currentMemo) this.printMemo();
                        break;
                }
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.currentMemo && !this.currentMemo.isDeleted) {
                    this.deleteCurrentMemo();
                }
            }
        });
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
        });
    }

    setupShareTypeListeners() {
        // 分享类型选择监听
        const shareTypeInputs = document.querySelectorAll('input[name="share-type"]');
        shareTypeInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const value = e.target.value;
                const emailInput = document.getElementById('share-email-input');
                const linkContainer = document.getElementById('share-link-container');
                
                if (value === 'email') {
                    if (emailInput) emailInput.classList.remove('hidden');
                    if (linkContainer) linkContainer.classList.add('hidden');
                } else if (value === 'link') {
                    if (emailInput) emailInput.classList.add('hidden');
                    if (linkContainer) linkContainer.classList.remove('hidden');
                } else {
                    if (emailInput) emailInput.classList.add('hidden');
                    if (linkContainer) linkContainer.classList.add('hidden');
                }
            });
        });
        
        // 提醒类型选择监听
        const reminderInputs = document.querySelectorAll('input[name="reminder"]');
        reminderInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const value = e.target.value;
                const customTimeInput = document.getElementById('custom-reminder-time');
                
                if (value === 'custom' && customTimeInput) {
                    customTimeInput.classList.remove('hidden');
                } else if (customTimeInput) {
                    customTimeInput.classList.add('hidden');
                }
            });
        });
    }

    setupDragAndDrop() {
        const uploadArea = document.getElementById('upload-area');
        if (!uploadArea) return;
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.backgroundColor = this.isDarkTheme ? '#48484a' : '#f0f7ff';
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.backgroundColor = '';
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.backgroundColor = '';
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.showUploadModal();
                this.processFiles(files);
            }
        });
    }

    setupReminderChecker() {
        // 每分钟检查一次提醒
        this.reminderChecker = setInterval(() => {
            this.checkReminders();
        }, 60 * 1000);
        
        // 页面显示时检查一次
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.checkReminders();
            }
        });
    }

    checkReminders() {
        const now = new Date();
        let hasReminders = false;
        
        this.memos.forEach(memo => {
            if (memo.reminder && !memo.reminderNotified && !memo.isDeleted) {
                const reminderTime = new Date(memo.reminder);
                if (reminderTime <= now) {
                    this.showReminderNotification(memo);
                    memo.reminderNotified = true;
                    hasReminders = true;
                }
            }
        });
        
        if (hasReminders) {
            this.saveData();
            this.renderMemos();
        }
    }

    showReminderNotification(memo) {
        // 桌面通知
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('备忘录提醒', {
                body: memo.title || '无标题备忘录',
                icon: '/assets/icons/icon-192.png',
                tag: memo.id,
                requireInteraction: true
            });
        }
        
        // 应用内通知
        this.showNotification(`提醒：${memo.title || '无标题备忘录'}`, 'warning');
        
        // 播放提示音（可选）
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ');
            audio.volume = 0.3;
            audio.play();
        } catch (e) {
            // 忽略音频错误
        }
    }

    toggleTheme() {
        this.isDarkTheme = !this.isDarkTheme;
        localStorage.setItem('dark_theme', this.isDarkTheme);
        this.applyTheme();
        
        const themeBtn = document.getElementById('theme-toggle');
        if (themeBtn) {
            const icon = themeBtn.querySelector('i');
            const text = themeBtn.querySelector('span');
            
            if (this.isDarkTheme) {
                if (icon) icon.className = 'fas fa-sun';
                if (text) text.textContent = '明亮模式';
            } else {
                if (icon) icon.className = 'fas fa-moon';
                if (text) text.textContent = '暗黑模式';
            }
        }
        
        this.showNotification(`已切换到${this.isDarkTheme ? '暗黑' : '明亮'}模式`);
    }

    applyTheme() {
        if (this.isDarkTheme) {
            document.body.classList.add('dark-theme');
            document.body.classList.remove('light-theme');
        } else {
            document.body.classList.add('light-theme');
            document.body.classList.remove('dark-theme');
        }
    }

    manualSync() {
        if (authManager && !authManager.isGuestUser()) {
            authManager.syncData();
        } else {
            this.showNotification('访客模式不支持云同步', 'info');
        }
    }

    createNewMemo() {
        const newMemo = {
            id: `memo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: '',
            content: '',
            tags: [],
            attachments: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isFavorite: false,
            isDeleted: false,
            isLocked: false,
            password: null,
            reminder: null,
            reminderNotified: false,
            sharedWith: [],
            shareLink: null
        };
        
        this.memos.unshift(newMemo);
        this.currentMemo = newMemo;
        this.saveData();
        this.renderMemos();
        this.renderEditor();
        this.updateCounts();
        
        // 添加到同步队列
        if (authManager && !authManager.isGuestUser()) {
            authManager.addToSyncQueue({
                type: 'CREATE_MEMO',
                data: newMemo
            });
        }
        
        // 聚焦到标题输入框
        setTimeout(() => {
            const titleInput = document.getElementById('memo-title');
            if (titleInput) {
                titleInput.focus();
            }
        }, 100);
        
        this.showNotification('新建备忘录');
    }

    toggleLock() {
        if (!this.currentMemo) return;
        
        if (this.currentMemo.isLocked) {
            // 解锁
            const password = prompt('请输入密码解锁备忘录:');
            if (password === this.currentMemo.password) {
                this.currentMemo.isLocked = false;
                this.saveData();
                this.renderEditor();
                this.showNotification('备忘录已解锁');
            } else {
                this.showNotification('密码错误', 'error');
            }
        } else {
            // 加锁
            const password = prompt('设置密码（留空则取消）:');
            if (password !== null && password !== '') {
                const confirmPassword = prompt('请再次输入密码:');
                if (password === confirmPassword) {
                    this.currentMemo.isLocked = true;
                    this.currentMemo.password = password;
                    this.saveData();
                    this.renderEditor();
                    this.renderMemos();
                    this.showNotification('备忘录已锁定');
                    
                    if (authManager && !authManager.isGuestUser()) {
                        authManager.addToSyncQueue({
                            type: 'UPDATE_MEMO',
                            data: { 
                                id: this.currentMemo.id, 
                                isLocked: true,
                                updatedAt: this.currentMemo.updatedAt
                            }
                        });
                    }
                } else {
                    this.showNotification('两次密码不一致', 'error');
                }
            }
        }
    }

    showReminderModal() {
        if (!this.currentMemo) return;
        
        const modal = document.getElementById('reminder-modal');
        if (modal) {
            modal.classList.remove('hidden');
            
            // 设置当前值
            if (this.currentMemo.reminder) {
                const reminderTime = new Date(this.currentMemo.reminder);
                const customTimeInput = document.getElementById('custom-reminder-time');
                const customRadio = document.getElementById('reminder-custom');
                
                if (customTimeInput && customRadio) {
                    customTimeInput.value = reminderTime.toISOString().slice(0, 16);
                    customRadio.checked = true;
                    customTimeInput.classList.remove('hidden');
                }
            }
        }
    }

    hideReminderModal() {
        const modal = document.getElementById('reminder-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        
        const customTimeInput = document.getElementById('custom-reminder-time');
        if (customTimeInput) {
            customTimeInput.classList.add('hidden');
        }
    }

    saveReminder() {
        if (!this.currentMemo) return;
        
        const selectedReminder = document.querySelector('input[name="reminder"]:checked');
        if (!selectedReminder) return;
        
        const reminderType = selectedReminder.value;
        
        let reminderTime = null;
        switch(reminderType) {
            case 'later':
                // 1小时后
                reminderTime = new Date(Date.now() + 60 * 60 * 1000);
                break;
            case 'tomorrow':
                // 明天早上9点
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(9, 0, 0, 0);
                reminderTime = tomorrow;
                break;
            case 'custom':
                const customTimeInput = document.getElementById('custom-reminder-time');
                if (customTimeInput && customTimeInput.value) {
                    reminderTime = new Date(customTimeInput.value);
                    if (isNaN(reminderTime.getTime())) {
                        this.showNotification('无效的日期时间', 'error');
                        return;
                    }
                }
                break;
        }
        
        this.currentMemo.reminder = reminderTime ? reminderTime.toISOString() : null;
        this.currentMemo.reminderNotified = false;
        this.currentMemo.updatedAt = new Date().toISOString();
        this.saveData();
        this.renderEditor();
        this.renderMemos();
        this.updateCounts();
        
        this.hideReminderModal();
        this.showNotification(reminderTime ? '提醒已设置' : '提醒已取消');
        
        if (authManager && !authManager.isGuestUser() && reminderTime) {
            authManager.addToSyncQueue({
                type: 'UPDATE_MEMO',
                data: { 
                    id: this.currentMemo.id, 
                    reminder: this.currentMemo.reminder,
                    updatedAt: this.currentMemo.updatedAt
                }
            });
        }
    }

    showShareModal() {
        if (!this.currentMemo) return;
        
        const modal = document.getElementById('share-modal');
        if (modal) {
            modal.classList.remove('hidden');
            
            // 设置当前值
            const emailInput = document.getElementById('share-email-input');
            if (emailInput && this.currentMemo.sharedWith.length > 0) {
                emailInput.value = this.currentMemo.sharedWith[0];
            }
            
            const linkInput = document.getElementById('share-link-input');
            if (linkInput && this.currentMemo.shareLink) {
                linkInput.value = this.currentMemo.shareLink;
            }
        }
    }

    hideShareModal() {
        const modal = document.getElementById('share-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        
        const emailInput = document.getElementById('share-email-input');
        if (emailInput) {
            emailInput.classList.add('hidden');
            emailInput.value = '';
        }
        
        const linkContainer = document.getElementById('share-link-container');
        if (linkContainer) {
            linkContainer.classList.add('hidden');
        }
    }

    confirmShare() {
        if (!this.currentMemo) return;
        
        const selectedShareType = document.querySelector('input[name="share-type"]:checked');
        if (!selectedShareType) return;
        
        const shareType = selectedShareType.value;
        
        switch(shareType) {
            case 'private':
                this.currentMemo.sharedWith = [];
                this.currentMemo.shareLink = null;
                this.showNotification('备忘录设为私有');
                break;
                
            case 'link':
                // 生成分享链接
                const shareId = `share-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                this.currentMemo.shareLink = `${window.location.origin}/share/${shareId}`;
                
                // 显示分享链接
                const linkInput = document.getElementById('share-link-input');
                const linkContainer = document.getElementById('share-link-container');
                if (linkInput) linkInput.value = this.currentMemo.shareLink;
                if (linkContainer) linkContainer.classList.remove('hidden');
                
                this.showNotification('分享链接已生成');
                break;
                
            case 'email':
                const emailInput = document.getElementById('share-email-input');
                if (emailInput) {
                    const email = emailInput.value.trim();
                    if (email && this.validateEmail(email)) {
                        this.currentMemo.sharedWith = [email];
                        this.sendShareEmail(email);
                        this.showNotification(`已分享给 ${email}`);
                    } else {
                        this.showNotification('请输入有效的邮箱地址', 'error');
                        return;
                    }
                }
                break;
        }
        
        this.currentMemo.updatedAt = new Date().toISOString();
        this.saveData();
        
        if (authManager && !authManager.isGuestUser()) {
            authManager.addToSyncQueue({
                type: 'UPDATE_MEMO',
                data: { 
                    id: this.currentMemo.id, 
                    sharedWith: this.currentMemo.sharedWith,
                    shareLink: this.currentMemo.shareLink,
                    updatedAt: this.currentMemo.updatedAt
                }
            });
        }
        
        if (shareType !== 'link') {
            this.hideShareModal();
        }
    }

    copyShareLink() {
        const linkInput = document.getElementById('share-link-input');
        if (!linkInput) return;
        
        linkInput.select();
        linkInput.setSelectionRange(0, 99999); // 移动端支持
        
        try {
            document.execCommand('copy');
            this.showNotification('链接已复制到剪贴板');
        } catch (err) {
            // 使用现代API
            navigator.clipboard.writeText(linkInput.value)
                .then(() => this.showNotification('链接已复制到剪贴板'))
                .catch(() => this.showNotification('复制失败，请手动复制', 'error'));
        }
    }

    sendShareEmail(email) {
        // 模拟发送邮件
        console.log(`分享备忘录给: ${email}`);
        // 实际部署时调用邮件API
        
        if (authManager && !authManager.isGuestUser()) {
            authManager.addToSyncQueue({
                type: 'SHARE_MEMO',
                data: {
                    memoId: this.currentMemo.id,
                    email: email,
                    sharedAt: new Date().toISOString()
                }
            });
        }
    }

    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    attachImage() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = (e) => this.handleImageUpload(e);
        input.click();
    }

    attachFile() {
        this.showUploadModal();
    }

    showUploadModal() {
        const modal = document.getElementById('upload-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideUploadModal() {
        const modal = document.getElementById('upload-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        
        const progress = document.getElementById('upload-progress');
        if (progress) {
            progress.classList.add('hidden');
        }
        
        const progressFill = document.getElementById('progress-fill');
        if (progressFill) {
            progressFill.style.width = '0%';
        }
        
        const progressText = document.getElementById('progress-text');
        if (progressText) {
            progressText.textContent = '0%';
        }
        
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.value = '';
        }
    }

    handleImageUpload(event) {
        const files = event.target.files;
        if (files.length > 0) {
            this.showUploadModal();
            this.processFiles(files);
        }
    }

    handleFileUpload(event) {
        const files = event.target.files;
        if (files.length > 0) {
            this.processFiles(files);
        }
    }

    processFiles(files) {
        const totalFiles = files.length;
        if (totalFiles === 0) return;
        
        let processedFiles = 0;
        
        // 显示进度条
        const progress = document.getElementById('upload-progress');
        if (progress) {
            progress.classList.remove('hidden');
        }
        
        Array.from(files).forEach((file, index) => {
            this.uploadFile(file, (progressPercent) => {
                // 更新进度
                const overallProgress = Math.round(((processedFiles + progressPercent / 100) / totalFiles) * 100);
                const progressFill = document.getElementById('progress-fill');
                const progressText = document.getElementById('progress-text');
                
                if (progressFill) {
                    progressFill.style.width = `${overallProgress}%`;
                }
                if (progressText) {
                    progressText.textContent = `${overallProgress}%`;
                }
                
                if (progressPercent === 100) {
                    processedFiles++;
                    if (processedFiles === totalFiles) {
                        setTimeout(() => {
                            this.hideUploadModal();
                            this.showNotification(`成功上传 ${totalFiles} 个文件`);
                        }, 500);
                    }
                }
            });
        });
    }

    uploadFile(file, progressCallback) {
        // 模拟上传过程
        let progress = 0;
        const interval = setInterval(() => {
            progress += 10;
            progressCallback(progress);
            
            if (progress >= 100) {
                clearInterval(interval);
                
                // 创建附件对象
                const attachment = {
                    id: `attach-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    filename: file.name,
                    type: file.type,
                    size: file.size,
                    uploadedAt: new Date().toISOString(),
                    url: URL.createObjectURL(file) // 实际部署时应上传到服务器
                };
                
                this.attachments.push(attachment);
                
                if (this.currentMemo) {
                    if (!this.currentMemo.attachments) {
                        this.currentMemo.attachments = [];
                    }
                    this.currentMemo.attachments.push(attachment.id);
                    this.currentMemo.updatedAt = new Date().toISOString();
                    this.saveData();
                    this.renderAttachments();
                    
                    if (authManager && !authManager.isGuestUser()) {
                        authManager.addToSyncQueue({
                            type: 'UPLOAD_ATTACHMENT',
                            data: {
                                memoId: this.currentMemo.id,
                                attachment: attachment,
                                updatedAt: this.currentMemo.updatedAt
                            }
                        });
                    }
                }
                
                progressCallback(100);
            }
        }, 100);
    }

    renderAttachments() {
        if (!this.currentMemo) return;
        
        const container = document.getElementById('attachments-preview');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!this.currentMemo.attachments || this.currentMemo.attachments.length === 0) {
            return;
        }
        
        this.currentMemo.attachments.forEach(attachId => {
            const attachment = this.attachments.find(a => a.id === attachId);
            if (!attachment) return;
            
            const item = document.createElement('div');
            item.className = 'attachment-item';
            
            if (attachment.type.startsWith('image/')) {
                item.innerHTML = `
                    <img src="${attachment.url}" alt="${attachment.filename}" class="attachment-preview">
                    <button class="remove-attachment" data-id="${attachment.id}">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            } else {
                const icon = this.getFileIcon(attachment.type);
                item.innerHTML = `
                    <div class="attachment-file">
                        <i class="${icon}"></i>
                        <span class="attachment-filename">${attachment.filename}</span>
                    </div>
                    <button class="remove-attachment" data-id="${attachment.id}">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            }
            
            container.appendChild(item);
        });
        
        // 添加删除事件
        container.querySelectorAll('.remove-attachment').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const attachId = e.currentTarget.dataset.id;
                this.removeAttachment(attachId);
            });
        });
    }

    removeAttachment(attachId) {
        if (!this.currentMemo) return;
        
        // 从当前备忘录移除
        if (this.currentMemo.attachments) {
            const attachIndex = this.currentMemo.attachments.indexOf(attachId);
            if (attachIndex !== -1) {
                this.currentMemo.attachments.splice(attachIndex, 1);
            }
        }
        
        // 从附件列表移除
        const attachment = this.attachments.find(a => a.id === attachId);
        if (attachment && attachment.url.startsWith('blob:')) {
            URL.revokeObjectURL(attachment.url);
        }
        
        this.attachments = this.attachments.filter(a => a.id !== attachId);
        
        this.currentMemo.updatedAt = new Date().toISOString();
        this.saveData();
        this.renderAttachments();
        
        this.showNotification('附件已删除');
        
        if (authManager && !authManager.isGuestUser()) {
            authManager.addToSyncQueue({
                type: 'DELETE_ATTACHMENT',
                data: {
                    memoId: this.currentMemo.id,
                    attachmentId: attachId,
                    updatedAt: this.currentMemo.updatedAt
                }
            });
        }
    }

    getFileIcon(mimeType) {
        if (mimeType.includes('pdf')) return 'fas fa-file-pdf';
        if (mimeType.includes('word') || mimeType.includes('document')) return 'fas fa-file-word';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'fas fa-file-excel';
        if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'fas fa-file-powerpoint';
        if (mimeType.includes('text')) return 'fas fa-file-alt';
        if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'fas fa-file-archive';
        return 'fas fa-file';
    }

    showTrashModal() {
        const modal = document.getElementById('trash-modal');
        const trashList = document.getElementById('trash-list');
        
        if (!modal || !trashList) return;
        
        trashList.innerHTML = '';
        
        const deletedMemos = this.memos.filter(memo => memo.isDeleted);
        
        if (deletedMemos.length === 0) {
            trashList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">回收站为空</p>';
        } else {
            deletedMemos.forEach(memo => {
                const item = document.createElement('div');
                item.className = 'trash-item';
                
                const deletedDate = new Date(memo.updatedAt);
                const daysAgo = Math.floor((new Date() - deletedDate) / (1000 * 60 * 60 * 24));
                const daysText = daysAgo === 0 ? '今天' : `${daysAgo} 天前`;
                
                item.innerHTML = `
                    <div class="trash-item-info">
                        <div class="trash-item-title">${memo.title || '无标题'}</div>
                        <div class="trash-item-date">
                            删除于 ${daysText} • ${deletedDate.toLocaleDateString()}
                        </div>
                    </div>
                    <div class="trash-item-actions">
                        <button class="btn-restore" data-id="${memo.id}">
                            <i class="fas fa-undo"></i> 恢复
                        </button>
                        <button class="btn-permanently-delete" data-id="${memo.id}">
                            <i class="fas fa-trash"></i> 永久删除
                        </button>
                    </div>
                `;
                
                trashList.appendChild(item);
            });
            
            // 添加事件监听
            trashList.querySelectorAll('.btn-restore').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const memoId = e.currentTarget.dataset.id;
                    this.restoreMemo(memoId);
                });
            });
            
            trashList.querySelectorAll('.btn-permanently-delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const memoId = e.currentTarget.dataset.id;
                    if (confirm('确定要永久删除此备忘录吗？此操作无法撤销。')) {
                        this.permanentlyDeleteMemo(memoId);
                    }
                });
            });
        }
        
        modal.classList.remove('hidden');
    }

    hideTrashModal() {
        const modal = document.getElementById('trash-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    restoreMemo(memoId) {
        const memo = this.memos.find(m => m.id === memoId);
        if (memo) {
            memo.isDeleted = false;
            memo.updatedAt = new Date().toISOString();
            this.saveData();
            this.renderMemos();
            this.updateCounts();
            this.showTrashModal(); // 刷新回收站列表
            this.showNotification('备忘录已恢复');
            
            if (authManager && !authManager.isGuestUser()) {
                authManager.addToSyncQueue({
                    type: 'UPDATE_MEMO',
                    data: { 
                        id: memo.id, 
                        isDeleted: false,
                        updatedAt: memo.updatedAt
                    }
                });
            }
        }
    }

    permanentlyDeleteMemo(memoId) {
        const index = this.memos.findIndex(m => m.id === memoId);
        if (index !== -1) {
            const memo = this.memos[index];
            
            // 删除关联的附件
            if (memo.attachments) {
                memo.attachments.forEach(attachId => {
                    const attachment = this.attachments.find(a => a.id === attachId);
                    if (attachment && attachment.url.startsWith('blob:')) {
                        URL.revokeObjectURL(attachment.url);
                    }
                });
            }
            
            this.memos.splice(index, 1);
            this.saveData();
            this.showTrashModal(); // 刷新回收站列表
            this.showNotification('备忘录已永久删除');
            
            if (authManager && !authManager.isGuestUser()) {
                authManager.addToSyncQueue({
                    type: 'DELETE_MEMO',
                    data: { id: memoId }
                });
            }
        }
    }

    emptyTrash() {
        const deletedMemos = this.memos.filter(memo => memo.isDeleted);
        if (deletedMemos.length === 0) {
            this.showNotification('回收站已为空', 'info');
            return;
        }
        
        if (confirm(`确定要清空回收站吗？这将永久删除 ${deletedMemos.length} 个备忘录。`)) {
            // 收集要删除的备忘录ID
            const memoIdsToDelete = deletedMemos.map(memo => memo.id);
            
            // 删除附件
            deletedMemos.forEach(memo => {
                if (memo.attachments) {
                    memo.attachments.forEach(attachId => {
                        const attachment = this.attachments.find(a => a.id === attachId);
                        if (attachment && attachment.url.startsWith('blob:')) {
                            URL.revokeObjectURL(attachment.url);
                        }
                    });
                }
            });
            
            // 从数组中移除
            this.memos = this.memos.filter(memo => !memo.isDeleted);
            this.saveData();
            this.hideTrashModal();
            this.updateCounts();
            this.showNotification(`已清空回收站（${deletedMemos.length}个备忘录）`);
            
            if (authManager && !authManager.isGuestUser()) {
                authManager.addToSyncQueue({
                    type: 'BATCH_DELETE_MEMOS',
                    data: { memoIds: memoIdsToDelete }
                });
            }
        }
    }

    switchFolder(folderType) {
        this.currentFolder = folderType;
        
        // 更新UI
        document.querySelectorAll('.folder').forEach(f => {
            f.classList.remove('active');
        });
        const activeFolder = document.querySelector(`.folder[data-folder="${folderType}"]`);
        if (activeFolder) {
            activeFolder.classList.add('active');
        }
        
        // 更新标题
        const folderNames = {
            all: '所有备忘录',
            favorites: '收藏',
            reminders: '提醒',
            trash: '垃圾桶'
        };
        const currentFolderElement = document.getElementById('current-folder');
        if (currentFolderElement) {
            currentFolderElement.textContent = folderNames[folderType] || '所有备忘录';
        }
        
        this.renderMemos();
    }

    switchView(viewMode) {
        this.viewMode = viewMode;
        const container = document.getElementById('memos-container');
        
        if (!container) return;
        
        // 更新按钮状态
        const listViewBtn = document.getElementById('list-view-btn');
        const gridViewBtn = document.getElementById('grid-view-btn');
        
        if (listViewBtn && gridViewBtn) {
            listViewBtn.classList.toggle('active', viewMode === 'list');
            gridViewBtn.classList.toggle('active', viewMode === 'grid');
        }
        
        // 切换视图类
        container.classList.toggle('grid-view', viewMode === 'grid');
        container.classList.toggle('list-view', viewMode === 'list');
        
        this.renderMemos();
    }

    renderMemos() {
        const container = document.getElementById('memos-container');
        if (!container) return;
        
        const filteredMemos = this.getFilteredMemos();
        
        if (filteredMemos.length === 0) {
            let message = '没有备忘录';
            let subMessage = '点击"新建备忘录"按钮创建您的第一条备忘录';
            
            if (this.currentFolder === 'trash') {
                message = '回收站为空';
                subMessage = '删除的备忘录将出现在这里';
            } else if (this.searchQuery) {
                message = '没有找到相关备忘录';
                subMessage = '尝试使用不同的关键词搜索';
            } else if (this.currentFolder === 'favorites') {
                message = '没有收藏的备忘录';
                subMessage = '点击备忘录的星标图标可以收藏';
            } else if (this.currentFolder === 'reminders') {
                message = '没有设置提醒的备忘录';
                subMessage = '点击备忘录的铃铛图标可以设置提醒';
            }
            
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-sticky-note"></i>
                    <h3>${message}</h3>
                    <p>${subMessage}</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        filteredMemos.forEach(memo => {
            const preview = this.createMemoPreview(memo);
            container.appendChild(preview);
        });
    }

    getFilteredMemos() {
        let filtered = this.memos.filter(memo => {
            // 根据文件夹过滤
            if (this.currentFolder === 'favorites' && !memo.isFavorite) return false;
            if (this.currentFolder === 'trash' && !memo.isDeleted) return false;
            if (this.currentFolder === 'reminders' && (!memo.reminder || memo.isDeleted)) return false;
            if (this.currentFolder !== 'trash' && memo.isDeleted) return false;
            
            // 根据搜索查询过滤
            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                const titleMatch = memo.title.toLowerCase().includes(query);
                const contentMatch = memo.content.toLowerCase().includes(query);
                
                // 标签匹配
                const tagMatch = memo.tags.some(tagId => {
                    const tag = this.tags.find(t => t.id === tagId);
                    return tag && tag.name.toLowerCase().includes(query);
                });
                
                if (!titleMatch && !contentMatch && !tagMatch) return false;
            }
            
            return true;
        });
        
        // 按更新时间排序（最新的在前）
        filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        
        return filtered;
    }

    createMemoPreview(memo) {
        const div = document.createElement('div');
        div.className = 'memo-preview';
        if (this.currentMemo && this.currentMemo.id === memo.id) {
            div.classList.add('active');
        }
        
        if (memo.reminder) {
            div.classList.add('has-reminder');
        }
        
        if (memo.isLocked) {
            div.classList.add('locked');
        }
        
        div.dataset.id = memo.id;
        
        // 格式化日期
        const date = new Date(memo.updatedAt);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        let dateStr;
        if (diffDays === 0) {
            // 今天
            dateStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            dateStr = '昨天';
        } else if (diffDays < 7) {
            // 一周内
            const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            dateStr = days[date.getDay()];
        } else {
            // 更早
            dateStr = date.toLocaleDateString();
        }
        
        // 获取标签
        const tagBadges = memo.tags.map(tagId => {
            const tag = this.tags.find(t => t.id === tagId);
            return tag ? `<span class="tag-badge" style="background-color:${tag.color}20;color:${tag.color}">${tag.name}</span>` : '';
        }).join('');
        
        // 提醒徽章
        let reminderBadge = '';
        if (memo.reminder) {
            const reminderDate = new Date(memo.reminder);
            if (reminderDate > now) {
                reminderBadge = `<span class="reminder-badge"><i class="fas fa-bell"></i> ${this.formatReminderTime(reminderDate)}</span>`;
            } else if (!memo.reminderNotified) {
                reminderBadge = `<span class="reminder-badge" style="background-color:#ff3b3020;color:#ff3b30"><i class="fas fa-bell"></i> 已过期</span>`;
            }
        }
        
        // 锁定图标
        const lockIcon = memo.isLocked ? '<i class="fas fa-lock" style="color:#666; margin-right:4px;"></i>' : '';
        
        // 收藏图标
        const favoriteIcon = memo.isFavorite ? '<i class="fas fa-star" style="color:#ff9500; margin-right:4px;"></i>' : '';
        
        // 附件图标
        const attachmentIcon = memo.attachments && memo.attachments.length > 0 ? 
            `<i class="fas fa-paperclip" style="color:#666; margin-right:4px;"></i>` : '';
        
        div.innerHTML = `
            <div class="memo-preview-title">${lockIcon}${favoriteIcon}${attachmentIcon}${memo.title || '无标题'}</div>
            <div class="memo-preview-content">${this.stripHtml(memo.content).substring(0, 100)}${this.stripHtml(memo.content).length > 100 ? '...' : ''}</div>
            <div class="memo-preview-meta">
                <div class="memo-preview-tags">${reminderBadge}${tagBadges}</div>
                <div class="memo-preview-date">${dateStr}</div>
            </div>
        `;
        
        div.addEventListener('click', () => this.selectMemo(memo.id));
        
        return div;
    }

    stripHtml(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || "";
    }

    formatReminderTime(date) {
        const now = new Date();
        const diffMs = date - now;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        
        if (diffHours < 1) {
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            return diffMinutes <= 0 ? '现在' : `${diffMinutes}分钟后`;
        } else if (diffHours < 24) {
            return `${diffHours}小时后`;
        } else {
            const diffDays = Math.floor(diffHours / 24);
            return `${diffDays}天后`;
        }
    }

    selectMemo(memoId) {
        const memo = this.memos.find(m => m.id === memoId);
        if (!memo) return;
        
        this.currentMemo = memo;
        this.renderEditor();
        this.renderMemos(); // 更新选中状态
        
        // 在移动端隐藏列表
        if (window.innerWidth <= 768) {
            const memosList = document.querySelector('.memos-list');
            if (memosList) {
                memosList.classList.add('memo-list-hidden');
            }
        }
    }

    renderEditor() {
        if (!this.currentMemo) {
            // 清空编辑器
            const memoTitle = document.getElementById('memo-title');
            const memoContent = document.getElementById('memo-content');
            const favoriteBtn = document.getElementById('favorite-btn');
            const lockBtn = document.getElementById('lock-btn');
            const reminderBtn = document.getElementById('reminder-btn');
            const charCount = document.getElementById('char-count');
            const lastSaved = document.getElementById('last-saved');
            const attachmentsPreview = document.getElementById('attachments-preview');
            
            if (memoTitle) memoTitle.value = '';
            if (memoContent) memoContent.innerHTML = '';
            if (favoriteBtn) favoriteBtn.innerHTML = '<i class="far fa-star"></i>';
            if (lockBtn) lockBtn.innerHTML = '<i class="far fa-lock"></i>';
            if (reminderBtn) reminderBtn.innerHTML = '<i class="far fa-bell"></i>';
            if (charCount) charCount.textContent = '0 字符';
            if (lastSaved) lastSaved.textContent = '从未保存';
            if (attachmentsPreview) attachmentsPreview.innerHTML = '';
            return;
        }
        
        // 填充编辑器
        const memoTitle = document.getElementById('memo-title');
        const memoContent = document.getElementById('memo-content');
        
        if (memoTitle) memoTitle.value = this.currentMemo.title;
        if (memoContent) memoContent.innerHTML = this.currentMemo.content;
        
        // 更新按钮状态
        const favoriteIcon = this.currentMemo.isFavorite ? 'fas fa-star' : 'far fa-star';
        const lockIcon = this.currentMemo.isLocked ? 'fas fa-lock' : 'far fa-lock';
        const reminderIcon = this.currentMemo.reminder ? 'fas fa-bell' : 'far fa-bell';
        
        const favoriteBtn = document.getElementById('favorite-btn');
        const lockBtn = document.getElementById('lock-btn');
        const reminderBtn = document.getElementById('reminder-btn');
        
        if (favoriteBtn) favoriteBtn.innerHTML = `<i class="${favoriteIcon}"></i>`;
        if (lockBtn) lockBtn.innerHTML = `<i class="${lockIcon}"></i>`;
        if (reminderBtn) reminderBtn.innerHTML = `<i class="${reminderIcon}"></i>`;
        
        // 更新字符计数
        this.updateCharCount();
        
        // 更新最后保存时间
        if (this.currentMemo.updatedAt) {
            const date = new Date(this.currentMemo.updatedAt);
            const now = new Date();
            const diffMinutes = Math.floor((now - date) / (1000 * 60));
            
            const lastSaved = document.getElementById('last-saved');
            if (lastSaved) {
                if (diffMinutes < 1) {
                    lastSaved.textContent = '刚刚';
                } else if (diffMinutes < 60) {
                    lastSaved.textContent = `${diffMinutes}分钟前`;
                } else if (diffMinutes < 1440) {
                    lastSaved.textContent = `${Math.floor(diffMinutes / 60)}小时前`;
                } else {
                    lastSaved.textContent = date.toLocaleDateString();
                }
            }
        }
        
        // 渲染附件
        this.renderAttachments();
        
        // 更新标签选择器
        this.updateTagSelector();
        
        // 如果是锁定的备忘录，显示锁定覆盖层
        if (this.currentMemo.isLocked) {
            this.showLockedOverlay();
        } else {
            this.hideLockedOverlay();
        }
    }

    showLockedOverlay() {
        const editorContent = document.getElementById('memo-content');
        if (!editorContent || editorContent.querySelector('.locked-overlay')) return;
        
        const overlay = document.createElement('div');
        overlay.className = 'locked-overlay';
        overlay.innerHTML = `
            <i class="fas fa-lock"></i>
            <p>此备忘录已锁定</p>
            <input type="password" id="unlock-input" placeholder="输入密码解锁">
            <button id="unlock-btn" class="btn-primary">解锁</button>
        `;
        
        editorContent.appendChild(overlay);
        
        const unlockBtn = document.getElementById('unlock-btn');
        if (unlockBtn) {
            unlockBtn.addEventListener('click', () => {
                const passwordInput = document.getElementById('unlock-input');
                if (!passwordInput) return;
                
                const password = passwordInput.value;
                if (password === this.currentMemo.password) {
                    this.currentMemo.isLocked = false;
                    this.saveData();
                    this.renderEditor();
                    this.renderMemos();
                    this.showNotification('备忘录已解锁');
                    
                    if (authManager && !authManager.isGuestUser()) {
                        authManager.addToSyncQueue({
                            type: 'UPDATE_MEMO',
                            data: { 
                                id: this.currentMemo.id, 
                                isLocked: false,
                                updatedAt: this.currentMemo.updatedAt
                            }
                        });
                    }
                } else {
                    this.showNotification('密码错误', 'error');
                }
            });
        }
        
        // 按Enter键解锁
        const unlockInput = document.getElementById('unlock-input');
        if (unlockInput) {
            unlockInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    unlockBtn.click();
                }
            });
        }
    }

    hideLockedOverlay() {
        const editorContent = document.getElementById('memo-content');
        if (!editorContent) return;
        
        const overlay = editorContent.querySelector('.locked-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    updateCharCount() {
        const memoContent = document.getElementById('memo-content');
        const charCount = document.getElementById('char-count');
        
        if (!memoContent || !charCount) return;
        
        const content = memoContent.textContent || '';
        const charCountValue = content.length;
        charCount.textContent = `${charCountValue} 字符`;
    }

    startAutoSave() {
        // 清除现有的定时器
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        
        // 设置新的定时器（3秒后自动保存）
        this.autoSaveTimer = setTimeout(() => {
            this.saveCurrentMemo();
        }, 3000);
    }

    saveCurrentMemo() {
        if (!this.currentMemo) return;
        
        // 获取编辑器内容
        const memoTitle = document.getElementById('memo-title');
        const memoContent = document.getElementById('memo-content');
        
        if (!memoTitle || !memoContent) return;
        
        const title = memoTitle.value;
        const content = memoContent.innerHTML;
        
        // 检查是否有变化
        if (title === this.currentMemo.title && content === this.currentMemo.content) {
            return; // 没有变化，不保存
        }
        
        // 更新备忘录
        this.currentMemo.title = title;
        this.currentMemo.content = content;
        this.currentMemo.updatedAt = new Date().toISOString();
        
        // 保存到存储
        this.saveData();
        
        // 更新界面
        this.renderMemos();
        this.updateCounts();
        
        // 显示保存状态
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
            const originalHTML = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="fas fa-check"></i> 已保存';
            saveBtn.style.backgroundColor = '#34c759';
            
            setTimeout(() => {
                saveBtn.innerHTML = originalHTML;
                saveBtn.style.backgroundColor = '';
            }, 2000);
        }
        
        this.showNotification('已保存');
    }

    toggleFavorite() {
        if (!this.currentMemo) return;
        
        this.currentMemo.isFavorite = !this.currentMemo.isFavorite;
        this.currentMemo.updatedAt = new Date().toISOString();
        this.saveData();
        this.renderEditor();
        this.renderMemos();
        this.updateCounts();
        
        const message = this.currentMemo.isFavorite ? '已添加到收藏' : '已从收藏中移除';
        this.showNotification(message);
        
        if (authManager && !authManager.isGuestUser()) {
            authManager.addToSyncQueue({
                type: 'UPDATE_MEMO',
                data: { 
                    id: this.currentMemo.id, 
                    isFavorite: this.currentMemo.isFavorite,
                    updatedAt: this.currentMemo.updatedAt
                }
            });
        }
    }

    deleteCurrentMemo() {
        if (!this.currentMemo) return;
        
        if (this.currentMemo.isDeleted) {
            // 永久删除
            if (confirm('确定要永久删除此备忘录吗？此操作无法撤销。')) {
                const index = this.memos.findIndex(m => m.id === this.currentMemo.id);
                if (index !== -1) {
                    // 删除关联的附件
                    if (this.currentMemo.attachments) {
                        this.currentMemo.attachments.forEach(attachId => {
                            const attachment = this.attachments.find(a => a.id === attachId);
                            if (attachment && attachment.url.startsWith('blob:')) {
                                URL.revokeObjectURL(attachment.url);
                            }
                        });
                    }
                    
                    this.memos.splice(index, 1);
                    this.currentMemo = null;
                    this.saveData();
                    this.renderMemos();
                    this.renderEditor();
                    this.updateCounts();
                    this.showNotification('备忘录已永久删除');
                    
                    if (authManager && !authManager.isGuestUser()) {
                        authManager.addToSyncQueue({
                            type: 'DELETE_MEMO',
                            data: { id: this.currentMemo?.id }
                        });
                    }
                }
            }
        } else {
            // 移到垃圾桶
            if (confirm('确定要删除此备忘录吗？')) {
                this.currentMemo.isDeleted = true;
                this.currentMemo.updatedAt = new Date().toISOString();
                this.saveData();
                
                // 如果当前在垃圾桶，刷新列表
                if (this.currentFolder === 'trash') {
                    this.renderMemos();
                } else {
                    // 否则切换到垃圾桶
                    this.switchFolder('trash');
                }
                
                const deletedMemo = this.currentMemo;
                this.currentMemo = null;
                this.renderEditor();
                this.updateCounts();
                this.showNotification('备忘录已移到垃圾桶');
                
                if (authManager && !authManager.isGuestUser()) {
                    authManager.addToSyncQueue({
                        type: 'UPDATE_MEMO',
                        data: { 
                            id: deletedMemo.id, 
                            isDeleted: true,
                            updatedAt: deletedMemo.updatedAt
                        }
                    });
                }
            }
        }
    }

    showMoreOptions() {
        const modal = document.getElementById('more-options-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideMoreOptions() {
        const modal = document.getElementById('more-options-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    execCommand(command) {
        document.execCommand(command, false, null);
        const memoContent = document.getElementById('memo-content');
        if (memoContent) {
            memoContent.focus();
        }
    }

    showNewTagModal() {
        const modal = document.getElementById('new-tag-modal');
        const newTagInput = document.getElementById('new-tag-input');
        
        if (modal) modal.classList.remove('hidden');
        if (newTagInput) {
            newTagInput.value = '';
            newTagInput.focus();
        }
    }

    hideNewTagModal() {
        const modal = document.getElementById('new-tag-modal');
        const newTagInput = document.getElementById('new-tag-input');
        
        if (modal) modal.classList.add('hidden');
        if (newTagInput) newTagInput.value = '';
    }

    createNewTag() {
        const newTagInput = document.getElementById('new-tag-input');
        if (!newTagInput) return;
        
        const name = newTagInput.value.trim();
        if (!name) {
            this.showNotification('请输入标签名称', 'error');
            return;
        }

        // 检查是否已存在
        if (this.tags.some(tag => tag.name.toLowerCase() === name.toLowerCase())) {
            this.showNotification('标签已存在', 'error');
            return;
        }

        // 预定义颜色
        const colors = [
            '#007aff', '#34c759', '#ff9500', '#ff3b30',
            '#af52de', '#5856d6', '#ff2d55', '#a2845e',
            '#32d74b', '#64d2ff', '#0a84ff', '#5e5ce6'
        ];
        
        const newTag = {
            id: `tag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            color: colors[this.tags.length % colors.length]
        };
        
        this.tags.push(newTag);
        this.saveData();
        this.renderTags();
        this.hideNewTagModal();
        
        this.showNotification('标签已创建');
        
        if (authManager && !authManager.isGuestUser()) {
            authManager.addToSyncQueue({
                type: 'CREATE_TAG',
                data: newTag
            });
        }
    }

    renderTags() {
        const container = document.getElementById('tags-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.tags.forEach(tag => {
            const tagEl = document.createElement('div');
            tagEl.className = 'tag';
            tagEl.innerHTML = `
                <i class="fas fa-tag" style="color:${tag.color}"></i>
                <span>${tag.name}</span>
                <span class="count">${this.getTagCount(tag.id)}</span>
            `;
            
            tagEl.addEventListener('click', () => this.filterByTag(tag.id));
            container.appendChild(tagEl);
        });
        
        this.updateTagSelector();
    }

    updateTagSelector() {
        const select = document.getElementById('tag-select');
        if (!select) return;
        
        // 保存当前值
        const currentValue = select.value;
        
        // 清除所有选项（除了第一个）
        select.innerHTML = '<option value="">添加标签...</option>';
        
        // 添加标签选项
        this.tags.forEach(tag => {
            // 检查当前备忘录是否已有此标签
            const hasTag = this.currentMemo && this.currentMemo.tags && this.currentMemo.tags.includes(tag.id);
            if (!hasTag) {
                const option = document.createElement('option');
                option.value = tag.id;
                option.textContent = tag.name;
                option.style.color = tag.color;
                select.appendChild(option);
            }
        });
        
        // 恢复之前的值（如果仍然有效）
        if (currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
            select.value = currentValue;
        }
    }

    getTagCount(tagId) {
        return this.memos.filter(memo => 
            !memo.isDeleted && memo.tags && memo.tags.includes(tagId)
        ).length;
    }

    filterByTag(tagId) {
        const tag = this.tags.find(t => t.id === tagId);
        if (tag) {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = `#${tag.name}`;
            }
            this.searchQuery = tag.name;
            this.renderMemos();
        }
    }

    addTagToCurrentMemo(tagId) {
        if (!this.currentMemo) return;
        
        if (!this.currentMemo.tags) {
            this.currentMemo.tags = [];
        }
        
        if (this.currentMemo.tags.includes(tagId)) {
            this.showNotification('此标签已添加', 'info');
            return;
        }
        
        this.currentMemo.tags.push(tagId);
        this.currentMemo.updatedAt = new Date().toISOString();
        this.saveData();
        this.renderEditor();
        this.renderMemos();
        this.renderTags();
        
        this.showNotification('标签已添加');
        
        if (authManager && !authManager.isGuestUser()) {
            authManager.addToSyncQueue({
                type: 'UPDATE_MEMO',
                data: { 
                    id: this.currentMemo.id, 
                    tags: this.currentMemo.tags,
                    updatedAt: this.currentMemo.updatedAt
                }
            });
        }
    }

    updateCounts() {
        const allCount = this.memos.filter(m => !m.isDeleted).length;
        const favoritesCount = this.memos.filter(m => m.isFavorite && !m.isDeleted).length;
        const remindersCount = this.memos.filter(m => m.reminder && !m.isDeleted).length;
        const trashCount = this.memos.filter(m => m.isDeleted).length;
        
        const allCountElement = document.getElementById('all-count');
        const favoritesCountElement = document.getElementById('favorites-count');
        const remindersCountElement = document.getElementById('reminders-count');
        const trashCountElement = document.getElementById('trash-count');
        
        if (allCountElement) allCountElement.textContent = allCount;
        if (favoritesCountElement) favoritesCountElement.textContent = favoritesCount;
        if (remindersCountElement) remindersCountElement.textContent = remindersCount;
        if (trashCountElement) trashCountElement.textContent = trashCount;
    }

    exportMemo() {
        if (!this.currentMemo) return;
        
        const content = `${this.currentMemo.title}\n\n${this.stripHtml(this.currentMemo.content)}`;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = this.currentMemo.title ? 
            `${this.currentMemo.title.replace(/[^\w\s]/gi, '')}.txt` : '备忘录.txt';
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.hideMoreOptions();
        this.showNotification('备忘录已导出');
    }

    printMemo() {
        if (!this.currentMemo) return;
        
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            this.showNotification('无法打开打印窗口，请检查浏览器设置', 'error');
            return;
        }
        
        printWindow.document.write(`
            <html>
                <head>
                    <title>${this.currentMemo.title || '备忘录'}</title>
                    <style>
                        body { 
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                            line-height: 1.6; 
                            padding: 40px; 
                            max-width: 800px; 
                            margin: 0 auto; 
                            color: #333;
                        }
                        h1 { 
                            color: #1d1d1f; 
                            border-bottom: 2px solid #f5f5f7; 
                            padding-bottom: 20px; 
                            margin-bottom: 30px;
                            font-size: 28px;
                        }
                        .content { 
                            white-space: pre-wrap; 
                            margin-top: 20px;
                            font-size: 16px;
                        }
                        .meta { 
                            color: #666; 
                            font-size: 14px; 
                            margin-top: 40px; 
                            border-top: 1px solid #eee; 
                            padding-top: 20px; 
                            text-align: center;
                        }
                        @media print {
                            body { padding: 20px; }
                        }
                    </style>
                </head>
                <body>
                    <h1>${this.currentMemo.title || '无标题备忘录'}</h1>
                    <div class="content">${this.stripHtml(this.currentMemo.content)}</div>
                    <div class="meta">
                        打印时间: ${new Date().toLocaleString()} | 
                        来自: 我的备忘录应用
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();
        
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);
        
        this.hideMoreOptions();
        this.showNotification('正在打印...');
    }

    duplicateMemo() {
        if (!this.currentMemo) return;
        
        const duplicatedMemo = {
            ...this.currentMemo,
            id: `memo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: `${this.currentMemo.title} (副本)`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        // 移除分享信息
        duplicatedMemo.sharedWith = [];
        duplicatedMemo.shareLink = null;
        
        this.memos.unshift(duplicatedMemo);
        this.currentMemo = duplicatedMemo;
        this.saveData();
        this.renderMemos();
        this.renderEditor();
        this.updateCounts();
        
        this.hideMoreOptions();
        this.showNotification('备忘录已复制');
        
        if (authManager && !authManager.isGuestUser()) {
            authManager.addToSyncQueue({
                type: 'CREATE_MEMO',
                data: duplicatedMemo
            });
        }
    }

    createSampleData() {
        if (this.memos.length > 0 || this.tags.length > 0) return;
        
        // 创建示例标签
        const sampleTags = [
            { id: 'tag1', name: '工作', color: '#007aff' },
            { id: 'tag2', name: '个人', color: '#34c759' },
            { id: 'tag3', name: '想法', color: '#ff9500' },
            { id: 'tag4', name: '购物', color: '#ff3b30' },
            { id: 'tag5', name: '旅行', color: '#af52de' }
        ];
        
        this.tags = sampleTags;
        
        // 创建示例备忘录
        const sampleMemos = [
            {
                id: 'memo1',
                title: '欢迎使用备忘录',
                content: '这是一个示例备忘录。\n\n您可以：\n• 创建新的备忘录\n• 编辑现有备忘录\n• 添加标签进行分类\n• 收藏重要备忘录\n• 设置提醒\n• 添加附件\n• 分享备忘录\n• 使用暗黑模式\n\n试试看吧！',
                tags: ['tag1', 'tag2'],
                attachments: [],
                createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
                updatedAt: new Date().toISOString(),
                isFavorite: true,
                isDeleted: false,
                isLocked: false,
                password: null,
                reminder: new Date(Date.now() + 86400000).toISOString(), // 明天
                reminderNotified: false,
                sharedWith: [],
                shareLink: null
            },
            {
                id: 'memo2',
                title: '购物清单',
                content: '本周需要购买：\n\n1. 牛奶\n2. 鸡蛋\n3. 面包\n4. 水果\n5. 蔬菜\n\n记得带上购物袋！',
                tags: ['tag4'],
                attachments: [],
                createdAt: new Date(Date.now() - 86400000).toISOString(),
                updatedAt: new Date().toISOString(),
                isFavorite: false,
                isDeleted: false,
                isLocked: false,
                reminder: null,
                sharedWith: [],
                shareLink: null
            },
            {
                id: 'memo3',
                title: '项目想法',
                content: '新应用想法：\n- 任务管理工具\n- 习惯追踪器\n- 阅读列表\n- 旅行计划器\n\n需要考虑的功能：\n1. 跨平台同步\n2. 离线支持\n3. 数据导出',
                tags: ['tag1', 'tag3'],
                attachments: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isFavorite: true,
                isDeleted: false,
                isLocked: true,
                password: '123456',
                reminder: null,
                sharedWith: [],
                shareLink: null
            },
            {
                id: 'memo4',
                title: '旅行计划',
                content: '东京旅行计划：\n\n• 第一天：抵达东京，入住酒店\n• 第二天：参观东京塔、浅草寺\n• 第三天：迪士尼乐园\n• 第四天：购物（银座、涩谷）\n• 第五天：返程',
                tags: ['tag5'],
                attachments: [],
                createdAt: new Date(Date.now() - 172800000).toISOString(),
                updatedAt: new Date(Date.now() - 86400000).toISOString(),
                isFavorite: false,
                isDeleted: true,
                isLocked: false,
                reminder: null,
                sharedWith: [],
                shareLink: null
            }
        ];
        
        this.memos = sampleMemos;
        this.saveData();
        
        // 重新渲染
        this.renderMemos();
        this.renderTags();
        this.updateCounts();
        
        this.showNotification('已创建示例数据', 'info');
    }

    showNotification(message, type = 'info') {
        if (typeof authManager !== 'undefined' && authManager.showNotification) {
            authManager.showNotification(message, type);
        } else {
            // 备用通知
            const notification = document.getElementById('notification');
            const text = document.getElementById('notification-text');
            
            if (notification && text) {
                text.textContent = message;
                notification.className = 'notification';
                
                if (type === 'error') {
                    notification.style.backgroundColor = '#ff3b30';
                } else if (type === 'success') {
                    notification.style.backgroundColor = '#34c759';
                } else if (type === 'warning') {
                    notification.style.backgroundColor = '#ff9500';
                } else {
                    notification.style.backgroundColor = '#007aff';
                }
                
                notification.classList.add('show');
                
                setTimeout(() => {
                    notification.classList.remove('show');
                }, 3000);
            }
        }
    }
}

// 初始化应用
let memoApp;
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('app-screen')) {
        memoApp = new MemoApp();
    }
});

// 导出用于调试
if (typeof window !== 'undefined') {
    window.MemoApp = MemoApp;
}