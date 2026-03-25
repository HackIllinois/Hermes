#!/bin/bash
set -euo pipefail

cd /home/ubuntu/hermes

if [ ! -f .env ]; then
    echo "Missing /home/ubuntu/hermes/.env"
    exit 1
fi

docker compose up --build -d --remove-orphans
