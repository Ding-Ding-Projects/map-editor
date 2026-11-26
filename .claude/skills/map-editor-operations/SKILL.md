---
name: map-editor-operations
description: Build, run, drive, check, release and recover Map Editor (desktop app, web app, appliance images, deploy app, documentation site). Use when asked to build or package it, run it for a look, take screenshots of a screen, make or read back a release, or get a broken release or build going again.
---

# Map Editor operations

Every route below was used on this repository. Paths are relative to the repository root. Where a route
was only run on Linux, it says so.

## Build

- Everything: `npm ci` once, then `npm run build` (runs `scripts/build.mjs`; writes `dist/`).
  On Windows `build.bat` does the same; `build.sh` on Linux and macOS.
- Type check: `npm run typecheck`. Tests: `npm test`.
- Documentation site: `SITE_BASE=/map-editor/ node site/build.mjs` writes `site/dist/`.
- Generated files that tests compare against their sources. Run the generator after changing the source:
  - `docs/features/INVENTORY.md` or guide content: `node scripts/feature-docs.mjs`
  - server routes or request fields: `node scripts/postman.mjs`

## Run for a look

- Web app: `MAP_EDITOR_PORT=18441 MAP_EDITOR_HOST=127.0.0.1 MAP_EDITOR_WORLDS=<folder of worlds> MAP_EDITOR_DATA=<empty folder> npm run start:server`,
  then open `http://127.0.0.1:18441`. The first visitor registers the owner account.
- Desktop app: `npm run start:desktop`. Deploy app: `npm run start:deploy`.
- On a Linux machine without a screen: `xvfb-run -a node_modules/.bin/electron . --no-sandbox --user-data-dir=<empty folder> --remote-debugging-port=<port>`
  and attach a browser automation library to that port. This was run on Linux only, not on a Windows PC.
- Docker: `docker compose up` with `compose.yaml`.

## Drive the screens and take screenshots

- Use headless Chrome through an automation library against the running web app. Sign in, then set
  the saved preferences (`localStorage` key `map-editor.prefs.v1`) to land on the screen under test,
  for example `{ onboarded: true, tourOffered: true, dimSum: false, tab: 'settings', settingsSection: 'comfort' }`.
- Check each screen at 1440×900 and at 390×844 (phone), in English and in the bilingual mode.
- For every screen record: page errors, sideways overflow (`document.documentElement.scrollWidth - innerWidth`
  must be 0), and a screenshot. Open the screenshot at full size and look at it; measurements alone have hidden
  clipped fields and overlapping text before.
- Screenshots that go into the repository show `/srv/minecraft/worlds` as the worlds folder and no addresses or user names.
- The deploy app's page can be driven in a browser with `window.deploy` replaced by a stand-in object.

## Check before committing

1. Stage the change (`git add` the files; `.agent/` is never added).
2. `node scripts/local-checks.mjs record` runs the type check and the tests and writes `local-checks.json`
   with a fingerprint of the staged files. Stop if it reports a failure.
3. `git add local-checks.json` and commit. The release notes repeat this record only when it matches the commit.

## Release

- Every push to any branch runs `.github/workflows/release.yml`: it builds the Docker image, the Windows installers
  and both appliance images and publishes one normal release tagged `v<major>.<minor>.<run number>`.
  It runs no tests and no lint.
- Read a release back, never assume it:
  - `gh run list --workflow release.yml -L 5`
  - `gh api repos/Ding-Ding-Projects/map-editor/releases/latest` for the tag, the commit, `draft: false`, `prerelease: false` and the files
  - the notes must carry the job results, the check record lines and the three `Workflow` timing lines
- A full release has 13 files. The Docker image and the Windows installers are required; a release may go out
  without the appliance images when their jobs fail.
- After a release the `Real-world checks` workflow (`verify.yml`) installs and boots what was published. Read it with
  `gh run list --workflow verify.yml -L 5`.
- A push while a run is waiting cancels the waiting run; a run that has started keeps going. Do not push a change to
  `.github/workflows/` while an earlier run is still publishing: its tag is refused.
- Windows installers are not code-signed by decision; the workflow fails if one reports any signature.

## Recover

- A release without appliance images: look at the failed job with `gh run view <id> --log-failed`. A download
  server answering with an error is the usual cause; the builds retry three times. Push the next commit or run the
  workflow again from the Actions page; do not edit or delete the incomplete release.
- A job that hangs: every job has a time limit and fails on its own. Cancel it from the Actions page if it blocks the queue.
- A test that compares generated files fails: run the generator named under Build and record the checks again.
- A commit went out with a failing check: fix forward with a new commit. History is not rewritten and tags are not moved.
- World edits are never lost by an app update: they are recorded in a Git history in the app data folder, and
  restoring adds a new entry.
