// 主备忘录应用
class MemoApp {
    constructor() {
        this.memos = [];
        this.tags = [];
        this.currentMemo = null;
        this.currentFolder = 'all';
        this.viewMode = 'list';
        this.searchQuery = '';
        this.autoSaveTimer = null;
        this.init();
    }

    init() {
        this.loadData();
        this.setupEventListeners();
        this.renderMemos();
        this.renderTags();
        this.updateCounts();
        
        // 创建示例数据（首次使用）
        if (this.memos.length === 0 && this.tags.length === 0) {
            this.createSampleData();
        }
    }

    loadData() {
        // 加载保存的数据
        const savedData = localStorage.getItem('memo_app_data');
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                this.memos = data.memos || [];
                this.tags = data.tags || [];
            } catch (e) {
                console.error('解析保存数据失败:', e);
                this.memos = [];
                this.tags = [];
            }
        }
    }

    saveData() {
        const data = {
            memos: this.memos,
            tags: this.tags,
            lastSaved: new Date().toISOString()
        };
        localStorage.setItem('memo_app_data', JSON.stringify(data));
    }

    createSampleData() {
        // 创建示例标签
        const sampleTags = [
            { id: 'tag1', name: '工作', color: '#007aff' },
            { id: 'tag2', name: '个人', color: '#34c759' },
            { id: 'tag3', name: '想法', color: '#ff9500' },
            { id: 'tag4', name: '购物', color: '#ff3b30' }
        ];
        
        this.tags = sampleTags;
        
        // 创建示例备忘录
        const sampleMemos = [
            {
                id: 'memo1',
                title: '欢迎使用备忘录',
                content: '这是一个示例备忘录。\n\n您可以：\n• 创建新的备忘录\n• 编辑现有备忘录\n• 添加标签进行分类\n• 收藏重要备忘录\n• 搜索您的备忘录\n\n试试看吧！',
                tags: ['tag1', 'tag2'],
                createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
                updatedAt: new Date().toISOString(),
                isFavorite: true,
                isDeleted: false
            },
            {
                id: 'memo2',
                title: '购物清单',
                content: '本周需要购买：\n\n1. 牛奶\n2. 鸡蛋\n3. 面包\n4. 水果\n5. 蔬菜\n\n记得带上购物袋！',
                tags: ['tag4'],
                createdAt: new Date(Date.now() - 86400000).toISOString(),
                updatedAt: new Date().toISOString(),
                isFavorite: false,
                isDeleted: false
            },
            {
                id: 'memo3',
                title: '项目想法',
                content: '新应用想法：\n- 任务管理工具\n- 习惯追踪器\n- 阅读列表\n- 旅行计划器\n\n需要考虑的功能：\n1. 跨平台同步\n2. 离线支持\n3. 数据导出',
                tags: ['tag1', 'tag3'],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isFavorite: true,
                isDeleted: false
            }
        ];
        
        this.memos = sampleMemos;
        this.saveData();
    }

    setupEventListeners() {
        // 新建备忘录
        document.getElementById('new-memo-btn').addEventListener('click', () => this.createNewMemo());
        
        // 文件夹切换
        document.querySelectorAll('.folder').forEach(folder => {
            folder.addEventListener('click', (e) => {
                const folderType = e.currentTarget.dataset.folder;
                this.switchFolder(folderType);
            });
        });
        
        // 视图切换
        document.getElementById('list-view-btn').addEventListener('click', () => this.switchView('list'));
        document.getElementById('grid-view-btn').addEventListener('click', () => this.switchView('grid'));
        
        // 搜索
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.renderMemos();
        });
        
        // 编辑器操作
        document.getElementById('memo-title').addEventListener('input', () => this.startAutoSave());
        document.getElementById('memo-content').addEventListener('input', () => {
            this.updateCharCount();
            this.startAutoSave();
        });
        
        // 保存按钮
        document.getElementById('save-btn').addEventListener('click', () => this.saveCurrentMemo());
        
        // 收藏按钮
        document.getElementById('favorite-btn').addEventListener('click', () => this.toggleFavorite());
        
        // 删除按钮
        document.getElementById('delete-btn').addEventListener('click', () => this.deleteCurrentMemo());
        
        // 更多选项
        document.getElementById('more-btn').addEventListener('click', () => this.showMoreOptions());
        document.getElementById('close-options-btn').addEventListener('click', () => this.hideMoreOptions());
        
        // 工具栏按钮
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const command = e.currentTarget.dataset.command;
                this.execCommand(command);
            });
        });
        
        // 标签选择
        document.getElementById('tag-select').addEventListener('change', (e) => {
            if (e.target.value && this.currentMemo) {
                this.addTagToCurrentMemo(e.target.value);
                e.target.value = '';
            }
        });
        
        // 新建标签
        document.getElementById('new-tag-btn').addEventListener('click', () => this.showNewTagModal());
        document.getElementById('create-tag-btn').addEventListener('click', () => this.createNewTag());
        document.getElementById('cancel-tag-btn').addEventListener('click', () => this.hideNewTagModal());
        
        // 导出选项
        document.getElementById('export-btn').addEventListener('click', () => this.exportMemo());
        document.getElementById('print-btn').addEventListener('click', () => this.printMemo());
        document.getElementById('duplicate-btn').addEventListener('click', () => this.duplicateMemo());
        
        // 模态框背景点击关闭
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        });
    }

    createNewMemo() {
        const newMemo = {
            id: `memo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: '',
            content: '',
            tags: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isFavorite: false,
            isDeleted: false
        };
        
        this.memos.unshift(newMemo);
        this.currentMemo = newMemo;
        this.saveData();
        this.renderMemos();
        this.renderEditor();
        this.updateCounts();
        
        // 聚焦到标题输入框
        setTimeout(() => {
            document.getElementById('memo-title').focus();
        }, 100);
    }

    switchFolder(folderType) {
        this.currentFolder = folderType;
        
        // 更新UI
        document.querySelectorAll('.folder').forEach(f => {
            f.classList.remove('active');
        });
        document.querySelector(`.folder[data-folder="${folderType}"]`).classList.add('active');
        
        // 更新标题
        const folderNames = {
            all: '所有备忘录',
            favorites: '收藏',
            trash: '垃圾桶'
        };
        document.getElementById('current-folder').textContent = folderNames[folderType];
        
        this.renderMemos();
    }

    switchView(viewMode) {
        this.viewMode = viewMode;
        const container = document.getElementById('memos-container');
        
        // 更新按钮状态
        document.getElementById('list-view-btn').classList.toggle('active', viewMode === 'list');
        document.getElementById('grid-view-btn').classList.toggle('active', viewMode === 'grid');
        
        // 切换视图类
        container.classList.toggle('grid-view', viewMode === 'grid');
        container.classList.toggle('list-view', viewMode === 'list');
        
        this.renderMemos();
    }

    renderMemos() {
        const container = document.getElementById('memos-container');
        const filteredMemos = this.getFilteredMemos();
        
        if (filteredMemos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-sticky-note"></i>
                    <h3>没有备忘录</h3>
                    <p>点击"新建备忘录"按钮创建您的第一条备忘录</p>
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
            if (this.currentFolder !== 'trash' && memo.isDeleted) return false;
            
            // 根据搜索查询过滤
            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                const titleMatch = memo.title.toLowerCase().includes(query);
                const contentMatch = memo.content.toLowerCase().includes(query);
                if (!titleMatch && !contentMatch) return false;
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
        
        div.innerHTML = `
            <div class="memo-preview-title">${memo.title || '无标题'}</div>
            <div class="memo-preview-content">${memo.content.replace(/\n/g, ' ').substring(0, 100)}${memo.content.length > 100 ? '...' : ''}</div>
            <div class="memo-preview-meta">
                <div class="memo-preview-tags">${tagBadges}</div>
                <div class="memo-preview-date">${dateStr}</div>
            </div>
        `;
        
        div.addEventListener('click', () => this.selectMemo(memo.id));
        
        return div;
    }

    selectMemo(memoId) {
        const memo = this.memos.find(m => m.id === memoId);
        if (!memo) return;
        
        this.currentMemo = memo;
        this.renderEditor();
        this.renderMemos(); // 更新选中状态
        
        // 在移动端隐藏列表
        if (window.innerWidth <= 768) {
            document.querySelector('.memos-list').classList.add('memo-list-hidden');
        }
    }

    renderEditor() {
        if (!this.currentMemo) {
            // 清空编辑器
            document.getElementById('memo-title').value = '';
            document.getElementById('memo-content').innerHTML = '';
            document.getElementById('favorite-btn').innerHTML = '<i class="far fa-star"></i>';
            document.getElementById('char-count').textContent = '0 字符';
            document.getElementById('last-saved').textContent = '从未保存';
            return;
        }
        
        // 填充编辑器
        document.getElementById('memo-title').value = this.currentMemo.title;
        document.getElementById('memo-content').innerHTML = this.currentMemo.content;
        
        // 更新收藏按钮
        const favoriteIcon = this.currentMemo.isFavorite ? 'fas fa-star' : 'far fa-star';
        document.getElementById('favorite-btn').innerHTML = `<i class="${favoriteIcon}"></i>`;
        
        // 更新字符计数
        this.updateCharCount();
        
        // 更新最后保存时间
        if (this.currentMemo.updatedAt) {
            const date = new Date(this.currentMemo.updatedAt);
            const now = new Date();
            const diffMinutes = Math.floor((now - date) / (1000 * 60));
            
            if (diffMinutes < 1) {
                document.getElementById('last-saved').textContent = '刚刚';
            } else if (diffMinutes < 60) {
                document.getElementById('last-saved').textContent = `${diffMinutes}分钟前`;
            } else if (diffMinutes < 1440) {
                document.getElementById('last-saved').textContent = `${Math.floor(diffMinutes / 60)}小时前`;
            } else {
                document.getElementById('last-saved').textContent = date.toLocaleDateString();
            }
        }
        
        // 更新标签选择器
        this.updateTagSelector();
    }

    updateCharCount() {
        const content = document.getElementById('memo-content').textContent;
        const charCount = content.length;
        document.getElementById('char-count').textContent = `${charCount} 字符`;
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
        const title = document.getElementById('memo-title').value;
        const content = document.getElementById('memo-content').innerHTML;
        
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
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-check"></i> 已保存';
        saveBtn.style.backgroundColor = '#34c759';
        
        setTimeout(() => {
            saveBtn.innerHTML = originalText;
            saveBtn.style.backgroundColor = '';
        }, 2000);
    }

    toggleFavorite() {
        if (!this.currentMemo) return;
        
        this.currentMemo.isFavorite = !this.currentMemo.isFavorite;
        this.saveData();
        this.renderEditor();
        this.renderMemos();
        this.updateCounts();
        
        // 显示通知
        const message = this.currentMemo.isFavorite ? '已添加到收藏' : '已从收藏中移除';
        this.showNotification(message);
    }

    deleteCurrentMemo() {
        if (!this.currentMemo) return;
        
        if (this.currentMemo.isDeleted) {
            // 永久删除
            if (confirm('确定要永久删除此备忘录吗？此操作无法撤销。')) {
                const index = this.memos.findIndex(m => m.id === this.currentMemo.id);
                if (index !== -1) {
                    this.memos.splice(index, 1);
                    this.currentMemo = null;
                    this.saveData();
                    this.renderMemos();
                    this.renderEditor();
                    this.updateCounts();
                    this.showNotification('备忘录已永久删除');
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
                
                this.currentMemo = null;
                this.renderEditor();
                this.updateCounts();
                this.showNotification('备忘录已移到垃圾桶');
            }
        }
    }

    renderTags() {
        const container = document.getElementById('tags-list');
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
        
        // 保存当前值
        const currentValue = select.value;
        
        // 清除所有选项（除了第一个）
        select.innerHTML = '<option value="">添加标签...</option>';
        
        // 添加标签选项
        this.tags.forEach(tag => {
            // 检查当前备忘录是否已有此标签
            const hasTag = this.currentMemo && this.currentMemo.tags.includes(tag.id);
            if (!hasTag) {
                const option = document.createElement('option');
                option.value = tag.id;
                option.textContent = tag.name;
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
            !memo.isDeleted && memo.tags.includes(tagId)
        ).length;
    }

    filterByTag(tagId) {
        // 实现标签过滤
        // 这里可以扩展为在搜索框中添加标签过滤
        const tag = this.tags.find(t => t.id === tagId);
        if (tag) {
            document.getElementById('search-input').value = `#${tag.name}`;
            this.searchQuery = `#${tag.name}`;
            this.renderMemos();
        }
    }

    addTagToCurrentMemo(tagId) {
        if (!this.currentMemo || this.currentMemo.tags.includes(tagId)) return;
        
        this.currentMemo.tags.push(tagId);
        this.currentMemo.updatedAt = new Date().toISOString();
        this.saveData();
        this.renderEditor();
        this.renderMemos();
        this.renderTags();
        
        this.showNotification('标签已添加');
    }

    showNewTagModal() {
        document.getElementById('new-tag-modal').classList.remove('hidden');
        document.getElementById('new-tag-input').focus();
    }

    hideNewTagModal() {
        document.getElementById('new-tag-modal').classList.add('hidden');
        document.getElementById('new-tag-input').value = '';
    }

    createNewTag() {
        const name = document.getElementById('new-tag-input').value.trim();
        if (!name) return;
        
        // 检查是否已存在
        if (this.tags.some(tag => tag.name.toLowerCase() === name.toLowerCase())) {
            this.showNotification('标签已存在', 'error');
            return;
        }
        
        // 预定义颜色
        const colors = [
            '#007aff', '#34c759', '#ff9500', '#ff3b30',
            '#af52de', '#5856d6', '#ff2d55', '#a2845e'
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
    }

    updateCounts() {
        const allCount = this.memos.filter(m => !m.isDeleted).length;
        const favoritesCount = this.memos.filter(m => m.isFavorite && !m.isDeleted).length;
        const trashCount = this.memos.filter(m => m.isDeleted).length;
        
        document.getElementById('all-count').textContent = allCount;
        document.getElementById('favorites-count').textContent = favoritesCount;
        document.getElementById('trash-count').textContent = trashCount;
    }

    execCommand(command) {
        document.execCommand(command, false, null);
        document.getElementById('memo-content').focus();
    }

    showMoreOptions() {
        document.getElementById('more-options-modal').classList.remove('hidden');
    }

    hideMoreOptions() {
        document.getElementById('more-options-modal').classList.add('hidden');
    }

    exportMemo() {
        if (!this.currentMemo) return;
        
        const content = `${this.currentMemo.title}\n\n${this.currentMemo.content.replace(/<[^>]*>/g, '')}`;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentMemo.title || '备忘录'}.txt`;
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
        printWindow.document.write(`
            <html>
                <head>
                    <title>${this.currentMemo.title}</title>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: 0 auto; }
                        h1 { color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
                        .content { white-space: pre-wrap; margin-top: 20px; }
                        .meta { color: #666; font-size: 14px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px; }
                    </style>
                </head>
                <body>
                    <h1>${this.currentMemo.title || '无标题'}</h1>
                    <div class="content">${this.currentMemo.content.replace(/<[^>]*>/g, '')}</div>
                    <div class="meta">打印时间: ${new Date().toLocaleString()}</div>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
        
        this.hideMoreOptions();
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
        
        this.memos.unshift(duplicatedMemo);
        this.currentMemo = duplicatedMemo;
        this.saveData();
        this.renderMemos();
        this.renderEditor();
        this.updateCounts();
        
        this.hideMoreOptions();
        this.showNotification('备忘录已复制');
    }

    showNotification(message) {
        // 使用authManager的showNotification方法
        if (typeof authManager !== 'undefined' && authManager.showNotification) {
            authManager.showNotification(message, 'info');
        } else {
            // 备用通知
            alert(message);
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