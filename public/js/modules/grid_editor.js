// =============================================
// НАСТРОЙКИ И ПЕРЕМЕННЫЕ
// =============================================
const gridBody = document.getElementById('grid-body');
const totalSumEl = document.getElementById('total-sum');
const socket = io(); // Подключаемся к WebSocket серверу

let allRows = []; // Здесь храним загруженные данные (чтобы фильтровать без запросов к БД)
let currentFilter = 'all'; // Текущий фильтр (all, error, completed)

// Поля, которые можно редактировать (должны совпадать с базой данных)
const EDITABLE_FIELDS = ['client_name', 'contract_number', 'amount', 'status', 'manager_comment'];

// =============================================
// 1. ИНИЦИАЛИЗАЦИЯ (ЗАПУСК ПРИ СТАРТЕ)
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Подключаемся к комнате своего района (для уведомлений)
    if (currentUser && currentUser.district_id) {
        socket.emit('join_room', `district_${currentUser.district_id}`);
    } else if (currentUser && currentUser.role === 'admin') {
        socket.emit('join_room', 'admin_room');
    }

    // 2. Загружаем данные
    loadData();

    // 3. Настраиваем поиск и фильтры
    setupFilters();
    
    // 4. Включаем слушатели Socket.io (блокировки)
    setupSocketListeners();
});

// =============================================
// 2. ЗАГРУЗКА И ОТРИСОВКА ДАННЫХ
// =============================================
async function loadData() {
    try {
        const response = await authorizedFetch('/api/data');
        if (!response) return; // Если ошибка авторизации (401)

        allRows = await response.json();
        renderGrid(allRows);
    } catch (err) {
        console.error(err);
        gridBody.innerHTML = '<tr><td colspan="9" class="cell-error">Ошибка загрузки данных</td></tr>';
    }
}

function renderGrid(data) {
    gridBody.innerHTML = ''; // Очищаем таблицу
    let totalSum = 0;

    if (data.length === 0) {
        gridBody.innerHTML = '<tr><td colspan="9" style="text-align:center">Нет данных</td></tr>';
        return;
    }

    data.forEach(row => {
        // Подсчет суммы для футера
        totalSum += Number(row.amount || 0);

        const tr = document.createElement('tr');
        tr.dataset.id = row.id; // ID строки для поиска
        
        // Подсветка ошибок (если флаг has_error = true)
        if (row.has_error) tr.classList.add('row-error');

        // Генерируем HTML строки
        // Обрати внимание: мы добавляем data-field к каждой ячейке, чтобы знать, что правим
        tr.innerHTML = `
            <td>${row.id}</td>
            
            <td class="col-manager-only ${getUserRoleClass()}">
               ${row.region_id} / ${row.district_id}
            </td>
            <td class="col-manager-only ${getUserRoleClass()}">
               ${row.executor_name || 'Не назначен'}
            </td>

            <td class="${isEditable('client_name', row)}" data-field="client_name">
                <div class="cell-content">${row.client_name || ''}</div>
            </td>
            
            <td class="${isEditable('contract_number', row)}" data-field="contract_number">
                <div class="cell-content">${row.contract_number || ''}</div>
            </td>
            
            <td class="${isEditable('amount', row)}" data-field="amount">
                <div class="cell-content">${formatMoney(row.amount)}</div>
            </td>
            
            <td class="${isEditable('status', row)}" data-field="status">
                <div class="cell-content ${getStatusColor(row.status)}">${row.status}</div>
            </td>

            <td class="${isEditable('manager_comment', row)}" data-field="manager_comment">
                <div class="cell-content">${row.manager_comment || ''}</div>
            </td>

            <td style="font-size: 0.75rem; color: #888;">
                ${row.last_modified_at ? new Date(row.last_modified_at).toLocaleTimeString() : '-'}
            </td>
        `;

        gridBody.appendChild(tr);
    });

    // Обновляем ИТОГО
    totalSumEl.textContent = formatMoney(totalSum);

    // Добавляем обработчики кликов на редактируемые ячейки
    attachEditEvents();
}

