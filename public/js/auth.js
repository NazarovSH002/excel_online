document.addEventListener('DOMContentLoaded', () => {
    
    // 1. ПРОВЕРКА ПРИ ЗАГРУЗКЕ
    // Если токен уже есть, перекидываем на главную не дожидаясь кликов
    const existingToken = localStorage.getItem('token');
    if (existingToken) {
        window.location.replace('dashboard.html');
        return; 
    }

    const loginForm = document.getElementById('login-form');
    const errorBox = document.getElementById('error-message');
    const loginBtn = document.querySelector('button[type="submit"]');

    // 2. ОБРАБОТКА ВХОДА
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 

            // Сброс состояния интерфейса
            showError(''); // Скрываем ошибки
            setLoading(true); // Блокируем кнопку

            const loginValue = document.getElementById('login').value.trim();
            const passwordValue = document.getElementById('password').value;

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        login: loginValue, 
                        password: passwordValue 
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    // СОХРАНЕНИЕ ДАННЫХ
                    // Важно: сохраняем токен и объект пользователя
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));

                    // ПЕРЕНАПРАВЛЕНИЕ
                    // Используем replace, чтобы стереть страницу входа из истории браузера
                    window.location.replace('dashboard.html');
                } else {
                    showError(data.message || 'Неверный логин или пароль');
                    setLoading(false);
                }
            } catch (err) {
                console.error('Auth Error:', err);
                showError('Сервер недоступен. Проверьте соединение.');
                setLoading(false);
            }
        });
    }

    // Вспомогательная функция для вывода ошибок
    function showError(msg) {
        if (!errorBox) return;
        if (msg) {
            errorBox.textContent = msg;
            errorBox.style.display = 'block';
        } else {
            errorBox.style.display = 'none';
        }
    }

    // Функция блокировки кнопки (защита от двойного клика)
    function setLoading(isLoading) {
        if (!loginBtn) return;
        if (isLoading) {
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Вход...';
        } else {
            loginBtn.disabled = false;
            loginBtn.innerHTML = 'Войти';
        }
    }
});