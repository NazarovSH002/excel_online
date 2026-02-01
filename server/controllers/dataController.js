const db = require('../db_config'); // Доступ к пулу соединений

// Список полей, которые РАЗРЕШЕНО менять (Защита от хакеров)
const ALLOWED_FIELDS = ['client_name', 'contract_number', 'amount', 'status', 'manager_comment', 'has_error'];

// =============================================
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: НАСТРОЙКА СЕССИИ RLS
// =============================================
// Эта функция говорит базе данных, кто сейчас делает запрос.
// Мы должны вызывать её внутри транзакции перед любым SELECT или UPDATE.
const setRLS = async (client, user) => {
    await client.query(`
        SET LOCAL app.current_user_id = '${user.id}';
        SET LOCAL app.current_user_role = '${user.role}';
        SET LOCAL app.current_user_region_id = '${user.region_id || 0}';
        SET LOCAL app.current_user_district_id = '${user.district_id || 0}';
    `);
};

// =============================================
// 1. ПОЛУЧЕНИЕ ДАННЫХ (GET DATA)
// =============================================
const getData = async (req, res) => {
    const client = await db.pool.connect(); // Берем свободного "водителя" (соединение)
    try {
        // 1. Представляемся базе данных
        await setRLS(client, req.user);

        // 2. Делаем запрос.
        // Благодаря RLS, база сама отфильтрует строки.
        // Исполнитель увидит только свои, Админ - все.
        const result = await client.query(`
            SELECT pd.*, u.full_name as executor_name 
            FROM project_data pd
            LEFT JOIN users u ON pd.executor_id = u.id
            ORDER BY pd.id ASC
        `);

        res.json(result.rows);

    } catch (err) {
        console.error('Ошибка получения данных:', err);
        res.status(500).json({ message: 'Ошибка сервера при загрузке данных' });
    } finally {
        client.release(); // ОБЯЗАТЕЛЬНО отпускаем соединение обратно в пул
    }
};

// =============================================
// 2. ТОЧЕЧНОЕ ОБНОВЛЕНИЕ ЯЧЕЙКИ (UPDATE CELL)
// =============================================
const updateCell = async (req, res) => {
    const { id, field, value } = req.body; // Получаем: ID строки, имя колонки, новое значение
    const client = await db.pool.connect();

    try {
        // 1. Проверка безопасности: можно ли менять это поле?
        // Чтобы никто не поменял поле "id" или чужой "executor_id"
        if (!ALLOWED_FIELDS.includes(field)) {
            return res.status(400).json({ message: `Редактирование поля ${field} запрещено` });
        }

        // 2. Начинаем ТРАНЗАКЦИЮ (Все или ничего)
        await client.query('BEGIN');

        // 3. Представляемся (RLS)
        await setRLS(client, req.user);

        // 4. Проверяем, существует ли строка и есть ли доступ
        // Если RLS не пустит, этот запрос ничего не вернет
        const checkQuery = await client.query('SELECT * FROM project_data WHERE id = $1', [id]);
        
        if (checkQuery.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'Доступ запрещен или строка не найдена' });
        }
        
        const oldValue = checkQuery.rows[0][field]; // Запоминаем старое значение для истории

        // 5. Обновляем ячейку
        // Используем безопасную подстановку имени колонки (через двойные кавычки)
        const updateQuery = `
            UPDATE project_data 
            SET "${field}" = $1, 
                last_modified_by = $2, 
                last_modified_at = NOW() 
            WHERE id = $3 
            RETURNING *
        `;
        const updateResult = await client.query(updateQuery, [value, req.user.id, id]);

        // 6. Записываем в ИСТОРИЮ (Audit Logs)
        const logData = JSON.stringify({ old: oldValue, new: value });
        await client.query(`
            INSERT INTO audit_logs (table_name, record_id, user_id, action_type, changes)
            VALUES ('project_data', $1, $2, 'UPDATE', $3)
        `, [id, req.user.id, logData]);

        // 7. Фиксируем изменения
        await client.query('COMMIT');

        // 8. УВЕДОМЛЕНИЕ В РЕАЛЬНОМ ВРЕМЕНИ (Socket.io)
        // Получаем объект socket.io из настроек приложения
        const io = req.app.get('socketio');
        const updatedRow = updateResult.rows[0];
        
        // Отправляем всем в этом районе: "Обновите цифру у себя на экране!"
        io.to(`district_${updatedRow.district_id}`).emit('remote_update', {
            id: id,
            field: field,
            value: value,
            user: req.user.login
        });
        // Админу тоже отправляем
        io.to('admin_room').emit('remote_update', { id, field, value, user: req.user.login });

        res.json({ success: true, message: 'Сохранено', data: updatedRow });

    } catch (err) {
        await client.query('ROLLBACK'); // Если ошибка, отменяем всё
        console.error('Ошибка обновления:', err);
        res.status(500).json({ message: 'Ошибка сохранения' });
    } finally {
        client.release();
    }
};

// =============================================
// 3. СТАТИСТИКА (ДЛЯ DASHBOARD)
// =============================================
const getStats = async (req, res) => {
    const client = await db.pool.connect();
    try {
        await setRLS(client, req.user);

        // Считаем общую сумму и кол-во ошибок
        const stats = await client.query(`
            SELECT 
                COUNT(*) as total_rows,
                SUM(amount) as total_amount,
                COUNT(*) FILTER (WHERE status = 'Завершено') as completed_count,
                COUNT(*) FILTER (WHERE has_error = TRUE) as error_count
            FROM project_data
        `);

        res.json(stats.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Ошибка статистики' });
    } finally {
        client.release();
    }
};

module.exports = { getData, updateCell, getStats };