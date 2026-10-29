#!/usr/bin/env bash
# INFRA-12 sandbox: build the app images on the box and start the whole stack. Run ON THE BOX as `ubuntu`, after
# box-prepare.sh. Written from the commands run on 2026-10-26 (setup log steps 22 to 55). Only syntax-checked (`bash -n`);
# NOT re-run end to end on a fresh box.
#
# Expects this layout on the box (copy it over with tar and scp; no git credentials on the box, see the runbook):
#   ~/sportconnect/                      the repo files the stack needs: infra/docker-compose.dev.yml, infra/scripts/init-chat-db.sql,
#                                        infra/scripts/create-keycloak-db.sh, infra/rabbitmq, infra/keycloak/{realm,themes},
#                                        the two Keycloak JARs in infra/keycloak/providers, services/chat, infra/oracle
#   ~/serverimg/server.jar               built on the dev machine with `./gradlew :server:bootJar -x test`
#   ~/web/{Caddyfile,kc-prod.override.yml,server.env,chat.env,dist/}   copies of infra/oracle files (env files filled in) and the client build
#
# The server and chat images here are MEASURING TOOLS, not the INFRA-4 / INFRA-8 deliverables: the server image is a
# throwaway Dockerfile (server.Dockerfile), the chat image is the committed services/chat/Dockerfile (INFRA-8 fixed its stale Go
# version; the Go-tag sed in step 1 now matches nothing and is harmless).
set -euo pipefail

NET=sportconnect-dev_default
COMPOSE=(docker compose -f "$HOME/sportconnect/infra/docker-compose.dev.yml" -f "$HOME/web/kc-prod.override.yml")

echo "== 1. images"
cp "$HOME/sportconnect/infra/oracle/server.Dockerfile" "$HOME/serverimg/Dockerfile"
docker build -q -t sc-server "$HOME/serverimg"
# base image tag follows go.mod (e.g. "go 1.25.0" -> golang:1.25-alpine)
gover=$(awk '/^go /{split($2,v,"."); print v[1] "." v[2]; exit}' "$HOME/sportconnect/services/chat/go.mod")
sed "s#golang:[0-9.]*-alpine#golang:${gover}-alpine#" "$HOME/sportconnect/services/chat/Dockerfile" > /tmp/Dockerfile.box
docker build -q -f /tmp/Dockerfile.box -t sc-chat "$HOME/sportconnect/services/chat"

echo "== 2. dependencies (Postgres+PostGIS, Redis, RabbitMQ, Keycloak, Mailpit) with the production override"
"${COMPOSE[@]}" up -d
until curl -fs -o /dev/null http://127.0.0.1:8081/realms/sportconnect/.well-known/openid-configuration; do sleep 3; done
echo "keycloak realm is up"

echo "== 3. chat schema (not created automatically in dev)"
if ! docker exec sportconnect-dev-postgres-1 psql -U postgres -d sportconnect_chat_dev -tAc "select to_regclass('public.sync_state')" | grep -q sync_state; then
  for f in $(ls "$HOME"/sportconnect/services/chat/migrations/*.up.sql | sort); do
    docker exec -i sportconnect-dev-postgres-1 psql -q -v ON_ERROR_STOP=1 -U postgres -d sportconnect_chat_dev < "$f"
    echo "applied $(basename "$f")"
  done
else
  echo "chat schema already present"
fi

echo "== 4. server first, then chat (chat's start-up sync calls the server and exits if it is not ready yet)"
docker rm -f sc-server sc-chat sc-caddy >/dev/null 2>&1 || true
docker run -d --name sc-server --restart unless-stopped --network "$NET" --env-file "$HOME/web/server.env" sc-server >/dev/null
until docker logs sc-server 2>&1 | grep -q "Started SportConnectApplication"; do sleep 3; done
docker run -d --name sc-chat --restart unless-stopped --network "$NET" --env-file "$HOME/web/chat.env" sc-chat >/dev/null

echo "== 5. Caddy (certificates live in the caddy_data volume: do not delete it, Let's Encrypt rate-limits re-issuing)"
docker run -d --name sc-caddy --restart unless-stopped --network "$NET" -p 80:80 -p 443:443 \
  -v caddy_data:/data -v caddy_config:/config \
  -v "$HOME/web/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$HOME/web/dist:/srv:ro" caddy:2-alpine >/dev/null

echo "== done: docker ps"
docker ps --format '{{.Names}} {{.Status}}'
echo "next: the realm steps in the runbook (scripts/set-*.sh), then https://yoursport.vn/api/reference/countries"
