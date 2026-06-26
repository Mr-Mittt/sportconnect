# SportConnect — Core Idea & Vision

Brainstormed and finalized: 2026-06-26.

---

## One-Sentence Identity

> **SportConnect is the app for sports groups — find them, run them, fill your sessions, and connect with players.**

---

## Target User

**Casual sports player** — someone who plays recreationally, belongs to one or more sport groups/clubs, and currently cobbles together WhatsApp, Facebook groups, and spreadsheets to organize their sporting life.

---

## The Two Core Pains SportConnect Solves

1. **Existing tools don't support sports groups properly.** WhatsApp and Facebook groups are generic — no session management, no slot filling, no player filtering by skill/position/gender/equipment. Groups are forced to work around tools not built for them.

2. **No app supports the individual sports player.** There is no single place for a player to manage their sports identity, discover groups, find sessions, trade equipment, or connect across multiple sports.

---

## Day-1 Differentiator

> A sports group can fill an empty session slot from outside their group, with the right player, in one post.

No other app does this with sport-specific context (skill level, position, gender, equipment requirements, verified booking).

---

## What SportConnect Is (Resolved Conflicts)

### Primary focus: Group / Club / Clan experience
The app is centered on sports groups. Everything — social feed, player finding, session calling, chat, equipment — exists to serve the group experience and the individual's participation in groups.

### Community-first, not marketplace-first
SportConnect is a **community product**, not a booking platform. Revenue and marketplace features (facility booking, equipment trading) come after the community is established. The social graph and group activity are the moat.

### The "Calling" System (core feature)
Four types of public posts that connect players and groups:

| Type | Who posts | What they need |
|---|---|---|
| **Session Calling** | Group | Has a session, needs 1+ players to fill a slot |
| **Game Calling** | Individual player | Looking for a session/game to join |
| **Group Finding** | Individual player | Looking for a group to join |
| **Player Finding** | Group | Looking for new permanent members |

All callings support filters: sport, skill level, gender, equipment requirements, location, time.

For Session Callings, a group can optionally attach a **verified facility booking** (V2 feature) so candidates can confirm the session is real before applying.

### Booking: V2, not MVP
No facility/court booking in MVP. The concept is preserved for V2:
- Facility/stadium owners (individuals or organizations) manage their courts/fields
- They can sell or suggest free slots to groups looking for a session location
- Verified bookings can be attached to Session Callings for trust

---

## Full Feature Set (by priority)

### MVP — Core Group & Social Layer
- User profiles with sport identity (sports played, skill levels, positions)
- Group/club creation and management (roles: owner, admin, member)
- Social feed (posts, photos, likes, comments) scoped to groups and global
- The Calling system (session calling, game calling, group finding, player finding)
- Follow / connect between players
- In-app notifications
- Basic chat (group chat + direct messages)

### V2 — Discovery & Marketplace
- Geolocation-based discovery (nearby groups, nearby sessions, nearby players)
- Equipment trading (buy/sell/rent between players)
- Facility management for owners (court/field listing, availability, booking)
- Verified booking attachment to Session Callings
- Advanced search and filters

### V3 — Platform Growth
- Mobile app (React Native)
- Payment integration (Stripe Connect) for bookings and equipment transactions
- Events and tournaments within groups
- Group analytics for admins
- AI-powered player/group recommendations

### Long-term ideas (keep, don't build yet)
- Video shorts (TikTok-style game highlights)
- Coaching marketplace
- Leaderboards and challenges
- Blockchain/NFT booking verification (only if transferable tickets become a real use case)

---

## What SportConnect Is NOT (scope boundaries)

- Not a fitness tracker (that's Strava)
- Not a generic social network (that's Facebook)
- Not a facility booking platform first (that's Bookify/Playtomic)
- Not a team management tool for professional clubs (that's TeamSnap)

SportConnect is specifically for **casual players who organize around groups**, and the tools are built for that context.
