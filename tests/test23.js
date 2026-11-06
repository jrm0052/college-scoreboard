// Three games in two columns: the last sits centered under the top two; a lone player-line game takes that spot
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
  const A = await ctx.newPage(); A.on('pageerror', e => errs.push(e.message));
  await A.goto('http://site.test/college-scoreboard/'); await A.waitForTimeout(1000); await reveal(A);
  await A.click('#sportSeg [data-s="nba"]'); await A.waitForTimeout(600);
  // Lakers game (our player) added FIRST so it would normally be top-left
  for (const t of ['Lakers', 'Pistons', 'Kings']) { await A.click('#gameList .gl:has-text("' + t + '")'); await A.waitForTimeout(200); }
  await A.uncheck('#groupOurs').catch(() => {});
  await A.fill('#plQ', 'Walker Kessler'); await A.click('#plFind'); await A.waitForTimeout(400); await A.click('#plResults .plr'); await A.waitForTimeout(1200);
  await A.fill('#sPer', '3'); await A.press('#sPer', 'Tab'); await A.waitForTimeout(300);
  const O = await ctx.newPage(); O.on('pageerror', e => errs.push('out: ' + e.message)); await O.setViewportSize({ width: 1920, height: 1080 });
  await O.goto('http://site.test/college-scoreboard/#output'); await O.waitForTimeout(2500);
  const pos = () => O.evaluate(() => { const gr = document.querySelector('.board .grid').getBoundingClientRect(); return [...document.querySelectorAll('.board .grid > .g')].map(g => { const r = g.getBoundingClientRect(); return { t: [...g.querySelectorAll('.nm')].map(x => x.textContent).join('-'), cx: Math.round((r.left + r.right) / 2 - (gr.left + gr.right) / 2), top: Math.round(r.top), w: Math.round(r.width), pl: !!g.querySelector('.pl') }; }); });
  let p = await pos(); console.log(JSON.stringify(p));
  const [a, b, c] = p;
  ok(p.length === 3 && Math.abs(c.cx) < 3 && c.top > a.top && a.top === b.top && a.w === c.w, 'third game centered under the top two');
  ok(c.pl && /LAKERS|BLAZERS/i.test(c.t), 'the game with the player line takes the bottom center spot');
  await O.screenshot({ path: OUT + '/t23_three.png' });
  // no player lines: rundown order, still centered
  await A.selectOption('#sPlayers', 'off'); await O.waitForTimeout(1800); p = await pos();
  ok(Math.abs(p[2].cx) < 3 && !/LAKERS|BLAZERS/i.test(p[2].t), 'without player lines: rundown order, last game centered: ' + p.map(x => x.t).join(' / '));
  // 4 per page still a plain 2x2
  await A.selectOption('#sPlayers', 'auto'); await A.click('#gameList .gl:has-text("Nets")'); await A.fill('#sPer', '4'); await A.press('#sPer', 'Tab'); await O.waitForTimeout(1800); p = await pos();
  ok(p.length === 4 && p[2].cx < 0 && p[3].cx > 0, '4 games stay a 2x2');
  console.log('errors:', errs); await br.close();
})();
