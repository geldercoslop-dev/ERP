#!/bin/bash

echo ">> RESET DOCKER LIMPO"

docker compose down --remove-orphans

docker rm -f $(docker ps -aq --filter "name=erp") 2>/dev/null || true

docker container prune -f
docker volume prune -f
docker network prune -f

echo ">> RESET OK"
