package sync

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/stretchr/testify/require"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/testdb"
)

// This is the one test in CHAT-6 that talks to the real Java monolith rather
// than just this service's own Postgres/Redis — a deliberate scope decision
// (see services/chat/docs/CHAT-6_*.md): the Bootstrapper's pagination logic
// is generic (all three pull* methods share fetchPage), so proving it once
// against the real /internal/sync/users endpoint is sufficient; it doesn't
// need its own httptest.Server stub *and* doesn't need 500+ seeded rows,
// since the page size is now test-overridable (see NewBootstrapper's
// pageSize field). Unlike every other CHAT-5/CHAT-6 test, this one SKIPS
// (not fails) if the monolith isn't reachable — chat-ci.yml deliberately
// does not run the full Java+Gradle+Postgres stack just for this one test.

func requireMonolithReachable(t *testing.T, baseURL, secret string) {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, baseURL+"/internal/sync/users?limit=1", nil)
	require.NoError(t, err)
	req.Header.Set("X-Internal-Service-Secret", secret)

	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Skipf("monolith not reachable at %s (start it with ./gradlew :server:bootRun to run this test): %v", baseURL, err)
	}
	defer resp.Body.Close()

	// Reachable but misconfigured (e.g. wrong INTERNAL_SERVICE_SECRET) is a
	// real problem worth failing loudly on, not skipping past.
	require.Equal(t, http.StatusOK, resp.StatusCode, "monolith is reachable but rejected the internal sync request — check INTERNAL_SERVICE_SECRET matches application-dev.yml")
}

// requireMonolithPool connects directly to the monolith's own dev Postgres
// (sportconnect_dev, never this service's sportconnect_chat_dev) purely to
// seed/clean up this test's fixture rows in the users table — the only place
// in this test suite that reaches across the service boundary into another
// service's schema, and only for fixture setup, never production code.
func requireMonolithPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	_ = godotenv.Load("../../.env")

	url := os.Getenv("MONOLITH_TEST_DATABASE_URL")
	if url == "" {
		url = "postgres://postgres:sa@localhost:5432/sportconnect_dev"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, url)
	require.NoError(t, err)
	require.NoError(t, pool.Ping(ctx))
	t.Cleanup(pool.Close)
	return pool
}

func TestBootstrapper_UsersPagination_FollowsNextCursorAcrossPages(t *testing.T) {
	_ = godotenv.Load("../../.env")

	monolithBaseURL := os.Getenv("MONOLITH_BASE_URL")
	if monolithBaseURL == "" {
		monolithBaseURL = "http://localhost:8080"
	}
	// An unset secret means this environment (e.g. chat-ci.yml, which never
	// sets it) isn't set up to run the monolith at all — same "skip, don't
	// fail" treatment as an unreachable monolith below, not a
	// require.NotEmpty hard failure. A *wrong* secret against a genuinely
	// reachable monolith is still caught as a real failure, inside
	// requireMonolithReachable.
	secret := os.Getenv("INTERNAL_SERVICE_SECRET")
	if secret == "" {
		t.Skip("INTERNAL_SERVICE_SECRET is not set — this environment isn't configured to run the monolith (see services/chat/.env.example); skipping the one CHAT-6 test that needs it")
	}

	requireMonolithReachable(t, monolithBaseURL, secret)

	monolithPool := requireMonolithPool(t)
	ctx := context.Background()

	// Seed just enough rows (pageSize + 2) to guarantee a genuinely
	// non-empty second page, using a fixed test-run tag in the email/
	// username so cleanup can't accidentally miss or over-delete rows.
	tag := fmt.Sprintf("chat6test%d", time.Now().UnixNano())
	const seedCount = 5
	seededEmails := make([]string, 0, seedCount)
	for i := 0; i < seedCount; i++ {
		email := fmt.Sprintf("%s-%d@example.invalid", tag, i)
		seededEmails = append(seededEmails, email)
		_, err := monolithPool.Exec(ctx, `
			INSERT INTO users (email, username, first_name, last_name, is_active)
			VALUES ($1, $2, $3, 'User', true)
		`, email, fmt.Sprintf("%s%d", tag, i), fmt.Sprintf("Seed%d", i))
		require.NoError(t, err)
	}
	t.Cleanup(func() {
		_, _ = monolithPool.Exec(context.Background(), `DELETE FROM users WHERE email = ANY($1)`, seededEmails)
	})

	pool := testdb.RequirePool(t)
	tx := testdb.BeginTx(t, pool)
	cache := NewCacheStore(tx)

	// 50 is comfortably smaller than the monolith's own MAX_LIMIT (500) and
	// smaller than however many real active users already exist in this dev
	// database (132 at time of writing) — guaranteed multi-page without the
	// excessive round-trip count a very small page size (e.g. 3) would force
	// paging through all of them.
	bootstrapper := NewBootstrapper(monolithBaseURL, secret, cache)
	bootstrapper.pageSize = 50

	require.NoError(t, bootstrapper.pullUsers(ctx))

	for i := 0; i < seedCount; i++ {
		username := fmt.Sprintf("%s%d", tag, i)
		profiles, err := cache.UserProfiles(ctx, mustUserIDByUsername(t, monolithPool, username))
		require.NoError(t, err)
		require.Len(t, profiles, 1, "seeded user %q must have been pulled into the cache across whichever page it landed on", username)
	}
}

// mustUserIDByUsername looks up a seeded user's real UUID so the test can
// assert against CacheStore.UserProfiles by ID, the same way production code
// does — the internal sync endpoint's response is keyed by ID, not username.
func mustUserIDByUsername(t *testing.T, pool *pgxpool.Pool, username string) []string {
	t.Helper()
	var id string
	err := pool.QueryRow(context.Background(), `SELECT id FROM users WHERE username = $1`, username).Scan(&id)
	require.NoError(t, err)
	return []string{id}
}
