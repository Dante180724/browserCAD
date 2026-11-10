"""Страховка от «молча пустого GLB» (Урок 3).

validate_glb(path: Path) -> None — поднимает ValueError, если:
    - файл меньше 1 КБ; или
    - это не GLB (неверный magic-заголовок); или
    - в JSON-чанке GLB нет ни одного меша (meshes пуст).

GLB = 12-байтовый бинарный заголовок + чанки; первый чанк — JSON
(glTF-структура). Читаем заголовок чанка и распарсим JSON.
"""

import json
import struct
from pathlib import Path

GLB_MAGIC = 0x46546C67  # b"glTF"
CHUNK_JSON = 0x4E4F534A  # b"JSON"


def validate_glb(path: Path) -> None:
    """Проверить, что GLB существует и не пустой. Иначе — ValueError."""
    if not path.exists():
        raise ValueError(f"GLB не создан: {path}")

    size = path.stat().st_size
    if size < 1024:
        raise ValueError(f"GLB подозрительно мал: {size} байт (< 1 КБ)")

    with path.open("rb") as f:
        header = f.read(12)
        if len(header) < 12:
            raise ValueError("GLB обрезан: нет бинарного заголовка")

        magic, _version, _total_length = struct.unpack("<III", header)
        if magic != GLB_MAGIC:
            raise ValueError("Неверный magic-заголовок: это не GLB")

        chunk_header = f.read(8)
        if len(chunk_header) < 8:
            raise ValueError("GLB обрезан: нет заголовка JSON-чанка")

        json_length, json_type = struct.unpack("<II", chunk_header)
        if json_type != CHUNK_JSON:
            raise ValueError("Первый чанк GLB не JSON — файл битый")
        if json_length <= 0 or json_length > size:
            raise ValueError(f"Неверная длина JSON-чанка: {json_length}")

        json_data = f.read(json_length)

    try:
        gltf = json.loads(json_data)
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise ValueError(f"JSON-чанк GLB не парсится: {e}") from e

    if not gltf.get("meshes"):
        raise ValueError("В GLB нет ни одного меша — модель пустая")
