# Cipher Breach

Ein kostenloses, in Deutsch und Englisch verfügbares Breach-Matrixrätsel für **Foundry VTT ab v12**. Die DV-/Interface-Hausregeln orientieren sich an [Netrun Breach](https://github.com/samroaleksej-bit/night-city-map/tree/netrun-breach). Code und Terminal-Oberfläche sind eigenständig implementiert; es werden keine fremden Styles, Fonts oder Assets übernommen.

**Optionale Hausregel für Cyberpunk RED, kein offizielles RED-Netrunning und kein Ersatz für dessen Regeln.**

**Cipher Breach is unofficial content provided under the Homebrew Content Policy of R. Talsorian Games and is not approved or endorsed by RTG. This content references materials that are the property of R. Talsorian Games and its licensees.**

## Direkt auf GitHub testen

**[Browser-Demo öffnen](https://dominikgursch.github.io/foundry-cipher-breach/preview/?lang=de)** · [English](https://dominikgursch.github.io/foundry-cipher-breach/preview/?lang=en)

1. **Cipher Breach öffnen** drücken und als SL DV, Zielanzahl, Zieltexte und einen Demo-Runner wählen.
2. Der Interface-Rang wird aus der Beispielrolle gelesen. Matrixgröße, Puffer, Sequenzlängen und Zeit werden live berechnet; der Rang ist überschreibbar.
3. **Rätsel starten** stellt die Einladung an den simulierten Spieler zu. Sobald sich das Spielfeld öffnet, läuft der Countdown – auch ohne ersten Zug.
4. Nach Ende erscheint unter dem Spielfenster der Spielerbericht mit erreichten und verfehlten Zielen. Das Fenster schließen, um ihn zu sehen.

Die Vorschau verwendet **dieselbe Engine, dieselben UI-Komponenten und dieselben Styles** wie das Modul. Sie simuliert SL-Konfiguration, Charakterwerte, Spieleröffnung und Ergebnisanzeige in einem Browser, **nicht** Foundry-Berechtigungen, Netzwerkzustellung oder echtes Mehrspielerverhalten.

GitHub Pages wird unter **Repository Settings > Pages > Deploy from a branch** eingerichtet: Branch `dominikgursch-effective-adventure`, Ordner `/ (root)`. Aufrufe der obigen URL verwenden `/preview/`, nicht die Repository-Startseite. Nach einem Merge kann der Pages-Quellbranch auf `main` umgestellt werden. Änderungen am konfigurierten Branch werden automatisch veröffentlicht; `.nojekyll` verhindert eine Jekyll-Verarbeitung.

Unter **[Actions](https://github.com/DominikGursch/foundry-cipher-breach/actions)** läuft für Pushes und Pull Requests **Test and package**: Engine-/Pakettests, Chromium-Browsertests und Erstellen des Foundry-ZIPs. Das Artefakt `foundry-cipher-breach` enthält das Modul-ZIP und die Manifestdatei zum Download. Es ist kein veröffentlichter Foundry-Release.

## Foundry installieren

Das Modul hat keine Laufzeitabhängigkeiten. Für einen Test aus einem Checkout oder Actions-Artefakt:

1. Das innere ZIP `foundry-cipher-breach-v0.1.0.zip` nach `Data/modules/foundry-cipher-breach` entpacken. `module.json` muss unmittelbar dort liegen.
2. Foundry neu laden und **Cipher Breach** in der Welt aktivieren.
3. Als SL im **Token-Werkzeugbereich den Terminal-Knopf** drücken. Alternativ unter **Einstellungen > Einstellungen konfigurieren > Moduleinstellungen > Cipher Breach** öffnen.

Ein Checkout benötigt nur `module.json`, `scripts`, `styles`, `lang`, `LICENSE`, `NOTICE.md` und `README.md` im Modulverzeichnis. `node_modules`, Vorschau und Tests gehören nicht in Foundry.

Das Manifest verweist weiterhin auf den geplanten `v0.1.0`-Release:

```text
https://github.com/DominikGursch/foundry-cipher-breach/releases/download/v0.1.0/module.json
```

**Dieser Installationslink funktioniert erst, wenn die Release-Assets veröffentlicht sind.** Die GitHub-Demo und Actions-Artefakte benötigen keinen Release. Die Mindestversion ist v12; es wird keine echte Foundry-Runtime-Zertifizierung behauptet. Der Adapter unterstützt sowohl die v12-Werkzeugliste als auch die neuere Werkzeugstruktur und Chat-DOM-Hooks, ohne eine neuere Foundry-Version als verifiziert auszuweisen.

## SL-/Spieler-Ablauf

Die SL wählt **DV, bis zu drei benannte Ziele und Teilnehmer**. Bei DV 6 sind wie in der Referenz höchstens zwei Ziele verfügbar. Standardziele sind Passwort, Daten und Kontrolle; ihre Beschreibungen lassen sich frei ändern. Sie sind mögliche Erfolge, keine automatischen Änderungen an Charakteren oder Weltobjekten.

Der Interface-Rang wird aus dem zugewiesenen Charakter gelesen: eingebettetes Item `type: "role"`, Name Netrunner bzw. `system.mainRoleAbility` mit Interface, Rang in `system.rank`. Auch Rang **0** bleibt erhalten. Fehlen Charakter oder Rolle, zeigt die Oberfläche dies ausdrücklich an und schlägt Übungsrang 4 zur Prüfung durch die SL vor. Andere Systeme können den Rang manuell angeben; kein System wird vorausgesetzt und kein Charakterwert wird geschrieben.

Die SL sendet eine GM-eigene Chat-Einladung. Beim zugewiesenen Online-Spieler öffnet sich das Rätsel automatisch und **startet sofort den Timer**. Offline-Spieler können die behaltene Chat-Einladung nach dem Wiederverbinden öffnen; dann beginnt ihre Zeit. Nur der Teilnehmer erhält den Spielknopf; derselbe Chat-Eintrag öffnet nicht mehrere gleichzeitige Spielfenster.

- Erster Code: oberste Zeile. Danach abwechselnd Spalte und Zeile der letzten Auswahl; keine Zelle doppelt.
- Der Countdown beginnt **beim Öffnen des Spielfelds**, bewusst früher als in der Referenz. Abwarten zählt zur Laufzeit; ohne Zug endet der Breach ebenfalls bei Zeitablauf und wird gemeldet.
- Ziele werden durch zusammenhängende Codes im Puffer erreicht, in beliebiger Reihenfolge; Sequenzen dürfen überlappen. Präfixfortschritt und passende nächste Codes werden hervorgehoben.
- Ende bei allen erreichten Zielen, vollem Puffer, Zeitablauf, Sackgasse oder Ausstöpseln. Teilerfolge bleiben erhalten; alle Ziele auf dem letzten Pufferplatz zählen als voller Erfolg.
- Beendete zugewiesene Läufe senden automatisch eine Ergebnisnachricht, ohne Senden-Knopf im Spielfeld. Nur bei einem Sendefehler erscheint der Fehler und der Ausstöpseln-Knopf wird zu **Übertragung wiederholen**. Schließen eines unfertigen Laufs verwirft ihn.

Privater Chat geht an Teilnehmer und alle SLs, öffentlicher an alle. Die Chat-Karte zeigt Rang, DV, Zeitangabe, Pufferverbrauch und jedes Ziel. Ohne erreichtes Ziel erscheint der ICE-Hinweis; **die SL bestimmt sämtliche Folgen manuell**. Lokales Üben versendet keine Chat-Nachrichten.

## Deep-Dive-Oberfläche

Eigenständig gestaltetes Rot-/Schwarz-/Weiß-Terminal: kompakte Kopfzeile mit DV, Interface und Countdown; links die Code-Matrix als Monitor, rechts Puffer, Ziele und Ausstöpseln. Keine Hausregelhinweise, Spielanleitung, Effekt-Schalter oder Senden-Knöpfe im Spielfeld. Lizenz- und Vertrauensinformationen bleiben in Dokumentation und Chat erhalten.

Scanlines, schwaches Bildrauschen und eine langsame Monitorstörung sind immer aktiv, auch im Ergebnisbild. Sie verändern nur transparente Ebenen über der Matrix; Codes und Bedienelemente bewegen sich nicht. Keine schnellen Lichtblitze oder Vollbild-Helligkeitswechsel. Die Systemeinstellung **Bewegung reduzieren / prefers-reduced-motion** unterdrückt die Animationen weiterhin und behält die statische Monitorstruktur. Es werden keine offiziellen Layouts, Logos, Fonts oder Grafiken kopiert.

## Mechanik der Referenz

| DV | Matrix | Codes pro Ziel |
|---|---|---|
| 6 | 5 x 5 | 2, 3 |
| 8 | 5 x 5 | 2, 3, 3 |
| 10 | 6 x 6 | 3, 3, 4 |
| 12 | 6 x 6 | 3, 4, 4 |
| 14 | 7 x 7 | 4, 4, 5 |
| 16 | 7 x 7 | 4, 5, 5 |
| 18 | 8 x 8 | 5, 5, 6 |
| 20 | 8 x 8 | 5, 6, 6 |

DV 6–14 stammen aus der Referenzmechanik; DV 16, 18 und 20 sind eine eigene Fortsetzung dieser Hausregel. Es sind weiterhin höchstens drei Ziele möglich. Die Zeit-/Pufferformeln bleiben unverändert; auch bei DV 20 gibt es mindestens 15 Sekunden. Lange Sequenzen werden bei niedrigen Rängen wie bisher auf den Puffer begrenzt.

**Puffer:** `4 + Math.ceil(Interface-Rang / 2)`

**Zeit in Sekunden:** `Math.max(15, 25 + 4 * Interface-Rang - (DV - 6))`

**Interface-Rang:** ganze Zahl von 0 bis 10.

Bei weniger Zielen werden die ersten Sequenzlängen des DV-Presets verwendet. Jede Länge wird auf die Puffergröße begrenzt. Die Engine erzeugt einen legalen, nicht wiederholten Pfad und nimmt alle Zielsequenzen daraus. Wenn die Summe der Längen nicht in den Puffer passt, werden die Starts wie im Referenzcode über den Pfad verteilt: `Math.round(index * (buffer - length) / Math.max(1, count - 1))`. Dadurch überlappen Ziele und sind gemeinsam lösbar. Ein selbst gewählter Weg kann trotzdem erfolglos sein. Der Lösungspfad wird nicht in Chat-Dokumente geschrieben.

Die früheren freien Konfigurationen bleiben intern für gespeicherte Schema-1-Einladungen und deren Replay unterstützt. Neue Einladungen verwenden Schema 2 mit überprüften DV-/Rangparametern und Zielnamen. Neue Ergebnisberichte verwenden ebenfalls Schema 2 für die Zeit ab Spielfeldöffnung; gespeicherte Schema-1-Berichte werden weiterhin mit der alten Zeitmessung ab erstem Zug nachgespielt.

## Makros

Konfiguration öffnen (auch für lokale Spielerübung):

```js
game.modules.get("foundry-cipher-breach").api.open();
```

Als SL direkt an einen Spieler senden; ohne `rank` wird der Charakter gelesen:

```js
await game.modules.get("foundry-cipher-breach").api.start({
  user: "<userId>",
  dv: 10,
  targetCount: 3,
  names: ["Tür entsperren", "Dateien kopieren", "Kameras kontrollieren"],
  publicResult: false
});
```

Optional `rank: 6` zum Überschreiben. Ohne auslesbare Rolle muss das Makro den Rang ausdrücklich angeben; ungültige Eingaben werfen Fehler statt einen anderen Teilnehmer oder DV zu wählen.

## Vertrauensgrenze

**Ergebnisse sind ungeprüfte Spielerangaben, keine authentifizierten Erfolge.** Die SL kann den Zugverlauf gegen das aktuell verfügbare GM-eigene Chat-Dokument nachspielen. Geprüft werden begrenzte Datenschemata, Teilnehmer/angegebener Autor, legale Züge, Zieltreffer, Endzustand und behauptete Zeitgrenzen. Das beweist weder echte Laufzeit noch ehrliches Spielen oder kryptografische Identität.

Es gibt keine eigenen Socket-Befehle, versteckten Welt-Settings, Remote-Code oder privilegierten Aktionen aus Spielerangaben. Core-Chat-Dokumente übernehmen Zustellung und Sichtbarkeit. Spieler können die Matrix untersuchen, neu versuchen oder ihre Clients verändern. Schließen/Neuladen verliert den Lauf; Wiederholungen werden nicht dauerhaft verhindert. Es gibt keine autoritative Startuhr oder Server-Zeitstempel pro Zug. Wer die Einladung sehen kann, kann Matrix und Ziele lesen. Bearbeiten/Löschen einer Quelle kann Berichte ungültig machen; fehlende oder fremdverfasste Quellen werden abgelehnt.

## Entwicklung

Node **20+**. Laufzeit und Paketbau sind abhängigkeitsfrei; nur die Browserprüfungen nutzen Playwright als Entwicklungsabhängigkeit.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run package
npm run preview
```

Lokale Vorschau: `http://127.0.0.1:8080/preview/`. Optional `PORT=8090 npm run preview`. Alternativ den Repository-Root mit einem statischen HTTP-Server bereitstellen; `file://` unterstützt die Modul-/Sprachdateien nicht.

Tests decken alle unterstützten DV-/Rang-/Zielkombinationen, Referenzformeln, gemeinsame Lösbarkeit, Alt-Schemata, Timer, Überlappung, Teilerfolge und Paketformat ab. Chromium prüft Konfiguration, Charakterauslesung, Countdown, Hervorhebungen, automatisches Melden, Fehlerwiederholung und mobile Darstellung. Foundry-Hooks/Berechtigungsgrenzen werden mit einem Adapter-Testdouble geprüft, **nicht mit einem laufenden Foundry-Server**.

`npm run package` erzeugt `dist/foundry-cipher-breach-v0.1.0.zip` und `dist/module.json`. Das ZIP enthält ausschließlich Laufzeit, Manifest und Lizenz-/Dokumentationsdateien; `dist` ist unversioniert. Release erst nach Prüfung der beabsichtigten Revision und möglichst einem echten Foundry-v12-Test veröffentlichen:

```sh
gh release create v0.1.0 dist/module.json dist/foundry-cipher-breach-v0.1.0.zip --prerelease --title "Cipher Breach 0.1.0" --notes "DV/Interface house-rule breach. Unverified player reports; manual GM adjudication. See README for runtime verification status."
```

## English

An independently implemented, free Foundry v12+ matrix puzzle using the linked reference module's **house-rule DV presets and Interface formulas**, extended with original DV 16/18/20 presets, not official Cyberpunk RED Netrunning. The GM uses a terminal button to select DV, up to three named objectives and a participant; the character's Netrunner role supplies the editable rank. The assigned player's board opens automatically and starts its timer immediately, even without moves. Completed runs send a partial/full result through core chat without a send button. The compact red/black/white hack monitor includes always-on subtle scanlines and noise, respects reduced motion and never flashes the board. Failures stay visible and turn the jack-out action into a transmission retry. No actor or world data is modified.

Use the [English browser demo](https://dominikgursch.github.io/foundry-cipher-breach/preview/?lang=en) for the shared engine/UI and simulated GM/player flow. Actions provides automated checks and an installable module ZIP artifact. The demo and adapter testdouble are not real Foundry multiplayer verification. All player reports remain untrusted; the GM manually adjudicates every effect.

## Lizenz

Originalcode, Styles, Texte und Übersetzungen: **MIT**, copyright (c) 2026 DominikGursch. Siehe [LICENSE](LICENSE) und [NOTICE.md](NOTICE.md). Keine gebündelten Fremdassets, Sounds, Fonts, Screenshots, offiziellen Regeln oder Statblocks. MIT gilt nur für eigene Beiträge, nicht für Marken/IP Dritter.
