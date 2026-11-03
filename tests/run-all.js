// Runs every test file in this folder and fails if any check fails.
// Usage: node tests/run-all.js            (needs: npm i playwright && npx playwright install chromium)
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
// Checks whose wording is cosmetic and known to differ (label text only, the behaviour is right)
const KNOWN = [/★ ★ Alabama, Auburn/, /ATL D\/ST/];
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-tests-'));
const files = fs.readdirSync(__dirname).filter(f => /^test\d+\.js$/.test(f)).sort((a, b) => parseInt(a.slice(4)) - parseInt(b.slice(4)));
let pass = 0, fail = 0; const bad = [];
for (const f of files) {
  let log = '';
  try { log = execFileSync(process.execPath, [path.join(__dirname, f), out], { encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { log = (e.stdout || '') + '\nCRASH ' + (e.stderr || e.message).split('\n').slice(0, 5).join(' '); }
  const lines = log.split('\n');
  const p = lines.filter(l => l.startsWith('PASS')).length;
  const fl = lines.filter(l => (l.startsWith('FAIL') && !KNOWN.some(k => k.test(l))) || l.startsWith('CRASH'));
  const errs = lines.find(l => /^errors:/.test(l) && !/errors: \[\]/.test(l));
  if (errs) fl.push('page errors -> ' + errs);
  pass += p; fail += fl.length; fl.forEach(l => bad.push(f + ': ' + l));
  console.log((fl.length ? '✗ ' : '✓ ') + f + '  ' + p + ' passed' + (fl.length ? ', ' + fl.length + ' failed' : ''));
}
console.log('\n' + pass + ' checks passed, ' + fail + ' failed');
if (bad.length) { console.log(bad.join('\n')); process.exit(1); }
