# INFRA-18 · Deploy follow-ups deferred from INFRA-6

**Status:** `TODO` · **Type:** Infrastructure (collection of deferred items; split into tickets when one is picked up) · **Depends on:** INFRA-6

**Filed:** 2026-10-29, from the INFRA-6 Phase 1 out-of-scope list. The owner asked for the out-of-scope items that have no ticket of their own to be filed together as one ticket and looked at later ("we will concern them later"). Nothing here is scheduled; each item says why it was left out.

Out-of-scope items of INFRA-6 that already have a home are **not** repeated here: reverse-proxy and Caddy changes (INFRA-7), Keycloak and the dev-grade Postgres / Redis / RabbitMQ settings (INFRA-14), distroless server and client images (INFRA-16), down-version promotes and schema rollback (INFRA-17), the move to the A1 ARM box (the INFRA-12 leftovers).

## Items

1. **Zero-downtime deploys (blue/green or rolling).** INFRA-6 restarts the container, so the service is down for the few seconds the new one needs to start (about the server's boot time). Left out because there is one box and one instance, and the downtime is accepted for the MVP. Needs a second instance behind Caddy or a proxy-level switch (touches INFRA-7), and care about the Liquibase startup migration running while the old version is still serving.
2. **Deploy notifications and a status view.** INFRA-6 records each run in a log file on the box and shows the result on the terminal. Not built: an email or chat message on a deploy or a rollback, and a page or command that shows "what version of each component is running, since when, and who promoted it" without opening the box. The promote workflow runs on GitHub, so its summary is the only record outside the box. Candidate: write the promote summary and the deploy result somewhere both can read.
3. **Promote starts CI by itself.** When the approval summary finds no CI result for the release (older than GitHub's log retention, or the workflow's path filter never ran on that commit), INFRA-6 only tells how to run CI again on the tag. Left out: Promote dispatching the CI workflow on the tag and waiting for it. It needs the `actions: write` permission, minutes of waiting for the server tests, and a defined behaviour if the run fails or the wait times out.

## Done when

Each item is either turned into its own ticket (with an owner decision on whether it is wanted) or removed with a reason written here.
