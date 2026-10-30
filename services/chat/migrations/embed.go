// Package migrations carries the chat schema inside the binary (CHAT-22). The .sql files live next to this file because
// go:embed cannot reach outside its own package directory; internal/db applies them at startup. The same files still work
// with the golang-migrate CLI (CI uses it, and `down 1` is only possible with it).
package migrations

import "embed"

// FS holds every numbered <version>_<name>.up.sql / .down.sql file in this directory.
//
//go:embed *.sql
var FS embed.FS
