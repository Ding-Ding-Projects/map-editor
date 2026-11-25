# Roadmap

Ticked means the built artifact was run and checked. Everything else says exactly where it stands.

## Phase 1: shared core

- [x] NBT reader and writer, Anvil region files, 1.18+ chunk sections with packed palettes (round-trip tests).
- [x] Fill, replace, delete, clone and waterlog with a selection size limit; missing chunks are skipped, never invented.
- [x] Local edit history in the app data folder, append-only restore, refuses worlds that already contain their own `.git` (tests).
- [x] Server API: health with build provenance, first account becomes owner (atomic, race tested), sign-in, world roots guard, edits, top-down render, history and restore (end-to-end tests).
- [x] History search, From and To date filters combined with the action chips and a shown count; checked in headless Chrome.
- [ ] Settings, account and instance records in the same history (today: world edits only).
- [ ] Passkey sign-in (today: password, scrypt hashed).
- [ ] Bedrock Edition worlds (Amulet supports them; not ported).
- [ ] 3D view, slice view, biome editing, import and export of structures.

## Phase 2: desktop app

- [x] Electron shell runs the shared server on loopback and loads the shared UI (bundle builds).
- [x] Squirrel.Windows installers for Map Editor and Map Editor Deploy built in CI, checked as NotSigned, published in release v0.1.0-build.12.
- [ ] Installer run and app launched on a real Windows PC.
- [ ] Auto-update from the release feed with a restart banner, and "Update coming soon".
- [x] Native folder picker for worlds outside `.minecraft/saves` (Browse folder… in the desktop app; not yet run on Windows).

## Phase 3: Docker-hosted web app

- [x] Web UI driven in headless Chrome against the built server: owner sign-up, open world, fill, history, bilingual mode, no console errors.
- [x] `scripts/setup.mjs` writes `.env` with validation and a non-interactive mode (tested); `host.bat` with `--detached` and `--logs`.
- [x] Image built for amd64 and arm64, pushed to GHCR, and started with docker compose in CI until its health check answered.
- [ ] Compose start and LAN link verified from another machine on the network.

## Phase 4: appliance OS image

- [x] Build script (Alpine, pinned alpine-make-rootfs checked by SHA-256), service that loads the preloaded image, console banner with the link and owner notice, OVF for VirtualBox and VMware, QEMU boot test.
- [x] x86_64 image built in CI (alpine-make-rootfs on a loop device, syslinux), booted under QEMU until the web app answered its health check, and published as `.img.xz` and `.ova` in release v0.1.0-build.12.
- [ ] Booted on real VirtualBox, VMware and a spare PC from USB.
- [ ] Raspberry Pi arm64 image with a QEMU boot test before upload.
- [ ] Separate data partition and an in-place updater for the OS and the app image together.
- [x] Worlds can be uploaded as a .zip, created as a flat world and downloaded as a .zip from the web UI (unpack checks every path and refuses archives without level.dat; idiots and a headless Chrome run).

## Phase 5: deploy app

- [x] Docker target: validates name and port, writes a Compose file per instance, pulls, starts, waits for health, shows the link (code; not run against a real Docker host yet).
- [x] VirtualBox target: import, bridged adapter, start headless, read the guest address, health check (code; not run).
- [x] USB flashing: only removable non-system disks, typed confirmation naming the disk, read-back SHA-256 check (code; not run on real hardware).
- [x] Instance list limited to instances the app created.
- [x] VMware target: OVF Tool imports the appliance on a bridged network, vmrun starts it without a window and reads its address from open-vm-tools, then the health check; start, stop, restart and remove (files kept unless Delete data); unit tested with stand-in ovftool and vmrun. Not run on a real VMware install.
- [x] The appliance now carries open-vm-tools and the VirtualBox guest additions, so VMware and VirtualBox can read its network address (the VirtualBox target needed this and could not have found the address before).
- [x] Docker on another computer over SSH: Docker's own `DOCKER_HOST=ssh://user@host` transport with the user's SSH agent (the app stores no passwords or keys); validated login and absolute remote worlds path; deploy, state, actions and live log all go to that computer; unit tested with a stand-in docker that records DOCKER_HOST, and the form plus takeovers checked in headless Chrome. Not run against a real remote host.
- [x] Raspberry Pi card explains that a Pi 4 or 5 with Docker uses the SSH route (the image is multi-arch) and links to it.
- [ ] Raspberry Pi flashable image.
- [x] Instance actions: start, stop, restart, update, remove (with an optional Delete data step and a confirm dialog), state dot and live log with Pause and Copy; unit tested with a stand-in `docker` and driven in headless Chrome.
- [x] The Docker target defaults to the `latest` image (published from main) so Update pulls the newest release; the version field only accepts Docker tag characters, so it cannot change the generated Compose file (unit tested).
- [ ] Instance duplicate.

## Phase 6: required interface features still open

