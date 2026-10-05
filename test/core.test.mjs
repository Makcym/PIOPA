// node --test test/
// core.js and background.js run in a vm context with a chrome.* stand-in and the mock
// portal from tools/mock-data.js. No network, no real account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function area(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(keys) {
      if (keys == null) return { ...data };
      const list = typeof keys === 'string' ? [keys] : keys;
      const out = {};
      list.forEach((k) => { if (k in data) out[k] = data[k]; });
      return out;
    },
    async set(values) { Object.assign(data, values); },
    async remove(keys) { [].concat(keys).forEach((k) => { delete data[k]; }); },
  };
}

function world({ local = {}, sync = {}, lang = 'en' } = {}) {
  const messages = JSON.parse(read(`_locales/${lang}/messages.json`));
  const calls = [];
  const badge = { text: '', color: '' };
  const listeners = { message: [], alarm: [], installed: [], startup: [] };
  const alarms = {};
  const ctx = {
    console, URL, Intl, Date, JSON, Promise, setTimeout,
    chrome: {
      storage: { local: area(local), sync: area(sync), onChanged: { addListener() {} } },
      i18n: {
        getUILanguage: () => lang,
        getMessage: (key, subs) => {
          const m = messages[key];
          if (!m) return '';
          return [].concat(subs || []).reduce((s, v, i) => s.replaceAll(`$${i + 1}`, v), m.message);
        },
      },
      action: {
        async setBadgeText({ text }) { badge.text = text; },
        async setBadgeBackgroundColor({ color }) { badge.color = color; },
      },
      alarms: {
        async clear(name) { delete alarms[name]; },
        async create(name, info) { alarms[name] = info; },
        onAlarm: { addListener: (f) => listeners.alarm.push(f) },
      },
      runtime: {
        onInstalled: { addListener: (f) => listeners.installed.push(f) },
        onStartup: { addListener: (f) => listeners.startup.push(f) },
        onMessage: { addListener: (f) => listeners.message.push(f) },
      },
    },
  };
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.importScripts = () => {};
  vm.createContext(ctx);
  vm.runInContext(read('tools/mock-data.js'), ctx);
  ctx.fetch = async (url, options) => {
    calls.push(`${(options && options.method) || 'GET'} ${new URL(url).pathname}${new URL(url).search}`);
    const { status, body } = ctx.PIO_MOCK.answer(url, options);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  vm.runInContext(read('core.js'), ctx);
  const send = (message) => new Promise((resolve) => {
    listeners.message.forEach((f) => f(message, {}, resolve));
  });
  return { ctx, PIO: ctx.PIO, mock: ctx.PIO_MOCK, calls, badge, alarms, listeners, send, loadBackground: () => vm.runInContext(read('background.js'), ctx) };
}

const settings = (mock, more = {}) => ({
  username: mock.login, password: mock.password,
  applications: mock.applications.map((a) => a.number).join(', '),
  newsPeriod: '3y', autoUpdatePeriod: '2', ...more,
});

test('settings move from sync to local once, the synced password is removed', async () => {
  const w = world();
  const old = settings(w.mock);
  Object.assign(w.ctx.chrome.storage.sync.data, old, { token: 'left-by-6.0', tokenTimestamp: 1 });
  const s = await w.PIO.loadSettings();
  assert.equal(s.password, old.password);
  assert.equal(w.ctx.chrome.storage.local.data.password, old.password);
  assert.deepEqual(w.ctx.chrome.storage.sync.data, {});
});

test('settings already in local are read as they are', async () => {
  const w = world();
  await w.PIO.saveSettings(settings(w.mock));
  w.ctx.chrome.storage.sync.data.username = 'someone-else';
  assert.equal((await w.PIO.loadSettings()).username, w.mock.login);
  assert.equal(w.ctx.chrome.storage.sync.data.username, 'someone-else');
});

test('one check makes the same calls as before and returns stage, inspector and messages', async () => {
  const w = world();
  const data = await w.PIO.fetchAll(settings(w.mock));
  assert.deepEqual(w.calls, [
    'POST /api/v1/token/obtain',
    'GET /api/v1/applications/proxy?pagination=false&status=3',
    'GET /api/v1/applications/501',
    'GET /api/v1/communiques?application=501&pagination=false',
    'GET /api/v1/applications/502',
    'GET /api/v1/communiques?application=502&pagination=false',
  ]);
  assert.equal(data.news.length, 6);
  assert.equal(data.applicationMeta['2026/04812'].applicationStatus, 'Decyzja wydana');
  assert.equal(data.applicationMeta['2026/11307'].applicationInspector, 'P. Zieliński');
  assert.deepEqual(Object.keys(data.news[0]).sort(), ['applicationNumber', 'id', 'sentAt', 'title']);
});

test('a number the portal does not list is skipped, not an error', async () => {
  const w = world();
  const data = await w.PIO.fetchAll(settings(w.mock, { applications: '2026/04812, 1999/00001' }));
  assert.equal(data.news.length, 4);
  assert.deepEqual([...data.applicationNumbers], ['2026/04812', '1999/00001']);
});

test('a wrong password is an auth error', async () => {
  const w = world();
  await assert.rejects(w.PIO.fetchAll(settings(w.mock, { password: 'nope' })), (e) => e.code === 'auth');
});

test('a network failure is a network error', async () => {
  const w = world();
  w.ctx.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(w.PIO.fetchAll(settings(w.mock)), (e) => e.code === 'network');
});

test('the application list wrapped in hydra:member is read the same way (as 6.0 did)', async () => {
  const w = world();
  const real = w.ctx.fetch;
  w.ctx.fetch = async (url, options) => {
    const r = await real(url, options);
    if (!url.includes('/applications/proxy')) return r;
    const list = await r.json();
    return { ok: true, status: 200, json: async () => ({ 'hydra:member': list }) };
  };
  const data = await w.PIO.fetchAll(settings(w.mock));
  assert.equal(data.news.length, 6);
  assert.equal(data.applicationMeta['2026/11307'].applicationInspector, 'P. Zieliński');
});

test('an application without a stage in the answers gets no made-up status', async () => {
  const w = world();
  const real = w.ctx.fetch;
  w.ctx.fetch = async (url, options) => {
    const r = await real(url, options);
    const body = await r.json();
    if (url.includes('/applications/proxy')) body.forEach((a) => { delete a.applicationStage; });
    else if (/\/applications\/\d+$/.test(url)) delete body.stage;
    return { ok: r.ok, status: r.status, json: async () => body };
  };
  const data = await w.PIO.fetchAll(settings(w.mock));
  assert.equal('applicationStatus' in data.applicationMeta['2026/04812'], false);
  assert.equal(data.applicationMeta['2026/04812'].applicationAcceptedAt != null, true);
});

test('an answer that is not a list is a format error', async () => {
  const w = world();
  const real = w.ctx.fetch;
  w.ctx.fetch = async (url, options) => (url.includes('/applications/proxy')
    ? { ok: true, status: 200, json: async () => ({ unexpected: true }) }
    : real(url, options));
  await assert.rejects(w.PIO.fetchAll(settings(w.mock)), (e) => e.code === 'format');
});

test('the period filter and the day counter', () => {
  const w = world();
  const now = new Date('2026-10-05T12:00:00Z');
  const news = [
    { title: 'a', sentAt: '2026-10-04T12:00:00Z' },
    { title: 'b', sentAt: '2026-09-01T12:00:00Z' },
    { title: ' ', sentAt: '2026-10-04T12:00:00Z' },
    { title: 'c', sentAt: 'not a date' },
  ];
  assert.equal(w.PIO.inPeriod(news, '1w', now).length, 1);
  assert.equal(w.PIO.inPeriod(news, '3y', now).length, 2);
  assert.equal(w.PIO.daysBetween('2026-10-01T00:00:00Z', '2026-10-05T00:00:00Z'), 4);
  assert.equal(w.PIO.isDecision({ title: 'Decyzja została wydana' }), true);
});

test('day counts are declined in Russian and Polish', () => {
  const ru = world({ lang: 'ru' }).PIO;
  assert.deepEqual([1, 3, 5, 21, 142].map((n) => ru.daysText(n)), ['1 день', '3 дня', '5 дней', '21 день', '142 дня']);
  const pl = world({ lang: 'pl' }).PIO;
  assert.deepEqual([1, 3, 5].map((n) => pl.daysText(n)), ['1 dzień', '3 dni', '5 dni']);
});

test('background: a check stores the result, sets the timer and a blue badge', async () => {
  const w = world();
  await w.PIO.saveSettings(settings(w.mock));
  w.loadBackground();
  const result = await w.send({ type: 'settingsSaved' });
  const local = w.ctx.chrome.storage.local.data;
  assert.deepEqual({ ...result }, { ok: true });
  assert.equal(local.news.length, 6);
  assert.equal(local.lastError, null);
  assert.equal(local.seenAt, local.lastCheck);
  assert.equal(w.alarms.checkNews.periodInMinutes, 120);
  assert.deepEqual(w.badge, { text: '6', color: '#2196F3' });
});

test('background: a message after the popup was last opened turns the badge amber', async () => {
  const w = world();
  await w.PIO.saveSettings(settings(w.mock));
  w.loadBackground();
  await w.send({ type: 'checkNews' });
  w.mock.communiques[502].push({ id: 9103, title: 'Wezwanie do osobistego stawiennictwa', sentAt: new Date(Date.now() + 1000).toISOString() });
  await new Promise((r) => setTimeout(r, 1100));
  await w.send({ type: 'checkNews' });
  assert.deepEqual(w.badge, { text: '7', color: '#F59E0B' });
  await w.ctx.chrome.storage.local.set({ seenAt: new Date().toISOString() });
  await w.send({ type: 'seen' });
  assert.deepEqual(w.badge, { text: '7', color: '#2196F3' });
});

test('background: a failed sign-in shows "!" and keeps the earlier messages', async () => {
  const w = world();
  await w.PIO.saveSettings(settings(w.mock));
  w.loadBackground();
  await w.send({ type: 'checkNews' });
  await w.PIO.saveSettings({ password: 'changed-in-the-portal' });
  const result = await w.send({ type: 'checkNews' });
  assert.equal(result.error, 'auth');
  assert.equal(w.ctx.chrome.storage.local.data.news.length, 6);
  assert.deepEqual(w.badge, { text: '!', color: '#F44336' });
});

test('background: without settings nothing is fetched', async () => {
  const w = world();
  w.loadBackground();
  const result = await w.send({ type: 'checkNews' });
  assert.equal(result.error, 'setup');
  assert.deepEqual(w.calls, []);
});

test('every interface key exists in all three languages', () => {
  const [en, ru, pl] = ['en', 'ru', 'pl'].map((l) => Object.keys(JSON.parse(read(`_locales/${l}/messages.json`))).sort());
  assert.deepEqual(ru, en);
  assert.deepEqual(pl, en);
  const used = new Set();
  for (const f of ['popup.html', 'options.html', 'popup.js', 'options.js', 'core.js']) {
    const src = read(f);
    for (const m of src.matchAll(/data-i18n(?:-placeholder|-title)?="([^"]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/\bt\('([A-Za-z0-9_]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/(?:auth|network|format): '([A-Za-z]+)'/g)) used.add(m[1]);
  }
  const missing = [...used].filter((k) => !en.includes(k));
  assert.deepEqual(missing, []);
});
