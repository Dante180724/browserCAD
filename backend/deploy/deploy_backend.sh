#!/usr/bin/env bash
# Парный деплой: web и worker перезапускаются ВСЕГДА вместе, одним скриптом
# (анти-баг «рассинхрон версий web/worker»).
# Запуск на сервере: sudo bash deploy/deploy_backend.sh
set -euo pipefail

cd /srv/browsercad-backend
git pull
venv/bin/pip install -r requirements.txt
systemctl restart browsercad-web browsercad-worker
systemctl --no-pager status browsercad-web browsercad-worker
