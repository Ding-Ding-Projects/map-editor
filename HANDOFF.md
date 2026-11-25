# Handoff: what was built, and the checks still to run

This file lists the work finished on 25 November 2026, the checks that were run, and the checks
that were left for the next person to run. `ROADMAP.md` stays the honest checklist of features;
this file covers testing.

## Built in this round

| Area | What | Where |
| --- | --- | --- |
| Editor | Map toolbar (Pan, Select, Pick block, Measure, Go to; keys H S I M G) | `src/ui/main.ts` |
| Editor | Blocks panel of colour swatches feeding Fill and Replace | `src/ui/main.ts` |
| Editor | Side view panel: a vertical cut along x or z through the selection | `src/core/session.ts` (`renderSlice`), `/api/slice` |
| Editor | Biome tool (key B), per 4×4×4 cell, saved packed in each section | `src/core/chunk.ts`, `src/core/ops.ts` (`setBiome`) |
| Editor | Structure files: save the selection as .nbt and place a .nbt, with block entities | `src/core/structure.ts`, `/api/structure`, `/api/structure/place` |
| Worlds | New world presets (grass, desert, snow, water, stone bricks, void) and sizes | `src/core/archive.ts` (`createFlatWorld`) |
| History | Open as a copy, per-entry change counts, Activity panel | `src/core/history.ts`, `src/server/activity.ts` |
| Accounts | Passkeys (WebAuthn): add, rename, remove, sign in | `src/server/passkeys.ts`, Settings › Account and passkeys |
| Tools | Tools tab: Base64, JSON to TypeScript, coordinates | `src/ui/tools.ts` |
| Navigation | Find tabs with close by text; phone panel chips; palette teleport to every setting and remembered size | `src/ui/tabsearch.ts`, `src/ui/workspace.ts`, `src/ui/palette.ts` |
| Search | Ready-made patterns in every regex builder | `src/ui/regex.ts` |
| Extensions | Add from link in a dialog with an optional SHA-256 check | `src/server/extensions.ts` |
| Dialogs | Material confirm and text dialogs instead of the browser's | `src/ui/main.ts` (`askConfirm`, `askText`) |
| Deploy app | Instance duplicate; activity record of deploys and actions; Update coming soon card | `src/deploy/` |
| Appliance | arm64 container in the Pi image; refuses a wrong-processor image; daily in-place updater | `appliance/configure.sh`, `.github/workflows/release.yml` |
| Site | Bundled fonts, favicon, Downloads page tied to the newest complete release, animated hero, article screenshots | `site/` |
| Releases | No empty releases; line counts in release notes | `.github/workflows/release.yml` |

## Checks that were run

- **Type check** (`npm run typecheck`) after every change.
- **Unit and server tests**: the full suite (77 tests) passed at commit `54cc0a4`. After that, only the
  new or touched files were run: `tests/biome.test.ts`, `tests/structure.test.ts`,
  `tests/archive.test.ts`, `tests/server.test.ts` and `tests/tools.test.ts` all passed.
- **Headless Chrome checks** (scripts kept outside the repository) for the map toolbar, Blocks panel,
  Side view, structures, history copy and Activity panel, Find tabs, phone panel chips, palette
  teleport, Update coming soon, extension link dialog, Material dialogs, Tools tab, and passkeys
  end to end with a virtual authenticator. The 40-combination screen sweep (1440 and 390 px, light and
  dark, Cantonese and bilingual) passed at `54cc0a4`, before the Tools tab was added.
- **On commit `a59792f`** (exports, the site diagram, Focus and School modes), GitHub Actions ran the
  type check and the whole test suite, built everything, published release v0.1.79 with 12 files, and the
  Real-world checks passed again. The site build printed the phone PDF (1.5 MB) and the Downloads page.
- **On the earlier feature commit `eef45aa`**, GitHub Actions ran the type check and the whole test suite
  (passed). It also built the Docker image, the Windows apps and both appliance images, and published
  release v0.1.73 with 12 files and line counts in its notes.
- **Real-world checks** passed on v0.1.73: Docker on the same computer and over SSH, USB flashing with
  read-back, the Windows app updating itself from the previous complete release, and the Pi image
  booting on QEMU until the web app answered.

## Checks left to run

The test suite, the builds and the real-world checks have passed on the final feature commit (see
above). These checks still need a person, a browser session or hardware:

1. Run the screen sweep again with the new **Tools** tab: every screen at 1440 and 390 px, light and
   dark, English, Cantonese and bilingual. Look for page errors, sideways scrolling and clipped text.
   The bottom bar on phones now has six destinations.
2. **Appliance in-place updater** (`/usr/local/bin/map-editor-update`, daily through crond): it has
   never run on a booted appliance. On a running appliance, publish a newer image and run the script by
   hand. Check that it switches only after the health check, that it goes back to the old version when
   the new one does not answer, and what it writes to `/var/log/map-editor-update.log`.
3. **Downloads page**: check the page after the next site build. It fills in from the release list the
   site workflow fetches.
4. **Passkeys over https**: they were tested only on localhost. Test behind a real https address, with
   `MAP_EDITOR_ORIGIN` set when a proxy changes the host name. On a plain-http network address the
   page should explain why passkeys are not offered.
5. **Biome edits in the game**: open an edited world in Minecraft Java 1.21 and check the biome in the
   F3 screen. The same goes for structure files: check that `/place template` and structure blocks
   accept the .nbt files, and that chest contents arrive.
6. **Hardware** that CI cannot reach:
   - the installer and the app on a real Windows PC;
   - the Compose start and the network link from another computer;
   - the appliance on VirtualBox, VMware and a spare PC from USB;
   - the Pi image on a physical Raspberry Pi 4 or 5.

## Known leftovers

- Release **v0.1.57** has no files. A failed build published it before the release job was fixed; it
  is left in place so it can be deleted on purpose.
- An empty `/worlds` folder may be left on the build machine from an earlier check. A safety rule
  stopped its removal.
- Still to do, from `ROADMAP.md`:
  - a 3D view and Bedrock worlds;
  - a separate data partition on the appliance;
  - the remaining built-in tools (file converter, Ollama suite, server manager, virtual disk manager);
  - TinyMCE in other rich text fields.
- Code-signed extension sources are not planned: this project does not sign code.
