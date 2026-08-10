-- A15 (absorbs A13): drop cross-domain DB-level FKs on post-impl tables.
-- sports/users/groups belong to sport-impl/user-impl/group-impl, different domains — a DB-level
-- FK is a hard schema coupling that violates "domain-scoped tables" / "cross-domain references
-- use IDs only". All seven columns already treat the value as a plain UUID/Long (no @ManyToOne),
-- so this is schema-only: no entity/service/DTO change.
-- Confirmed no code path relies on any of these ON DELETE CASCADE/SET NULL behaviors — user
-- deletion (UserServiceImpl.deleteUser), group deletion (GroupServiceImpl.deleteGroup), and sport
-- deletion (SportServiceImpl.deleteSport) are all soft deletes (isActive = false), never a row
-- delete, so none of these cascades have ever fired.

ALTER TABLE posts DROP CONSTRAINT posts_sport_id_fkey;
ALTER TABLE posts DROP CONSTRAINT posts_user_id_fkey;
ALTER TABLE posts DROP CONSTRAINT posts_group_id_fkey;
ALTER TABLE comments DROP CONSTRAINT comments_user_id_fkey;
ALTER TABLE comment_likes DROP CONSTRAINT comment_likes_user_id_fkey;
ALTER TABLE post_likes DROP CONSTRAINT post_likes_user_id_fkey;
ALTER TABLE post_shares DROP CONSTRAINT post_shares_user_id_fkey;
