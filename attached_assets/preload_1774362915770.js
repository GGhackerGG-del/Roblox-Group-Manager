const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Основной API для Roblox
    robloxApi: (options) => ipcRenderer.invoke('roblox-api', options),
    
    // Управление окном
    windowControl: (action) => ipcRenderer.send('window-control', action),
    
    // Работа с файлами
    selectFiles: (options) => ipcRenderer.invoke('select-files', options),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    saveFile: (options) => ipcRenderer.invoke('save-file', options),
    
    // Обработка изображений
    processImage: (params) => ipcRenderer.invoke('process-image', params),
    batchProcessImages: (params) => ipcRenderer.invoke('batch-process-images', params),
    
    // Загрузка в Roblox
    getCsrfToken: (cookie) => ipcRenderer.invoke('get-csrf-token', cookie),
    uploadClothing: (params) => ipcRenderer.invoke('upload-clothing', params),
    setClothingPrice: (params) => ipcRenderer.invoke('set-clothing-price', params), // ⬅ ДОБАВЛЕН
    
    // Настройки
    getSettings: (key) => ipcRenderer.invoke('get-settings', key),
    setSettings: (key, value) => ipcRenderer.invoke('set-settings', { key, value }),
    
    // Уведомления
    showNotification: (title, message, type) => 
        ipcRenderer.send('show-notification', { title, message, type }),
    
    // Экспорт данных
    exportToCSV: (data, filename) => 
        ipcRenderer.invoke('export-csv', { data, filename }),
    
    // Обновление
    checkForUpdates: () => ipcRenderer.invoke('check-updates'),
    
    // Нативные диалоги
    showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
    showErrorBox: (title, content) => ipcRenderer.send('show-error-box', { title, content }),
    
    // === НОВЫЕ МЕТОДЫ ДЛЯ УПРАВЛЕНИЯ ЗАПРОСАМИ ===
    
    // Универсальный метод invoke
    invoke: (method, ...args) => ipcRenderer.invoke(method, ...args),
    
    // Универсальный метод send
    send: (channel, data) => ipcRenderer.send(channel, data),
    
    // Отмена активных запросов
    cancelRequests: () => ipcRenderer.invoke('cancel-requests'),
    
    // Получение статистики запросов
    getRequestStats: () => ipcRenderer.invoke('get-request-stats'),
    
    // Простая загрузка одежды
    uploadClothingSimple: (params) => ipcRenderer.invoke('upload-clothing-simple', params)
});

// Глобальные утилиты
contextBridge.exposeInMainWorld('utils', {
    formatNumber: (num) => num.toLocaleString('ru-RU'),
    formatDate: (date) => new Date(date).toLocaleString('ru-RU'),
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // === НОВЫЕ УТИЛИТЫ ===
    
    // Кэширование с таймером
    createCache: (duration = 30000) => {
        const cache = new Map();
        return {
            get: (key) => {
                const cached = cache.get(key);
                if (cached && (Date.now() - cached.timestamp) < duration) {
                    return cached.data;
                }
                return null;
            },
            set: (key, data) => {
                cache.set(key, {
                    timestamp: Date.now(),
                    data: data
                });
            },
            clear: (key) => {
                if (key) {
                    cache.delete(key);
                } else {
                    cache.clear();
                }
            },
            has: (key) => {
                const cached = cache.get(key);
                return cached && (Date.now() - cached.timestamp) < duration;
            }
        };
    },
    
    // Задержка
    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    
    // Повтор запроса с экспоненциальной задержкой
    retryWithBackoff: async (fn, maxRetries = 3, baseDelay = 1000) => {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                const delay = baseDelay * Math.pow(2, i);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    },
    
    // Валидация данных
    validateData: (data, ...fields) => {
        if (!data) return false;
        for (const field of fields) {
            if (data[field] === undefined || data[field] === null) {
                return false;
            }
        }
        return true;
    },
    
    // Форматирование времени
    formatTimeAgo: (date) => {
        const now = new Date();
        const diffMs = now - new Date(date);
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffDays > 0) {
            return `${diffDays}д назад`;
        } else if (diffHours > 0) {
            return `${diffHours}ч назад`;
        } else if (diffMins > 0) {
            return `${diffMins}м назад`;
        } else {
            return 'только что';
        }
    },
    
    // Клонирование объекта (без ссылок)
    deepClone: (obj) => {
        return JSON.parse(JSON.stringify(obj));
    },
    
    // Проверка пустого значения
    isEmpty: (value) => {
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim() === '';
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    }
});

// === ДОПОЛНИТЕЛЬНЫЕ ГЛОБАЛЬНЫЕ ФУНКЦИИ ===

// Функция для отладки
contextBridge.exposeInMainWorld('debug', {
    log: (...args) => console.log('[DEBUG]', ...args),
    warn: (...args) => console.warn('[DEBUG]', ...args),
    error: (...args) => console.error('[DEBUG]', ...args),
    info: (...args) => console.info('[DEBUG]', ...args),
    
    // Проверка состояния приложения
    checkAppState: () => {
        if (!window.app) {
            console.error('App not initialized');
            return false;
        }
        return {
            loggedIn: window.app.isLoggedIn,
            user: window.app.currentUser,
            group: window.app.currentGroup,
            cookie: window.app.cookie ? 'Present' : 'Not present'
        };
    },
    
    // Проверка соединения с API
    testConnection: async () => {
        try {
            const response = await fetch('https://api.roblox.com/currency/balance', {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json'
                }
            });
            return response.status === 200;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    },
    
    // Очистка localStorage
    clearStorage: () => {
        localStorage.clear();
        console.log('LocalStorage cleared');
        return true;
    }
});

// Глобальный обработчик ошибок
window.addEventListener('error', (event) => {
    console.error('Global error caught:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});