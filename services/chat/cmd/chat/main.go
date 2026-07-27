// Command chat is the entrypoint for the chat service — the first service
// in this repo that is not a Java Gradle module or part of the React
// client. See services/chat/CLAUDE.md and docs/SYNC_DESIGN.md for the
// conventions and integration contract this wires together.
package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/Mr-Mittt/sportconnect/services/chat/internal/api"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/auth"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/config"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/conversation"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/db"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/message"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/platform"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/sync"
	"github.com/Mr-Mittt/sportconnect/services/chat/internal/ws"
)

func main() {
	logger := platform.NewLogger()

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to chat database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr})
	defer redisClient.Close()

	cache := sync.NewCacheStore(pool)

	// Cold-start bootstrap only runs once. If this service has already
	// synced before (sync_state has an entry), the consumer group resumes
	// from its own last acked offset instead — Redis Streams persist their
	// backlog, so a restart never needs to re-bootstrap. See
	// docs/SYNC_DESIGN.md.
	lastID, err := cache.LastStreamID(ctx, sync.StreamName)
	if err != nil {
		logger.Error("failed to check sync state", "error", err)
		os.Exit(1)
	}
	if lastID == "" {
		logger.Info("no prior sync state found — running cold-start bootstrap")
		bootstrapper := sync.NewBootstrapper(cfg.MonolithBaseURL, cfg.InternalServiceSecret, cache)
		if err := bootstrapper.Run(ctx); err != nil {
			logger.Error("cold-start bootstrap failed", "error", err)
			os.Exit(1)
		}
	}

	consumer := sync.NewConsumer(redisClient, cache, "chat-service-1", logger)
	go func() {
		if err := consumer.Run(ctx); err != nil && ctx.Err() == nil {
			logger.Error("sync consumer stopped unexpectedly", "error", err)
		}
	}()

	verifier := auth.NewVerifier(cfg.JWTSecret)
	convService := conversation.NewService(conversation.NewRepository(pool), cache)
	msgService := message.NewService(message.NewRepository(pool), cache)
	hub := ws.NewHub()

	router := api.NewRouter(api.Dependencies{
		Verifier:      verifier,
		Conversations: convService,
		Messages:      msgService,
		Hub:           hub,
		AllowedOrigin: cfg.CORSAllowedOrigin,
		Logger:        logger,
	})

	server := &http.Server{
		Addr:    cfg.HTTPAddr,
		Handler: router,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	logger.Info("chat service listening", "addr", cfg.HTTPAddr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("server failed", "error", err)
		os.Exit(1)
	}
}
