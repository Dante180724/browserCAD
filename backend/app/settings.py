"""Единственный источник конфигурации.

Правило проекта: НИКАКИХ настроек в других модулях —
только `from app import settings` (или `from app.settings import ...`).

Значения берутся из переменных окружения: локально работают дефолты ниже,
на сервере их задаёт systemd (EnvironmentFile=.env, см. deploy/).
"""

import os
from pathlib import Path

# Redis: брокер очереди Celery + журнал заказов (job_store)
REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

# Каталог заказов на диске (локально — backend/storage, на сервере — из .env)
STORAGE_DIR: Path = Path(
    os.environ.get(
        "STORAGE_DIR",
        str(Path(__file__).resolve().parent.parent / "storage"),
    )
)

# Лимит загружаемого файла
MAX_UPLOAD_MB: int = int(os.environ.get("MAX_UPLOAD_MB", "300"))

# Срок жизни готовых заказов: ОДНО значение для Redis-TTL и чистки storage
RESULT_TTL: int = int(os.environ.get("RESULT_TTL_DAYS", "3")) * 86400

# Точность триангуляции STEP (мм) — «инженерная точность» как параметр API
DEFLECTION_DEFAULT_MM: float = 0.1
DEFLECTION_MIN_MM: float = 0.01
DEFLECTION_MAX_MM: float = 1.0
ANGULAR_DEFAULT_DEG: float = 0.5
