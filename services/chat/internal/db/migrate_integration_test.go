package db_test

// CHAT-22: the embedded migrations, against a real Postgres (the dev database server, CHAT_DATABASE_URL), each test in its
// own throwaway database so the dev data and the other packages' tests are never touched.

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/db"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/testdb"
	"github.com/Mr-Mittt/sportconnect/services/chat/migrations"
)

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

// throwawayDB creates an empty database on the server CHAT_DATABASE_URL points at and returns its URL and a connection.
func throwawayDB(t *testing.T) (string, *pgx.Conn) {
	t.Helper()
	admin := testdb.RequirePool(t)
	name := fmt.Sprintf("chat22_%d", time.Now().UnixNano())
	ctx := context.Background()
	_, err := admin.Exec(ctx, "CREATE DATABASE "+name)
	require.NoError(t, err)

	u, err := url.Parse(os.Getenv("CHAT_DATABASE_URL"))
	require.NoError(t, err)
	u.Path = "/" + name
	dbURL := u.String()

	conn, err := pgx.Connect(ctx, dbURL)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = conn.Close(ctx)
		_, _ = admin.Exec(ctx, "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
	})
	return dbURL, conn
}

func schemaVersion(t *testing.T, conn *pgx.Conn) (int, bool) {
	t.Helper()
	var v int
	var dirty bool
	require.NoError(t, conn.QueryRow(context.Background(), "SELECT version, dirty FROM schema_migrations").Scan(&v, &dirty))
	return v, dirty
}

func count(t *testing.T, conn *pgx.Conn, table string) int {
	t.Helper()
	var n int
	require.NoError(t, conn.QueryRow(context.Background(), "SELECT count(*) FROM "+table).Scan(&n))
	return n
}

func TestMigrate_EmptyDatabaseGetsTheFullSchema(t *testing.T) {
	dbURL, conn := throwawayDB(t)

	require.NoError(t, db.Migrate(dbURL, quiet))

	v, dirty := schemaVersion(t, conn)
	assert.Equal(t, 4, v)
	assert.False(t, dirty)
	for _, table := range []string{"conversations", "conversation_participants", "chat_messages",
		"group_members_cache", "friendships_cache", "user_profiles_cache", "sync_state"} {
		assert.Zero(t, count(t, conn, table), table)
	}
	// 000004 added these two columns.
	var columns int
	require.NoError(t, conn.QueryRow(context.Background(),
		"SELECT count(*) FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name IN ('edited_at', 'deleted_at')").
		Scan(&columns))
	assert.Equal(t, 2, columns)
}

func TestMigrate_SecondRunChangesNothing(t *testing.T) {
	dbURL, conn := throwawayDB(t)
	require.NoError(t, db.Migrate(dbURL, quiet))
	_, err := conn.Exec(context.Background(), "INSERT INTO conversations (type, dm_key) VALUES ('DIRECT', 'a:b')")
	require.NoError(t, err)

	require.NoError(t, db.Migrate(dbURL, quiet))

	v, dirty := schemaVersion(t, conn)
	assert.Equal(t, 4, v)
	assert.False(t, dirty)
	assert.Equal(t, 1, count(t, conn, "conversations"), "a restart must not touch existing rows")
}

// The Oracle box was built by running the four .up.sql files with psql: the tables exist, schema_migrations does not.
func TestMigrate_DatabaseBuiltByPsqlIsRebuilt(t *testing.T) {
	dbURL, conn := throwawayDB(t)
	ctx := context.Background()
	for _, name := range []string{"000001_create_conversations", "000002_create_chat_messages",
		"000003_create_sync_cache_tables", "000004_add_message_edit_delete"} {
		raw, err := migrations.FS.ReadFile(name + ".up.sql")
		require.NoError(t, err)
		sql := string(raw)
		if start := strings.Index(sql, "DROP TABLE IF EXISTS"); start >= 0 {
			end := strings.Index(sql[start:], ";")
			sql = sql[:start] + sql[start+end+1:] // what the old, plain file looked like
		}
		require.NotContains(t, sql, "DROP TABLE", "the psql-style setup must not drop anything")
		_, err = conn.Exec(ctx, sql)
		require.NoError(t, err, name)
	}
	_, err := conn.Exec(ctx, "INSERT INTO conversations (type, dm_key) VALUES ('DIRECT', 'a:b')")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO sync_state (stream, last_id) VALUES ('s', '1-0')")
	require.NoError(t, err)

	require.NoError(t, db.Migrate(dbURL, quiet))

	v, dirty := schemaVersion(t, conn)
	assert.Equal(t, 4, v)
	assert.False(t, dirty)
	assert.Zero(t, count(t, conn, "conversations"), "the first start rebuilds the chat tables")
	assert.Zero(t, count(t, conn, "sync_state"), "sync_state goes too, so the cold-start bootstrap runs again")
}

func TestMigrate_BrokenMigrationFailsAndLeavesTheDatabaseDirty(t *testing.T) {
	dbURL, conn := throwawayDB(t)
	broken := fstest.MapFS{
		"000001_ok.up.sql":    {Data: []byte("CREATE TABLE ok (id INT);")},
		"000001_ok.down.sql":  {Data: []byte("DROP TABLE ok;")},
		"000002_bad.up.sql":   {Data: []byte("CREATE TABLE bad (id INT); THIS IS NOT SQL;")},
		"000002_bad.down.sql": {Data: []byte("SELECT 1;")},
	}

	err := db.MigrateFS(dbURL, broken, quiet)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "dirty true")
	v, dirty := schemaVersion(t, conn)
	assert.Equal(t, 2, v)
	assert.True(t, dirty)
}

func TestMigrate_TwoInstancesStartingTogether(t *testing.T) {
	dbURL, conn := throwawayDB(t)

	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := range errs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs[i] = db.Migrate(dbURL, quiet)
		}()
	}
	wg.Wait()

	assert.NoError(t, errs[0])
	assert.NoError(t, errs[1])
	v, dirty := schemaVersion(t, conn)
	assert.Equal(t, 4, v)
	assert.False(t, dirty)
}
