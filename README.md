# Bazar Delivery

Платформа доставки товаров с базаров, магазинов и локальных торговых точек — Узбекистан.

> Стадия: **backend реализован, витрина — клиентский поток на карте**. API (`apps/api`) и его пакеты
> содержат рабочий код: заказы, доставка, ценообразование, платежи, трекинг,
> уведомления. `apps/web` — мобильный поток в духе карта + шит: адрес по пину,
> базары и магазины, каталог, корзина, оформление, экран ожидания заказа с курьером
> на карте. Данные — фикстуры `src/lib/catalog-data.ts`, заказы и адрес — в localStorage,
> статусы заказа симулируются (`features/orders/simulate.ts`), пока нет `api-client`.
> Карта — Yandex Maps JS API 3.0 при `NEXT_PUBLIC_YANDEX_MAPS_API_KEY`, иначе MapLibre + OpenFreeMap (без ключа).
> Фото товаров и точек — Wikimedia Commons (`packages/storefront/src/photos.ts`), до собственного хранилища.
> `apps/customer` (Expo) — тот же поток нативно: `pnpm --filter @bazar/customer dev` → Expo Go;
> общая логика (фикстуры, цены, статусы, симуляция) в `packages/storefront`.
> Языки: `@bazar/i18n` — каталоги `ru` (эталон) и `uz`, `createT(locale)` с плюралами и `t.money()`;
> переключатель RU/UZ в меню, выбранный язык уходит в профиль (`PATCH /users/me`) — SMS и бот отвечают на нём.
> Публичные правила — `/rules`: гарантия свежести (обращение с экрана заказа 2 ч после доставки)
> и страховка опоздания (`Order.promisedAt`; > 20 мин — стоимость доставки возвращается на баланс автоматически).

## Stack

Turborepo · pnpm · TypeScript (strict) · Next.js · Expo / React Native · Node.js REST API ·
PostgreSQL · Prisma · Redis · Zod · TanStack Query · React Hook Form · Vitest · Playwright ·
Docker · GitHub Actions · OpenTelemetry / Prometheus / Grafana / Loki / Jaeger

## Структура

```
apps/         web · admin · courier · customer · api
packages/     ui · config · types · validation · constants · i18n · api-client · auth · maps · payments · notifications · utils · storefront · mobile
infrastructure/  docker · nginx · monitoring · prometheus · grafana · loki · jaeger
docs/         architecture · api · database · deployment · security · decisions (ADR)
tests/        e2e · integration · load
scripts/
```

## Быстрый старт

```bash
cp .env.example .env        # секреты сгенерировать: openssl rand -hex 32 × 3
pnpm install
```

**Без Docker** (Postgres 18 поднимается из npm-бинарников, данные в `apps/api/.local/pg`, порт 5433):

```bash
pnpm --filter @bazar/api db:local     # оставить запущенным
pnpm --filter @bazar/api db:migrate   # миграции + seed
pnpm --filter @bazar/api dev          # http://localhost:4000/health
pnpm --filter @bazar/web dev          # http://localhost:3000  — клиент (web)
pnpm --filter @bazar/admin dev        # http://localhost:3001  — диспетчерская
pnpm --filter @bazar/courier dev      # Expo: курьер (в браузере: expo start --web)
pnpm --filter @bazar/customer dev     # Expo: клиент
```

Demo-аккаунты после seed (код OTP печатается в лог API): диспетчер `+998710000000`, продавец `+998710000001`, курьеры `+998710000002` (скутер) и `+998710000003` (велосипед); покупатель — любой номер.

Полный цикл локально: покупатель оформляет заказ (web/Expo) → продавец или диспетчер подтверждает → курьер на смене получает оффер, ведёт заказ до «Доставил» → покупатель видит статусы, курьера и оплату вживую по WebSocket. Онлайн-оплата: Payme (Merchant API) и Click (SHOP API) — колбэки на `/webhooks/payments/{payme,click}`; для песочницы заполнить `PAYME_*`/`CLICK_*` и `PAYME_CHECKOUT_URL=https://checkout.test.paycom.uz`.

**С Docker**: `pnpm docker:up` (Postgres на 5432 + Redis), в `.env` поменять порт в `DATABASE_URL` и заполнить `REDIS_URL`.

Волна 2 (возвращаемость): подписки на корзину (`/subscriptions`, джоб каждые 5 минут — без Redis крон эмулируется в процессе), Bazar Plus (`/plus`, `PLUS` в константах), кешбэк 3 % на баланс с оплатой «с баланса», реферальные коды (`/invite`, `?ref=`), «Что забыли?» и «+200 г» в чекауте, «Сегодня привезли» (админка → Точки), отзывы с фото и чаевые после доставки, чат с курьером по WebSocket. Платежи за Plus и чаевые идут через те же Payme/Click по `subject` (`plus:<customerId>:<день>`, `tip:<orderId>:<сумма>`).

