class UploaderComponent {
    static render() {
        return `
            <div class="uploader-page">
                <div class="page-header">
                    <h1 class="page-title">
                        <i class="fas fa-cloud-upload-alt"></i> Автозагрузка одежды в Roblox
                    </h1>
                    <div class="header-actions">
                        <button id="backBtn" class="btn">
                            <i class="fas fa-arrow-left"></i> Назад
                        </button>
                    </div>
                </div>
                
                <div class="uploader-container">
                    <!-- Левая панель -->
                    <div class="uploader-sidebar">
                        <!-- Блок переключения аккаунтов -->
                        <div class="account-selector-section">
                            <h3><i class="fas fa-user-circle"></i> Выберите аккаунт</h3>
                            
                            <div class="account-switcher">
                                <div class="account-list" id="accountList">
                                    <!-- Аккаунты будут добавлены динамически -->
                                </div>
                                
                                <div class="account-add-card" id="addAccountCard">
                                    <div class="account-add-icon">
                                        <i class="fas fa-plus-circle"></i>
                                    </div>
                                    <div class="account-add-text">Добавить аккаунт</div>
                                </div>
                            </div>
                            
                            <div class="account-info-panel" id="accountInfoPanel">
                                <!-- Информация о выбранном аккаунте -->
                            </div>
                        </div>
                        
                        <div class="upload-section">
                            <h3><i class="fas fa-folder-open"></i> Файлы для загрузки</h3>
                            <div class="file-dropzone" id="uploadDropzone">
                                <div class="dropzone-content">
                                    <i class="fas fa-cloud-upload-alt"></i>
                                    <p>Перетащите PNG файлы сюда</p>
                                    <button id="selectUploadFiles" class="btn">
                                        <i class="fas fa-folder-open"></i> Выбрать файлы
                                    </button>
                                </div>
                            </div>
                            <div class="file-list" id="uploadFileList"></div>
                        </div>
                        
                        <div class="upload-settings">
                            <h3><i class="fas fa-cog"></i> Настройки загрузки</h3>
                            
                            <div class="form-group">
                                <label class="form-label">Тип одежды</label>
                                <div class="radio-group">
                                    <label class="radio-option">
                                        <input type="radio" name="clothingType" value="Shirt" checked>
                                        <span class="radio-label">
                                            <i class="fas fa-tshirt"></i> Футболка (Shirt)
                                        </span>
                                    </label>
                                    <label class="radio-option">
                                        <input type="radio" name="clothingType" value="Pants">
                                        <span class="radio-label">
                                            <i class="fas fa-vest"></i> Штаны (Pants)
                                        </span>
                                    </label>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Название</label>
                                <input type="text" id="uploadName" class="form-input" 
                                       value="My Clothing" placeholder="Введите название">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Описание</label>
                                <textarea id="uploadDescription" class="form-input" rows="3">
                                    Created with Roblox Group Manager
                                </textarea>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Цена (Robux)</label>
                                <input type="number" id="uploadPrice" class="form-input" 
                                       value="5" min="5" max="100000">
                                <div class="form-hint">Минимальная цена: 5 Robux</div>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Группа для загрузки</label>
                                <select id="uploadGroup" class="form-input">
                                    <option value="">Выберите группу</option>
                                    <!-- Группы будут заполнены динамически -->
                                </select>
                            </div>
                        </div>
                        
                        <div class="upload-actions">
                            <button id="startUpload" class="btn btn-primary" disabled>
                                <i class="fas fa-play"></i> Начать загрузку
                            </button>
                            <button id="stopUpload" class="btn btn-danger" disabled>
                                <i class="fas fa-stop"></i> Остановить
                            </button>
                        </div>
                    </div>
                    
                    <!-- Правая панель -->
                    <div class="uploader-main">
                        <div class="upload-progress">
                            <h3><i class="fas fa-chart-line"></i> Прогресс загрузки</h3>
                            
                            <div class="progress-stats">
                                <div class="stat-item">
                                    <div class="stat-label">Всего файлов</div>
                                    <div class="stat-value" id="totalFiles">0</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-label">Загружено</div>
                                    <div class="stat-value" id="uploadedFiles">0</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-label">Ошибок</div>
                                    <div class="stat-value" id="failedFiles">0</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-label">Текущий аккаунт</div>
                                    <div class="stat-value" id="currentAccountName">Не выбран</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-label">Стоимость</div>
                                    <div class="stat-value" id="totalCost">0 R$</div>
                                </div>
                            </div>
                            
                            <div class="progress-container">
                                <div class="progress-bar">
                                    <div class="progress-fill" id="progressFill" style="width: 0%"></div>
                                </div>
                                <div class="progress-text" id="progressText">Готов к загрузке</div>
                            </div>
                        </div>
                        
                        <div class="upload-log">
                            <h3><i class="fas fa-history"></i> Лог загрузки</h3>
                            <div class="log-container" id="uploadLog">
                                <div class="log-entry info">
                                    <i class="fas fa-info-circle"></i>
                                    <div class="log-content">
                                        <div class="log-time">${new Date().toLocaleTimeString()}</div>
                                        <div class="log-message">Выберите аккаунт для загрузки</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="current-account-info">
                            <div class="account-card-large">
                                <div class="account-card-header">
                                    <i class="fas fa-user-circle"></i>
                                    <div class="account-title">Текущий аккаунт</div>
                                </div>
                                <div class="account-card-body" id="selectedAccountDetails">
                                    <div class="account-empty-state">
                                        <i class="fas fa-user-plus"></i>
                                        <p>Выберите или добавьте аккаунт</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Модальное окно добавления аккаунта -->
                <div class="modal-overlay" id="accountModal" style="display: none;">
                    <div class="modal modal-sm">
                        <div class="modal-header">
                            <h3><i class="fas fa-user-plus"></i> Новый аккаунт</h3>
                            <button class="modal-close">&times;</button>
                        </div>
                        <div class="modal-body">
                            <div class="form-group">
                                <label class="form-label">Название аккаунта</label>
                                <input type="text" id="newAccountName" class="form-input" 
                                       placeholder="Например: Твинк #1">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Cookie (.ROBLOSECURITY)</label>
                                <textarea id="newAccountCookie" class="form-input" rows="4" 
                                          placeholder="Вставьте cookie здесь"></textarea>
                            </div>
                            
                            <div class="modal-actions">
                                <button id="cancelAccountBtn" class="btn">Отмена</button>
                                <button id="saveAccountBtn" class="btn btn-primary">
                                    <i class="fas fa-save"></i> Сохранить
                                </button>
                            </div>
                            
                            <div class="form-hint">
                                <p><strong>Как получить cookie:</strong></p>
                                <p>1. Войдите в Roblox в браузере</p>
                                <p>2. F12 → Application → Cookies</p>
                                <p>3. Найдите .ROBLOSECURITY и скопируйте значение</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    static init(app) {
        this.app = app;
        this.uploadFiles = [];
        this.isUploading = false;
        this.currentUploadIndex = 0;
        this.uploadStats = {
            total: 0,
            success: 0,
            failed: 0
        };
        
        // Данные аккаунтов
        this.accounts = []; // Только твинки, основной аккаунт не используем
        this.selectedAccount = null;
        
        this.bindEvents();
        this.loadSavedAccounts();
        this.updateAccountsList();
    }
    
    static bindEvents() {
        document.getElementById('backBtn').addEventListener('click', () => {
            this.app.navigateTo('dashboard');
        });
        
        document.getElementById('selectUploadFiles').addEventListener('click', () => this.selectFiles());
        document.getElementById('startUpload').addEventListener('click', () => this.startUpload());
        document.getElementById('stopUpload').addEventListener('click', () => this.stopUpload());
        
        // Добавление аккаунта
        document.getElementById('addAccountCard').addEventListener('click', () => this.showAddAccountModal());
        
        // Модальное окно
        document.querySelector('.modal-close').addEventListener('click', () => this.hideModal());
        document.getElementById('cancelAccountBtn').addEventListener('click', () => this.hideModal());
        document.getElementById('saveAccountBtn').addEventListener('click', () => this.saveAccount());
        
        this.setupDropzone();
        document.getElementById('uploadPrice').addEventListener('input', () => this.updateTotalCost());
        document.getElementById('uploadGroup').addEventListener('change', () => this.updateUploadButton());
    }
    
    static setupDropzone() {
        const dropzone = document.getElementById('uploadDropzone');
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, preventDefaults, false);
        });
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, highlight, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, unhighlight, false);
        });
        
        function highlight() {
            dropzone.classList.add('drag-over');
        }
        
        function unhighlight() {
            dropzone.classList.remove('drag-over');
        }
        
        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            this.handleDroppedFiles(files);
        });
    }
    
    static async selectFiles() {
        try {
            const files = await window.electronAPI.selectFiles({
                title: 'Выберите PNG файлы одежды',
                filters: [
                    { name: 'PNG изображения', extensions: ['png'] }
                ],
                properties: ['openFile', 'multiSelections']
            });
            
            if (files.length > 0) {
                this.addFiles(files);
            }
        } catch (error) {
            this.app.showNotification('Ошибка', 'Не удалось выбрать файлы', 'error');
        }
    }
    
    static handleDroppedFiles(files) {
        const pngFiles = Array.from(files).filter(file => 
            file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
        );
        
        if (pngFiles.length > 0) {
            const filePaths = pngFiles.map(file => file.path || file.name);
            this.addFiles(filePaths);
        }
    }
    
    static addFiles(files) {
        this.uploadFiles = [...this.uploadFiles, ...files];
        this.updateFileList();
        this.updateUploadButton();
        this.updateTotalCost();
        this.logMessage(`Добавлено ${files.length} файлов`);
    }
    
    static updateFileList() {
        const fileList = document.getElementById('uploadFileList');
        
        if (this.uploadFiles.length === 0) {
            fileList.innerHTML = '';
            return;
        }
        
        const filesHtml = this.uploadFiles.map((file, index) => `
            <div class="upload-file-item">
                <div class="file-info">
                    <i class="fas fa-file-image"></i>
                    <div class="file-details">
                        <div class="file-name">${this.getFileName(file)}</div>
                        <div class="file-status" id="fileStatus${index}">
                            <span class="status-pending">Ожидает</span>
                        </div>
                    </div>
                </div>
                <button class="file-remove" data-index="${index}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
        
        fileList.innerHTML = filesHtml;
        
        fileList.querySelectorAll('.file-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                this.removeFile(index);
            });
        });
    }
    
    // ======== УПРАВЛЕНИЕ АККАУНТАМИ ========
    
    static async loadSavedAccounts() {
        try {
            const savedAccounts = localStorage.getItem('uploaderTwinkAccounts');
            if (savedAccounts) {
                const accounts = JSON.parse(savedAccounts);
                this.accounts = accounts;
                if (accounts.length > 0) {
                    this.selectAccount(accounts[0].id);
                }
            }
        } catch (error) {
            console.error('Error loading saved accounts:', error);
        }
    }
    
    static saveAccounts() {
        try {
            localStorage.setItem('uploaderTwinkAccounts', JSON.stringify(this.accounts));
        } catch (error) {
            console.error('Error saving accounts:', error);
        }
    }
    
    static updateAccountsList() {
        const accountList = document.getElementById('accountList');
        
        if (this.accounts.length === 0) {
            accountList.innerHTML = `
                <div class="account-empty-state">
                    <i class="fas fa-users"></i>
                    <p>Нет добавленных аккаунтов</p>
                </div>
            `;
            this.updateAccountInfoPanel(null);
            return;
        }
        
        const accountsHtml = this.accounts.map(account => `
            <div class="account-card ${account.id === this.selectedAccount?.id ? 'selected' : ''}" 
                 data-id="${account.id}">
                <div class="account-card-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="account-card-info">
                    <div class="account-card-name">${account.name}</div>
                    <div class="account-card-status">
                        <span class="status-dot ${account.valid ? 'online' : 'offline'}"></span>
                        ${account.valid ? 'Готов' : 'Требует проверки'}
                    </div>
                </div>
                <button class="account-card-remove" data-id="${account.id}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
        
        accountList.innerHTML = accountsHtml;
        
        // Добавляем обработчики выбора аккаунта
        accountList.querySelectorAll('.account-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.account-card-remove')) {
                    const accountId = card.dataset.id;
                    this.selectAccount(accountId);
                }
            });
        });
        
        // Добавляем обработчики удаления аккаунта
        accountList.querySelectorAll('.account-card-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const accountId = btn.dataset.id;
                this.removeAccount(accountId);
            });
        });
        
        // Обновляем информацию о выбранном аккаунте
        if (this.selectedAccount) {
            this.updateAccountInfoPanel(this.selectedAccount);
        }
    }
    
    static async selectAccount(accountId) {
        const account = this.accounts.find(acc => acc.id === accountId);
        if (!account) return;
        
        this.selectedAccount = account;
        this.updateAccountsList();
        this.updateUploadButton();
        
        // Обновляем UI
        document.getElementById('currentAccountName').textContent = account.name;
        
        // Показываем информацию об аккаунте
        this.updateSelectedAccountDetails(account);
        
        // Проверяем валидность cookie
        await this.validateAccount(account);
        
        // Загружаем группы для этого аккаунта
        await this.loadGroupsForAccount(account);
        
        this.logMessage(`Выбран аккаунт: ${account.name}`);
    }
    
    static async validateAccount(account) {
        try {
            const result = await window.electronAPI.robloxApi({
                endpoint: 'https://users.roblox.com/v1/users/authenticated',
                cookie: account.cookie
            });
            
            if (result.success) {
                account.valid = true;
                account.userId = result.data.id;
                account.username = result.data.name;
                this.updateAccountsList();
                this.logMessage(`✅ Аккаунт ${account.name} проверен`, 'success');
            } else {
                account.valid = false;
                this.updateAccountsList();
                this.logMessage(`⚠ Аккаунт ${account.name} не доступен`, 'warning');
            }
        } catch (error) {
            account.valid = false;
            this.updateAccountsList();
            this.logMessage(`❌ Ошибка проверки ${account.name}`, 'error');
        }
    }
    
    static async loadGroupsForAccount(account) {
        if (!account.valid || !account.userId) return;
        
        try {
            const result = await window.electronAPI.robloxApi({
                endpoint: `https://groups.roblox.com/v2/users/${account.userId}/groups/roles`,
                cookie: account.cookie
            });
            
            if (result.success) {
                const groups = result.data.data
                    .filter(g => g.role.rank === 255)
                    .map(g => g.group);
                
                this.populateGroupSelect(groups);
                this.logMessage(`Загружено ${groups.length} групп для ${account.name}`);
            }
        } catch (error) {
            console.error('Error loading groups for account:', error);
        }
    }
    
    static populateGroupSelect(groups) {
        const select = document.getElementById('uploadGroup');
        select.innerHTML = '<option value="">Выберите группу</option>';
        
        groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = `${group.name} (${group.memberCount?.toLocaleString() || 0} участников)`;
            select.appendChild(option);
        });
    }
    
    static updateAccountInfoPanel(account) {
        const panel = document.getElementById('accountInfoPanel');
        
        if (!account) {
            panel.innerHTML = `
                <div class="account-info-empty">
                    <i class="fas fa-info-circle"></i>
                    <p>Выберите аккаунт для загрузки</p>
                </div>
            `;
            return;
        }
        
        panel.innerHTML = `
            <div class="account-info-content">
                <div class="account-info-header">
                    <h4>${account.name}</h4>
                    <span class="account-status-badge ${account.valid ? 'valid' : 'invalid'}">
                        ${account.valid ? '✓ Готов' : '✗ Требует проверки'}
                    </span>
                </div>
                ${account.username ? `
                    <div class="account-info-row">
                        <span class="info-label">Username:</span>
                        <span class="info-value">${account.username}</span>
                    </div>
                ` : ''}
                <div class="account-info-row">
                    <span class="info-label">Статус:</span>
                    <span class="info-value">${account.valid ? 'Активен' : 'Не проверен'}</span>
                </div>
            </div>
        `;
    }
    
    static updateSelectedAccountDetails(account) {
        const details = document.getElementById('selectedAccountDetails');
        
        if (!account) {
            details.innerHTML = `
                <div class="account-empty-state">
                    <i class="fas fa-user-plus"></i>
                    <p>Выберите или добавьте аккаунт</p>
                </div>
            `;
            return;
        }
        
        details.innerHTML = `
            <div class="selected-account-details">
                <div class="selected-account-avatar">
                    <i class="fas fa-user-circle"></i>
                </div>
                <div class="selected-account-info">
                    <div class="selected-account-name">${account.name}</div>
                    <div class="selected-account-username">${account.username || 'Не указан'}</div>
                    <div class="selected-account-status">
                        <span class="status-indicator ${account.valid ? 'active' : 'inactive'}"></span>
                        ${account.valid ? 'Готов к загрузке' : 'Требует проверки'}
                    </div>
                </div>
                <div class="selected-account-stats">
                    <div class="stat-item">
                        <div class="stat-label">Загружено</div>
                        <div class="stat-value">${account.uploaded || 0}</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    static showAddAccountModal() {
        document.getElementById('accountModal').style.display = 'flex';
        document.getElementById('newAccountName').value = '';
        document.getElementById('newAccountCookie').value = '';
        document.getElementById('newAccountName').focus();
    }
    
    static hideModal() {
        document.getElementById('accountModal').style.display = 'none';
    }
    
    static async saveAccount() {
        const name = document.getElementById('newAccountName').value.trim();
        const cookie = document.getElementById('newAccountCookie').value.trim();
        
        if (!name || !cookie) {
            this.app.showNotification('Ошибка', 'Заполните все поля', 'error');
            return;
        }
        
        if (!cookie.includes('_|WARNING:')) {
            if (!confirm('Cookie не содержит стандартного формата Roblox. Продолжить?')) {
                return;
            }
        }
        
        const newAccount = {
            id: `twink_${Date.now()}`,
            name: name,
            cookie: cookie,
            valid: false,
            uploaded: 0
        };
        
        this.accounts.push(newAccount);
        this.saveAccounts();
        this.hideModal();
        
        // Выбираем новый аккаунт
        await this.selectAccount(newAccount.id);
        
        this.app.showNotification('Успех', 'Аккаунт добавлен', 'success');
        this.logMessage(`Добавлен аккаунт: ${name}`);
    }
    
    static removeAccount(accountId) {
        const account = this.accounts.find(acc => acc.id === accountId);
        if (!account) return;
        
        if (confirm(`Удалить аккаунт "${account.name}"?`)) {
            this.accounts = this.accounts.filter(acc => acc.id !== accountId);
            this.saveAccounts();
            
            if (this.selectedAccount?.id === accountId) {
                this.selectedAccount = this.accounts.length > 0 ? this.accounts[0] : null;
                if (this.selectedAccount) {
                    this.selectAccount(this.selectedAccount.id);
                } else {
                    this.updateAccountsList();
                    this.updateSelectedAccountDetails(null);
                    document.getElementById('currentAccountName').textContent = 'Не выбран';
                }
            }
            
            this.app.showNotification('Успех', 'Аккаунт удален', 'success');
            this.logMessage(`Удален аккаунт: ${account.name}`, 'warning');
        }
    }
    
    // ======== ОСНОВНАЯ ЛОГИКА ЗАГРУЗКИ ========
    
    static updateUploadButton() {
        const startBtn = document.getElementById('startUpload');
        const hasFiles = this.uploadFiles.length > 0;
        const hasGroup = !!document.getElementById('uploadGroup').value;
        const hasAccount = this.selectedAccount && this.selectedAccount.valid;
        
        startBtn.disabled = !(hasFiles && hasGroup && hasAccount && !this.isUploading);
    }
    
    static updateTotalCost() {
        const price = parseInt(document.getElementById('uploadPrice').value) || 5;
        const totalCost = this.uploadFiles.length * price;
        
        document.getElementById('totalCost').textContent = `${totalCost} R$`;
        document.getElementById('totalFiles').textContent = this.uploadFiles.length;
    }
    
    static async startUpload() {
        const name = document.getElementById('uploadName').value.trim();
        const description = document.getElementById('uploadDescription').value.trim();
        const price = parseInt(document.getElementById('uploadPrice').value) || 5;
        const groupId = document.getElementById('uploadGroup').value;
        const clothingType = document.querySelector('input[name="clothingType"]:checked').value;
        
        if (!name) {
            this.app.showNotification('Ошибка', 'Введите название одежды', 'error');
            return;
        }
        
        if (!groupId) {
            this.app.showNotification('Ошибка', 'Выберите группу', 'error');
            return;
        }
        
        if (!this.selectedAccount) {
            this.app.showNotification('Ошибка', 'Выберите аккаунт', 'error');
            return;
        }
        
        // Подтверждение
        const totalCost = this.uploadFiles.length * price;
        const confirmMessage = `
            Загрузить ${this.uploadFiles.length} файлов в Roblox?
            
            Аккаунт: ${this.selectedAccount.name}
            Тип: ${clothingType}
            Название: ${name}
            
            Общая стоимость: ${totalCost} Robux
            (${price} Robux за каждый файл)
        `;
        
        if (!confirm(confirmMessage.replace(/\n/g, '\n'))) {
            return;
        }
        
        this.isUploading = true;
        this.currentUploadIndex = 0;
        this.uploadStats = {
            total: this.uploadFiles.length,
            success: 0,
            failed: 0
        };
        
        this.updateUploadButton();
        this.updateProgress(0);
        
        // Запускаем загрузку
        this.performUpload({
            name,
            description,
            price,
            groupId,
            clothingType
        });
    }
    
    static async performUpload(params) {
        this.logMessage(`Начало загрузки ${this.uploadFiles.length} файлов через аккаунт ${this.selectedAccount.name}`, 'info');
        
        for (let i = 0; i < this.uploadFiles.length; i++) {
            if (!this.isUploading) break;
            
            this.currentUploadIndex = i;
            const file = this.uploadFiles[i];
            const filename = this.getFileName(file);
            
            // Обновляем прогресс
            this.updateProgress(i + 1);
            this.updateFileStatus(i, 'uploading', 'Загрузка...');
            
            this.logMessage(`Загрузка ${i + 1}/${this.uploadFiles.length}: ${filename}`);
            
            try {
                const result = await this.uploadSingleFile(file, {
                    ...params,
                    index: i,
                    total: this.uploadFiles.length
                });
                
                if (result.success) {
                    this.uploadStats.success++;
                    this.selectedAccount.uploaded = (this.selectedAccount.uploaded || 0) + 1;
                    this.updateFileStatus(i, 'success', 'Успешно');
                    this.updateSelectedAccountDetails(this.selectedAccount);
                    this.logMessage(`✅ ${filename} загружен успешно (ID: ${result.assetId})`, 'success');
                } else {
                    this.uploadStats.failed++;
                    this.updateFileStatus(i, 'failed', 'Ошибка');
                    this.logMessage(`❌ ${filename}: ${result.error}`, 'error');
                }
                
            } catch (error) {
                this.uploadStats.failed++;
                this.updateFileStatus(i, 'failed', 'Ошибка');
                this.logMessage(`❌ ${filename}: ${error.message}`, 'error');
            }
            
            // Пауза между загрузками (3 секунды)
            if (this.isUploading && i < this.uploadFiles.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        // Завершение
        this.isUploading = false;
        this.updateUploadButton();
        
        this.logMessage(
            `Загрузка завершена. Успешно: ${this.uploadStats.success}, Ошибок: ${this.uploadStats.failed}`,
            'info'
        );
        
        this.app.showNotification(
            'Загрузка завершена',
            `Загружено ${this.uploadStats.success} из ${this.uploadStats.total} файлов через ${this.selectedAccount.name}`,
            this.uploadStats.success > 0 ? 'success' : 'error'
        );
        
        // Сохраняем обновленную статистику
        this.saveAccounts();
    }
    
    static async uploadSingleFile(filePath, params) {
        try {
            const filename = this.getFileName(filePath);
            
            console.log(`[Uploader] Начинаю загрузку через ${this.selectedAccount.name}: ${filename}`);
            
            // Загружаем одежду
            const uploadData = {
                cookie: this.selectedAccount.cookie,
                imagePath: filePath,
                name: params.name,
                description: params.description,
                clothingType: params.clothingType,
                price: params.price || 5,
                groupId: params.groupId || null
            };
            
            const uploadResult = await window.electronAPI.uploadClothing(uploadData);
            
            if (!uploadResult.success) {
                throw new Error(`Ошибка загрузки: ${uploadResult.error}`);
            }
            
            const assetId = uploadResult.assetId;
            console.log(`[Uploader] Одежда загружена, Asset ID: ${assetId}`);
            
            // Пауза перед установкой цены
            this.logMessage(`Пауза перед установкой цены...`, 'info');
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Устанавливаем цену
            console.log(`[Uploader] Устанавливаю цену для ${assetId}: ${params.price} R$`);
            
            const priceResult = await window.electronAPI.setClothingPrice({
                cookie: this.selectedAccount.cookie,
                assetId: assetId,
                name: params.name,
                description: params.description,
                price: params.price || 5,
                groupId: params.groupId || null
            });
            
            if (priceResult.success) {
                this.logMessage(`✅ Цена ${params.price} R$ установлена для ${filename}`, 'success');
                return {
                    success: true,
                    assetId: assetId,
                    message: 'Одежда загружена и цена установлена'
                };
            } else {
                this.logMessage(`⚠ Одежда загружена, но цена не установлена: ${priceResult.error}`, 'warning');
                return {
                    success: false,
                    assetId: assetId,
                    error: `Одежда загружена (ID: ${assetId}), но не удалось установить цену: ${priceResult.error}`,
                    partialSuccess: true
                };
            }
            
        } catch (error) {
            console.error('[Uploader] Ошибка в uploadSingleFile:', error);
            this.logMessage(`❌ Ошибка: ${error.message}`, 'error');
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    static stopUpload() {
        this.isUploading = false;
        this.logMessage('Загрузка остановлена пользователем', 'warning');
    }
    
    static updateProgress(current) {
        const total = this.uploadStats.total;
        const percent = total > 0 ? (current / total) * 100 : 0;
        
        document.getElementById('progressFill').style.width = `${percent}%`;
        document.getElementById('progressText').textContent = 
            `Загружено: ${current}/${total} (${percent.toFixed(1)}%)`;
        
        document.getElementById('uploadedFiles').textContent = this.uploadStats.success;
        document.getElementById('failedFiles').textContent = this.uploadStats.failed;
    }
    
    static updateFileStatus(index, status, message) {
        const statusElement = document.getElementById(`fileStatus${index}`);
        if (statusElement) {
            const statusClass = `status-${status}`;
            statusElement.innerHTML = `<span class="${statusClass}">${message}</span>`;
        }
    }
    
    static logMessage(message, type = 'info') {
        const log = document.getElementById('uploadLog');
        const timestamp = new Date().toLocaleTimeString();
        
        const icons = {
            info: 'fa-info-circle',
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-triangle'
        };
        
        const logEntry = `
            <div class="log-entry ${type}">
                <i class="fas ${icons[type] || 'fa-info-circle'}"></i>
                <div class="log-content">
                    <div class="log-time">${timestamp}</div>
                    <div class="log-message">${message}</div>
                </div>
            </div>
        `;
        
        log.insertAdjacentHTML('afterbegin', logEntry);
        
        // Ограничиваем количество записей
        const entries = log.querySelectorAll('.log-entry');
        if (entries.length > 100) {
            entries[entries.length - 1].remove();
        }
        
        // Автоскролл
        log.scrollTop = 0;
    }
    
    static removeFile(index) {
        this.uploadFiles.splice(index, 1);
        this.updateFileList();
        this.updateUploadButton();
        this.updateTotalCost();
        this.logMessage(`Файл удален`, 'info');
    }
    
    static getFileName(path) {
        return path.split('/').pop().split('\\').pop();
    }
}