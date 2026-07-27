# Go, for people who've never touched it

This is an onboarding doc, not a language reference. It exists because `services/chat` is the
first Go code in this repo, and everyone else here has been writing Java or TypeScript. Every
concept below points at a real line of code in this actual service — read this with the files open
next to it.

You don't need to become a Go expert to work in this codebase. You need the handful of ideas below,
because Go does several ordinary things (errors, "classes," concurrency) noticeably differently
from Java or JS, and those differences are exactly where a newcomer trips.

---

## 1. What Go is, in one paragraph

Go is a compiled, statically-typed language made by Google, designed to be simple and fast to
build/run at scale. Compared to what you already know: it's statically typed like Java, but with
none of the class hierarchy machinery; it compiles to a single native binary, closer to how Go
programs get deployed than a JVM's ".jar you also need a JVM to run"; and its standout feature is
cheap, built-in concurrency (§13), which is exactly why this project picked it for a chat service —
holding thousands of open WebSocket connections is expensive in Java, cheap in Go.

---

## 2. Setting up your local environment

To work on this service you need three things: the Go toolchain itself, an editor with Go support
(optional but recommended), and this project's runtime dependencies (Postgres, Redis) running via
the repo's existing dev compose file. This section gets you to a working `go run ./cmd/chat` —
`README.md`'s §5 has the fuller picture of what each environment variable does and how this fits
alongside the rest of the stack.

### Install Go

Go ships as a single installer — there's no separate JDK-style "pick a distribution/vendor"
decision to make first.

- **Windows:** download and run the MSI installer from <https://go.dev/dl/> (the current
  `go1.22.x.windows-amd64.msi` — match or exceed the major/minor version in `go.mod`'s `go 1.22`
  line; a newer patch version is fine). It adds `go` to your `PATH` automatically. **Restart your
  terminal (and VS Code, if open) afterward** — PATH changes don't reach already-open windows.
- **macOS:** `brew install go`, or the `.pkg` installer from the same page.
- **Linux:** your distro's package manager, or the official `.tar.gz` extracted to `/usr/local`
  per the instructions on that page. Distro-packaged Go is often an older version — check with
  the command below before assuming it's current enough.

Verify it worked, in a **new** terminal window:

```bash
go version
# go version go1.22.x windows/amd64   (or darwin/arm64, linux/amd64, ...)
```

If `go` isn't recognized: on Windows, check System Properties → Environment Variables that the
installer's bin directory (typically `C:\Program Files\Go\bin`) is on `PATH`; on macOS/Linux, check
your shell profile (`.zshrc`/`.bashrc`) if you installed manually rather than via a package manager.

### Editor setup (recommended, not required)

Any text editor works, but Go's own tooling makes an editor genuinely worth setting up:

- **VS Code:** install the official **Go** extension (`golang.go`). The first time you open a
  `.go` file it prompts to install a few small helper tools (`gopls`, the language server; `dlv`,
  the debugger) — accept that. After that you get inline error-checking, jump-to-definition, and
  format-on-save (`gofmt` — see §3), with no project-specific config file required.
- **GoLand / IntelliJ with the Go plugin:** works immediately if you're already using IntelliJ for
  the Java side of this repo.
- **Vim, Neovim, Sublime, anything else:** all have community plugins built on the same `gopls`
  language server VS Code uses — search "`<your editor>` gopls".

Nothing in this codebase depends on editor-specific settings — there's no `.vscode/` config this
service requires you to have.

### Get this service running

1. **Clone/pull the repo** as usual — `services/chat/` is just a folder in the same repository as
   everything else; there's no separate checkout.
2. **Start the shared dev dependencies** (Postgres + Redis), from the repo root:
   ```bash
   docker compose -f infra/docker-compose.dev.yml up -d
   ```
