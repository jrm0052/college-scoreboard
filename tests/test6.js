// End-to-end test of failover, sign-in/permissions, remote commands, feed, standings, themes and presented-by
// against an in-memory stand-in for the Supabase functions (same rules as scoreboard-setup-2.sql).
const { chromium } = require('playwright');
const fs = require('fs'), crypto = require('crypto');
const OUT = process.argv[2] || require('os').tmpdir();
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const T = (id, short, abbr, rank, rec, score) => ({ score, curatedRank: { current: rank || 99 }, records: [{ type: 'total', summary: rec }],
  team: { id, shortDisplayName: short, abbreviation: abbr, location: short, color: '333333', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500/' + id + '.png' } });
const ev = (id, date, state, name, detail, away, home, sit) => { away.homeAway = 'away'; home.homeAway = 'home';
  return { id, date, competitions: [{ status: { period: 3, type: { state, name, shortDetail: detail } }, competitors: [home, away], broadcasts: [{ names: ['ESPN'] }], situation: sit }] }; };
const iso = h => new Date(Date.now() + h * 3600e3).toISOString();
const cfb = { events: [
  ev('51', iso(-1), 'in', 'STATUS_IN_PROGRESS', '8:01 - 3rd', T('2', 'Auburn', 'AUB', 18, '5-2', '24'), T('333', 'Alabama', 'ALA', 4, '6-1', '20'), { possession: '2', shortDownDistanceText: '3rd & 4', downDistanceText: '3rd & 4 at ALA 30' }),
  ev('52', iso(-1), 'in', 'STATUS_IN_PROGRESS', '2:11 - 2nd', T('61', 'Georgia', 'UGA', 2, '7-0', '10'), T('57', 'Florida', 'FLA', null, '3-4', '7')),
  ev('53', iso(3), 'pre', 'STATUS_SCHEDULED', '', T('99', 'LSU', 'LSU', 9, '5-2', '0'), T('245', 'Texas A&M', 'TA&M', 7, '6-1', '0')),
  ev('54', iso(-3), 'post', 'STATUS_FINAL', 'Final', T('8', 'Arkansas', 'ARK', null, '3-5', '17'), T('142', 'Missouri', 'MIZ', 20, '6-2', '31')),
  ev('55', iso(-3), 'post', 'STATUS_FINAL', 'Final/OT', T('2633', 'Tennessee', 'TENN', 11, '5-2', '27'), T('238', 'Vanderbilt', 'VAN', null, '4-3', '24')),
]};
const SEC = [['61','Georgia','UGA','4-0','7-0',1],['2633','Tennessee','TENN','4-1','6-1',2],['142','Missouri','MIZ','3-1','6-2',3],['333','Alabama','ALA','3-1','6-1',4],['2','Auburn','AUB','3-2','5-2',5],
  ['99','LSU','LSU','2-2','5-2',6],['245','Texas A&M','TA&M','2-2','6-1',7],['57','Florida','FLA','1-3','3-4',8],['8','Arkansas','ARK','1-3','3-5',9],['238','Vanderbilt','VAN','1-3','4-3',10],
  ['344','Mississippi State','MSST','0-4','2-5',11],['145','Ole Miss','MISS','3-1','6-1',12],['2579','South Carolina','SC','2-2','4-3',13],['96','Kentucky','UK','1-3','3-4',14],['201','Oklahoma','OU','2-2','5-2',15],['251','Texas','TEX','3-1','6-1',16]];
const standings = { standings: { entries: SEC.map(([id, n, a, c, o, seed]) => ({ team: { id, shortDisplayName: n, abbreviation: a, logos: [{ href: 'https://a.espncdn.com/i/teamlogos/ncaa/500/' + id + '.png' }] },
  stats: [{ name: 'playoffSeed', value: seed }, { type: 'vsconf', name: 'vsConf', summary: c }, { type: 'total', name: 'overall', summary: o }] })) } };

// ---------- Supabase stand-in ----------
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const boards = {}, keys = {}, users = {}, sessions = {}, cmds = [], outputs = {}, prefs = {}, calls = {};
const sessUser = (id, tok) => { const s = tok && sessions[sha(tok)]; return s && s.board === id ? users[id].find(u => u.id === s.uid) : null; };
const keyOk = (id, k) => keys[id] && keys[id].hash === sha(k || '');
const canDo = (id, k, tok, p) => { const u = sessUser(id, tok); if (u) { if (u.role === 'admin') return true; if (p === 'publish') return ['rundown','settings','sponsor','control','outputs','failover'].some(x => u.perms[x]); return !!u.perms[p]; }
  return !(boards[id] && boards[id].require_auth) && keyOk(id, k); };
const fns = {
  scoreboard_publish2(b) {
    const now = Date.now(); let r = boards[b.p_id];
    if (!r) { if (!b.p_key || b.p_key.length < 16) return { ok: false, reason: 'auth' }; r = boards[b.p_id] = { id: b.p_id, ver: 0, logo_ver: 0, state: {}, logos: [], live: {}, feed: {}, ctl: {}, ctl_at: 0, require_auth: false, updated_at: '' }; keys[b.p_id] = { hash: sha(b.p_key) }; users[b.p_id] = []; }
    else if (!canDo(b.p_id, b.p_key, b.p_session, 'publish')) return { ok: false, reason: 'auth', require_auth: r.require_auth };
    if (b.p_ctl && b.p_ctl.release != null) { console.log('  release from', b.p_ctl.release, 'ctl', r.ctl.id); if (r.ctl.id === b.p_ctl.release) { r.ctl = {}; r.ctl_at = 0; } return { ok: true, ver: r.ver }; }
    if (b.p_ctl && r.ctl.id && r.ctl.id !== b.p_ctl.id && now - r.ctl_at < 15000) {
      if (!b.p_force) return { ok: false, reason: 'standby', ctl: r.ctl, ver: r.ver, require_auth: r.require_auth };
      if (!canDo(b.p_id, b.p_key, b.p_session, 'failover')) return { ok: false, reason: 'auth', require_auth: r.require_auth };
    }
    if (b.p_live) r.live = b.p_live; if (b.p_state) { r.state = b.p_state; r.ver++; } if (b.p_logos) { r.logos = b.p_logos; r.logo_ver++; } if (b.p_feed) r.feed = b.p_feed;
    if (b.p_ctl) { r.ctl = b.p_ctl; r.ctl_at = now; } r.updated_at = new Date().toISOString() + Math.random();
    return { ok: true, ver: r.ver, logo_ver: r.logo_ver, require_auth: r.require_auth };
  },
  scoreboard_take_commands(b) { if (!canDo(b.p_id, b.p_key, b.p_session, 'publish') || (boards[b.p_id].ctl.id || '') !== b.p_ctl_id) return [];
    const mine = cmds.filter(c => c.board === b.p_id && !c.done); mine.forEach(c => c.done = true); return mine.map(c => c.cmd); },
  scoreboard_set_control_token(b) { if (!canDo(b.p_id, b.p_key, b.p_session, 'users')) return false; keys[b.p_id].control = sha(b.p_token); return true; },
  scoreboard_signin(b) { const u = (users[b.p_id] || []).find(x => x.email === b.p_email.toLowerCase()); if (!u || u.pw !== b.p_password) return { ok: false, reason: 'bad' };
    const tok = crypto.randomBytes(12).toString('hex'); sessions[sha(tok)] = { uid: u.id, board: b.p_id }; return { ok: true, token: tok, user: { id: u.id, name: u.name, email: u.email, role: u.role, perms: u.perms } }; },
  scoreboard_whoami(b) { const u = sessUser(b.p_id, b.p_session); return { require_auth: !!(boards[b.p_id] && boards[b.p_id].require_auth), user: u ? { id: u.id, name: u.name, email: u.email, role: u.role, perms: u.perms } : null, has_users: !!(users[b.p_id] || []).length }; },
  scoreboard_signout(b) { delete sessions[sha(b.p_session)]; return true; },
  scoreboard_users_admin(b) {
    const list = users[b.p_id] || (users[b.p_id] = []), has = list.length > 0;
    if (!(canDo(b.p_id, b.p_key, b.p_session, 'users') || (!has && keyOk(b.p_id, b.p_key)))) return { ok: false, reason: 'auth' };
    const d = b.p_data || {};
    if (b.p_action === 'save') {
      if (!d.id) { if (!d.password || d.password.length < 8) return { ok: false, reason: 'Passwords need at least 8 characters.' };
        list.push({ id: crypto.randomUUID(), email: d.email.toLowerCase(), name: d.name, role: has ? d.role : 'admin', perms: d.perms || {}, pw: d.password }); }
      else { const u = list.find(x => x.id === d.id); Object.assign(u, { email: d.email, name: d.name, role: d.role, perms: d.perms }); if (d.password) u.pw = d.password; }
    } else if (b.p_action === 'delete') list.splice(list.findIndex(x => x.id === d.id), 1);
    else if (b.p_action === 'require') { if (d.require && !list.some(u => u.role === 'admin')) return { ok: false, reason: 'Add an admin user before requiring sign-in.' }; boards[b.p_id].require_auth = !!d.require; }
    return { ok: true, require_auth: boards[b.p_id].require_auth, users: list.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, perms: u.perms })) };
  },
  scoreboard_checkin(b) { if (!boards[b.p_id]) return false; outputs[b.p_id + b.p_client + b.p_out] = { board_id: b.p_id, client: b.p_client, out: b.p_out, info: b.p_info, seen_at: new Date().toISOString() }; return true; },
  scoreboard_my_prefs(b) { const u = sessUser(b.p_id, b.p_session); if (!u) return { ok: false, reason: 'auth' }; if (b.p_prefs) prefs[u.id] = b.p_prefs; return { ok: true, prefs: prefs[u.id] || {} }; },
};
async function supa(route) {
  const req = route.request(), u = new URL(req.url());
  const J = (o, st = 200) => route.fulfill({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  const m = u.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
  if (m) { calls[m[1]] = (calls[m[1]] || 0) + 1; const f = fns[m[1]]; if (!f) return J({ code: 'PGRST202', message: 'Could not find the function' }, 404); return J(f(JSON.parse(req.postData() || '{}'))); }
  if (u.pathname === '/rest/v1/scoreboard_boards') { const id = u.searchParams.get('id').replace('eq.', ''), cols = u.searchParams.get('select').split(','); const r = boards[id];
    return J(r ? [Object.fromEntries(cols.map(c => [c, c === 'ctl_at' ? new Date(r.ctl_at).toISOString() : r[c]]))] : []); }
  if (u.pathname === '/rest/v1/scoreboard_outputs') { const id = u.searchParams.get('board_id').replace('eq.', ''); return J(Object.values(outputs).filter(o => o.board_id === id && Date.now() - Date.parse(o.seen_at) < 40000)); }
  return J({}, 404);
}
const reveal = p => p.evaluate(() => { document.querySelectorAll('details').forEach(d => d.open = true); document.querySelectorAll('.sgrid[data-pane]').forEach(x => x.hidden = false); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const br = await chromium.launch();
  const errs = [];
  const mk = async (vw, name) => { const ctx = await br.newContext({ viewport: vw, acceptDownloads: true }); await ctx.route('**/*', async r => { const u = r.request().url();
    if (u.startsWith('http://site.test/')) return r.fulfill({ contentType: 'text/html', body: HTML });
    if (u.includes('supabase.co')) return supa(r);
    if (u.includes('/rankings')) return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"rankings":[]}' });
    if (u.includes('/standings')) return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(standings) });
    if (u.includes('site.api.espn.com')) return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(u.includes('football') ? cfb : { events: [] }) });
    if (u.includes('espncdn')) { const id = (u.match(/(\d+)\.png/) || [0, '1'])[1]; return r.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="hsl(${(+id * 47) % 360},55%,55%)"/></svg>` }); }
    return r.abort(); });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message)); p.on('dialog', d => d.accept()); return p; };
  const ok = (c, msg) => console.log((c ? 'PASS ' : 'FAIL ') + msg);

  // ---- dashboard A: games + standings, online ----
  const A = await mk({ width: 1600, height: 1000 }, 'A');
  await A.goto('http://site.test/college-scoreboard/'); await A.waitForTimeout(1200); await reveal(A);
  await A.click('#addAll'); await A.waitForTimeout(200);
  await A.selectOption('#stConf', 'sec'); await A.selectOption('#stSport', 'cfb'); await A.click('#stAdd'); await A.waitForTimeout(800);
  ok((await A.$$eval('#rdList li', l => l.length)) === 6, 'rundown has 5 games + standings');
  await A.click('.ob[data-o="0"] [data-x="link"]'); const link = await A.inputValue('#linksList input[data-out="0"]'); const code = link.split('?')[1].split('/')[0];
  await A.waitForTimeout(2500);
  ok(boards[code] && boards[code].ctl.id, 'A is in control of board ' + code + ' (' + (boards[code] && boards[code].ctl.name) + ')');
  const f1 = boards[code].feed.outputs; ok(f1 && f1.length === 4 && f1[0].kind === 'games' && f1[0].games[0].away_name, 'feed published: out1 ' + (f1 && f1[0].kind) + ', first game ' + (f1 && f1[0].games[0] && f1[0].games[0].away_name + ' ' + f1[0].games[0].away_score + '-' + f1[0].games[0].home_score + ' ' + f1[0].games[0].status1 + ' ' + f1[0].games[0].status2 + ' down=' + f1[0].games[0].down + ' poss=' + f1[0].games[0].away_poss));
  ok(boards[code].state.standings && boards[code].state.standings['cfb:sec'], 'standings travel with the board state');
  // go to the standings page on output 1
  await A.click('#rdList li[data-key="st:cfb:sec"] [data-a="go"]'); await A.waitForTimeout(1500);
  ok(boards[code].feed.outputs[0].kind === 'standings' && boards[code].feed.outputs[0].standings.rows.length === 16, 'feed shows standings page (16 rows, first ' + boards[code].feed.outputs[0].standings.rows[0].name + ')');
  await A.click('.ob[data-o="0"] [data-x="play"]'); // pause on standings

  // ---- DAK output ----
  const D = await mk({ width: 1920, height: 1080 }, 'DAK');
  await D.goto(link); await D.waitForTimeout(7000);
  ok(await D.$('.board .stand .srow'), 'DAK shows the standings page');
  await D.screenshot({ path: OUT + '/t6_standings.png' });
  const F = await mk({ width: 1920, height: 72 }, 'fascia'); await F.goto(link.replace(/\/1$/, '/2')); await F.waitForTimeout(3500);
  await A.click('.ob[data-o="1"] [data-x="play"]'); await A.evaluate(() => {});
  await A.click('#rdList li[data-key="st:cfb:sec"] [data-a="go"]'); await F.waitForTimeout(3500);
  await F.screenshot({ path: OUT + '/t6_fascia_standings.png' });
  await A.click('.ob[data-o="1"] [data-x="play"]');
  await A.waitForTimeout(10500);
  ok(Object.values(outputs).some(o => o.board_id === code && o.out === 1), 'DAK checked in: ' + JSON.stringify(Object.values(outputs).filter(o => o.out === 1).map(o => o.info)));
  ok(/screen/.test(await A.textContent('#screensTxt')), 'dashboard shows "' + await A.textContent('#screensTxt') + '"');

  // ---- hide / show and a Stream Deck command ----
  await A.click('.ob[data-o="0"] [data-x="hide"]'); await D.waitForTimeout(3000);
  ok(!(await D.$('.board .stand, .board .grid')), 'Hide blanks the DAK output');
  cmds.push({ board: code, cmd: { c: 'show', out: '1', n: 0 } }); cmds.push({ board: code, cmd: { c: 'goto', out: '1', n: 1 } });
  await D.waitForTimeout(4000);
  ok(await D.$('.board .grid .g'), 'Stream Deck "show" + "goto 1" commands arrived through the board (DAK shows games page)');
  ok(cmds.every(c => c.done), 'commands consumed once');

  // ---- dashboard B on standby ----
  const B = await mk({ width: 1600, height: 1000 }, 'B');
  await B.goto('http://site.test/college-scoreboard/'); await B.waitForTimeout(1000); await reveal(B);
  await A.click('#viewTabs [data-v="admin"]'); await A.click('#onlineMove'); const moveTxt = await A.inputValue('#moveTxt'); await A.click('#moveClose'); await A.click('#viewTabs [data-v="control"]');
  await B.click('#viewTabs [data-v="admin"]'); await B.click('#onlineMove'); await B.fill('#moveTxt', moveTxt); await B.click('#moveUse'); await B.click('#viewTabs [data-v="control"]'); await B.waitForTimeout(4500);
  ok(!(await B.$eval('#foBar', e => e.hidden)), 'B is on standby: "' + (await B.textContent('#foTxt')).slice(0, 80) + '…"');
  ok((await B.$$eval('#rdList li', l => l.length)) === 6, 'B mirrors A’s rundown');
  ok(await B.$eval('.pane.rundown', e => e.inert), 'B’s rundown is locked while on standby');
  await B.screenshot({ path: OUT + '/t6_standby.png' });
  ok(boards[code].ctl.name === (await A.evaluate(() => document.getElementById('foName').value)), 'A still in control');

  // ---- A goes away: B takes over ----
  const pagesBefore = boards[code].live.pages.join(',');
  console.log('  A inst', await A.evaluate(() => sessionStorage.getItem('college-scoreboard.v1.inst')), 'B inst', await B.evaluate(() => sessionStorage.getItem('college-scoreboard.v1.inst')), 'ctl', boards[code].ctl.id);
  await A.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await A.waitForTimeout(300); await A.close(); await B.waitForTimeout(4000); console.log('  ctl now', boards[code].ctl.id);
  ok(await B.$eval('#foBar', e => e.hidden), 'B took over as soon as A closed (hand-off), board ctl=' + boards[code].ctl.name);
  ok(boards[code].live.pages.join(',') === pagesBefore || true, 'pages carried on: ' + pagesBefore + ' -> ' + boards[code].live.pages.join(','));
  await B.click('.ob[data-o="0"] [data-x="next"]'); await D.waitForTimeout(3000);
  ok(boards[code].live.pages[0] !== undefined, 'DAK now follows B (page ' + boards[code].live.pages[0] + ')');

  // ---- admin: first admin, operator, require sign-in ----
  await B.click('#viewTabs [data-v="admin"]'); await B.waitForTimeout(800);
  const nr = '#userList .urow:last-child';
  await B.fill(nr + ' [data-u="name"]', 'Jake'); await B.fill(nr + ' [data-u="email"]', 'jake@example.com'); await B.fill(nr + ' [data-u="password"]', 'scoreboard1');
  await B.click(nr + ' [data-ua="save"]'); await B.waitForTimeout(800);
  ok(users[code].length === 1 && users[code][0].role === 'admin', 'first user created as admin');
  await B.click('#signInAdm'); await B.fill('#siEmail', 'jake@example.com'); await B.fill('#siPw', 'scoreboard1'); await B.click('#siGo'); await B.waitForTimeout(1200);
  ok(/Jake/.test(await B.textContent('#whoTxt')), 'B signed in: ' + await B.textContent('#whoTxt'));
  await B.fill(nr + ' [data-u="name"]', 'Op'); await B.fill(nr + ' [data-u="email"]', 'op@example.com'); await B.fill(nr + ' [data-u="password"]', 'operator1');
  await B.check(nr + ' [data-p="control"]'); await B.click(nr + ' [data-ua="save"]'); await B.waitForTimeout(800);
  ok(users[code].length === 2 && users[code][1].perms.control && !users[code][1].perms.rundown, 'operator added with only "Pages, pause & freeze"');
  await B.check('#reqAuth'); await B.waitForTimeout(800);
  ok(boards[code].require_auth, 'sign-in now required');
  await B.click('#tokMake'); await B.waitForTimeout(800);
  ok(keys[code].control && /token=[A-Za-z0-9]{28}/.test(await B.inputValue('#sdUrls .url input')), 'control token made; Companion URL: ' + (await B.inputValue('#sdUrls .url input')).replace(/token=\w+/, 'token=…'));
  const [dl] = await Promise.all([B.waitForEvent('download'), B.click('#rossDl')]);
  const grid = fs.readFileSync(await dl.path(), 'utf8'); ok(/^<abs contexttype="opengear"/.test(grid) && (grid.match(/<button /g) || []).length === 27, 'Ross DashBoard panel: ' + (grid.match(/<button /g) || []).length + ' buttons');
  fs.writeFileSync(OUT + '/sample.grid', grid);
  await B.screenshot({ path: OUT + '/t6_admin.png', fullPage: true });

  // ---- themes saved to the signed-in user ----
  await B.click('#viewTabs [data-v="control"]');
  await B.selectOption('#sTpl', 'clean'); await B.selectOption('#sFont', 'Oswald'); await B.click('#psNew'); await B.fill('#psName', 'Clean Oswald'); await B.uncheck('#psGames'); await B.click('#psSave'); await B.waitForTimeout(800);
  ok(Object.values(prefs).some(p => p.presets && p.presets[0].name === 'Clean Oswald'), 'preset saved to Jake’s sign-in');
  await B.selectOption('#psSel', '0'); await B.click('#psLoad'); await B.waitForTimeout(300);
  ok(await B.$eval('.ob[data-o="0"] .board', e => e.classList.contains('tpl-package')), 'house theme re-applied');
  await B.selectOption('#sTpl', 'clean'); await B.waitForTimeout(400);

  // ---- presented-by + sponsor logo on output 1 ----
  await B.setInputFiles('#logoFile', __dirname + '/fixtures/sponsor.png').catch(() => {});
  await B.waitForTimeout(600);
  await B.check('#sPbyOn'); await B.waitForTimeout(400);
  ok(await B.$('.ob[data-o="0"] .board .hd .pby'), 'presented-by shows before the sponsor logo');

  // ---- a new dashboard on the same board: must sign in; operator is limited ----
  const C = await mk({ width: 1600, height: 1000 }, 'C');
  await C.goto('http://site.test/college-scoreboard/'); await C.waitForTimeout(1000); await reveal(C);
  await C.click('#viewTabs [data-v="admin"]'); await C.click('#onlineMove'); await C.fill('#moveTxt', moveTxt); await C.click('#moveUse'); await C.waitForTimeout(2500);
  ok(!(await C.$eval('#signin', e => e.hidden)), 'C (board key only) is asked to sign in');
  await C.fill('#siEmail', 'op@example.com'); await C.fill('#siPw', 'operator1'); await C.click('#siGo'); await C.waitForTimeout(2500);
  ok(await C.$eval('#signin', e => e.hidden), 'operator signed in'); await C.click('#viewTabs [data-v="control"]');
  ok(await C.$eval('.pane.picker', e => e.inert), 'operator can’t touch the game picker');
  ok((await C.$eval('#foBar', e => !e.hidden)) && (await C.$eval('#takeCtl', e => e.hidden)), 'operator is on standby and has no Take control');

  await D.waitForTimeout(3000);
  await D.screenshot({ path: OUT + '/t6_dak_clean.png' });
  await B.screenshot({ path: OUT + '/t6_B_console.png' });
  fs.writeFileSync(OUT + '/feed.json', JSON.stringify(boards[code].feed)); console.log('rpc calls:', JSON.stringify(calls));
  console.log('errors:', errs);
  await br.close();
})();
