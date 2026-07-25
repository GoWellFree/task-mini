# Task Mini — аудит архитектуры

Дата аудита: 2026-07-25
Область: весь репозиторий (`frontend/`, `backend/`, `supabase/schema.sql`, конфигурация, CI/CD).
Статус: **только чтение**. Изменения в код, миграции и production не вносились.

---

## 1. Текущее устройство

### Состав репозитория

```
task-mini/
├── frontend/   React 18 + Vite 5 + TS + Tailwind, react-router-dom v6
├── backend/    Express 4 + TS (ESM), node-telegram-bot-api, jsonwebtoken, @supabase/supabase-js
├── supabase/schema.sql   единственный SQL-файл схемы (не миграции — один монолитный DDL)
├── .env.example
└── package.json (root, npm workspaces: frontend + backend)
```

Тестов, CI/CD-конфигурации (`.github/workflows`), Dockerfile, staging-окружения — **нет**.

### Backend

- `src/index.ts` — точка входа: express app, CORS (allowlist из одного `FRONTEND_URL`), `express.json()`, роуты, один общий error handler, регистрация Telegram-команд, вебхук в production.
- `src/lib/env.ts` — типизированный доступ к `process.env`, обязательные переменные валидируются на старте (`required()`), явная проверка `ENABLE_DEV_AUTH` не может быть `true` в production.
- `src/lib/supabase.ts` — единственный клиент Supabase на `SUPABASE_SERVICE_ROLE_KEY`, используется во всех роутах напрямую (нет слоя repositories/services).
- `src/lib/telegramAuth.ts` — проверка `initData` (HMAC SHA-256 по алгоритму Telegram).
- `src/lib/jwt.ts` — `jsonwebtoken`, access-токен на 30 дней, без refresh-токена и без отзыва.
- `src/middleware/auth.ts` — `requireAuth`: парсит `Bearer`, проверяет JWT, дозагружает пользователя из БД.
- `src/lib/bot.ts` — обёртка над `node-telegram-bot-api`: polling в dev, webhook в prod; команды `/start`, `/app`; отправка уведомления о назначении задачи.
- `src/routes/auth.ts`, `workspaces.ts`, `tasks.ts` — вся бизнес-логика и права доступа находятся прямо в роутах (нет `controllers/services/repositories/permissions`).

### Frontend

- `src/lib/telegram.ts` — тонкая обёртка над `window.Telegram.WebApp` (initData, theme, start_param), с fallback вне Telegram.
- `src/lib/AuthContext.tsx` — единственный источник авторизации; хранит JWT в `localStorage`, обменивает `initData` (или `{dev:true}`) на токен через `/api/auth/telegram`.
- `src/lib/api.ts` — тонкий `fetch`-wrapper, без кэширования, без retry, без TanStack Query.
- `src/pages/*` — Home, MyTasks, Workspaces, WorkspaceDetail, CreateTask, TaskDetail, Profile. Данные грузятся через `useEffect` + `api.get`, без единообразных loading/empty/error state (частично есть в `Feedback.tsx`, но не везде применяется системно).
- Deep-link через `start_param`: `invite_<code>`, `task_<id>` — обрабатывается в `App.tsx`.

### Данные (`supabase/schema.sql`)

Таблицы: `users`, `workspaces`, `workspace_members`, `tasks`. RLS **выключен намеренно** (комментарий в файле: весь доступ идёт через backend с service-role ключом). Роли ограничены `owner | member`. Задачи — плоские, без проектов/подзадач/чек-листов/меток/вложений/повторений/напоминаний/soft-delete.

### Модель прав (де-факто)

- Просмотр задачи — любой участник workspace.
- Изменение/удаление — создатель задачи или владелец workspace (`canManageTask`).
- Исполнитель, не являющийся создателем/владельцем — может менять только `status`.
- Проверки прав дублируются построчно в каждом роуте (`getMembership`, `canManageTask`), общего permission-сервиса нет.

