# browserCAD backend — служба конвертации STEP → GLB

Полное описание архитектуры и логики бэкенда. Документ — канонический источник
проектных решений: при спорах «как задумано» смотрим сюда.

Бэкенд строится в **learning-режиме**: инфраструктура и конфиги готовы, логика
наполняется вручную по урокам — места помечены `TODO (Урок ...)` в docstrings
модулей. Пока маркер не закрыт — соответствующая функция не реализована.

---

## 1. Назначение

Веб-вьюер (`src/`, React + three.js) понимает только полигональные форматы
(.glb/.gltf/.stl). STEP — «инженерный» формат (ISO 10303), хранящий точную
B-Rep-геометрию (поверхности и границы, а не треугольники). Бэкенд принимает
STEP, конвертирует в GLB силами OpenCASCADE и заодно вычисляет точные
инженерные метрики (объём, площадь, габариты), недоступные меш-форматам.

Ключевое свойство выбранной архитектуры: конвертация тяжёлой сборки занимает
минуты, а HTTP-запрос не должен ждать дольше пары секунд. Поэтому «принять
заказ» и «узнать результат» — два разных запроса.

## 2. Архитектура (асинхронная очередь задач)

```
React SPA (Vite)
  │  POST /api/jobs (multipart: .step + параметры)     ← отвечает мгновенно
  │  GET  /api/jobs/<id>      (polling: статус/прогресс)
  │  GET  /api/jobs/<id>/model.glb
  ▼
nginx (тот же домен, /api/ → 127.0.0.1:8000 — CORS не нужен)
  ▼
gunicorn → Flask (лёгкий «приёмщик»: приём файлов, квитанции, опрос статусов)
  │  job_id (строка) в очередь
  ▼
Redis (брокер очереди + журнал заказов; appendonly)
  ▼
Celery worker (--concurrency=2) — «цех»
  │  OCP/OpenCASCADE:
  │    STEPCAFControl_Reader → BRepMesh_IncrementalMesh → RWGltf_CafWriter
  │    метрики: BRepGProp (объём/площадь), BRepBndLib (габариты)
  ▼
STORAGE_DIR/storage/<job_id>/{input.step, output.glb, meta.json}
```

| Компонент | Роль | Что это |
|---|---|---|
| nginx | Вход с табличкой «куда идти» | Веб-сервер перед всем; тот же домен — CORS не нужен |
| gunicorn | Нанимает 2 приёмщиков | Запускает несколько процессов Flask (gthread) |
| Flask (`app/`) | Приёмщик: квитанции и справки | Не конвертирует сам |
| Redis | Журнал заказов + доска очереди | in-memory ключ-значение; переживает ребут (appendonly) |
| Celery | Цех с мастерами | Отдельный процесс, берёт заказы с доски |
| OCP | Станок | Python-привязки OpenCASCADE (пакет `cadquery-ocp`, модуль `OCP`) |
| systemd | Завхоз | Держит процессы живыми на сервере |
| storage/ | Архив с UUID-полками | Каталоги заказов на диске |

## 3. Жизненный цикл заказа (сквозной сценарий)

1. Фронт видит `.step` → `stepConversion.ts` шлёт `POST /api/jobs` (файл + параметры).
2. Flask проверяет расширение и размер, считает **SHA-256** файла:
   - если заказ с тем же хэшем и параметрами уже есть/выполнялся — возвращает
     тот же `job_id` (`"cached": true`) — повторная загрузка бесплатна;
   - иначе: `storage/<uuid>/input.step`, таска в очередь, `202 {"job_id": ...}`.
3. Воркер берёт таску (`job_id` — строка, только примитивы в аргументах),
   пишет в Redis `running` + стадию.
4. Конвейер OCP (см. §5), по стадиям обновляет `progress`/`stage` в Redis.
5. Результат валидируется (не пустой, `meshes > 0`), пишется `output.glb`,
   метрики — в `meta` заказа; `input.step` удаляется.
6. Статус `done` (+ TTL = `RESULT_TTL` на ключ и в расчёте чистки диска).
7. Фронт опрашивает `GET /api/jobs/<id>` (~1 раз/с), при `done` скачивает
   `model.glb`, оборачивает `Blob` в `File` и передаёт в существующую цепочку
   `VirtualFileSystem → ModelViewer` (вьюер не меняется).
