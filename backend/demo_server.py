"""Синхронный демо-сервер: POST /api/convert (STEP → GLB) одним запросом.

Это НЕ прод-архитектура из README (§2: nginx/gunicorn/Flask+Redis+Celery):
для демонстрации конвертация выполняется тем же конвертером (Урок 3),
но синхронно и в subprocess — сегфолт OCCT не уронит сервер. Позже M1
обернёт тот же конвертер очередью, а этот файл останется dev-инструментом.

Запуск (из backend/):  .venv/bin/python demo_server.py      → http://localhost:8000
Проверка:              curl -s localhost:8000/api/ping

API:
    GET  /api/ping                   {"ok": true}
    POST /api/convert                multipart: file (.step/.stp), deflection (мм, опц.),
                                     angular (°, опц.) → GLB (model/gltf-binary),
                                     метрики — в заголовке X-Meta (JSON, percent-encoded)
"""

import io
import json
import subprocess
import tempfile
import urllib.parse
from pathlib import Path

from flask import Flask, Response, jsonify, request

from app import settings

BACKEND_DIR = Path(__file__).resolve().parent
PYTHON = BACKEND_DIR / ".venv" / "bin" / "python"
CONVERT_TIMEOUT_S = 600



app = Flask(__name__)


class ApiError(Exception):
    """Ошибка с русским message для UI и HTTP-статусом."""

    def __init__(self, message: str, status: int = 600):
        # 600 — не HTTP, но в UI можно показать, нужно будет указать в документации, что это "не HTTP"
        super().__init__(message)
        self.message = message
        self.status = status


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    return jsonify({"message": err.message}), err.status


@app.errorhandler(413)
def handle_too_large(_err):
    return jsonify({"message": f"Файл больше {settings.MAX_UPLOAD_MB} МБ"}), 413


@app.errorhandler(500)
def handle_internal(_err):
    return jsonify({"message": "Внутренняя ошибка сервера конвертации"}), 500


def bounded_float(raw: str | None, default: float, lo: float, hi: float) -> float:
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw)
    except ValueError:
        raise ApiError(f"Не число: {raw!r}", 400)
    if not lo <= value <= hi:
        raise ApiError(f"Значение должно быть в диапазоне {lo}–{hi}", 400)
    return value


@app.get("/api/ping")
def ping():
    return jsonify({"ok": True, "engine": f"OpenCASCADE (OCP {settings.OCP_VERSION})"})


@app.post("/api/convert")
def convert():
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        raise ApiError("Файл не передан (multipart-поле: file)", 400)

    name = upload.filename
    if not name.lower().endswith((".step", ".stp")):
        raise ApiError("Ожидался файл .step или .stp", 400)

    limit = settings.MAX_UPLOAD_MB * 1024 * 1024
    data = upload.read(limit + 1)
    if not data:
            raise ApiError("Файл пустой", 400)
    if len(data) > limit:
        raise ApiError(f"Файл больше {settings.MAX_UPLOAD_MB} МБ", 413)
    

    deflection = bounded_float(
        request.form.get("deflection"),
        settings.DEFLECTION_DEFAULT_MM,
        settings.DEFLECTION_MIN_MM,
        settings.DEFLECTION_MAX_MM,
    )
    angular = bounded_float(
        request.form.get("angular"), settings.ANGULAR_DEFAULT_DEG, 0.1, 2.0
    )

    with tempfile.TemporaryDirectory(prefix="browsercad-") as tmp:
        src = Path(tmp) / "input.step"
        src.write_bytes(data)
        out = Path(tmp) / "output.glb"

        cmd = [
            str(PYTHON),
            "-m",
            "app.core.converter",
            str(src),
            str(out),
            "--deflection",
            str(deflection),
            "--angular",
            str(angular),
            "--json",
        ]
        try:
            proc = subprocess.run(
                cmd,
                cwd=BACKEND_DIR,
                capture_output=True,
                text=True,
                timeout=CONVERT_TIMEOUT_S,
            )
        except subprocess.TimeoutExpired:
            raise ApiError(
                f"Конвертация не успела за {CONVERT_TIMEOUT_S} с — файл слишком тяжёлый",
                504,
            )

        if proc.returncode != 0 or not out.exists():
            detail = (proc.stderr or proc.stdout or "").strip().splitlines()
            detail_text = detail[-1] if detail else "без пояснений"
            raise ApiError(f"Ядро OpenCASCADE не смогло обработать файл: {detail_text}", 422)

        meta_line = next(
            (
                line
                for line in reversed(proc.stdout.splitlines())
                if line.startswith("##META## ")
            ),
            None,
        )
        if meta_line is None:
            raise ApiError("Конвертер не вернул метрики", 500)
        meta = json.loads(meta_line[len("##META## "):])
        meta["file"] = name  # во временном каталоге файл переименован — верну исходное имя

        glb_bytes = out.read_bytes()

    # GLB читается до выхода из TemporaryDirectory: отдаём из памяти
    response = Response(
        glb_bytes,
        mimetype="model/gltf-binary",
        headers={
            "Content-Disposition": f'attachment; filename="{Path(name).stem}.glb"',
            # HTTP-заголовки — ASCII: JSON с русским кодируем percent-encoding
            "X-Meta": urllib.parse.quote(json.dumps(meta, ensure_ascii=False)),
        },
    )
    return response


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=False)