---

## 2. Найденные проблемы

### Критичные (безопасность / целостность данных)

1. **Bot token в пути webhook** (`backend/src/index.ts:33`, `POST /webhook/${env.telegramBotToken}`). Токен бота оказывается в URL — попадает в логи прокси/хостинга (Railway), Referer-заголовки, историю прокси. ТЗ прямо требует случайный path + `X-Telegram-Bot-Api-Secret-Token`. Сейчас **ни того, ни другого нет**.
2. **Нет проверки `X-Telegram-Bot-Api-Secret-Token`** на вебхуке — при утечке пути (см. п.1) кто угодно может слать поддельные апдейты `bot.processUpdate(req.body)` без какой-либо аутентификации запроса.
3. **Нет дедупликации `update_id`** — Telegram может повторно доставить тот же апдейт (retry при таймауте), что приведёт к повторной обработке команд/уведомлений.
4. **`initData` максимальный возраст — 24 часа** (`telegramAuth.ts:17`, `MAX_INIT_DATA_AGE_SECONDS = 24*60*60`), тогда как рекомендация Telegram и требование ТЗ — не более 10 минут. Увеличивает окно replay-атаки с перехваченным `initData`.
5. **Сравнение HMAC не constant-time** (`telegramAuth.ts:39`, `computedHash !== hash` — обычное строковое сравнение). Потенциальный тайминг-атака вектор (риск невысокий для HMAC-hex фиксированной длины, но ТЗ явно требует constant-time compare, например `crypto.timingSafeEqual`).
6. **JWT — только долгоживущий access-токен (30 дней), без refresh, без возможности отозвать сессию.** Logout — чисто клиентский (`clearToken()` в `AuthContext.tsx`), сам токен остаётся валиден ещё до 30 дней после «выхода». Нет `user_sessions`, нет "выйти со всех устройств".
7. **Race condition при конкурентном редактировании задачи**: `PATCH /api/tasks/:id` не использует оптимистичную блокировку (нет `version`/`updated_at` в условии `update`). Два одновременных PATCH молча перезапишут друг друга (last-write-wins без предупреждения).
8. **Жёсткое удаление** (`DELETE /api/tasks/:id` → `supabase.from("tasks").delete()`) — нет soft-delete/корзины, случайное или злонамеренное удаление необратимо.

### Существенные (архитектура / поддерживаемость)

