# Elks Fall 2026 Golf League board

Everything lives in this repo. Nothing runs on a server.

- **Public board:** https://elksgolfleague.github.io/ — built from `league.json` by the GitHub Action on every push to `main`.
- **Editor:** https://elksgolfleague.github.io/edit/ — a static page that saves `league.json` back to this repo through the GitHub API. It needs a GitHub token with **Contents: read and write** on this repo, pasted once per browser (kept in that browser only).

| Path | What |
|---|---|
| `league.json` | The league: teams, courses, weeks, tee-time assignments, scores. The only file you ever change. |
| `scripts/render.js` | Turns the league data into the public page (static HTML, no scripts). |
| `scripts/build.js` | Builds `_site/` (board + editor) for GitHub Pages. |
| `edit/` | The editor page. |
| `.github/workflows/build.yml` | Builds and deploys Pages on push. Pages source must be set to **GitHub Actions**. |

## Weekly routine

1. Open the editor on your phone or PC.
2. Enter gross scores (the team handicap is copied onto each score automatically).
3. Move a team to "Makeup (other day)" or "Not playing" to free its tee time; the board shows "n open".
4. "Hide past weeks" after a Saturday is done. Hidden weeks still count in the standings.
5. "Save and publish". The board updates in about a minute; the Actions tab shows the build.

Every save is a commit, so the history tab is the audit trail and rollback is `git revert`.

## Local build

```
node scripts/build.js   # writes _site/
```
