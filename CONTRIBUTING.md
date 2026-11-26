# Contributing

Thank you for helping with Map Editor.

1. Install Node.js 22 and run `npm ci`.
2. Make your change. Every form of the app (desktop, web, appliance, deploy app) shares one core in `src/core` and one
   interface in `src/ui`, so change behaviour once, in the shared code.
3. Run `npm run typecheck` and `npm test`. Both must pass.
4. Run `npm run build` and try the change: `node dist/server/server.mjs` starts the web app.
5. Open a pull request that says what changed and how you checked it. If the change is visible, add a screenshot.

`ROADMAP.md` is the checklist of what exists. Tick an item only after you have tried the built result.
World edits are recorded in a local history kept in the app data folder; never write inside a world's own folder
except to the world files themselves, and never rewrite that history.

## Wording lock

`scripts/check-vocabulary.mjs` runs at the start of every build and before every push (enable the hook once per
clone with `git config core.hooksPath .githooks`). It compares a private file the maintainer keeps outside this
repository with the lock stored beside that file. If you do not have that file, the check prints that it was
skipped and you can build and push as usual. It fails only when the file is present and has changed since it was
locked. It shows that the current file is held, not that it was followed.