8. Через `RESULT_TTL_DAYS` systemd-timer удаляет каталог с полки.

Статусы: `queued → running → done | error`. Ошибки — с русским `message`
для UI; падение воркера возвращает таску в очередь (`acks_late`), файл уже
на диске — перекачка не нужна.

## 4. Структура репозитория

| Путь | Роль | Статус |
|---|---|---|
| `requirements.txt` | Пины: flask 3.1.3, gunicorn 26.2.0, celery[redis] 5.6.3, redis 8.1.0, cadquery-ocp 8.0.1.0.0 | готово |
| `.env.example` / `.gitignore` | Шаблон настроек; `.venv/.env/storage/samples` вне git | готово |
| `wsgi.py` | Точка входа gunicorn | оживёт после M1 |
| `app/settings.py` | ЕДИНСТВЕННЫЙ источник конфига (все остальные только импортируют) | готово |
| `app/__init__.py` | Фабрика `create_app()` | `TODO (Урок M1)` |
| `app/api/jobs.py` | Три маршрута (§6) | `TODO (Урок M1)` |
| `app/api/errors.py` | Единые JSON-ошибки 400/404/413/500 | `TODO (Урок M1)` |
| `app/core/converter.py` | Чистое ядро: только OCP, тестируется как CLI | Урок 2 (чтение/отчёт), Урок 3 (GLB) |
| `app/core/validate.py` | Страховка «GLB не пустой» | `TODO (Урок 3)` |
| `app/tasks/celery_app.py` | Инстанс Celery + антибаговый конфиг | `TODO (Урок M1)` |
| `app/tasks/convert.py` | Таска `convert(job_id)` | `TODO (Урок M1)` |
| `app/services/job_store.py` | Журнал заказов Redis — общий для web/worker | `TODO (Урок M1)` |
| `app/services/storage.py` | UUID-каталоги, абсолютные пути, чистка | `TODO (Урок M1)` |
| `deploy/nginx-api.conf` | `location /api/` | готово |
| `deploy/browsercad-web.service` | systemd: gunicorn | готово |
| `deploy/browsercad-worker.service` | systemd: celery worker | готово |
| `deploy/browsercad-cleanup.{service,timer}` | Ежедневная чистка storage | готово |
| `deploy/deploy_backend.sh` | Парный деплой web+worker одной командой | готово |

## 5. Конвейер конвертации (OCP)

Четыре стадии; `on_stage` — колбэк прогресса (стадийная модель:
read 10% → mesh 70% → metrics 10% → write 10%).

```python
convert_step_to_glb(input_path, output_path, deflection=0.1, angle_deg=0.5, on_stage=None)
```

1. **Чтение** — `STEPCAFControl_Reader` в XDE-документ: сохраняет дерево
   сборки, имена деталей, цвета (`SetNameMode/SetColorMode`). Для простого
   отчёта без дерева — `STEPControl_Reader` (Урок 2).
2. **Триангуляция** — `BRepMesh_IncrementalMesh(compound, deflection, False,
   angle_deg, True)`. `deflection` (мм, 0.01–1.0, дефолт 0.1) — и есть
   «инженерная точность»: максимальное отклонение треугольника от поверхности.
   Параметр API, а не константа.
3. **Метрики B-Rep** (точная геометрия, не сетка): объём/площадь —
   `BRepGProp.VolumeProperties_s/SurfaceProperties_s` (значение — `Mass()`),
   габариты — `BRepBndLib.Add_s → Bnd_Box.Get()` (6 чисел, размеры = разности).
4. **Запись GLB** — `RWGltf_CafWriter` (бинарный), с преобразованием систем:
   `SetInputLengthUnit(0.001)` — мм → метры (glTF измеряет в метрах),
   `SetInputCoordinateSystem(RWMesh_CoordinateSystem_Zup)` — Z-up → Y-up.

**Внимание, версии OCP (проверено интроспекцией на 8.0.1.0.0):**
класс называется `RWGltf_CafWriter`, а НЕ `RWGltf_CAFWriter` (старое имя 7.7–7.9).
Имена классов между версиями OCCT «плывут» — перед использованием нового класса
проверять: `.venv/bin/python -B -c "from OCP.X import Y; print('ok')"`.

После записи — обязательная `validate_glb()`: размер > 1 КБ и `meshes` непустой
в JSON-чанке GLB (страховка от «молча пустого» результата).

## 6. API

