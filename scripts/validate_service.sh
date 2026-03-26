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

for _ in $(seq 1 30); do
    if curl --fail --silent "http://127.0.0.1:${PORT}/" >/dev/null; then
        exit 0
    fi
    sleep 2
done

echo "Hermes did not become healthy on port ${PORT} in time" >&2
exit 1
