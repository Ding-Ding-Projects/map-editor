# Feature inventory

An honest record of how this project stands against the maintainer's feature catalogue. It was written by reading the
code, not the roadmap. PARTIAL means some required part is missing, and the line says which. Lines are updated as work
lands; anything not rechecked keeps its last audited status.

Audited on 2026-11-25. Since that audit these landed and still need a recheck against their full requirements:
link previews (`shared-link-embed`), shortcuts shown in menus (`menu-shortcuts`), the Postman collection
(`postman-collections`), QR pairing (`qr-pairing`), the two-key confirmation (`super-confirmation`), dropping a
vocabulary file on the window (`vocabulary-drop-apply`), icons on every button and the redesigned shell.

Counts (126 features): built 11 / partial 74 / unbuilt 27 / not applicable 14


## Language, voice, and personalization

`job-experience-document-label` | APPLIES: no | STATUS: N-A | EVIDENCE: not a job-related app | MISSING: -
`language` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/i18n.ts, src/ui/main.ts (shell language chips, Settings) | MISSING: Deploy app is English only (src/deploy/ui.ts has no language state); site is English only (site/build.mjs `lang="en"`, no mode switch); no narrow-width longest-bilingual-string test in repo
`funny-emoji` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/i18n.ts (en5/yue5), main.ts `#fen` `#fyue`, onboarding.ts | MISSING: "Show emojis in dialogs and message boxes" switch (no emoji code at all); independent reset per slider; Deploy app and site have no funny levels; no test that facts are identical at levels 1 and 5
`personal-vocabulary` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: i18n.ts `parseVocabulary`, main.ts `#vocab-up` `#vocab-template` `#vocab-reset` | MISSING: versioned schema; 256 KiB/depth 8/key 160/value 1000 bounds (code uses 512 KiB and 400 chars); whole-file rejection (unknown ids are skipped, so it applies partially); palette row for it; Deploy app and site have none; narration/error surfaces not proven
`vocabulary-drop-apply` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts drop handler lines ~139-157, src/ui/uh.ts `levelUp` `vocabHeadline`, sounds.ts tada/invalid, tests/uh.test.ts | MISSING: Deploy app has no drop handler; drop is ignored (not refused with a message) for non-.json files; no built-app proof
`school-mode` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts `schoolMode` pref, `#school`, i18n `schoolModeNote` | MISSING: shared cross-app record (it is a per-browser localStorage flag); rename; forcing English and removing Cantonese, bilingual, funny levels, personal vocabulary and dim sum (dim sum check only looks at focusMode); PIN/password/passkey to turn off; "not a security boundary" line; Deploy app and site
`narration` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts `narrate()`, `#nar`, `#nar-rate`, `#nar-try` | MISSING: per-language voice pickers with "Choose automatically" and the voice in effect; pitch control; "Both" serialized mode; debounce and per-category rate limit (it cancels the previous utterance); screen-reader yield; Deploy app and site
`action-sound-effects` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/sounds.ts, main.ts `#snd` `#vol` `#snd-try`, quiet hours | MISSING: Deploy app plays no sounds and has no switch; documented action-to-cue mapping and provenance article
`scheduled-settings` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts `darkSchedule`, `quietHours`, `inWindow` | MISSING: schedules for language, density, seed colour, fonts, motion, display name; weekday/date rules; versioned rule schema with ids and precedence; HTTPS API and Home Assistant sources; stated timezone/daylight-saving semantics; site and Deploy app
`display-name` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: none (`appName` is a fixed string in i18n.ts; window title fixed in src/desktop/main.ts) | MISSING: rename setting, one-action reset, use in title bar/About/notifications, history entry per rename
`adhd-modes` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts `focusMode` (`#focus`), styles.css `.focus-mode` | MISSING: Low stimulation, Time awareness, One thing at a time and Momentum as separate toggles; Focus is a bundle that also forces reduced motion; documented interaction with School mode; site and Deploy app
`dim-sum` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts `dimSumSurprise`, src/server/dimsum.ts, tests/dimsum.test.ts | MISSING: the picture (card always shows "Public image unavailable"); real off switch `#ds` must become the switch that springs back on; School-mode suppression; suppression during an update or a running edit; Deploy app and site
`dim-sum-photo-source` | APPLIES: yes | STATUS: BUILT | EVIDENCE: src/server/dimsum.ts (public catalogue URL, cache with source and revision, unavailable-image state); no dim-sum images tracked | MISSING: -

