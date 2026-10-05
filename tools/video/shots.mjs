// Screenshots from stage.html (the drawn browser window with the extension's real
// pages on the made-up account of tools/mock-data.js):
//
//   node tools/harness.mjs                 (repo root, keep running)
//   cd tools/video && node shots.mjs
//
// store/shot-ru-1..3.png           1280×720, for the landing page (markarov.dev/demo/piopa)
// store/screenshot-<lang>-1..3.png 1280×800, the size the Chrome Web Store asks for,
//                                  one set per listing language: en, ru, pl
// store/promo-440x280.png          the store's small promo tile
//
// 1 — the popup: stage, inspector, days, messages, the decision in green
// 2 — a new message: amber badge, the "new" mark
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

const SETS = [
  { lang: 'ru', height: 720, name: (n) => `shot-ru-${n}.png` },
  ...['en', 'ru', 'pl'].map((lang) => ({ lang, height: 800, name: (n) => `screenshot-${lang}-${n}.png` })),
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb'] });

for (const set of SETS) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: set.height, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.goto(`${BASE}/tools/video/stage.html?lang=${set.lang}`, { waitUntil: 'networkidle0' });
  // the stage is drawn for 720; the store's 800 gets the window centred in the taller frame
  if (set.height !== 720) {
    await page.addStyleTag({ content: `html, body { height: ${set.height}px !important; } #browser .win { top: ${30 + (set.height - 720) / 2 + 28}px !important; }` });
  }
  const s = (name, ...args) => page.evaluate((n, as) => window.stage[n](...as), name, args);
  const shoot = async (n) => {
    await sleep(900);
    const file = path.join(STORE, set.name(n));
    const raw = `${file}.2x.png`;
    await page.screenshot({ path: raw });
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-vf', `scale=1280:${set.height}:flags=lanczos`, '-pix_fmt', 'rgb24', file]);
    fs.rmSync(raw);
    console.log(file);
  };

  await s('reset', 'configured'); await s('newTab'); await s('show', 'browser'); await s('check');
  await s('openPopup');
  await shoot(1);

  await s('closePopup');
  const extra = Date.now();
  await sleep(300);
  await s('check', extra);
  await s('openPopup', extra);
  await s('ring', 'popup', '.news-item', 'Wezwanie do osobistego');
  // opening the popup has just turned the badge blue; the shot is of the moment before
  await page.evaluate(() => { document.getElementById('badge').style.background = '#F59E0B'; });
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
  await page.close();
}

// the small promo tile: the icon, the name, one line
const tile = await browser.newPage();
await tile.setViewport({ width: 440, height: 280, deviceScaleFactor: 2 });
const icon = fs.readFileSync(path.resolve(HERE, '../../icons/icon-128.png')).toString('base64');
await tile.setContent(`<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; width: 440px; height: 280px; display: flex; flex-direction: column; justify-content: center; padding: 0 34px; box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #eef1f5;
    background: radial-gradient(70% 90% at 0% 0%, rgba(232,69,124,.42), transparent 62%), radial-gradient(60% 80% at 100% 100%, rgba(47,111,237,.3), transparent 62%), linear-gradient(180deg, #10131a, #0d0f15); }
  img { width: 62px; height: 62px; background: #fff; border-radius: 15px; padding: 8px; box-sizing: border-box; box-shadow: 0 10px 28px rgba(232,69,124,.4); }
  h1 { font-size: 29px; line-height: 1.12; letter-spacing: -.02em; margin: 20px 0 10px; font-weight: 800; }
  p { margin: 0; font-size: 15.5px; line-height: 1.4; color: #b6bfcc; }
</style><img src="data:image/png;base64,${icon}" alt=""><h1>PIO Application Checker</h1><p>Your residence-permit application in the Przybysz portal, watched for you</p>`);
const rawTile = path.join(STORE, 'promo.2x.png');
await tile.screenshot({ path: rawTile });
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', rawTile, '-vf', 'scale=440:280:flags=lanczos', '-pix_fmt', 'rgb24', path.join(STORE, 'promo-440x280.png')]);
fs.rmSync(rawTile);
console.log(path.join(STORE, 'promo-440x280.png'));
await browser.close();