- [x] First-run wizard: language and both funny levels, comfort, theme colour, then the worlds screen; Back, Next, Skip; resumes after a reload (checked in headless Chrome).
- [x] Editor: Nether and End chips for the dimensions a world has, Undo button and Ctrl+Z (adds a restore entry), block suggestions, tool hotkeys F R D C W, map fitted to the world on open, selection starting at spawn.

- [x] dockview workspace for the editor (map, tools, history, notes; docking, tabbing, saved layout), checked in headless Chrome.
- [x] Phone width (720 px and under): the editor workspace becomes one tabbed group with its own saved layout, the header compacts, and destinations move to a bottom bar; every screen checked at 390 px with no sideways scrolling.
- [ ] dockview for every other workspace and floating groups by default on wide screens.
- [x] Rich text notes per world with self-hosted TinyMCE, autosaved; typing and saving checked in headless Chrome.
- [ ] TinyMCE for every other rich text field.
- [x] Command palette on Ctrl+Shift+F: every tab, tool, undo, language and appearance setting, with settings as live switches in the result row; checked in headless Chrome.
- [ ] Palette: teleport to the exact element, remembered size.
- [x] Infinite colour picker: continuous field, hue and opacity, any-notation translator (name, HEX, HEX8, RGB, HSL, HSV, HWB, LAB, LCH, OKLab, OKLCH, CMYK), gamut and contrast notes, copy, recent colours, animated rainbow marker with one global speed. Drives the theme seed live; checked in headless Chrome and unit tested.
- [ ] Colour picker on every other colour control; per-element appearance editor; logo customization.
- [x] Regex builder beside every search field (settings, history, changelog, command palette): plain text by default, `.*` per field, worker-isolated ECMAScript engine stopped after 250 ms, raw pattern synced both ways, flags i m s u, sample with highlights and capture groups, copy and export, nothing saved; unit tested (zero-width, Unicode, multiline, limits, invalid) plus a catalogue test that fails on any search field outside the builder; checked in headless Chrome including a catastrophic pattern.
- [ ] Search with the builder on dropdowns and right-click menus once the app has them.
- [x] Settings in sections (Language and voice, Appearance, Comfort and focus, Backup and history, Coming later) with search across every section, Large text, Export and Import (only known settings with the right types are accepted) and a settings history where every change can be restored; checked in headless Chrome.
- [x] Sound effects made with Web Audio (no sound files): cues after an edit, undo or restore, a new or uploaded world, settings import, and any error; Settings › Sounds switch (also in the palette), volume and a test sound; off silences at once and stays off after a reload; checked in headless Chrome by counting the oscillators started.
- [x] A Clear button on every editable text field: Material fields get one automatically (including fields added later, in the deploy app too), search boxes and the regex builder fields have their own; each is named after its field, clears through the normal input and change events and returns focus; checked in headless Chrome.
- [ ] ADHD modes, narration, school mode, scheduled settings, personal vocabulary upload.
- [x] Notification centre behind the bell with a count badge and Dismiss all.
- [x] Deploy app takeovers from the Takeover board: success (link, version, time taken, Open, Copy link, closes after 8 s unless in use) and failure (stays until dismissed, step log and exact error, Try port N+1 when the port is taken, Copy details), focus kept inside, Esc closes; checked in headless Chrome including the port retry.
- [x] Notification centre search with its own regex builder (in the search-surface catalogue test); checked in headless Chrome.
- [ ] Takeovers in the editor app.
- [x] Updates for both Windows apps through Squirrel.Windows: Squirrel install, update and uninstall events create and remove shortcuts; installed copies check `https://ding-ding-projects.github.io/map-editor/updates/<app>/RELEASES` at start and every four hours, download in the background and show a ready-to-install banner (version, release notes link, not code-signed, Later, Restart to install update; restart refused while an edit, deploy or flash is running). Check for updates in About and the palette. The site build writes the feeds from the latest release with absolute package URLs (unit tested). Every build now gets its own version, major.minor.run, so updates move forward. Banner and About states checked in headless Chrome with a stand-in bridge; the real update round trip on Windows is not verified yet.
- [ ] Dim sum surprise using the public photo catalogue.
- [x] About screen with version, build commit, licence note, Copy version details and a searchable changelog built from the commit log (Added, Fixed, Changed); checked in headless Chrome.
- [ ] Exports in every format, bulk actions, offline documentation.
- [ ] Element locks, unlock ladder, authenticator.
- [ ] Built-in tools: file converter, Base64, quicktype, Ollama suite, Minecraft server manager and world generator, virtual disk manager on Windows.
- [x] Documentation site generated from `site/content.mjs`: landing page and one article per feature, each ending in suggested articles, version and commit in the footer; checked at 320 px wide with no sideways scrolling.
- [ ] Site: every required feature, bundled fonts, phone PDF edition, interactive diagrams, real screenshots, install buttons tied to verified releases.
- [ ] Tabbed README, screen recording, line counts in releases.

## Decisions recorded

- Licence: the upstream Amulet licence is kept unaltered in `LICENSE`; the owner holds an Amulet licence for this work.
- dockview: the public `dockview-core` package.
- TinyMCE: included under its GPL licence key.
