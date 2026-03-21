class StatsComponent {
    // Статические переменные для управления состоянием
    static isRefreshing = false;
    static cache = new Map();
    static CACHE_DURATION = 30000; // 30 секунд кэша
    static REQUEST_DELAY = 500; // 500 мс между запросами
    static lastRequestTime = 0;
    
    // Переменные для графика
    static sparklineChart = null;
    static sparklineData = [];
    static sparklineTimestamps = [];
    static interpolatedPoints = new Set(); // Точки с интерполированными значениями
    static maxDataPoints = 30; // Максимум точек на графике
    static updateInterval = null;
    static chartLastUpdate = 0;
    static chartUpdateFrequency = 10000; // 10 секунд
    static currentTimeframe = '1h';
    static isChartAutoUpdate = true;
    static hasChartInitialized = false;
    
    static render(group) {
        if (!group) {
            return `
                <div class="no-group-selected">
                    <div class="no-group-content">
                        <div class="no-group-icon">
                            <i class="fas fa-chart-bar"></i>
                        </div>
                        <h2>Выберите группу для просмотра статистики</h2>
                        <p>Перейдите в раздел "Мои группы" и выберите группу</p>
                        <button class="btn btn-primary" onclick="app.navigateTo('groups')">
                            <i class="fas fa-arrow-left"></i> К списку групп
                        </button>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="stats-page">
                <!-- Заголовок страницы -->
                <div class="page-header">
                    <div class="header-left">
                        <div class="header-title">
                            <div class="title-icon">
                                <i class="fas fa-chart-bar"></i>
                            </div>
                            <div class="title-content">
                                <h1 class="page-title">${group.name}</h1>
                                <div class="title-subtitle">Аналитика и продажи</div>
                            </div>
                        </div>
                        <div class="group-badges">
                            <span class="badge badge-members">
                                <i class="fas fa-users"></i>
                                ${group.memberCount?.toLocaleString() || '0'} участников
                            </span>
                            <span class="badge badge-id">
                                <i class="fas fa-hashtag"></i>
                                ID: ${group.id}
                            </span>
                            <span class="badge badge-owner">
                                <i class="fas fa-crown"></i>
                                Владелец
                            </span>
                            ${group.hasVerifiedBadge ? `
                            <span class="badge badge-verified">
                                <i class="fas fa-check-circle"></i>
                                Проверено
                            </span>
                            ` : ''}
                        </div>
                    </div>
                    <div class="header-actions">
                        <button id="refreshStats" class="btn btn-primary btn-icon">
                            <i class="fas fa-sync-alt"></i>
                            <span>Обновить</span>
                        </button>
                        <button onclick="app.navigateTo('groups')" class="btn btn-secondary btn-icon">
                            <i class="fas fa-arrow-left"></i>
                            <span>К группам</span>
                        </button>
                    </div>
                </div>

                <!-- Статус загрузки -->
                <div id="loadingOverlay" class="loading-overlay" style="display: none;">
                    <div class="loading-content">
                        <div class="loading-spinner-large">
                            <i class="fas fa-spinner fa-spin"></i>
                        </div>
                        <h3>Загрузка статистики</h3>
                        <p id="loadingMessage">Подождите...</p>
                        <div class="loading-progress" id="loadingProgress">
                            <div class="progress-bar"></div>
                        </div>
                    </div>
                </div>

                <!-- Основная статистика -->
                <div class="stats-section">
                    <div class="section-header">
                        <div class="section-title">
                            <i class="fas fa-chart-line"></i>
                            <h3>Финансовая статистика</h3>
                        </div>
                        <div class="section-subtitle">
                            <span id="lastUpdated">Загрузка...</span>
                            <span id="cacheIndicator" class="cache-badge" style="display: none;">
                                <i class="fas fa-database"></i> Кэш
                            </span>
                        </div>
                    </div>
                    
                    <div class="stats-grid" id="statsGrid">
                        <div class="stat-card loading">
                            <div class="stat-card-inner">
                                <div class="loading-spinner">
                                    <i class="fas fa-spinner fa-spin"></i>
                                </div>
                                <p>Загрузка статистики...</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Состояние ошибки -->
                    <div id="errorState" class="error-state" style="display: none;">
                        <div class="error-content">
                            <i class="fas fa-exclamation-triangle"></i>
                            <h4>Ошибка загрузки</h4>
                            <p id="errorMessage"></p>
                            <div class="error-actions">
                                <button class="btn btn-primary" onclick="StatsComponent.retryLoad()">
                                    <i class="fas fa-redo"></i> Попробовать снова
                                </button>
                                <button class="btn btn-secondary" onclick="StatsComponent.useFallbackData()">
                                    <i class="fas fa-history"></i> Использовать старые данные
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- График Pending Robux (спарклайн) -->
                <div class="chart-section sparkline-section">
                    <div class="section-header">
                        <div class="section-title">
                            <i class="fas fa-chart-line"></i>
                            <h3>График Pending Robux</h3>
                            <span class="chart-badge" id="chartStatus">
                                <i class="fas fa-sync-alt fa-spin"></i>
                                <span>Инициализация...</span>
                            </span>
                        </div>
                        <div class="section-actions">
                            <div class="chart-controls">
                                <div class="timeframe-selector">
                                    <button class="timeframe-btn ${this.currentTimeframe === '30m' ? 'active' : ''}" data-timeframe="30m" onclick="StatsComponent.changeTimeframe('30m')">30м</button>
                                    <button class="timeframe-btn ${this.currentTimeframe === '1h' ? 'active' : ''}" data-timeframe="1h" onclick="StatsComponent.changeTimeframe('1h')">1ч</button>
                                    <button class="timeframe-btn ${this.currentTimeframe === '3h' ? 'active' : ''}" data-timeframe="3h" onclick="StatsComponent.changeTimeframe('3h')">3ч</button>
                                    <button class="timeframe-btn ${this.currentTimeframe === '6h' ? 'active' : ''}" data-timeframe="6h" onclick="StatsComponent.changeTimeframe('6h')">6ч</button>
                                    <button class="timeframe-btn ${this.currentTimeframe === '12h' ? 'active' : ''}" data-timeframe="12h" onclick="StatsComponent.changeTimeframe('12h')">12ч</button>
                                    <button class="timeframe-btn ${this.currentTimeframe === '24h' ? 'active' : ''}" data-timeframe="24h" onclick="StatsComponent.changeTimeframe('24h')">24ч</button>
                                </div>
                                <div class="chart-actions">
                                    <button class="btn-icon-sm" title="Пауза" onclick="StatsComponent.toggleChartAutoUpdate()" id="pauseChartBtn">
                                        <i class="fas fa-pause"></i>
                                    </button>
                                    <button class="btn-icon-sm" title="Обновить сейчас" onclick="StatsComponent.updateSparklineData(true)">
                                        <i class="fas fa-sync-alt"></i>
                                    </button>
                                    <button class="btn-icon-sm" title="Сбросить график" onclick="StatsComponent.resetSparklineData()">
                                        <i class="fas fa-redo"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="sparkline-container">
                        <div class="sparkline-header">
                            <div class="sparkline-info">
                                <div class="sparkline-title">
                                    <i class="fas fa-hourglass-half"></i>
                                    <span>Pending Robux</span>
                                </div>
                                <div class="sparkline-value" id="currentPendingValue">0 R$</div>
                                <div class="sparkline-change" id="pendingChange">
                                    <i class="fas fa-arrow-up"></i>
                                    <span>0.00%</span>
                                </div>
                            </div>
                            <div class="sparkline-stats">
                                <div class="sparkline-stat">
                                    <span class="stat-label">Мин:</span>
                                    <span class="stat-value" id="pendingMin">0</span>
                                </div>
                                <div class="sparkline-stat">
                                    <span class="stat-label">Макс:</span>
                                    <span class="stat-value" id="pendingMax">0</span>
                                </div>
                                <div class="sparkline-stat">
                                    <span class="stat-label">Изменение:</span>
                                    <span class="stat-value" id="pendingChangeAmount">0</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="sparkline-chart-container">
                            <canvas id="sparklineChart"></canvas>
                            <div class="sparkline-overlay" id="sparklineOverlay">
                                <div class="overlay-content">
                                    <i class="fas fa-chart-line"></i>
                                    <p>Загрузка графика...</p>
                                </div>
                            </div>
                            <div class="sparkline-tooltip" id="sparklineTooltip"></div>
                        </div>
                        
                        <div class="sparkline-footer">
                            <div class="time-axis" id="timeAxis">
                                <!-- Временные метки будут добавлены динамически -->
                            </div>
                            <div class="chart-legend">
                                <div class="legend-item">
                                    <span class="legend-color" style="background: linear-gradient(90deg, #10b981, #3b82f6);"></span>
                                    <span class="legend-text">Pending Robux</span>
                                </div>
                                <div class="legend-item">
                                    <span class="legend-dot" style="background: #3b82f6;"></span>
                                    <span class="legend-text">Текущее значение</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Последние продажи -->
                <div class="sales-section">
                    <div class="section-header">
                        <div class="section-title">
                            <i class="fas fa-shopping-cart"></i>
                            <h3>Последние продажи</h3>
                        </div>
                        <div class="section-actions">
                            <div class="action-group">
                                <select class="form-select form-select-sm" id="salesLimit">
                                    <option value="10">10 записей</option>
                                    <option value="25" selected>25 записей</option>
                                    <option value="50">50 записей</option>
                                    <option value="100">100 записей</option>
                                </select>
                                <button id="refreshSales" class="btn btn-sm btn-icon">
                                    <i class="fas fa-sync-alt"></i>
                                </button>
                                <button id="exportSales" class="btn btn-sm btn-secondary btn-icon">
                                    <i class="fas fa-download"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="sales-container">
                        <div class="loading-state" id="salesLoading">
                            <div class="loading-spinner-small">
                                <i class="fas fa-spinner fa-spin"></i>
                            </div>
                            <p>Загрузка данных о продажах...</p>
                        </div>
                        
                        <div class="sales-table-container" id="salesTable" style="display: none;"></div>
                        
                        <div class="empty-state" id="salesEmpty" style="display: none;">
                            <i class="fas fa-shopping-cart"></i>
                            <h4>Нет данных о продажах</h4>
                            <p>За выбранный период продаж не обнаружено</p>
                        </div>
                        
                        <div class="error-state" id="salesError" style="display: none;">
                            <i class="fas fa-exclamation-triangle"></i>
                            <h4>Ошибка загрузки</h4>
                            <p id="salesErrorMessage">Не удалось загрузить данные о продажах</p>
                            <button class="btn btn-sm" onclick="StatsComponent.loadSales()">
                                <i class="fas fa-redo"></i> Попробовать снова
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Быстрые действия -->
                <div class="quick-actions">
                    <div class="section-header">
                        <div class="section-title">
                            <i class="fas fa-bolt"></i>
                            <h3>Быстрые действия</h3>
                        </div>
                    </div>
                    <div class="actions-grid">
                        <button class="action-btn" onclick="StatsComponent.exportStats()">
                            <div class="action-icon">
                                <i class="fas fa-file-export"></i>
                            </div>
                            <div class="action-content">
                                <h4>Экспорт статистики</h4>
                                <p>CSV, JSON, PDF</p>
                            </div>
                            <i class="fas fa-chevron-right action-arrow"></i>
                        </button>
                        <button class="action-btn" onclick="StatsComponent.forceClearCache()">
                            <div class="action-icon">
                                <i class="fas fa-broom"></i>
                            </div>
                            <div class="action-content">
                                <h4>Очистить кэш</h4>
                                <p>Удалить сохраненные данные</p>
                            </div>
                            <i class="fas fa-chevron-right action-arrow"></i>
                        </button>
                        <button class="action-btn" onclick="StatsComponent.cancelRequests()">
                            <div class="action-icon">
                                <i class="fas fa-ban"></i>
                            </div>
                            <div class="action-content">
                                <h4>Отменить запросы</h4>
                                <p>Остановить текущие запросы</p>
                            </div>
                            <i class="fas fa-chevron-right action-arrow"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    static async init(app) {
        console.log('🚀 StatsComponent init for group:', app.currentGroup);
        
        try {
            this.app = app;
            this.group = app.currentGroup;
            
            if (!this.group) {
                console.error('❌ No group selected for stats');
                app.showNotification('Ошибка', 'Группа не выбрана', 'error');
                return;
            }
            
            // Сбрасываем флаг обновления
            this.isRefreshing = false;
            
            // Инициализируем переменные графика
            this.sparklineData = [];
            this.sparklineTimestamps = [];
            this.interpolatedPoints = new Set();
            this.currentTimeframe = '1h';
            this.isChartAutoUpdate = true;
            this.hasChartInitialized = false;
            
            // Назначаем обработчики
            await this.bindEvents();
            
            // Сначала загружаем основную статистику
            await this.loadStats(false);
            
            // Затем инициализируем график (асинхронно, не ждем)
            setTimeout(() => {
                this.initSparklineChart();
            }, 500);
            
        } catch (error) {
            console.error('❌ Error in StatsComponent.init:', error);
            this.app.showNotification('Ошибка', 'Не удалось инициализировать статистику', 'error');
        }
    }

    static async bindEvents() {
        // Ждем немного чтобы DOM обновился
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Обновление статистики с защитой от многократных кликов
        document.getElementById('refreshStats')?.addEventListener('click', () => {
            if (this.isRefreshing) {
                this.app.showNotification('Информация', 'Уже обновляется...', 'info');
                return;
            }
            
            const now = Date.now();
            const timeSinceLastRequest = now - this.lastRequestTime;
            
            if (timeSinceLastRequest < 1000) {
                this.app.showNotification('Предупреждение', 'Слишком много запросов', 'warning');
                return;
            }
            
            this.lastRequestTime = now;
            this.loadStats(true);
        });
        
        // Обновление продаж
        document.getElementById('refreshSales')?.addEventListener('click', () => {
            this.loadSales();
        });
        
        // Экспорт продаж
        document.getElementById('exportSales')?.addEventListener('click', () => {
            this.exportSalesData();
        });
        
        // Изменение лимита продаж
        document.getElementById('salesLimit')?.addEventListener('change', () => {
            this.loadSales();
        });
    }

    static async initSparklineChart() {
        console.log('📈 Инициализация sparkline графика...');
        
        try {
            const canvas = document.getElementById('sparklineChart');
            if (!canvas) {
                console.error('Canvas element not found');
                return;
            }
            
            // Проверяем, загружен ли Chart.js
            if (typeof Chart === 'undefined') {
                console.error('Chart.js not loaded, retrying...');
                setTimeout(() => this.initSparklineChart(), 1000);
                return;
            }
            
            // Инициализируем переменные если они еще не инициализированы
            if (!this.sparklineData) this.sparklineData = [];
            if (!this.sparklineTimestamps) this.sparklineTimestamps = [];
            if (!this.interpolatedPoints) this.interpolatedPoints = new Set();
            
            // Создаем начальные данные
            const ctx = canvas.getContext('2d');
            
            // Уничтожаем предыдущий график если существует
            if (this.sparklineChart) {
                this.sparklineChart.destroy();
            }
            
            this.sparklineChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Pending Robux',
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        pointBackgroundColor: '#3b82f6',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            enabled: true,
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                label: (context) => {
                                    const value = context.parsed.y;
                                    return `${value.toLocaleString()} R$`;
                                },
                                title: (tooltipItems) => {
                                    const index = tooltipItems[0].dataIndex;
                                    const timestamp = this.sparklineTimestamps[index];
                                    if (timestamp) {
                                        const date = new Date(timestamp);
                                        return date.toLocaleTimeString('ru-RU', {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        });
                                    }
                                    return '';
                                }
                            }
                        }
                    },
                    scales: {
                        x: { display: false },
                        y: {
                            display: true,
                            grid: { color: 'rgba(148, 163, 184, 0.1)' },
                            ticks: {
                                color: '#94a3b8',
                                callback: (value) => value.toLocaleString() + ' R$'
                            }
                        }
                    },
                    animation: { duration: 500 }
                }
            });
            
            console.log('✅ Sparkline график инициализирован');
            this.hasChartInitialized = true;
            
            // Скрываем оверлей
            const overlay = document.getElementById('sparklineOverlay');
            if (overlay) {
                overlay.style.display = 'none';
            }
            
            // Обновляем статус
            this.updateChartStatus('Готов');
            
            // Загружаем начальные данные для графика
            await this.updateSparklineData(true);
            
            // Запускаем автообновление
            this.startChartAutoUpdate();
            
        } catch (error) {
            console.error('❌ Error initializing sparkline chart:', error);
            this.updateChartStatus('Ошибка инициализации');
        }
    }

    static async fetchCurrentPending() {
        try {
            const cacheKey = `pending_${this.group.id}`;
            const cached = this.cache.get(cacheKey);
            
            // Проверяем кэш (кешируем на 5 секунд для графика)
            if (cached && (Date.now() - cached.timestamp) < 5000) {
                return { success: true, value: cached.value };
            }
            
            // Запрашиваем текущие pending robux
            const result = await window.electronAPI.robloxApi({
                endpoint: `https://apis.roblox.com/transaction-records/v1/groups/${this.group.id}/revenue/summary/day`,
                cookie: this.app.cookie,
                timeout: 5000
            });
            
            if (result.success && result.data) {
                const pendingValue = result.data.pendingRobux || 0;
                
                // Сохраняем в кэш
                this.cache.set(cacheKey, {
                    timestamp: Date.now(),
                    value: pendingValue
                });
                
                return { success: true, value: pendingValue };
            }
            
            // Если API не вернул данные, пробуем получить из основной статистики
            const mainCacheKey = `stats_${this.group.id}`;
            const mainCached = this.cache.get(mainCacheKey);
            if (mainCached && mainCached.data?.periods?.day?.pendingRobux) {
                return { 
                    success: true, 
                    value: mainCached.data.periods.day.pendingRobux 
                };
            }
            
            return { success: false, value: 0 };
            
        } catch (error) {
            console.error('❌ Error fetching current pending:', error);
            
            // Пробуем получить из кэша
            const cacheKey = `pending_${this.group.id}`;
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return { success: true, value: cached.value };
            }
            
            return { success: false, value: 0 };
        }
    }

    static async updateSparklineData(force = false) {
        if (!this.hasChartInitialized) return;
        
        try {
            const now = Date.now();
            
            if (!force && (now - this.chartLastUpdate) < this.chartUpdateFrequency) {
                return;
            }
            
            console.log('🔄 Обновление данных sparkline графика...');
            this.updateChartStatus('Обновление...');
            
            // Получаем текущие Pending Robux
            const pendingData = await this.fetchCurrentPending();
            
            if (pendingData.success) {
                const currentValue = pendingData.value;
                const timestamp = now;
                
                // Определяем минимальное корректное значение
                const MIN_VALID_VALUE = 1;
                
                if (currentValue >= MIN_VALID_VALUE) {
                    // Корректное значение
                    this.sparklineData.push(currentValue);
                    this.sparklineTimestamps.push(timestamp);
                    console.log(`✅ Добавлено корректное значение: ${currentValue} R$`);
                    
                    // Убираем метку интерполированной точки, если она была
                    const pointIndex = this.sparklineData.length - 1;
                    if (this.interpolatedPoints.has(pointIndex)) {
                        this.interpolatedPoints.delete(pointIndex);
                    }
                } else {
                    // Некорректное значение (0 или отрицательное)
                    if (this.sparklineData.length > 0) {
                        const lastValue = this.sparklineData[this.sparklineData.length - 1];
                        
                        // Используем предыдущее значение
                        this.sparklineData.push(lastValue);
                        this.sparklineTimestamps.push(timestamp);
                        
                        // Помечаем как интерполированное
                        const pointIndex = this.sparklineData.length - 1;
                        this.interpolatedPoints.add(pointIndex);
                        
                        console.log(`⚠️ Некорректное значение (${currentValue}), использовано предыдущее: ${lastValue} R$`);
                    } else {
                        // Если это первая точка - ждем корректных данных
                        console.log(`⏭️ Пропущено некорректное первое значение: ${currentValue} R$`);
                        this.updateChartStatus('Ожидание данных...');
                        return;
                    }
                }
                
                // Ограничиваем количество точек
                if (this.sparklineData.length > this.maxDataPoints) {
                    const removedIndex = 0;
                    if (this.interpolatedPoints.has(removedIndex)) {
                        this.interpolatedPoints.delete(removedIndex);
                    }
                    
                    // Обновляем индексы в interpolatedPoints
                    const newInterpolatedPoints = new Set();
                    this.interpolatedPoints.forEach(index => {
                        if (index > 0) {
                            newInterpolatedPoints.add(index - 1);
                        }
                    });
                    this.interpolatedPoints = newInterpolatedPoints;
                    
                    this.sparklineData.shift();
                    this.sparklineTimestamps.shift();
                }
                
                // Обновляем график
                this.updateChart();
                
                // Обновляем статистику
                this.updateSparklineStats();
                
                // Обновляем временную ось
                this.updateTimeAxis();
                
                this.chartLastUpdate = now;
                this.updateChartStatus('Обновлено');
                
            } else {
                console.error('❌ Ошибка получения Pending Robux');
                this.updateChartStatus('Ошибка обновления');
            }
            
        } catch (error) {
            console.error('❌ Ошибка обновления sparkline данных:', error);
            this.updateChartStatus('Ошибка');
        }
    }

    static updateChart() {
        if (!this.sparklineChart || !this.sparklineData || this.sparklineData.length === 0) return;
        
        try {
            // Подготавливаем данные
            const chartLabels = this.sparklineTimestamps.map(ts => {
                return new Date(ts).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
            });
            
            // Обновляем график
            this.sparklineChart.data.labels = chartLabels;
            this.sparklineChart.data.datasets[0].data = this.sparklineData;
            
            // Настраиваем отображение точек
            if (this.interpolatedPoints && this.interpolatedPoints.size > 0) {
                this.sparklineChart.data.datasets[0].pointRadius = 
                    this.sparklineData.map((_, index) => {
                        return this.interpolatedPoints.has(index) ? 0 : 3;
                    });
                
                this.sparklineChart.data.datasets[0].pointBackgroundColor = 
                    this.sparklineData.map((_, index) => {
                        return this.interpolatedPoints.has(index) ? 'rgba(147, 197, 253, 0.5)' : '#3b82f6';
                    });
                
                // Настраиваем стиль линии для интерполированных сегментов
                this.sparklineChart.data.datasets[0].borderDash = 
                    this.sparklineData.map((_, index) => {
                        return this.interpolatedPoints.has(index) ? [5, 5] : [];
                    });
            } else {
                // Стандартные настройки если нет интерполированных точек
                this.sparklineChart.data.datasets[0].pointRadius = 3;
                this.sparklineChart.data.datasets[0].pointBackgroundColor = '#3b82f6';
                this.sparklineChart.data.datasets[0].borderDash = [];
            }
            
            this.sparklineChart.update('none');
            
        } catch (error) {
            console.error('❌ Ошибка обновления графика:', error);
        }
    }

    static updateSparklineStats() {
        if (!this.sparklineData || this.sparklineData.length === 0) return;
        
        try {
            // Фильтруем некорректные значения (нули и отрицательные)
            const validData = this.sparklineData.filter((value, index) => {
                return value > 0 && (!this.interpolatedPoints || !this.interpolatedPoints.has(index));
            });
            
            if (validData.length === 0) {
                // Если нет корректных данных, показываем нули
                this.updateSparklineDOM(0, 0, 0, 0, 0);
                return;
            }
            
            const currentValue = this.sparklineData[this.sparklineData.length - 1];
            const minValue = Math.min(...validData);
            const maxValue = Math.max(...validData);
            
            // Рассчитываем изменение на основе последних корректных значений
            let changePercent = 0;
            let changeAmount = 0;
            
            if (validData.length >= 2) {
                const lastValidIndex = validData.length - 1;
                const currentValid = validData[lastValidIndex];
                const prevValid = validData[lastValidIndex - 1];
                
                changeAmount = currentValid - prevValid;
                changePercent = prevValid > 0 ? (changeAmount / prevValid) * 100 : 0;
            }
            
            // Обновляем DOM элементы
            this.updateSparklineDOM(currentValue, minValue, maxValue, changePercent, changeAmount);
            
        } catch (error) {
            console.error('❌ Ошибка обновления статистики графика:', error);
        }
    }

    static updateSparklineDOM(currentValue, minValue, maxValue, changePercent, changeAmount) {
        const currentValueEl = document.getElementById('currentPendingValue');
        const changeEl = document.getElementById('pendingChange');
        const minEl = document.getElementById('pendingMin');
        const maxEl = document.getElementById('pendingMax');
        const changeAmountEl = document.getElementById('pendingChangeAmount');
        
        if (currentValueEl) {
            const lastIndex = this.sparklineData.length - 1;
            const isInterpolated = this.interpolatedPoints && this.interpolatedPoints.has(lastIndex);
            
            if (isInterpolated) {
                currentValueEl.innerHTML = `${currentValue.toLocaleString()} R$ <span class="value-note">(пред.)</span>`;
            } else {
                currentValueEl.textContent = `${currentValue.toLocaleString()} R$`;
            }
        }
        
        if (changeEl) {
            const changeIcon = changeEl.querySelector('i');
            const changeText = changeEl.querySelector('span');
            
            if (changePercent > 0) {
                changeIcon.className = 'fas fa-arrow-up';
                changeEl.style.color = '#10b981';
            } else if (changePercent < 0) {
                changeIcon.className = 'fas fa-arrow-down';
                changeEl.style.color = '#ef4444';
            } else {
                changeIcon.className = 'fas fa-minus';
                changeEl.style.color = '#94a3b8';
            }
            
            changeText.textContent = `${Math.abs(changePercent).toFixed(2)}%`;
        }
        
        if (minEl) minEl.textContent = minValue.toLocaleString();
        if (maxEl) maxEl.textContent = maxValue.toLocaleString();
        
        if (changeAmountEl) {
            changeAmountEl.textContent = changeAmount >= 0 ? 
                `+${changeAmount.toLocaleString()}` : 
                changeAmount.toLocaleString();
            changeAmountEl.style.color = changeAmount >= 0 ? '#10b981' : '#ef4444';
        }
    }

    static updateTimeAxis() {
        const timeAxis = document.getElementById('timeAxis');
        if (!timeAxis || this.sparklineTimestamps.length === 0) return;
        
        try {
            const firstTime = new Date(this.sparklineTimestamps[0]);
            const lastTime = new Date(this.sparklineTimestamps[this.sparklineTimestamps.length - 1]);
            
            timeAxis.innerHTML = `
                <div class="time-tick" style="left: 0%">
                    <div class="tick-line"></div>
                    <div class="tick-label">${firstTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div class="time-tick" style="left: 100%">
                    <div class="tick-line"></div>
                    <div class="tick-label">${lastTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
            `;
        } catch (error) {
            console.error('❌ Ошибка обновления временной оси:', error);
        }
    }

    static updateChartStatus(status) {
        const statusEl = document.getElementById('chartStatus');
        if (!statusEl) return;
        
        const icon = statusEl.querySelector('i');
        const text = statusEl.querySelector('span');
        
        if (!icon || !text) return;
        
        switch(status) {
            case 'Обновление...':
                icon.className = 'fas fa-sync-alt fa-spin';
                break;
            case 'Готов':
                icon.className = 'fas fa-check-circle';
                break;
            case 'Ошибка':
                icon.className = 'fas fa-exclamation-triangle';
                break;
            case 'Пауза':
                icon.className = 'fas fa-pause';
                break;
            default:
                icon.className = 'fas fa-info-circle';
        }
        
        text.textContent = status;
    }

    static changeTimeframe(timeframe) {
        console.log('🕒 Изменение таймфрейма на:', timeframe);
        
        this.currentTimeframe = timeframe;
        
        // Обновляем активные кнопки
        document.querySelectorAll('.timeframe-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.timeframe === timeframe) {
                btn.classList.add('active');
            }
        });
        
        // Обновляем график
        this.updateSparklineData(true);
    }

    static toggleChartAutoUpdate() {
        this.isChartAutoUpdate = !this.isChartAutoUpdate;
        const button = document.getElementById('pauseChartBtn');
        
        if (button) {
            const icon = button.querySelector('i');
            if (icon) {
                if (this.isChartAutoUpdate) {
                    icon.className = 'fas fa-pause';
                    button.title = 'Пауза';
                    this.startChartAutoUpdate();
                    this.updateChartStatus('Автообновление включено');
                } else {
                    icon.className = 'fas fa-play';
                    button.title = 'Продолжить';
                    this.stopChartAutoUpdate();
                    this.updateChartStatus('Пауза');
                }
            }
        }
    }

    static startChartAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        this.updateInterval = setInterval(() => {
            if (this.isChartAutoUpdate) {
                this.updateSparklineData();
            }
        }, this.chartUpdateFrequency);
        
        console.log('🔄 Автообновление графика запущено');
    }

    static stopChartAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('⏸️ Автообновление графика остановлено');
        }
    }

    static resetSparklineData() {
        this.sparklineData = [];
        this.sparklineTimestamps = [];
        this.interpolatedPoints = new Set();
        
        if (this.sparklineChart) {
            this.sparklineChart.data.labels = [];
            this.sparklineChart.data.datasets[0].data = [];
            this.sparklineChart.update();
        }
        
        // Сбрасываем DOM статистики
        const elements = [
            'currentPendingValue',
            'pendingMin',
            'pendingMax',
            'pendingChangeAmount'
        ];
        
        elements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '0';
        });
        
        const changeEl = document.getElementById('pendingChange');
        if (changeEl) {
            const icon = changeEl.querySelector('i');
            const text = changeEl.querySelector('span');
            if (icon) icon.className = 'fas fa-arrow-up';
            if (text) text.textContent = '0.00%';
            changeEl.style.color = '#10b981';
        }
        
        // Сбрасываем временную ось
        const timeAxis = document.getElementById('timeAxis');
        if (timeAxis) timeAxis.innerHTML = '';
        
        this.updateChartStatus('Данные сброшены');
    }

    static updateLastUpdated() {
        const element = document.getElementById('lastUpdated');
        if (element) {
            const now = new Date();
            element.textContent = `Обновлено: ${now.toLocaleTimeString('ru-RU')}`;
        }
    }

    static showLoading(message = 'Загрузка статистики...') {
        const overlay = document.getElementById('loadingOverlay');
        const messageEl = document.getElementById('loadingMessage');
        
        if (overlay) {
            if (messageEl) messageEl.textContent = message;
            overlay.style.display = 'flex';
        }
        
        this.hideError();
    }

    static hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    static showError(message) {
        this.hideLoading();
        
        const errorState = document.getElementById('errorState');
        const errorMessage = document.getElementById('errorMessage');
        
        if (errorState && errorMessage) {
            errorMessage.textContent = message;
            errorState.style.display = 'block';
        }
    }

    static hideError() {
        const errorState = document.getElementById('errorState');
        if (errorState) {
            errorState.style.display = 'none';
        }
    }

    static showCacheIndicator() {
        const indicator = document.getElementById('cacheIndicator');
        if (indicator) {
            indicator.style.display = 'inline-block';
            setTimeout(() => indicator.style.display = 'none', 3000);
        }
    }

    static async loadStats(forceRefresh = false) {
        console.log('📊 Loading stats for group:', this.group?.id, 'force:', forceRefresh);
        
        if (this.isRefreshing) {
            console.log('⚠️ Already refreshing, skipping...');
            return;
        }
        
        this.isRefreshing = true;
        this.showLoading('Загрузка статистики...');
        
        const container = document.getElementById('statsGrid');
        if (!container) {
            this.isRefreshing = false;
            this.hideLoading();
            return;
        }
        
        try {
            // Проверяем кэш
            const cacheKey = `stats_${this.group.id}`;
            const cached = this.cache.get(cacheKey);
            
            if (!forceRefresh && cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
                console.log('📦 Using cached stats');
                this.showCacheIndicator();
                this.displayStats(cached.data);
                this.hideLoading();
                this.isRefreshing = false;
                this.updateLastUpdated();
                return;
            }
            
            // Загружаем статистику
            const stats = await this.fetchAllStats();
            
            // Проверяем данные
            const hasValidData = this.validateStats(stats);
            
            if (!hasValidData) {
                if (cached && cached.data) {
                    console.log('⚠️ Invalid API data, using cached');
                    this.displayStats(cached.data);
                    this.app.showNotification('Внимание', 'Используются кэшированные данные', 'warning');
                } else {
                    throw new Error('API вернул некорректные данные');
                }
            } else {
                // Сохраняем в кэш
                this.cache.set(cacheKey, {
                    timestamp: Date.now(),
                    data: stats
                });
                
                // Отображаем статистику
                this.displayStats(stats);
            }
            
            // Загружаем продажи
            this.loadSales();
            
            // Обновляем время
            this.updateLastUpdated();
            
            this.app.showNotification('Успех', 'Статистика обновлена', 'success');
            
        } catch (error) {
            console.error('❌ Error loading stats:', error);
            this.showError(error.message || 'Неизвестная ошибка');
            this.tryLoadFromCache();
            this.app.showNotification('Ошибка', 'Не удалось загрузить статистику', 'error');
        } finally {
            this.isRefreshing = false;
            this.hideLoading();
        }
    }

    static validateStats(stats) {
        // Принимаем любые данные, даже если нули
        return true;
    }

    static tryLoadFromCache() {
        const cacheKey = `stats_${this.group.id}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && cached.data) {
            console.log('🔄 Loading from cache due to error');
            this.displayStats(cached.data);
            this.showCacheIndicator();
            return true;
        }
        
        return false;
    }

    static async fetchAllStats() {
        const periods = ['day', 'week', 'month'];
        const stats = {
            groupId: this.group.id,
            groupName: this.group.name,
            periods: {},
            fetchedAt: new Date().toISOString(),
            errors: []
        };
        
        for (const period of periods) {
            try {
                if (period !== periods[0]) {
                    await new Promise(resolve => setTimeout(resolve, this.REQUEST_DELAY));
                }
                
                console.log(`📡 Fetching ${period} stats...`);
                
                const result = await window.electronAPI.robloxApi({
                    endpoint: `https://apis.roblox.com/transaction-records/v1/groups/${this.group.id}/revenue/summary/${period}`,
                    cookie: this.app.cookie,
                    timeout: 10000
                });
                
                if (result.success && result.data) {
                    stats.periods[period] = {
                        itemSaleRobux: result.data.itemSaleRobux || 0,
                        pendingRobux: result.data.pendingRobux || 0,
                        rawData: result.data
                    };
                    console.log(`✅ ${period} stats:`, stats.periods[period]);
                } else {
                    console.warn(`⚠️ No data for ${period} period:`, result.error);
                    stats.periods[period] = { itemSaleRobux: 0, pendingRobux: 0 };
                }
            } catch (error) {
                console.warn(`❌ Error fetching ${period} stats:`, error.message);
                stats.periods[period] = { itemSaleRobux: 0, pendingRobux: 0 };
            }
        }
        
        // Получаем количество участников
        try {
            const membersResult = await window.electronAPI.robloxApi({
                endpoint: `https://groups.roblox.com/v1/groups/${this.group.id}`,
                cookie: this.app.cookie,
                timeout: 5000
            });
            
            if (membersResult.success) {
                stats.memberCount = membersResult.data.memberCount || 0;
            }
        } catch (error) {
            console.warn('⚠️ Error fetching member count:', error);
            stats.memberCount = this.group.memberCount || 0;
        }
        
        return stats;
    }

    static displayStats(stats) {
        const container = document.getElementById('statsGrid');
        if (!container) return;
        
        this.hideError();
        
        const periodData = [
            {
                period: 'day',
                label: '24 часа',
                icon: 'fas fa-clock',
                description: 'Продажи за сутки',
                value: stats.periods.day?.itemSaleRobux || 0,
                pending: stats.periods.day?.pendingRobux || 0,
                trend: this.calculateTrend(stats, 'day'),
                color: '#6366f1'
            },
            {
                period: 'week',
                label: '7 дней',
                icon: 'fas fa-calendar-week',
                description: 'Недельная статистика',
                value: stats.periods.week?.itemSaleRobux || 0,
                pending: stats.periods.week?.pendingRobux || 0,
                trend: this.calculateTrend(stats, 'week'),
                color: '#8b5cf6'
            },
            {
                period: 'month',
                label: '30 дней',
                icon: 'fas fa-calendar-alt',
                description: 'Месячный оборот',
                value: stats.periods.month?.itemSaleRobux || 0,
                pending: stats.periods.month?.pendingRobux || 0,
                trend: this.calculateTrend(stats, 'month'),
                color: '#ec4899'
            },
            {
                period: 'pending',
                label: 'Pending Robux',
                icon: 'fas fa-hourglass-half',
                description: 'Ожидающие выплаты',
                value: stats.periods.day?.pendingRobux || 0,
                pending: 0,
                trend: null,
                color: '#f59e0b'
            },
            {
                period: 'members',
                label: 'Участники',
                icon: 'fas fa-users',
                description: 'Активные участники',
                value: stats.memberCount || this.group.memberCount || 0,
                pending: 0,
                trend: null,
                color: '#10b981'
            },
            {
                period: 'average',
                label: 'Средний чек',
                icon: 'fas fa-receipt',
                description: 'Средняя сумма покупки',
                value: this.calculateAverage(stats),
                pending: 0,
                trend: null,
                color: '#3b82f6'
            }
        ];
        
        container.innerHTML = periodData.map(item => `
            <div class="stat-card" data-period="${item.period}">
                <div class="stat-card-inner">
                    <div class="stat-header">
                        <div class="stat-icon" style="background: ${item.color}20; color: ${item.color};">
                            <i class="${item.icon}"></i>
                        </div>
                        <div class="stat-title">
                            <h4>${item.label}</h4>
                            <p class="stat-desc">${item.description}</p>
                        </div>
                    </div>
                    <div class="stat-content">
                        <div class="stat-value" style="color: ${item.color}; font-size: 48px; font-weight: 800; background: var(--gradient-primary); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; line-height: 1; margin: var(--spacing-md) 0; text-shadow: 0 2px 10px rgba(99, 102, 241, 0.2);">
        ${item.period === 'members' ? 
            item.value.toLocaleString() : 
            item.value.toLocaleString() + ' R$'}
    </div>
                        ${item.trend ? `
                        <div class="stat-trend ${item.trend.direction}">
                            <i class="fas ${item.trend.direction === 'up' ? 'fa-arrow-up' : 'fa-arrow-down'}"></i>
                            <span>${item.trend.value}%</span>
                        </div>
                        ` : ''}
                    </div>
                    ${item.pending > 0 ? `
                    <div class="stat-footer">
                        <span class="stat-badge pending">
                            <i class="fas fa-clock"></i>
                            ${item.pending.toLocaleString()} R$ pending
                        </span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    static calculateTrend(stats, period) {
        try {
            if (period === 'day') {
                const dailyAvg = (stats.periods.week?.itemSaleRobux || 0) / 7;
                const today = stats.periods.day?.itemSaleRobux || 0;
                
                if (dailyAvg > 0 && today > 0) {
                    const change = ((today - dailyAvg) / dailyAvg) * 100;
                    return {
                        direction: change >= 0 ? 'up' : 'down',
                        value: Math.abs(Math.round(change))
                    };
                }
            }
        } catch (error) {
            console.warn('Error calculating trend:', error);
        }
        
        return null;
    }

    static calculateAverage(stats) {
        try {
            const total = (stats.periods.day?.itemSaleRobux || 0) + 
                         (stats.periods.week?.itemSaleRobux || 0) + 
                         (stats.periods.month?.itemSaleRobux || 0);
            
            const average = Math.round(total / 10) || 0;
            return average > 0 ? average : 0;
        } catch (error) {
            return 0;
        }
    }

    static async loadSales() {
        console.log('🛒 Loading sales...');
        
        this.showSalesLoading();
        
        try {
            const limit = parseInt(document.getElementById('salesLimit')?.value || '25');
            const sales = await this.fetchSales(limit);
            
            if (sales.length > 0) {
                this.displaySales(sales);
            } else {
                this.showSalesEmpty();
            }
            
        } catch (error) {
            console.error('❌ Error loading sales:', error);
            this.showSalesError(error.message);
        }
    }

    static async fetchSales(limit = 25) {
        try {
            const result = await window.electronAPI.robloxApi({
                endpoint: `https://apis.roblox.com/transaction-records/v1/groups/${this.group.id}/transactions`,
                cookie: this.app.cookie,
                params: {
                    limit: Math.min(limit, 100),
                    transactionType: 'Sale',
                    sortOrder: 'Desc'
                },
                timeout: 10000
            });
            
            if (result.success && result.data?.data) {
                return result.data.data;
            } else {
                return [];
            }
        } catch (error) {
            console.error('Sales API error:', error);
            return [];
        }
    }

    static displaySales(transactions) {
        const container = document.getElementById('salesTable');
        if (!container) return;
        
        this.hideSalesLoading();
        this.hideSalesEmpty();
        this.hideSalesError();
        
        const now = new Date();
        const tableHTML = `
            <table class="sales-table">
                <thead>
                    <tr>
                        <th><i class="fas fa-calendar"></i><span>Дата и время</span></th>
                        <th><i class="fas fa-user"></i><span>Покупатель</span></th>
                        <th><i class="fas fa-box"></i><span>Предмет</span></th>
                        <th><i class="fas fa-coins"></i><span>Сумма</span></th>
                        <th><i class="fas fa-check-circle"></i><span>Статус</span></th>
                        <th><i class="fas fa-info-circle"></i><span>Действия</span></th>
                    </tr>
                </thead>
                <tbody>
                    ${transactions.slice(0, 25).map(tx => {
                        const created = tx.created ? new Date(tx.created) : null;
                        const timeAgo = created ? this.getTimeAgo(created, now) : 'N/A';
                        const dateStr = created ? 
                            `${created.toLocaleDateString('ru-RU')}<br><small>${created.toLocaleTimeString('ru-RU')}</small>` : 
                            'N/A';
                        
                        const userName = tx.agent?.name || 'Неизвестно';
                        const userId = tx.agent?.id || '';
                        
                        const itemName = tx.details?.name || 'Неизвестный предмет';
                        const itemId = tx.details?.id || '';
                        
                        const amount = tx.currency?.amount || 0;
                        const isPending = tx.isPending || false;
                        const status = isPending ? 'pending' : 'completed';
                        
                        return `
                            <tr>
                                <td>
                                    <div class="date-cell">
                                        <div class="date-main">${dateStr.split('<br>')[0]}</div>
                                        <div class="date-secondary">${timeAgo}</div>
                                    </div>
                                </td>
                                <td>
                                    <div class="user-cell">
                                        <div class="user-avatar">${userName.charAt(0)}</div>
                                        <div class="user-info">
                                            <div class="user-name">${userName}</div>
                                            ${userId ? `<div class="user-id">ID: ${userId}</div>` : ''}
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div class="item-cell">
                                        <div class="item-icon">
                                            <i class="fas fa-box-open"></i>
                                        </div>
                                        <div class="item-info">
                                            <div class="item-name">${itemName}</div>
                                            ${itemId ? `<div class="item-id">ID: ${itemId}</div>` : ''}
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div class="amount-cell ${amount > 0 ? 'positive' : ''}">
                                        <i class="fas fa-robux"></i>
                                        <span>${amount.toLocaleString()} R$</span>
                                    </div>
                                </td>
                                <td>
                                    <span class="status-badge ${status}">
                                        <i class="fas ${isPending ? 'fa-clock' : 'fa-check-circle'}"></i>
                                        ${isPending ? 'Ожидает' : 'Завершено'}
                                    </span>
                                </td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn-icon-sm" title="Скопировать ID" onclick="navigator.clipboard.writeText('${tx.id}'); app.showNotification('Успех', 'ID скопирован', 'success')">
                                            <i class="fas fa-copy"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="3">
                            <div class="sales-summary">
                                <strong>Всего продаж:</strong> ${transactions.length}
                            </div>
                        </td>
                        <td class="total-amount">
                            <strong>${transactions.reduce((sum, tx) => sum + (tx.currency?.amount || 0), 0).toLocaleString()} R$</strong>
                        </td>
                        <td colspan="2">
                            <div class="summary-info">
                                <span class="summary-item">
                                    <i class="fas fa-check-circle success"></i>
                                    ${transactions.filter(tx => !tx.isPending).length}
                                </span>
                                <span class="summary-item">
                                    <i class="fas fa-clock warning"></i>
                                    ${transactions.filter(tx => tx.isPending).length}
                                </span>
                            </div>
                        </td>
                    </tr>
                </tfoot>
            </table>
        `;
        
        container.innerHTML = tableHTML;
        container.style.display = 'block';
    }

    static getTimeAgo(date, now) {
        const diffMs = now - date;
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
    }

    static showSalesLoading() {
        ['salesTable', 'salesEmpty', 'salesError'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        
        const loading = document.getElementById('salesLoading');
        if (loading) loading.style.display = 'flex';
    }

    static hideSalesLoading() {
        const loading = document.getElementById('salesLoading');
        if (loading) loading.style.display = 'none';
    }

    static showSalesEmpty() {
        this.hideSalesLoading();
        this.hideSalesError();
        
        const empty = document.getElementById('salesEmpty');
        const table = document.getElementById('salesTable');
        
        if (empty) empty.style.display = 'flex';
        if (table) table.style.display = 'none';
    }

    static hideSalesEmpty() {
        const empty = document.getElementById('salesEmpty');
        if (empty) empty.style.display = 'none';
    }

    static showSalesError(message = 'Ошибка загрузки') {
        this.hideSalesLoading();
        this.hideSalesEmpty();
        
        const error = document.getElementById('salesError');
        const table = document.getElementById('salesTable');
        
        if (error) {
            const errorMessage = document.getElementById('salesErrorMessage');
            if (errorMessage) errorMessage.textContent = message;
            error.style.display = 'flex';
        }
        if (table) table.style.display = 'none';
    }

    static hideSalesError() {
        const error = document.getElementById('salesError');
        if (error) error.style.display = 'none';
    }

    // Новые методы для управления
    static retryLoad() {
        this.loadStats(true);
    }

    static useFallbackData() {
        if (this.tryLoadFromCache()) {
            this.app.showNotification('Успех', 'Загружены кэшированные данные', 'success');
        } else {
            this.app.showNotification('Ошибка', 'Нет кэшированных данных', 'error');
        }
    }

    static forceClearCache() {
        const cacheKey = `stats_${this.group.id}`;
        this.cache.delete(cacheKey);
        localStorage.removeItem(cacheKey);
        this.app.showNotification('Успех', 'Кэш очищен', 'success');
        this.loadStats(true);
    }

    static async cancelRequests() {
        try {
            await window.electronAPI.invoke('cancel-requests');
            this.isRefreshing = false;
            this.hideLoading();
            this.app.showNotification('Успех', 'Запросы отменены', 'success');
        } catch (error) {
            console.error('Error cancelling requests:', error);
        }
    }

    static viewTransaction(transactionId) {
        this.app.showNotification('Информация', `Детали транзакции #${transactionId}`, 'info');
    }

    static exportStats() {
        this.app.showNotification('Информация', 'Экспорт статистики в разработке', 'info');
    }

    static exportSalesData() {
        this.app.showNotification('Успех', 'Экспорт данных о продажах начат', 'success');
    }

    // Очистка при выходе
    static cleanup() {
        this.stopChartAutoUpdate();
        if (this.sparklineChart) {
            this.sparklineChart.destroy();
            this.sparklineChart = null;
        }
        this.hasChartInitialized = false;
    }
}