# Платформа онлайн-опросов

Сервис на Node.js для создания опросов, публичного сбора ответов, аналитики и экспорта результатов.

Автор с ролью `admin` собирает опрос из вопросов четырёх типов: `single`, `multi`, `text` и `scale`. Респондент может зарегистрироваться, но пройти опубликованный опрос можно и без учётной записи — по короткой ссылке `publicSlug`. Число ответов с одного IP ограничено. Результаты автор смотрит сводкой и выгружает в JSON или PDF.

Стек: Express, PostgreSQL, JWT, EJS и headless Chromium для PDF, Swagger UI.

## Запуск

Нужны Docker и Docker Compose V2. Команда из задания `docker-compose up` в V2 вызывается так:

```bash
docker compose up --build
```

Сервис слушает [http://localhost:3000](http://localhost:3000). Документация API — [http://localhost:3000/docs](http://localhost:3000/docs). Проверка живости: `GET /health`.

При первом старте применяются миграции и создаётся администратор, если такого email ещё нет. Данные PostgreSQL сохраняются в томе `pgdata`. Остановить сервисы:

```bash
docker compose down
```

Файл `.env` необязателен: в `docker-compose.yml` уже стоят значения для локального запуска. Чтобы их заменить, скопируйте пример и поменяйте нужные строки до старта:

```bash
cp .env.example .env
docker compose up --build
```

## Переменные окружения

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `PORT` | `3000` | Порт на хосте, который Compose публикует на контейнер |
| `DATABASE_URL` | `postgres://surveys:surveys@db:5432/surveys` | Подключение к PostgreSQL, задаётся в `docker-compose.yml` |
| `JWT_SECRET` | `change-me-in-production` | Секрет подписи JWT |
| `JWT_EXPIRES_IN` | `12h` | Срок жизни токена |
| `ADMIN_EMAIL` | `admin@example.com` | Email первого администратора |
| `ADMIN_PASSWORD` | `admin12345` | Пароль первого администратора |
| `ADMIN_NAME` | `Администратор` | Имя первого администратора |
| `RATE_LIMIT_WINDOW_MS` | `3600000` | Окно лимита публичных ответов, миллисекунды |
| `RATE_LIMIT_MAX` | `10` | Сколько ответов с одного IP можно сохранить на один опрос за окно |
| `CHROME_PATH` | `/usr/bin/chromium` | Браузер, которым печатается PDF |

Внутри контейнера приложение слушает порт `3000`. `PORT` меняет только порт на хосте.

## Роли и статусы

Регистрация создаёт только `respondent`. Роль `admin` выдаётся стартовому пользователю из переменных окружения. Опросами управляет администратор, и только своими.

Опрос проходит статусы `draft` → `published` → `closed`. Вопросы меняются только в черновике. Публичная ссылка открывает опубликованный опрос. У закрытого опроса ссылка отвечает `409` и новые ответы не принимаются.

## Эндпоинты

Защищённые маршруты требуют заголовок `Authorization: Bearer <token>`.

### Служебное

| Метод | Путь | Доступ | Назначение |
|---|---|---|---|
| `GET` | `/health` | открыт | Сервис и база доступны |
| `GET` | `/docs` | открыт | Swagger UI |

### Авторизация

| Метод | Путь | Доступ | Назначение |
|---|---|---|---|
| `POST` | `/api/auth/register` | открыт | Регистрация респондента |
| `POST` | `/api/auth/login` | открыт | Вход, в ответе JWT |
| `GET` | `/api/auth/me` | токен | Текущий пользователь |

### Опросы

| Метод | Путь | Доступ | Назначение |
|---|---|---|---|
| `GET` | `/api/surveys` | admin | Свои опросы |
| `POST` | `/api/surveys` | admin | Создать черновик |
| `GET` | `/api/surveys/:id` | admin | Один свой опрос |
| `PATCH` | `/api/surveys/:id` | admin | Название и описание, пока опрос не закрыт |
| `DELETE` | `/api/surveys/:id` | admin | Удалить черновик |
| `POST` | `/api/surveys/:id/publish` | admin | Опубликовать |
| `POST` | `/api/surveys/:id/close` | admin | Закрыть |

### Вопросы

| Метод | Путь | Доступ | Назначение |
|---|---|---|---|
| `GET` | `/api/surveys/:id/questions` | admin | Вопросы опроса |
| `POST` | `/api/surveys/:id/questions` | admin | Добавить вопрос в черновик |
| `PATCH` | `/api/surveys/:id/questions/:questionId` | admin | Изменить вопрос черновика |
| `DELETE` | `/api/surveys/:id/questions/:questionId` | admin | Удалить вопрос черновика |

Для `single` и `multi` нужны минимум два разных варианта. Для `scale` — целые границы, нижняя меньше верхней. У `text` нет вариантов и шкалы. Тип после создания не меняется.

### Публичное прохождение

| Метод | Путь | Доступ | Назначение |
|---|---|---|---|
| `GET` | `/api/public/surveys/:slug` | открыт | Опубликованный опрос и вопросы |
| `POST` | `/api/public/surveys/:slug/responses` | открыт | Сохранить ответы |

Токен у отправки ответов необязателен. Если он передан и действителен, прохождение связывается с пользователем. Ответ проверяется по типу вопроса: один вариант, несколько вариантов, текст или целое число шкалы. Лимит считается по сохранённым ответам с IP на конкретный опрос.

### Результаты

| Метод | Путь | Доступ | Назначение |
|---|---|---|---|
| `GET` | `/api/surveys/:id/analytics` | admin | Сводка: доли вариантов, среднее шкалы, тексты |
| `GET` | `/api/surveys/:id/export/json` | admin | Те же результаты файлом JSON |
| `GET` | `/api/surveys/:id/export/pdf` | admin | PDF из шаблона `src/templates/results.ejs` |

## Короткий сценарий

```bash
# войти администратором
curl -s http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"admin12345"}'

# создать черновик, добавить вопросы, опубликовать
# publicSlug из ответа создания — это ссылка
curl -s http://localhost:3000/api/public/surveys/<slug>

# отправить ответы без регистрации.
# Для single нужен optionId, для multi — optionIds, для text — text, для scale — value.
curl -s http://localhost:3000/api/public/surveys/<slug>/responses \
  -H 'Content-Type: application/json' \
  -d '{"respondentName":"Анна","answers":[{"questionId":"<id>","optionId":"<optionId>"}]}'
```

Дальше с токеном администратора: `/api/surveys/<id>/analytics`, `/export/json` и `/export/pdf`. Готовые примеры тел и коды ошибок есть в Swagger.

## Как устроен код

`src/routes` принимает HTTP, `src/services` держит правила, `src/db` подключает PostgreSQL и применяет миграции при старте. Схема без ORM: пользователи, опросы, вопросы с вариантами, прохождения и выбранные ответы. Проверка ответа по типу вопроса собрана в `src/services/answerValidation.js`. PDF не рисуется вручную: данные попадают в EJS-шаблон, HTML печатает Chromium.
