// Dashboard layout: Build/Show modes, rundown page headers with tally, drag to reorder, settings side panel, fascia text
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
const TT = (id, short, abbr, rank, score) => ({ score, curatedRank: { current: rank || 99 }, records: [{ type: 'total', summary: '5-2' }], team: { id, shortDisplayName: short, abbreviation: abbr, location: short, color: '333333', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500/' + id + '.png' } });
const EV = (id, a, h) => { a.homeAway = 'away'; h.homeAway = 'home'; return { id, date: new Date(Date.now() - 3600e3).toISOString(), competitions: [{ status: { period: 3, type: { state: 'in', name: 'STATUS_IN_PROGRESS', shortDetail: '8:01 - 3rd' } }, competitors: [h, a], broadcasts: [{ names: ['ESPN'] }] }] }; };
const CFB = { events: [EV('71', TT('2', 'Auburn', 'AUB', 18, '24'), TT('333', 'Alabama', 'ALA', 4, '20')), EV('72', TT('61', 'Georgia', 'UGA', 2, '10'), TT('57', 'Florida', 'FLA', null, '7')), EV('73', TT('99', 'LSU', 'LSU', 9, '3'), TT('245', 'Texas A&M', 'TA&M', 7, '0'))] };
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
    if (u.includes('college-football/scoreboard')) return JS(CFB);
    if (u.includes('/rankings')) return JS({ rankings: [] });
    if (u.includes('site.api.espn.com')) return JS({ events: [] });
    if (u.includes('espncdn')) { const id = (u.match(/\/(\w+)\.png/) || [0, '1'])[1]; return r.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="hsl(${(id.length * 97 + id.charCodeAt(0) * 13) % 360},55%,55%)"/></svg>` }); }
    return r.abort();
  });
  const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
  const A = await ctx.newPage(); A.on('pageerror', e => errs.push(e.message)); await A.setViewportSize({ width: 1600, height: 1000 });
  await A.goto('http://site.test/college-scoreboard/'); await A.waitForTimeout(900);
  await A.click('#sportSeg [data-s="nfl"]'); await A.waitForTimeout(600); await A.click('#addAll'); await A.waitForTimeout(800);
  // page headers + tally
  const hdrs = () => A.$$eval('#rdList li.pgh', l => l.map(h => [...h.children].map(c => c.textContent).filter(Boolean).join(' ')));
  let h = await hdrs(); ok(h.length === 3 && /^Page 1 NFL On air/.test(h[0]) && /^Page 2 NFL Up next/.test(h[1]), 'page headers with on air / up next: ' + h.join(' | '));
  await A.click('.ob[data-o="0"] [data-x="next"]'); await A.waitForTimeout(400); h = await hdrs();
  ok(/On air/.test(h[1]) && /Up next/.test(h[2]) && !/On air|Up next/.test(h[0]), 'tally follows the page: ' + h.join(' | '));
  ok(await A.$eval('#rdList li[data-key] .one .mt', e => /^PIT 16·NO 10$/.test(e.textContent)), 'one-line game row: ' + await A.textContent('#rdList li[data-key] .one'));
  // drag to reorder inside the sport
  const keys = () => A.$$eval('#rdList li[data-key]', l => l.map(x => x.dataset.key));
  const k0 = await keys();
  await A.dragAndDrop('#rdList li[data-key="' + k0[3] + '"]', '#rdList li[data-key="' + k0[0] + '"]', { targetPosition: { x: 40, y: 3 } }); await A.waitForTimeout(400);
  const k1 = await keys(); ok(k1[0] === k0[3] && k1[1] === k0[0], 'drag moves a game to the top: ' + k1.slice(0, 4).join(','));
  // settings side panel
  ok(!(await A.isVisible('#boardSettings')), 'board settings closed at start');
  await A.click('.ob[data-o="1"] [data-x="set"]'); await A.waitForTimeout(300);
  ok(await A.isVisible('#sPer') && /Output 2/.test(await A.textContent('#editingTxt')), 'Settings on Output 2 opens the panel for Output 2');
  const box = await A.$eval('#boardSettings', e => { const r = e.getBoundingClientRect(), o = document.querySelector('.outs').getBoundingClientRect(); return r.left >= o.right - 1; });
  ok(box, 'panel sits beside the outputs');
  await A.click('.ob[data-o="1"] [data-x="set"]'); await A.waitForTimeout(200); ok(!(await A.isVisible('#boardSettings')), 'Settings again closes it');
  // fascia says what's on it
  ok(/^Now/.test(await A.textContent('.ob[data-o="1"] .cur')) && !(await A.textContent('.ob[data-o="0"] .cur')), 'fascia shows the page in words: ' + await A.textContent('.ob[data-o="1"] .cur'));
  // show mode
  await A.click('#modeTabs [data-m="show"]'); await A.waitForTimeout(400);
  ok(!(await A.isVisible('#gameList')) && !(await A.isVisible('#buildBox')) && await A.isVisible('#rdList'), 'Show mode hides the picker and build tools');
  const cols = await A.$eval('#outs', e => getComputedStyle(e).gridTemplateColumns.split(' ').length); ok(cols === 2, 'outputs in a 2-column multiviewer');
  await A.reload(); await A.waitForTimeout(900); ok(await A.$eval('body', b => b.classList.contains('mode-show')), 'mode remembered after reload');
  await A.click('#modeTabs [data-m="build"]'); await A.waitForTimeout(200); ok(await A.isVisible('#gameList'), 'Build brings everything back');
  console.log('errors:', errs); await br.close();
})();
