package db

import (
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // registers the pgx5:// driver
	"github.com/golang-migrate/migrate/v4/source/iofs"

	"github.com/Mr-Mittt/sportconnect/services/chat/migrations"
)

// Migrate applies the schema migrations embedded in the binary (CHAT-22) to the database at databaseURL and returns once
// the schema is current. It runs before the pool is opened and before the service listens.
//
// It uses the golang-migrate library, so the state lives in the same schema_migrations table the CLI uses, and a Postgres
// advisory lock keeps two starting instances from migrating at once. Only up migrations run; going back to an older
// release never rolls the schema back (INFRA-17). A migration that fails leaves the database marked dirty and returns an
// error, which main turns into a non-zero exit: the deploy's health probe then fails and the previous container is put back.
func Migrate(databaseURL string, logger *slog.Logger) error {
	return MigrateFS(databaseURL, migrations.FS, logger)
}

// MigrateFS is Migrate with the migration files supplied by the caller; tests use it to feed a broken migration.
func MigrateFS(databaseURL string, files fs.FS, logger *slog.Logger) error {
	src, err := iofs.New(files, ".")
	if err != nil {
		return fmt.Errorf("read embedded migrations: %w", err)
	}

	m, err := migrate.NewWithSourceInstance("iofs", src, pgxURL(databaseURL))
	if err != nil {
		return fmt.Errorf("open migrations: %w", err)
	}
	defer m.Close()

	err = m.Up()
	version, dirty, _ := m.Version()
	switch {
	case errors.Is(err, migrate.ErrNoChange):
		logger.Info("schema is up to date", "version", version)
		return nil
	case err != nil:
		return fmt.Errorf("apply migrations (version %d, dirty %t): %w", version, dirty, err)
	}
	logger.Info("migrations applied", "version", version)
	return nil
}

// pgxURL turns the postgres:// URL the service is configured with into the scheme golang-migrate's pgx v5 driver is
// registered under.
func pgxURL(databaseURL string) string {
	for _, scheme := range []string{"postgresql://", "postgres://"} {
		if rest, ok := strings.CutPrefix(databaseURL, scheme); ok {
			return "pgx5://" + rest
		}
	}
	return databaseURL
}
