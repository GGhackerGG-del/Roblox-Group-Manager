// Инициализация приложения
class RobloxGroupManagerApp {
    constructor() {
        this.currentUser = null;
        this.currentGroup = null;
        this.groups = [];
        this.cache = new Map();
        this.cookie = null;
        this.isLoggedIn = false;
        this.notificationQueue = [];
        this.isShowingNotification = false;
        this.currentRoute = null;
        
        console.log('App initialized');
        this.init();

    }
    
    async init() {
        console.log('Starting initialization...');
        
        // Инициализация темной темы
        this.initTheme();
        
        // Инициализация навигации
        this.initNavigation();
        
        // Загрузка сохраненной сессии
        await this.loadSession();
        
        // Инициализация шрифтов
        this.loadFonts();
        
        console.log('Initialization complete');
    }
    
    initTheme() {
        // Устанавливаем темную тему по умолчанию
        document.documentElement.setAttribute('data-theme', 'dark');
        
        // Создаем стили для улучшенных шрифтов
        const style = document.createElement('style');
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
            
            * {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                letter-spacing: -0.01em;
            }
            
            h1, h2, h3, h4, h5, h6 {
                font-weight: 600;
                letter-spacing: -0.02em;
                line-height: 1.2;
            }
            
            .nav-item {
                letter-spacing: 0.01em;
            }
            
            .btn {
                letter-spacing: 0.02em;
                font-weight: 500;
            }
            
            .stat-value {
                letter-spacing: -0.03em;
            }
            
            .form-input, input, textarea, select {
                letter-spacing: 0.01em;
            }
        `;
        document.head.appendChild(style);
    }
    
    loadFonts() {
        // Предзагрузка шрифтов
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = 'https://fonts.gstatic.com';
        document.head.appendChild(link);
        
        const fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
        document.head.appendChild(fontLink);
    }
    
    initNavigation() {
        console.log('Initializing navigation...');
        
        const navItems = [
            { id: 'login', icon: 'fas fa-sign-in-alt', text: 'Авторизация', showWhen: 'loggedOut' },
            { id: 'dashboard', icon: 'fas fa-home', text: 'Дашборд', showWhen: 'loggedIn' },
            { id: 'groups', icon: 'fas fa-users', text: 'Мои группы', showWhen: 'loggedIn' },
            { id: 'stats', icon: 'fas fa-chart-bar', text: 'Статистика', showWhen: 'loggedIn' },
            { id: 'clothing', icon: 'fas fa-tshirt', text: 'Редактор одежды', showWhen: 'loggedIn' },
            { id: 'upload', icon: 'fas fa-cloud-upload-alt', text: 'Автозагрузка', showWhen: 'loggedIn' },
            { id: 'settings', icon: 'fas fa-cog', text: 'Настройки', showWhen: 'loggedIn' },
            { id: 'logout', icon: 'fas fa-sign-out-alt', text: 'Выйти', showWhen: 'loggedIn' }
        ];
        
        const navMenu = document.querySelector('.nav-menu');
        if (!navMenu) {
            console.error('Nav menu not found!');
            return;
        }
        
        // Очищаем меню
        navMenu.innerHTML = '';
        
        // Фильтруем элементы в зависимости от состояния входа
        const filteredItems = navItems.filter(item => {
            if (item.showWhen === 'loggedIn' && !this.isLoggedIn) return false;
            if (item.showWhen === 'loggedOut' && this.isLoggedIn) return false;
            return true;
        });
        
        // Добавляем отступы между элементами
        filteredItems.forEach(item => {
            const navItem = document.createElement('a');
            navItem.href = '#';
            navItem.className = 'nav-item';
            navItem.dataset.page = item.id;
            navItem.innerHTML = `
                <i class="${item.icon} nav-icon"></i>
                <span class="nav-text">${item.text}</span>
            `;
            
            // Добавляем отступы
            navItem.style.margin = '8px 0';
            navItem.style.padding = '16px 20px';
            
            navMenu.appendChild(navItem);
        });
        
        console.log(`Navigation initialized with ${filteredItems.length} items`);
        
        // Обработка кликов
        navMenu.addEventListener('click', (e) => {
            const navItem = e.target.closest('.nav-item');
            if (navItem) {
                e.preventDefault();
                const page = navItem.dataset.page;
                console.log(`Navigating to: ${page}`);
                this.navigateTo(page);
            }
        });
    }
    
    async navigateTo(page) {
        console.log(`Navigating to page: ${page}`);
        
        // Специальная обработка для logout
        if (page === 'logout') {
            await this.logout();
            return;
        }
        
        // Обновляем активный элемент навигации
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            item.style.background = 'transparent';
        });
        
        const activeItem = document.querySelector(`[data-page="${page}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            activeItem.style.background = 'var(--gradient)';
        }
        
        // Загружаем страницу
        await this.loadPage(page);
    }
    
    async loadPage(page) {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) {
        console.error('Main content not found!');
        return;
    }
    
