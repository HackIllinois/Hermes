#!/bin/bash
set -euo pipefail

cd /home/ubuntu/hermes

if ! command -v docker >/dev/null 2>&1; then
    echo "docker is not installed on the host"
    exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
    echo "docker compose plugin is not installed on the host"
    exit 1
fi

if [ ! -f .env ]; then
    echo "Missing /home/ubuntu/hermes/.env"
    exit 1
fi

docker compose config >/dev/null
