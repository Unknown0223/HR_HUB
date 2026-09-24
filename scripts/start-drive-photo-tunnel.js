/**
 * Lokal API ni trycloudflare orqali ochadi — Apps Script Drive silkalardan
 * rasmlarni zip yuklamasdan yuborishi uchun (Google localhost ga kira olmaydi).
 *
 * Usage: node scripts/start-drive-photo-tunnel.js
 * Keyin Apps Script da: syncPhotosFromDriveLinksOnly
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.API_PORT || '3002';
const CF_CANDIDATES = [
  path.join(ROOT, 'tools', 'cloudflared.exe'),
  path.join(ROOT, 'tools', 'office-link', 'runtime', 'cloudflared.exe'),
  path.join(ROOT, 'tools', 'office-link', 'cloudflared.exe'),
];
const OUT = path.join(ROOT, 'tmp', 'drive-photo-tunnel.txt');

function findCf() {
  for (const p of CF_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const cf = findCf();
if (!cf) {
  console.error('cloudflared.exe topilmadi (tools/cloudflared.exe)');
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
console.log(`Tunnel → http://127.0.0.1:${PORT}`);
console.log(`cloudflared: ${cf}`);

const child = spawn(
  cf,
  ['tunnel', '--url', `http://127.0.0.1:${PORT}`, '--no-autoupdate'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

const re = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;
let url = '';

function onChunk(buf) {
  const s = buf.toString();
  process.stderr.write(s);
  const m = s.match(re);
  if (m && !url) {
    url = m[0];
    const help = `
=== Drive silka → rasm (zip YO‘Q) ===

1) apps.script.google.com da Code.gs ni yangilang (tools/google-form-employee/Code.gs)
2) CONFIG:
   API_URL: '${url}'
   TENANT_CODE: 'demo'
   FORM_KEY: ''   // lab — API kalitsiz ochiq bo‘lsa

3) Funksiya: syncPhotosFromDriveLinksOnly → Выполнить
4) Jurnal: DONE ok=… miss=… fail=…

Tunnel URL: ${url}
API local:  http://127.0.0.1:${PORT}

Bu oynani yopmang — tunnel ishlashi kerak.
`;
    fs.writeFileSync(OUT, help.trim() + '\n', 'utf8');
    console.log('\n' + help);
  }
}

child.stdout.on('data', onChunk);
child.stderr.on('data', onChunk);
child.on('exit', (code) => {
  console.log('cloudflared exit', code);
  process.exit(code || 0);
});

process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
