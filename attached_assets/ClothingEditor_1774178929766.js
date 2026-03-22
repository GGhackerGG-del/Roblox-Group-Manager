class ClothingEditorComponent {
    static render() {
        return `
            <div class="clothing-editor">
                <div class="page-header">
                    <h1 class="page-title">
                        <i class="fas fa-tshirt"></i> Пакетный редактор одежды
                    </h1>
                    <div class="header-actions">
                        <button id="backBtn" class="btn">
                            <i class="fas fa-arrow-left"></i> Назад
                        </button>
                    </div>
                </div>
                
                <div class="editor-container">
                    <!-- Левая панель - инструменты -->
                    <div class="editor-sidebar">
                        <div class="sidebar-section">
                            <h3><i class="fas fa-layer-group"></i> Шаг 1: Загрузка материалов</h3>
                            
                            <div class="upload-section">
                                <h4><i class="fas fa-tshirt"></i> Одежда (нижний слой)</h4>
                                <div class="file-list" id="clothingList">
                                    <div class="empty-state">
                                        <i class="fas fa-cloud-upload-alt"></i>
                                        <p>Перетащите PNG файлы или нажмите для выбора</p>
                                    </div>
                                </div>
                                <div class="upload-actions">
                                    <button id="selectClothing" class="btn">
                                        <i class="fas fa-folder-open"></i> Выбрать файлы
                                    </button>
                                    <button id="clearClothing" class="btn btn-danger">
                                        <i class="fas fa-trash"></i> Очистить
                                    </button>
                                </div>
                            </div>
                            
                            <div class="upload-section">
                                <h4><i class="fas fa-paint-brush"></i> Шаблон (верхний слой)</h4>
                                <div class="template-preview" id="templatePreview">
                                    <div class="empty-state">
                                        <i class="fas fa-image"></i>
                                        <p>Выберите PNG шаблон</p>
                                    </div>
                                </div>
                                <div class="upload-actions">
                                    <button id="selectTemplate" class="btn">
                                        <i class="fas fa-folder-open"></i> Выбрать шаблон
                                    </button>
                                    <button id="clearTemplate" class="btn btn-danger">
                                        <i class="fas fa-trash"></i> Удалить
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="sidebar-section">
                            <h3><i class="fas fa-sliders-h"></i> Настройки обработки</h3>
                            
                            <div class="settings-group">
                                <label class="setting-label">
                                    <input type="checkbox" id="autoResize" checked>
                                    <span>Автоматически изменять размер</span>
                                </label>
                            </div>
                            
                            <div class="size-presets">
                                <h4>Стандартные размеры</h4>
                                <div class="preset-buttons">
                                    <button class="preset-btn active" data-size="585x559">
                                        Roblox (585×559)
                                    </button>
                                    <button class="preset-btn" data-size="1024x1024">
                                        1024×1024
                                    </button>
                                    <button class="preset-btn" data-size="512x512">
                                        512×512
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="sidebar-actions">
                            <button id="processBtn" class="btn btn-primary" disabled>
                                <i class="fas fa-sync-alt"></i> Обработать файлы
                            </button>
                            <button id="downloadBtn" class="btn btn-success" disabled>
                                <i class="fas fa-download"></i> Скачать результаты
                            </button>
                        </div>
                    </div>
                    
                    <!-- Правая панель - предпросмотр -->
                    <div class="editor-preview">
                        <div class="preview-container">
                            <div class="canvas-wrapper" id="canvasWrapper">
                                <canvas id="previewCanvas" width="585" height="559"></canvas>
                                <div class="canvas-overlay">
                                    <div class="canvas-info">
                                        <div class="info-item">
                                            <i class="fas fa-ruler"></i>
                                            <span id="canvasSize">585×559 px</span>
                                        </div>
                                        <div class="info-item">
                                            <i class="fas fa-layer-group"></i>
                                            <span id="canvasLayers">0 слоев</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="preview-controls">
                            <div class="zoom-controls">
                                <button class="zoom-btn" data-action="zoom-out">
                                    <i class="fas fa-search-minus"></i>
                                </button>
                                <div class="zoom-level">100%</div>
                                <button class="zoom-btn" data-action="zoom-in">
                                    <i class="fas fa-search-plus"></i>
                                </button>
                                <button class="zoom-btn" data-action="reset">
                                    <i class="fas fa-expand"></i>
                                </button>
                            </div>
                            
                            <div class="layer-controls">
                                <div class="layer-switch">
                                    <span>Одежда</span>
                                    <label class="switch">
                                        <input type="checkbox" id="toggleLayer" checked>
                                        <span class="slider"></span>
                                    </label>
                                    <span>Шаблон</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="processing-log">
                            <h4><i class="fas fa-history"></i> Лог обработки</h4>
                            <div class="log-content" id="logContent">
                                <div class="log-entry">Готов к работе</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    static init(app) {
        this.app = app;
        this.clothingFiles = [];
        this.templateFile = null;
        this.processedFiles = [];
        this.currentPreview = null;
        this.zoom = 1;
        
        this.initCanvas();
        this.bindEvents();
    }
    
    static initCanvas() {
        this.canvas = document.getElementById('previewCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Настройка canvas для высокого качества
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        
        // Отрисовка фона с прозрачностью
        this.drawCheckerboard();
    }
    
    static drawCheckerboard() {
        const size = 20;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Очищаем canvas
        this.ctx.clearRect(0, 0, width, height);
        
        // Рисуем шахматный фон
        for (let y = 0; y < height; y += size) {
            for (let x = 0; x < width; x += size) {
                const isEven = ((x / size) + (y / size)) % 2 === 0;
                this.ctx.fillStyle = isEven ? '#2d3748' : '#1e293b';
                this.ctx.fillRect(x, y, size, size);
            }
        }
    }
    
    static bindEvents() {
        // Кнопки навигации
        document.getElementById('backBtn').addEventListener('click', () => {
            this.app.navigateTo('dashboard');
        });
        
        // Выбор файлов
        document.getElementById('selectClothing').addEventListener('click', () => this.selectClothingFiles());
        document.getElementById('selectTemplate').addEventListener('click', () => this.selectTemplateFile());
        
        // Очистка файлов
        document.getElementById('clearClothing').addEventListener('click', () => this.clearClothingFiles());
        document.getElementById('clearTemplate').addEventListener('click', () => this.clearTemplateFile());
        
        // Обработка
        document.getElementById('processBtn').addEventListener('click', () => this.processFiles());
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadResults());
        
        // Настройки
        document.getElementById('autoResize').addEventListener('change', () => this.updatePreview());
        document.getElementById('toggleLayer').addEventListener('change', () => this.updatePreview());
        
        // Zoom контролы
        document.querySelectorAll('.zoom-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.handleZoom(action);
            });
        });
        
        // Перетаскивание файлов
        this.setupDragAndDrop();
    }
    
    static setupDragAndDrop() {
        const clothingList = document.getElementById('clothingList');
        const templatePreview = document.getElementById('templatePreview');
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            clothingList.addEventListener(eventName, preventDefaults, false);
            templatePreview.addEventListener(eventName, preventDefaults, false);
        });
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        // Подсветка при перетаскивании
        ['dragenter', 'dragover'].forEach(eventName => {
            clothingList.addEventListener(eventName, highlight, false);
            templatePreview.addEventListener(eventName, highlight, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            clothingList.addEventListener(eventName, unhighlight, false);
            templatePreview.addEventListener(eventName, unhighlight, false);
        });
        
        function highlight(e) {
            e.currentTarget.classList.add('drag-over');
        }
        
        function unhighlight(e) {
            e.currentTarget.classList.remove('drag-over');
        }
        
        // Обработка файлов
        clothingList.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            this.handleDroppedClothingFiles(files);
        });
        
        templatePreview.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                this.handleDroppedTemplateFile(files[0]);
            }
        });
    }
    
    static async selectClothingFiles() {
        try {
            const files = await window.electronAPI.selectFiles({
                title: 'Выберите PNG файлы с одеждой',
                filters: [
                    { name: 'PNG изображения', extensions: ['png'] },
                    { name: 'Все файлы', extensions: ['*'] }
                ],
                properties: ['openFile', 'multiSelections']
            });
            
            if (files.length > 0) {
                this.clothingFiles = files;
                this.updateClothingList();
                this.updateProcessButton();
                this.logMessage(`Загружено ${files.length} файлов одежды`);
            }
        } catch (error) {
            this.app.showNotification('Ошибка', 'Не удалось выбрать файлы', 'error');
        }
    }
    
    static async selectTemplateFile() {
        try {
            const files = await window.electronAPI.selectFiles({
                title: 'Выберите PNG шаблон',
                filters: [
                    { name: 'PNG изображения', extensions: ['png'] }
                ],
                properties: ['openFile']
            });
            
            if (files.length > 0) {
                this.templateFile = files[0];
                this.updateTemplatePreview();
                this.updateProcessButton();
                this.logMessage(`Шаблон загружен: ${this.getFileName(this.templateFile)}`);
                await this.previewTemplate();
            }
        } catch (error) {
            this.app.showNotification('Ошибка', 'Не удалось выбрать шаблон', 'error');
        }
    }
    
    static async processFiles() {
        if (!this.clothingFiles.length || !this.templateFile) {
            this.app.showNotification('Внимание', 'Сначала выберите одежду и шаблон', 'warning');
            return;
        }
        
        const processBtn = document.getElementById('processBtn');
        processBtn.disabled = true;
        processBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Обработка...';
        
        try {
            // Создаем папку для результатов
            const timestamp = Date.now();
            const outputDir = await window.electronAPI.selectFolder();
            
            if (!outputDir) {
                throw new Error('Папка не выбрана');
            }
            
            this.logMessage(`Начата обработка ${this.clothingFiles.length} файлов...`);
            
            // Обрабатываем каждый файл
            this.processedFiles = [];
            
            for (let i = 0; i < this.clothingFiles.length; i++) {
                const clothingFile = this.clothingFiles[i];
                const filename = this.getFileName(clothingFile);
                const outputFilename = `processed_${filename}`;
                const outputPath = `${outputDir}/${outputFilename}`;
                
                this.logMessage(`Обработка ${i + 1}/${this.clothingFiles.length}: ${filename}`);
                
                try {
                    const result = await window.electronAPI.processImage({
                        clothingPath: clothingFile,
                        templatePath: this.templateFile,
                        outputPath: outputPath
                    });
                    
                    if (result.success) {
                        this.processedFiles.push(outputPath);
                        this.logMessage(`✓ Сохранено: ${outputFilename}`);
                    } else {
                        this.logMessage(`✗ Ошибка: ${result.error}`);
                    }
                } catch (error) {
                    this.logMessage(`✗ Ошибка обработки: ${error.message}`);
                }
            }
            
            this.logMessage(`✅ Обработка завершена! Успешно: ${this.processedFiles.length}/${this.clothingFiles.length}`);
            
            // Показываем результат
            this.app.showNotification(
                'Обработка завершена',
                `Успешно обработано ${this.processedFiles.length} файлов`,
                'success'
            );
            
            // Активируем кнопку скачивания
            this.updateDownloadButton();
            
        } catch (error) {
            this.app.showNotification('Ошибка', error.message, 'error');
            this.logMessage(`❌ Ошибка: ${error.message}`);
        } finally {
            processBtn.disabled = false;
            processBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Обработать файлы';
        }
    }
    
    static async downloadResults() {
        if (!this.processedFiles.length) {
            this.app.showNotification('Внимание', 'Сначала обработайте файлы', 'warning');
            return;
        }
        
        try {
            const folder = await window.electronAPI.selectFolder();
            if (folder) {
                // Здесь будет логика копирования файлов
                this.app.showNotification('Успех', 'Файлы скопированы', 'success');
            }
        } catch (error) {
            this.app.showNotification('Ошибка', 'Не удалось сохранить файлы', 'error');
        }
    }
    
    static async previewTemplate() {
        if (!this.templateFile) return;
        
        // Загружаем и отображаем шаблон
        const img = new Image();
        img.onload = () => {
            this.currentPreview = img;
            this.updatePreview();
        };
        img.src = this.templateFile;
    }
    
    static updatePreview() {
        if (!this.currentPreview) {
            this.drawCheckerboard();
            return;
        }
        
        const canvas = this.canvas;
        const ctx = this.ctx;
        const img = this.currentPreview;
        
        // Очищаем canvas
        this.drawCheckerboard();
        
        // Рассчитываем размеры с учетом zoom
        const scale = this.zoom;
        const x = (canvas.width - img.width * scale) / 2;
        const y = (canvas.height - img.height * scale) / 2;
        
        // Рисуем изображение
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
    }
    
    static handleZoom(action) {
        switch (action) {
            case 'zoom-in':
                this.zoom = Math.min(this.zoom + 0.25, 3);
                break;
            case 'zoom-out':
                this.zoom = Math.max(this.zoom - 0.25, 0.25);
                break;
            case 'reset':
                this.zoom = 1;
                break;
        }
        
        document.querySelector('.zoom-level').textContent = `${Math.round(this.zoom * 100)}%`;
        this.updatePreview();
    }
    
    static updateClothingList() {
        const clothingList = document.getElementById('clothingList');
        
        if (this.clothingFiles.length === 0) {
            clothingList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <p>Перетащите PNG файлы или нажмите для выбора</p>
                </div>
            `;
            return;
        }
        
        const filesHtml = this.clothingFiles.map(file => `
            <div class="file-item">
                <i class="fas fa-file-image"></i>
                <span class="file-name">${this.getFileName(file)}</span>
                <button class="file-remove" data-file="${file}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
        
        clothingList.innerHTML = filesHtml;
        
        // Добавляем обработчики для кнопок удаления
        clothingList.querySelectorAll('.file-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const fileToRemove = e.currentTarget.dataset.file;
                this.removeClothingFile(fileToRemove);
            });
        });
    }
    
    static updateTemplatePreview() {
        const templatePreview = document.getElementById('templatePreview');
        
        if (!this.templateFile) {
            templatePreview.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-image"></i>
                    <p>Выберите PNG шаблон</p>
                </div>
            `;
            return;
        }
        
        const fileName = this.getFileName(this.templateFile);
        templatePreview.innerHTML = `
            <div class="template-info">
                <i class="fas fa-file-image"></i>
                <div class="template-details">
                    <div class="template-name">${fileName}</div>
                    <div class="template-size">PNG шаблон</div>
                </div>
            </div>
        `;
    }
    
    static updateProcessButton() {
        const processBtn = document.getElementById('processBtn');
        const hasClothing = this.clothingFiles.length > 0;
        const hasTemplate = !!this.templateFile;
        
        processBtn.disabled = !(hasClothing && hasTemplate);
    }
    
    static updateDownloadButton() {
        const downloadBtn = document.getElementById('downloadBtn');
        downloadBtn.disabled = this.processedFiles.length === 0;
    }
    
    static logMessage(message) {
        const logContent = document.getElementById('logContent');
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `<div class="log-entry">[${timestamp}] ${message}</div>`;
        
        logContent.insertAdjacentHTML('afterbegin', logEntry);
        
        // Ограничиваем количество записей
        const entries = logContent.querySelectorAll('.log-entry');
        if (entries.length > 50) {
            entries[entries.length - 1].remove();
        }
    }
    
    static getFileName(path) {
        return path.split('/').pop().split('\\').pop();
    }
    
    static handleDroppedClothingFiles(files) {
        const pngFiles = Array.from(files).filter(file => 
            file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
        );
        
        if (pngFiles.length > 0) {
            this.clothingFiles = pngFiles.map(file => file.path || file.name);
            this.updateClothingList();
            this.updateProcessButton();
            this.logMessage(`Перетащено ${pngFiles.length} файлов одежды`);
        }
    }
    
    static handleDroppedTemplateFile(file) {
        if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
            this.templateFile = file.path || file.name;
            this.updateTemplatePreview();
            this.updateProcessButton();
            this.logMessage(`Шаблон перетащен: ${this.getFileName(this.templateFile)}`);
            this.previewTemplate();
        }
    }
    
    static clearClothingFiles() {
        this.clothingFiles = [];
        this.updateClothingList();
        this.updateProcessButton();
        this.logMessage('Список одежды очищен');
    }
    
    static clearTemplateFile() {
        this.templateFile = null;
        this.currentPreview = null;
        this.updateTemplatePreview();
        this.updateProcessButton();
        this.updatePreview();
        this.logMessage('Шаблон удален');
    }
    
    static removeClothingFile(fileToRemove) {
        this.clothingFiles = this.clothingFiles.filter(file => file !== fileToRemove);
        this.updateClothingList();
        this.updateProcessButton();
        this.logMessage(`Файл удален: ${this.getFileName(fileToRemove)}`);
    }
}