Волна 3 (то, чего нет у конкурентов): торг с продавцом («Попросить скидку» в корзине, ответ во вкладке «Торг» кабинета, цена действует сутки), кабинет продавца в админке (роль VENDOR: цены, остатки, фото, «сегодня привезли», выручка), «Прилавок сейчас» (фото витрины на экране точки), список покупок словами (`/list`: текст, диктовка, фото бумажного списка через tesseract.js — модели `rus`+`uzb` скачиваются при первом запросе в `apps/api/.tessdata`), праздничные режимы (Рамазан / Навруз / Курбан: карточка на главной и набор в рельсе; `?holiday=navruz` — предпросмотр), семейная корзина (`/cart?share=…`) и заказ другому человеку (получатель в чекауте, SMS ему при выезде курьера).

Волна 4 (масштаб и B2B): компании с оплатой по счёту (`/business`, админка «Компании» и «Счета», накладная `/orders/:id/invoice`, «Каждый рабочий день»), реклама точек (`promo:<storeId>:<день>`, пометка «Реклама») и аналитика спроса (`/admin/analytics/demand`, вкладка «Спрос»), курьеры махалли (`/neighbour`, подтверждение в «Курьеры», офферы только рядом с домом), кросс-базар («Оформить одной доставкой»: `POST /orders/group`, один курьер и одна доставка на несколько точек одного базара), white-label (`Tenant.branding`, `GET /tenants/current?host=`, страница «Бренд»; web красится CSS-переменными, Expo берёт имя и город), бейджи точек и товаров, наборы «Подарочная корзина» и «Той».

Визуал клиента (Expo и web, регистр «как Мегамаркет»): цвет — кобальт Регистана (`brand-500 #3B6BE3`, одна шкала в пресете Tailwind и `@bazar/mobile`), белый фон, серые плитки `color.tile`/`.tile` без теней, Manrope, один словарь карточек (фото-плитка · серая карточка · пилюля), линейные иконки без эмодзи и 3D — правила в `docs/design-mobile.md`. Своё: лента цен «Базар сегодня» под поиском, сторис прилавков (кольца точек, кобальтовое = утреннее фото, полноэкранный просмотр с продавцом), скользящая пилюля в таб-баре, бенто-главная на web (`market-shell.tsx`, `home-screen.tsx`). Тёмная тема: web — по системе или переключателем в меню (`data-theme`), мобилка — по системе при запуске. Карта осталась только на выборе адреса и трекинге. Фото через `expo-image`, хаптика через `expo-haptics`, pull-to-refresh и скелетоны (`useLoad` в `lib/use-data.ts`), Reanimated (shared-element тайл → товар) и `expo-blur` (матовые шапки) — нативные эффекты видны только в сборке на устройство.

Telegram-бот (трекинг и повтор заказа): создать бота у BotFather и заполнить `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (без `@`), `TELEGRAM_WEBHOOK_SECRET`; при старте API регистрирует вебхук на `${API_BASE_URL}/webhooks/telegram` (нужен публичный https). Покупатель привязывает чат из меню «Telegram-бот» (`POST /notifications/telegram-link` → `t.me/<bot>?start=<code>`); команды `/orders`, `/repeat`; статусы заказа уходят в чат каналом уведомлений. Без токена бот «сухой»: ответы печатаются в лог API.

Redis необязателен: пустой `REDIS_URL` — кеш, сессии, лимитер и очередь работают в памяти процесса (один инстанс). OTP при `SMS_PROVIDER=console` печатается в лог API.

## Архитектурные принципы

- Modular monolith → готов к выделению микросервисов (см. `docs/architecture/`)
- Frontend → api-client → API → services → repositories → database
- Controllers тонкие, бизнес-логика в services, persistence в repositories
- Все статусы заказа — из `@bazar/constants` (state machine)
- Provider abstractions: `MapProvider`, `PaymentProvider`, `NotificationProvider`, `StorageProvider`
- Multi-tenant ready (tenant context на уровне request + `tenantId` в моделях)
- i18n: `uz` · `ru` · `en`; валюта: `UZS` (расширяемо)

## Документация

- [Архитектура](docs/architecture/README.md)
- [Модули backend](docs/architecture/modules.md)
- [База данных](docs/database/README.md)
- [API](docs/api/README.md)
- [Безопасность](docs/security/README.md)
- [Деплой](docs/deployment/README.md)
- [ADR](docs/decisions/README.md)
