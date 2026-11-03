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
  await A.goto('http://site.test/college-scoreboard/'); await A.waitForTimeout(800); await reveal(A);
  await A.click('#sportSeg [data-s="nba"]'); await A.waitForTimeout(500); await A.click('#addAll'); await A.waitForTimeout(300);
  
  for (const n of ['Walker Kessler', 'Deni Avdija', 'Test Celtic']) { await A.fill('#plQ', n); await A.click('#plFind'); await A.waitForTimeout(400); await A.click('#plResults .plr'); await A.waitForTimeout(300); }
  await A.waitForTimeout(1500);
  await A.click('.ob[data-o="0"] [data-x="play"]');
  const O = await ctx.newPage(); O.on('pageerror', e => errs.push('out: ' + e.message));
  const check = async (label) => O.evaluate(() => {
    const b = document.querySelector('.board').getBoundingClientRect(), bad = [];
    const cards = [...document.querySelectorAll('.board > .grid .g .pn')].map(e => e.getBoundingClientRect());
    document.querySelectorAll('.board > .grid .g .pl').forEach(pl => {
      const r = pl.getBoundingClientRect();
      if (r.bottom > b.bottom - 2) bad.push('off bottom by ' + Math.round(r.bottom - b.bottom));
      cards.forEach(c => { if (r.top < c.bottom - 1 && r.bottom > c.top + 1 && r.left < c.right && r.right > c.left && Math.abs(r.top - c.bottom) > 2 && r.top < c.top + c.height) bad.push('overlaps a card'); });
    });
    return {strips: document.querySelectorAll('.board > .grid .g .pl').length, games: cards.length, bad};
  });
  const strips = () => O.evaluate(() => document.querySelectorAll('.board .g .pl').length);
  await O.goto('http://site.test/college-scoreboard/#output');
  for (const [w, h, want] of [[1920, 868, true], [756, 259, false], [1450, 72, false], [3449, 346, false], [1920, 1080, true], [900, 500, false]]) {
    await A.selectOption('#sPreset', 'custom').catch(() => {}); await A.fill('#sW', String(w)); await A.press('#sW', 'Tab'); await A.fill('#sH', String(h)); await A.press('#sH', 'Tab');
    await A.click('#rdList li[data-key="nba:401909880"] [data-a="go"]'); await O.setViewportSize({ width: Math.min(w, 1920), height: Math.max(h, 72) }); await O.waitForTimeout(1300);
    const n = await strips(); ok((n > 0) === want, w + 'x' + h + ' (auto): ' + (n ? 'stats shown' : 'no stats'));
  }
  await A.fill('#sW', '756'); await A.press('#sW', 'Tab'); await A.fill('#sH', '259'); await A.press('#sH', 'Tab');
  await A.selectOption('#sPlayers', 'always'); await O.waitForTimeout(1300); ok(await strips() > 0, '756x259 with Always: stats shown');
  await A.selectOption('#sPlayers', 'off'); await A.fill('#sW', '1920'); await A.press('#sW', 'Tab'); await A.fill('#sH', '1080'); await A.press('#sH', 'Tab'); await O.waitForTimeout(1300);
  ok(await strips() === 0, '1920x1080 with Off: no stats');
  console.log('dashboard default:', await A.$eval('#sPlayers', e => e.value));
  console.log('errors:', errs); await br.close();
})();
