# New Machine Handoff: Kubuntu, Plasma, Wayland

Last verified on the source machine: 2026-07-27

This document is a context handoff for an agent setting up this repository on a
fresh Kubuntu machine using Plasma and Wayland. Read `AGENTS.md` first. Treat
the live repository, current upstream DMG, and generated build reports as the
authority when they differ from this dated snapshot.

## Goal

Install the Linux wrapper from Matt's fork, preserve the local Linux behavior
that is still wanted, merge newer upstream wrapper changes deliberately, and
produce an accepted native package from the latest upstream macOS DMG.

Do not:

- switch the desktop session to X11 as a workaround;
- build from the official repository and then try to copy patches by hand;
- commit `linux-features/features.json`, generated apps, packages, DMGs, logs,
  updater state, or device keys;
- package a stale `codex-app/` and call it an update;
- resurrect the removed Voice speed experiment;
- discard fork commits with a force-push, reset, or clean checkout.

## Repository Identity

Use these remotes:

```text
origin   https://github.com/uNople/codex-desktop-linux.git
upstream https://github.com/ilysenko/codex-desktop-linux.git
```

Snapshot after fetching both remotes on 2026-07-27, before adding this handoff
commit:

```text
fork branch:       main
fork HEAD:         e5daf679dedab7e903217875c691b9223cdfb936
upstream HEAD:     c6d7623
fork divergence:  12 upstream commits behind, 6 fork commits ahead
```

This divergence is only a snapshot. Recalculate it before doing anything:

```bash
git fetch --all --prune
git status --short --branch
git rev-list --left-right --count upstream/main...main
git log --oneline --decorate --graph --max-count=30 --all
```

The fork commits visible in this snapshot are:

| Commit | Current meaning |
| --- | --- |
| `d92ddd7` | Documents and ignores transactional candidate artifacts. |
| `02f9b2e` | Keeps GPU compositing enabled by default on Plasma/Wayland. |
| `7892e86` | Refreshes ready updater packages when the upstream DMG changes before installation. |
| `3dca333` | Added the failed Realtime Voice speed experiment. Historical only. |
| `9e5912d` | Tried a second unsupported Voice payload shape. Historical only. |
| `e5daf67` | Removed the Voice slider, prompt, payload mutation, tests, and local feature. This is the desired net state. |

The last three commits cancel the Voice experiment. Preserve their history when
merging, but do not cherry-pick only the two additions.

## Sync The Fork

Clone the fork, then add the official repository:

```bash
git clone https://github.com/uNople/codex-desktop-linux.git
cd codex-desktop-linux
git remote add upstream https://github.com/ilysenko/codex-desktop-linux.git
git fetch --all --prune
git switch main
git pull --ff-only origin main
```

Merge current upstream into the fork. Do not expect a fast-forward when both
sides have new commits:

```bash
git merge upstream/main
```

Resolve conflicts in source files, retain the intended fork behavior described
here, run the affected tests, rebuild from the current DMG, and push the merge
to `origin main`. Never force-push over the fork history.

`make update-native` only runs `git pull --ff-only` for the branch's configured
remote before rebuilding. It does not replace the explicit
`fetch upstream`/`merge upstream/main` step.

## Local Feature Selection

The source machine enables four optional Linux features through the gitignored
`linux-features/features.json`:

```json
{
  "enabled": [
    "codex-wrapper-updater",
    "open-target-discovery",
    "remote-mobile-control",
    "shallow-repository-watches"
  ]
}
```

Recreate this file on the new machine before the build. Keep
`linux-features/features.example.json` empty. Feature selection is local
machine state by design and only takes effect after a rebuild and reinstall.

### `codex-wrapper-updater`

Adds Linux-wrapper update controls separately from upstream DMG updates:

- Settings -> Linux desktop -> Check for ChatGPT Desktop for Linux updates
- Settings -> Linux desktop -> Ask which features to enable on update
- a top-right Update action when a valid wrapper candidate exists

The runtime update toggle is off by default even when the feature is built. Its
state is stored in `~/.config/codex-desktop/settings.json`. A fork ahead of the
tracked remote shows an amber non-clickable development state instead of
offering a downgrade.

