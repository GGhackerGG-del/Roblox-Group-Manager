class DashboardComponent {
    static render() {
        return `
            <div class="dashboard-page">
                <div class="page-header">
                    <h1 class="page-title">
                        <i class="fas fa-home"></i> Дашборд
                    </h1>
                    <div class="header-actions">
                        <button id="refreshDashboard" class="btn btn-secondary">
                            <i class="fas fa-sync-alt"></i> Обновить
                        </button>
                    </div>
                </div>
                
                <!-- Информация об аккаунте -->
                <div class="account-info-section">
                    <div class="account-card card">
                        <div class="card-header">
                            <h3><i class="fas fa-user-circle"></i> Информация об аккаунте</h3>
                        </div>
                        <div class="card-body">
                            <div class="account-details" id="accountDetails">
                                <div class="loading-spinner-small">
                                    <i class="fas fa-spinner fa-spin"></i>
                                </div>
                                <p>Загрузка информации...</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Краткая статистика -->
                <div class="quick-stats-section">
                    <h3 class="section-title">
                        <i class="fas fa-chart-line"></i> Краткая статистика
                    </h3>
                    <div class="stats-grid" id="quickStatsGrid">
                        <div class="stat-card">
                            <div class="stat-header">
                                <i class="fas fa-users"></i>
                                <h4>Группы</h4>
                            </div>
                            <div class="stat-value" id="totalGroupsStat">—</div>
                            <div class="stat-trend">Всего</div>
                        </div>
                        
                        <div class="stat-card">
                            <div class="stat-header">
                                <i class="fas fa-clock"></i>
                                <h4>Pending</h4>
                            </div>
                            <div class="stat-value" id="pendingRobuxStat">—</div>
                            <div class="stat-trend">Ожидает</div>
                        </div>
                        
                        <div class="stat-card">
                            <div class="stat-header">
                                <i class="fas fa-calendar-day"></i>
                                <h4>Сегодня</h4>
                            </div>
                            <div class="stat-value" id="dailySalesStat">—</div>
                            <div class="stat-trend">Продажи</div>
                        </div>
                    </div>
                </div>
                
                <!-- Недавние группы -->
                <div class="recent-groups-section">
                    <div class="section-header">
                        <h3 class="section-title">
                            <i class="fas fa-history"></i> Ваши группы
                        </h3>
                        <button id="viewAllGroups" class="btn btn-primary">
                            <i class="fas fa-eye"></i> Все группы
                        </button>
                    </div>
                    <div class="groups-preview" id="groupsPreview">
                        <div class="loading-spinner-small">
                            <i class="fas fa-spinner fa-spin"></i>
                        </div>
                        <p>Загрузка групп...</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    static init(app) {
        console.log('Initializing DashboardComponent...');
        
        this.app = app;
        
        this.bindEvents();
        this.loadDashboardData();
        
        console.log('DashboardComponent initialized successfully');
    }
    
    static bindEvents() {
        document.getElementById('refreshDashboard')?.addEventListener('click', () => {
            this.loadDashboardData();
        });
        
        document.getElementById('viewAllGroups')?.addEventListener('click', () => {
            this.app.navigateTo('groups');
        });
    }
    
    static async loadDashboardData() {
        console.log('Loading dashboard data...');
        
        // Обновляем информацию об аккаунте
        this.updateAccountInfo();
        
        // Загружаем данные
        await Promise.all([
            this.loadUserGroups(),
            this.loadAccountStats()
        ]);
        
        console.log('Dashboard data loaded');
    }
    
    static updateAccountInfo() {
        const user = this.app.currentUser;
        if (!user) return;
        
        const accountDetails = document.getElementById('accountDetails');
        
        accountDetails.innerHTML = `
            <div class="account-info-grid">
                <div class="info-item">
                    <span class="info-label">Имя пользователя:</span>
                    <span class="info-value">${user.name}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">ID пользователя:</span>
                    <span class="info-value">${user.id}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Текущий статус:</span>
                    <span class="info-value status-active">
                        <i class="fas fa-circle"></i> Авторизован
                    </span>
                </div>
                <div class="info-item">
                    <span class="info-label">Дата входа:</span>
                    <span class="info-value">${new Date().toLocaleDateString('ru-RU')}</span>
                </div>
            </div>
        `;
    }
    
    static async loadUserGroups() {
        try {
            const result = await window.electronAPI.robloxApi({
                endpoint: `https://groups.roblox.com/v2/users/${this.app.currentUser.id}/groups/roles`,
                cookie: this.app.cookie
            });
            
            if (result.success) {
                const allGroups = result.data.data || [];
                const ownerGroups = allGroups
                    .filter(g => g.role?.rank === 255)
                    .map(g => g.group);
                
                // Обновляем счетчик групп
                document.getElementById('totalGroupsStat').textContent = ownerGroups.length.toString();
                
                // Показываем первые 3 группы
                this.displayGroupsPreview(ownerGroups.slice(0, 3));
            }
            
        } catch (error) {
            console.error('Error loading groups:', error);
        }
    }
    
    static displayGroupsPreview(groups) {
        const preview = document.getElementById('groupsPreview');
        
        if (groups.length === 0) {
            preview.innerHTML = `
                <div class="no-groups">
                    <i class="fas fa-users-slash"></i>
                    <p>Вы не владеете ни одной группой</p>
                </div>
            `;
            return;
        }
        
        preview.innerHTML = groups.map(group => `
            <div class="group-preview-card" data-group-id="${group.id}">
                <div class="preview-avatar">
                    ${group.name.substring(0, 1).toUpperCase()}
                </div>
                <div class="preview-info">
                    <h4>${group.name}</h4>
                    <p>${(group.memberCount || 0).toLocaleString()} участников</p>
                </div>
                <button class="btn btn-sm" data-group-id="${group.id}">
                    <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        `).join('');
        
        // Добавляем обработчики
        preview.querySelectorAll('.group-preview-card').forEach(card => {
            const groupId = card.dataset.groupId;
            const group = groups.find(g => g.id == groupId);
            
            if (group) {
                card.addEventListener('click', (e) => {
                    if (!e.target.closest('button')) {
                        this.app.currentGroup = group;
                        this.app.navigateTo('stats');
                    }
                });
                
                card.querySelector('button').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.app.currentGroup = group;
                    this.app.navigateTo('stats');
                });
            }
        });
    }
    
    static async loadAccountStats() {
        try {
            // Для демонстрации - показываем заглушки
            // В реальном приложении здесь будет загрузка статистики
            
            document.getElementById('pendingRobuxStat').textContent = '0';
            document.getElementById('dailySalesStat').textContent = '0';
            
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }
}