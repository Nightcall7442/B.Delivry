# Ошибки на сайте: Sentry

Подключён **только публичный сайт** (`apps/web`, проект Sentry `javascript-nextjs`). API, админка и
мобильные приложения в Sentry пока не отправляют ничего.

Включается одной переменной. Без неё Sentry не загружается, ничего не отправляет и не меняет сборку:
разработчик, CI и обычный образ работают как раньше.

## Как включить

1. Sentry → проект → *Settings → Client Keys (DSN)* → скопировать DSN.
2. Собрать сайт с `NEXT_PUBLIC_SENTRY_DSN=<DSN>` (значение вшивается в сборку — менять его после
   сборки нельзя). Для образа:

   ```
   docker build -f Dockerfile \
     --build-arg NEXT_PUBLIC_SENTRY_DSN=https://…@….ingest.sentry.io/… \
     --build-arg NEXT_PUBLIC_SENTRY_ENVIRONMENT=production \
     -t bazar-delivery/web .
   ```

3. Чтобы стеки в Sentry читались (а не «a.js:1:48213»), к сборке добавляют загрузку source maps:
   `SENTRY_ORG` (в нашем случае `no-name-a7`), `SENTRY_PROJECT` (`javascript-nextjs`) и токен
   `SENTRY_AUTH_TOKEN` (*Settings → Developer Settings → Organization Tokens*). Токен — секрет сборки,
   не `--build-arg`:

   ```
   docker build … \
     --build-arg SENTRY_ORG=no-name-a7 --build-arg SENTRY_PROJECT=javascript-nextjs \
     --build-arg SENTRY_RELEASE=$(git rev-parse HEAD) \
     --secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN
   ```

   Без токена карты не создаются и не грузятся. С токеном после сборки в образе не должно остаться
   `*.map`: `find apps/web/.next -name '*.map'` — пусто, кроме трёх файлов edge (их делает сам Next).

## Что уходит в Sentry, а что нет

- **Уходит:** необработанные ошибки в браузере (`error`, `unhandledrejection`), ошибки границ
  `error.tsx` / `global-error.tsx`, ошибки серверных компонентов и обработчиков (Node, через
  `onRequestError`). Не больше 10 отчётов с одной страницы.
- **Не уходит (ожидаемые):** ответы API 4xx (человеку они уже показаны), запросы без ответа
  (нет сети), страница-перехватчик вместо API, не загрузившийся кусок скрипта на плохой сети,
  `ResizeObserver loop`. Ошибки, когда API ответил 5xx, **уходят** — с тегами `api.status`,
  `api.code`, `api.request_id` (по нему запрос находится в логах API).
- **Не уходит никогда:** номера телефонов (`+998…`) и токены сессии (`eyJ…`) заменяются на
  `[phone]` / `[token]` в каждой строке события; IP и cookie не отправляются (`sendDefaultPii: false`).
  Правила — `apps/web/src/lib/monitoring/scrub.ts`, проверены тестами.
- **Только ошибки.** Трассировка, запись сессий (replay) и счётчик «сессий без сбоев» вырезаны из
  сборки (`bundleSizeOptimizations` в `next.config.ts`) — они стоят трафика и не нужны, чтобы
  узнавать об ошибках. Понадобятся — уберите `excludeTracing`, добавьте `tracesSampleRate` в
  `src/lib/monitoring/options.ts` и обычный `Sentry.init` в `instrumentation-client.ts`.

## Как устроено (и почему не «как в мастере»)

Стандартная настройка кладёт SDK в первую загрузку каждой страницы. Здесь страница несёт два слушателя
ошибок (около 1 КБ вместе с тем, что вставляет сам Sentry; общий JS первой загрузки 103 → 104 КБ), а
сам SDK скачивается отдельным куском **при первой ошибке** (~33 КБ по сети, сжатый) и запускается тогда
(`src/lib/monitoring/client.ts`). Покупатель на мобильной сети не платит трафиком за отчёты о чужих
сбоях. Цена: нет «хлебных крошек» до первой ошибки (клики, переходы). Если они важнее трафика —
замените `watchGlobalErrors()` в `src/instrumentation-client.ts` обычным `Sentry.init(...)`.

Источники ошибок внутри SDK (`GlobalHandlers`, `BrowserApiErrors`, `BrowserSession`) выключены: те же
ошибки уже видят наши слушатели, и так лимит «не больше 10 событий с одной страницы» (в `beforeSend`)
остаётся единственным и честным. Сборка: Sentry без токена ничего не делает — иначе он сам включает
source maps для каждой сборки (в образе десятки МБ) и замедляет её.

Сервер: `src/instrumentation.ts` запускает SDK только в Node; middleware (edge) остаётся лёгким.

## Как проверить

Задать DSN, открыть сайт, в консоли браузера: `setTimeout(() => { throw new Error('sentry test') })` —
через несколько секунд ошибка в *Issues*. Отдельно проверить сервер: страница, которая бросает
исключение в серверном компоненте, появится там же с `runtime: node`.

## Чего здесь нет (и стоит помнить)

- Проверено на локальной сборке с приёмником, имитирующим Sentry: браузер (при загрузке ни одного
  запроса к Sentry; первая ошибка подтягивает SDK и уходит; телефон и токен замаскированы; 4xx, нет
  сети, `ChunkLoadError` не уходят; 5xx несёт теги; не больше 10 событий) и Node-сервер из
  `standalone`-сборки (как в образе: без переменных Sentry в рантайме). **Не проверено на настоящем
  Sentry:** приём событий в проекте `javascript-nextjs` и загрузка source maps (нужен токен) ещё ни
  разу не видели живых данных. Сборка образа с `--secret` тоже не прогонялась (в среде нет Docker).
- Реклама-блокировщики режут запросы к `*.sentry.io`. Обход (`tunnelRoute`) не включён: путь
  через наш сервер конфликтует с locale-middleware и добавляет трафик через сервер.
- Админка (`apps/admin`, тоже Next) и API (Fastify) не подключены.