9. **Нет слоистой архитектуры.** Вся бизнес-логика, проверки прав и SQL-запросы находятся прямо в `routes/*.ts`. Это затруднит рост функциональности (проекты, подзадачи, автоматизации и т.д.) без масштабного рефакторинга.
10. **Дублирование типов** между `frontend/src/types/index.ts` и `backend/src/types/index.ts` — идентичные интерфейсы `User`, `Workspace`, `Task`, `WorkspaceMemberWithUser` поддерживаются вручную в двух местах; уже частично разошлись (frontend `Task` содержит опциональное `workspace?: { name: string }`, backend — нет `Pick`-варианта и т.д.).
11. **Нет общего формата ошибок.** Все обработчики возвращают `{ error: "текст" }` (строка), без `code`, `details`, `requestId`. Общий error handler в `index.ts:24` тоже отдаёт plain string. Клиенту (и будущим интеграциям/логированию) сложно программно различать типы ошибок.
12. **Нет валидации входных данных через схемы** (Zod и т.п.) — тела запросов приводятся `as {...}` (TypeScript type assertion, не runtime-проверка). Например, в `tasks.ts:73` `req.body as {...}` — если фронтенд (или произвольный клиент API) пришлёт некорректный `dueAt` (не ISO-дата) или переполненную строку, это уйдёт напрямую в Supabase insert без валидации формата/длины.
13. **Роли ограничены `owner | member`.** Нет `admin/manager/viewer`, что не покрывает будущие сценарии (командные/учебные/семейные пространства с разным уровнем доступа).
14. **Инвайт-коды не имеют срока действия, лимита использований, возможности отзыва и хранятся в открытом виде** (`workspaces.invite_code`, `text not null unique`) — бессрочная ссылка, начиная с создания workspace.
15. **Нет rate limiting, Helmet, body size limit, request timeout.** `express.json()` без ограничения размера тела; `cors()` настроен только `origin`, без остальных security headers.
16. **Нет Idempotency-Key** для операций создания (`POST /api/tasks`, `POST /api/workspaces`) — повторная отправка формы при плохой сети создаст дубликаты.
17. **Подозрительные зависимости в корневом `package.json`**: `@supabase/server`, `@supabase/ssr`, `@supabase/supabase-js` объявлены в **root** `package.json`, при этом ни frontend, ни backend не импортируют из корня (backend использует свою собственную зависимость `@supabase/supabase-js` в `backend/package.json`). Это мёртвый вес и потенциально опасный сигнал: наличие `@supabase/ssr`/`@supabase/server` в корне может провоцировать будущий прямой доступ к Supabase из общего кода в обход backend — что запрещено требованиями проекта.
18. **`ENABLE_DEV_AUTH` использует фиксированный `telegram_id: 100000001`** для dev-пользователя (`auth.ts:58`). Если реальный пользователь Telegram когда-либо будет иметь такой числовой ID (крайне маловероятно, но не невозможно на этапе роста), возникнет коллизия аккаунтов. Низкий риск, но стоит учитывать при вводе staging.
19. **Нет пагинации** (`GET /api/tasks/my`, `GET /api/workspaces/:id/tasks` возвращают всё без `limit`/курсора) — на MVP-масштабе не проблема, но потребует переделки API при росте данных (breaking change, если не заложить курсорную пагинацию заранее в `/api/v1/`).
20. **Нет CI/CD.** Нет `.github/workflows`, нет автоматического lint/typecheck/test/build при PR. Нет разделения `development/staging/production` окружений — задеплоено сразу на Vercel/Railway c одним env файлом.
21. **Нет тестов** (unit/integration/E2E) — ни одного `*.test.*` файла в репозитории.
22. **RLS выключен полностью** — это осознанное решение MVP (комментарий в schema.sql), соответствует текущей модели «весь доступ через backend». Согласуется с ограничением проекта «Frontend не обращается к Supabase напрямую», но не даёт defense-in-depth на случай бага в backend-проверках (ТЗ требует добавить RLS как дополнительный слой).

### Незначительные / на будущее

23. Frontend не использует TanStack Query — нет кэширования, optimistic updates, retry, debounce поиска (поиска и фильтров пока просто нет).
24. Нет журнала действий (`activity_log`), уведомлений в приложении (`notifications`), только push через Telegram-бота.
25. N+1 напрямую не обнаружены благодаря небольшому объёму данных и точечным запросам (`maybeNotifyAssignment` делает 2 параллельных запроса, не последовательных), но списки (`workspaces`, `tasks`) не используют пагинацию/индексацию сложных фильтров — при росте данных потребует ревизии.
26. `.env` файлы (`backend/.env`, `frontend/.env`) присутствуют локально на диске, но корректно исключены `.gitignore` и не закоммичены — секреты не утекли в git. Хорошая практика, менять не нужно.

---

## 3. Риски

