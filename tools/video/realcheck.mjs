// Loads the extension unpacked into Chrome and checks what the harness cannot: the
// manifest and _locales are accepted, the service worker starts (importScripts), the
// popup and options pages render in the browser's language without errors.
//   node realcheck.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, pipe: true, enableExtensions: true,
  args: ['--lang=ru', '--mute-audio'],
});
const id = await browser.installExtension(ROOT);
const worker = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes(id), { timeout: 15000 });
const sw = await worker.worker();
const inWorker = await sw.evaluate(() => ({
  core: typeof PIO === 'object' && typeof PIO.fetchAll === 'function',
  lang: chrome.i18n.getUILanguage(),
  name: chrome.runtime.getManifest().name,
  version: chrome.runtime.getManifest().version,
  description: chrome.i18n.getMessage('extDescription'),
}));
const errors = [];
const open = async (file) => {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`${file}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${file}: ${m.text()}`); });
  await page.goto(`chrome-extension://${id}/${file}`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 800));
  return page;
};
const popup = await open('popup.html');
const popupText = await popup.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
const options = await open('options.html');
const optionsText = await options.evaluate(() => [...document.querySelectorAll('label, button, h1')].map((e) => e.textContent.trim()).join(' | '));
const alarm = await sw.evaluate(() => chrome.alarms.get('checkNews'));
console.log(JSON.stringify({ id, inWorker, popupText, optionsText, alarmMinutes: alarm && alarm.periodInMinutes, errors }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
