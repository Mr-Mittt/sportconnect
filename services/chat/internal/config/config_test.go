package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoad_MigrateOnStart(t *testing.T) {
	cases := []struct {
		name string
		set  bool
		val  string
		want bool
	}{
		{"unset defaults to on", false, "", true},
		{"true", true, "true", true},
		{"false turns it off", true, "false", false},
		{"0 turns it off", true, "0", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv("CHAT_DATABASE_URL", "postgres://x")
			t.Setenv("INTERNAL_SERVICE_SECRET", "s")
			t.Setenv("CHAT_MIGRATE_ON_START", "")
			if c.set {
				t.Setenv("CHAT_MIGRATE_ON_START", c.val)
			}
			cfg, err := Load()
			require.NoError(t, err)
			assert.Equal(t, c.want, cfg.MigrateOnStart)
		})
	}
}
