# College Scoreboard

Out-of-town college scoreboard for videoboard shows (football, men's and women's basketball, baseball), with live ESPN scores.

- Dashboard: open the site root.
- Output links for DAK / remote computers: `https://jrm0052.github.io/college-scoreboard/?<board code>/<output number>` (use **Copy link** in the dashboard).

## Checks

`tests/` holds automated checks that open the app in a headless browser with saved ESPN responses (`tests/fixtures/`) and confirm the dashboard, outputs, venue screens, rotation, players, fantasy and standings all behave. GitHub runs them on every change (Actions tab → "Scoreboard checks"). To run them on a computer: `npm install playwright && npx playwright install chromium && node tests/run-all.js`.
