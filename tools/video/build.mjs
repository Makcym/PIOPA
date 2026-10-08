// Records the promo video (Russian voice-over) from stage.html:
//
//   node tools/harness.mjs                         (repo root, keep running)
//   cd tools/video && npm install && node build.mjs
//
// Output in out/web/: piopa.mp4, piopa.jpg (poster), piopa.ru.vtt (captions).
// out/piopa-master.mp4 is the high-quality cut.
//
// DRY=1 node build.mjs — no voice, no recording: walks every scene, fails on a selector
// that finds nothing and saves the frame each line ends on to out/dry/<scene>-<n>.png.
//
// Voice: ElevenLabs, ELEVENLABS_API_KEY from the environment, tools/video/.env (not
// committed) or the SLA video tools of the owner's site repo. MUSIC=<file.mp3> (or
// out/music.mp3) is mixed under the voice, ducked while it speaks.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { SCENES, VOICE, MODEL, SETTINGS } from './script.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const TTS = path.join(OUT, 'tts');
const WEB = path.join(OUT, 'web');
const BASE = process.env.HARNESS || 'http://127.0.0.1:8787';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DRY = process.env.DRY === '1';
const VW = 1280, VH = 720, DPR = 1.5; // → 1920×1080
const LEAD = 0.9, GAP = 0.45, TAIL = 1.2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
const probe = (f) => parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));
[TTS, WEB, path.join(OUT, 'dry')].forEach((d) => fs.mkdirSync(d, { recursive: true }));

