# CloakClip — development record and handoff

Written 2026-08-10, amended 2026-09-01. This is the context a new session needs
to pick the work up, since conversation history does not travel between
folders. It used to double as the changelog. That job now belongs to the GitHub
releases, where the notes sit beside the binaries they describe.

**This file is not published.** The site's workflow excludes it by name,
because of the local paths, the CI secret and the unfinished work below. Keep
it that way, and put anything a customer should read in the release notes
instead.

---

## What CloakClip is

A Windows/macOS desktop app that encrypts ("cloaks") and decrypts
("uncloaks") text with a shared password, so a private message can travel
through any chat, email or note as an ordinary line of characters. It
replaced a pair of personal PowerShell scripts and stays wire-compatible
with them.

The genuinely hard part is not the encryption — it is stopping a *decrypted*
secret from outliving its use in the Windows clipboard history.

## Where everything lives

| Thing | Location |
|---|---|
| App source | `W:\projects\26cloakClip` → [github.com/Charette-AI-Group/cloakClip](https://github.com/Charette-AI-Group/cloakClip) (public) |
| App site + manual | `docs/` in that repo → https://charette-ai-group.github.io/cloakClip/ |
| Portfolio page | `cloakClip.html` in this repo → https://charette-ai-group.github.io/web/cloakClip.html |
| Release notes | The [GitHub releases](https://github.com/Charette-AI-Group/cloakClip/releases) — written as the annotated tag's message when a version ships, so the notes and the binaries arrive together. There is no separate changelog page any more |
| Release binaries | [v1.0.0](https://github.com/Charette-AI-Group/cloakClip/releases/latest) — `CloakClip.exe`, `CloakClip-macos.zip` |
| Built from | `W:\projects\qtAppTemplate` (PySide6 template) |

## Current state — v1.0.0

Released 2026-08-06. 123 tests, ruff clean, both platforms built and
published by CI.

**Windows is fully supported. macOS builds and runs**, but its clipboard
protections are not implemented — the app reports them as unavailable rather
than pretending. The port is scoped in the repo's `AGENTS.md`.

---

## What was built, and why

### The app

- **Crypto** (`services/cryptoService.py`) — AES-256-CBC, key = SHA-256 of
  the password, random 16-byte IV prepended, Base64. Verified in both
  directions against the original PowerShell scripts; that test vector is
  now a permanent regression test.
- **Clipboard tab** — one-click cloak/uncloak straight on the clipboard.
  The box is editable, so a message can be uncloaked, reworded and
  re-cloaked without the plain text leaving the app.
- **Manual tab** — plain and cloaked fields that stay in sync live, with no
  Cloak/Uncloak buttons. Reading a message here never touches the clipboard.
- **Password menu** — last ten passwords, shown masked (`h…!`), stored
  DPAPI-encrypted in `%APPDATA%\CloakClip\`. Remembered only after a
  password actually works, so typos are never kept.
- **Theme** (system/light/dark), remembered **window position**, generated
  **icon**, single-file **executable**.

### Keeping secrets out of Windows clipboard history

This is the app's distinguishing feature and took several passes:

1. Decrypted text written to the clipboard carries the registered Windows
   formats password managers use, so Windows keeps it out of Win+V and cloud
   sync while it still pastes normally.
2. Text the user *cloaks* is tracked too — whatever app they copied it from
   already recorded it before CloakClip ever saw it.
3. A re-copy made by hand is detected, re-protected, and the recorded entry
   deleted from history.
4. Closing clears a copied secret and sweeps the session's secrets from
   history. **Clear All!** (close dialog, or `Ctrl+Shift+Q`) empties
   everything as a deliberate second line of defence.

Honest limits, stated in the app and on the site: matching only recognises
exact text from the current session, and nothing can reach a secret already
pasted somewhere else.

### Infrastructure

- **CI** (`.github/workflows/build.yml`) — tests and lints, builds Windows
  `.exe` and macOS `.app` from the committed `cloakClip.spec`, runs
  `--selftest` on each build before upload, and attaches both to a Release
  on `v*` tags.
- **Traffic recorder** (`.github/workflows/traffic.yml`) — weekly snapshot of
  clone/view stats into `traffic/traffic.csv`, because GitHub discards
  anything older than 14 days.
- **Generated assets** — `tools/makeIcon.py`, `tools/makeDemoGifs.py`,
  `tools/makeSiteImages.py` all render from the live app, so documentation
  cannot drift from the real UI.

---

## Decisions worth remembering

- **Platform split.** Clipboard protections live behind
  `services/platform/` backends. The base class is a working no-op, so an
  unsupported platform degrades quietly and *reports* it. Adding macOS means
  adding a module and one branch — nothing above that layer changes.
- **`--selftest`.** The bundled icon and the winrt bindings both fail
  *silently* if packaging drops them. The flag reports what a build actually
  has, and CI gates on it. Without it a build can look fine and have no
  clipboard-history support at all.
- **Never fake a protection.** Where a platform cannot do something, the
  code returns false and the UI says so.
- **Tests must not touch real user state.** Autouse fixtures isolate the
  settings file, the password history, the Win+V history, the forced colour
  scheme, and both modal dialogs. Without them a test run wipes the
  developer's actual clipboard history or hangs on a dialog.

## Gotchas found the hard way

Each of these looked correct in code and was wrong in reality:

- **Secret marking and history purging** were only proven by control/treatment
  probes against the live Windows API. Write throwaway probes and read the
  output; do not trust that the code looks right.
- **Palette timing.** Styling rebuilt inside a theme-change handler uses the
  *old* palette — Qt delivers the new one afterwards. This left a tab label
  white-on-white. Rebuild from `changeEvent` on `PaletteChange`.
- **`minimumTabSizeHint`.** Qt's default calls the overridden `tabSizeHint`,
  so a stretched width silently became the *minimum* width and the window
  grew without bound on macOS.
- **PowerShell does not wait for GUI-subsystem executables.** A CI step read
  the selftest report before the app had written it. Use `Start-Process -Wait`.
- **A GitHub Pages run stuck in `queued` for two days.** Cancelling it and
  requesting a fresh build fixed it instantly. A monitor that only watches
  for *failure* will sit silent through this — treat "no state change" as a
  failure signal too.
- **The default `GITHUB_TOKEN` cannot read the traffic API** (403,
  "Resource not accessible by integration"). A PAT with repository
  Administration:read is required, stored as the `TRAFFIC_TOKEN` secret.

## Outstanding

- **macOS port** — add `services/platform/macClipboard.py` (the lead is the
  `org.nspasteboard.ConcealedType` convention via PyObjC) and a
  Keychain-backed password store. Fully scoped in the repo's `AGENTS.md`,
  including the Universal Clipboard exposure that has no Windows equivalent.
- Two failed **build** workflow runs from the GitHub outage remain in the
  history and could be deleted.
- The `github-pages` environment has a protection rule. It was not the cause
  of the stuck deployment, but worth a look if deploys ever hang again.

## Conventions for future apps

- Scaffold from `W:\projects\qtAppTemplate` via `createNewApp.py`. Folder
  names are camelCase with a two-digit year prefix (`26cloakClip`).
- Qt organization is **Charette-AI-Group**. No Cursor-specific files.
- The template already ships a **Help > Theme** menu and a
  `FullWidthTabWidget`, both promoted from CloakClip.
- After changing the template, verify by scaffolding a throwaway app into a
  temp folder and running *its* tests — the template's own suite cannot catch
  rename breakage.
