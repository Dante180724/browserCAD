"""Точка входа для gunicorn.

Запуск (локально, из backend/ при активированном .venv):
    gunicorn --workers 2 --worker-class gthread --threads 8 \
        --timeout 60 --bind 127.0.0.1:8000 wsgi:app

Заработает после того, как в Уроке M1 появится create_app() в app/__init__.py.
"""

from app import create_app

app = create_app()
