#!/bin/bash
set -euo pipefail

cd /home/ubuntu/hermes

PORT=5555

if [ -f .env ]; then
    ENV_PORT="$(grep -E '^PORT=' .env | tail -n 1 | cut -d '=' -f 2- || true)"
    if [ -n "${ENV_PORT}" ]; then
        PORT="${ENV_PORT}"
    fi
fi

curl --fail --silent http://127.0.0.1:${PORT}/ >/dev/null
