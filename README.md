# Map Editor

**Documentation: https://ding-ding-projects.github.io/map-editor/**

A Minecraft Java Edition world editor based on [Amulet Map Editor](https://github.com/Amulet-Team/Amulet-Map-Editor), rebuilt in TypeScript so the same editor runs three ways:

| Form | What you get |
| --- | --- |
| Desktop app | Windows installer (Squirrel, unsigned). Opens worlds from your `.minecraft/saves`. |
| Docker-hosted web app | `ghcr.io/ding-ding-projects/map-editor`, started with one command, used from any browser on your network. |
| Appliance OS image | A small Linux image that boots straight into the web app. Import the `.ova` into VirtualBox or VMware, or flash the `.img` to a USB drive for a spare PC. |

A separate **Map Editor Deploy** app does each of those in one click and gives you the working link.

**Every edit can be undone.** Each operation is saved and recorded in a private Git history kept in the app's own data folder (never inside your world). Rolling back adds a new history entry, so a rollback can be undone too.

## Quick start

**Windows, from source** (installs missing tools through Chocolatey, may show one admin prompt):

```bat
.\build.bat --run
```

**Docker web app** (asks for the port and your worlds folder, then prints the link):

```sh
node scripts/setup.mjs
```

On Windows, `host.bat` does the same, with `host.bat --detached` to run in the background or `host.bat --logs` to follow the live log. The first person to open the link becomes the owner; there is no setup code.

## What it can do today

- Open Java Edition 1.18+ worlds (Anvil regions, palette sections) in all three dimensions; upload a world as a .zip, download it again, or start a new flat world.
- Top-down map with pan, zoom and Shift+drag selection.
- Fill, replace, delete, clone and waterlog, ported from Amulet's stock operations, with a 16.7 million block safety limit.
- Editor workspace built on dockview: map, tools, history and notes panels you can dock, tab together, float and rearrange; the layout is remembered.
- History panel with action filters and roll back to any point; Undo and Ctrl+Z.
- Command palette on Ctrl+Shift+F with live setting switches, a notification centre, and a first-run wizard.
- Rich text notes per world (TinyMCE), saved automatically.
- English, Hong Kong Cantonese and bilingual interface, with separate English and Cantonese funny-level sliders that change wording only.
- Light and dark Material 3 themes generated from any theme colour, picked with a colour picker that reads names, HEX, RGB, HSL, HSV, HWB, LAB, LCH, OKLab, OKLCH and CMYK; reduced motion.

See [ROADMAP.md](ROADMAP.md) for what is verified, what is built but unverified, and what is still to do.

## Building everything

| Command | Output |
| --- | --- |
| `build.bat` / `./build.sh` | `dist/` bundles for the desktop app, server, web UI and deploy app |
| `build-installer.bat` | Unsigned Squirrel installers in `out/installers` with SHA-256 sums |
| `docker build .` | The web app image |
| `sudo appliance/build.sh <image.tar> <version>` | Appliance `.img`, `.vmdk` and `.ova` in `appliance/out` |
| `npm test` | Core, history and server tests |

The GitHub Actions workflow builds all of these on every push and publishes one release per build.

## Design

The interface is designed first on a design canvas; the source boards are in [`design/canvas`](design/canvas).

## Licence

Map Editor is based on Amulet Map Editor, which is proprietary software of the Amulet Team. Its licence is reproduced in [LICENSE](LICENSE); using Map Editor requires your own Amulet licence from https://www.amuletmc.com/. See [NOTICE.md](NOTICE.md) for this and the third-party licences. Minecraft is a trademark of Mojang Synergies AB; this project is not affiliated with Mojang or Microsoft.
