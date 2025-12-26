// 缓存名称
const CACHE_NAME = 'memo-app-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/auth.js',
    '/manifest.json',
    '/assets/icons/icon-192.png',
    '/assets/icons/icon-512.png'
];

// 安装Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('缓存资源中...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// 激活Service Worker
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('删除旧缓存:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 拦截网络请求
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // 如果缓存中有，返回缓存
                if (response) {
                    return response;
                }
                
                // 否则从网络获取
                return fetch(event.request)
                    .then(response => {
                        // 检查响应是否有效
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // 克隆响应
                        const responseToCache = response.clone();
                        
                        // 缓存新的资源
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                        
                        return response;
                    })
                    .catch(() => {
                        // 网络请求失败，尝试返回离线页面
                        if (event.request.url.indexOf('.html') > -1) {
                            return caches.match('/index.html');
                        }
                    });
            })
    );
});

// 后台同步
self.addEventListener('sync', event => {
    if (event.tag === 'sync-memos') {
        event.waitUntil(syncMemos());
    }
});

// 推送通知
self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    
    const options = {
        body: data.body || '您有新的备忘录提醒',
        icon: '/assets/icons/icon-192.png',
        badge: '/assets/icons/icon-192.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/'
        }
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || '备忘录提醒', options)
    );
});

// 点击通知
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(clientList => {
            for (const client of clientList) {
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data.url);
            }
        })
    );
});

// 同步备忘录数据
async function syncMemos() {
    try {
        const db = await openDB();
        const unsyncedMemos = await db.getAll('memos', 'unsynced');
        
        for (const memo of unsyncedMemos) {
            await syncMemoToServer(memo);
            memo.synced = true;
            await db.put('memos', memo);
        }
        
        console.log('后台同步完成');
    } catch (error) {
        console.error('后台同步失败:', error);
    }
}

// 打开IndexedDB
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('memo-db', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = event => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains('memos')) {
                const store = db.createObjectStore('memos', { keyPath: 'id' });
                store.createIndex('synced', 'synced');
            }
            
            if (!db.objectStoreNames.contains('attachments')) {
                db.createObjectStore('attachments', { keyPath: 'id' });
            }
        };
    });
}

// 同步备忘录到服务器
async function syncMemoToServer(memo) {
    // 这里实现实际的API调用
    const response = await fetch('/api/sync-memo', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(memo)
    });
    
    if (!response.ok) {
        throw new Error('同步失败');
    }
    
    return response.json();
}