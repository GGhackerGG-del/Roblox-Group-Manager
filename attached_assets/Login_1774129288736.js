class LoginComponent {
    static render() {
        return `
            <div class="login-page">
                <div class="login-container">
                    <div class="login-card card">
                        <div class="card-header">
                            <h1 class="page-title">
                                <i class="fas fa-lock"></i> Авторизация
                            </h1>
                        </div>
                        
                        <div class="card-body">
                            <div class="form-group">
                                <label class="form-label">
                                    .ROBLOSECURITY Cookie
                                </label>
                                <textarea 
                                    id="cookieInput" 
                                    class="form-input" 
                                    rows="4"
                                    placeholder="Вставьте ваш cookie здесь..."
                                    spellcheck="false"
                                ></textarea>
                                <div class="form-hint">
                                    <i class="fas fa-info-circle"></i>
                                    Для получения cookie откройте браузер и авторизуйтесь на Roblox.com
                                </div>
                            </div>
                            
                            <div class="form-actions">
                                <div class="checkbox-container">
                                    <input type="checkbox" id="rememberMe" checked>
                                    <label for="rememberMe" class="checkbox-label">
                                        Запомнить меня на этом устройстве
                                    </label>
                                </div>
                                
                                <button id="loginBtn" class="btn btn-primary">
                                    <i class="fas fa-sign-in-alt"></i> Войти
                                </button>
                            </div>
                        </div>
                        
                        <div class="card-footer">
                            <div class="login-info">
                                <p><strong>Внимание:</strong> Приложение использует cookie только для взаимодействия с Roblox API. Все данные хранятся локально.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    static init(app) {
        console.log('Initializing LoginComponent...');
        
        this.app = app;
        
        const loginBtn = document.getElementById('loginBtn');
        const cookieInput = document.getElementById('cookieInput');
        
        if (!loginBtn || !cookieInput) {
            console.error('Login elements not found!');
            return;
        }
        
        loginBtn.addEventListener('click', () => this.handleLogin());
        
        // Автофокус на поле ввода
        cookieInput.focus();
        
        console.log('LoginComponent initialized successfully');
    }
    
    static async handleLogin() {
        const cookieInput = document.getElementById('cookieInput');
        const loginBtn = document.getElementById('loginBtn');
        const rememberMe = document.getElementById('rememberMe');
        
        const cookie = cookieInput.value.trim();
        
        if (!cookie) {
            this.app.showNotification('Ошибка', 'Введите .ROBLOSECURITY cookie', 'error');
            cookieInput.focus();
            return;
        }
        
        // Блокируем кнопку
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Проверка...';
        
        try {
            console.log('Validating cookie...');
            
            // Проверяем валидность cookie через Roblox API
            const result = await window.electronAPI.robloxApi({
                endpoint: 'https://users.roblox.com/v1/users/authenticated',
                cookie: cookie
            });
            
            if (result.success) {
                const userData = result.data;
                console.log('Login successful for user:', userData.name);
                
                // Сохраняем в приложении
                await this.app.login(cookie, userData);
                
                // Сохраняем в localStorage если нужно
                if (rememberMe.checked) {
                    localStorage.setItem('remembered_cookie', cookie);
                }
                
            } else {
                console.error('API error:', result.error);
                throw new Error('Неверный cookie или проблема с подключением');
            }
            
        } catch (error) {
            console.error('Login error:', error);
            this.app.showNotification('Ошибка', error.message || 'Не удалось войти в систему', 'error');
        } finally {
            // Разблокируем кнопку
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Войти';
        }
    }
}