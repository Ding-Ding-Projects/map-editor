# Closeout prompt

Copy the block below into a new session to pick this project up where it stands.

```text
You are continuing work on Ding-Ding-Projects/map-editor (branch main). Read HANDOFF.md, ROADMAP.md and
docs/features/INVENTORY.md first; the inventory is the honest list of what is built, partial and unbuilt.

State on 2026-11-28:
- The editor map is drawn from kept tiles (src/ui/maptiles.ts), so it no longer turns black while it is dragged
  and it fills the view at every zoom. Checked in headless Edge and in the unpackaged desktop app.
- The desktop app asks for no account; a key made at each start keeps other programs out. The web app and the
  appliance keep their sign-in. The installed package was not run.
- Twelve tests in eight files fail on a Windows checkout (they did before these changes); run the checks on
  Linux for the record. Check the newest Build and release run before relying on a release.

Next, in this order:
1. Desktop app: replace the plain system title bar and the File, Edit, View, Window menu with a top bar in the
   app style. Put the design on the design canvas (design/canvas) before building it.
2. Compare the editor with Amulet Map Editor (a checkout may sit next to this repository) and bring layout and
   behaviour closer to it, again designed on the canvas first.
3. The editor shows a sideways scrollbar and a cut-off version line at 1440 px wide, and logs
   "Identifier 'intermediateBody' has already been declared".

Rules: run node scripts/local-checks.mjs record before every commit; never write private vocabulary into this
public repository; never delete a release, a world or user data without the maintainer saying so; tick
ROADMAP.md only after trying the built result.
```