## Material Design 3, appearance, and layout

`material-design` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: @material/web components and M3 tokens in main.ts, styles.css; material-color-utilities | MISSING: generic HTML still rendered as controls (native `<select>` tone rows, raw `<button>` tabs/menus, `<textarea>` in tools.ts); hand-written per-surface component inventory; test that fails on a generic placeholder; site is hand-written CSS
`workflow-navigation` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts `shell()` destinations, bottom nav | MISSING: frameless window with custom title bar and window controls (src/desktop/main.ts and src/deploy/main.ts create default-framed `BrowserWindow`); interaction tests for navigation controls
`motion` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: styles.css reduced-motion blocks, `.reduce-motion`, rainbow settles under reduced motion | MISSING: full-screen animation on every installation success and failure (only upload and deploy takeovers); motion as a schedulable value; reduced-motion test per animated surface
`live-charts` | APPLIES: no | STATUS: N-A | EVIDENCE: no chart with live-updating data exists in the app, Deploy app or site | MISSING: -
`update-coming-soon` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts `updateBanner` (`updSoon`), src/deploy/ui.ts | MISSING: it shows while a published update downloads, not while a build is being made; build number, per-stage state, start/elapsed time, labelled estimate, contents; unknown/offline/failed/replaced states; site
`appearance-editor` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts `TONE_ELEMENTS` (4 parts x 4 tones), theme seed, large text | MISSING: "Edit appearance…" on every element via context menu and keyboard; anchored non-modal editor; typography and image-layer editing; density and font controls; undo/redo, presets, copy/paste style, import/export; Animation and Transition tab; capability matrix
`color-picker` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/colorpicker.ts, src/ui/color.ts, tests/color.test.ts (field, translator, gamut, contrast, rainbow) | MISSING: search with the regex builder inside the picker; preset export/import; picker used for every colour control (part tones use a 4-option dropdown); site and Deploy app
`logo-customization` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts `LOGO_KEY`, `#logo-up`, `#logo-reset` | MISSING: several built-in logo presets; crop/fit/focal point/safe area/background editor; byte-level decode check (only a data-URL regex; animated GIF accepted); loading/converted/error states; history, schedule and palette entries; site and Deploy app
`overlay-panels` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: styles.css `.palette { resize: both }`, menu.ts viewport clamping, dockview floating groups | MISSING: edge/corner resize and header drag for notification centre, menus, picker, takeovers; keyboard resize/move; per-surface persisted size and position with reset (palette only)
`collapse-filters` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: none (history filters, search bars and stats are always expanded) | MISSING: collapsible search/filter/statistics panels, persisted collapsed state, active-filter note while collapsed
`accessibility-sizing` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts large text, reduce motion, read aloud; styles.css `:focus-visible` | MISSING: everywhere-reachable accessibility-tools menu; contrast setting; larger-targets and keyboard-help entries; confirmed hide action; in-repo checks at 100/125/150/200% scale
`functional-ui` | APPLIES: yes | STATUS: BUILT | EVIDENCE: main.ts/worlds.ts truthful empty states (`noWorldsTitle`, `extNone`, `activityNone`), real create/upload paths, no seeded sample data | MISSING: -

## Navigation, search, and commands

