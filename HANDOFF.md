# Handoff: what was built, and the checks still to run

This file lists the work finished on 25 November 2026, the checks that were run, and the checks
that were left for the next person to run. `ROADMAP.md` stays the honest checklist of features;
this file covers testing.

## Built in this round

| Area | What | Where |
| --- | --- | --- |
| Editor | Map toolbar (Pan, Select, Pick block, Measure, Go to; keys H S I M G) | `src/ui/main.ts` |
| Guide | The whole guide inside the app and the deploy wizard, offline, in English, Cantonese or both, with its own search | `src/ui/docs.ts`, `src/deploy/ui.ts` |
| Guide | The same guide as Markdown, one page per feature, kept current by a test | `scripts/feature-docs.mjs`, `docs/features/` |
| Selection | Tick boxes with Shift+click, Select all and Invert on Worlds (download), notifications (dismiss), History and Activity (export), Extensions (export, switch off) and deploy Instances (start, stop, restart, with a report) | `src/ui/select.ts`, `src/ui/worlds.ts`, `src/ui/main.ts`, `src/deploy/ui.ts` |
| About | Each change in the changelog opens to its full note, through a small safe Markdown renderer | `src/ui/markdown.ts`, `scripts/build.mjs` |
| About | A code name for each release from the public dim sum catalogue, also in the release notes | `scripts/code-name.mjs` |
| Desktop | Open the world folder in an outside editor or the file manager | `src/desktop/editors.ts`, `src/desktop/main.ts` |
| Editor | Right-click menu on the map and searchable dropdowns everywhere, each with the regex builder; map view kept when you leave and return; phone toolbar clear of the bottom bar | `src/ui/menu.ts`, `src/ui/main.ts` |
| Deploy app | Virtual disks view for Windows: list, create, attach, detach through diskpart with the permission prompt | `src/deploy/targets.ts`, `src/deploy/ui.ts` |
| Core | Bedrock Edition worlds: LevelDB reader and log appender, sub-chunk decoder and encoder, same tools as Java worlds | `src/core/leveldb.ts`, `src/core/bedrock.ts`, `tests/bedrock.test.ts` |
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
- **On commit `f5826aa`** (right-click map menu, searchable dropdowns, the Windows virtual disk view, Bedrock
  Edition worlds), GitHub Actions ran the type check and all 108 tests, built everything, published release
  v0.1.94 with 12 files (the release step's new retry worked), and the Real-world checks passed: the Pi image
  boot, the Linux deploy and the Windows update.
- **Bedrock worlds** were read from real 1.16, 1.17 and 1.18 worlds from the Amulet test data, edited, and
  the result opened with the stock LevelDB library, which replayed the new log file and returned the new
  values with every other entry unchanged. The screen was checked in headless Chrome with one of those worlds.
- **On commit `a59792f`** (exports, the site diagram, Focus and School modes), GitHub Actions ran the
  type check and the whole test suite, built everything, published release v0.1.79 with 12 files, and the
  Real-world checks passed again. The site build printed the phone PDF (1.5 MB) and the Downloads page.
- **On the earlier feature commit `eef45aa`**, GitHub Actions ran the type check and the whole test suite
  (passed). It also built the Docker image, the Windows apps and both appliance images, and published
  release v0.1.73 with 12 files and line counts in its notes.
- **Real-world checks** passed on v0.1.73: Docker on the same computer and over SSH, USB flashing with
  read-back, the Windows app updating itself from the previous complete release, and the Pi image
  booting on QEMU until the web app answered.

- The real desktop app and the real deploy wizard were started on Linux (Electron under a virtual display, throwaway
  profile). Desktop app: sign-up, first-run steps, a new flat world in the saves folder, open, a fill, History, the data
  folder card, a saved data folder choice used at the next start, moving back to the built-in folder, and the outside
  editor hand-off with a stand-in editor on PATH. Deploy wizard: first-run steps, all four views, the Guide and the
  support desk. No page errors in either. This was Linux only; the folder-picking dialog was not clicked.

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
  - Bedrock Edition: blocks the world does not hold yet, biomes, entities and block entities.
- Not yet tried for real: a Bedrock Edition world opened in the game after an edit here (the stock LevelDB library reads the result correctly; the game itself has not been run), the Virtual disks view of the deploy app on a Windows PC (create, attach, attach read-only, detach, and declining the permission prompt), the local AI helper against a running Ollama, and the server.properties editor
  with a file from a live server.
- Not yet tried on a real Windows PC: opening the world folder in an outside editor (detection and the hand-off are unit tested and checked with a stand-in in a browser).
- There is no way to delete a world from the app, and so no bulk delete; this is left out on purpose until it is asked for.
- Code-signed extension sources are not planned: this project does not sign code.

## Releases and workflow changes

- The release workflow runs no tests and no lint; it only builds, packages and publishes. Before committing, stage the
  change and run `node scripts/local-checks.mjs record`, then add `local-checks.json` to the same commit. The release
  notes repeat that record only when its fingerprint matches the files in the released commit; otherwise they say that
  nothing is claimed. A release existing is never a test result.
- GitHub calls in the workflow use `RELEASE_TOKEN`, then `ORG_TOKEN`, then `GITHUB_TOKEN`.

- Do not push a change to a file under `.github/workflows/` while an earlier Build and release run is still publishing. The run for `79a3f98` built everything and was then refused at the publish step, apparently because its commit's workflow file differed from the one at the tip of `main`; that commit never got a release of its own.
- The step that attaches the guide PDF to a release must not install packages. Installing a Chinese font there took six minutes and delayed v0.1.209.
- `tests/markdown.test.ts` has a timing check. It failed twice on a slow build machine before the link pattern was made linear; if it fails again, look for a pattern that rescans, not for a higher limit.

## Where the work stopped on 26 November 2026

The session was closed early, with work still open. Everything written is on `main`; nothing is waiting in another
branch, checkout or stash. This section says what is finished, what is not, and what the next person should do first.

### Done and read back today

- The release workflow builds and publishes only. Checks run before a commit are recorded by
  `node scripts/local-checks.mjs record` and repeated in the release notes when they match the commit.
- Appliance image builds retry up to three times. A wording lock runs at the start of a build and before a push.
- Settings: every switch and value says whether it is the built-in choice or the person's own, with a folded
  explanation. First-run setup has six comfort switches. The account button opens a menu instead of signing out.
  The tab strip and the phone bar have a New tab list. Shortcuts come from one table and show Mac keys on a Mac.
- Deploy app: the title is never cut off; three plain checkboxes became Material ones.
- Postman: real request bodies, one collection per area, every sendable example sent to a running server.
- Design canvas: a new board for virtual disks; every board's labels, tabs, tools and steps brought into line with
  the app; no private network addresses on boards. Tests hold these in place.
- New walkthrough recordings for the app and the deploy app, each with its commit and how it was made.
- Last release read back: v0.1.254 from `9bec503` (13 files, all jobs green).

### Not finished

- The release for `de960e5` was still running when the session ended. Read it back with
  `gh api repos/Ding-Ding-Projects/map-editor/releases/latest`.
- Feature inventory: 30 built, 74 partial, 8 not built (`docs/features/INVENTORY.md`). Each line names what is missing.
- The design boards were compared with the app by wording and by a stand-in renderer, not screen against screen,
  and not on the real canvas.
- Not checked on a real Windows PC. The published documentation site was not read back.
- Two Postman requests were not sent: registering a passkey and signing in with one.

### Waiting for the maintainer

- Whether to publish a sanitized copy of the maintainer's working rules in `README.md` and `AGENTS.md`. A copy was
  prepared outside the repository and is not kept; it can be made again with the maintainer's export tool.
- Whether to rewrite history for commit `0a4ed50`, and whether to delete release v0.1.57 and draft v0.1.78.
- Uploading the social preview picture in the repository settings.

### First steps for the next person

1. `npm ci`, then `npm run build` and `node scripts/local-checks.mjs record` to confirm the tree is sound.
2. Read `.claude/skills/map-editor-operations/SKILL.md` for how to run, drive and release.
3. Pick the shortest "MISSING" lines in `docs/features/INVENTORY.md` first.

