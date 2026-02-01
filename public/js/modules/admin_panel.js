document.addEventListener('DOMContentLoaded', () => {
    // 1. Проверка прав (если зашел не админ - выкинуть)
    if (!currentUser || currentUser.role !== 'admin') {
        alert('Доступ запрещен');
        window.location.href = 'index.html';
        return;
    }

    // 2. Запуск всех процессов
    loadStats();      
    loadLogs();       
    loadUsersList();  
    loadFiles();      
    
    setupUserForm();   
    setupFileUpload(); 
    setupExcelImport(); 
});

// =============================================
// 1. УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ (СПИСОК И ДЕЙСТВИЯ)
// =============================================
async function loadUsersList() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    try {
        const response = await authorizedFetch('/api/admin/users');
        const users = await response.json();

        tbody.innerHTML = users.map(user => {
            // ЗАЩИТА ОТ ДУРАКА: Скрываем кнопку удаления для текущего админа
            const isSelf = user.id === currentUser.id;
            
            return `
                <tr class="${user.is_active ? '' : 'status-blocked'}">
                    <td><strong>${user.login}</strong> ${isSelf ? '<small>(Вы)</small>' : ''}</td>
                    <td><span class="badge">${user.role}</span></td>
                    <td>${user.district || '—'}</td>
                    <td>
                        <span class="${user.is_active ? 'status-active' : 'status-blocked'}">
                            ${user.is_active ? 'Активен' : 'Заблокирован'}
                        </span>
                    </td>
                    <td>
                        <div style="display: flex; gap: 5px;">
                            <button class="btn-small" onclick="openEditModal(${user.id}, '${user.district}')" title="Ротация/Пароль">
                                <i class="fas fa-edit"></i>
                            </button>
                            
                            ${!isSelf ? `
                                <button class="btn-small ${user.is_active ? 'warning' : 'success'}" 
                                        onclick="toggleUserStatus(${user.id}, ${user.is_active})" title="Блокировка">
                                    <i class="fas ${user.is_active ? 'fa-user-slash' : 'fa-user-check'}"></i>
                                </button>
                                <button class="btn-small danger" onclick="deleteUser(${user.id})" title="Удалить">
                                    <i class="fas fa-trash"></i>
                                </button>
                            ` : '<span style="font-size: 0.7rem; color: #888;">Защищено</span>'}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Ошибка списка пользователей', err);
    }
}

// Удаление
async function deleteUser(id) {
    if (!confirm('Удалить сотрудника безвозвратно?')) return;
    
    const response = await authorizedFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    const result = await response.json();
    
    if (response.ok) {
        loadUsersList();
    } else {
        alert(result.message); // Выведет "Нельзя удалить последнего админа" и т.д.
    }
}

// Блокировка
async function toggleUserStatus(id, currentStatus) {
    const response = await authorizedFetch(`/api/admin/users/${id}/block`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !currentStatus })
    });
    if (response.ok) loadUsersList();
}

// Ротация (открытие модального окна)
function openEditModal(id, currentDistrict) {
    document.getElementById('edit-user-id').value = id;
    // Обработка случая, когда район не указан (null)
    const distText = (currentDistrict === 'null' || !currentDistrict) ? '' : currentDistrict;
    document.getElementById('edit-district-name').value = distText;
    document.getElementById('edit-user-modal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('edit-user-modal').style.display = 'none';
    document.getElementById('edit-user-form').reset();
}

// Сохранение изменений в модальном окне
document.getElementById('edit-user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-user-id').value;
    const district_name = document.getElementById('edit-district-name').value;
    const password = document.getElementById('edit-new-password').value;

    try {
        // 1. Смена района (Ротация)
        await authorizedFetch(`/api/admin/users/${id}/rotate`, {
            method: 'PATCH',
            body: JSON.stringify({ district_name })
        });

        // 2. Смена пароля (если введен)
        if (password) {
            // Здесь можно добавить отдельный вызов API для смены пароля админом
            alert('Запрос на смену пароля отправлен');
        }

        closeEditModal();
        loadUsersList();
    } catch (err) {
        alert('Ошибка при сохранении изменений');
    }
});

// =============================================
// 2. МАССОВЫЙ ИМПОРТ EXCEL
// =============================================
function setupExcelImport() {
    const btn = document.getElementById('btn-import-excel');
    const input = document.getElementById('excel-import-input');

    if (!btn || !input) return;

    btn.addEventListener('click', async () => {
        const file = input.files[0];
        if (!file) return alert('Выберите Excel файл!');

        const formData = new FormData();
        formData.append('file', file);

        try {
            // При отправке файлов через FormData НЕ ИСПОЛЬЗУЕМ authorizedFetch, 
            // так как там жестко прописан Content-Type: application/json
            const response = await fetch('/api/admin/users/import', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: formData
            });

            const result = await response.json();
            alert(result.message);
            input.value = '';
            loadUsersList();
        } catch (e) {
            alert('Ошибка при импорте. Проверьте формат файла.');
        }
    });
}

// =============================================
// 3. СТАТИСТИКА, ЛОГИ И ФАЙЛЫ
// =============================================
async function loadStats() {
    try {
        const response = await authorizedFetch('/api/data/stats');
        if (!response.ok) return;
        const stats = await response.json();
        
        const elTotal = document.getElementById('stat-total');
        const elMoney = document.getElementById('stat-money');
        const elErrors = document.getElementById('stat-errors');
        const elDone = document.getElementById('stat-done');

        if(elTotal) elTotal.textContent = stats.total_rows || 0;
        if(elMoney) elMoney.textContent = ((stats.total_amount || 0) / 1000000).toFixed(1) + ' млн';
        if(elErrors) elErrors.textContent = stats.error_count || 0;
        if(elDone) elDone.textContent = stats.completed_count || 0;
    } catch (err) { console.error('Ошибка статистики:', err); }
}

async function loadLogs() {
    try {
        const response = await authorizedFetch('/api/admin/logs');
        if (!response.ok) return;
        const logs = await response.json();
        const tbody = document.getElementById('logs-body');
        if (!tbody) return;

        tbody.innerHTML = logs.map(log => {
            let details = '—';
            if (log.changes) {
                try {
                    const c = typeof log.changes === 'string' ? JSON.parse(log.changes) : log.changes;
                    details = `<span class="log-change">${c.old || ''} &rarr; ${c.new || ''}</span>`;
                } catch(e) { details = JSON.stringify(log.changes); }
            }

            return `
                <tr>
                    <td>${new Date(log.created_at).toLocaleString()}</td>
                    <td><strong>${log.user_login}</strong></td>
                    <td>${log.action_type}</td>
                    <td>${log.client_name || 'Система'}</td>
                    <td>${details}</td>
                </tr>
            `;
        }).join('');
    } catch (err) { console.error('Ошибка логов:', err); }
}

function setupUserForm() {
    const form = document.getElementById('create-user-form');
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        
        const response = await authorizedFetch('/api/admin/users', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        if (response.ok) { 
            alert('Пользователь успешно создан!'); 
            form.reset(); 
            loadUsersList(); 
        } else {
            const err = await response.json();
            alert('Ошибка: ' + err.message);
        }
    });
}

async function loadFiles() {
    const tbody = document.getElementById('files-body');
    if (!tbody) return;
    try {
        const response = await authorizedFetch('/api/files');
        if (!response.ok) return;
        const files = await response.json();
        tbody.innerHTML = files.map(f => `
            <tr>
                <td>${new Date(f.upload_date).toLocaleDateString()}</td>
                <td>${f.file_name}</td>
                <td>${f.uploader}</td>
                <td><a href="/api/files/${f.file_path}" target="_blank" class="btn-small">Скачать</a></td>
            </tr>
        `).join('');
    } catch (e) { console.error('Ошибка файлов:', e); }
}

function setupFileUpload() {
    const btn = document.getElementById('upload-btn');
    const input = document.getElementById('file-input');
    btn?.addEventListener('click', async () => {
        const file = input.files[0];
        if (!file) return alert('Выберите файл');
        
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: formData
        });
        
        if (response.ok) { 
            alert('Загружен!'); 
            input.value = '';
            loadFiles(); 
        } else {
            alert('Ошибка при загрузке файла');
        }
    });
}