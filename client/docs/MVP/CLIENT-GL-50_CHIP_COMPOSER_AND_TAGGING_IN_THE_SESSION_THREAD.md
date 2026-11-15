# CLIENT-GL-50 · Chip composer and tagging in the session thread

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-GL-64 (the people search) · follows CLIENT-GL-39
**Filed:** 2026-11-15, owner request after CLIENT-GL-39: a picked `@` name should show in the comment box as a chip (Backspace removes the whole name), and the `@` picker should work in normal comments too, like tagging people.

The comment box of the session thread becomes a rich input. A player picked with `@` is a **chip** (name, avatar) inside the text, and Backspace on a chip deletes the whole chip, not a letter at a time. This applies to the new-comment box and to the reply box.

1. **Record commands (CLIENT-GL-39 behavior kept).** The chip carries the player's id, so the command parser reads ids from the chips; the typed-names fallback of CLIENT-GL-39 goes away or stays only as paste support (decide at pickup). Hints, notices, the send rules and the "never a comment" rule do not change.
2. **Tags in a normal comment.** `@` in a comment that is not a command opens the picker with **everyone who can see the thread** (SESSION-GL-64, searched as the user types). The comment is stored with the id markup `@[Full Name](userId)` inside its text; the server stores it as it does any text. The thread (and replies) render a stored tag as a chip or highlighted name; a markup that cannot be read shows as plain text; a tagged person who left or changed their name still shows the name that was stored.
3. **Length.** The comment length limit counts the stored markup; the box shows the limit against what would be stored, so a comment never fails on length after Send.
4. **Copy and selection.** Copying text out of the box gives the plain `@Full Name`; an arrow key moves over a chip as one character.
5. i18n (en, vi) for every new string; a11y: a chip is announced as "mention: <name>", the picker keeps the listbox roles and keyboard of CLIENT-GL-39.

Inputs and outputs: in, the typed text and picked people; out, the comment text with the id markup (or a record command's change set). Edge cases: a tag at the length limit, two people with the same name (the picker disambiguates as in CLIENT-GL-39, the id is what is stored), pasting text with `@`, Enter while the picker is open picks (as now), a deleted chip next to a space, the people request failing (the picker shows nothing and the box still works), the box on a phone (mobile first). Account lifecycle: no new endpoint on the client side beyond SESSION-GL-64; a deactivated caller is already refused.

**Out of scope:** notifying the tagged person (NOTIF-12); validating tags on the server; tagging people in feed posts and post comments; editing a comment.

**Tests:** Vitest for the markup parse and render, the chip insert and delete, and the composer (command and normal comment, reply box); a scoped e2e with MSW (tag someone, see the chip in the thread, record command with chips). Baseline impact to derive at pickup (the comment box and the thread draw differently).
