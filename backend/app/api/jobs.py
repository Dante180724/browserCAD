"""Три маршрута API.

TODO (Урок M1), план:

    POST /api/jobs                 приём .step -> 202 {"job_id": "...", "status": "queued"}
                                   + дедуп: тот же SHA-256 и параметры -> тот же job_id
    GET  /api/jobs/<job_id>        статус/прогресс/метрики из job_store
    GET  /api/jobs/<job_id>/model.glb   готовый GLB (404, если ещё не готов)

Скелет:

    from flask import Blueprint

    bp = Blueprint("jobs", __name__, url_prefix="/api/jobs")

Использует: services/storage.py (сохранение файла), services/job_store.py (статусы),
tasks/convert.py (постановка в очередь: convert.delay(job_id)).
"""