`onboarding-wizard` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/onboarding.ts (steps, Back/Next/Skip, resume via `onboardStep`) | MISSING: Deploy app has no first-run wizard; steps set preferences only (no setup action with a reported result such as choosing the worlds folder)
`extension-support` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/server/extensions.ts, extensions/, samples/extensions/, tests/extensions.test.ts, main.ts `extensionsPanel`, site article `extensions` | MISSING: Deploy app has no extension support
`tabs` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts `shell()` tab list, `closedTabs`, Open every tab; src/ui/tabsearch.ts | MISSING: dock strip to any edge; reorder; pin; groups and "Move… into group…"; overflow surface; New tab catalog; the other three tab-discovery searches; never-offered-tab logic on update; tabbed Settings with the full tab feature set; site and Deploy app tabs
`regex-search` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/regex.ts, regex-core.ts, regex-worker.ts, tests/regex.test.ts (surface catalogue test) | MISSING: RegexBuddy-parity workbench (replace syntax, flavour compare/convert, debug trace, benchmark, code templates, GREP, collections); pattern history and snippets; dated per-topic parity ledger; Deploy app and site searches
`command-palette` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/palette.ts, main.ts `paletteCommands`, `showSetting` teleport, Ctrl+Shift+F handler | MISSING: articles/feature pages as rows; persisted choice between card and full-window; locked rows prompt to unlock (they only refuse); palette in the Deploy app and on the site
`context-menus` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/menu.ts (filter field + regex builder), main.ts map menu | MISSING: a menu on every element (only the map and dropdowns); "Edit appearance…" and "Lock this element…" items; live toggle/slider controls inside rows; result-count announcement; Deploy app and site
`menu-shortcuts` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: menu.ts `MenuItem = [label, run]` has no shortcut field | MISSING: right-aligned shortcut per item from the same table that registers the key; test comparing displayed and registered bindings
`rich-controls` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: palette.ts live toggles in result rows | MISSING: live controls in lists, history rows, menu items and cards; list virtualization; named-reason inventory for plain readouts
`guided-forms` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/clearable.ts (clear control on every text field), block suggestions, world presets, validation in scripts/setup.mjs | MISSING: per-element optional guided wizard with worked example and playground; per-element guidance and complexity inventories; novice/Custom mapping; help identifiers
`info-icon-guidance` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: none | MISSING: info icon button above each control, its contextual panel, per-control inventory and tests
`settings-explanations` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts `sw()` rows show a note per switch | MISSING: progressive disclosure; provenance line (saved value vs built-in default, naming the default); notes for sliders/time fields; hand-written settings inventory test
`settings-quick-add` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: none (e.g. the Ollama-unreachable message points to an environment variable) | MISSING: quick-add input + Save beside every Settings pointer; pointer inventory test
`data-folder-choice` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: data folder fixed in src/desktop/main.ts (`userData/data`); only a worlds folder picker exists | MISSING: profile/save folder rows with picker, current and default path, move with progress, reset; profile folder as a Git repository with .gitignore and auto-commits; optional private remote; fixed-volume notice in web/appliance forms
`blank-editors` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/worlds.ts + src/core/archive.ts `createFlatWorld` presets | MISSING: presets for the blank notes editor and blank tools; preset description of exactly what is created; undo of a preset through history

## Safety, locks, and authentication

