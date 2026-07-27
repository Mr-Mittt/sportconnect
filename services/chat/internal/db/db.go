// Package db wraps the chat service's own Postgres connection pool. Nothing
// outside this service ever reads or writes this database directly — no other
// service holds a connection string to it, mirroring the monolith's own
// domain-scoped-tables rule extended across a real network/process boundary.
package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool opens a connection pool sized deliberately small — this service
// shares a 1GB-RAM production box with the Spring monolith (whose own Hikari
// pool caps at 20, server/src/main/resources/application.yml), so chat's pool
// stays conservative rather than assuming it has the box to itself.
func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}

	cfg.MaxConns = 5
	cfg.MaxConnLifetime = time.Hour
	cfg.HealthCheckPeriod = time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, err
	}

	return pool, nil
}
