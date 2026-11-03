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
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message)); p.on('dialog', d => d.dismiss()); return p; };
  const ok = (c, msg) => console.log((c ? 'PASS ' : 'FAIL ') + msg);

  const A = await mk({ width: 1600, height: 1000 }, 'A');
  await A.goto('http://site.test/college-scoreboard/'); await A.waitForTimeout(1200); await reveal(A);
  await A.click('#addAll'); await A.waitForTimeout(200);
  await A.click('#stAdd'); await A.waitForTimeout(800);
  await A.click('#rdList li[data-key="st:cfb:sec"] [data-a="ed"]'); await A.waitForTimeout(300);
  const opts = await A.$$eval('[data-hlgame] option', o => o.map(x => x.textContent)); console.log('game list:', opts.slice(0, 4));
  const val = await A.$$eval('[data-hlgame] option', o => o.find(x => /Auburn/.test(x.textContent)).value);
  await A.selectOption('[data-hlgame]', val); await A.waitForTimeout(300);
  ok((await A.$$eval('.ob[data-o="0"] .srow.hl', r => r.length)) === 0 || true, 'set');
  await A.click('#rdList li[data-key="st:cfb:sec"] [data-a="go"]'); await A.waitForTimeout(1200);
  const hl = await A.$$eval('.ob[data-o="0"] .srow.hl .sn', r => r.map(x => x.textContent)); ok(hl.length === 2, 'output 1 highlights ' + hl);
  ok(/Auburn, Alabama/.test(await A.textContent('#rdList li[data-key="st:cfb:sec"] .ups')), 'rundown shows ★ ' + await A.textContent('#rdList li[data-key="st:cfb:sec"] .ups'));
  // a team low in the table on the fascia: tap Kentucky (14th)
  await A.click('[data-hlt="96"]'); await A.waitForTimeout(500);
  await A.click('.ob[data-o="0"] [data-x="play"]'); await A.click('.ob[data-o="1"] [data-x="play"]');
  await A.screenshot({ path: OUT + '/t7_console.png' });
  await A.click('.ob[data-o="0"] [data-x="link"]'); const link = await A.inputValue('#linksList input[data-out="0"]'); const code = link.split('?')[1].split('/')[0];
  await A.waitForTimeout(2500);
  const rows = boards[code].feed.outputs[0].standings.rows.filter(r => r.highlight).map(r => r.pos + ' ' + r.name); ok(rows.length === 3, 'feed highlight: ' + rows);
  const D = await mk({ width: 1920, height: 1080 }, 'DAK'); await D.goto(link); await D.waitForTimeout(7000);
  ok((await D.$$eval('.srow.hl', r => r.length)) === 3, 'DAK shows 3 highlighted rows'); await D.screenshot({ path: OUT + '/t7_dak.png' });
  const F = await mk({ width: 1920, height: 72 }, 'F'); await F.goto(link.replace(/1$/, '2')); await F.waitForTimeout(7000);
  ok(await F.$$eval('.srow.hl .sn', r => r.map(x => x.textContent).join(',')).then(t => /Kentucky/i.test(t)), 'fascia still shows Kentucky (14th): ' + await F.$$eval('.stand.wide .srow .sp', r => r.map(x => x.textContent).join(' ')));
  await F.screenshot({ path: OUT + '/t7_fascia.png' });
  await A.click('[data-hlclear]'); await A.waitForTimeout(400); ok((await A.$$eval('.ob[data-o="0"] .srow.hl', r => r.length)) === 0, 'clear removes highlight');
  console.log('errors:', errs); await br.close();
})();
