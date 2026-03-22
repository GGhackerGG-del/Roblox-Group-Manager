const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const Store = require('electron-store');
const axios = require('axios');
const https = require('https');
const crypto = require('crypto'); // ⬅ ДОБАВЛЕН ДЛЯ randomUUID()

const store = new Store();

let mainWindow;

// Мапа для отслеживания активных запросов
const activeRequests = new Map();

// ДОБАВЛЕНО: Функция для HTTP запросов с таймаутом и логгированием
function makeRobloxRequest(url, cookie, params = {}, timeout = 30000) {
    const requestId = Date.now() + Math.random().toString(36).substr(2, 9);
    
    console.log(`🌐 [REQUEST ${requestId}] ${url}`, params);
    
    return new Promise((resolve, reject) => {
        // Добавляем параметры к URL если они есть
        let fullUrl = url;
        if (params && Object.keys(params).length > 0) {
            const queryParams = new URLSearchParams(params);
            fullUrl += '?' + queryParams.toString();
        }

        const reqOptions = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'Referer': 'https://www.roblox.com/',
                'Origin': 'https://www.roblox.com'
            },
            timeout: timeout
        };

        // Сохраняем запрос в активные
        activeRequests.set(requestId, {
            url: fullUrl,
            startTime: Date.now(),
            params: params
        });

        const req = https.get(fullUrl, reqOptions, (res) => {
            let data = '';
            const startTime = activeRequests.get(requestId)?.startTime || Date.now();
            const duration = Date.now() - startTime;
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                activeRequests.delete(requestId);
                
                if (res.statusCode === 200) {
                    console.log(`✅ [REQUEST ${requestId}] Success (${duration}ms)`);
                    try {
                        const jsonData = JSON.parse(data);
                        resolve({ success: true, data: jsonData });
                    } catch (e) {
                        resolve({ success: true, data: data });
                    }
                } else {
                    console.log(`❌ [REQUEST ${requestId}] Failed: HTTP ${res.statusCode} (${duration}ms)`);
                    resolve({ 
                        success: false, 
                        error: `HTTP ${res.statusCode}`,
                        data: data,
                        status: res.statusCode
                    });
                }
            });
        });
        
        req.on('error', (error) => {
            activeRequests.delete(requestId);
            console.error(`💥 [REQUEST ${requestId}] Error:`, error.message);
            reject(error);
        });
        
        req.on('timeout', () => {
            activeRequests.delete(requestId);
            console.error(`⏰ [REQUEST ${requestId}] Timeout after ${timeout}ms`);
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

// Вспомогательная функция для получения CSRF токена
async function getCsrfToken(cookie) {
    try {
        const response = await axios.post('https://auth.roblox.com/v2/logout', {}, {
            headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            validateStatus: () => true
        });
        return response.headers['x-csrf-token'];
    } catch (tokenError) {
        console.error('[CSRF Token] Ошибка:', tokenError.message);
        return null;
    }
}

// ДОБАВЛЕНО: Функция для отмены активных запросов
function cancelActiveRequests() {
    console.log(`🛑 Cancelling ${activeRequests.size} active requests`);
    activeRequests.clear();
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        icon: path.join(__dirname, 'assets/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false
        },
        frame: false,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#0f172a',
            symbolColor: '#f8fafc'
        },
        backgroundColor: '#0f172a',
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
    
    // Показываем с анимацией
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // DevTools в разработке
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    // Глобальные хуки
    setupGlobalHooks();
}

function setupGlobalHooks() {
    // Обработка закрытия окна
    ipcMain.on('window-control', (event, action) => {
        if (action === 'minimize') {
            mainWindow.minimize();
        } else if (action === 'maximize') {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            } else {
                mainWindow.maximize();
            }
        } else if (action === 'close') {
            mainWindow.close();
        }
    });
    
    // ИЗМЕНЕНО: Запросы к Roblox API - улучшенная версия с отменой
    ipcMain.handle('roblox-api', async (event, options) => {
        const { endpoint, method = 'GET', data, cookie, params, timeout = 30000 } = options;
        
        // Проверяем куки
        if (!cookie) {
            return { 
                success: false, 
                error: 'Cookie не предоставлен',
                code: 'NO_COOKIE'
            };
        }
        
        try {
            // Используем https модуль для лучшей совместимости с Roblox API
            if (method === 'GET') {
                const result = await makeRobloxRequest(endpoint, cookie, params || {}, timeout);
                return result;
            } else {
                // Для POST запросов используем axios
                const response = await axios({
                    url: endpoint,
                    method: method,
                    data: data,
                    headers: {
                        'Cookie': `.ROBLOSECURITY=${cookie}`,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json'
                    },
                    timeout: timeout
                });
                return { success: true, data: response.data };
            }
        } catch (error) {
            console.error('Roblox API Error:', error.message);
            return { 
                success: false, 
                error: error.response?.data || error.message,
                code: error.code || 'UNKNOWN_ERROR'
            };
        }
    });
    
    // ======== РАБОЧИЙ ОБРАБОТЧИК ДЛЯ ЗАГРУЗКИ ОДЕЖДЫ ========
    ipcMain.handle('upload-clothing', async (event, params) => {
        const { cookie, imagePath, name, description, clothingType, groupId, price = 10 } = params;
        const fileName = path.basename(imagePath);
        
        console.log(`[Upload] Начинаю загрузку: ${fileName}`);
        
        try {
            // 1. Получаем CSRF токен
            const csrfToken = await getCsrfToken(cookie);
            if (!csrfToken) {
                throw new Error('Не удалось получить CSRF токен');
            }
            
            // 2. Читаем файл с диска
            const fileBuffer = await fs.readFile(imagePath);
            
            // 3. Формируем тело запроса (multipart/form-data)
            const FormData = require('form-data');
            const form = new FormData();
            
            // 3a. Добавляем файл. Имя поля ДОЛЖНО БЫТЬ "fileContent"
            form.append('fileContent', fileBuffer, {
                filename: fileName,
                contentType: 'image/png'
            });
            
            // 3b. Подготавливаем JSON-метаданные
            const requestData = {
                displayName: name,
                description: description || '',
                assetType: clothingType, // "Shirt" или "Pants"
                creationContext: {
                    expectedPrice: parseInt(price)
                }
            };
            
            // Если загружаем в группу, добавляем groupId
            if (groupId && groupId !== '') {
                requestData.creationContext.creator = { groupId: parseInt(groupId) };
            }
            
            // Добавляем JSON как строку в поле "request"
            form.append('request', JSON.stringify(requestData));
            
            // 4. Отправляем запрос на загрузку
            const uploadUrl = 'https://apis.roblox.com/assets/user-auth/v1/assets';
            const uploadResponse = await axios.post(uploadUrl, form, {
                headers: {
                    ...form.getHeaders(),
                    'Cookie': `.ROBLOSECURITY=${cookie}`,
                    'X-CSRF-TOKEN': csrfToken,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Origin': 'https://create.roblox.com',
                    'Referer': 'https://create.roblox.com/'
                },
                timeout: 120000
            });
            
            const operationId = uploadResponse.data?.operationId;
            if (!operationId) {
                throw new Error('Сервер не вернул ID операции (operationId)');
            }
            console.log(`[Upload] Операция создана, ID: ${operationId}`);
            
            // 5. Опрашиваем статус операции
            const statusUrl = `https://apis.roblox.com/assets/user-auth/v1/operations/${operationId}`;
            const maxAttempts = 30;
            const pollInterval = 2000;
            let finalResult = null;
            
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                console.log(`[Upload] Опрос статуса... (Попытка ${attempt + 1}/${maxAttempts})`);
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                
                try {
                    const statusResponse = await axios.get(statusUrl, {
                        headers: {
                            'Cookie': `.ROBLOSECURITY=${cookie}`,
                            'X-CSRF-TOKEN': csrfToken,
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                    
                    const operationData = statusResponse.data;
                    if (operationData.done) {
                        finalResult = operationData;
                        console.log('[Upload] Операция завершена!');
                        break;
                    }
                } catch (pollError) {
                    console.warn(`[Upload] Ошибка опроса статуса: ${pollError.message}`);
                }
            }
            
            // 6. Анализируем финальный результат
            if (finalResult?.done && finalResult.response?.assetId) {
                console.log(`[Upload] Успех! Asset ID: ${finalResult.response.assetId}`);
                return {
                    success: true,
                    assetId: finalResult.response.assetId,
                    displayName: finalResult.response.displayName,
                    operationId: operationId,
                    message: 'Одежда успешно загружена и одобрена.'
                };
            } else {
                console.error('[Upload] Операция завершилась неудачно:', finalResult);
                return {
                    success: false,
                    error: finalResult?.response?.error?.message || 'Неизвестная ошибка на стороне Roblox',
                    operationId: operationId,
                    data: finalResult
                };
            }
            
        } catch (error) {
            console.error('[Upload] Критическая ошибка:', error.message);
            return {
                success: false,
                error: error.message,
                details: error.response?.data || null,
                code: error.code
            };
        }
    });
    
    // ======== УСТАНОВКА ЦЕНЫ НА ОДЕЖДУ ======== ⬅ НОВЫЙ ОБРАБОТЧИК
    ipcMain.handle('set-clothing-price', async (event, params) => {
        const { cookie, assetId, name, description, price, groupId } = params;
        
        console.log(`[Price] Устанавливаю цену для ассета ${assetId}: ${price} R$`);
        
        try {
            // Получаем CSRF токен
            const csrfToken = await getCsrfToken(cookie);
            if (!csrfToken) {
                throw new Error('Не удалось получить CSRF токен для установки цены');
            }
            
            // ВАЖНО: Замените 7968491891 на ваш реальный User ID
            const publisherUserId = 7968491891;
            
            // Формируем тело запроса ТОЧНО как в браузере
            const requestData = {
                isRentalOptIn: false,
                idempotencyToken: crypto.randomUUID(),
                agreedPublishingFee: 0,
                creatorGroupId: parseInt(groupId),
                description: description || 'Created with Roblox Group Manager',
                isFree: false,
                name: name || `Clothing ${assetId}`,
                optOutFromRegionalPricing: false,
                priceInRobux: parseInt(price),
                priceOffset: 0,
                publisherUserId: publisherUserId,
                publishingType: 2,
                quantity: 0,
                quantityLimitPerUser: 0,
                resaleRestriction: 2,
                saleLocationConfiguration: {
                    saleLocationType: 1,
                    places: []
                },
                targetId: assetId.toString(),
                targetType: 0
            };
            
            // Отправляем запрос на установку цены
            const priceUrl = 'https://itemconfiguration.roblox.com/v1/collectibles';
            const priceResponse = await axios.post(priceUrl, requestData, {
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `.ROBLOSECURITY=${cookie}`,
                    'X-CSRF-TOKEN': csrfToken,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Origin': 'https://create.roblox.com',
                    'Referer': 'https://create.roblox.com/'
                },
                timeout: 30000
            });
            
            console.log(`[Price] Цена успешно установлена для ассета ${assetId}`);
            return {
                success: true,
                data: priceResponse.data,
                message: `Цена ${price} R$ успешно установлена`
            };
            
        } catch (error) {
            console.error('[Price] Ошибка при установке цены:', error.message);
            return {
                success: false,
                error: error.message,
                details: error.response?.data || null,
                code: error.code
            };
        }
    });
    
    // ДОБАВЛЕНО: Отмена активных запросов
    ipcMain.handle('cancel-requests', async () => {
        cancelActiveRequests();
        return { success: true, message: `Отменено ${activeRequests.size} запросов` };
    });
    
    // ДОБАВЛЕНО: Статистика запросов
    ipcMain.handle('get-request-stats', async () => {
        return {
            active: activeRequests.size,
            list: Array.from(activeRequests.entries()).map(([id, data]) => ({
                id,
                url: data.url,
                duration: Date.now() - data.startTime
            }))
        };
    });
    
    // Работа с файлами
    ipcMain.handle('select-files', async (event, options) => {
        const result = await dialog.showOpenDialog(mainWindow, options);
        return result.filePaths;
    });
    
    ipcMain.handle('select-folder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });
        return result.filePaths[0];
    });
    
    ipcMain.handle('save-file', async (event, options) => {
        const result = await dialog.showSaveDialog(mainWindow, options);
        return result.filePath;
    });
    
    // Обработка изображений
    ipcMain.handle('process-image', async (event, { clothingPath, templatePath, outputPath }) => {
        const sharp = require('sharp');
        
        try {
            // Загружаем изображения
            const clothing = await sharp(clothingPath).ensureAlpha().resize(585, 559).toBuffer();
            const template = await sharp(templatePath).ensureAlpha().resize(585, 559).toBuffer();
            
            // Создаем композицию
            const result = await sharp(clothing)
                .composite([{ input: template, blend: 'over' }])
                .png()
                .toFile(outputPath);
                
            return { success: true, path: outputPath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    
    // Массовая обработка
    ipcMain.handle('batch-process-images', async (event, { clothingFiles, templatePath, outputDir }) => {
        const results = [];
        
        for (const clothingFile of clothingFiles) {
            const outputFilename = `processed_${path.basename(clothingFile)}`;
            const outputPath = path.join(outputDir, outputFilename);
            
            try {
                const result = await mainWindow.webContents.executeJavaScript(`
                    window.processSingleImage(${JSON.stringify({
                        clothingPath: clothingFile,
                        templatePath: templatePath,
                        outputPath: outputPath
                    })})
                `);
                results.push(result);
            } catch (error) {
                results.push({ success: false, error: error.message });
            }
        }
        
        return results;
    });
    
    // Получение CSRF токена (старая версия, оставляем для совместимости)
    ipcMain.handle('get-csrf-token', async (event, cookie) => {
        try {
            const response = await axios.post('https://auth.roblox.com/v2/logout', {}, {
                headers: {
                    'Cookie': `.ROBLOSECURITY=${cookie}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            return response.headers['x-csrf-token'];
        } catch (error) {
            return null;
        }
    });
    
    // ДОБАВЛЕНО: Простой метод загрузки одежды для тестирования
    ipcMain.handle('upload-clothing-simple', async (event, { cookie, imagePath, name, description, clothingType }) => {
        try {
            console.log(`Uploading ${name} (${clothingType})...`);
            
            // Читаем файл
            const imageBuffer = await fs.readFile(imagePath);
            
            // Определяем endpoint
            const endpoint = clothingType === 'Shirt' ? 'UploadShirt' : 'UploadPants';
            const uploadUrl = `https://www.roblox.com/build/${endpoint}`;
            
            // Получаем CSRF токен
            const csrfToken = await axios.post('https://auth.roblox.com/v2/logout', {}, {
                headers: {
                    'Cookie': `.ROBLOSECURITY=${cookie}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                validateStatus: () => true
            }).then(res => res.headers['x-csrf-token']);
            
            if (!csrfToken) {
                return { success: false, error: 'Failed to get CSRF token' };
            }
            
            // Создаем FormData
            const FormData = require('form-data');
            const form = new FormData();
            form.append('file', imageBuffer, { filename: path.basename(imagePath) });
            form.append('name', name);
            form.append('description', description || '');
            form.append('assetTypeId', clothingType === 'Shirt' ? '11' : '12');
            form.append('expectedPrice', '10');
            
            // Отправляем запрос
            const response = await axios.post(uploadUrl, form, {
                headers: {
                    ...form.getHeaders(),
                    'Cookie': `.ROBLOSECURITY=${cookie}`,
                    'X-CSRF-TOKEN': csrfToken,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 60000
            });
            
            if (response.data?.success) {
                return { success: true, data: response.data };
            } else {
                return { success: false, error: response.data?.error || 'Upload failed' };
            }
            
        } catch (error) {
            console.error('Upload error:', error.message);
            return { success: false, error: error.message };
        }
    });
}

app.whenReady().then(() => {
    createWindow();
    
    // Создаем меню приложения
    const template = [
        {
            label: 'Файл',
            submenu: [
                { role: 'quit' }
            ]
        },
        {
            label: 'Вид',
            submenu: [
                { role: 'reload' },
                { role: 'forcereload' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Отладка',
            submenu: [
                {
                    label: 'Статистика запросов',
                    click: async () => {
                        const stats = await mainWindow.webContents.executeJavaScript(`
                            window.electronAPI.invoke('get-request-stats')
                        `);
                        console.log('📊 Статистика запросов:', stats);
                    }
                },
                {
                    label: 'Отменить запросы',
                    click: async () => {
                        await mainWindow.webContents.executeJavaScript(`
                            window.electronAPI.invoke('cancel-requests')
                        `);
                    }
                },
                { type: 'separator' },
                {
                    label: 'Проверить соединение',
                    click: async () => {
                        console.log('🌐 Проверка соединения...');
                    }
                }
            ]
        },
        {
            label: 'Справка',
            submenu: [
                {
                    label: 'Документация',
                    click: async () => {
                        const { shell } = require('electron');
                        await shell.openExternal('https://github.com/your-repo/docs');
                    }
                }
            ]
        }
    ];
    
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Обработка ошибок
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});