// Puts the recorded video on YouTube (channel Maxim Markarov) — the Chrome Web Store
// takes a promo video only as a YouTube link. Run after build.mjs:
//
//   node upload.mjs --check              the token works? (reads the channel, writes nothing)
//   node upload.mjs [--privacy public]   uploads out/piopa-master.mp4 (unlisted by default)
//                                        with Russian captions; the id goes to out/web/video.json
//
// OAuth: YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN from the environment,
// tools/video/.env or the SLA video tools of the owner's site repo.
// Every run makes a NEW video — the old one stays until removed in studio.youtube.com.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const WEB = path.join(OUT, 'web');
const API = 'https://www.googleapis.com';
const TITLE = 'PIO Application Checker — статус заявления на карту побыту в Chrome';
const DESCRIPTION = `Расширение для Chrome следит за заявлением на карту побыту в портале Przybysz Нижнесилезского воеводского управления (pio-przybysz.duw.pl): этап рассмотрения, инспектор, сколько дней дело в работе и все сообщения ведомства. Проверяет портал само, значок показывает новое.

Страница расширения: https://markarov.dev/demo/piopa/
Chrome Web Store: https://chromewebstore.google.com/detail/pio-application-checker/fnjpidolmicogfgpjeekmhbfknajbkgc
Исходный код: https://github.com/Makcym/PIOPA

00:00 Что это
00:20 Окно расширения: этап, инспектор, дни, сообщения
00:39 Значок и новое сообщение
00:56 Настройка
01:18 Что происходит с паролем

В ролике выдуманный аккаунт: номера, фамилии и даты ненастоящие.
Независимый проект, не связан с Dolnośląski Urząd Wojewódzki и порталом Przybysz.`;
const TAGS = ['карта побыту', 'karta pobytu', 'Przybysz', 'DUW', 'Wrocław', 'Вроцлав', 'Chrome extension', 'расширение Chrome', 'pio-przybysz'];

function key(name) {
  if (process.env[name]) return process.env[name];
  const files = [
    path.join(HERE, '.env'),
    path.join(os.homedir(), 'dev/max/MARKAROV-DEV/demo/sla/tools/video/.env'),
    path.join(os.homedir(), 'dev/max/MAXIM-MARKAROV-CC/demo/sla/tools/video/.env'),
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const m = fs.readFileSync(file, 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'));
    if (m) return m[1].trim();
  }
  throw new Error(`${name} is not set (environment or ${files.join(', ')})`);
}
async function ok(r, what) {
  if (r.ok) return r;
  throw new Error(`${what}: HTTP ${r.status} ${(await r.text()).slice(0, 400)}`);
}

const args = process.argv.slice(2);
const privacy = args.includes('--privacy') ? args[args.indexOf('--privacy') + 1] : 'unlisted';
const tok = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: key('YT_CLIENT_ID'), client_secret: key('YT_CLIENT_SECRET'),
    refresh_token: key('YT_REFRESH_TOKEN'), grant_type: 'refresh_token',
  }),
}).then((r) => ok(r, 'token')).then((r) => r.json()).then((j) => j.access_token);
const auth = { Authorization: `Bearer ${tok}` };

if (args.includes('--check')) {
  const ch = await fetch(`${API}/youtube/v3/channels?part=snippet,statistics&mine=true`, { headers: auth })
    .then((r) => ok(r, 'channels')).then((r) => r.json());
  const c = ch.items[0];
  console.log(`ok: ${c.snippet.title} (${c.id}), ${c.statistics.videoCount} videos`);
  process.exit(0);
}

const video = fs.readFileSync(path.join(OUT, 'piopa-master.mp4'));
const session = await fetch(`${API}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Length': String(video.length), 'X-Upload-Content-Type': 'video/mp4' },
  body: JSON.stringify({
    snippet: { title: TITLE, description: DESCRIPTION, tags: TAGS, categoryId: '28', defaultLanguage: 'ru', defaultAudioLanguage: 'ru' },
    status: { privacyStatus: privacy, selfDeclaredMadeForKids: false, embeddable: true },
  }),
}).then((r) => ok(r, 'upload session')).then((r) => r.headers.get('location'));
console.log(`uploading ${(video.length / 1e6).toFixed(1)} MB…`);
const { id } = await fetch(session, { method: 'PUT', headers: { ...auth, 'Content-Type': 'video/mp4' }, body: video })
  .then((r) => ok(r, 'upload')).then((r) => r.json());
console.log(`video: https://youtu.be/${id} [${privacy}]`);

const b = crypto.randomUUID();
const body = Buffer.concat([
  Buffer.from(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${
    JSON.stringify({ snippet: { videoId: id, language: 'ru', name: 'Русский', isDraft: false } })
  }\r\n--${b}\r\nContent-Type: text/vtt\r\n\r\n`),
  fs.readFileSync(path.join(WEB, 'piopa.ru.vtt')),
  Buffer.from(`\r\n--${b}--\r\n`),
]);
await fetch(`${API}/upload/youtube/v3/captions?part=snippet&uploadType=multipart`, {
  method: 'POST', headers: { ...auth, 'Content-Type': `multipart/related; boundary=${b}` }, body,
}).then((r) => ok(r, 'captions'));
console.log('captions: ru');
fs.writeFileSync(path.join(WEB, 'video.json'), `${JSON.stringify({ youtubeId: id, url: `https://youtu.be/${id}`, privacy, uploadedAt: new Date().toISOString() }, null, 2)}\n`);
