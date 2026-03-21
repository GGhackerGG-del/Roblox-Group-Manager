// Сервис для работы с продажами и графиками
class SalesService {
    static async fetchRecentSales(groupId, cookie, limit = 100) {
        try {
            console.log(`Fetching ${limit} recent sales for group ${groupId}...`);
            
            const result = await window.electronAPI.robloxApi({
                endpoint: `https://apis.roblox.com/transaction-records/v1/groups/${groupId}/transactions`,
                cookie: cookie,
                params: {
                    cursor: '',
                    limit: Math.min(limit, 100),
                    transactionType: 'Sale',
                    sortOrder: 'Desc'
                }
            });
            
            if (result.success) {
                const transactions = result.data?.data || [];
                console.log(`Fetched ${transactions.length} transactions`);
                
                // Обрабатываем транзакции как в Python версии
                const processedSales = transactions.map(tx => {
                    const created = tx.created ? new Date(tx.created) : null;
                    const now = new Date();
                    let timeAgo = 'N/A';
                    
                    if (created) {
                        const diffMs = now - created;
                        const diffMins = Math.floor(diffMs / 60000);
                        const diffHours = Math.floor(diffMs / 3600000);
                        const diffDays = Math.floor(diffMs / 86400000);
                        
                        if (diffDays > 0) {
                            timeAgo = `${diffDays}д назад`;
                        } else if (diffHours > 0) {
                            timeAgo = `${diffHours}ч назад`;
                        } else if (diffMins > 0) {
                            timeAgo = `${diffMins}м назад`;
                        } else {
                            timeAgo = 'только что';
                        }
                    }
                    
                    return {
                        id: tx.id,
                        created: tx.created,
                        dateTime: created ? created.toLocaleString('ru-RU') : 'N/A',
                        timeAgo: timeAgo,
                        userName: tx.agent?.name || 'Неизвестно',
                        userId: tx.agent?.id || '',
                        itemName: tx.details?.name || 'Неизвестный предмет',
                        itemId: tx.details?.id || '',
                        amount: tx.currency?.amount || 0,
                        isPending: tx.isPending || false,
                        agent: tx.agent || {},
                        details: tx.details || {},
                        currency: tx.currency || {}
                    };
                });
                
                // Сортируем по времени (новые сверху)
                processedSales.sort((a, b) => {
                    const timeA = a.created ? new Date(a.created).getTime() : 0;
                    const timeB = b.created ? new Date(b.created).getTime() : 0;
                    return timeB - timeA;
                });
                
                return {
                    success: true,
                    sales: processedSales,
                    total: processedSales.length,
                    totalAmount: processedSales.reduce((sum, sale) => sum + sale.amount, 0),
                    pendingCount: processedSales.filter(sale => sale.isPending).length
                };
            } else {
                console.error('API Error:', result.error);
                return {
                    success: false,
                    error: result.error?.message || 'Не удалось загрузить продажи'
                };
            }
            
        } catch (error) {
            console.error('Error fetching sales:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Сохраняем историю Pending Robux для графика
    static savePendingHistory(groupId, pendingAmount) {
        try {
            const historyKey = `pending_history_${groupId}`;
            const now = new Date();
            const timestamp = now.getTime();
            
            // Получаем существующую историю
            let history = JSON.parse(localStorage.getItem(historyKey) || '[]');
            
            // Добавляем новую точку данных
            history.push({
                timestamp: timestamp,
                time: now.toLocaleTimeString('ru-RU', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                }),
                date: now.toLocaleDateString('ru-RU'),
                pending: pendingAmount
            });
            
            // Ограничиваем количество точек (сохраняем последние 100)
            if (history.length > 100) {
                history = history.slice(-100);
            }
            
            // Сохраняем обратно
            localStorage.setItem(historyKey, JSON.stringify(history));
            
            console.log(`Saved pending history for group ${groupId}: ${pendingAmount} R$`);
            
        } catch (error) {
            console.error('Error saving pending history:', error);
        }
    }
    
    // Получаем историю Pending Robux
    static getPendingHistory(groupId) {
        try {
            const historyKey = `pending_history_${groupId}`;
            const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
            return history;
        } catch (error) {
            console.error('Error getting pending history:', error);
            return [];
        }
    }
    
    // Очищаем историю
    static clearPendingHistory(groupId) {
        try {
            const historyKey = `pending_history_${groupId}`;
            localStorage.removeItem(historyKey);
            console.log(`Cleared pending history for group ${groupId}`);
        } catch (error) {
            console.error('Error clearing pending history:', error);
        }
    }
}