3. **Set the required config.** This service refuses to start without `CHAT_DATABASE_URL`,
   `JWT_SECRET`, and `INTERNAL_SERVICE_SECRET` (see `CLAUDE.md`'s "no dev defaults for secrets"
   note) — for local dev the last two can be anything, as long as they match whatever values the
   monolith (Spring Boot app) is running with, since both sides compare them directly.

   The easiest way, and what this repo actually uses — copy the checked-in example file and edit
   it, once (from `services/chat/`):
   ```bash
   cp .env.example .env
   ```
   Open `.env` and fill in real values. It's loaded automatically every time the service starts
   (`internal/config.Load()` calls `godotenv.Load()` first) — you never export these by hand.
   `.env` is gitignored (never commit it); `.env.example` is the checked-in, safe-to-share template.

   If you'd rather not use a file, exporting the variables directly in your shell works exactly the
   same way — a real environment variable always wins over anything left in `.env`:

   PowerShell (this repo's primary shell on Windows):
   ```powershell
   $env:CHAT_DATABASE_URL = "postgres://postgres:sa@localhost:5432/sportconnect_chat_dev"
   $env:JWT_SECRET = "dev-secret-key-for-development-only-change-in-production-min-256-bits"
   $env:INTERNAL_SERVICE_SECRET = "some-shared-dev-secret"
   ```
   bash/zsh:
   ```bash
   export CHAT_DATABASE_URL="postgres://postgres:sa@localhost:5432/sportconnect_chat_dev"
   export JWT_SECRET="dev-secret-key-for-development-only-change-in-production-min-256-bits"
   export INTERNAL_SERVICE_SECRET="some-shared-dev-secret"
   ```
   Exported variables only last for that terminal session — the `.env` file above is what saves you
   from repeating this every time you open a new one. Both these dev values already match what
   `server/src/main/resources/application-dev.yml` bakes in for local runs of the monolith — you
   don't need to export anything on that side either, as long as it's running under the default
   "dev" Spring profile.
4. **Apply database migrations.** This needs the separate `golang-migrate` CLI — it's a different
   tool from the `go` command itself, and isn't something `go build` installs for you:
   ```bash
   # install once, anywhere:
   go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

   # then, from services/chat/ (the ?sslmode=disable is only needed for migrate's own
   # driver, which defaults to requiring SSL — the service itself doesn't need this
   # in CHAT_DATABASE_URL, see README.md's Configuration section):
   migrate -path migrations -database "${CHAT_DATABASE_URL}?sslmode=disable" up
   ```
   `go install` places the resulting binary in `$(go env GOPATH)/bin`. If `migrate` isn't found
   afterward, that directory isn't on your `PATH` yet — run `go env GOPATH` to see exactly where it
   put it, and add that directory's `bin` subfolder to your `PATH`.
5. **Run the service:**
   ```bash
   cd services/chat
   go run ./cmd/chat
   ```
   The first run is slower than every run after — `go run` downloads and compiles every dependency
   listed in `go.mod` once, then caches the results locally. You should see a log line confirming
   it's listening (`CHAT_HTTP_ADDR`, default `:8081`).

At that point you have a working local loop: edit a `.go` file, stop the running process
(`Ctrl+C`), run `go run ./cmd/chat` again. There's no separate "restart the dev server" mechanism —
it's a genuinely fast full recompile every time, which is normal for Go, not a sign of anything
being slow or misconfigured.

### Common first-run problems

| Symptom | Likely cause |
|---|---|
| `go: command not found` / not recognized | Go isn't installed, or your terminal was open before you installed it — open a new one |
| `dial tcp ...: connect: connection refused` on startup | Postgres/Redis aren't running — check `docker compose -f infra/docker-compose.dev.yml ps` from the repo root |
| `required environment variable X is not set` | Either `.env` doesn't exist yet (`cp .env.example .env`, then fill it in), or you're not running `go run ./cmd/chat` from inside `services/chat/` — `godotenv.Load()` looks for `.env` in the current working directory |
| `password authentication failed`, or the database doesn't exist | `CHAT_DATABASE_URL` (in `.env` or your shell) doesn't match the dev compose file's Postgres credentials, or your local Postgres data volume predates `infra/scripts/init-chat-db.sql` being added — see `services/chat/CLAUDE.md` for the manual `CREATE DATABASE` fallback in that case |

---

## 3. The toolchain — one command does everything

In the Java world you reach for Gradle/Maven for builds, JUnit for tests, and usually a separate
static-analysis tool. In JS, that's npm/pnpm + a bundler + ESLint + a test runner, all separate
tools you wire together. In Go, one CLI (`go`) does all of it:

| Command | Java/JS equivalent | What it does |
|---|---|---|
| `go run ./cmd/chat` | `./gradlew bootRun` / `pnpm dev` | Compiles and runs immediately, no separate build step |
| `go build ./...` | `./gradlew build` / `pnpm build` | Compiles everything, produces a binary |
| `go test ./...` | `./gradlew test` / `pnpm test` | Runs every test in the project |
| `go vet ./...` | (closest: a linter) | Catches common real mistakes the compiler's grammar check misses |
| `go mod tidy` | `./gradlew` resolving deps / `pnpm install` | Reconciles `go.mod`/`go.sum` with what the code actually imports |

There's no separate "linter you might not have configured" — `go vet` ships with the language, and
`gofmt` (auto-formatting) means nobody on a Go team argues about brace placement; it's not a matter
of style, the tooling just rewrites the file.

---

## 4. Anatomy of this project

Open `go.mod`:

```
module github.com/Mr-Mittt/sportconnect/services/chat

go 1.22

require (
	github.com/coder/websocket v1.8.15
	...
)
```

- **`module ...`** — this is the equivalent of a Maven `groupId:artifactId` or a `package.json`
  `"name"` field. It's also literally the prefix every import path inside this project uses (see
  below) — Go doesn't have a separate "import alias," the module path *is* the import path.
