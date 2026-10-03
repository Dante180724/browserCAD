"""Пакет приложения browserCAD-backend.

TODO (Урок M1): реализовать фабрику create_app():
    1) app = Flask(__name__)
    2) app.config: MAX_CONTENT_LENGTH из settings (МБ -> байты)
    3) зарегистрировать blueprint из app.api.jobs
    4) зарегистрировать обработчики ошибок из app.api.errors
    5) return app

Пока create_app() не написан — wsgi.py импортировать нельзя (это нормально:
запускай пока конвертер напрямую, как в Уроке 2).
"""
