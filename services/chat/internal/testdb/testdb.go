// Package testdb provides shared test-only helpers for running the
// repository/cache integration tests (CHAT-5) against a real Postgres —
// never a mock. Per services/chat/CLAUDE.md's testing convention, anything
// touching pgxpool needs either a real database or a documented decision to
// skip; this package is that "real database" path, shared across
// internal/conversation, internal/message, and internal/sync's test files so
// each doesn't hand-roll its own connection/cleanup logic.
//
// Nothing outside a _test.go file imports this package.
package testdb

import (
	"context"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/db"
)

var (
	poolOnce sync.Once
	pool     *pgxpool.Pool
	poolErr  error

	redisOnce   sync.Once
	redisClient *redis.Client
	redisErr    error
)

// RequirePool returns the shared test-process Postgres pool, connecting on
// first use. It reads CHAT_DATABASE_URL exactly like internal/config.Load
// does in production — the same dev database (sportconnect_chat_dev) the
// running service itself talks to, loaded from services/chat/.env if a real
// environment variable isn't already set (CI sets the real variable
// directly, as production does, so the .env lookup is a dev-only
// convenience there too, and its absence is silently ignored).
//
// Unlike RequireEnv's "fail fast" precedent elsewhere in this service, a
// missing/unreachable database here fails the individual test loudly via
// t.Fatalf rather than silently skipping — these tests exist specifically to
// run against a real database, per the testing convention in
// services/chat/CLAUDE.md, so a quietly-skipped integration suite would
// defeat the point of CHAT-5.
func RequirePool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	poolOnce.Do(func() {
		// Relative to any package under internal/<pkg>, services/chat/.env is
		// two directories up — `go test` runs each package's test binary with
		// that package's own directory as its working directory.
		_ = godotenv.Load("../../.env")

		databaseURL := os.Getenv("CHAT_DATABASE_URL")
		if databaseURL == "" {
			poolErr = fmt.Errorf("CHAT_DATABASE_URL is not set — these are DB-backed integration tests " +
				"(services/chat/CLAUDE.md's testing convention); start the dev compose stack and set " +
				"CHAT_DATABASE_URL (see services/chat/.env.example), or let CI's chat-ci.yml service " +
				"container supply it")
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		p, err := pgxpool.New(ctx, databaseURL)
		if err != nil {
			poolErr = fmt.Errorf("failed to create test pool: %w", err)
			return
		}
		if err := p.Ping(ctx); err != nil {
			poolErr = fmt.Errorf("failed to reach test database at CHAT_DATABASE_URL: %w", err)
			return
		}
		pool = p
	})

	if poolErr != nil {
		t.Fatalf("%v", poolErr)
	}
	return pool
}

// RequireRedisClient returns the shared test-process Redis client, connecting
// on first use. Reads REDIS_ADDR the same way internal/config.Load does in
// production (defaulting to localhost:6379, loaded from services/chat/.env
// if not already set in the real environment). Fails the test loudly if
// unreachable — same "real infra or nothing" posture as RequirePool.
func RequireRedisClient(t *testing.T) *redis.Client {
	t.Helper()

	redisOnce.Do(func() {
		_ = godotenv.Load("../../.env")

		addr := os.Getenv("REDIS_ADDR")
		if addr == "" {
			addr = "localhost:6379"
		}

		client := redis.NewClient(&redis.Options{Addr: addr})

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := client.Ping(ctx).Err(); err != nil {
			redisErr = fmt.Errorf("failed to reach test Redis at REDIS_ADDR=%s: %w", addr, err)
			return
		}
		redisClient = client
	})

	if redisErr != nil {
		t.Fatalf("%v", redisErr)
	}
	return redisClient
}

// BeginTx opens a transaction on the shared test pool and registers a
// cleanup that always rolls it back — every test gets a fully isolated view
// with no leftover rows and no ordering dependency between tests, without
// each test having to hand-write its own row deletion. Repositories under
// test are constructed with this Tx (which satisfies db.TxQuerier/db.Querier
// the same way *pgxpool.Pool does), so exactly the same query code runs as
// in production.
func BeginTx(t *testing.T, p *pgxpool.Pool) pgx.Tx {
	t.Helper()

	tx, err := p.Begin(context.Background())
	if err != nil {
		t.Fatalf("failed to begin test transaction: %v", err)
	}
	t.Cleanup(func() {
		_ = tx.Rollback(context.Background())
	})
	return tx
}

// CountingQuerier decorates a db.Querier and counts Query/QueryRow calls —
// used to assert batched-lookup code (e.g. message.Service.History's sender
// resolution) issues exactly one query regardless of how much data it
// resolves, per the N+1 discipline services/chat/CLAUDE.md carries over from
// the Java side.
type CountingQuerier struct {
	inner      db.Querier
	queryCalls atomic.Int64
}

func NewCountingQuerier(inner db.Querier) *CountingQuerier {
	return &CountingQuerier{inner: inner}
}

// QueryCalls returns the number of Query + QueryRow calls made through this
// decorator so far.
func (c *CountingQuerier) QueryCalls() int64 {
	return c.queryCalls.Load()
}

func (c *CountingQuerier) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return c.inner.Exec(ctx, sql, args...)
}

func (c *CountingQuerier) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	c.queryCalls.Add(1)
	return c.inner.Query(ctx, sql, args...)
}

func (c *CountingQuerier) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	c.queryCalls.Add(1)
	return c.inner.QueryRow(ctx, sql, args...)
}
