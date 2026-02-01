const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

// 1. НАСТРОЙКИ ХРАНИЛИЩА (MULTER)
// Хранилище в памяти для парсинга Excel
const memStorage = multer.memoryStorage();
const uploadExcel = multer({ storage: memStorage });

// Хранилище на диске для обычных файлов (приказы, отчеты)
const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // Сохраняем оригинальное имя с меткой времени, чтобы избежать дублей
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const uploadFile = multer({ storage: diskStorage });

// Подключаем Middleware для защиты
const { authenticateToken, authorizeRoles } = require('./middleware_auth');

// Подключаем Контроллеры
const authController = require('./controllers/authController');
const dataController = require('./controllers/dataController'); 
const adminController = require('./controllers/adminController');
const fileController = require('./controllers/fileController');

// =============================================
// 1. АВТОРИЗАЦИЯ
// =============================================
router.post('/auth/login', authController.login);
router.get('/auth/me', authenticateToken, authController.getMe);

// =============================================
// 2. РАБОТА С ДАННЫМИ (ТАБЛИЦА)
// =============================================
router.get('/data', authenticateToken, dataController.getData);
router.post('/data/update', authenticateToken, dataController.updateCell);
router.get('/data/stats', authenticateToken, dataController.getStats);

// =============================================
// 3. ФАЙЛЫ (ДОКУМЕНТЫ)
// =============================================
// Загрузка на диск
router.post('/files/upload', 
    authenticateToken, 
    authorizeRoles('admin', 'manager'), 
    uploadFile.single('file'), 
    fileController.uploadFile
);

router.get('/files', authenticateToken, fileController.getFiles);
router.get('/files/:filename', authenticateToken, fileController.downloadFile);

// =============================================
// 4. АДМИН-ПАНЕЛЬ (УПРАВЛЕНИЕ СОТРУДНИКАМИ)
// =============================================

// Список сотрудников
router.get('/admin/users', 
    authenticateToken, 
    authorizeRoles('admin'), 
    adminController.getUsers
);

// Создание (Логин = Полное имя)
router.post('/admin/users', 
    authenticateToken, 
    authorizeRoles('admin'), 
    adminController.createUser
);

// Удаление (с защитой от удаления самого себя в контроллере)
router.delete('/admin/users/:id', 
    authenticateToken, 
    authorizeRoles('admin'), 
    adminController.deleteUser
);

// Блокировка
router.patch('/admin/users/:id/block', 
    authenticateToken, 
    authorizeRoles('admin'), 
    adminController.toggleBlockUser
);

// Ротация (Смена района по названию)
router.patch('/admin/users/:id/rotate', 
    authenticateToken, 
    authorizeRoles('admin'), 
    adminController.rotateUser
);

// МАССОВЫЙ ИМПОРТ (Загрузка в память для xlsx)
router.post('/admin/users/import', 
    authenticateToken, 
    authorizeRoles('admin'), 
    uploadExcel.single('file'), 
    adminController.importUsers
);

// Журнал аудита
router.get('/admin/logs', 
    authenticateToken, 
    authorizeRoles('admin'), 
    adminController.getLogs
);

module.exports = router;