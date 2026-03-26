#!/bin/bash
set -euo pipefail

cd /home/ubuntu/hermes

if ! command -v node >/dev/null 2>&1; then
    echo "node is not installed on the host"
    exit 1
fi

if ! command -v yarn >/dev/null 2>&1; then
    echo "yarn is not installed on the host"
    exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
    echo "pm2 is not installed on the host"
    exit 1
fi

if [ ! -f .env ]; then
    echo "Missing /home/ubuntu/hermes/.env"
    exit 1
fi

if [ ! -f dist/index.js ]; then
    echo "Missing /home/ubuntu/hermes/dist/index.js"
    exit 1
fi

yarn install --frozen-lockfile --production=true
