"""Таска конвертации: номер заказа -> converter -> статусы в job_store.

TODO (Урок M1):

    @celery_app.task
    def convert(job_id: str) -> None:
        1) job_store.set_running(job_id)
        2) converter.convert_step_to_glb(..., on_stage=job_store.stage_cb(job_id))
        3) validate.validate_glb(...)
        4) try/except: set_done(job_id, meta, ttl=RESULT_TTL) | set_error(job_id, msg, ttl)
        5) finally: удалить input.step после терминального статуса

Правило: аргумент таски — ТОЛЬКО job_id (строка); всё остальное читается
с диска по номеру заказа. Никаких объектов/файловых дескрипторов в аргументах
(сериализация через Redis = только примитивы).
"""
