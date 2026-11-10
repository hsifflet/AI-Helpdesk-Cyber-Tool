#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Starting IT ticketing system..."
docker compose up --build