### `open-target-discovery`

Restores the Linux open-target choices that matter on this machine:

- Terminal
- VS Code and other discovered editors/IDEs
- Dolphin or another installed file manager

It uses command discovery and XDG, Flatpak, Snap, JetBrains Toolbox, and desktop
entries. If "Open in VS Code" or "Open in Terminal" disappears after migration,
first verify this feature is selected in the local JSON and present in the
installed patch report. Rebuilding is required after selecting it.

### `remote-mobile-control`

This is experimental Linux adaptation, not official Linux Remote support.
OpenAI documents Remote hosts for macOS and Windows and can still reject or
withhold Linux enrollment server-side.

Important boundaries:

- the interactive Codex CLI and Remote daemon are separate runtimes;
- the fallback managed daemon is
  `~/.codex/packages/standalone/current/codex`;
- the launcher cold-start hook provisions and starts that runtime best-effort;
- host control, outbound control, and Remote SSH are separate paths;
- private device keys live under
  `~/.config/codex-desktop/remote-control-device-keys/`.

Do not copy private device keys to the new machine or commit them. Re-enroll the
new installation. KWallet or another Electron `safeStorage` backend is
preferred; `file_0600` is only a compatibility fallback.

Remote mobile sessions can be less reliable than a direct terminal SSH session
because they depend on an experimental patched Desktop flow, account rollout,
the managed daemon, network convergence, and mobile conversation
reconciliation. Diagnose those layers separately rather than treating Remote
SSH and mobile control as the same connection.

After installation, inspect the launcher log and verify the Computer Use
backend:

```bash
tail -n 200 ~/.cache/codex-desktop/launcher.log
/opt/codex-desktop/resources/plugins/openai-bundled/plugins/computer-use/bin/codex-computer-use-linux doctor
/opt/codex-desktop/resources/plugins/openai-bundled/plugins/computer-use/bin/codex-computer-use-linux windows
```

On Plasma/Wayland, the doctor should report the KWin window backend, XDG
Desktop Portal, and input checks as ready. The window listing should report
`"backend": "kwin"` and contain windows.

### `shallow-repository-watches`

Makes recursive `fs.watch` requests non-recursive on Linux. This avoids
synchronous deep-tree walks and large watch counts when task rows refer to big
repositories or many worktrees.

The tradeoff is that deep changes may refresh when Codex regains focus instead
of immediately. Do not enable `directory-only-working-tree-watch` at the same
time; the features conflict.

## Fresh Kubuntu Install

Run setup from a normal host terminal, not from a restricted Desktop agent
sandbox. The build needs network access, writable npm/cargo caches, device and
desktop-session visibility, and interactive privilege escalation.

After cloning, merging upstream, and recreating `features.json`:

```bash
CODEX_SUDO_ALERT=1 MAX_BUILD_THREADS=8 make bootstrap-native
```

`bootstrap-native` installs host dependencies, then calls `install-native`.
`install-native`:

1. downloads or refreshes the upstream DMG;
2. rebuilds `codex-app/` from a fresh candidate;
3. validates the candidate and enabled features;
4. builds the distro-native package;
5. installs the package.

If dependencies are already installed:

```bash
CODEX_SUDO_ALERT=1 MAX_BUILD_THREADS=8 make install-native
```

The guided alternative is:

```bash
make setup-native
```

The wizard can recreate the local feature file and inspect the distro, package
manager, portal, polkit, updater, and desktop environment.

Close a running ChatGPT Desktop before final promotion or package replacement.
If an install succeeds while an old Electron process remains open, restart the
app before judging the new JavaScript or feature set.

## Build And Promotion Rules

`make package` only packages the existing generated `codex-app/`. It does not
refresh the DMG or regenerate the app. This distinction caused previous
"updated package, old behavior" states.

Preferred full path:

```bash
MAX_BUILD_THREADS=8 make install-native
```

Explicit split path:

```bash
MAX_BUILD_THREADS=8 make build-app-fresh
MAX_BUILD_THREADS=8 make package
make install
```

All normal local builds use the shared upstream DMG acceptance profile:

