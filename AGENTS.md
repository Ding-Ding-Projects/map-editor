# Agent notes

## Agent conversation vocabulary

Agents working in this repository use the shared private conversation vocabulary defined in
the maintainer's canonical agent instructions for every reply, including chat prose, visible
reasoning, status lines, and task or session titles. Read those instructions and apply them
in full. They are deliberately not restated here, because this file is part of this
repository's public record.

That vocabulary never appears in anything published. Keep it out of commit messages, branch
names, code, code comments, test names, documentation, this file, issues, pull requests,
discussions, release notes, published sites, logs, and every other file in this repository.
Published writing uses ordinary professional English, and exact technical identifiers always
keep their literal spelling. The single documented public-safe exception is named in those
canonical instructions; do not infer any other.

Scan any text bound for a public surface against that vocabulary before publishing it. A
reviewer cannot tell a correct release note from a leaking one by reading it, so the scan is
a step, not a habit.

## Working in this repository

- Every form (desktop app, Docker-hosted web app, appliance OS image, deploy app) shares one core in `src/core` and one UI in `src/ui`. Change the core once; never fork behaviour per form.
- World edits are recorded in a local Git history kept in the app data folder, never inside a world folder. Restores add a new entry; never rewrite that history.
- Run `npm test` and `npm run typecheck` before committing. `ROADMAP.md` is the honest checklist: tick an item only after its built artifact was verified.