`super-confirmation` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/uh.ts `superConfirm`, main.ts `askConfirm(..., danger=true)` | MISSING: used only for passkey removal and extension removal; rollback, structure placement, vocabulary/logo reset, Deploy app remove/Delete data and drive writes still use plain or typed confirms; not anchored beside the control
`element-locks` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts `lockedSettings`, `settingsLocked`, `layoutLocked`, `tabsLocked`, `editLock` | MISSING: "Lock this element…" on every element/tab/group; the six credential mixes (PIN, password, TOTP) in an OS credential vault; anchored lock/unlock wizard; "just for fun" and recovery line; lock inventory test
`support-tickets` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: none | MISSING: Support Tickets desk, its three entry routes, open-data-folder resolution, disclosure line, ticket list
`unlock-ladder` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts `askUnlock` (confirm, type the name, 15 s wait) | MISSING: the required rungs (dim-sum question, ten sums, whack-a-mole, clock); per-hour cap; server-side grading with single-use nonce; School-mode start; site
`authenticator` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/server/totp.ts (RFC 6238 SHA-1, 6 digits), tests/totp.test.ts, main.ts `totpPanel` | MISSING: a built-in authenticator destination for arbitrary secrets (current code is only second-step sign-in); SHA-256/SHA-512, 8 digits, custom periods; QR/image/clipboard import; countdown and next-code peek; OS vault storage; secrets export behind super confirmation
`qr-pairing` | APPLIES: yes | STATUS: BUILT | EVIDENCE: src/ui/uh.ts `qrSvg`/`otpauthParts`, main.ts `totpPanel` (QR, hidden secret with Show, algorithm/digits/period, confirm code), tests/uh.test.ts | MISSING: - (not yet committed)
`honest-monetization` | APPLIES: yes | STATUS: BUILT | EVIDENCE: no paywall, purchase, donation or review prompt anywhere in src/ or site/ | MISSING: -
`first-account-owner` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/server/auth.ts `registerOwner` (exclusive create), server.ts `/api/auth/register`, tests/server.test.ts, README, appliance/configure.sh banner, scripts/setup.mjs | MISSING: removal of old setup-code files at startup; the statement in the Deploy app UI

## Records, history, and messages

`local-history` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/core/history.ts (isomorphic-git, append-only restore), main.ts `historyView` (search, dates, action chips with counts), src/server/activity.ts, settings history | MISSING: diff view, labels, prune; settings history is a 200-entry localStorage list, not Git; password-protected secret/display-name mutation history; Deploy app history panel parity
`exports` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/exporter.ts (CSV, JSON, Markdown, HTML), world .zip/.mcworld, .nbt, settings JSON, tests/exporter.test.ts | MISSING: export of notifications, changelog, notes, tabs; loss statement before export; stated encoding/line endings/schema version; re-import for history exports; 7z with encrypted headers
`bulk-actions` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: tabsearch.ts close-by-text with preview, main.ts "Switch off all shown" extensions, Dismiss all | MISSING: multi-select (click, shift-click, keyboard), select-all scope, inverse selection in worlds, history, activity, notifications, extensions, instances; skipped-item report; bulk delete/export
`changelog` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: scripts/build.mjs (commit log into build-info.json), server.ts `/api/changelog`, main.ts `aboutView` | MISSING: grouping by released version; clickable validated commit links; calendar date filter with typed dates; export/copy of the filtered view; Deploy app; site changelog is only a link to GitHub commits
`offline-docs` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: none in src/ (articles exist only in site/content.mjs; the PDF is built for the site) | MISSING: bundled in-app documentation browser, in-app link resolution, its regex search, completeness test
`rendered-provider-text` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: release notes are an external link (updater.ts `notes`); changelog shows plain commit subjects | MISSING: shared isolated Markdown renderer, emoji map, base for relative links, empty "no notes" state
`notifications` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts `notify`, `toggleNoteCentre` (search with regex builder, Dismiss all), errors persist until closed | MISSING: bulk select/dismiss by selection; notification list is lost on reload; Deploy app has its own toast without a centre; site has none
`dockview-workspace` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/workspace.ts, package.json `dockview-core` 8.9.1 (public npm package), saved layouts, Reset panel layouts, phone single group; drag between groups checked in headless Chrome | MISSING: the maintainer's own dockview build with the tab features built in once; a check that fails on a hand-rolled splitter; the documentation site has no dockview workspace
`rich-text-editor` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/notes.ts, scripts/build.mjs (self-hosted TinyMCE 8.10.2, GPL key) | MISSING: server-side sanitising of saved HTML (server.ts `/api/notes` PUT writes the body as received); test that fails on a contenteditable editor or another library