| Риск | Вероятность | Влияние | Комментарий |
|---|---|---|---|
| Утечка Telegram Bot Token через URL вебхука → поддельные апдейты / захват бота | Средняя | Высокое | Пп. 1–3. Главный security-риск текущей системы. |
| Невозможность отозвать скомпрометированный JWT (30 дней) | Средняя | Среднее | П. 6. Нет server-side revocation. |
| Потеря данных из-за конкурентного редактирования или случайного удаления | Низкая-средняя | Среднее | Пп. 7–8. Пока команда небольшая, но растёт с ростом пользователей. |
| Рефакторинг под P1/P2-функциональность (проекты, подзадачи, автоматизации) без слоистой архитектуры выльется в дублирование и регрессии | Высокая | Среднее | П. 9. Чем позже разделить на слои — тем дороже. |
| Рассинхронизация типов frontend/backend приведёт к runtime-багам, не пойманным TS | Средняя | Среднее | П. 10. |
| Отсутствие CI позволит смёржить ломающие изменения в `main` | Высокая | Среднее | П. 20. Особенно важно перед началом крупного рефакторинга по ТЗ. |
| Бессрочные инвайт-коды используются для несанкционированного доступа к workspace, если код когда-либо утечёт (скриншот, форвард сообщения) | Низкая | Среднее | П. 14. |

---

## 4. План доработки (соответствует приоритетам ТЗ)

Порядок ниже — это тот же P0 → P1 → P2 из ТЗ, привязанный к конкретным находкам этого аудита. Никакие пункты не выполняются до отдельного согласования каждого этапа.

**P0 — фундамент (безопасность и основа)**
1. Исправить вебхук: случайный path + `X-Telegram-Bot-Api-Secret-Token` + `update_id` dedup (закрывает пп. 1–3).
2. `initData`: сократить `MAX_INIT_DATA_AGE_SECONDS` до 10 минут + `crypto.timingSafeEqual` для сравнения хэша (пп. 4–5).
3. Ввести access/refresh JWT, `user_sessions` (hash refresh-токена в БД), отзыв сессий, «выйти со всех устройств» (п. 6).
4. Создать `packages/shared` и перенести общие типы/enum/Zod-схемы, устранив дублирование (п. 10).
5. Добавить Zod-валидацию на все входящие тела запросов (п. 12).
6. Разбить backend на слои `routes/controllers/services/repositories/permissions/validators` и вынести единый `permission service` (п. 9, 13).
7. Единый формат ошибок `{ error: { code, message, details, requestId } }` (п. 11).
8. Helmet, CORS allowlist (уже частично есть), rate limiting, body size limit, request timeout (п. 15).
9. Разобраться с корневыми зависимостями `@supabase/*` — удалить неиспользуемые или переместить туда, где они реально нужны (п. 17).
10. Добавить `.github/workflows` (install/lint/typecheck/unit/integration/build) и минимальный набор критических тестов (пп. 20–21).
11. Настроить `development/staging/production` окружения.
12. Мягкое удаление (`deleted_at`) вместо жёсткого `DELETE` + `version` для optimistic locking (пп. 7–8).

**P1 — основной функционал**
- Личный workspace при регистрации, `user_settings`, проекты, приоритеты, несколько исполнителей, подзадачи, чек-листы, метки, комментарии, поиск (FTS/pg_trgm), фильтры, напоминания, повторяющиеся задачи — всё через отдельные SQL-миграции поверх текущей схемы, без удаления существующих таблиц/колонок. `assignee_id` сохраняется до полной миграции на `task_assignees` (явно требуется ТЗ).
- Роли расширяются до `owner/admin/manager/member/viewer` — миграция данных: текущие `owner`→`owner`, `member`→`member` (безопасное расширение enum/check-constraint, обратная совместимость сохраняется).
- Инвайты: срок действия, лимит использований, отзыв, хранение хэша (п. 14) — новая таблица `workspace_invites`, старое поле `workspaces.invite_code` выводится из эксплуатации поэтапно (сначала dual-write/read).

**P2 — расширение**
- Вложения, зависимости задач, канбан/календарь, автоматизации, массовые операции, импорт/экспорт, статистика — как в ТЗ, поверх уже готового P0/P1 фундамента.

---

## 5. Порядок миграций (без выполнения — план)

Каждый пункт — отдельный SQL-файл, применяется только вперёд (`up`), откат — через отдельный `down`-скрипт или восстановление из бэкапа Supabase. Ничего не удаляется до отдельного подтверждения.