- `accepted`: promote;
- `accepted_with_warnings`: promote with fail-soft core diagnostics;
- `rejected`: do not replace the working app;
- `inconclusive`: do not replace the working app.

Any drift in a locally enabled feature rejects the candidate. Fix the feature
against the latest upstream bundle, or explicitly decide to disable it and
rebuild. Do not silently drop an enabled feature to make the update green.

Promotion uses an atomic directory exchange and retains one previous managed
app backup. Rejected and incomplete candidates do not replace the working app.
Transaction evidence is written under `dist-next/rebuild/`.

## Verification Gate

Do not call the migration complete because the package command exited zero.
Verify source, generated app, installed package, enabled features, and runtime.

Installed package and source provenance:

```bash
dpkg-query -W -f='${Version}\n' codex-desktop
jq '{source, upstreamDmg, linuxTarget, linuxFeatures}' \
  /opt/codex-desktop/.codex-linux/build-info.json
```

The installed `source.commit` must equal the intended clean fork commit and
`source.dirty` must be `false`. The installed `linuxFeatures.enabled` array must
contain the four selected features.

Patch evidence:

```bash
jq '{enabledFeatures, featurePatches: [.patches[] |
  select(.sourceKind == "feature") |
  {name, status}]}' \
  /opt/codex-desktop/.codex-linux/patch-report.json
```

Every enabled feature's required descriptors must be `applied` or
`already-applied`. A missing feature means the local config was absent or the
package used stale generated output.

Updater and launcher:

```bash
systemctl --user status codex-update-manager.service
codex-update-manager status --json
codex-update-manager diagnose --json
tail -n 200 ~/.local/state/codex-update-manager/service.log
tail -n 200 ~/.cache/codex-desktop/launcher.log
```

Manual smoke checks:

1. Stay in the Plasma Wayland session.
2. Open ChatGPT Desktop and move, resize, minimize, and restore the window.
3. Click the composer and type normally.
4. Confirm paste and keyboard shortcuts.
5. Confirm Open in Terminal, Open in VS Code, and file-manager targets.
6. Start a normal task.
7. Check Remote mobile control separately if the account rollout is available.
8. Restart once after package installation and repeat the critical checks.

## Known Failure Patterns

### `install.sh failed during local rebuild`

Read the evidence before retrying:

```bash
codex-update-manager diagnose --json
sed -n '1,240p' ~/.local/state/codex-update-manager/state.json
tail -n 240 ~/.local/state/codex-update-manager/service.log
find dist-next/rebuild -maxdepth 3 -type f -print
```

Previously observed causes:

- a restricted agent sandbox exposed `~/.npm/_cacache` as read-only, producing
  `EROFS`; run the build from a normal host terminal;
- `make package` wrapped an old generated app because no fresh build ran first;
- the running Electron process blocked transactional promotion;
- an enabled optional feature drifted against the new upstream bundle;
- the package installed correctly but the still-running app kept old code in
  memory.

### App is clickable but the composer cannot type

Do not switch to X11 and do not patch the editor CSS first. The previously
diagnosed failure was an unmanaged Electron window created with explicit
undefined `BrowserWindow` options. Mouse events reached the window, but the
window manager never assigned keyboard focus.

The durable fix is
`applyDefinedBrowserWindowOptionsPatch()` in
`scripts/patches/impl/main-process/window.js`. See
`docs/wayland-input-focus-investigation.md`.

On XWayland, a broken window showed `Override Redirect State: yes`; a healthy
managed window has `Override Redirect State: no` plus normal WM state. On native
Wayland, use KWin window inspection and Computer Use diagnostics rather than
assuming the DOM editor is broken.

### Plasma UI consumes excessive CPU or feels sluggish

Commit `02f9b2e` keeps GPU compositing enabled by default on Plasma/Wayland.
Generic Wayland sessions retain the compatibility workaround. Only set:

```bash
CODEX_ELECTRON_DISABLE_GPU_COMPOSITING=1
```

when side-panel flicker or transparency is actually present. Do not make that
the default on Plasma.

### Open in VS Code or Terminal is missing

Verify:

1. `open-target-discovery` is in the gitignored local feature config;
2. a full rebuild occurred after selection;
3. the installed patch report contains the feature descriptors;
4. VS Code and the terminal have discoverable CLI or `.desktop` entries.

