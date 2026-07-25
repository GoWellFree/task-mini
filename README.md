# Task Mini

Минимальный Telegram Mini App для управления личными и командными задачами.

Стек: React + TypeScript + Vite + Tailwind (frontend), Node.js + Express + TypeScript (backend), Supabase/PostgreSQL (БД), Telegram Bot API.

## Структура

```
task-mini/
├── frontend/       # Vite + React + TS Mini App
├── backend/        # Express API + Telegram-бот
├── supabase/
│   └── schema.sql  # SQL-схема БД
├── .env.example
└── package.json    # npm workspaces
```

## 1. Подготовка

1. Создайте проект в [Supabase](https://supabase.com), выполните `supabase/schema.sql` в SQL Editor.
2. Создайте бота через [@BotFather](https://t.me/BotFather):
   - `/newbot` — получите `TELEGRAM_BOT_TOKEN`.
   - `/setmenubutton` или `/mybots → Bot Settings → Menu Button` — настройте кнопку меню, либо создайте Mini App через `/newapp`, привязав его к боту.
   - Запомните username бота (без `@`) — это `TELEGRAM_BOT_USERNAME`.
3. Скопируйте `.env.example` в `backend/.env` и заполните значения (URL/ключ Supabase, токен бота, `JWT_SECRET` — любая случайная строка).
4. Создайте `frontend/.env`:
   ```
   VITE_API_URL=http://localhost:3000
   VITE_TELEGRAM_BOT_USERNAME=ваш_бот_username
   ```

## 2. Локальный запуск

```bash
npm install                 # установит зависимости frontend и backend (npm workspaces)
npm run dev:backend         # терминал 1 — API на http://localhost:3000, бот в режиме polling
npm run dev:frontend        # терминал 2 — Vite dev-сервер на http://localhost:5173
```

Локально, вне Telegram, можно авторизоваться как тестовый пользователь — для этого в
`backend/.env` должно быть `ENABLE_DEV_AUTH=true` (значение по умолчанию для разработки).
Frontend в dev-режиме сам обнаружит, что запущен вне Telegram, и отправит на backend
`{ dev: true }` вместо `initData`.

Чтобы протестировать реальный запуск внутри Telegram локально, используйте туннель
(например, `ngrok http 5173`) и укажите публичный HTTPS-адрес в настройках Mini App
в BotFather.

## 3. Миграции БД

Схема меняется только миграциями из `supabase/migrations/`. Для их применения нужен
`DATABASE_URL` в `backend/.env` (Supabase → Project Settings → Database → Connection
string → URI). Приложение этот URL не использует — он нужен только раннеру миграций.

```bash
npm run migrate:status    # что применено, что ожидает
npm run migrate:dry-run   # показать план, ничего не менять
npm run migrate           # применить все ожидающие миграции
```

Каждая миграция выполняется в транзакции и записывается в таблицу
`schema_migrations`, поэтому повторный запуск безопасен. Файлы `*.down.sql` —
это откаты; раннер их никогда не выполняет, откат делается осознанно и вручную.

## 4. Проверка типов и сборка

```bash
npm run typecheck:backend
npm run typecheck:frontend
npm run build:backend
npm run build:frontend
```

## 5. Production-развёртывание

### Frontend — Vercel
1. Импортируйте папку `frontend/` как отдельный проект в Vercel.
2. Build command: `npm run build`, Output directory: `dist`.
3. Переменные окружения: `VITE_API_URL` (URL backend в проде), `VITE_TELEGRAM_BOT_USERNAME`.
4. После деплоя получите домен вида `https://your-app.vercel.app`.

### Backend — Railway или Render
1. Импортируйте папку `backend/` как отдельный сервис.
2. Build command: `npm run build`, Start command: `npm start`.
3. Переменные окружения (как в `.env.example`), с `NODE_ENV=production` и `ENABLE_DEV_AUTH=false`.
4. `FRONTEND_URL` — домен из Vercel (для CORS).
5. После деплоя получите домен вида `https://your-api.up.railway.app`.

### Настройка Telegram webhook (production)

Backend в production ожидает обновления на `POST /webhook/<TELEGRAM_WEBHOOK_PATH>`.
Путь — случайная строка (НЕ токен бота), а каждый запрос дополнительно проверяется
по заголовку `X-Telegram-Bot-Api-Secret-Token`. Сгенерируйте оба значения и укажите
их в переменных окружения backend (`TELEGRAM_WEBHOOK_PATH`, `TELEGRAM_WEBHOOK_SECRET`):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Затем зарегистрируйте webhook одним запросом (замените значения):

```bash
curl -F "url=https://your-api.up.railway.app/webhook/<TELEGRAM_WEBHOOK_PATH>" \
  -F "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
  https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
```

### Привязка Mini App в BotFather
1. `/mybots` → выберите бота → `Bot Settings` → `Menu Button` → укажите URL Vercel-домена.
2. Либо `/newapp`, чтобы создать полноценный Mini App с отдельной ссылкой
   `https://t.me/<bot_username>/app`.
3. Проверьте, что `TELEGRAM_BOT_USERNAME` в переменных окружения совпадает с реальным
   username бота.

### Финальная проверка
1. Откройте бота в Telegram → `/start` → кнопка «Открыть Task Mini».
2. Пройдите сценарий: авторизация → создание группы → приглашение → создание задачи →
   назначение исполнителя → уведомление → смена статуса → «Выполнено».

## Что сознательно не реализовано в MVP

Комментарии, вложения, чек-листы, подзадачи, теги, Kanban, календарь, drag-and-drop,
повторяющиеся задачи, аналитика, кастомные роли, WebSocket/Redis/очереди,
email-уведомления, поиск, архив, журнал изменений, панель администратора — см. ТЗ.
