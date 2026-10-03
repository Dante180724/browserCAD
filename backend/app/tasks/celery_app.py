"""Инстанс Celery и антибаговый конфиг.

TODO (Урок M1): создать

    celery_app = Celery("browsercad", broker=..., backend=...)

и celery_app.conf.update(...) со значениями ниже
(каждая строка — закрытый класс багов из нашего разбора):

    broker_url / result_backend      из settings.REDIS_URL
    task_serializer="json"           таски передаются только примитивами
    task_ignore_result=True          состояние заказов ведёт job_store, не Celery
    task_acks_late=True              воркер упал -> таска вернулась в очередь
    worker_prefetch_multiplier=1     честная очередь для длинных тасок
    task_time_limit=1800             зависший OCCT не занимает цех навечно
    task_soft_time_limit=1500        мягкий лимит: шанс завершиться чистой ошибкой
    broker_connection_retry_on_startup=True
"""
