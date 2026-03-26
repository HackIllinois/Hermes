#!/bin/bash
set -euo pipefail

cd /home/ubuntu/hermes

if [ ! -f .env ]; then
    echo "Missing /home/ubuntu/hermes/.env"
    exit 1
fi

if pm2 describe HERMES_API >/dev/null 2>&1; then
    pm2 reload ecosystem.config.cjs --update-env
else
    mkdir -p /home/ubuntu/.pm2/logs
    pm2 start ecosystem.config.cjs
fi

pm2 save
