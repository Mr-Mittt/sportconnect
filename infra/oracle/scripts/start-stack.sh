#!/usr/bin/env bash
# INFRA-12 sandbox, trimmed by INFRA-6: start the BACKING SERVICES and Caddy once. Run ON THE BOX as `ubuntu`, after
# box-prepare.sh. It no longer builds or starts the application: the server, chat and the client files are deployed by
# `sportconnect-deploy` (infra/oracle/scripts/sportconnect-deploy.sh) from the images a promote workflow points `prod` at.
# Written from the commands run on 2026-10-26 (setup log steps 22 to 55). Only syntax-checked (`bash -n`); NOT re-run end to
# end on a fresh box. INFRA-14 reshapes it (production settings for Postgres, Redis, RabbitMQ and Keycloak).
#
# Expects this layout on the box (copy it over with tar and scp; no git credentials on the box, see the guide):
#   ~/sportconnect/                      the repo files the stack needs: infra/docker-compose.dev.yml, infra/scripts/init-chat-db.sql,
#                                        infra/scripts/create-keycloak-db.sh, infra/rabbitmq, infra/keycloak/{realm,themes},
#                                        the two Keycloak JARs in infra/keycloak/providers, infra/oracle
#   ~/web/{Caddyfile,kc-prod.override.yml,server.env,chat.env}   copies of infra/oracle files (env files filled in)
#   ~/web/dist/                          the folder Caddy serves; `sportconnect-deploy` fills it from the client image
#
# Run it again after changing the Caddyfile or the Compose files; it recreates Caddy (certificates live in the caddy_data
# volume, which is kept). The server and chat containers are NOT touched here.
set -euo pipefail

NET=sportconnect-dev_default
COMPOSE=(docker compose -f "$HOME/sportconnect/infra/docker-compose.dev.yml" -f "$HOME/web/kc-prod.override.yml")

echo "== 1. dependencies (Postgres+PostGIS, Redis, RabbitMQ, Keycloak, Mailpit) with the production override"
"${COMPOSE[@]}" up -d
until curl -fs -o /dev/null http://127.0.0.1:8081/realms/sportconnect/.well-known/openid-configuration; do sleep 3; done
echo "keycloak realm is up"

echo "== 2. Caddy (certificates live in the caddy_data volume: do not delete it, Let's Encrypt rate-limits re-issuing)"
mkdir -p "$HOME/web/dist"
docker rm -f sc-caddy >/dev/null 2>&1 || true
docker run -d --name sc-caddy --restart unless-stopped --network "$NET" -p 80:80 -p 443:443 \
  -v caddy_data:/data -v caddy_config:/config \
  -v "$HOME/web/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$HOME/web/dist:/srv:ro" caddy:2-alpine >/dev/null

echo "== done: docker ps"
docker ps --format '{{.Names}} {{.Status}}'
echo "next: docker login ghcr.io (once), then sportconnect-deploy; the realm steps in the guide (scripts/set-*.sh) on a new box"
