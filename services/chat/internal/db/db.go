// Package db wraps the chat service's own Postgres connection pool. Nothing
// outside this service ever reads or writes this database directly — no other
// service holds a connection string to it, mirroring the monolith's own
// domain-scoped-tables rule extended across a real network/process boundary.
package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Querier is the subset of *pgxpool.Pool's API a repository actually needs.
// *pgxpool.Pool and pgx.Tx both satisfy it already (same method signatures),
// so a repository built against Querier instead of the concrete pool type
// can be handed either the real pool (production) or an open transaction
// (tests, for cheap per-test rollback isolation — see internal/testdb) with
// no change to the repository's own code.
type Querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// TxQuerier is Querier plus Begin, for the one repository (conversation) that
// opens its own nested transaction. pgx.Tx implements Begin as a savepoint,
// so a TxQuerier backed by an outer test transaction still works correctly:
// the repository's internal Begin/Commit becomes a savepoint that rolls up
// into the outer transaction's eventual rollback.
type TxQuerier interface {
	Querier
	Begin(ctx context.Context) (pgx.Tx, error)
}

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
