# CHAT-16 · File/image attachments

**Status:** `TODO` · **Type:** Feature (unscoped) · **Dependency:** CHAT-8, CHAT-9
**Filed:** 2026-07-27, initially as a deferred `BACKLOG_V1.md` ticket, moved into this MVP backlog
the same day (user decision) — not re-scoped in the move.

#### Questions to resolve when picked up

1. This app already has a media-upload path elsewhere (post images) — reuse that same upload
   mechanism and only store a URL reference in the chat message payload, per the reasoning already
   recorded in the archived PubNub plan (`documentation/md/archive/chat/CHAT_SERVICE_INTEGRATION.md`)
   when this was first considered and explicitly scoped out. Confirm that upload path still exists
   and works the same way before assuming it's reusable as-is.

   **Delta (found at first pickup attempt, 2026-07-28):** false premise — confirmed by exhaustive
   search, there is no working upload pipeline anywhere in this app. `CreatePostRequest.mediaUrls`
   is a bare `List<String>` field; `PostServiceImpl` just stores whatever URL strings the client
   already has (inferring `image`/`video` by a `contains("video")` string check) — no
   `MultipartFile` controller, no storage service, no S3/object-storage bucket for user content
   exists (`infra/docker-compose.dev.yml` runs only Postgres/PostGIS + Redis; the only S3 in
   `infra/documentation/MVP/INFRA-3_HOSTING_DECISION.md` hosts the client's static build, not user
   uploads). The client has no upload hook/component either (`CreatePostForm.tsx` is text-only,
   `CreatePostPayload.mediaUrls` is never populated). This ticket therefore requires building this
   app's *first* file-upload pipeline (e.g. presigned S3 PUT or a small multipart endpoint), not
   wiring into an existing one — materially bigger than filed. User chose to defer re-scoping and
   pick up CHAT-10 first instead (see that ticket's entry and the Dependencies section's reorder
   Delta above); this question is still open for whoever picks CHAT-16 up next.

2. `chat_messages.content` is `VARCHAR(1000)` with no concept of a non-text payload today — this
   needs either a new nullable `attachment_url`/`attachment_type` column, or a rethink of the
   message shape (e.g. a `type` discriminator: `TEXT` vs `IMAGE` vs `FILE`), which is itself a
   migration and a client-rendering decision, not just a column add.
3. File size/type limits, and whether attachments get scanned/validated the same way any other
   user-uploaded media in this app already is (if that exists) — don't build a second, weaker
   upload path. (Per the delta above: no such existing validation exists to match either — only
   text-length `@Size` validation exists anywhere in the app today.)
4. Storage cost/location — same S3 (or wherever this app already stores post images) or something
   chat-specific? Given this project's stated cost-avoidance posture (`infra/documentation/`), reuse
   existing infrastructure rather than adding a new storage bucket/service. Per the delta above,
   "existing infrastructure" means the already-provisioned RDS/EC2/S3(-for-client-build) from
   INFRA-3, not a working upload feature — decide whether the new upload endpoint targets the
   existing S3 bucket (new prefix/policy) or something else, at next pickup.

#### Out of scope for this filing

Any actual implementation, schema migration, or upload-flow design — needs its own Phase 1/2/3
pass at pickup.

---
