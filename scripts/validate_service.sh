#!/bin/bash
set -euo pipefail

cd /home/ubuntu/hermes

if [ -f .env ]; then
    set -a
    . ./.env
    set +a
fi

PORT="${PORT:-5555}"

curl --fail --silent http://127.0.0.1:${PORT}/ >/dev/null
