const jwt = require('jsonwebtoken');
require('dotenv').config();

// =============================================
// 1. ПРОВЕРКА АВТОРИЗАЦИИ (ЕСТЬ ЛИ ТОКЕН?)
// =============================================
const authenticateToken = (req, res, next) => {
    // Клиент должен прислать заголовок: Authorization: Bearer <сам_токен>
    const authHeader = req.headers['authorization'];
    
    // Отделяем слово "Bearer" от самого токена
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ message: 'Ошибка доступа: Токен не предоставлен' });
    }

    // Проверяем подпись токена секретным ключом из .env
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error('Ошибка верификации токена:', err.message);
            return res.status(403).json({ message: 'Ошибка доступа: Токен недействителен или истек' });
        }

        // Если все ок, мы "приклеиваем" данные пользователя к запросу.
        // Теперь в любом следующем файле (контроллере) мы сможем написать req.user
        // и узнать, кто делает запрос.
        req.user = user;
        
        // Передаем управление дальше (в контроллер)
        next();
    });
};

// =============================================
// 2. ПРОВЕРКА РОЛЕЙ (RBAC)
// =============================================
// Эта функция позволяет ограничить доступ к конкретным маршрутам.
// Пример использования: router.get('/users', authorizeRoles('admin'), ...)
const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        // req.user появляется благодаря функции authenticateToken выше
        if (!req.user || !req.user.role) {
            return res.status(403).json({ message: 'Роль пользователя не определена' });
        }

        // Проверяем, есть ли роль пользователя в списке разрешенных
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                message: `Доступ запрещен. Ваша роль: ${req.user.role}. Требуется: ${allowedRoles.join(', ')}` 
            });
        }

        next();
    };
};

module.exports = { authenticateToken, authorizeRoles };