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
  const A = await ctx.newPage(); A.on('pageerror', e => errs.push(e.message));
  await A.goto('http://site.test/college-scoreboard/'); await A.waitForTimeout(900);
  await A.click('#sportSeg [data-s="cfb"]'); await A.waitForTimeout(600); await A.click('#addAll'); await A.waitForTimeout(500);
  ok(await A.$eval('#skipOn', e => e.checked) && /Auburn/.test(await A.textContent('#skipEdit')), 'on by default for Auburn: ' + await A.textContent('#skipEdit'));
  const shown = async () => A.$$eval('.ob[data-o="0"] .stage .g .nm', l => l.map(x => x.textContent).join(','));
  ok(!/AUBURN|Auburn/i.test(await shown()) && (await A.$$eval('#rdList li[data-key]', l => l.length)) === 3, 'Auburn game stays in the rundown but not on the board: ' + await shown());
  ok(/Left out · our game/.test(await A.textContent('#rdList li[data-key="cfb:71"]')), 'rundown row marked');
  await A.screenshot({ path: OUT + '/s_on.png' });
  await A.click('#skipOn'); await A.waitForTimeout(400);
  ok(/Auburn/i.test(await shown()), 'turned off: Auburn back on the board');
  await A.click('#skipOn'); await A.waitForTimeout(300);
  // pages count drops and the output window agrees
  const O = await ctx.newPage(); await O.setViewportSize({ width: 1920, height: 1080 }); await O.goto('http://site.test/college-scoreboard/#output'); await O.waitForTimeout(1500);
  ok(!/Auburn/i.test(await O.$$eval('.g .nm', l => l.map(x => x.textContent).join(','))), 'output window leaves it out too');
  await A.click('#skipEdit'); await A.waitForTimeout(600); await A.fill('#skipFind', 'Georgia (UGA)'); await A.click('#skipAdd'); await A.waitForTimeout(400);
  ok(/Auburn, Georgia/.test(await A.textContent('#skipEdit')) && !/Georgia/i.test(await shown()), 'added Georgia: ' + await shown());
  console.log('errors:', errs); await br.close();
})();
