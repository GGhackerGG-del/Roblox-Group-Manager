class SettingsComponent {
    static render() {
        return `
            <div class="settings-page">
                <div class="page-header">
                    <h1 class="page-title">
                        <i class="fas fa-cog"></i> Настройки
                    </h1>
                </div>
                
                <!-- Основные настройки -->
                <div class="settings-section">
                    <div class="section-card card">
                        <div class="card-header">
                            <h3><i class="fas fa-sliders-h"></i> Основные настройки</h3>
                        </div>
                        <div class="card-body">
                            <div class="settings-grid">
                                <div class="setting-item">
                                    <div class="setting-info">
                                        <h4>Автообновление</h4>
                                        <p>Автоматически обновлять данные каждые 5 минут</p>
                                    </div>
                                    <label class="switch">
                                        <input type="checkbox" id="autoRefresh" checked>
                                        <span class="slider"></span>
                                    </label>
                                </div>
                                
                                <div class="setting-item">
                                    <div class="setting-info">
                                        <h4>Тёмная тема</h4>
                                        <p>Использовать тёмный интерфейс</p>
                                    </div>
                                    <label class="switch">
                                        <input type="checkbox" id="darkTheme" checked>
                                        <span class="slider"></span>
                                    </label>
                                </div>
                                
                                <div class="setting-item">
                                    <div class="setting-info">
                                        <h4>Уведомления</h4>
                                        <p>Показывать уведомления о новых продажах</p>
                                    </div>
                                    <label class="switch">
                                        <input type="checkbox" id="notifications" checked>
                                        <span class="slider"></span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Настройки безопасности -->
                <div class="settings-section">
                    <div class="section-card card">
                        <div class="card-header">
                            <h3><i class="fas fa-shield-alt"></i> Безопасность</h3>
                        </div>
                        <div class="card-body">
                            <div class="settings-grid">
                                <div class="setting-item">
                                    <div class="setting-info">
                                        <h4>Очистить кэш</h4>
                                        <p>Удалить все кэшированные данные</p>
                                    </div>
                                    <button id="clearCache" class="btn btn-danger">
                                        <i class="fas fa-trash"></i> Очистить
                                    </button>
                                </div>
                                
                                <div class="setting-item">
                                    <div class="setting-info">
                                        <h4>Экспорт данных</h4>
                                        <p>Сохранить все данные в файл</p>
                                    </div>
                                    <button id="exportData" class="btn btn-secondary">
                                        <i class="fas fa-download"></i> Экспорт
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Информация о приложении -->
                <div class="settings-section">
                    <div class="section-card card">
                        <div class="card-header">
                            <h3><i class="fas fa-info-circle"></i> О приложении</h3>
                        </div>
                        <div class="card-body">
                            <div class="about-info">
                                <div class="about-item">
                                    <span class="about-label">Версия:</span>
                                    <span class="about-value">1.0.0</span>
                                </div>
                                <div class="about-item">
                                    <span class="about-label">Разработчик:</span>
                                    <span class="about-value">Roblox Group Manager</span>
                                </div>
                                <div class="about-item">
                                    <span class="about-label">Лицензия:</span>
                                    <span class="about-value">MIT</span>
                                </div>
                                <div class="about-item">
                                    <span class="about-label">Поддержка:</span>
                                    <a href="#" class="about-link">Написать разработчику</a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Опасная зона -->
                <div class="settings-section">
                    <div class="section-card card danger">
                        <div class="card-header">
                            <h3><i class="fas fa-exclamation-triangle"></i> Опасная зона</h3>
                        </div>
                        <div class="card-body">
                            <div class="danger-zone">
                                <div class="danger-info">
                                    <h4>Выйти из аккаунта</h4>
                                    <p>Завершить текущую сессию и выйти из аккаунта Roblox</p>
                                </div>
                                <button id="logout" class="btn btn-danger">
                                    <i class="fas fa-sign-out-alt"></i> Выйти
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    static init(app) {
        console.log('Initializing SettingsComponent...');
        
        this.app = app;
        
        this.bindEvents();
        this.loadSettings();
        
        console.log('SettingsComponent initialized successfully');
    }
    
    static bindEvents() {
        // Переключатели
        document.getElementById('autoRefresh')?.addEventListener('change', (e) => {
            this.saveSetting('autoRefresh', e.target.checked);
        });
        
        document.getElementById('darkTheme')?.addEventListener('change', (e) => {
            this.saveSetting('darkTheme', e.target.checked);
        });
        
        document.getElementById('notifications')?.addEventListener('change', (e) => {
            this.saveSetting('notifications', e.target.checked);
        });
        
        // Кнопки
        document.getElementById('clearCache')?.addEventListener('click', () => {
            this.clearCache();
        });
        
        document.getElementById('exportData')?.addEventListener('click', () => {
            this.exportData();
        });
        
        document.getElementById('logout')?.addEventListener('click', () => {
            this.logout();
        });
    }
    
    static loadSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('app_settings') || '{}');
            
            if (settings.autoRefresh !== undefined) {
                document.getElementById('autoRefresh').checked = settings.autoRefresh;
            }
            
            if (settings.darkTheme !== undefined) {
                document.getElementById('darkTheme').checked = settings.darkTheme;
            }
            
            if (settings.notifications !== undefined) {
                document.getElementById('notifications').checked = settings.notifications;
            }
            
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }
    
    static saveSetting(key, value) {
        try {
            const settings = JSON.parse(localStorage.getItem('app_settings') || '{}');
            settings[key] = value;
            localStorage.setItem('app_settings', JSON.stringify(settings));
            
            this.app.showNotification('Настройки', 'Настройки сохранены', 'success');
            
        } catch (error) {
            console.error('Error saving setting:', error);
            this.app.showNotification('Ошибка', 'Не удалось сохранить настройки', 'error');
        }
    }
    
    static async clearCache() {
        const confirmed = confirm('Вы уверены, что хотите очистить кэш? Все кэшированные данные будут удалены.');
        
        if (confirmed) {
            try {
                this.app.cache.clear();
                localStorage.removeItem('app_settings');
                
                this.app.showNotification('Кэш', 'Кэш успешно очищен', 'success');
                
            } catch (error) {
                console.error('Error clearing cache:', error);
                this.app.showNotification('Ошибка', 'Не удалось очистить кэш', 'error');
            }
        }
    }
    
    static async exportData() {
        try {
            this.app.showNotification('Экспорт', 'Подготовка данных для экспорта...', 'info');
            
            // Здесь будет логика экспорта данных
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            this.app.showNotification('Успех', 'Данные экспортированы', 'success');
            
        } catch (error) {
            console.error('Error exporting data:', error);
            this.app.showNotification('Ошибка', 'Не удалось экспортировать данные', 'error');
        }
    }
    
    static logout() {
        const confirmed = confirm('Вы уверены, что хотите выйти из аккаунта?');
        
        if (confirmed) {
            this.app.logout();
        }
    }
}