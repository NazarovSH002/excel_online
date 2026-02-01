const db = require('../db_config');
const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');

// 1. СОЗДАНИЕ ПОЛЬЗОВАТЕЛЯ ВРУЧНУЮ
const createUser = async (req, res) => {
    try {
        const { login, password, role, district_name } = req.body;

        // Отладочный лог — проверьте его в терминале сервера
        console.log(`🚀 Регистрация: ${login}, Роль: ${role}, Район: ${district_name}`);

        if (!login || !password || !role) {
            return res.status(400).json({ message: 'Заполните все обязательные поля' });
        }

        // 1. Проверка существования логина
        const checkUser = await db.query('SELECT id FROM users WHERE login = $1', [login]);
        if (checkUser.rows.length > 0) {
            return res.status(400).json({ message: 'Пользователь с таким логином уже существует' });
        }

        // 2. Хеширование пароля
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        // 3. Поиск ID роли (независимо от регистра)
        const roleRes = await db.query('SELECT id FROM roles WHERE LOWER(name) = LOWER($1)', [role.trim()]);
        const roleId = roleRes.rows[0]?.id;
        
        if (!roleId) {
            return res.status(400).json({ message: `Роль "${role}" не найдена в базе данных` });
        }

        // 4. Поиск ID района (если указан)
        let districtId = null;
        if (district_name && district_name.trim() !== "") {
            const distRes = await db.query('SELECT id FROM districts WHERE name = $1', [district_name.trim()]);
            districtId = distRes.rows[0]?.id || null;
            
            // Если район ввели, но его нет в справочнике — это ошибка
            if (!districtId) {
                return res.status(400).json({ message: `Район "${district_name}" не существует. Создайте его сначала.` });
            }
        }

        // 5. Вставка в базу
        await db.query(`
            INSERT INTO users (login, password_hash, full_name, role_id, district_id, is_active)
            VALUES ($1, $2, $1, $3, $4, true)
        `, [login, hash, roleId, districtId]);

        res.json({ message: 'Сотрудник успешно зарегистрирован' });
    } catch (err) {
        console.error('❌ Ошибка создания пользователя:', err.message);
        res.status(500).json({ message: 'Ошибка сервера: ' + err.message });
    }
};

// 2. ПОЛУЧЕНИЕ СПИСКА ПОЛЬЗОВАТЕЛЕЙ
const getUsers = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT u.id, u.login, r.name as role, d.name as district, u.is_active
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN districts d ON u.district_id = d.id
            ORDER BY u.id ASC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: 'Ошибка загрузки пользователей' });
    }
};

// 3. УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЯ
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const currentAdminId = req.user.id;

        if (parseInt(id) === currentAdminId) {
            return res.status(403).json({ message: 'Вы не можете удалить самого себя!' });
        }

        const userRes = await db.query('SELECT role_id FROM users WHERE id = $1', [id]);
        if (userRes.rows.length === 0) return res.status(404).json({ message: 'Пользователь не найден' });

        const roleRes = await db.query("SELECT id FROM roles WHERE name = 'admin'");
        const adminRoleId = roleRes.rows[0]?.id;

        if (userRes.rows[0].role_id === adminRoleId) {
            const adminCount = await db.query('SELECT count(*) FROM users WHERE role_id = $1', [adminRoleId]);
            if (parseInt(adminCount.rows[0].count) <= 1) {
                return res.status(403).json({ message: 'Нельзя удалить последнего админа!' });
            }
        }

        await db.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ message: 'Пользователь удален' });
    } catch (err) {
        res.status(500).json({ message: 'Ошибка при удалении' });
    }
};

// 4. БЛОКИРОВКА
const toggleBlockUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        await db.query('UPDATE users SET is_active = $1 WHERE id = $2', [is_active, id]);
        res.json({ message: is_active ? 'Разблокирован' : 'Заблокирован' });
    } catch (err) {
        res.status(500).json({ message: 'Ошибка статуса' });
    }
};

// 5. РОТАЦИЯ
const rotateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { district_name } = req.body;

        const distRes = await db.query('SELECT id FROM districts WHERE name = $1', [district_name]);
        if (distRes.rows.length === 0) {
            return res.status(400).json({ message: `Район "${district_name}" не найден` });
        }

        await db.query('UPDATE users SET district_id = $1 WHERE id = $2', [distRes.rows[0].id, id]);
        res.json({ message: 'Район изменен' });
    } catch (err) {
        res.status(500).json({ message: 'Ошибка ротации' });
    }
};

// 6. МАССОВЫЙ ИМПОРТ
const importUsers = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Файл не найден' });

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet);

        let successCount = 0;
        let errorCount = 0;

        for (const row of data) {
            try {
                const { Login, Password, Role, District_Name } = row;
                if (!Login || !Password || !Role) { errorCount++; continue; }

                const hash = await bcrypt.hash(String(Password), 10);
                const roleRes = await db.query('SELECT id FROM roles WHERE LOWER(name) = LOWER($1)', [Role.trim()]);
                const distRes = await db.query('SELECT id FROM districts WHERE name = $1', [District_Name?.trim()]);

                const roleId = roleRes.rows[0]?.id;
                if (!roleId) { errorCount++; continue; }

                const insertRes = await db.query(`
                    INSERT INTO users (login, password_hash, full_name, role_id, district_id, is_active)
                    VALUES ($1, $2, $1, $3, $4, true)
                    ON CONFLICT (login) DO NOTHING RETURNING id
                `, [Login, hash, roleId, distRes.rows[0]?.id || null]);

                insertRes.rows.length > 0 ? successCount++ : errorCount++;
            } catch (e) { errorCount++; }
        }
        res.json({ message: 'Импорт завершен', details: `Успешно: ${successCount}, Ошибок: ${errorCount}` });
    } catch (err) {
        res.status(500).json({ message: 'Ошибка чтения файла' });
    }
};

// 7. ЛОГИ
const getLogs = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT al.*, u.login as user_login, pd.client_name 
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            LEFT JOIN project_data pd ON al.record_id = pd.id
            ORDER BY al.created_at DESC LIMIT 100
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: 'Ошибка логов' });
    }
};

module.exports = { 
    createUser, getUsers, deleteUser, 
    toggleBlockUser, rotateUser, importUsers, getLogs 
};