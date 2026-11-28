# Closeout prompt

Copy the block below into a new session to pick this project up where it stands.

```text
You are continuing work on Ding-Ding-Projects/map-editor (branch main). Read HANDOFF.md, ROADMAP.md and
docs/features/INVENTORY.md first; the inventory is the honest list of what is built, partial and unbuilt.

State on 2026-11-28:
- The editor map is now drawn from kept tiles (src/ui/maptiles.ts), so it no longer turns black while it is
  dragged and it fills the view at every zoom. Compared old and new web app builds in headless Edge. The
  packaged desktop app has not been opened with this change.
- Type check and all 263 tests passed on Linux. Twelve tests in eight files fail on a Windows checkout, the
  same list with and without this change.
- Check the newest Build and release run for this commit before relying on a release.

Next, in this order:
1. Desktop app: open straight into the editor with no account creation. Keep sign-in on the Docker-hosted web
   app and the appliance, which other devices can reach.
2. Desktop app: replace the plain system title bar and menu with a top bar in the app style. Put the design on
   the design canvas (design/canvas) before building it.
3. Compare the editor with Amulet Map Editor (a checkout may sit next to this repository) and bring layout and
   behaviour closer to it, again designed on the canvas first.
4. The editor shows a sideways scrollbar and a cut-off version line at 1440 px wide, and logs
   "Identifier 'intermediateBody' has already been declared".

Rules: run node scripts/local-checks.mjs record before every commit; never write private vocabulary into this
public repository; never delete a release, a world or user data without the maintainer saying so; tick
ROADMAP.md only after trying the built result.
```
