const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const fs = require('fs'); 
const bcrypt = require('bcryptjs'); // Добавлено для создания резервного админа
const db = require('./db_config'); // Твой конфиг базы данных
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 1. ПОДГОТОВКА СЕРВЕРА
// =============================================
// Создаем папку uploads, если её нет
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// ФУНКЦИЯ ЗАЩИТЫ: Проверка наличия администратора
async function ensureAdminExists() {
    try {
        // Ищем любого пользователя с ролью 'admin'
        const res = await db.query(`
            SELECT u.id FROM users u 
            JOIN roles r ON u.role_id = r.id 
            WHERE r.name = 'admin' LIMIT 1
        `);

        if (res.rows.length === 0) {
            console.log("⚠️ КРИТИЧЕСКАЯ ОШИБКА: Администратор не найден в БД!");
            
            // Получаем ID роли админа
            const roleRes = await db.query("SELECT id FROM roles WHERE name = 'admin'");
            if (roleRes.rows.length === 0) {
                console.error("❌ Роль 'admin' не существует в таблице roles. Сначала настройте БД.");
                return;
            }
            const adminRoleId = roleRes.rows[0].id;

            // Создаем стандартного админа
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash('admin123', salt);

            await db.query(`
                INSERT INTO users (login, password_hash, full_name, role_id, is_active)
                VALUES ($1, $2, $3, $4, true)
            `, ['admin', hash, 'Резервный Администратор', adminRoleId]);

            console.log("✅ Создан резервный админ: Логин [admin], Пароль [admin123]");
            console.log("📌 СРОЧНО СМЕНИТЕ ПАРОЛЬ ПОСЛЕ ВХОДА!");
        }
    } catch (err) {
        console.error("❌ Ошибка при проверке администратора:", err.message);
    }
}

// 2. НАСТРОЙКИ (MIDDLEWARE)
// =============================================
app.use(cors()); 
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(uploadDir));

// 3. МАРШРУТЫ (API)
// =============================================
const apiRoutes = require('./routes'); 
app.use('/api', apiRoutes);

// 4. REAL-TIME ЛОГИКА (SOCKET.IO)
// =============================================
io.on('connection', (socket) => {
    console.log('🔌 Новое подключение (Socket):', socket.id);

    socket.on('join_room', (roomName) => {
        socket.join(roomName);
    });

    socket.on('lock_cell', (data) => {
        socket.to(`district_${data.districtId}`).emit('cell_locked', data);
        socket.to('admin_room').emit('cell_locked', data);
    });

    socket.on('unlock_cell', (data) => {
        socket.to(`district_${data.districtId}`).emit('cell_unlocked', data);
        socket.to('admin_room').emit('cell_unlocked', data);
    });

    socket.on('data_updated', (data) => {
        socket.to(`district_${data.districtId}`).emit('remote_update', data);
        socket.to('admin_room').emit('remote_update', data);
    });

    socket.on('join_chat', (data) => {
        socket.join('general');
        console.log(`💬 ${data.user} вошел в общий чат`);
    });

    socket.on('send_message', (data) => {
        io.to('general').emit('receive_message', data);
    });

    socket.on('disconnect', () => {
        console.log('🔌 Клиент отключился:', socket.id);
    });
});

app.set('socketio', io);

// 5. ЗАПУСК СЕРВЕРА
// =============================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`\n🚀 СЕРВЕР ЗАПУЩЕН!`);
    console.log(`   Адрес: http://localhost:${PORT}`);
    
    // Запускаем проверку безопасности сразу после старта
    await ensureAdminExists();
});