1. `001_add_user_profile_fields.sql` — `users`: `display_name, avatar_url, timezone, locale, onboarding_completed, last_seen_at, updated_at, deleted_at` (все nullable/с default, не ломает существующие строки).
2. `002_create_user_settings.sql` — новая таблица `user_settings`, backfill дефолтных настроек для существующих пользователей.
3. `003_extend_workspace_roles_and_type.sql` — добавить `workspaces.type` (default `'team'` для существующих, кроме личных — потребует отдельного backfill-скрипта для определения personal vs team по эвристике «1 участник»), расширить `workspace_members.role` check-constraint до 5 ролей (обратно совместимо, старые значения валидны).
4. `004_create_projects.sql` — новая таблица `projects`.
5. `005_extend_tasks.sql` — добавить в `tasks`: `project_id, parent_task_id, priority, start_at, completed_at, estimate_minutes, actual_minutes, position, recurrence_rule, recurrence_timezone, next_occurrence_at, version, archived_at, deleted_at` — все nullable/с default, не трогая `assignee_id`.
6. `006_create_task_assignees.sql` — новая таблица + backfill из существующего `tasks.assignee_id` (по одному исполнителю на задачу), `assignee_id` остаётся как deprecated read-fallback до обновления frontend.
7. `007_create_labels_and_checklists.sql`, `008_create_comments_and_attachments.sql`, `009_create_task_dependencies.sql`, `010_create_activity_log.sql`, `011_create_notifications.sql` — независимые новые таблицы, безопасны для добавления в любом порядке после `005`.
8. `012_create_workspace_invites.sql` — новая таблица, `workspaces.invite_code` помечается deprecated (не удаляется).
9. `013_create_automation_tables.sql` — `automation_rules`, `automation_executions`.
10. `014_create_user_sessions.sql` — для refresh-токенов.
11. `015_enable_rls_policies.sql` — включение RLS как доп. уровня после того, как backend permission service покрыт тестами (последний шаг, не раньше P0 п.6).

Каждая миграция — только `ALTER TABLE ... ADD COLUMN` / `CREATE TABLE` / `CREATE INDEX CONCURRENTLY` где уместно. Удаление колонок (`assignee_id`, `invite_code`) — отдельный, явно согласованный этап после того, как frontend и все клиенты переключены на новые таблицы.

## 6. План отката

- Каждая миграция сопровождается парным `down`-скриптом (`DROP COLUMN` / `DROP TABLE`), не применяется автоматически.
- Перед P0/P1 миграциями — снимок (backup) Supabase БД (штатная функция Supabase, ручной триггер, подтверждение у пользователя перед запуском).
- Код деплоится раздельно от миграций: сначала миграция (аддитивная, обратно совместимая), потом код, который может её использовать — откат кода не требует отката миграции.
- Откат кода — стандартный git revert / redeploy предыдущей версии на Vercel/Railway (у обоих есть встроенный rollback на предыдущий деплой).
- Любое умаляющее данные действие (удаление колонки, DROP TABLE, очистка `invite_code`) выполняется только после явного подтверждения пользователя и не ранее чем через согласованный период после переключения всех клиентов на новую схему.

---

## Итог

MVP работает и соответствует заявленному в README объёму: авторизация через Telegram, workspaces, плоские задачи, одно уведомление. Наиболее срочные проблемы — **безопасность вебхука** (пп. 1–3) и **отсутствие CI/тестов** перед началом крупного рефакторинга. Рекомендуется закрыть эти два блока в первую очередь, ещё до начала работ по `packages/shared` и слоистой архитектуре, чтобы дальнейший рефакторинг велся на защищённой и проверяемой базе.

**Данный документ — только аудит. Миграции не запускались, код не изменялся, production не затронут. Жду подтверждения по разделу 4, прежде чем начинать реализацию P0.**
