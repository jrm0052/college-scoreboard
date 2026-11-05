// League logos in the header, games with our players grouped together, football pass/rush/rec leaders
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
  await A.goto('http://site.test/college-scoreboard/'); await A.waitForTimeout(900); await reveal(A);
  // NFL first (all games), then NBA (all games)
  await A.click('#sportSeg [data-s="nfl"]'); await A.waitForTimeout(600); await A.click('#addAll'); await A.waitForTimeout(300);
  await A.click('#sportSeg [data-s="nba"]'); await A.waitForTimeout(600); await A.click('#addAll'); await A.waitForTimeout(300);
  const keys = () => A.$$eval('#rdList li[data-key]', l => l.map(x => x.dataset.key));
  const before = await keys();
  // track a Celtic and a 49er
  for (const n of ['Test Celtic', 'Fred Warner']) { await A.fill('#plQ', n); await A.click('#plFind'); await A.waitForTimeout(400); await A.click('#plResults .plr'); await A.waitForTimeout(400); }
  await A.waitForTimeout(800);
  let k = await keys();
  const firstNba = k.findIndex(x => x.startsWith('nba:')), firstNfl = k.findIndex(x => x.startsWith('nfl:'));
  ok(k[firstNfl] === 'nfl:401873017' && k[firstNba] === 'nba:401909877', 'games with our players move to the front of their sport: NFL ' + k[firstNfl] + ', NBA ' + k[firstNba]);
  ok(firstNfl === 0 && k.slice(0, 12).every(x => x.startsWith('nfl:')), 'sports stay in the order added (NFL block, then NBA)');
  const restNfl = k.filter(x => x.startsWith('nfl:') && x !== 'nfl:401873017'), restBefore = before.filter(x => x.startsWith('nfl:') && x !== 'nfl:401873017');
  ok(JSON.stringify(restNfl) === JSON.stringify(restBefore), 'other games keep their order');
  // try to move a game above ours: it stays grouped
  await A.click('#rdList li[data-key="' + k[1] + '"] [data-a="up"]').catch(() => {}); await A.waitForTimeout(300);
  ok((await keys())[0] === 'nfl:401873017', 'our game stays at the front');
  await A.uncheck('#groupOurs'); await A.waitForTimeout(200);
  await A.click('#rdList li[data-key="' + (await keys())[1] + '"] [data-a="up"]').catch(() => {}); await A.waitForTimeout(300);
  ok((await keys())[0] !== 'nfl:401873017', 'switch off: operator order wins');
  await A.check('#groupOurs'); await A.waitForTimeout(300);
  ok((await keys())[0] === 'nfl:401873017', 'switch back on regroups');
  // header with sport label: NFL / NBA logo, college text
  await A.selectOption('#sHdMode', 'text'); await A.check('#sSportLabel'); await A.waitForTimeout(300);
  const O = await ctx.newPage(); O.on('pageerror', e => errs.push('out: ' + e.message)); await O.setViewportSize({ width: 1920, height: 1080 });
  await O.goto('http://site.test/college-scoreboard/#output'); await O.waitForTimeout(2500);
  const hd = () => O.evaluate(() => { const sp = document.querySelector('.board .hd .sp'); return sp ? { logo: !!sp.querySelector('img'), src: (sp.querySelector('img') || {}).src || '', text: sp.textContent } : null; });
  let h = await hd(); ok(h && h.logo && /leagues\/500\/nfl\.png/.test(h.src), 'NFL page header shows the NFL logo: ' + JSON.stringify(h));
  // football leaders under games without our players
  await A.click('#rdList li[data-key="nfl:401873017"] [data-a="go"]'); await O.waitForTimeout(2000);
  const strips = await O.$$eval('.g', l => l.map(g => ({ tm: [...g.querySelectorAll('.nm')].map(x => x.textContent).join('-'), fbl: g.querySelector('.ps.fbl') ? [...g.querySelectorAll('.ps.fbl .pi:not(.drop)')].map(x => x.textContent).join(' | ') : '', pl: g.querySelectorAll('.ps:not(.fbl)').length, over: [...g.querySelectorAll('.ps.fbl .pv')].some(v => v.scrollWidth > v.clientWidth + 1) })));
  console.log(JSON.stringify(strips));
  const sf = strips.find(x => /49ERS|FALCONS/i.test(x.tm)), other = strips.find(x => x.fbl);
  ok(sf && sf.pl >= 1 && !sf.fbl, 'game with our player shows our player, not leaders');
  ok(other && /PASS.*\d+ \| RUSH.*\d+ \| REC.*\d+/.test(other.fbl) && !other.over, 'other football games show pass / rush / rec leaders: ' + (other && other.fbl));
  await O.screenshot({ path: OUT + '/t21_nfl.png' });
  // NBA page header
  await A.click('#rdList li[data-key="' + k[firstNba] + '"] [data-a="go"]'); await O.waitForTimeout(2000);
  h = await hd(); ok(h && h.logo && /nba\.png/.test(h.src), 'NBA page header shows the NBA logo');
  await O.screenshot({ path: OUT + '/t21_nba.png' });
  // leaders off
  await A.uncheck('#sFbLeaders'); await A.click('#rdList li[data-key="nfl:401873017"] [data-a="go"]'); await O.waitForTimeout(2000);
  ok(!(await O.$('.ps.fbl')), 'Football leaders switch turns them off');
  console.log('errors:', errs); await br.close();
})();
