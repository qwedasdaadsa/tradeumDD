// ========== Глобальные переменные ==========
let currentUser = null;
let authToken = null;
let trades = [];
let currentView = 'journal';

const API_BASE = '';

// DOM элементы
const loadingScreen = document.getElementById('loadingScreen');
const authScreen = document.getElementById('authScreen');
const appScreen = document.getElementById('appScreen');
const connectionStatus = document.getElementById('connectionStatus');

// ========== Инициализация ==========
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
});

function checkAuth() {
    const token = localStorage.getItem('authToken');
    if (token) {
        authToken = token;
        fetchUserProfile();
    } else {
        showAuthScreen();
    }
}

async function fetchUserProfile() {
    try {
        const response = await fetch(`${API_BASE}/api/user/profile`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            currentUser = await response.json();
            await loadTrades();
            showAppScreen();
        } else {
            localStorage.removeItem('authToken');
            showAuthScreen();
        }
    } catch (error) {
        showAuthScreen();
    }
}

function showAuthScreen() {
    loadingScreen.style.display = 'none';
    authScreen.style.display = 'flex';
    appScreen.style.display = 'none';
}

function showAppScreen() {
    loadingScreen.style.display = 'none';
    authScreen.style.display = 'none';
    appScreen.style.display = 'block';
    updateDate();
    renderJournal();
    updateProfileDisplay();
}

// ========== Авторизация ==========
function setupEventListeners() {
    // Табы авторизации
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const tabName = tab.dataset.tab;
            document.getElementById('loginForm').style.display = tabName === 'login' ? 'block' : 'none';
            document.getElementById('registerForm').style.display = tabName === 'register' ? 'block' : 'none';
        });
    });

    // Форма входа
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
            const response = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: formData.get('username'),
                    password: formData.get('password')
                })
            });

            const data = await response.json();

            if (response.ok) {
                authToken = data.token;
                currentUser = data.user;
                localStorage.setItem('authToken', authToken);
                await loadTrades();
                showAppScreen();
            } else {
                document.getElementById('authError').textContent = data.error;
            }
        } catch (error) {
            document.getElementById('authError').textContent = 'Ошибка соединения';
        }
    });

    // Форма регистрации
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        if (formData.get('password') !== formData.get('confirmPassword')) {
            document.getElementById('authError').textContent = 'Пароли не совпадают';
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: formData.get('username'),
                    password: formData.get('password')
                })
            });

            const data = await response.json();

            if (response.ok) {
                authToken = data.token;
                currentUser = data.user;
                localStorage.setItem('authToken', authToken);
                showAppScreen();
            } else {
                document.getElementById('authError').textContent = data.error;
            }
        } catch (error) {
            document.getElementById('authError').textContent = 'Ошибка соединения';
        }
    });

    // Навигация
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            currentView = tab.dataset.view;
            document.getElementById('journalView').style.display = currentView === 'journal' ? 'block' : 'none';
            document.getElementById('leaderboardView').style.display = currentView === 'leaderboard' ? 'block' : 'none';
            document.getElementById('settingsView').style.display = currentView === 'settings' ? 'block' : 'none';

            if (currentView === 'leaderboard') {
                loadLeaderboard();
            }
        });
    });

    // Дневник
    document.getElementById('addTradeBtn').addEventListener('click', addTrade);
    document.getElementById('pairInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('volumeInput').focus();
    });
    document.getElementById('volumeInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTrade();
    });

    // Переключатель P/L
    document.querySelector('[data-type="profit"]').addEventListener('click', function() {
        this.classList.add('active');
        document.querySelector('[data-type="loss"]').classList.remove('active');
    });

    document.querySelector('[data-type="loss"]').addEventListener('click', function() {
        this.classList.add('active');
        document.querySelector('[data-type="profit"]').classList.remove('active');
    });

    // Выход
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('authToken');
        authToken = null;
        currentUser = null;
        trades = [];
        showAuthScreen();
    });

    // Настройки
    document.getElementById('publicProfileToggle').addEventListener('change', async (e) => {
        const isPublic = e.target.checked;

        try {
            const response = await fetch(`${API_BASE}/api/user/public`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ is_public: isPublic })
            });

            if (response.ok) {
                currentUser.is_public = isPublic;
            }
        } catch (error) {
            console.error('Ошибка обновления настроек:', error);
        }
    });

    // Лидерборд
    document.getElementById('refreshLeaderboard').addEventListener('click', loadLeaderboard);
    document.getElementById('leaderboardLimit').addEventListener('change', loadLeaderboard);

    // Экспорт/импорт
    document.getElementById('exportDataBtn').addEventListener('click', exportData);
    document.getElementById('importDataBtn').addEventListener('click', () => {
        document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput').addEventListener('change', importData);
    document.getElementById('clearDataBtn').addEventListener('click', clearAllData);
}

// ========== Работа со сделками ==========
async function loadTrades() {
    try {
        const response = await fetch(`${API_BASE}/api/trades`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            trades = await response.json();
        }
    } catch (error) {
        console.error('Ошибка загрузки сделок:', error);
    }
}

async function addTrade() {
    const pairInput = document.getElementById('pairInput');
    const volumeInput = document.getElementById('volumeInput');
    const isProfit = document.querySelector('[data-type="profit"]').classList.contains('active');

    const pair = pairInput.value.trim();
    const volume = parseFloat(volumeInput.value.trim().replace(',', '.'));

    if (!pair) {
        alert('Введите торговую пару');
        return;
    }

    if (isNaN(volume) || volume <= 0) {
        alert('Введите корректный объем');
        return;
    }

    const newTrade = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        pair: pair.toUpperCase(),
        volume: volume,
        type: isProfit ? 'profit' : 'loss',
        timestamp: Date.now()
    };

    try {
        const response = await fetch(`${API_BASE}/api/trades`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(newTrade)
        });

        if (response.ok) {
            trades.unshift(newTrade);
            renderJournal();
            volumeInput.value = '';
            pairInput.focus();
        }
    } catch (error) {
        console.error('Ошибка добавления сделки:', error);
    }
}