function key(name) {
  if (process.env[name]) return process.env[name];
  const files = [
    path.join(HERE, '.env'),
    path.join(os.homedir(), 'dev/max/MARKAROV-DEV/demo/sla/tools/video/.env'),
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const m = fs.readFileSync(file, 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'));
    if (m) return m[1].trim();
  }
  throw new Error(`${name} is not set (environment or ${files.join(', ')})`);
}

// ---------- voice ----------
async function tts(say, prev, next) {
  if (DRY) return { wav: null, dur: Math.max(2, say.length * 0.062) };
  const id = [VOICE.id, MODEL, JSON.stringify(SETTINGS), prev, say, next].join('|');
  const hash = crypto.createHash('sha1').update(id).digest('hex').slice(0, 16);
  const mp3 = path.join(TTS, `${hash}.mp3`);
  const wav = path.join(TTS, `${hash}.wav`);
  if (!fs.existsSync(wav)) {
    const body = { text: say, model_id: MODEL, voice_settings: SETTINGS, seed: 7 };
    if (prev) body.previous_text = prev;
    if (next) body.next_text = next;
    for (let i = 1; ; i++) {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE.id}?output_format=mp3_44100_192`, {
        method: 'POST',
        headers: { 'xi-api-key': key('ELEVENLABS_API_KEY'), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) { fs.writeFileSync(mp3, Buffer.from(await r.arrayBuffer())); break; }
      const err = `ElevenLabs HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`;
      if (i === 4 || (r.status < 500 && r.status !== 429)) throw new Error(err);
      await sleep(3000 * i);
    }
    run('ffmpeg', ['-y', '-v', 'error', '-i', mp3, '-af',
      'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse',
      '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
  }
  return { wav, dur: probe(wav) };
}

// ---------- the stage ----------
if (!(await fetch(`${BASE}/manifest.json`).then((r) => r.ok).catch(() => false))) {
  throw new Error(`the harness is not running at ${BASE}: node tools/harness.mjs`);
}
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb', '--lang=ru'],
});
const page = await browser.newPage();
await page.setViewport({ width: VW, height: VH, deviceScaleFactor: DPR });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
await page.goto(`${BASE}/tools/video/stage.html?lang=ru`, { waitUntil: 'networkidle0' });
await sleep(400);

let extra = null;
async function act(a) {
  const [name, ...rest] = a;
  if (name === 'wait') { await sleep(rest[0]); return; }
  const args = rest.map((v) => (v === '$extra' ? (extra = extra || Date.now()) : v));
  await page.evaluate((n, as) => window.stage[n](...as), name, args);
}
async function acts(list) { for (const a of list || []) await act(a); }

const clips = [];
const cues = []; // [startSec, endSec, text] on the final timeline
let timeline = 0;

for (const scene of SCENES) {
  const beats = [];
  for (const [i, b] of scene.beats.entries()) {
    const say = (x) => x && (x.say || x.text);
    beats.push({ ...b, ...(await tts(say(b), say(scene.beats[i - 1]), say(scene.beats[i + 1]))) });
  }

  await act(['caption', '']);
  await act(['chapter', '']);
  await acts(scene.pre);
  await sleep(500);

  const webm = path.join(OUT, `${scene.id}.webm`);
  const rec = DRY ? null : await page.screencast({ path: webm, fps: 30, quality: 14 });
  const t0 = Date.now();
  const at = () => (Date.now() - t0) / 1000;
  if (scene.chapter) await act(['chapter', scene.chapter]);
  await sleep(LEAD * 1000);

  const starts = [];
  for (const [i, b] of beats.entries()) {
    const start = at();
    starts.push(start);
    await act(['caption', b.text]);
    // the line and its actions run together; whichever is longer sets the pace
    await Promise.all([acts(b.act), sleep(b.dur * 1000)]);
    cues.push([timeline + start, timeline + start + b.dur, b.text]);
    await act(['caption', '']);
    if (DRY) await page.screenshot({ path: path.join(OUT, 'dry', `${scene.id}-${i + 1}.png`) });
    await sleep(GAP * 1000);
  }
  await sleep(TAIL * 1000);
  const total = at();
  if (rec) await rec.stop();
  console.log(`${scene.id.padEnd(9)} ${total.toFixed(1)}s  ${beats.map((b) => b.dur.toFixed(1)).join(' + ')}`);
  timeline += total;
  if (DRY) continue;

  // each line sits at the moment it actually started while recording
  const inputs = beats.flatMap((b) => ['-i', b.wav]);
  const delays = beats.map((b, i) => `[${i + 1}:a]adelay=${Math.round(starts[i] * 1000)}:all=1[a${i}]`).join(';');
  const mix = `${beats.map((_, i) => `[a${i}]`).join('')}amix=inputs=${beats.length}:duration=longest:normalize=0,apad[a]`;
  const mp4 = path.join(OUT, `${scene.id}.mp4`);
  run('ffmpeg', ['-y', '-v', 'error', '-i', webm, ...inputs, '-filter_complex', `${delays};${mix}`,
    '-map', '0:v', '-map', '[a]', '-t', total.toFixed(3), '-r', '30', '-vf', 'scale=1920:1080:flags=lanczos',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', mp4]);
  clips.push(mp4);
}
await browser.close();
if (DRY) { console.log(`dry run: ${timeline.toFixed(1)}s, frames in ${path.join(OUT, 'dry')}`); process.exit(process.exitCode || 0); }

// ---------- assembly ----------
const list = path.join(OUT, 'concat.txt');
fs.writeFileSync(list, clips.map((f) => `file '${f}'`).join('\n'));
const voiced = path.join(OUT, 'piopa-voiced.mp4');
run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', voiced]);

const master = path.join(OUT, 'piopa-master.mp4');
const MUSIC = process.env.MUSIC || path.join(OUT, 'music.mp3');
if (fs.existsSync(MUSIC)) {
  const d = probe(voiced);
  run('ffmpeg', ['-y', '-v', 'error', '-i', voiced, '-i', MUSIC, '-filter_complex',
    `[1:a]loudnorm=I=-27:TP=-9:LRA=4,aresample=48000,aformat=channel_layouts=stereo,atrim=0:${d.toFixed(3)},` +
    `afade=t=in:d=1.5,afade=t=out:st=${(d - 2.5).toFixed(3)}:d=2.5[m];` +
    '[0:a]asplit=2[v][key];' +
    '[m][key]sidechaincompress=threshold=0.02:ratio=5:attack=60:release=700[ducked];' +
    '[v][ducked]amix=inputs=2:duration=first:normalize=0[a]',
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', master]);
} else {
  fs.copyFileSync(voiced, master);
}

const web = path.join(WEB, 'piopa.mp4');
run('ffmpeg', ['-y', '-v', 'error', '-i', master, '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-profile:v', 'high',
  '-pix_fmt', 'yuv420p', '-vf', 'scale=1280:720:flags=lanczos', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', web]);

// poster: the popup with the decision ringed
const posterAt = cues.find((c) => c[2].startsWith('Сообщение о решении'))[0] + 1.5;
run('ffmpeg', ['-y', '-v', 'error', '-ss', posterAt.toFixed(2), '-i', master, '-frames:v', '1', '-vf', 'scale=1280:720:flags=lanczos', '-q:v', '3', path.join(WEB, 'piopa.jpg')]);

const stamp = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`;
};
fs.writeFileSync(path.join(WEB, 'piopa.ru.vtt'),
  `WEBVTT\n\n${cues.map(([a, b, text], i) => `${i + 1}\n${stamp(a)} --> ${stamp(b)}\n${text}\n`).join('\n')}`);
console.log(`${web}: ${probe(web).toFixed(1)}s, ${(fs.statSync(web).size / 1e6).toFixed(1)} MB`);
