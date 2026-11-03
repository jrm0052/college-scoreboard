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
global.NBA = nba; const lal = nba.events.find(e => e.id === '401909880'); lal.date = iso(-1);
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
    if (u.includes('nba/summary')) { const j = J('nba_sum.json'); j.boxscore.players.forEach(t => t.statistics.forEach(st => st.athletes.forEach(a => {
      if (a.athlete.id === '4433136') a.stats = a.stats.map(() => '0');
      if (a.athlete.id === '4683021') { a.didNotPlay = true; a.reason = 'COACH\'S DECISION'; a.stats = []; } }))); return JS(j); }
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
  await A.goto('http://site.test/college-scoreboard/'); await A.waitForTimeout(800); await reveal(A); await A.uncheck('#sHold');
  await A.click('#sportSeg [data-s="nba"]'); await A.waitForTimeout(500); await A.click('#addAll'); await A.waitForTimeout(300);
  await A.fill('#sRefresh', '10'); await A.press('#sRefresh', 'Tab'); await A.selectOption('#sPlays', 'all');
  
  for (const n of ['Walker Kessler', 'Deni Avdija']) { await A.fill('#plQ', n); await A.click('#plFind'); await A.waitForTimeout(400); await A.click('#plResults .plr'); await A.waitForTimeout(300); }
  await A.waitForTimeout(1500);
  await A.click('.ob[data-o="0"] [data-x="play"]');
  await A.click('#rdList li[data-key="nba:401909880"] [data-a="go"]'); await A.waitForTimeout(800);
  const strips = await A.$$eval('.ob[data-o="0"] .stage .g .pl .ps', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  ok(strips.some(t => /Kessler.*Season avg.*PPG/i.test(t)), 'no minutes yet -> season: ' + strips.find(t => /Kessler/.test(t)));
  ok(strips.some(t => /Avdija.*DNP · Season avg.*PPG/i.test(t)), 'DNP -> season with DNP tag: ' + strips.find(t => /Avdija/.test(t)));
  // scoring play: Lakers score, then watch the drop animation through many redraws
  const O = await ctx.newPage(); O.on('pageerror', e => errs.push('out: ' + e.message)); await O.setViewportSize({ width: 1920, height: 1080 });
  await O.goto('http://site.test/college-scoreboard/#output'); await O.waitForTimeout(2000);
  const lal = global.NBA.events.find(e => e.id === '401909880'); lal.competitions[0].competitors.find(c => c.homeAway === 'home').score = '132';
  await O.waitForFunction(() => document.querySelector('.g .play'), null, { timeout: 15000 });
  const samples = [];
  for (let i = 0; i < 8; i++) {
    samples.push(await O.evaluate(() => { const el = document.querySelector('.g .play'); if (!el) return null; const m = getComputedStyle(el).transform; if (m === 'none') return 1; return +(+m.match(/matrix\(([^)]+)\)/)[1].split(',')[3]).toFixed(2); }));
    await O.evaluate(() => window.renderAll()); await O.waitForTimeout(60);
  }
  console.log('play animation clock across redraws:', samples.join(', '));
  const nums = samples.filter(x => typeof x === 'number');  // scaleY of the drop: 0 -> 1
  ok(nums.every((x, i) => i === 0 || x >= nums[i - 1]), 'scoring-play drop never restarts on redraw');
  const d = await O.evaluate(() => { const e = document.querySelector('.g .bump .sc'); return e ? e.style.animationDelay : 'none'; });
  await O.waitForTimeout(400); await O.evaluate(() => window.renderAll());
  const d2 = await O.evaluate(() => { const e = document.querySelector('.g .bump .sc'); return e ? e.style.animationDelay : 'none'; });
  ok(parseFloat(d2) < parseFloat(d), 'score flash picks up where it was after a redraw (delay ' + d + ' -> ' + d2 + ')');
  await O.screenshot({ path: OUT + '/t9_play.png' });
  console.log('errors:', errs); await br.close();
})();