// =============================================
// 3. ЛОГИКА РЕДАКТИРОВАНИЯ (EXCEL STYLE)
// =============================================
function attachEditEvents() {
    const editables = document.querySelectorAll('.editable');
    
    editables.forEach(td => {
        td.addEventListener('click', function() {
            // Если уже редактируем или заблокировано - выходим
            if (this.querySelector('input') || this.querySelector('select')) return;
            if (this.classList.contains('locked-cell')) {
                alert('Эту ячейку сейчас редактирует другой пользователь!');
                return;
            }

            startEditing(this);
        });
    });
}

function startEditing(td) {
    const field = td.dataset.field;
    const rowId = td.parentElement.dataset.id;
    const contentDiv = td.querySelector('.cell-content');
    const currentValue = contentDiv.textContent; // Берем текущий текст
    
    // 1. Блокируем ячейку для других (Socket)
    socket.emit('lock_cell', { 
        rowId, field, 
        userId: currentUser.id, 
        userName: currentUser.full_name,
        districtId: currentUser.district_id 
    });

    // 2. Создаем поле ввода
    let input;
    
    if (field === 'status') {
        // Для статуса создаем выпадающий список
        input = document.createElement('select');
        input.className = 'status-select';
        input.innerHTML = `
            <option value="В процессе">В процессе</option>
            <option value="Завершено">Завершено</option>
            <option value="Отказ">Отказ</option>
            <option value="Ошибка">Ошибка</option>
        `;
        input.value = currentValue;
    } else {
        // Для остальных полей - обычный инпут
        input = document.createElement('input');
        input.type = field === 'amount' ? 'number' : 'text';
        input.value = field === 'amount' ? parseMoney(currentValue) : currentValue;
        input.className = 'cell-input';
    }

    // 3. Подменяем содержимое ячейки
    contentDiv.style.display = 'none';
    td.appendChild(input);
    input.focus();

    // 4. Обработка сохранения (при потере фокуса)
    const saveHandler = async () => {
        const newValue = input.value;
        
        // Удаляем инпут и возвращаем текст
        input.remove();
        contentDiv.style.display = 'block';

        // Снимаем блокировку
        socket.emit('unlock_cell', { rowId, field, districtId: currentUser.district_id });

        // Если значение не поменялось - ничего не делаем
        if (newValue === (field === 'amount' ? parseMoney(currentValue) : currentValue)) {
            return; 
        }

        // ОТПРАВКА НА СЕРВЕР
        try {
            const response = await authorizedFetch('/api/data/update', {
                method: 'POST',
                body: JSON.stringify({ id: rowId, field, value: newValue })
            });
            
            if (response.ok) {
                // Обновляем визуально (форматируем деньги, если надо)
                contentDiv.textContent = field === 'amount' ? formatMoney(newValue) : newValue;
                if (field === 'status') {
                    contentDiv.className = `cell-content ${getStatusColor(newValue)}`;
                }
                // Подсвечиваем зеленым на секунду
                td.style.backgroundColor = '#dcfce7'; 
                setTimeout(() => td.style.backgroundColor = '', 1000);
            } else {
                alert('Ошибка сохранения!');
                contentDiv.textContent = currentValue; // Вернуть как было
            }
        } catch (e) {
            console.error(e);
            alert('Ошибка сети');
            contentDiv.textContent = currentValue;
        }
    };

    // Сохраняем при потере фокуса (Blur) или нажатии Enter
    input.addEventListener('blur', saveHandler);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
    });
}

