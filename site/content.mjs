// Content for the documentation site. Each feature has one article.
export const features = [
  { slug: 'desktop-app', title: 'Desktop app', group: 'Ways to run it', summary: 'A Windows app that opens worlds straight from your .minecraft saves folder.',
    body: [
      ['What it does', 'The desktop app runs the same editor as the web app, inside its own window. It starts a private server on your computer that only that window can reach, so nothing is exposed to your network.'],
      ['Install', 'Download Setup.exe from the latest release and run it. The installer is not code-signed, so Windows SmartScreen may show a warning first; choose More info, then Run anyway. Updates arrive through the same release feed.'],
      ['Build it yourself', 'On Windows run build.bat --run from the repository. It installs Node.js and Git through Chocolatey if they are missing (one admin prompt), builds everything and starts the app.'],
      ['When something goes wrong', 'If the window stays blank, another copy may already be running: Map Editor allows one copy at a time. If a world does not appear, check that it is a Java Edition 1.18 or newer world with a level.dat file.'],
    ], related: ['web-app', 'edit-history', 'deploy-app'] },
  { slug: 'web-app', title: 'Docker web app', group: 'Ways to run it', summary: 'Run Map Editor on one machine and use it from any browser on your network.',
    body: [
      ['What it does', 'The web app is the same editor served by a small Node.js server in a Docker container. Your worlds folder is mounted into the container; edits are written straight into those worlds.'],
      ['Start it', 'Run node scripts/setup.mjs (or host.bat on Windows). It asks for a port and your worlds folder, writes .env, starts docker compose, waits for the health check and prints the link to open. host.bat --detached runs it in the background and host.bat --logs follows the live log.'],
      ['First visitor becomes the owner', 'There is no setup code. The first person to open the link and register becomes the owner. Two people registering at the same moment cannot both win: the server decides with one atomic file create, and the second gets a clear message to sign in instead.'],
      ['Security', 'Every API call needs a signed-in session. The server only opens worlds inside the folders it was started with, refuses cross-site form posts, and sends a strict content security policy.'],
    ], related: ['appliance', 'deploy-app', 'desktop-app'] },
  { slug: 'appliance', title: 'Appliance image', group: 'Ways to run it', summary: 'A small Linux image that boots straight into the web app, for a VM or a spare PC.',
    body: [
      ['What it is', 'An Alpine Linux image with Docker and the Map Editor image already inside. On boot it starts the web app and prints the address on the console, along with the note that the first person to open it becomes the owner.'],
      ['Use it', 'Import map-editor-appliance-x86_64.ova into VirtualBox or VMware with a bridged network adapter, or write map-editor-appliance-x86_64.img to a USB drive and boot a spare PC from it. Map Editor Deploy does both for you.'],
      ['How it is checked', 'Every build boots the image under QEMU and waits for the web app to answer its health check before the image is published.'],
      ['Not yet available', 'A Raspberry Pi image, a separate data partition and in-place updates are on the roadmap.'],
    ], related: ['deploy-app', 'web-app', 'roadmap'] },
  { slug: 'deploy-app', title: 'Map Editor Deploy', group: 'Ways to run it', summary: 'One click to put Map Editor on Docker, VirtualBox or a USB drive, then the working link.',
    body: [
      ['Targets', 'Docker on this computer pulls the published image, starts it with Compose and waits for the health check. VirtualBox imports the appliance with a bridged adapter, starts it headless and reads its network address. USB drive writes the appliance image to a removable drive.'],
      ['Flashing safely', 'Only removable drives are listed, the drive running your system is never offered, and nothing is selected for you. You type a confirmation that names the drive. After writing, the drive is read back and its SHA-256 compared with the image before success is shown.'],
      ['Instances', 'The Instances view lists only what this app created, with the verified link for each.'],
      ['Not yet available', 'VMware, Raspberry Pi flashing and Docker over SSH are shown as unavailable and are on the roadmap.'],
    ], related: ['appliance', 'web-app', 'desktop-app'] },
  { slug: 'editing', title: 'Editing worlds', group: 'Using the editor', summary: 'Top-down map, selections, and the fill, replace, delete, clone and waterlog tools.',
    body: [
      ['The map', 'The Map panel shows each column from above, shaded by height. Drag to pan, scroll to zoom, and hold Shift while dragging to draw a selection. The coordinates under the pointer are shown in the corner.'],
      ['Tools', 'Fill sets every block in the selection. Replace swaps one block for another. Delete blocks sets air. Clone copies the selection to a destination corner and is safe when source and destination overlap. Waterlog sets waterlogged on blocks that support it.'],
      ['Limits', 'One operation can change up to 16,777,216 blocks so a typo cannot hang the editor. Blocks in chunks that do not exist yet are skipped and reported, never invented.'],
      ['Workspace', 'The editor is a dockview workspace: drag a panel tab to dock it beside another, tab panels together or float one. The layout is remembered in your browser.'],
    ], related: ['edit-history', 'notes', 'appearance'] },
  { slug: 'edit-history', title: 'Edit history', group: 'Using the editor', summary: 'Every edit is saved to a private Git history so it can always be undone.',
    body: [
      ['How it works', 'After each operation the changed region files are saved and committed to a Git repository kept in the app data folder. The repository is never created inside your world folder, and a world that already has its own .git is left alone.'],
      ['Rolling back', 'Choose Roll back here on any entry. The world files are restored from that point and the restore is recorded as a new entry, so you can undo a rollback too. Nothing in the history is ever rewritten.'],
      ['Filtering', 'Action chips show how many entries of each kind exist and filter the list.'],
    ], related: ['editing', 'notes', 'roadmap'] },
  { slug: 'notes', title: 'World notes', group: 'Using the editor', summary: 'Rich text notes for each world, saved automatically.',
    body: [
      ['What it does', 'The Notes panel is a rich text editor (TinyMCE) for plans and coordinates. Notes belong to the open world and save about a second after you stop typing.'],
      ['Where they are kept', 'In the app data folder next to the world history, never inside the world itself.'],
    ], related: ['editing', 'edit-history', 'languages'] },
  { slug: 'appearance', title: 'Theme colours and the colour picker', group: 'Settings', summary: 'Pick any colour and the whole Material 3 theme follows it.',
    body: [
      ['Theme colour', 'Settings, Theme colour regenerates every Material 3 colour role from the colour you pick, in light and dark. Reset returns to the default green.'],
      ['The colour picker', 'Drag in the field or use the arrow keys, set hue and opacity, or type any colour: a CSS name, HEX, HEX8, rgb(), hsl(), hsv(), hwb(), lab(), lch(), oklab(), oklch() or cmyk(). Every format is shown with a copy button. Colours outside what screens can show are clipped and the picker says so. The contrast against the background is shown with the WCAG threshold it passes.'],
      ['Animated rainbow', 'The rainbow is a separate choice, not a colour value. Its speed is one global level. With reduced motion it stays on one hue.'],
    ], related: ['languages', 'editing', 'roadmap'] },
  { slug: 'languages', title: 'Languages and tone', group: 'Settings', summary: 'English, Hong Kong Cantonese or both, with separate funny-level sliders.',
    body: [
      ['Languages', 'Choose English, 粵語, or EN + 粵 to show both together. The choice is saved in your browser.'],
      ['Funny levels', 'English and Cantonese each have a funny level from 1 to 5. It changes the wording of messages only; numbers, facts and warnings are identical at every level.'],
    ], related: ['appearance', 'editing', 'web-app'] },
  { slug: 'roadmap', title: 'What is next', group: 'Project', summary: 'What is verified, what is built but unverified, and what is still to do.',
    body: [
      ['Where to look', 'ROADMAP.md in the repository is the honest checklist. An item is ticked only after its built artifact was run and checked.'],
      ['Licence', 'Map Editor is based on Amulet Map Editor, which is proprietary software of the Amulet Team. Using Map Editor requires your own Amulet licence from amuletmc.com.'],
    ], related: ['desktop-app', 'web-app', 'appliance'] },
];
