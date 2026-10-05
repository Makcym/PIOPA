// Screenshots for the landing page, 1280×720, Russian interface, from stage.html:
//
//   node tools/harness.mjs                 (repo root, keep running)
//   cd tools/video && node shots.mjs       → store/shot-ru-1..3.png
//
// 1 — the popup: stage, inspector, days, messages, the decision in green
// 2 — a new message: amber badge, the "новое" mark
// 3 — settings: the account's applications, period and check interval
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STORE = path.resolve(HERE, '../../store');
const BASE = process.env.HARNESS || 'http://127.0.0.1:8787';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(STORE, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb', '--lang=ru'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
await page.goto(`${BASE}/tools/video/stage.html?lang=ru`, { waitUntil: 'networkidle0' });
const s = (name, ...args) => page.evaluate((n, as) => window.stage[n](...as), name, args);
async function shoot(n) {
  await sleep(900);
  const file = path.join(STORE, `shot-ru-${n}.png`);
  const raw = `${file}.2x.png`;
  await page.screenshot({ path: raw });
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-vf', 'scale=1280:720:flags=lanczos', file]);
  fs.rmSync(raw);
  console.log(file);
}

await s('reset', 'configured'); await s('newTab'); await s('show', 'browser'); await s('check');
await s('openPopup');
await shoot(1);

await s('closePopup');
const extra = Date.now();
await sleep(300);
await s('check', extra);
await s('openPopup', extra);
await s('ring', 'popup', '.news-item', 'Wezwanie do osobistego');
// the popup has just been opened, which turns the badge blue; the shot is of the moment before
await page.evaluate(() => { const b = document.getElementById('badge'); b.style.background = '#F59E0B'; });
await shoot(2);

await s('closePopup'); await s('reset', 'empty'); await s('check'); await s('openOptions');
await s('type', 'tab', '#username', 'anna.nowak@example.com');
await s('type', 'tab', '#password', 'correct-horse');
await s('tap', 'tab', '#testConnection');
await sleep(1300);
await s('tap', 'tab', '.app:nth-child(1) .btn');
await s('tap', 'tab', '.app:nth-child(2) .btn');
await s('hideCursor');
await s('ring', 'tab', '.row');
await shoot(3);
await browser.close();
