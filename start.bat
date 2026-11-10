@echo off
cd /d "%~dp0"
echo Starting IT ticketing system...
docker compose up --build