    // Анимация исчезновения
    mainContent.classList.add('animate__animated', 'animate__fadeOut');
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Загружаем контент
    switch(page) {
        case 'login':
            if (!LoginComponent) {
                console.error('LoginComponent not found!');
                return;
            }
            mainContent.innerHTML = LoginComponent.render();
            LoginComponent.init(this);
            break;
            
        case 'dashboard':
            if (!DashboardComponent) {
                console.error('DashboardComponent not found!');
                return;
            }
            mainContent.innerHTML = DashboardComponent.render();
            DashboardComponent.init(this);
            break;
            
        case 'groups':
            if (!GroupsComponent) {
                console.error('GroupsComponent not found!');
                return;
            }
            mainContent.innerHTML = GroupsComponent.render();
            await GroupsComponent.init(this);
            break;
            
        case 'stats':
            if (!StatsComponent) {
                console.error('StatsComponent not found!');
                return;
            }
            mainContent.innerHTML = StatsComponent.render(this.currentGroup);
            StatsComponent.init(this);
            break;
            
        case 'clothing':
            if (!ClothingEditorComponent) {
                console.error('ClothingEditorComponent not found!');
                return;
            }
            mainContent.innerHTML = ClothingEditorComponent.render();
            ClothingEditorComponent.init(this);
            break;
            
        case 'upload':
            if (!UploaderComponent) {
                console.error('UploaderComponent not found!');
                return;
            }
            mainContent.innerHTML = UploaderComponent.render();
            UploaderComponent.init(this);
            break;
            
        case 'settings':
            if (!SettingsComponent) {
                console.error('SettingsComponent not found!');
                return;
            }
            mainContent.innerHTML = SettingsComponent.render();
            SettingsComponent.init(this);
            break;
            
        default:
            mainContent.innerHTML = '<div class="error-page"><h1>Страница не найдена</h1></div>';
    }
    
    // Анимация появления
    mainContent.classList.remove('animate__fadeOut');
    mainContent.classList.add('animate__fadeIn');
    
    setTimeout(() => {
        mainContent.classList.remove('animate__animated', 'animate__fadeIn');
    }, 500);
    
    console.log(`Page ${page} loaded successfully`);
}
    
    async loadSession() {
        try {
            console.log('Loading session...');
            
            // Для демонстрации - сразу показываем логин
            // В реальном приложении здесь будет проверка сохраненной сессии
            this.isLoggedIn = false;
            this.initNavigation();
            
            // Всегда показываем страницу логина при запуске
            await this.loadPage('login');
            
        } catch (error) {
            console.error('Error loading session:', error);
            this.isLoggedIn = false;
            this.initNavigation();
            await this.loadPage('login');
        }
    }
    
    async login(cookie, userData) {
        console.log('Logging in...');
        
        try {
            this.cookie = cookie;
            this.currentUser = userData;
            this.isLoggedIn = true;
            
            // Обновляем навигацию
            this.initNavigation();
            
            // Показываем уведомление
            this.showNotification('Успех', `Добро пожаловать, ${userData.name}!`, 'success');
            
            // Переходим на дашборд
            setTimeout(() => {
                this.navigateTo('dashboard');
            }, 1000);
            
            console.log('Login successful');
            
        } catch (error) {
            console.error('Login error:', error);
            this.showNotification('Ошибка', 'Не удалось войти в систему', 'error');
        }
    }
    
    async logout() {
        console.log('Logging out...');
        
        this.cookie = null;
        this.currentUser = null;
        this.currentGroup = null;
        this.groups = [];
        this.isLoggedIn = false;
        
        // Очищаем кэш
        this.cache.clear();
        
        // Обновляем навигацию
        this.initNavigation();
        
        // Переходим на страницу логина
        await this.navigateTo('login');
        
        this.showNotification('Информация', 'Вы вышли из системы', 'info');
        
        console.log('Logout successful');
    }
    
    showNotification(title, message, type = 'info') {
        const notifications = document.getElementById('notifications');
        if (!notifications) {
            console.warn('Notifications container not found');
            return;
        }
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        `;
        
        notifications.appendChild(notification);
        
        // Автоудаление через 5 секунд
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
        
        console.log(`Notification: ${title} - ${message}`);
    }
}

// Глобальная функция для отладки
window.debugApp = function() {
    console.log('App debug info:', window.app);
    console.log('Current user:', window.app?.currentUser);
    console.log('Is logged in:', window.app?.isLoggedIn);
    console.log('Cookie:', window.app?.cookie ? 'Present' : 'Not present');
};

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    
    // Добавляем глобальные стили для улучшения отступов
    const globalStyles = document.createElement('style');
    globalStyles.textContent = `
        /* Улучшенные отступы для интерфейса */
        .btn {
            margin: 4px 8px;
            padding: 12px 24px !important;
        }
        
        .form-group {
            margin-bottom: 24px !important;
        }
        
        .nav-item {
            margin: 6px 0 !important;
            border-radius: 10px;
            transition: all 0.2s ease;
        }
        
        .nav-item:hover {
            transform: translateX(5px);
        }
        
        .nav-item.active {
            box-shadow: 0 4px 20px rgba(99, 102, 241, 0.3);
        }
        
        .card {
            margin-bottom: 24px;
            padding: 28px;
        }
        
        .stat-card {
            margin: 12px;
        }
        
        /* Улучшенные шрифты */
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        
        h1 {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 1.5rem;
        }
        
        h2 {
            font-size: 2rem;
            font-weight: 600;
            margin-bottom: 1.2rem;
        }
        
        h3 {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 1rem;
        }
        
        p {
            line-height: 1.6;
            margin-bottom: 1rem;
        }
        
        /* Улучшенные формы */
        .form-input {
            padding: 14px 16px;
            font-size: 15px;
            line-height: 1.5;
        }
        
        /* Улучшенные кнопки */
        .btn {
            font-size: 15px;
            font-weight: 500;
            line-height: 1.5;
            border-radius: 12px;
            min-height: 48px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        
        /* Улучшенные карточки */
        .group-card {
            margin: 12px 0;
            padding: 24px;
        }
        
        /* Улучшенные таблицы */
        .data-table td, .data-table th {
            padding: 16px 20px;
        }
    `;
    document.head.appendChild(globalStyles);
    
    // Создаем и запускаем приложение
    window.app = new RobloxGroupManagerApp();
    
    console.log('App initialized successfully');
});