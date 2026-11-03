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
global.NFL = nfl; const sf = nfl.events.find(e => e.id === '401873017'); sf.date = iso(-1);
sf.competitions[0].status = { period: 3, type: { state: 'in', name: 'STATUS_IN_PROGRESS', shortDetail: '5:12 - 3rd' } };
sf.competitions[0].situation = { possession: '25', shortDownDistanceText: '2nd & 7', downDistanceText: '2nd & 7 at ATL 35', possessionText: 'ATL 35' };
const P = (id, name, league, tid, abbr, tname, pos) => ({ id, displayName: name, league, isActive: true, jersey: '1', position: { abbreviation: pos }, teamRelationships: [{ core: { id: tid, abbreviation: abbr, displayName: tname } }] });
const PEOPLE = [P('4433136', 'Walker Kessler', 'nba', '13', 'LAL', 'Los Angeles Lakers', 'C'), P('4683021', 'Deni Avdija', 'nba', '22', 'POR', 'Portland Trail Blazers', 'F'),
  P('9990001', 'Test Celtic', 'nba', '2', 'BOS', 'Boston Celtics', 'G'), P('3138826', 'Fred Warner', 'nfl', '25', 'SF', 'San Francisco 49ers', 'LB'), P('4361741', 'Brock Purdy', 'nfl', '25', 'SF', 'San Francisco 49ers', 'QB')];
const seen = {};
const reveal = p => p.evaluate(() => { document.querySelectorAll('details').forEach(d => d.open = true); document.querySelectorAll('.sgrid[data-pane]').forEach(x => x.hidden = false); });
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
    if (u.includes('nfl/summary')) return JS(u.includes('401873017') ? J('nfl_sum.json') : {boxscore: {players: [], teams: []}, scoringPlays: []});
    if (u.includes('nba/teams/13/roster')) return JS(J('nba_roster.json'));
    if (u.includes('nfl/teams/1/roster')) return JS(J('nfl_roster.json'));
    if (u.includes('nfl/teams/25/roster')) return JS(J('nfl_roster25.json'));
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
  const A = await ctx.newPage(); A.on('pageerror', e => errs.push(e.message));
  await A.goto('http://site.test/college-scoreboard/'); await A.waitForTimeout(900); await reveal(A); await A.uncheck('#sHold');
  await A.fill('#sRefresh', '10'); await A.press('#sRefresh', 'Tab');
  // ---- fantasy page ----
  await A.click('#sportSeg [data-s="nfl"]'); await A.waitForTimeout(500);
  await A.selectOption('#ffPos', 'all'); await A.click('#ffAdd'); await A.waitForTimeout(2500);
  const fpts = await A.evaluate(() => { const o = {}; document.querySelectorAll('.ob[data-o="0"] .frow').forEach(r => { const n = r.querySelector('.sn'); if (n) o[n.textContent] = r.querySelector('.fp').textContent; }); return o; });
  console.log('fantasy:', JSON.stringify(fpts));
  const want = {'M. Penix': '20.4', 'B. Purdy': '12.0', 'C. McCaffrey': '22.0', 'B. Robinson': '17.2', 'D. London': '19.6', 'G. Kittle': '14.8', 'N. Folk': '10.0', 'ATL D/ST': '7.0'};
  Object.entries(want).forEach(([k, v]) => ok(fpts[k] === v, k + ' = ' + fpts[k] + ' (expected ' + v + ')'));
  ok(/Fantasy leaders · All positions/.test(await A.textContent('#rdList')), 'rundown row: ' + (await A.textContent('#rdList li:last-child .mu')).replace(/\s+/g, ' '));
  await A.click('.ob[data-o="0"] [data-x="play"]');
  const O = await ctx.newPage(); await O.setViewportSize({ width: 1920, height: 1080 }); O.on('pageerror', e => errs.push('out: ' + e.message));
  await O.goto('http://site.test/college-scoreboard/#output'); await O.waitForTimeout(1200);
  await A.click('#rdList li[data-key^="ff:"] [data-a="go"]'); await O.waitForTimeout(1500); await O.screenshot({ path: OUT + '/f_all.png' });
  const F = await ctx.newPage(); await F.setViewportSize({ width: 1920, height: 72 }); await F.goto('http://site.test/college-scoreboard/#output2'); await F.waitForTimeout(1500);
  await A.click('.ob[data-o="1"] [data-x="play"]'); await A.click('#rdList li[data-key^="ff:"] [data-a="go"]'); await F.waitForTimeout(1500); await F.screenshot({ path: OUT + '/f_fascia.png' });
  await A.selectOption('#ffPos', 'WR'); await A.click('#ffAdd'); await A.waitForTimeout(1500);
  await A.click('#rdList li[data-key$=":WR"] [data-a="go"]'); await O.waitForTimeout(1500); await O.screenshot({ path: OUT + '/f_wr.png' });
  // ---- football scoring play: full text, stays past the 12-second setting ----
  await A.click('#gameList .gl:has-text("49ers")'); await A.waitForTimeout(400);
  await A.click('#rdList li[data-key="nfl:401873017"] [data-a="go"]'); await O.waitForTimeout(1500);
  global.NFL.events.find(e => e.id === '401873017').competitions[0].competitors.find(c => c.homeAway === 'away').score = '27';
  await O.waitForFunction(() => document.querySelector('.g .play'), null, { timeout: 25000 });
  const t1 = await O.textContent('.g .play'); console.log('play:', t1.replace(/\s+/g, ' '));
  ok(!/scores$/i.test(t1.trim()), 'play shows ESPN’s full text from the start');
  await O.waitForTimeout(20000);
  ok(!!(await O.$('.g .play')) && (await O.textContent('.g .play')) === t1, 'still there and unchanged 20 s later (setting is 12 s)');
  await O.screenshot({ path: OUT + '/f_play.png' });
  // ---- basketball top scorer ----
  await A.click('#sportSeg [data-s="nba"]'); await A.waitForTimeout(500); await A.click('#addAll'); await A.waitForTimeout(400);
  await A.click('#rdList li[data-key="nba:401909880"] [data-a="go"]'); await O.waitForTimeout(1500);
  const tops = await O.$$eval('.g .pl .ps', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  ok(tops.some(t => /Luka Doncic.*Lakers.*41.*PTS/.test(t)), 'top scorer strip: ' + tops.join(' || '));
  await O.screenshot({ path: OUT + '/f_top.png' });
  // tracked player takes the spot
  await A.fill('#plQ', 'Walker Kessler'); await A.click('#plFind'); await A.waitForTimeout(400); await A.click('#plResults .plr'); await A.waitForTimeout(2500);
  const tops2 = await O.$$eval('.g .pl .ps', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  ok(tops2.some(t => /Kessler/.test(t)) && !tops2.some(t => /Doncic/.test(t)), 'tracked player keeps the spot: ' + tops2.join(' || '));
  console.log('errors:', errs); await br.close();
})();
