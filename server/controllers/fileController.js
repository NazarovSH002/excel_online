const db = require('../db_config');
const path = require('path');
const fs = require('fs');

// =============================================
// 1. ЗАГРУЗКА ФАЙЛА (UPLOAD)
// =============================================
const uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Файл не выбран' });
        }

        const { originalname, filename, path: tempPath } = req.file;
        const userId = req.user.id;
        
        // Определяем права видимости файла
        // Если грузит Админ - файл видят все (region_id = NULL)
        // Если Начальник - файл видит только его район
        let regionId = null;
        let districtId = null;

        if (req.user.role === 'manager') {
            regionId = req.user.region_id;
            districtId = req.user.district_id;
        }
        
        // Запись в БД
        const query = `
            INSERT INTO file_uploads (file_name, file_path, uploaded_by, region_id, district_id)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        
        const result = await db.query(query, [originalname, filename, userId, regionId, districtId]);

        res.json({ message: 'Файл загружен', file: result.rows[0] });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Ошибка при сохранении файла' });
    }
};

// =============================================
// 2. СПИСОК ФАЙЛОВ (GET FILES)
// =============================================
const getFiles = async (req, res) => {
    try {
        let query = '';
        let params = [];

        // Админ видит ВСЕ файлы
        if (req.user.role === 'admin') {
            query = `
                SELECT f.*, u.full_name as uploader 
                FROM file_uploads f
                LEFT JOIN users u ON f.uploaded_by = u.id
                ORDER BY f.upload_date DESC
            `;
        } else {
            // Начальники и Исполнители видят:
            // 1. Общие файлы (где region_id IS NULL)
            // 2. Файлы своего района
            query = `
                SELECT f.*, u.full_name as uploader 
                FROM file_uploads f
                LEFT JOIN users u ON f.uploaded_by = u.id
                WHERE (f.district_id = $1 OR f.region_id = $2 OR f.region_id IS NULL)
                ORDER BY f.upload_date DESC
            `;
            params = [req.user.district_id, req.user.region_id];
        }

        const result = await db.query(query, params);
        res.json(result.rows);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Ошибка получения списка файлов' });
    }
};

// =============================================
// 3. СКАЧИВАНИЕ ФАЙЛА
// =============================================
const downloadFile = async (req, res) => {
    try {
        const filename = req.params.filename;
        
        // Проверяем, есть ли такой файл в базе (и есть ли права доступа через RLS/Logic)
        // Для простоты пока проверяем только наличие в папке
        const filePath = path.join(__dirname, '../../uploads', filename);

        if (fs.existsSync(filePath)) {
            res.download(filePath);
        } else {
            res.status(404).json({ message: 'Файл не найден на сервере' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Ошибка скачивания' });
    }
};

module.exports = { uploadFile, getFiles, downloadFile };