# Mahjong Tournament Tool (web)

A TypeScript + React port of the Godot "Mahjong Tournament Tool": a tournament manager for riichi mahjong with
Progressive Swiss pairings, uma/oka/shuugi scoring, cuts, a round timer, and Google Sheets import/export.
It is a fully static site, so it runs on GitHub Pages with no server.

## Develop

```bash
npm install
npm run dev        # local dev server
npm test           # unit + UI smoke tests (vitest)
npm run build      # typecheck + production build into dist/
```

## Deploy to GitHub Pages

1. Push this project to a GitHub repository (default branch `main`).
2. In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy.yml` runs the tests, builds, and publishes.

The build uses relative asset paths (`base: './'`), so it works at `https://<user>.github.io/<repo>/` without any
extra configuration.

## Project layout

```
src/core/       Pure logic, no React: scoring, cuts, pairings, serialization, CSV, Sheets
src/store/      Zustand store (tournament state, autosave to localStorage)
src/screens/    Main menu, setup, settings preview, tournament view
src/tabs/       Standings, Hanchan History, Round Management, Player Management, Tournament Management
src/components/ Shared widgets (player list, score entry, numeric input, timer)
tests/          Scoring, pairing, store flow, and UI smoke tests
```

| Godot | Web |
| --- | --- |
| `data/table.gd` (`score_table_arr`) | `src/core/scoring.ts` |
| `data/tournament.gd` (`calculate_scores`) | `src/core/tournament.ts` |
| `scene/tournament/RoundManagement.gd` | `src/core/pairing.ts` |
| `data/data_store.gd` autoload | `src/store/store.ts` |
| `GoogleSheetsHandler.gd` | `src/core/sheets.ts` |

## Saving and loading

* Tournaments autosave to the browser (localStorage) after every change; the main menu offers to continue it.
  localStorage belongs to one browser on one machine, so also use **Save Tournament Data to File** for backups.
* Save files are JSON with a `.tmnt` extension. The keys match the Godot version's `serialize()` output.
* **Files saved by the Godot version open directly.** "Load From File" detects Godot's binary `store_var` format and
  converts it (`src/core/godotVar.ts`). Once saved again from the web app, they are JSON.
  Tested against a real 160-player, 40-table save from the Godot version.

## Google Sheets

Works against the same Apps Script web app as the Godot version, using its deployment ID. The web app must be deployed
with access set to **Anyone**, or the browser will block the requests (CORS). This part has not been tested against
a live script.

## Differences from the Godot version

Bugs fixed while porting:

* Leftover riichi sticks ("Give to First") were added to the score in raw points instead of thousands, so one
  stick added 1000 to a player's score.
* With the Split tiebreak, oka for tied 2nd/3rd place was divided by the number of players tied for *1st*.
* Deleting the last cut left the cut players inactive. Everyone is now restored.
* Players on equal scores were always the ones sitting out when there were no substitutes. Ties are now shuffled.
* CSV export quotes names that contain commas.

Additions: autosave, delete players on the setup screen, a "Main Menu" button, CSV copy/download.

Not ported: the `RANDOM` pairing code path in `RoundManagement.gd` (it was unused), and the hidden
"pairing system" dropdown (the setting is still saved).
