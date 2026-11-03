const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || require('os').tmpdir();
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const T = (id, short, abbr, rank, rec, score) => ({ score, curatedRank: { current: rank || 99 }, records: [{ type: 'total', summary: rec }],
  team: { id, shortDisplayName: short, abbreviation: abbr, location: short, color: '333333', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500/' + id + '.png' } });
const ev = (id, date, state, name, detail, away, home) => { away.homeAway = 'away'; home.homeAway = 'home';
  return { id, date, competitions: [{ status: { period: 3, type: { state, name, shortDetail: detail } }, competitors: [home, away], broadcasts: [{ names: ['ESPN'] }] }] }; };
const iso = h => new Date(Date.now() + h * 3600e3).toISOString();
const cfb = { events: [
  ev('51', iso(-1), 'in', 'STATUS_IN_PROGRESS', '8:01 - 3rd', T('2', 'Auburn', 'AUB', 18, '5-2', '24'), T('333', 'Alabama', 'ALA', 4, '6-1', '20')),
  ev('52', iso(-1), 'in', 'STATUS_IN_PROGRESS', '2:11 - 2nd', T('61', 'Georgia', 'UGA', 2, '7-0', '10'), T('57', 'Florida', 'FLA', null, '3-4', '7')),
  ev('53', iso(3), 'pre', 'STATUS_SCHEDULED', '', T('99', 'LSU', 'LSU', 9, '5-2', '0'), T('245', 'Texas A&M', 'TA&M', 7, '6-1', '0')),
  ev('54', iso(-3), 'post', 'STATUS_FINAL', 'Final', T('8', 'Arkansas', 'ARK', null, '3-5', '17'), T('142', 'Missouri', 'MIZ', 20, '6-2', '31')),
  ev('55', iso(-3), 'post', 'STATUS_FINAL', 'Final/OT', T('2633', 'Tennessee', 'TENN', 11, '5-2', '27'), T('238', 'Vanderbilt', 'VAN', null, '4-3', '24')),
]};
// in-memory stand-in for the Supabase table + publish function
const db = {}; const keys = {}; let rpcCalls = 0, stateWrites = 0, polls = 0;
async function supa(route) {
  const req = route.request(), u = new URL(req.url());
  const J = (o, st = 200) => route.fulfill({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (u.pathname === '/rest/v1/rpc/scoreboard_publish') {
    rpcCalls++; const b = JSON.parse(req.postData());
    if (keys[b.p_id] && keys[b.p_id] !== b.p_key) return J({ message: 'wrong control key for this board' }, 400);
    keys[b.p_id] = b.p_key; const r = db[b.p_id] || (db[b.p_id] = { id: b.p_id, ver: 0, state: {}, logo_ver: 0, logos: [], live: {} });
    if (b.p_live) r.live = b.p_live; if (b.p_state) { r.state = b.p_state; r.ver++; stateWrites++; } if (b.p_logos) { r.logos = b.p_logos; r.logo_ver++; }
    r.updated_at = new Date().toISOString() + Math.random(); return J(r.ver);
  }
  if (u.pathname === '/rest/v1/scoreboard_boards') {
    polls++; const id = u.searchParams.get('id').replace('eq.', ''), cols = u.searchParams.get('select').split(',');
    const r = db[id]; return J(r ? [Object.fromEntries(cols.map(c => [c, r[c]]))] : []);
  }
  return J({}, 404);
}
(async () => {
  const b = await chromium.launch();
  const mk = async (vw) => { const ctx = await b.newContext({ viewport: vw }); await ctx.route('**/*', async r => { const u = r.request().url();
    if (u.startsWith('http://site.test/')) return r.fulfill({ contentType: 'text/html', body: HTML });
    if (u.includes('supabase.co')) return supa(r);
    if (u.includes('/rankings')) return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"rankings":[]}' });
    if (u.includes('site.api.espn.com')) return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(u.includes('football') ? cfb : { events: [] }) });
    if (u.includes('espncdn')) { const id = u.match(/(\d+)\.png/)[1]; return r.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="hsl(${(+id * 47) % 360},55%,55%)"/></svg>` }); }
    return r.abort(); }); return ctx; };
  const dash = await (await mk({ width: 1600, height: 1000 })).newPage(); const errs = []; dash.on('pageerror', e => errs.push('dash: ' + e.message));
  await dash.goto('http://site.test/college-scoreboard/'); await dash.waitForTimeout(1200);
  await dash.click('#addAll'); await dash.waitForTimeout(300);
  await dash.click('.ob[data-o="0"] [data-x="link"]'); const link = await dash.inputValue('#linksList input[data-out="0"]');
  console.log('short link:', link, '(' + link.length + ' chars)');
  await dash.waitForTimeout(1500);
  console.log('online bar:', await dash.textContent('#onlineTxt'));
  await dash.waitForTimeout(500); const code = link.split('?')[1].split('/')[0]; db[code].state = {}; db[code].ver = 0; console.log('board wiped while dashboard open');
  // the "DAK computer": separate browser profile, nothing shared with the dashboard
  const dak = await (await mk({ width: 1920, height: 1080 })).newPage(); dak.on('pageerror', e => errs.push('dak: ' + e.message));
  await dak.goto(link); await dak.waitForTimeout(34000);
  await dak.screenshot({ path: OUT + '/dak_p1.png' });
  const pageOnDak = async () => dak.evaluate(() => document.querySelector('.board .dots i.on') ? [...document.querySelectorAll('.board .dots i')].findIndex(i => i.classList.contains('on')) : document.querySelectorAll('.board > .grid .g').length);
  console.log('DAK shows games on page 1:', await pageOnDak());
  await dash.click('.ob[data-o="0"] [data-x="next"]'); await dak.waitForTimeout(3000);
  console.log('after dashboard Next, DAK games on page:', await pageOnDak());
  await dak.screenshot({ path: OUT + '/dak_p2.png' });
  // dashboard closes: DAK should keep running on its own
  await dash.close(); await dak.waitForTimeout(16000);
  console.log('dashboard closed; DAK still rendering games:', await pageOnDak());
  const ghost = await (await mk({ width: 800, height: 450 })).newPage(); await ghost.goto('http://site.test/college-scoreboard/?zzzzzz/1'); await ghost.waitForTimeout(2500);
  console.log('unknown board shows:', await ghost.textContent('.board .empty'));
  db['qjpcj2'] = {id:'qjpcj2', ver:0, state:{}, logo_ver:0, logos:[], live:{pages:[0,4,4,3],paused:[false,false,false,false]}, updated_at:'x'};
  const old = await (await mk({ width: 800, height: 450 })).newPage(); await old.goto('http://site.test/college-scoreboard/?qjpcj2/1'); await old.waitForTimeout(2500);
  console.log('empty board shows:', await old.textContent('.board .empty'));
  console.log('panel colour:', await dak.evaluate(() => getComputedStyle(document.querySelector('.g .pn')).backgroundColor));
  console.log('rpc calls', rpcCalls, 'state writes', stateWrites, 'polls', polls);
  console.log('errors:', errs); await b.close();
})();
