# Closeout prompt

Copy the block below into a new session to pick this project up where it stands.

```text
You are continuing work on Ding-Ding-Projects/map-editor (branch main). Read HANDOFF.md, ROADMAP.md and
docs/features/INVENTORY.md first; the inventory is the honest list of what is built, partial and unbuilt.

State on 2026-11-25:
- Latest release seen published: v0.1.101 (commit 8051f95). Later commits redesign the app shell, add icons on
  every button, a two-key confirmation, QR pairing, vocabulary drop, link previews, menu shortcuts and a Postman
  collection; check the newest Build and release run before relying on them.
- Bedrock Edition worlds open and edit (src/core/leveldb.ts, src/core/bedrock.ts). Not yet opened in the game
  after an edit.
- The Windows virtual disk view in the deploy app has not been run on a real Windows PC.

Next, in this order:
1. Confirm the newest Build and release run and the Real-world checks are green.
2. Work down docs/features/INVENTORY.md: finish PARTIAL items before starting UNBUILT ones, and update each
   line when it lands. Do the same items for the documentation site and the deploy app, not only the editor.
3. The documentation site now has a dockview article workspace; it still needs a language switch and the
   remaining shared features (see the inventory).
4. Run the person-only checks listed in HANDOFF.md when the hardware is available.

Rules: run npm run typecheck and npm test before every commit; never write private vocabulary into this public
repository; never delete a release, a world or user data without the maintainer saying so; tick ROADMAP.md
only after trying the built result.
```
