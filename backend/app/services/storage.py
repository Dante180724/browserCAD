"""Полки: каталоги заказов на диске (по одному UUID-каталогу на заказ).

TODO (Урок M1):
    new_job_dir() -> tuple[str, Path]     # job_id (uuid4) + абсолютный путь
    job_file(job_id, имя_файла) -> Path
    cleanup_older_than(settings.RESULT_TTL)

Правила:
    - только абсолютные пути из settings.STORAGE_DIR
    - никаких «говорящих» имён — только UUID
      (предсказуемые имена = риск отдать чужую модель)
    - структура: storage/<job_id>/input.step, output.glb, meta.json
"""
