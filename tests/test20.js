// Two tracked players under one game: both strips fit side by side, nothing overlaps or gets cut
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
  await A.click('#sportSeg [data-s="nba"]'); await A.waitForTimeout(600); await A.click('#gameList .gl:has-text("Lakers")'); await A.waitForTimeout(300);
  for (const n of ['Walker Kessler', 'Deni Avdija']) { await A.fill('#plQ', n); await A.click('#plFind'); await A.waitForTimeout(400); await A.click('#plResults .plr'); await A.waitForTimeout(300); }
  await A.waitForTimeout(1500);
  // long names, the worst case for two strips side by side
  const longNames = ['Walker Kessler-Thompson', 'Deni Avdija-Antetokounmpo'];
  for (let k = 0; k < 2; k++) { const inp = A.locator('#plList .plrow input[data-f="label"]').nth(k); await inp.fill(longNames[k]); await inp.press('Tab'); }
  await A.waitForTimeout(500);
  const O = await ctx.newPage(); O.on('pageerror', e => errs.push('out: ' + e.message));
  for (const [w, h, per] of [[1920, 1080, 1], [1920, 1080, 2], [1280, 720, 1], [1920, 1080, 4], [1024, 768, 1], [960, 540, 2]]) {
    await A.fill('#sPer', String(per)); await A.press('#sPer', 'Tab'); await A.waitForTimeout(300);
    await O.setViewportSize({ width: w, height: h }); if (!O.url().includes('#output')) await O.goto('http://site.test/college-scoreboard/#output'); else await O.reload(); await O.waitForTimeout(2500);
    const r = await O.evaluate(() => [...document.querySelectorAll('.g .pl')].map(pl => {
      const s = [...pl.querySelectorAll('.ps')].map(x => x.getBoundingClientRect()), pr = pl.getBoundingClientRect();
      const nm = [...pl.querySelectorAll('.ps')].map(x => { const pt = x.querySelector('.pt'), sp = pt.querySelector('span'); return sp.scrollWidth > sp.clientWidth + 1 || pt.getBoundingClientRect().right > x.getBoundingClientRect().right + 1; });
      const pv = [...pl.querySelectorAll('.pv')].map(x => x.scrollWidth > x.clientWidth + 1 || x.getBoundingClientRect().width < 20);
      const overlap = s.some((a, i) => i && a.left < s[i - 1].right - 1);
      const outside = s.some(a => a.right > pr.right + 1 || a.left < pr.left - 1);
      return { n: s.length, overlap, outside, nameCut: nm.some(Boolean), statsCut: pv.some(Boolean), widths: s.map(a => Math.round(a.width)).join('/'), shown: [...pl.querySelectorAll('.ps')].map(x => x.querySelector('.pt span').textContent + ': ' + [...x.querySelectorAll('.pi:not(.drop)')].map(i => i.textContent).join(' ')).join(' | '), few: [...pl.querySelectorAll('.pv')].some(x => x.querySelectorAll('.pi:not(.drop)').length < 2) };
    }));
    const two = r.find(x => x.n === 2);
    ok(two && !two.overlap && !two.outside && !two.nameCut && !two.statsCut && !two.few, w + 'x' + h + ' ' + per + '/page, two players: ' + JSON.stringify(two));
    await O.screenshot({ path: OUT + '/t20_' + w + '_' + per + '.png' });
  }
  const names = ['Walker Kessler', 'Deni Avdija'];
  for (let k = 0; k < 2; k++) { const inp = A.locator('#plList .plrow input[data-f="label"]').nth(k); await inp.fill(names[k]); await inp.press('Tab'); }
  await A.fill('#sPer', '1'); await A.press('#sPer', 'Tab'); await O.setViewportSize({ width: 1920, height: 1080 }); await O.reload(); await O.waitForTimeout(2500);
  const norm = await O.evaluate(() => [...document.querySelectorAll('.g .pl .ps')].map(x => x.querySelector('.pt span').textContent + ': ' + [...x.querySelectorAll('.pi:not(.drop)')].map(i => i.textContent).join(' ')).join(' | '));
  ok(/^Walker Kessler: .*BLK \| Deni Avdija: .*3PT$/.test(norm), 'ordinary names keep full name and all stats: ' + norm);
  await O.screenshot({ path: OUT + '/t20_normal.png' });
  console.log('errors:', errs); await br.close();
})();