| Метод | Путь | Вход | Ответ |
|---|---|---|---|
| `POST` | `/api/jobs` | multipart: `file` (.step/.stp, ≤ MAX_UPLOAD_MB), `deflection` (мм, опц.), `angular` (°, опц.) | `202 {"job_id", "status": "queued", "cached"}`; ошибки 400/413 |
| `GET` | `/api/jobs/<id>` | — | `{status, progress, stage, message, error, meta}`; 404 если неизвестен |
| `GET` | `/api/jobs/<id>/model.glb` | — | файл `model/gltf-binary`; 404 пока не `done` |

`meta` (при `done`): имя файла, размер, deflection, объём (мм³), площадь (мм²),
габариты, число треугольников, время стадий. `message` — на русском, для UI.

Ключи Redis: `job:<id>` (hash: status/progress/stage/message/error/meta);
`job:sha:<sha256>:<deflection>:<angular>` → job_id (дедуп). TTL ставится
только при терминальном статусе.

## 7. Конфигурация

Единственный читатель переменных окружения — `app/settings.py`
(правило «одной правды»: никаких констант в других модулях).
Локально работают дефолты, на сервере значения задаёт systemd
(`EnvironmentFile=/srv/browsercad-backend/.env`).

| Переменная | Смысл | Дефолт (локально) |
|---|---|---|
| `REDIS_URL` | брокер + журнал | `redis://localhost:6379/0` |
| `STORAGE_DIR` | каталог заказов (абсолютный путь на сервере) | `backend/storage` |
| `MAX_UPLOAD_MB` | лимит файла = `client_max_body_size` nginx | 300 |
| `RESULT_TTL_DAYS` | срок жизни результатов — ОДНО значение для Redis и диска | 3 |

Точность: `DEFLECTION_DEFAULT_MM=0.1` (клэмп 0.01–1.0), `ANGULAR_DEFAULT_DEG=0.5`.

## 8. Антибаговая инженерия

Пять правил (подробный разбор классов багов — в истории диалога):

1. **Одна правда о настройках**: один `.env`, один `settings.py`, один venv,
   один юзер `browsercad` на оба процесса.
2. **Заказ передаётся номерком**: аргумент таски — только строка `job_id`;
   объекты OCP непиклируемы, всё читается с диска по номеру.
3. **Перезапуск всегда парный**: `deploy_backend.sh` рестартует web+worker
   одной командой (анти-«unregistered task»).
4. **Единый срок жизни**: `RESULT_TTL_DAYS` обслуживает и TTL Redis-ключей,
   и `mtime +3` в cleanup-юните — состояние не разъезжается.
5. **Мастер переодевается**: `--max-tasks-per-child=20` — рециркуляция воркера
   против тихой утечки нативной памяти OCP.

Конфиг Celery (`app/tasks/celery_app.py`): `task_serializer="json"`,
`task_ignore_result=True` (состояние ведёт job_store, не AsyncResult),
`task_acks_late=True` (упал воркер — таска вернулась), `worker_prefetch_multiplier=1`,
`task_time_limit=1800` / `soft=1500` (зависший OCCT не занимает цех),
`broker_connection_retry_on_startup=True`. Gunicorn — без `--preload`
(нативные либы + fork — лотерея). Redis — `appendonly yes`.

## 9. Деплой (без Docker, вручную по SSH)

- Юниты `deploy/*.service` — один юзер/venv/`.env` на web и worker,
  `Restart=always`, `After=redis-server.service`.
- `nginx-api.conf` — добавить `location /api/` в текущий `server {}` сайта
  фронтенда: тот же домен → CORS не нужен ни в проде. В dev — прокси
  `server.proxy["/api"] → http://localhost:8000` в `vite.config.ts`.
- `browsercad-cleanup.timer` — ежедневная чистка storage (03:30).
- `deploy_backend.sh` — парный деплой: `git pull → pip install -r → systemctl
  restart web+worker`. **Не подключён** к `.github/workflows/deploy.yml`
  (автодеплой на push в main касается фронта) — бэкенд деплоится вручную,
  пока не стабилизируется.
- Путь на сервере: `/srv/browsercad-backend`, окружение `venv/`, юзер `browsercad`.