- **`go 1.22`** — minimum language version.
- **`require (...)`** — third-party dependencies, the equivalent of `package.json`'s
  `"dependencies"`. `go.sum` (not present yet in this scaffold — see `CLAUDE.md`) is the equivalent
  of `package-lock.json`/`gradle.lockfile`: exact versions + checksums, so builds are reproducible.

A **package** in Go is just a folder. Every `.go` file in `internal/auth/` starts with
`package auth`, and that's the whole package — no `package com.foo.bar;`-style path duplication of
the folder structure (Java requires the package statement to mirror the directory; Go's package
name is just a short local identifier, and the *import path* is what encodes the folder location).

To use another package's code, you `import` its full path:

```go
import "github.com/Mr-Mittt/sportconnect/services/chat/internal/auth"
```

then refer to its exported names as `auth.Verifier`, `auth.FromContext`, etc. — see §6 for what
"exported" means.

---

## 5. Where a Go program starts

Every executable Go program has exactly one `package main` with exactly one `func main()` — that's
the entry point, the direct equivalent of Java's `public static void main(String[] args)`. In this
service, that's `cmd/chat/main.go`. Open it — it's short, and it's the one file that touches every
other package in the service. Skim it now; the rest of this doc explains the pieces it's made of.

There's no framework auto-wiring dependencies here (no Spring `@Autowired`, no DI container) —
`main.go` constructs everything by hand, in order, and passes each thing to whatever needs it as a
plain function argument or struct field. That's normal, idiomatic Go for a service this size — see
`CLAUDE.md`'s "no DI container" note.

---

## 6. No `public`/`private` keywords — capitalization *is* the visibility

Java has `public`/`private`/`protected`. Go has none of those keywords. Instead: **a name starting
with a capital letter is exported (visible to other packages); a lowercase name is not.** That's the
entire rule.

Look at `internal/sync/cache.go`:

```go
type CacheStore struct {   // capital C — exported, other packages can use sync.CacheStore
	pool *pgxpool.Pool      // lowercase field — only code inside package sync can touch it directly
}

func (c *CacheStore) IsGroupMember(...) (bool, error) {  // capital I — exported method
```

The `internal/` directory name is special too: any package path containing a segment literally
named `internal` can only be imported by code inside the same module tree above that `internal`
folder. That's why every package in this service lives under `internal/` — nothing here is meant to
be imported by some other Go program later. It's a compiler-enforced version of the same instinct
behind this repo's Java `-api`/`-impl` split.

---

## 7. Variables and types — statically typed, but with type inference

```go
var count int = 5     // explicit type (rare in practice)
count := 5              // := infers the type from the value — this is what you'll see everywhere
name := "chat"          // string
```

`:=` declares *and* assigns in one step, and only works for a brand-new variable. Once declared, use
plain `=` to assign again. It's statically typed underneath — `count` is genuinely an `int`, the
compiler enforces it — the inference just saves you from writing `int count = 5` explicitly, similar
to Java's `var count = 5` (Java 10+) or TypeScript's inference.

---

