// NFL / NBA scores + tracked players, using real ESPN responses captured today (states adjusted to live / upcoming)
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || require('os').tmpdir(), E = __dirname + '/fixtures/';
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const J = f => JSON.parse(fs.readFileSync(E + f, 'utf8'));
const today = new Date(); const iso = h => new Date(Date.now() + h * 3600e3).toISOString();
// NBA: Lakers-Blazers live in the 3rd, Celtics-Nets later tonight, others final
const nba = J('nba_sb.json');
nba.events.forEach(e => { e.date = iso(-2); });
const lal = nba.events.find(e => e.id === '401909880'); lal.date = iso(-1);
lal.competitions[0].status = { period: 3, type: { state: 'in', name: 'STATUS_IN_PROGRESS', shortDetail: '4:12 - 3rd' } };
const bos = nba.events.find(e => e.id === '401909877'); bos.date = iso(3);
bos.competitions[0].status = { period: 0, type: { state: 'pre', name: 'STATUS_SCHEDULED', shortDetail: '' } };
bos.competitions[0].competitors.forEach(c => c.score = '0');
// NFL: 49ers at Falcons live in the 3rd with the ball
const nfl = J('nfl_sb.json'); nfl.events.forEach(e => e.date = iso(-3));
const sf = nfl.events.find(e => e.id === '401873017'); sf.date = iso(-1);
sf.competitions[0].status = { period: 3, type: { state: 'in', name: 'STATUS_IN_PROGRESS', shortDetail: '5:12 - 3rd' } };
sf.competitions[0].situation = { possession: '25', shortDownDistanceText: '2nd & 7', downDistanceText: '2nd & 7 at ATL 35', possessionText: 'ATL 35' };
const P = (id, name, league, tid, abbr, tname, pos) => ({ id, displayName: name, league, isActive: true, jersey: '1', position: { abbreviation: pos }, teamRelationships: [{ core: { id: tid, abbreviation: abbr, displayName: tname } }] });
const PEOPLE = [P('4433136', 'Walker Kessler', 'nba', '13', 'LAL', 'Los Angeles Lakers', 'C'), P('4683021', 'Deni Avdija', 'nba', '22', 'POR', 'Portland Trail Blazers', 'F'),
  P('9990001', 'Test Celtic', 'nba', '2', 'BOS', 'Boston Celtics', 'G'), P('3138826', 'Fred Warner', 'nfl', '25', 'SF', 'San Francisco 49ers', 'LB'), P('4361741', 'Brock Purdy', 'nfl', '25', 'SF', 'San Francisco 49ers', 'QB')];
