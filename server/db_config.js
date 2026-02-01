// Подключаем библиотеку для работы с переменными окружения (.env)
require('dotenv').config();

// Подключаем "Пул" из библиотеки pg
const { Pool } = require('pg');

// Создаем конфигурацию подключения, читая данные из .env
// Если каких-то данных нет, сервер сообщит об ошибке
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// --- Проверка подключения при запуске ---
// Мы пробуем выполнить простейший запрос (получить время), 
// чтобы убедиться, что пароль верный и база доступна.
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ ОШИБКА ПОДКЛЮЧЕНИЯ К БД:', err.message);
        console.error('Проверьте файл .env и запущен ли PostgreSQL.');
    } else {
        console.log('✅ Успешное подключение к PostgreSQL!');
        console.log(`   Время на сервере БД: ${res.rows[0].now}`);
    }
});

// Экспортируем объект, чтобы другие файлы могли делать запросы
module.exports = {
    // Обертка для выполнения простых запросов
    query: (text, params) => pool.query(text, params),
    
    // Экспортируем сам пул. Это нужно для ТРАНЗАКЦИЙ,
    // когда нам нужно выполнить несколько команд подряд как одно целое
    // (например: проверить права -> обновить ячейку -> записать историю).
    pool: pool 
};