## Built-in tools and hand-off

`file-converter` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/tools.ts (PNG/JPEG/WebP, NBT to JSON), tests/tools.test.ts | MISSING: byte-inspection type detection; searchable adapter catalogue with Documents/PDF, Audio, Video, Archives, Data, Code, Binary categories and disabled rows naming the missing dependency; PDF tools; queue with pause/resume/cancel; site and Deploy app
`base64-tools` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/tools.ts `toBase64`/`fromBase64`, file encode up to 20 MiB | MISSING: URL-safe and MIME output, padding/line-length options; strict mode with error offsets; text-encoding choice; data: URL build/parse; streaming with progress and SHA-256 check; file drop round trip (`name.ext.base64.txt`); decode to file with preview; history/undo; site
`quicktype-studio` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/tools.ts `jsonToTypeScript` | MISSING: JSON Schema/TypeScript/GraphQL input; every other target language and engine options; live generation with highlighted output and inferred-types inspector; the GUI JSON editor (Tree/Code/Split/Table, JSONPath, schema validation, undo history); site copy
`virtual-disk-manager` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/deploy/targets.ts + src/deploy/ui.ts Virtual disks view (list, create .vhd/.vhdx, attach, detach via diskpart), tests/deploy.test.ts | MISSING: not in the editor app; grow, shrink, compact, convert, differencing chains/merge, VHD Set, ISO attach, Dev Drive, native boot; route name and equivalent script; Quick pack; site article; never run on real Windows
`minecraft-server-manager` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/tools.ts server.properties editor (12 common fields) | MISSING: server creation, flavour/plugin install and management; the four targets (local process, local Docker, SSH process, SSH Docker); Java/Bedrock version discovery and compatibility matrix; typed per-version config; start/stop/recovery
`minecraft-world-generator` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: only a flat-world creator exists (src/core/archive.ts `createFlatWorld`), unrelated to server-driven generation | MISSING: generator in a server tab; per-version jar option extraction; 100 x 100 chunk default with drawing canvas; Folder/ZIP output with Browse; in-app EULA acceptance; batched pre-generation
`ollama-suite` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: server.ts `/api/ollama/models`, `/api/ollama/ask`; tools.ts Local AI helper | MISSING: one-click managed Ollama install and missing-runtime recovery (error text says to install it yourself); Model Store with full catalogue and tags; hardware-fit verdicts; batch pull cart; chat sessions with attachments; guided troubleshooter; profile launch with rollback; site
`external-editor` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: none (no editor detection or VS Code hand-off in src/) | MISSING: editor detection and choice, persisted choice, open world folder/file, open any export in VS Code, no-editor message
`download-handoff` | APPLIES: no | STATUS: N-A | EVIDENCE: no browser-extension download capture in this product | MISSING: -
`forge-publishing` | APPLIES: no | STATUS: N-A | EVIDENCE: the app does not publish repositories | MISSING: -
`progress-recovery` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/worlds.ts upload progress, src/ui/takeover.ts failure card with retry and Copy details, Deploy app "Try port N+1" | MISSING: progress inside the starting dialog for new world, structure place, extension install; submit disabling/re-entry guard on every dialog; optional slow phases as explicit choices; re-authentication offer on a refused credential
`drawesome-drawing` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: none | MISSING: drawing/annotation board with seven pens, partial eraser, Shift-lock, morphing toolbar, shortcuts, undo/redo, SVG and PNG export, persistence

## Completeness and evidence

