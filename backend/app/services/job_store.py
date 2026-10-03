"""Журнал заказов в Redis. Единственный писатель/читатель статусов.

Ключи:
    job:<id>                  hash: status, progress, stage, message, error, meta
    job:sha:<sha256>:<params> строка job_id — дедуп «тот же файл + те же параметры»

TODO (Урок M1): функции:
    set_queued / set_running / set_stage / set_done / set_error / get / find_by_hash

Правила:
    - status: queued | running | done | error
    - TTL (settings.RESULT_TTL) ставить ТОЛЬКО при терминальном статусе (done/error)
    - message — на русском (показывается пользователю)
    - progress/stage пишутся из воркера через stage_cb(job_id)
"""
