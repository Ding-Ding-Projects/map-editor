# Roadmap

Ticked means the built artifact was run and checked. Everything else says exactly where it stands.

## Phase 1: shared core

- [x] NBT reader and writer, Anvil region files, 1.18+ chunk sections with packed palettes (round-trip tests).
- [x] Fill, replace, delete, clone and waterlog with a selection size limit; missing chunks are skipped, never invented.
- [x] Local edit history in the app data folder, append-only restore, refuses worlds that already contain their own `.git` (tests).
- [x] Server API: health with build provenance, first account becomes owner (atomic, race tested), sign-in, world roots guard, edits, top-down render, history and restore (end-to-end tests).
- [ ] Settings, account and instance records in the same history (today: world edits only).
- [ ] Passkey sign-in (today: password, scrypt hashed).
- [ ] Bedrock Edition worlds (Amulet supports them; not ported).
- [ ] 3D view, slice view, biome editing, import and export of structures.

## Phase 2: desktop app

- [x] Electron shell runs the shared server on loopback and loads the shared UI (bundle builds).
- [x] Squirrel.Windows installers for Map Editor and Map Editor Deploy built in CI, checked as NotSigned, published in release v0.1.0-build.12.
- [ ] Installer run and app launched on a real Windows PC.
- [ ] Auto-update from the release feed with a restart banner, and "Update coming soon".
- [ ] Native folder picker for worlds outside `.minecraft/saves`.

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
- [ ] A way to add worlds to the appliance from the web UI (upload or network share).

## Phase 5: deploy app

- [x] Docker target: validates name and port, writes a Compose file per instance, pulls, starts, waits for health, shows the link (code; not run against a real Docker host yet).
- [x] VirtualBox target: import, bridged adapter, start headless, read the guest address, health check (code; not run).
- [x] USB flashing: only removable non-system disks, typed confirmation naming the disk, read-back SHA-256 check (code; not run on real hardware).
- [x] Instance list limited to instances the app created.
- [ ] VMware target. Shown as not available in the app.
- [ ] Raspberry Pi flashing (needs the arm64 image).
- [ ] Docker on another machine over SSH.
- [ ] Instance actions: start, stop, restart, logs, update, duplicate, remove.

## Phase 6: required interface features still open

- [x] dockview workspace for the editor (map, tools, history, notes; docking, tabbing, saved layout), checked in headless Chrome.
- [ ] dockview for every other workspace, floating groups by default on wide screens, and the phone single-group layout.
- [x] Rich text notes per world with self-hosted TinyMCE, autosaved; typing and saving checked in headless Chrome.
- [ ] TinyMCE for every other rich text field.
- [ ] Command palette with live setting controls (Ctrl+Shift+F focuses search today).
- [x] Infinite colour picker: continuous field, hue and opacity, any-notation translator (name, HEX, HEX8, RGB, HSL, HSV, HWB, LAB, LCH, OKLab, OKLCH, CMYK), gamut and contrast notes, copy, recent colours, animated rainbow marker with one global speed. Drives the theme seed live; checked in headless Chrome and unit tested.
- [ ] Colour picker on every other colour control; per-element appearance editor; logo customization.
- [ ] Regex builder on every search field.
- [ ] ADHD modes, narration, school mode, scheduled settings, personal vocabulary upload.
- [ ] Notification centre with search; install success and failure takeovers in the desktop app.
- [ ] Dim sum surprise using the public photo catalogue.
- [ ] Exports in every format, bulk actions, changelog viewer, offline documentation.
- [ ] Element locks, unlock ladder, authenticator.
- [ ] Built-in tools: file converter, Base64, quicktype, Ollama suite, Minecraft server manager and world generator, virtual disk manager on Windows.
- [x] Documentation site generated from `site/content.mjs`: landing page and one article per feature, each ending in suggested articles, version and commit in the footer; checked at 320 px wide with no sideways scrolling.
- [ ] Site: every required feature, bundled fonts, phone PDF edition, interactive diagrams, real screenshots, install buttons tied to verified releases.
- [ ] Tabbed README, screen recording, line counts in releases.

## Decisions recorded

- Licence: the upstream Amulet licence is kept unaltered in `LICENSE`; the owner holds an Amulet licence for this work.
- dockview: the public `dockview-core` package.
- TinyMCE: included under its GPL licence key.