## 8. Structs — Go's answer to a class, minus inheritance

Go doesn't have classes. It has **structs** (plain data) and separately, **functions attached to a
type** (§9). There's no `class Conversation extends Something`. Look at
`internal/conversation/conversation.go`:

```go
type Conversation struct {
	ID              int64
	Type            Type
	ExternalGroupID int64
	DMKey           string
	CreatedAt       time.Time
}
```

That's it — a plain bag of fields, like a Java record or a TypeScript `interface`, with no methods
inside the type definition itself (methods are attached separately, see §9). There's no
constructor syntax either — you build one with a **struct literal**:

```go
c := Conversation{ID: 1, Type: TypeGroup}
```

There's also no inheritance. If two structs need to share behavior, Go's answer is either
**composition** (embed one struct inside another — `message.WithSender` embeds `Message`, see
`internal/message/message.go`) or **interfaces** (§10), never a class hierarchy.

---

## 9. Methods — attached to a type, not inside a class body

In Java, a method lives inside the class. In Go, a function becomes a "method" on a type by giving
it a **receiver** — an extra parameter before the function name:

```go
// internal/sync/cache.go
func (c *CacheStore) IsGroupMember(ctx context.Context, groupID int64, userID string) (bool, error) {
	...
}
```

`(c *CacheStore)` is the receiver — read this as "this function is a method on `*CacheStore`, and
inside the function, `c` refers to that specific instance," exactly like Java's implicit `this`,
just spelled out explicitly. You call it the way you'd expect: `cacheStore.IsGroupMember(ctx, 42,
userID)`.

The `*` in `*CacheStore` matters — see §12 on pointers. Short version: use a pointer receiver (as
above) when the method needs to see the same shared instance (most of this codebase); use a
value receiver (no `*`) only for small, read-only types where a copy is fine and cheap.

---

## 10. Interfaces — satisfied implicitly, not declared

This is the single biggest conceptual difference from Java for most newcomers. In Java, a class
must say `implements Runnable` to count as a `Runnable`. **In Go, there's no `implements` keyword at
all.** A type satisfies an interface automatically, just by having the right methods — nobody
declares the relationship anywhere.

This codebase doesn't define many custom interfaces (it's a small service), but it uses standard
library ones constantly. `http.Handler` is defined as:

```go
type Handler interface {
	ServeHTTP(ResponseWriter, *Request)
}
```

Anything with a `ServeHTTP(ResponseWriter, *Request)` method — from any package, written by anyone,
with zero reference to `net/http`'s interface — automatically *is* an `http.Handler`, usable
anywhere one is expected. `internal/auth/auth.go`'s `Verifier.Middleware` returns exactly this kind
of value. This is why Go code so rarely needs a mocking framework for tests: you can write a tiny
fake type with the right methods and it just works, no test-double library required.

---

## 11. Error handling — no exceptions

Go has no `try`/`catch`, no `throws`. A function that can fail returns an **extra value of type
`error`** alongside its real result, and the caller checks it immediately:

```go
// internal/sync/consumer.go
func (c *Consumer) EnsureGroup(ctx context.Context) error {
	err := c.client.XGroupCreateMkStream(ctx, StreamName, ConsumerGroup, "0").Err()
	if err != nil && !isBusyGroupErr(err) {
		return err
	}
	return nil
}
```

`if err != nil { ... }` immediately after almost every call is the single most distinctive-looking
pattern in Go code, and it's not boilerplate you're missing a trick to avoid — it's the language's
actual error-handling mechanism. `error` is itself just an interface (§10) with one method,
`Error() string`; anything satisfying that shape can be returned as an error, including custom types
(see `platform.AppError` for this codebase's one custom error type).

The upside over exceptions: you can see, in a function's own signature, every place it might fail —
`nil` for "no error" is always the expected, checked, ordinary case, not a special one.

---

## 12. Pointers — just "share this, don't copy it"

You don't need pointer arithmetic here (Go doesn't allow it outside of unsafe code nobody in this
service uses). You need one idea: `T` is a value; `*T` is "a reference to a `T` living somewhere,"
and `&x` gets you a pointer to `x`.

```go
pool, err := db.NewPool(ctx, cfg.DatabaseURL)   // pool is *pgxpool.Pool — a pointer
cache := sync.NewCacheStore(pool)                // passed around by reference, not copied
```

Why it matters practically: a plain (non-pointer) struct gets **copied** every time you pass it to a
function or assign it to a new variable. For a big or stateful thing (a connection pool, a mutex-
guarded map like `ws.Hub`), you want everyone sharing the *same* instance, so you pass `*T`
everywhere instead of `T`. That's why almost every constructor in this codebase (`NewPool`,
`NewCacheStore`, `NewHub`, ...) returns a pointer.

The failure mode to know about: dereferencing a `nil` pointer (calling a method on one, or reading a
field through one that was never set) crashes the program (a "panic," Go's equivalent of an
uncaught exception) — there's no compiler-enforced null-safety the way Kotlin or TypeScript-strict
gives you. This is the one place Go asks for the same discipline Java's `NullPointerException` does.

---

## 13. Goroutines and channels — the actual reason this service is in Go

This is Go's headline feature, and it's directly why the chat service exists as a separate,
Go-written program instead of another Java module: holding one open connection per active chat
user is cheap here and expensive on the JVM.

**Goroutines** are lightweight, independently-scheduled functions — "start this, don't wait for it"
— created just by putting `go` in front of a function call:

```go
// cmd/chat/main.go
go func() {
	if err := consumer.Run(ctx); err != nil && ctx.Err() == nil {
		logger.Error("sync consumer stopped unexpectedly", "error", err)
	}
}()
```

That line starts the Redis-Stream-reading loop running *concurrently* with everything else
`main.go` goes on to do next (start the HTTP server, etc.) — no thread pool to configure, no
`Thread`/`ExecutorService` ceremony. Goroutines are far cheaper than OS threads (a few KB each, not
megabytes), which is what makes "one goroutine per open WebSocket connection" (see
`internal/ws/hub.go`'s `WriteLoop`/`ReadLoop`, started per-client in `internal/api/handlers.go`'s
`connectWebSocket`) a completely normal thing to do in Go, where it would be a resource problem in
Java.

**Channels** are how goroutines safely hand data to each other without shared-memory bugs. Look at
`internal/ws/hub.go`:

```go
type Client struct {
	conn           *websocket.Conn
	conversationID int64
	send           chan []byte    // a channel of byte-slices
}
```

`Hub.Broadcast` writes a message onto a client's channel; that same client's `WriteLoop` goroutine
is, separately and concurrently, reading off that same channel and writing to the actual network
connection. Neither goroutine touches the other's internals directly — the channel is the only
handoff point, which is what makes this safe without manual locking for that specific interaction
(the `Hub`'s map of rooms still needs a mutex, which is why you'll see `sync.RWMutex` there too —
channels solve *handoff*, not every concurrency problem).

---

## 14. `context.Context` — cancellation and deadlines, passed explicitly

You'll see `ctx context.Context` as the first parameter of almost every function in this codebase
that does I/O (a database query, an HTTP call, a Redis read). It's how Go plumbs "stop what you're
doing" through a call chain — the equivalent problem Java solves with thread interruption or a
request-scoped timeout, except here it's an explicit value you pass, not ambient thread state.

```go
// main.go
ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
```

This line means: "give me a context that automatically cancels itself when the process gets a
Ctrl-C or a termination signal." That same `ctx` gets threaded into the database pool, the Redis
consumer, the HTTP server's shutdown — so one signal cleanly unwinds everything, in order, without
each piece needing its own separate signal-handling code.

---

## 15. Tests — co-located, table-driven, no separate test tree

Java's Spock tests in this repo live in a whole separate `src/test/groovy/` tree, because Groovy
needs its own source set. Go has no such constraint — tests live **right next to the code**, in a
file named `<name>_test.go`:

```go
// internal/message/message_test.go
func TestSendRejectsEmptyContent(t *testing.T) {
	svc := NewService(nil, nil)
	_, err := svc.Send(context.Background(), 1, "user-1", "")
	assert.True(t, errors.Is(err, ErrEmptyContent))
}
```

`go test ./...` finds and runs every `Test*` function in every `_test.go` file across the whole
project automatically — no test-runner configuration, no annotation to mark a class as a test suite.
`testify`'s `assert`/`require` (imported as a normal package, same as any other dependency) give you
readable assertions; without it you'd be writing `if got != want { t.Fatalf(...) }` by hand, which
is also completely normal Go and still what testify is doing underneath.

---

## 16. Things that will surprise you coming from Java/TypeScript

- **Every variable has a "zero value" — there's no "uninitialized."** A fresh `int` is `0`, a fresh
  `string` is `""`, a fresh `bool` is `false`, a fresh pointer/slice/map/interface is `nil`. There's
  no equivalent of a Java field being `null` by accident because you forgot to initialize it in
  every constructor path — the language always picks a defined value for you. The trade-off: it
  also means a missing value and a real, meaningful zero (an empty string on purpose vs. one nobody
  set) can look identical unless the code is written carefully.
- **Unused imports and unused local variables are compile errors**, not warnings. Go is strict about
  this specifically to stop dead code from accumulating quietly.
- **Formatting isn't a style choice.** `gofmt` (run automatically by most editors on save) rewrites
  every file to one canonical layout. Nobody reviews indentation or brace placement in a Go PR.
- **Generics exist but are used sparingly.** Go got generics in 1.18 — this codebase uses them in
  exactly one place, `internal/sync/bootstrap.go`'s `fetchPage[T any](...)`, for "fetch a page of
  either group-members, friendships, or users, using the same pagination code." If you haven't seen
  Go generics before, that function is a real, small, worked example — most Go code you'll encounter
  in a service this size won't need them at all.
- **No method overloading.** You can't have two functions named `Send` with different parameter
  types in the same package — Go resolves calls by name only, not name+signature. If you need
  variations, they get distinct names (`SendText`, `SendBinary`, ...) or a single function with a
  more general parameter type.

---

## 17. Tracing one request through this service, end to end

Putting it together — here's what actually happens when a client calls
`POST /conversations/1/messages`, and which section above explains each step:

1. `main.go` (§5) already built one `http.Handler` (§10) covering every route, via
   `api.NewRouter(...)`, and handed it to a standard `http.Server`.
2. The request arrives at `corsMiddleware` (`internal/api/router.go`), a function that itself
   *returns* an `http.Handler` (§10) wrapping the real router — this "wrap a handler in another
   handler" pattern is how Go does middleware, no framework needed.
3. It's then routed to `deps.Verifier.Middleware(...)` (§10 again — same wrapping pattern), which
   reads the `Authorization` header, verifies the JWT (§11 — returns an `error` if invalid, and the
   middleware writes a 401 and stops), and stores the caller's identity on the request's
   `context.Context` (§14) for later handlers to read.
4. `handlers.sendMessage` (§9 — a method on `*handlers`) runs: parses the conversation ID, calls
   `conversation.Service.AuthorizeByID` (a pointer receiver method, §9/§12) which reads the local
   cache (§6.2 in `README.md`) — no database call to any *other* service, just this service's own
   Postgres via `pgx`.
5. `message.Service.Send` validates the content length (§11's error-checking pattern, no exceptions)
   and inserts a row.
6. The new message is handed to `ws.Hub.Broadcast`, which pushes it onto every connected client's
   channel (§13) — each of those is being drained by its own goroutine (§13), started back when
   that client's WebSocket connection was accepted.
7. The original HTTP handler writes the JSON response and returns — nothing it did was blocked
   waiting on step 6's goroutines; they run independently.

If you can follow that list start to finish, you know enough Go to be productive in this service.

---

## 18. Cheat sheet

```bash
go run ./cmd/chat          # compile + run, once
go build ./...              # compile everything (catches most real bugs)
go vet ./...                 # catch suspicious patterns the compiler allows but shouldn't
go test ./...                 # run every test
go test ./internal/message/    # run tests in just one package
go mod tidy                    # sync go.mod/go.sum with actual imports (needs network)
gofmt -l .                      # list any file that isn't canonically formatted
go env GOPATH                    # where `go install`-ed tools (like migrate) end up
```

**To learn more (in order of depth):**
- [A Tour of Go](https://go.dev/tour/) — interactive, ~1–2 hours, covers everything in this doc plus syntax drills
- [Effective Go](https://go.dev/doc/effective_go) — the language team's own style/idiom guide
- [Go by Example](https://gobyexample.com/) — short, runnable snippets per topic, good as a reference while reading this codebase
