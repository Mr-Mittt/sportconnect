// Package config loads and validates the chat service's environment configuration.
package config

import (
	"errors"
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

// Config holds every environment-derived setting the chat service needs at startup.
type Config struct {
	// HTTPAddr is the address the HTTP+WebSocket server listens on, e.g. ":8081".
	HTTPAddr string

	// DatabaseURL is the Postgres connection string for the chat service's own
	// database (sportconnect_chat_dev in dev, a separate database on the same
	// Postgres instance in prod — never the monolith's database).
	DatabaseURL string

	// RedisAddr is the host:port of the shared Redis instance also used by the
	// Spring monolith (e.g. "localhost:6379" in dev).
	RedisAddr string

	// JWTSecret is the HMAC secret shared with the Spring monolith's
	// app.jwt.secret (env JWT_SECRET there) — used to verify access tokens
	// independently, with no callback to Spring at request time.
	JWTSecret string

	// InternalServiceSecret authenticates this service's calls to the
	// monolith's /internal/sync/** bootstrap endpoints (header
	// X-Internal-Service-Secret). Shared with Spring's INTERNAL_SERVICE_SECRET.
	InternalServiceSecret string

	// MonolithBaseURL is the base URL of the Spring monolith, used only for the
	// one-time/cold-start bootstrap sync calls, never for per-request auth.
	MonolithBaseURL string

	// CORSAllowedOrigin mirrors Spring's SecurityConfig CORS allow-list — the
	// chat service needs its own, since the client talks to it directly.
	CORSAllowedOrigin string
}

// Load reads configuration from the environment. Required values with no safe
// default fail fast, matching the JWT/PubNub-secret precedent elsewhere in this
// repo (server/src/main/resources/application-prod.yml) of never silently
// falling back to an insecure default in place of a missing secret.
//
// A local .env file (see .env.example) is loaded first, purely as a dev
// convenience so these don't need re-exporting every shell session — this is
// NOT a config library (no layering, no nested structs, no non-string types;
// see CLAUDE.md's "Dependency philosophy"), just a one-line stand-in for
// `export`. godotenv.Load never overrides a variable that's already set in
// the real environment, so a real deployment's actual env vars always win
// over anything left in a stray .env file. A missing file is expected (the
// normal case in CI/production, where real secrets are injected another way)
// and silently ignored — but any *other* load error (e.g. a malformed line
// in an .env file that does exist) is surfaced here rather than swallowed,
// so a syntax mistake doesn't masquerade as "you forgot to set this var."
func Load() (Config, error) {
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return Config{}, fmt.Errorf("failed to load .env: %w", err)
	}

	cfg := Config{
		HTTPAddr:          getEnv("CHAT_HTTP_ADDR", ":8081"),
		RedisAddr:         getEnv("REDIS_ADDR", "localhost:6379"),
		MonolithBaseURL:   getEnv("MONOLITH_BASE_URL", "http://localhost:8080"),
		CORSAllowedOrigin: getEnv("CHAT_CORS_ALLOWED_ORIGIN", "http://localhost:5173"),
	}

	var err error
	if cfg.DatabaseURL, err = requireEnv("CHAT_DATABASE_URL"); err != nil {
		return Config{}, err
	}
	if cfg.JWTSecret, err = requireEnv("JWT_SECRET"); err != nil {
		return Config{}, err
	}
	if cfg.InternalServiceSecret, err = requireEnv("INTERNAL_SERVICE_SECRET"); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func requireEnv(key string) (string, error) {
	v := os.Getenv(key)
	if v == "" {
		return "", fmt.Errorf("required environment variable %s is not set", key)
	}
	return v, nil
}