`completeness-parity` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: none (ROADMAP.md is a phase checklist, not a per-surface inventory) | MISSING: hand-written per-surface completeness inventory with links per feature; its remove-one-item test
`front-provenance` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: main.ts `provenance()` in the header before sign-in; scripts/build.mjs build-info.json; site footer version, time and commit | MISSING: Deploy app front screen shows no bound version/updated-at; site timestamp is in the footer in UTC rather than local time with seconds on the first screen; removal test
`product-evidence` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: docs/screenshots/ (17 PNG + walkthrough.gif), README, site articles | MISSING: screenshots of every destination, dialogs, empty/error states, narrow layout and both themes; collapsible grouping in README; per-capture provenance (commit, viewport, scale, theme, method); Mermaid workflow diagrams in README; evidence inventory and stale-image test
`screen-recording` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: docs/screenshots/walkthrough.gif shown in README | MISSING: stated source commit and capture method; recording for the Deploy app
`design-reference-parity` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: design/canvas/*.dc.html exists but nothing renders or compares it | MISSING: design-reference app, matching routes in the built app, per-screen inventory, side-by-side captures, diff evidence, parity test
`design-folder` | APPLIES: yes | STATUS: BUILT | EVIDENCE: design/canvas/ (16 boards + canvas.json) tracked in Git; no private terms found by grep | MISSING: -
`cheap-jor-matrix` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: HANDOFF.md and ROADMAP.md describe a 40-combination sweep (1440/390 px, light/dark, languages) | MISSING: receipts and screenshots in the repository; 125/150/200% scales; minimum viewport; binding to commit and build hash; re-run after the Tools tab; site matrix
`public-huishot-gallery` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: no gallery link in README | MISSING: public screenshot gallery repository and site, reviewed images, link from README

## Documentation site and shared links

`landing-site` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: site/build.mjs, site/content.mjs, site/site.css, .github/workflows/pages.yml; fonts bundled; "not the editor" footer line | MISSING: site equivalents of the catalogue features (language modes, settings, palette, tabs, search, appearance, etc.); hand-written feature enumeration that fails the build; per-visitor storage reset line
`deen-wah-site` | APPLIES: yes | STATUS: BUILT | EVIDENCE: site/build.mjs viewport meta, site/site.css media queries; ROADMAP records a 320 px check with no sideways scroll | MISSING: -
`installer-download-button` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: site/build.mjs Downloads page uses release asset URLs from releases.json and hides buttons when absent | MISSING: the direct download button on the Home page with version and platform (Home has only "Get Map Editor" linking to /downloads/)
`feature-articles` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: site/content.mjs (13 articles, each with suggested articles) | MISSING: one article per feature (several features share an article); Cantonese and bilingual versions; sections on failure modes, security and verification in each
`vendored-fonts` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: scripts/build.mjs `FONT_FILES`, site/build.mjs (Roboto Flex/Mono from @fontsource packages, licences copied) | MISSING: committed fetch script against the canonical source; SHA-256 manifest; full unicode-range set (only Latin and Latin Extended); `document.fonts.check` verification
`shared-link-embed` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: site/build.mjs emits og:title, og:description, og:type | MISSING: social-preview.png at the repository root and served copy; og:image with width/height/alt, og:url, og:site_name, twitter:card, theme-color
`homepage-link` | APPLIES: yes | STATUS: BUILT | EVIDENCE: GitHub API homepage = https://ding-ding-projects.github.io/map-editor/; README line 3; `SITE_BASE` in site/build.mjs and pages.yml | MISSING: -
`vocabulary-unlock-boundary` | APPLIES: yes | STATUS: BUILT | EVIDENCE: grep of tracked files finds no private vocabulary; personal-vocabulary upload is the only route | MISSING: -
`private-day-teet-hui-app` | APPLIES: no | STATUS: N-A | EVIDENCE: repository is public and hosts its site | MISSING: -
`day-teet-hui-pdf-edition` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: site/build.mjs `/phone/` page (90 x 160 mm), pages.yml prints map-editor-guide-phone.pdf, linked from Downloads | MISSING: PDF attached to every GitHub release (release.yml does not build or attach it); wiki content in the PDF

## Status Hub

`status-hub` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: none in the repository | MISSING: Hub registration of the repository, branch, release channel and verdicts; in-app status surface; inventory row
`discord-status-bridge` | APPLIES: no | STATUS: N-A | EVIDENCE: applies to the Status Hub only | MISSING: -
`panic-webhooks` | APPLIES: no | STATUS: N-A | EVIDENCE: applies to the Status Hub only | MISSING: -
`tidbyt-displays` | APPLIES: no | STATUS: N-A | EVIDENCE: applies to the Status Hub only (and suspended) | MISSING: -

## Build and install

`build-entrypoints` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: build.bat, build-installer.bat (prints SHA-256), build.sh | MISSING: `SILENT=1` environment switch; per-phase reporting; CI calling these entrypoints (release.yml runs the node scripts directly); dedicated build GUI app and its portable .exe release asset; user-scope installs (uses Chocolatey with admin)
`fresh-build-run-command` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: README `.\build.bat --run`; build.bat `--run` | MISSING: shared committed build manifest with pinned digests; launch bound to a receipt for the current commit; staged/journaled dependency activation; inventory and removal tests
`interactive-setup` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: scripts/setup.mjs (prompts with defaults, validation, back, review, `--yes` flags, keeps .env values, prints link), host.bat | MISSING: full-screen TUI (only line prompts); the same for the desktop/appliance paths; tests for the prompt paths
`dependency-fetcher` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: download-dependencies.bat, scripts/download-dependencies.ps1, download-dependencies.sh | MISSING: pinned exact versions and recorded digests in a committed manifest; user-scoped install (Chocolatey needs admin); the .sh only reports and fetches nothing; per-phase reporting
`bundled-dependencies` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: scripts/build.mjs bundles server, UI, fonts, TinyMCE into the Electron package | MISSING: Ollama is "install it from ollama.com" (server.ts line ~216); Deploy app needs separately installed Docker, VirtualBox, VMware/OVF Tool with no automatic acquisition; bundled-vs-found report and size floor
`squirrel-installer` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: scripts/package-desktop.mjs (electron-winstaller, noMsi), src/desktop/squirrel.ts, release.yml NotSigned check and unsigned note | MISSING: delta packages (no `remoteReleases` passed, so none are generated)
`self-signing` | APPLIES: yes | STATUS: BUILT | EVIDENCE: nothing is signed; release.yml asserts NotSigned; no key material in the repository | MISSING: -
`auto-updates` | APPLIES: yes | STATUS: BUILT | EVIDENCE: src/desktop/updater.ts (start + 4 h, https feed), main.ts `updateBanner` (version, notes link, unsigned note, Restart, Later, busy guard), About "Check for updates", scripts/update-feed.mjs, verify.yml Windows update check | MISSING: -
`app-icon` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: src/ui/favicon.svg, site/favicon.svg | MISSING: multi-resolution .ico generated from a committed master; `icon` passed to packager and `setupIcon`/`iconUrl` to the installer (scripts/package-desktop.mjs passes none, so the Electron default is used)

## Release pipeline

`release-workflow` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: .github/workflows/release.yml (push + dispatch, unique v<major.minor.run> tag, non-draft release with installers) | MISSING: the `test` job gates `docker` and `desktop` through `needs:` (the rule is no test or lint gate); `ORG_TOKEN` in the token chain; release notes stating which local checks ran
`release-timing` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: release.yml writes Workflow started/completed/duration | MISSING: duration as HH:mm:ss (it prints seconds); start taken from the first job's recorded startedAt (it uses a step clock)
`release-line-counts` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: release.yml inline loop over file extensions | MISSING: committed counter script with the command recorded; source/tests/styles split; total and non-blank lines; stated exclusions and generated files; git-blame attribution; totals; README copy naming its release
`release-dim-sum-photo` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: no photos tracked or attached to releases | MISSING: release notes referencing a catalogue dish and photo link, or the explicit "version only" statement when none resolves
`dim-sum-code-names` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: none | MISSING: code name per release from the public catalogue; recorded release-to-dish mapping; display in release notes, changelog, site and About
`ci-bootstrap` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: none (no dependency inventory beside the workflows; artifact uploads are not under `if: always()`) | MISSING: per-job dependency inventory and check-before-install; hand-written job list test; safe-output uploads with `if: always()`, `continue-on-error`, `if-no-files-found: warn`
`runner-selection` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: release.yml/verify.yml/pages.yml use GitHub-hosted runners; no pull_request triggers | MISSING: pinned images (uses `ubuntu-latest`, `windows-latest`); recorded runner inventory check before dispatch
`encrypted-public-builder` | APPLIES: no | STATUS: N-A | EVIDENCE: repository is public | MISSING: -

## Repository records and README

`tabbed-readme` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: README.md (intro, site link, quick start, `<details>` sections), LICENSE | MISSING: CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md; short contents index
`human-time-estimate` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: none in README | MISSING: labelled estimate with method, line count, rate, multiplier and arithmetic beside the line counts
`sanitized-instruction-copy` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: AGENTS.md has only the vocabulary block and three working notes | MISSING: labelled sanitized mirror of the shared instructions in README.md and AGENTS.md and a check that fails when it drifts
`agents-md-vocabulary-block` | APPLIES: yes | STATUS: BUILT | EVIDENCE: AGENTS.md `## Agent conversation vocabulary` (text matches the canonical wording; byte-exactness not machine-checked) | MISSING: -
`vocabulary-hash-lock` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: none | MISSING: scripts/check-vocabulary.mjs wired into build.bat and a pre-push hook through core.hooksPath
`roadmap-checklist` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: ROADMAP.md with `- [ ]`/`- [x]` by phase | MISSING: several ticked items say "not run", "not yet run on Windows" or "not verified yet", which breaks the tick-only-when-verified rule; no deliberately-not-doing section
`feature-docs` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: docs/ holds only screenshots | MISSING: categorized documentation folder with README index and one Markdown file per feature
`postman-collections` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: server.ts exposes about 50 `/api/*` routes; no collection file | MISSING: category collections and a master Postman collection JSON
`wiki-day-teet-hui-sync` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: site source updated with features; wiki is enabled on GitHub | MISSING: wiki content could not be confirmed (anonymous read refused); wiki content inside the site
`handoff-record` | APPLIES: yes | STATUS: PARTIAL | EVIDENCE: HANDOFF.md (built, checks run, checks left, leftovers) | MISSING: the matching handoff section on a GitHub issue (not found in repository records); HANDOFF.md does not yet cover the uncommitted changes
`closeout-prompt` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: no CLOSEOUT_PROMPT.md | MISSING: CLOSEOUT_PROMPT.md at the root, committed and pushed
`discussion-records` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: GitHub API `has_discussions: false` | MISSING: Discussions enabled; rolling progress discussion; one changelog announcement per release
`project-board` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: Projects are enabled, but no linked project is recorded anywhere in the repository | MISSING: linked GitHub Project with task items (not verifiable from this session)
`operational-skill` | APPLIES: yes | STATUS: UNBUILT | EVIDENCE: none in the repository | MISSING: repository-specific operational skill (build, packaging, UI drive, evidence, release, recovery routes)

## Deliverables of the instruction repository itself

`readme-prompt-banner` | APPLIES: no | STATUS: N-A | EVIDENCE: applies to the instruction repository only | MISSING: -
`uh-single-file-editions` | APPLIES: no | STATUS: N-A | EVIDENCE: applies to the instruction repository only | MISSING: -
`project-profile` | APPLIES: no | STATUS: N-A | EVIDENCE: applies to the instruction repository only | MISSING: -

## Games

`roblox-model-catalogue` | APPLIES: no | STATUS: N-A | EVIDENCE: not a game | MISSING: -
`roblox-visual-realism` | APPLIES: no | STATUS: N-A | EVIDENCE: not a game | MISSING: -

