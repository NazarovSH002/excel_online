import os

# Название корневой папки проекта (если запускаешь внутри пустой папки, файлы создадутся в ней)
project_name = "excel_collab_system"

# Структура папок и файлов
structure = {
    "database": [
        "init_schema.sql",      # Скрипт создания таблиц и связей
        "roles_policy.sql",     # Настройка Row-Level Security (RLS)
        "seed_data.sql"         # Тестовые данные (первый админ, районы)
    ],
    "server": [
        "app.js",               # Главный файл запуска сервера
        "db_config.js",         # Настройки подключения к PostgreSQL
        "routes.js",            # Маршрутизация запросов
        "middleware_auth.js"    # Проверка прав доступа (Admin/Manager/Executor)
    ],
    "server/controllers": [     # Логика обработки данных
        "authController.js",
        "dataController.js",
        "fileController.js",
        "adminController.js"
    ],
    "public": [
        "index.html",           # Страница авторизации
        "dashboard.html",       # Главная панель
        "editor.html",          # Таблица (основной модуль)
        "admin.html",           # Админка
        "chat.html"             # Центр связи
    ],
    "public/css": [
        "style.css",            # Общие стили
        "auth.css",             # Стили входа
        "grid.css",             # Стили таблицы Excel
        "dashboard.css"         # Стили графиков и панелей
    ],
    "public/js": [
        "main.js",              # Общие скрипты
        "auth.js",              # Логика входа
        "socket_client.js"      # Для уведомлений и блокировок в реальном времени
    ],
    "public/js/modules": [      # Модульный JS
        "grid_editor.js",       # Логика редактирования ячеек
        "admin_panel.js",       # Логика админа
        "filters.js"            # Поиск и фильтрация
    ],
    "public/assets/icons": [],  # Папка для иконок
    "uploads": [],              # Папка для загруженных файлов (Excel, PDF)
    ".": [                      # Файлы в корне
        ".env",                 # Переменные окружения (пароли БД)
        ".gitignore",           # Исключения для git
        "README.md",            # Описание проекта
        "package.json"          # Список зависимостей (пустой)
    ]
}

def create_structure():
    base_path = os.getcwd()
    
    print(f"Creating project structure in: {base_path}")

    for folder, files in structure.items():
        # Определяем полный путь к папке
        if folder == ".":
            current_folder = base_path
        else:
            current_folder = os.path.join(base_path, folder)
        
        # Создаем папку, если её нет
        if not os.path.exists(current_folder):
            try:
                os.makedirs(current_folder)
                print(f"[FOLDER] Created: {folder}")
            except OSError as e:
                print(f"Error creating directory {folder}: {e}")

        # Создаем файлы внутри папки
        for file_name in files:
            file_path = os.path.join(current_folder, file_name)
            if not os.path.exists(file_path):
                try:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        # Записываем комментарий-заглушку, чтобы файл не был пустым
                        f.write(f"// File: {file_name}\n// Created automatically for Excel Collab System\n")
                    print(f"  [FILE] Created: {file_name}")
                except IOError as e:
                    print(f"Error creating file {file_name}: {e}")

    print("\n--- Success! Project structure created. ---")

if __name__ == "__main__":
    create_structure()