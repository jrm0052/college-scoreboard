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
  await A.goto('http://site.test/college-scoreboard/'); await A.waitForTimeout(1000); await reveal(A);
  ok((await A.$$eval('#sportSeg button', b => b.map(x => x.textContent).join(' '))) === 'CFB MBB WBB BSB NFL NBA', 'six sports in the picker');
  await A.click('#sportSeg [data-s="nba"]'); await A.waitForTimeout(600);
  ok(await A.$eval('#chips [data-f="sec"]', e => e.hidden), 'college filters hidden for NBA');
  ok((await A.$$eval('#gameList .gl', l => l.length)) === 4, 'NBA games listed: ' + await A.textContent('#listCount'));
  await A.click('#addAll'); await A.waitForTimeout(300);
  await A.click('#sportSeg [data-s="nfl"]'); await A.waitForTimeout(600);
  await A.click('#gameList .gl:has-text("49ers")'); await A.waitForTimeout(300);
  // track players by name
  
  for (const n of ['Walker Kessler', 'Deni Avdija', 'Test Celtic', 'Fred Warner', 'Purdy']) {
    await A.fill('#plQ', n); await A.click('#plFind'); await A.waitForTimeout(400); await A.click('#plResults .plr'); await A.waitForTimeout(300);
  }
  await A.waitForTimeout(1500);
  ok((await A.$$eval('#plList .plrow', l => l.length)) === 5, 'tracking 5 players: ' + (await A.$$eval('#plList .plw', l => l.map(x => x.textContent))).join(' / '));
  const st = await A.evaluate(() => JSON.parse(localStorage.getItem('college-scoreboard.v1')).prefs.players.map(p => p.team).join(','));
  ok(st === 'nba-13,nba-22,nba-2,nfl-25,nfl-25', 'teams stored with league prefix: ' + st);
  // put the Lakers game on output 1 and look
  await A.click('.ob[data-o="0"] [data-x="play"]');
  const goKey = await A.$$eval('#rdList li[data-key]', l => l.map(x => x.dataset.key).find(k => k === 'nba:401909880'));
  await A.click('#rdList li[data-key="nba:401909880"] [data-a="go"]'); await A.waitForTimeout(900);
  const strips = await A.$$eval('.ob[data-o="0"] .stage .g .pl .ps', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  ok(strips.some(t => /Walker Kessler.*13.*PTS.*8.*REB/i.test(t)), 'Kessler game line under Lakers game: ' + strips.join(' || '));
  const pre = await A.$$eval('.ob[data-o="0"] .stage .g .pl .ps', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()).filter(t => /Celtic/.test(t)));
  ok(pre.length && /Season avg.*15\.8.*PPG/i.test(pre[0]), 'pre-game season averages: ' + pre);
  // standalone output 1 window at 1920x1080 (same browser, controlled by dashboard)
  const O = await ctx.newPage(); O.on('pageerror', e => errs.push('out: ' + e.message)); await O.setViewportSize({ width: 1920, height: 1080 });
  await O.goto('http://site.test/college-scoreboard/#output'); await O.waitForTimeout(2500);
  await O.screenshot({ path: OUT + '/t8_nba.png' });
  // NFL page
  await A.click('#rdList li[data-key="nfl:401873017"] [data-a="go"]'); await O.waitForTimeout(2000);
  const nflStrip = await O.$$eval('.g .pl .ps', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  ok(nflStrip.some(t => /Purdy.*27\/40.*288.*YDS/.test(t)) && nflStrip.some(t => /Warner.*13.*TKL/.test(t)), 'NFL lines: ' + nflStrip.join(' || '));
  ok(await O.$('.g .fb'), 'NFL possession football shows');
  await O.screenshot({ path: OUT + '/t8_nfl.png' });
  // fascia (output 2) alternates
  await A.click('#outTabs [data-o="1"]'); await A.selectOption('#sPlayers', 'always'); await A.click('#outTabs [data-o="0"]');
  const F = await ctx.newPage(); await F.setViewportSize({ width: 1920, height: 72 }); await F.goto('http://site.test/college-scoreboard/#output2'); await F.waitForTimeout(2500);
  await A.click('#rdList li[data-key="nba:401909880"] [data-a="go"]'); await F.waitForTimeout(1500);
  const has1 = !!(await F.$('.g .pl')); await F.waitForTimeout(6100); const has2 = !!(await F.$('.g .pl'));
  ok(has1 !== has2, 'fascia swaps between bottom team and player strip (' + has1 + ' → ' + has2 + ')');
  await F.screenshot({ path: OUT + '/t8_fascia_' + (has2 ? 'strip' : 'game') + '.png' });
  await F.waitForTimeout(6100); await F.screenshot({ path: OUT + '/t8_fascia_' + (!has2 ? 'strip' : 'game') + '.png' });
  // college find
  await A.fill('#plCollege', 'Auburn'); await A.click('#plCollegeFind'); await A.waitForTimeout(1500);
  ok(/Walker Kessler/.test(await A.textContent('#plResults')), 'school search finds: ' + (await A.textContent('#plResults .plrh')));
  // off switch
  await A.selectOption('#sPlayers', 'off'); await O.waitForTimeout(1500);
  ok(!(await O.$('.g .pl')), 'Player stats Off hides the strip');
  await A.selectOption('#sPlayers', 'auto');
  await A.screenshot({ path: OUT + '/t8_console.png' });
  const tvs = await A.evaluate(() => { const g = {}; document.querySelectorAll('#gameList .gl').forEach(() => {}); return null; });
  await A.click('#sportSeg [data-s="nba"]'); await A.waitForTimeout(600);
  const nets = await A.$$eval('#gameList .gl', l => l.map(x => x.querySelector('.tm').textContent.replace(/\s+/g,' ').trim().slice(0, 22) + ' => ' + (x.querySelector('.st').innerHTML.split('<br>')[2] || '(none)')));
  console.log('NBA networks:', nets.join(' | '));
  ok(await O.$$eval('.g .pl', l => l.every(x => getComputedStyle(x).animationName === 'none')), 'player strip has no replaying animation');
  console.log('feed sample:', await A.evaluate(() => JSON.stringify(buildFeedForTest ? 1 : 0)).catch(() => 'n/a'));
  console.log('errors:', errs); await br.close();
})();
