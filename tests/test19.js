// Up next (preview) with cueing, and the ESPN data health light
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
const seen = {}; let MODE = "ok";
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
    if (u.includes('basketball/nba/scoreboard')) { if (MODE === 'down') return r.fulfill({ status: 503, body: 'x', headers: { 'access-control-allow-origin': '*' } }); if (MODE === 'weird') return JS({ sports: [] }); return JS(nba); }
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
  await A.fill('#sRefresh', '10'); await A.press('#sRefresh', 'Tab');
  await A.fill('#sPer', '1'); await A.press('#sPer', 'Tab'); await A.fill('#sSecs', '120'); await A.press('#sSecs', 'Tab');
  await A.click('#sportSeg [data-s="nba"]'); await A.waitForTimeout(600); await A.click('#addAll'); await A.waitForTimeout(600);
  const nx = () => A.evaluate(() => { const o = document.querySelector('.ob[data-o="0"]'); return { hidden: o.querySelector('.nx').hidden, lbl: o.querySelector('.nxl').textContent, txt: o.querySelector('.nxt').textContent, info: o.querySelector('.info').textContent, games: o.querySelectorAll('.nxs .g').length }; });
  let v = await nx();
  ok(!v.hidden && /^Page 2 of 4/.test(v.txt) && /Page 1 of 4/.test(v.info) && v.games === 1, 'Up next shows page 2 with its game: ' + v.txt + ' | ' + v.info);
  await A.click('.ob[data-o="0"] [data-x="cnext"]'); await A.click('.ob[data-o="0"] [data-x="cnext"]'); v = await nx();
  ok(/cued/.test(v.lbl) && /^Page 4 of 4/.test(v.txt), 'cue page 4: ' + v.lbl + ' / ' + v.txt);
  await A.click('.ob[data-o="0"] [data-x="cnext"]'); v = await nx();
  ok(/^Page 2 of 4/.test(v.txt) && !/cued/.test(v.lbl), 'cue skips the on-air page and wraps back to normal order: ' + v.txt);
  await A.click('.ob[data-o="0"] [data-x="cprev"]'); await A.click('.ob[data-o="0"] .nxb [data-x="take"]'); await A.waitForTimeout(300); v = await nx();
  ok(/Page 4 of 4/.test(v.info) && /^Page 1 of 4/.test(v.txt) && !/cued/.test(v.lbl), 'Take puts the cued page on air: ' + v.info + ' | next ' + v.txt);
  await A.click('.ob[data-o="0"] [data-x="cnext"]'); await A.click('.ob[data-o="0"] [data-x="next"]'); await A.waitForTimeout(300); v = await nx();
  ok(/Page 2 of 4/.test(v.info), 'Next › also takes the cued page: ' + v.info);
  await A.click('.ob[data-o="0"] .nxs'); await A.waitForTimeout(300); v = await nx();
  ok(/Page 3 of 4/.test(v.info), 'clicking the Up next picture takes it: ' + v.info);
  await A.screenshot({ path: OUT + '/t19_upnext.png' });
  // health light
  const feed = () => A.evaluate(() => ({ cls: document.getElementById('feed').className, txt: document.getElementById('feedTxt').textContent, toast: (document.getElementById('toast') || {}).textContent || '' }));
  let f = await feed(); ok(/\bok\b/.test(f.cls) && /ESPN data \d+ sec old/.test(f.txt), 'green light with data age: ' + f.txt);
  MODE = 'down'; await A.evaluate(() => window.__ageData(200)); await A.waitForTimeout(300);
  f = await feed(); ok(/\bdown\b/.test(f.cls) && /3 min 20 sec|3 min/.test(f.txt), 'red when data is old: ' + f.txt);
  ok(/stopped updating/.test(f.toast), 'warning toast: ' + f.toast);
  const games = await A.$$eval('.ob[data-o="0"] .stage .g', l => l.length); ok(games === 1, 'board keeps showing the last scores while ESPN is down');
  await A.screenshot({ path: OUT + '/t19_down.png', clip: { x: 0, y: 0, width: 1600, height: 120 } });
  MODE = 'weird'; await A.waitForTimeout(11500); f = await feed();
  ok(/can’t read/.test(f.txt), 'changed ESPN format is called out: ' + f.txt);
  MODE = 'ok'; await A.evaluate(() => window.__ageData(200)); for (let t = 0; t < 30 && !/\bok\b/.test((await feed()).cls); t++) await A.waitForTimeout(500); f = await feed();
  ok(/\bok\b/.test(f.cls) && /back/.test(f.toast), 'green again when ESPN returns: ' + f.txt + ' | ' + f.toast);
  console.log('errors:', errs); await br.close();
})();