async function deleteTrade(tradeId) {
    try {
        const response = await fetch(`${API_BASE}/api/trades/${tradeId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            trades = trades.filter(t => t.id !== tradeId);
            renderJournal();
        }
    } catch (error) {
        console.error('Ошибка удаления сделки:', error);
    }
}

function renderJournal() {
    const tradesList = document.getElementById('tradesList');

    if (trades.length === 0) {
        tradesList.innerHTML = '<li class="empty-state">∅ НЕТ СДЕЛОК</li>';
    } else {
        tradesList.innerHTML = trades.map(trade => {
            const isProfit = trade.type === 'profit';
            return `
                <li class="trade-item ${isProfit ? 'trade-profit' : 'trade-loss'}">
                    <span class="trade-pair">${trade.pair}</span>
                    <span class="trade-volume">${trade.volume.toFixed(2)}</span>
                    <span class="trade-pl ${isProfit ? 'profit-text' : 'loss-text'}">
                        ${isProfit ? '+' : '−'} ${trade.volume.toFixed(2)}
                    </span>
                    <button class="delete-btn" onclick="deleteTrade('${trade.id}')">🗑️</button>
                </li>
            `;
        }).join('');
    }

    updateStats();
}

function updateStats() {
    let totalPL = 0;
    let wins = 0;

    trades.forEach(t => {
        if (t.type === 'profit') {
            totalPL += t.volume;
            wins++;
        } else {
            totalPL -= t.volume;
        }
    });

    const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

    const totalPLEl = document.getElementById('totalPL');
    totalPLEl.textContent = (totalPL >= 0 ? '+' : '−') + ' $' + Math.abs(totalPL).toFixed(2);
    totalPLEl.className = `stat-value ${totalPL > 0 ? 'profit-text' : totalPL < 0 ? 'loss-text' : 'neutral-text'}`;

    const winRateEl = document.getElementById('winRate');
    winRateEl.textContent = winRate.toFixed(1) + '%';
    winRateEl.className = `stat-value ${winRate >= 50 ? 'profit-text' : winRate > 0 ? 'loss-text' : 'neutral-text'}`;
}

function updateDate() {
    const now = new Date();
    document.getElementById('currentDate').textContent = now.toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'short', year: 'numeric'
    }).toUpperCase();
}

// ========== Лидерборд ==========
async function loadLeaderboard() {
    const limit = document.getElementById('leaderboardLimit').value;
    const tbody = document.getElementById('leaderboardBody');

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;">Загрузка...</td></tr>';

    try {
        const response = await fetch(`${API_BASE}/api/leaderboard?limit=${limit}`);
        const data = await response.json();

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;">Нет публичных профилей</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(row => `
            <tr>
                <td>${row.rank}</td>
                <td>${row.username}</td>
                <td class="${row.totalPL >= 0 ? 'profit-text' : 'loss-text'}">
                    ${row.totalPL >= 0 ? '+' : ''}$${row.totalPL.toFixed(2)}
                </td>
                <td>${row.totalTrades}</td>
                <td>${row.winRate}%</td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;">Ошибка загрузки</td></tr>';
    }
}

// ========== Настройки ==========
function updateProfileDisplay() {
    if (currentUser) {
        document.getElementById('profileUsername').textContent = currentUser.username;
        document.getElementById('publicProfileToggle').checked = currentUser.is_public;
    }
}

function exportData() {
    const data = {
        trades: trades,
        exportDate: new Date().toISOString(),
        version: '2.0'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trader-journal-${currentUser.username}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);

            if (data.trades && Array.isArray(data.trades)) {
                if (confirm(`Импортировать ${data.trades.length} сделок? Текущие данные будут заменены.`)) {
                    const response = await fetch(`${API_BASE}/api/trades/sync`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`
                        },
                        body: JSON.stringify({ trades: data.trades })
                    });

                    if (response.ok) {
                        await loadTrades();
                        renderJournal();
                        alert('Данные успешно импортированы!');
                    }
                }
            }
        } catch (error) {
            alert('Ошибка чтения файла');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

async function clearAllData() {
    if (confirm('Удалить ВСЕ сделки? Это действие нельзя отменить!')) {
        try {
            const response = await fetch(`${API_BASE}/api/trades/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ trades: [] })
            });

            if (response.ok) {
                trades = [];
                renderJournal();
                alert('Все данные удалены');
            }
        } catch (error) {
            alert('Ошибка очистки данных');
        }
    }
}

// Глобальная функция для удаления
window.deleteTrade = deleteTrade;