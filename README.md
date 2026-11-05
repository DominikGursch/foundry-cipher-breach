# Cipher Breach

An original, dependency-free code-matrix puzzle for Foundry Virtual Tabletop. **Optional home rule for Cyberpunk RED games, not official RED Netrunning or a replacement for its rules.** Free unofficial fan project. Version **0.1.0**, initial prerelease foundation.

**Cipher Breach is unofficial content provided under the Homebrew Content Policy of R. Talsorian Games and is not approved or endorsed by RTG. This content references materials that are the property of R. Talsorian Games and its licensees.**

## Install

Target: **Foundry VTT v12 minimum**. No system dependency; actor sheets and system data are not read or modified. No real Foundry runtime verification is claimed, and newer versions have not been certified.

After the `v0.1.0` prerelease and its assets have been published, use this manifest in Foundry's **Add-on Modules > Install Module > Manifest URL**:

```text
https://github.com/DominikGursch/foundry-cipher-breach/releases/download/v0.1.0/module.json
```

The manifest is version-pinned; it does not track future prereleases. A fresh repository checkout is also installable: copy `module.json`, `scripts`, `styles`, `lang`, `LICENSE`, `NOTICE.md` and `README.md` into `Data/modules/foundry-cipher-breach`, then enable the module in your world. Check the repository Releases page to confirm that downloadable release assets actually exist.

## Play

Open **Game Settings > Configure Settings > Module Settings > Cipher Breach > Open Cipher Breach**, or create a **Script** macro:

```js
game.modules.get("foundry-cipher-breach").api.open();
```

Every user can practice locally, with no chat messages. The GM can select a participant and launch a challenge into chat. Only that participant sees the module's play button; all GMs see its participant label. Private visibility sends the challenge and report to the participant and GMs; public visibility shows the challenge and report to everyone. Foundry chat permissions must allow the creating user to post.

1. Select the first cell in the **top row**. The timer begins on this first legal selection, not when the window opens.
2. Select an unused cell in the last cell's **column**, then its **row**, alternating thereafter. No cell may be reused.
3. Match **all** target sequences as contiguous codes in the buffer, in any order. Matches may overlap. All targets matched is a win, including on the last buffer slot.
4. The run ends when all targets match, time expires, the buffer fills, or you jack out. If a chosen route leaves no legal next cell, jack out or let the timer expire. Closing discards the attempt, without submission or resume.

After a shared run ends, use **Send unverified result**. A GM can select **Review unverified result** to replay the reported move history against the current GM-authored challenge document and inspect outcome, matches and claimed time. Rejected/malformed results produce a visible error; detailed errors are in the console.

## Deliberate trust boundary

**Reports are untrusted player proposals, not authenticated achievements.** No custom sockets, hidden world settings, remote code, actor updates, currency operations or automatic consequences are implemented. Core chat documents provide the sharing workflow rather than a player-to-GM command channel.

The replay checks bounded schemas, challenge ID, assigned participant versus the result document's reported author, the GM-authored source, legal moves, target matches, outcome and claimed elapsed-time bounds. These are consistency checks only. The module does **not** claim that a chat author field cryptographically authenticates a remote human, or that its client-side flags/clock prevent cheating. It never uses player data to initiate a privileged operation.

Timing cannot be verified remotely: there are no per-move server timestamps or authoritative start signal. Players can inspect the puzzle, retry, forge their own reports, or alter client code. Duplicate reports are not prevented. Anyone who can see the challenge can read its matrix and targets; no secret solution or confidential GM data is stored. The generator's witness path is discarded, not sent to chat. A GM editing/deleting the source can invalidate old reports; missing sources fail closed.

**The GM manually decides any in-game effect using the actual tabletop rules.** This foundation is appropriate for cooperative play, not adversarial anti-cheat. Closing/reloading loses a run. Multiple windows do not share state. Offline recipients can open retained chat challenges after reconnecting.

## Original difficulty

| Parameter | Supported range | Default |
|---|---|---|
| Matrix | 4-8 per side | 5 |
| Buffer | 4-14 selections | 8 |
| Targets | 1-3 | 2 |
| Codes per target | 2-4 | 3 |
| Timer | 15-300 seconds | 60 |

The buffer must hold **target count multiplied by sequence length**. The generator constructs a legal non-repeating witness path, then derives all targets from successive portions of that path. Thus every generated configuration is jointly solvable within its buffer, even if a player's chosen path is not. Duplicate targets and overlapping matches are allowed. The engine's witness is for construction/tests only; imported externally altered matrices are schema-checked but not guaranteed solvable.

These parameters and code symbols are original house-rule choices. There is no invented "official" Interface-rank formula, automatic roll or character integration.

## Development and preview

Node **20+**, no package installation needed:

```text
npm test
npm run package
```

Tests cover deterministic generation across the supported configuration space, jointly solvable paths, alternating movement, uniqueness, contiguous/overlapping matches, timer start/deadline, terminal states, hostile schemas/replay inputs, localization parity and the release ZIP format. These are automated engine/package checks, not a substitute for in-Foundry multiplayer testing.

Serve the repository root with an existing static HTTP server and open `/preview/` (or `/preview/?lang=de`). The preview reuses `scripts/ui.mjs`, `scripts/engine.mjs` and the module stylesheet. `file://` does not support its ES modules/translation fetch. No CDN, external font or dependency is loaded. It tests local gameplay only.

`npm run package` creates `dist/foundry-cipher-breach-v0.1.0.zip` and `dist/module.json`. The ZIP contains `module.json` at its root, the runtime and licensing/docs only; no tests, build tools, preview, dependency tree or repository metadata. `dist` is intentionally untracked.

Release process after tests and a manual v12 check:

```text
gh release create v0.1.0 dist/module.json dist/foundry-cipher-breach-v0.1.0.zip --prerelease --title "Cipher Breach 0.1.0" --notes "Initial foundation. Unverified player reports; manual GM adjudication. See README for runtime verification status."
```

Publish only from the intended committed `main` revision. If publishing without a real Foundry check, explicitly retain the unverified runtime limitation in the release notes.

## Deutsch

Eigenständiges, kostenloses Matrixrätsel mit deutscher und englischer Oberfläche. Keine Kopie eines bestehenden Interfaces und keine Umsetzung offizieller RED-Netrunning-Regeln.

Nach Aktivierung unter **Einstellungen > Einstellungen konfigurieren > Moduleinstellungen > Cipher Breach** öffnen. Spieler können lokal üben; die SL kann einen Teilnehmer wählen und das Rätsel privat an SL/Teilnehmer oder öffentlich senden. Der Timer startet mit der ersten gültigen Auswahl. Ergebnisse sind ausdrücklich **ungeprüfte Angaben**: Das Nachspielen prüft Zuglogik und Zielerreichung, nicht ehrliches Spielen oder echte Laufzeit. Wiederholungen sind möglich. Die SL entscheidet alle Folgen selbst; Charakterwerte und Weltdaten bleiben unverändert.

## License and attribution

Original code, styles, interface, documentation and translations: **MIT**, copyright (c) 2026 DominikGursch. Retain the MIT copyright and permission notice; see [LICENSE](LICENSE). There are no bundled image assets, third-party fonts, sounds, templates, game rules or statblocks. MIT covers original work only, **not** game trademarks/IP.

The visual language is independently designed: teal/amber/neutral panels, system typography and an original layout rather than an existing game's trade dress. See [NOTICE.md](NOTICE.md) for attribution, the independent-implementation boundary and policy references:

- https://rtalsoriangames.com/homebrew-content-policy/
- https://www.cdprojektred.com/en/fan-content