const seen = {};
(async () => {
  const br = await chromium.launch(); const errs = [];
  const ctx = await br.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.route('**/*', r => {
    const u = r.request().url(), JS = o => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    const k = u.replace(/\?.*/, '').split('/').slice(-3).join('/'); seen[k] = (seen[k] || 0) + 1;
    if (u.startsWith('http://site.test/')) return r.fulfill({ contentType: 'text/html', body: HTML });
    if (u.includes('supabase.co')) return r.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
    if (u.includes('/common/v3/search')) { const q = decodeURIComponent(u.match(/query=([^&]+)/)[1]).toLowerCase(); return JS({ items: PEOPLE.filter(p => p.displayName.toLowerCase().includes(q)) }); }
    if (u.includes('/athletes/') && u.includes('/overview')) return JS(u.includes('/nfl/') ? J('nfl_ath.json') : J('nba_ath.json'));
    if (u.includes('nba/summary')) return JS(J('nba_sum.json'));
    if (u.includes('nfl/summary')) return JS(J('nfl_sum.json'));
    if (u.includes('nba/teams/13/roster')) return JS(J('nba_roster.json'));
    if (u.includes('nfl/teams/1/roster')) return JS(J('nfl_roster.json'));
    if (u.includes('nba/teams')) return JS({ sports: [{ leagues: [{ teams: [{ team: { id: '13', abbreviation: 'LAL', displayName: 'Los Angeles Lakers' } }] }] }] });
    if (u.includes('nfl/teams')) return JS({ sports: [{ leagues: [{ teams: [{ team: { id: '1', abbreviation: 'ATL', displayName: 'Atlanta Falcons' } }] }] }] });
    if (u.includes('basketball/nba/scoreboard')) return JS(nba);
    if (u.includes('football/nfl/scoreboard')) return JS(nfl);
    if (u.includes('/rankings')) return JS({ rankings: [] });
    if (u.includes('site.api.espn.com')) return JS({ events: [] });
    if (u.includes('espncdn')) { const id = (u.match(/\/(\w+)\.png/) || [0, '1'])[1]; return r.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="hsl(${(id.length * 97 + id.charCodeAt(0) * 13) % 360},55%,55%)"/></svg>` }); }
    return r.abort();
  });
  const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
  const A = await ctx.newPage(); A.on('pageerror', e => errs.push(e.message)); A.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push('console: ' + m.text()));
  await A.goto('http://site.test/college-scoreboard/'); await A.waitForTimeout(1000);
  ok(!(await A.$eval('#guide', e => e.hidden)), 'first-run guide shows for a new user');
  ok(await A.$eval('#buildBox', e => e.open), 'Build panel open when the rundown is empty');
  await A.screenshot({ path: OUT + '/u_first.png' });
  await A.click('#sportSeg [data-s="nba"]'); await A.waitForTimeout(500);
  ok(await A.$eval('#qbSports [data-s="nba"]', e => e.getAttribute('aria-pressed') === 'true') && await A.$eval('#qbRecipe', e => e.value === 'all'), 'quick build follows the picker sport (NBA, All games)');
  await A.click('#qbAdd'); await A.waitForTimeout(1200);
  ok((await A.$$eval('#rdList li', l => l.length)) === 4, 'Add these games adds 4');
  await A.evaluate(() => document.getElementById('buildBox').open = true); await A.click('#qbReplace'); await A.waitForTimeout(1200);
  ok(/Undo/.test(await A.textContent('#toast')), 'Replace shows Undo: ' + await A.textContent('#toast'));
  await A.click('#clearRd'); await A.waitForTimeout(300);
  ok((await A.$$eval('#rdList li', l => l.length)) === 0, 'Clear empties the rundown');
  await A.click('#toast button'); await A.waitForTimeout(400);
  ok((await A.$$eval('#rdList li', l => l.length)) === 4, 'Undo brings it back');
  ok((await A.$eval('#guide li[data-step="games"]', e => e.classList.contains('done'))), 'guide step 1 ticked');
  // settings tabs
  for (const t of ['size', 'look', 'header', 'show']) { await A.click('#setTabs [data-t="' + t + '"]'); const vis = await A.$$eval('#boardSettings .sgrid', l => l.filter(x => !x.hidden).map(x => x.dataset.pane)); ok(vis.length === 1 && vis[0] === t, 'tab ' + t + ' shows only its fields'); }
  await A.click('#setTabs [data-t="size"]');
  // presets
  await A.evaluate(() => document.getElementById('buildBox').open = true); await A.click('#psNew'); await A.fill('#psName', 'NBA night'); await A.check('#psLayout'); await A.click('#psSave'); await A.waitForTimeout(300);
  ok(/NBA night/.test(await A.$eval('#psSel', e => e.selectedOptions[0].textContent)), 'preset saved: ' + await A.$eval('#psSel', e => e.selectedOptions[0].textContent));
  await A.selectOption('#psSel', '0'); await A.click('#psLoad'); await A.waitForTimeout(300);
  ok(/House/.test(await A.textContent('#toast')), 'house look preset loads');
  // previews: open window -> on-air badge; hide -> mask + badge
  const [w] = await Promise.all([ctx.waitForEvent('page'), A.click('.ob[data-o="0"] [data-x="open"]')]); await A.waitForTimeout(800);
  ok(/On air/.test(await A.textContent('.ob[data-o="0"] .air')), 'badge: ' + await A.textContent('.ob[data-o="0"] .air'));
  await A.click('.ob[data-o="1"] [data-x="hide"]'); await A.waitForTimeout(300);
  ok(await A.$eval('.ob[data-o="1"]', e => e.classList.contains('is-hidden')) && /Hidden/.test(await A.textContent('.ob[data-o="1"] .air')), 'Hide: mask + Hidden badge');
  await A.click('.ob[data-o="1"] [data-x="hide"]');
  ok((await A.$$eval('#outs .ob', l => l.map(x => x.dataset.o).join(''))) === '0123', 'previews in numeric order');
  // screen links
  await A.click('#linksBtn'); await A.waitForTimeout(400);
  ok(await A.$eval('#onlineOn', e => e.checked) && (await A.$$eval('#linksList input', l => l.length)) === 4, 'Get screen links turns sending on and lists 4 links');
  ok(/Live|Connecting|Online|refused|reach/i.test(await A.textContent('#onlineTxt')), 'venue bar: ' + await A.textContent('#onlineTxt'));
  ok(!(await A.$('#onlineMove:visible')), 'board code button is not on the Control page');
  await A.waitForTimeout(500);
  await A.screenshot({ path: OUT + '/u_control.png', fullPage: true });
  await A.setViewportSize({ width: 1366, height: 768 }); await A.waitForTimeout(300); await A.screenshot({ path: OUT + '/u_laptop.png' });
  await A.setViewportSize({ width: 1600, height: 1000 });
  // player-stats note on a small output
  await A.evaluate(() => document.getElementById('playersBox').open = true); await A.fill('#plQ', 'Walker Kessler'); await A.click('#plFind'); await A.waitForTimeout(400); await A.click('#plResults .plr'); await A.waitForTimeout(1500);
  const notes = await A.$$eval('.ob .pnote', l => l.map(x => !x.hidden));
  ok(!notes[0] && notes[1] && notes[3], 'player-stats note on small outputs only: ' + notes);
  await A.click('#viewTabs [data-v="admin"]'); await A.waitForTimeout(500);
  await A.screenshot({ path: OUT + '/u_admin.png', fullPage: true });
  console.log('errors:', errs); await br.close();
})();
