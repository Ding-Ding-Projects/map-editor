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
- [ ] Squirrel.Windows installer built and installed on Windows. Packaging script and CI job exist; not yet run.
- [ ] Auto-update from the release feed with a restart banner, and "Update coming soon".
- [ ] Native folder picker for worlds outside `.minecraft/saves`.

## Phase 3: Docker-hosted web app

- [x] Web UI driven in headless Chrome against the built server: owner sign-up, open world, fill, history, bilingual mode, no console errors.
- [x] `scripts/setup.mjs` writes `.env` with validation and a non-interactive mode (tested); `host.bat` with `--detached` and `--logs`.
- [ ] Image built and pushed to GHCR. Dockerfile and CI job exist; Docker Hub was unreachable from the build sandbox, so the first build happens in CI.
- [ ] Compose start and LAN link verified from another machine on the network.

## Phase 4: appliance OS image

- [x] Build script (Alpine, pinned builder checked by SHA-256), service that loads the preloaded image, console banner with the link and owner notice, OVF for VirtualBox and VMware, QEMU boot test.
- [ ] x86_64 image built and boot-tested. Runs in CI; the Alpine mirror was unreachable from the build sandbox.
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

- [ ] dockview workspace (docked panels, floating groups, saved layouts). Waiting on how the private dockview fork may be used from this public repository.
- [ ] Rich text editing with TinyMCE. Waiting on a licence compatibility decision (TinyMCE is GPL).
- [ ] Command palette with live setting controls (Ctrl+Shift+F focuses search today).
- [ ] Per-element appearance editor, infinite colour picker, logo customization.
- [ ] Regex builder on every search field.
- [ ] ADHD modes, narration, school mode, scheduled settings, personal vocabulary upload.
- [ ] Notification centre with search; install success and failure takeovers in the desktop app.
- [ ] Dim sum surprise using the public photo catalogue.
- [ ] Exports in every format, bulk actions, changelog viewer, offline documentation.
- [ ] Element locks, unlock ladder, authenticator.
- [ ] Built-in tools: file converter, Base64, quicktype, Ollama suite, Minecraft server manager and world generator, virtual disk manager on Windows.
- [ ] Documentation site on GitHub Pages, tabbed README, screen recording, line counts in releases.

## Known decisions needed

- Licence: the exact upstream Amulet licence text must be added to `LICENSE`.
- dockview source for a public repository.
- TinyMCE licence compatibility.
