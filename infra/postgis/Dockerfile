# INFRA-12: Postgres 16 with PostGIS 3.6 for both linux/amd64 and linux/arm64.
#
# Why this exists: the official postgis/postgis image has no arm64 build (checked 2026-11-02: 16-3.4, 16-3.5, 16-3.6 are
# amd64 only), and the production box moved to the Always Free A1 (arm64). The PGDG package below is built for both.
# Built and pushed to ghcr.io/<owner>/sportconnect-postgis:16-3.6 by .github/workflows/postgis-image.yml.
#
# The PostGIS minor is pinned (POSTGIS_VERSION), so a rebuild never moves to a newer minor on its own; PGDG's patch
# releases (3.6.x) are picked up by a rebuild. Moving to another minor is a deliberate change: dev and the box run the
# same minor (infra/docker-compose.dev.yml), and an existing database needs `SELECT postgis_extensions_upgrade();` once.
FROM postgres:16

ARG POSTGIS_VERSION=3.5

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      "postgresql-16-postgis-3=${POSTGIS_VERSION}.*" \
      "postgresql-16-postgis-3-scripts=${POSTGIS_VERSION}.*" \
 && rm -rf /var/lib/apt/lists/*

LABEL org.opencontainers.image.title="sportconnect-postgis" \
      org.opencontainers.image.description="PostgreSQL 16 with PostGIS ${POSTGIS_VERSION} (amd64 and arm64)" \
      org.opencontainers.image.source="https://github.com/Mr-Mittt/sportconnect"