### Remote connects and disconnects

Treat this as an experimental Remote stack diagnosis, not as proof that SSH or
Wayland itself is bad. Check:

1. account/workspace rollout and mobile client support;
2. selected runtime owner in the launcher log;
3. managed standalone daemon availability;
4. portal and KWin backend readiness;
5. device-key storage backend and safe permissions;
6. local app-server status reconciliation;
7. direct network stability.

For reliable machine administration, direct terminal SSH remains the simpler
control plane.

### Updater does not show a pending wrapper update

The wrapper feature must be built, and its runtime Settings toggle must be on.
The updater also checks commit ancestry. A fork ahead of the tracked branch is
development mode, not an update candidate. Inspect:

```bash
codex-update-manager check-wrapper --json
jq '{installed_wrapper_commit, candidate_wrapper_commit, wrapper_changelog}' \
  ~/.local/state/codex-update-manager/state.json
```

### Voice speed

Do not reimplement the removed Voice slider or prompt.

OpenAI's public Realtime API documents a playback speed field, but Codex
Desktop does not talk to that public session schema directly. Its internal
Voice backend rejected both attempted payloads:

```text
Unknown parameter: 'session.speed'
Unknown parameter: 'session.audio.output.speed'
```

Prompt-only speed requests were also removed because they are not deterministic
and did not justify permanent UI. Any future attempt requires an end-to-end
test against the actual Desktop session protocol before adding settings or
payload fields.

## Source-Machine Baseline

This is historical evidence, not a target version:

```text
installed package: 2026.07.26.042249
wrapper commit:    e5daf679dedab7e903217875c691b9223cdfb936
wrapper dirty:     false
upstream app:      26.721.41059
Electron:          42.3.0
target:            Ubuntu 26.04, deb, KDE, Wayland, x64
```

The installed build report confirmed these features:

```text
codex-wrapper-updater
open-target-discovery
remote-mobile-control
shallow-repository-watches
```

The new machine should use the latest accepted DMG and current merged fork, not
try to reproduce these version numbers.

## Files And State

Useful installed/runtime evidence:

```text
/opt/codex-desktop/.codex-linux/build-info.json
/opt/codex-desktop/.codex-linux/patch-report.json
~/.config/codex-update-manager/config.toml
~/.local/state/codex-update-manager/state.json
~/.local/state/codex-update-manager/service.log
~/.cache/codex-update-manager/
~/.cache/codex-desktop/launcher.log
~/.local/state/codex-desktop/app.pid
$XDG_RUNTIME_DIR/codex-desktop/launch-action.sock
```

Generated or machine-local repository state:

```text
Codex.dmg
codex-app/
codex-app-next/
.codex-app.candidate-*
dist/
dist-next/rebuild/
target/
linux-features/features.json
linux-features/local/
```

Do not commit those paths. Rebuild them. Do not migrate Remote private keys in
this repository handoff.

## Focused Validation After A Merge

Run tests matching the conflict or changed ownership. For this machine's
customizations, the minimum focused set is:

```bash
bash -n launcher/start.sh.template
node --test linux-features/codex-wrapper-updater/test.js
node --test linux-features/open-target-discovery/test.js
node --test linux-features/remote-mobile-control/test.js
node --test linux-features/shallow-repository-watches/test.js
bash tests/scripts_smoke.sh
cargo test -p codex-update-manager
```

Then run the full fresh native install. A structural test suite cannot prove
that the current upstream Voice, Remote rollout, Plasma compositor, portal, or
keyboard focus works in the real desktop session. Keep the manual smoke checks.

## Agent Handoff Rule

When fixing future upstream drift:

1. fetch both remotes and inspect divergence;
2. merge upstream into the fork without discarding local history;
3. read the latest DMG shape before editing a patch;
4. remove obsolete drift workarounds instead of accumulating version branches;
5. preserve the local feature list unless a feature is explicitly retired;
6. run focused tests and a fresh accepted native build;
7. verify installed provenance and runtime behavior;
8. commit only owned changes and push to `origin main`;
9. update this document when a durable machine-specific decision changes.
