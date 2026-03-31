#!/bin/bash

echo ">> BUILD LIMPO"

docker compose down --remove-orphans

docker builder prune -af

DOCKER_BUILDKIT=1 docker compose build --no-cache

docker compose up -d

echo ">> BUILD OK"