// =============================================
// 4. SOCKET.IO (СИНХРОНИЗАЦИЯ В РЕАЛЬНОМ ВРЕМЕНИ)
// =============================================
function setupSocketListeners() {
    
    // Кто-то начал редактировать ячейку
    socket.on('cell_locked', (data) => {
        // Находим нужную ячейку
        const row = document.querySelector(`tr[data-id="${data.rowId}"]`);
        if (row) {
            const cell = row.querySelector(`td[data-field="${data.field}"]`);
            if (cell) {
                cell.classList.add('locked-cell');
                // Добавляем бейдж с именем
                const badge = document.createElement('div');
                badge.className = 'locked-badge';
                badge.textContent = data.userName;
                cell.appendChild(badge);
            }
        }
    });

    // Кто-то закончил редактировать
    socket.on('cell_unlocked', (data) => {
        const row = document.querySelector(`tr[data-id="${data.rowId}"]`);
        if (row) {
            const cell = row.querySelector(`td[data-field="${data.field}"]`);
            if (cell) {
                cell.classList.remove('locked-cell');
                const badge = cell.querySelector('.locked-badge');
                if (badge) badge.remove();
            }
        }
    });

    // Данные обновились на сервере (обновляем у себя без перезагрузки)
    socket.on('remote_update', (data) => {
        // data = { id, field, value, user }
        const row = document.querySelector(`tr[data-id="${data.id}"]`);
        if (row) {
            const cell = row.querySelector(`td[data-field="${data.field}"]`);
            if (cell) {
                const content = cell.querySelector('.cell-content');
                if (content) {
                    content.textContent = data.field === 'amount' ? formatMoney(data.value) : data.value;
                    // Моргаем желтым, чтобы привлечь внимание
                    cell.style.transition = 'background 0.5s';
                    cell.style.backgroundColor = '#fef9c3';
                    setTimeout(() => cell.style.backgroundColor = '', 2000);
                }
            }
        }
    });
}

// =============================================
// 5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ И ФИЛЬТРЫ
// =============================================

// Проверка: можно ли юзеру редактировать эту ячейку?
function isEditable(field, row) {
    // Инспектор не может ничего
    if (currentUser.role === 'inspector') return '';
    
    // Исполнитель не может править комментарий начальника и статус Ошибки
    if (currentUser.role === 'executor') {
        if (field === 'manager_comment') return '';
        if (field === 'has_error') return ''; // Исполнитель не снимает метку ошибки сам
    }
    
    // В остальных случаях - можно
    return 'editable'; 
}

// Скрытие колонок для исполнителей
function getUserRoleClass() {
    return currentUser.role === 'executor' ? 'hidden-col' : '';
}

// Форматирование денег (10000 -> 10 000.00)
function formatMoney(value) {
    if (!value) return '0.00';
    return new Intl.NumberFormat('ru-RU', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    }).format(value);
}

// Обратное форматирование (10 000.00 -> 10000)
function parseMoney(str) {
    return str.replace(/\s/g, '').replace(',', '.');
}

// Цвета статусов
function getStatusColor(status) {
    if (status === 'Завершено') return 'status-done';
    if (status === 'Отказ' || status === 'Ошибка') return 'status-reject';
    return 'status-process';
}

// Поиск и Фильтрация
function setupFilters() {
    const searchInput = document.getElementById('global-search');
    const filterBtns = document.querySelectorAll('.filter-btn');

    // Поиск при вводе текста
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#grid-body tr');
        
        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    });

    // Кнопки фильтров
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Убираем активный класс у всех
            filterBtns.forEach(b => b.classList.remove('active'));
            // Ставим активной нажатую кнопку
            btn.classList.add('active');
            
            const filterType = btn.dataset.filter;
            applyFilter(filterType);
        });
    });
}

function applyFilter(type) {
    const rows = document.querySelectorAll('#grid-body tr');
    rows.forEach(row => {
        const status = row.querySelector('td[data-field="status"]')?.textContent.trim();
        const isError = row.classList.contains('row-error');

        if (type === 'all') {
            row.style.display = '';
        } else if (type === 'error') {
            row.style.display = (status === 'Ошибка' || isError) ? '' : 'none';
        } else if (type === 'completed') {
            row.style.display = status === 'Завершено' ? '' : 'none';
        }
    });
}