Требования к серверу: Linux с glibc ≥ 2.28 (колёса OCP `manylinux_2_28`:
Ubuntu 20.04+/Debian 11+; проверить `ldd --version`), Redis из дистрибутива
(`apt install redis-server` + `appendonly yes`), RAM — считать ~0.5–1 ГБ
на воркер с большой сборкой (`--concurrency=2` не поднимать вслепую).

## 10. Интеграция с фронтендом (ModelViewer не меняется)

Цепочка сейчас: `App.tsx` → `new VirtualFileSystem(files)` (создаёт blob-URL
из `File`) → `ModelViewer/index.tsx` грузит `.glb` по blob-URL. Вьюеру
всё равно, откуда взялся `File`, поэтому:

- новый `src/services/stepConversion.ts` (~100 строк): `submitJob(file,
  deflection)` → job_id; `pollJob(id, signal)` (750 мс → бэкофф до 2 с,
  `AbortSignal`); `fetchModel(id)` → `Blob`; `STAGE_MESSAGES` — русские
  тексты стадий;
- `FileUpload.tsx`: `accept` + ветка конвертации — карточка превращается
  в прогресс (Chakra `Progress` + стадия + кнопка «Отмена» = прекращение
  опроса; сервер доигрывает и кэширует); по завершении
  `new File([blob], "модель.glb", {type: "model/gltf-binary"})` →
  `onFilesSelect([glbFile])` — дальше всё работает как сейчас;
- при `error` — русский alert с `message` бэкенда;
- опционально (M4): панель метаданных (объём/площадь/габариты/точность)
  из `meta` заказа.

GLB самодостаточен — код перезаписи URI для `.gltf` не нужен, путь
`isGlb` (`index.tsx:855`) срабатывает как есть.

## 11. Проверки

- **Автотесты (минимум)**: `converter` на двух эталонах (деталь; сборка с
  цветами) — GLB существует, `meshes > 0`, объём > 0; API-раундтрип на
  `task_always_eager=True`.
- **Ручные сценарии** (по классам багов): убить воркер посреди таски →
  acks_late вернёт её в очередь; перезагрузить сервер → appendonly сохранил
  очередь; тот же файл дважды → дедуп; файл с кириллицким именем; 50–100 МБ
  → прогресс и лимиты; `systemctl status` обоих юнитов после деплоя.
- **Фронтенд**: `npm run build` (единственный typecheck), lint с поправкой
  на известные заранее падения.

## 12. Дорожная карта (learning-режим)

| Этап | Уроки | Выход |
|---|---|---|
| **M0** (~1–2 д) | Урок 1 (готово): venv + OCP + смоук-тест. Урок 2 (текущий): `converter.py` — чтение STEP, отчёт (грани/объём/габариты). Урок 3: XCAF + триангуляция + GLB + `validate`, открытие в своём вьюере | Движок работает и проверен руками |
| **M1** (~1–2 нед) | Redis-ключи и job_store; Celery-конфиг и таска; фабрика Flask; три маршрута; curl-тест в трёх терминалах | Асинхронный API целиком |
| **M2** (~1 д) | `stepConversion.ts`; прогресс-UI в FileUpload; сквозное демо | Пользовательский сценарий |
| **M3** (~1 д) | systemd-юниты, nginx, `.env`, appendonly, cleanup-timer, `deploy_backend.sh` по SSH | Прод |
| **M4** (опц.) | Панель метаданных; история заказов | Усиление диплома |

## 13. Известные риски и планы «Б»

- **Имена классов OCP плывут между версиями** (поймано: `RWGltf_CafWriter`).
  Каждое новое имя — проверять интроспекцией в своём `.venv` (§5).
- **Колёса manylinux_2_28**: старый сервер — сначала `ldd --version`.
  Не встаёт → план Б: движок на `freecadcmd` (FreeCAD headless) внутри ТОГО ЖЕ
  каркаса — `core/converter.py` заменяем, очередь/Flask не трогаем.
  Помнить ловушку freecadcmd: без `shape.tessellate(...)` получится молча
  пустой GLB, а exit code может быть 0 даже при ошибке скрипта.
- **RAM**: большая сборка — сотни МБ на воркер; `--concurrency=2`,
  мониторить `free -m`.
- **Сегфолты OCCT** (редко, битые файлы): переживаются, а не чинятся —
  `Restart=always`, `acks_late`, `task_time_limit`, ретраи с честной ошибкой.
- **Автодеплой**: push в `main` тянет только фронт; бэкенд — вручную,
  пока архитектура не устоится.
