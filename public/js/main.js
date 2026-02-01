/**
 * МГНОВЕННЫЙ БАРЬЕР АВТОРИЗАЦИИ
 * Срабатывает до загрузки DOM
 */
(function() {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    // Если данных нет, немедленно перенаправляем на индекс
    if (!token || !userStr) {
        window.location.replace('index.html');
        return;
    }

    // Проверка прав для админки
    const user = JSON.parse(userStr);
    if (window.location.pathname.includes('admin.html') && user.role !== 'admin') {
        window.location.replace('dashboard.html');
    }
})();

// =============================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// =============================================
const token = localStorage.getItem('token');
let currentUser = null;

try {
    currentUser = JSON.parse(localStorage.getItem('user'));
} catch (e) {
    console.error('Ошибка парсинга профиля:', e);
}

// =============================================
// 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ DOM
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    if (!currentUser || !currentUser.login) {
        console.error('Данные пользователя отсутствуют. Выход...');
        logout();
        return;
    }

    console.log('✅ Система инициализирована. Юзер:', currentUser.login);
    
    renderNavigation();      // Рисуем кнопки меню
    updateHeaderProfile();   // Заполняем имя и аватар справа
    setupProfileLogic();     // Оживляем клик по профилю
    setupGlobalModals();     // Подключаем модальные окна
});

// =============================================
// 3. ГЕНЕРАЦИЯ МЕНЮ (NAVBAR)
// =============================================
function renderNavigation() {
    const container = document.getElementById('nav-links-container');
    if (!container) return;

    const menuItems = [
        { name: 'Главная', link: 'dashboard.html', icon: 'fa-home', roles: ['all'] },
        { name: 'Таблица', link: 'editor.html', icon: 'fa-table', roles: ['all'] },
        { name: 'Файлы', link: 'files.html', icon: 'fa-folder', roles: ['all'] },
        { name: 'Чат', link: 'chat.html', icon: 'fa-comments', roles: ['all'] },
        { name: 'Админка', link: 'admin.html', icon: 'fa-user-shield', roles: ['admin'] }
    ];

    container.innerHTML = '';
    const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';

    menuItems.forEach(item => {
        const hasAccess = item.roles.includes('all') || item.roles.includes(currentUser.role);
        
        if (hasAccess) {
            const a = document.createElement('a');
            a.href = item.link;
            a.className = `nav-item ${currentPage === item.link ? 'active' : ''}`;
            a.innerHTML = `<i class="fas ${item.icon}"></i> <span>${item.name}</span>`;
            container.appendChild(a);
        }
    });
}

// =============================================
// 4. ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ (ПРАВЫЙ УГОЛ)
// =============================================
function updateHeaderProfile() {
    const nameEl = document.getElementById('header-username');
    const avatarEl = document.getElementById('header-avatar');

    if (currentUser && currentUser.login) {
        // Обновляем текст с "Загрузка..." на Логин
        if (nameEl) nameEl.textContent = currentUser.login;
        
        // Буква для аватара
        if (avatarEl) {
            avatarEl.textContent = currentUser.login.charAt(0).toUpperCase();
        }
    }
}

function setupProfileLogic() {
    const trigger = document.getElementById('profile-trigger');
    const dropdown = document.getElementById('profile-dropdown');
    const logoutBtn = document.getElementById('btn-logout-action');

    if (trigger && dropdown) {
        // Переключение выпадающего меню
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });

        // Закрытие при клике вовне
        document.addEventListener('click', (e) => {
            if (!trigger.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
}

// =============================================
// 5. МОДАЛЬНЫЕ ОКНА
// =============================================
function setupGlobalModals() {
    const passModal = document.getElementById('password-modal');
    const openPassBtn = document.getElementById('btn-change-pass');
    const editModal = document.getElementById('edit-user-modal');

    // Кнопки закрытия (крестики)
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = () => {
            if (passModal) passModal.style.display = 'none';
            if (editModal) editModal.style.display = 'none';
        };
    });

    if (openPassBtn && passModal) {
        openPassBtn.onclick = (e) => {
            e.preventDefault();
            passModal.style.display = 'flex';
        };
    }

    // Закрытие по клику на серый фон
    window.addEventListener('click', (e) => {
        if (e.target === passModal) passModal.style.display = 'none';
        if (e.target === editModal) editModal.style.display = 'none';
    });
}

// =============================================
// 6. СИСТЕМНЫЕ ФУНКЦИИ
// =============================================
function logout() {
    localStorage.clear();
    // Используем replace, чтобы очистить историю переходов
    window.location.replace('index.html');
}

/**
 * Универсальный fetch с авторизацией
 */
async function authorizedFetch(url, options = {}) {
    const headers = options.headers || {};
    headers['Authorization'] = `Bearer ${token}`;
    
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await fetch(url, { ...options, headers });
        if (response.status === 401) {
            logout();
            return null;
        }
        return response;
    } catch (err) {
        console.error('Network error:', err);
        return null;
    }
}