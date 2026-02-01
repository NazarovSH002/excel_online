const db = require('../db_config'); // Подключаем базу
const bcrypt = require('bcryptjs'); // Для проверки паролей
const jwt = require('jsonwebtoken'); // Для создания токенов
require('dotenv').config();

// =============================================
// ЛОГИН (ВХОД В СИСТЕМУ)
// =============================================
const login = async (req, res) => {
    try {
        const { login, password } = req.body;

        // 1. Простейшая валидация
        if (!login || !password) {
            return res.status(400).json({ message: 'Пожалуйста, введите логин и пароль' });
        }

        // 2. Ищем пользователя в БД
        // Нам нужно достать не только данные юзера, но и название его роли текстом
        const queryText = `
            SELECT u.*, r.name as role_name 
            FROM users u 
            LEFT JOIN roles r ON u.role_id = r.id 
            WHERE u.login = $1
        `;
        const result = await db.query(queryText, [login]);

        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Пользователь не найден' });
        }

        const user = result.rows[0];

        // 3. Проверка пароля
        // ВАЖНО: Мы поддерживаем два типа паролей:
        // А) Простой текст (для наших тестовых данных "123")
        // Б) Зашифрованный хэш (для реальной работы в будущем)
        
        let passwordIsValid = false;

        if (user.password_hash === password) {
            // Если в базе лежит просто "123" и мы ввели "123"
            passwordIsValid = true;
        } else {
            // Пытаемся сравнить как хэш (для будущих пользователей)
            // bcrypt.compare вернет true/false
            passwordIsValid = await bcrypt.compare(password, user.password_hash);
        }

        if (!passwordIsValid) {
            return res.status(401).json({ message: 'Неверный пароль' });
        }

        // 4. Генерация Токена (Пропуска)
        // В токен мы "зашиваем" ID, Роль и Локацию.
        // Это позволит серверу в будущем знать, чей это район, не делая лишних запросов в БД.
        const tokenPayload = {
            id: user.id,
            login: user.login,
            role: user.role_name,         // admin, manager, executor
            region_id: user.region_id,
            district_id: user.district_id
        };

        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
            expiresIn: '24h' // Токен действует 24 часа
        });

        // 5. Отправляем ответ клиенту
        res.json({
            message: 'Успешный вход',
            token: token,
            user: {
                id: user.id,
                full_name: user.full_name,
                role: user.role_name,
                district_id: user.district_id,
                region_id: user.region_id
            }
        });

        console.log(`✅ Пользователь ${user.login} (${user.role_name}) вошел в систему.`);

    } catch (err) {
        console.error('Ошибка при входе:', err);
        res.status(500).json({ message: 'Ошибка сервера при авторизации' });
    }
};

// =============================================
// ПОЛУЧЕНИЕ ИНФОРМАЦИИ О СЕБЕ (GET ME)
// =============================================
// Используется, когда пользователь обновляет страницу, 
// чтобы интерфейс вспомнил, кто сейчас залогинен.
const getMe = async (req, res) => {
    try {
        // req.user уже заполнен в middleware_auth.js
        const user = req.user; 
        res.json({
            user: {
                id: user.id,
                login: user.login,
                role: user.role, // В токене поле называется role, а не role_name
                region_id: user.region_id,
                district_id: user.district_id
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Ошибка получения профиля' });
    }
};

module.exports = { login, getMe };