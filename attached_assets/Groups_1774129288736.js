class GroupsComponent {
    static render() {
        return `
            <div class="groups-page">
                <!-- Шапка страницы -->
                <div class="page-header">
                    <div class="header-left">
                        <h1 class="page-title">
                            <i class="fas fa-users"></i> Мои группы Roblox
                        </h1>
                        <div class="page-subtitle">
                            <p>Управление группами, которыми вы владеете</p>
                        </div>
                    </div>
                    <div class="header-actions">
                        <button id="refreshGroups" class="btn btn-primary">
                            <i class="fas fa-sync-alt"></i> Обновить список
                        </button>
                    </div>
                </div>

                <!-- Индикатор загрузки -->
                <div id="loadingContainer" class="loading-container" style="display: none;">
                    <div class="loading-content">
                        <div class="loading-spinner">
                            <i class="fas fa-spinner fa-spin"></i>
                        </div>
                        <div class="loading-text">
                            <h3>Загрузка ваших групп...</h3>
                            <p id="loadingMessage">Получение данных пользователя...</p>
                        </div>
                    </div>
                </div>

                <!-- Основной контейнер для групп -->
                <div id="groupsContainer" class="groups-container">
                    <div class="empty-state">
                        <i class="fas fa-users"></i>
                        <h3>Группы не загружены</h3>
                        <p>Нажмите кнопку "Обновить список" для загрузки групп</p>
                    </div>
                </div>
            </div>
        `;
    }

    static async init(app) {
        console.log('Initializing GroupsComponent...');
        
        this.app = app;
        this.groups = [];
        this.userId = null;
        
        this.bindEvents();
        
        // Автоматически загружаем группы при инициализации
        setTimeout(() => {
            this.loadGroups();
        }, 500);
        
        console.log('GroupsComponent initialized successfully');
    }

    static bindEvents() {
        // Кнопка обновления
        document.getElementById('refreshGroups')?.addEventListener('click', () => {
            this.loadGroups();
        });
    }

    static async loadGroups() {
        console.log('Loading groups...');
        
        this.showLoading();
        this.hideGroupsContainer();
        this.updateLoadingMessage('Получение данных пользователя...');

        try {
            // 1. Сначала получаем ID пользователя, если его нет
            if (!this.userId && this.app.cookie) {
                this.updateLoadingMessage('Авторизация...');
                
                const userResponse = await window.electronAPI.robloxApi({
                    endpoint: 'https://users.roblox.com/v1/users/authenticated',
                    cookie: this.app.cookie
                });

                if (!userResponse.success) {
                    throw new Error('Не удалось авторизоваться');
                }

                this.userId = userResponse.data.id;
                this.app.currentUser = userResponse.data;
                console.log('User ID obtained:', this.userId);
            }

            if (!this.userId) {
                throw new Error('Необходима авторизация');
            }

            // 2. Получаем группы пользователя
            this.updateLoadingMessage('Загрузка списка групп...');
            
            const result = await window.electronAPI.robloxApi({
                endpoint: `https://groups.roblox.com/v2/users/${this.userId}/groups/roles`,
                cookie: this.app.cookie
            });

            if (result.success) {
                const allGroups = result.data.data || [];
                console.log('Raw groups data:', allGroups);
                
                // Фильтруем только группы, где пользователь владелец (ранг 255)
                this.groups = allGroups
                    .filter(groupInfo => {
                        const isOwner = groupInfo.role?.rank === 255;
                        console.log(`Group ${groupInfo.group?.name}: rank ${groupInfo.role?.rank}, isOwner: ${isOwner}`);
                        return isOwner;
                    })
                    .map(groupInfo => ({
                        id: groupInfo.group.id,
                        name: groupInfo.group.name,
                        description: groupInfo.group.description || '',
                        memberCount: groupInfo.group.memberCount || 0,
                        hasVerifiedBadge: groupInfo.group.hasVerifiedBadge || false,
                        ownerBadge: true
                    }));

                console.log('Filtered owner groups:', this.groups);

                // Обрабатываем и отображаем группы
                this.displayGroups();
                
                // Показываем уведомление
                if (this.groups.length > 0) {
                    this.app.showNotification(
                        'Успех',
                        `Загружено ${this.groups.length} групп`,
                        'success'
                    );
                } else {
                    this.app.showNotification(
                        'Информация',
                        'Вы не являетесь владельцем ни одной группы',
                        'info'
                    );
                }
            } else {
                throw new Error('Не удалось загрузить группы');
            }

        } catch (error) {
            console.error('Error loading groups:', error);
            this.showErrorState(error.message || 'Не удалось загрузить группы');
            this.app.showNotification(
                'Ошибка',
                error.message || 'Не удалось загрузить группы',
                'error'
            );
        } finally {
            this.hideLoading();
        }
    }

    static updateLoadingMessage(message) {
        const messageElement = document.getElementById('loadingMessage');
        if (messageElement) {
            messageElement.textContent = message;
        }
    }

    static displayGroups() {
        const container = document.getElementById('groupsContainer');
        
        if (this.groups.length === 0) {
            this.showEmptyState();
            return;
        }

        container.innerHTML = `
            <div class="groups-grid">
                ${this.groups.map(group => this.renderGroupCard(group)).join('')}
            </div>
        `;
        
        this.addCardEventListeners();
        this.showGroupsContainer();
    }

    static renderGroupCard(group) {
        const memberCount = group.memberCount?.toLocaleString() || '0';
        const initials = group.name.substring(0, 2).toUpperCase();
        const description = group.description || 'Нет описания';
        
        // Обрезаем длинное описание
        const shortDescription = description.length > 100 
            ? description.substring(0, 100) + '...' 
            : description;
        
        return `
            <div class="group-card" data-group-id="${group.id}">
                <div class="card-header">
                    <div class="group-avatar">
                        <div class="avatar-initials">
                            ${initials}
                        </div>
                        ${group.hasVerifiedBadge ? 
                            '<div class="verified-badge" title="Проверенная группа"><i class="fas fa-check"></i></div>' : 
                            ''
                        }
                    </div>
                    <div class="group-info">
                        <h3 class="group-name">${group.name}</h3>
                        <div class="group-stats">
                            <span class="stat">
                                <i class="fas fa-users"></i>
                                ${memberCount} участников
                            </span>
                            <span class="badge owner">
                                <i class="fas fa-crown"></i> Владелец
                            </span>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <p class="group-description" title="${description}">
                        ${shortDescription}
                    </p>
                </div>
                <div class="card-footer">
                    <button class="btn btn-primary view-stats" data-group-id="${group.id}">
                        <i class="fas fa-chart-bar"></i> Статистика
                    </button>
                    <button class="btn btn-secondary view-members" data-group-id="${group.id}">
                        <i class="fas fa-users"></i> Участники
                    </button>
                </div>
            </div>
        `;
    }

    static addCardEventListeners() {
        document.querySelectorAll('.group-card').forEach(card => {
            const groupId = card.dataset.groupId;
            const group = this.groups.find(g => g.id == groupId);
            
            if (!group) return;

            // Кнопка статистики
            card.querySelector('.view-stats')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.app.currentGroup = group;
                this.app.navigateTo('stats');
            });

            // Кнопка участников
            card.querySelector('.view-members')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.app.currentGroup = group;
                this.app.showNotification(
                    'Информация',
                    'Функция просмотра участников в разработке',
                    'info'
                );
            });

            // Клик по всей карточке
            card.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    this.app.currentGroup = group;
                    this.app.navigateTo('stats');
                }
            });
        });
    }

    static showLoading() {
        const container = document.getElementById('loadingContainer');
        if (container) {
            container.style.display = 'flex';
        }
    }

    static hideLoading() {
        const container = document.getElementById('loadingContainer');
        if (container) {
            container.style.display = 'none';
        }
    }

    static showGroupsContainer() {
        const container = document.getElementById('groupsContainer');
        if (container) {
            container.style.display = 'block';
        }
    }

    static hideGroupsContainer() {
        const container = document.getElementById('groupsContainer');
        if (container) {
            container.style.display = 'none';
        }
    }

    static showEmptyState() {
        const container = document.getElementById('groupsContainer');
        if (!container) return;
        
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users-slash"></i>
                <h3>Группы не найдены</h3>
                <p>Вы не являетесь владельцем ни одной группы Roblox</p>
                <button class="btn btn-primary" onclick="GroupsComponent.loadGroups()">
                    <i class="fas fa-redo"></i> Попробовать снова
                </button>
            </div>
        `;
        container.style.display = 'block';
    }

    static showErrorState(errorMessage) {
        const container = document.getElementById('groupsContainer');
        if (!container) return;
        
        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Ошибка загрузки</h3>
                <p>${errorMessage}</p>
                <div class="error-actions">
                    <button class="btn btn-primary" onclick="GroupsComponent.loadGroups()">
                        <i class="fas fa-redo"></i> Повторить
                    </button>
                    <button class="btn btn-secondary" onclick="app.navigateTo('login')">
                        <i class="fas fa-sign-in-alt"></i> Перезайти
                    </button>
                </div>
            </div>
        `;
        container.style.display = 'block';
    }
}

// Стили для состояний (добавьте в CSS)
const errorStateStyles = `
.error-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--accent-danger);
}

.error-state i {
    font-size: 64px;
    margin-bottom: 20px;
    opacity: 0.7;
}

.error-state h3 {
    margin-bottom: 15px;
    color: var(--accent-danger);
}

.error-state p {
    color: var(--text-tertiary);
    margin-bottom: 30px;
    max-width: 500px;
    margin-left: auto;
    margin-right: auto;
}

.error-actions {
    display: flex;
    gap: 15px;
    justify-content: center;
    flex-wrap: wrap;
}
`;

// Добавьте стили в DOM
if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = errorStateStyles;
    document.head.appendChild(style);
}