// A stand-in for chrome.* so popup.html and options.html open as ordinary pages
// (tools/harness.mjs). The portal is tools/mock-data.js; nothing leaves the machine.
//   ?lang=ru|en|pl   interface language
//   ?state=empty     nothing configured (default: the mock account is set up)
//   ?wrong=1         the stored password is not the portal's
//   ?delay=600       how long the mock portal takes to answer, ms
//   ?extra=<ms>      one more message in the second application, sent at that time
(function () {
  const q = new URLSearchParams(location.search);
  const lang = q.get('lang') || 'ru';
  const delay = Number(q.get('delay') || 250);
  const KEY = 'pio-harness';
  const xhr = new XMLHttpRequest();
  xhr.open('GET', `/_locales/${lang}/messages.json`, false);
  xhr.send();
  const messages = JSON.parse(xhr.responseText);

  if (q.get('extra')) {
    self.PIO_MOCK.communiques[502].push({
      id: 9103, title: 'Wezwanie do osobistego stawiennictwa', sentAt: new Date(Number(q.get('extra'))).toISOString(),
    });
  }

  // Storage is one sessionStorage record shared by every harness frame of the tab (the
  // popup, the options page, the hidden "service worker" of the video stage), read and
  // written whole on each call — the frames must not keep copies of their own.
  const load = () => JSON.parse(sessionStorage.getItem(KEY) || 'null');
  const save = (store) => sessionStorage.setItem(KEY, JSON.stringify(store));
  if (!load()) {
    const m = self.PIO_MOCK;
    save({
      sync: {},
      local: q.get('state') === 'empty' ? {} : {
        username: m.login, password: q.get('wrong') ? 'old-password' : m.password,
        applications: m.applications.map((a) => a.number).join(', '),
        newsPeriod: '3y', autoUpdatePeriod: '3',
      },
    });
  }
  const changed = [];
  const area = (name) => ({
    async get(keys) {
      const data = load()[name];
      if (keys == null) return { ...data };
      const out = {};
      [].concat(keys).forEach((k) => { if (k in data) out[k] = data[k]; });
      return out;
    },
    async set(values) {
      const store = load();
      const changes = {};
      Object.entries(values).forEach(([k, v]) => { changes[k] = { oldValue: store[name][k], newValue: v }; store[name][k] = v; });
      save(store);
      changed.forEach((f) => f(changes, name));
    },
    async remove(keys) { const store = load(); [].concat(keys).forEach((k) => { delete store[name][k]; }); save(store); },
  });

  const listeners = [];
  const badge = { text: '', color: '#2196F3' };
  const tell = () => { try { parent.postMessage({ pioBadge: { ...badge } }, '*'); } catch (e) { /* no parent */ } };

  self.chrome = {
    storage: { local: area('local'), sync: area('sync'), onChanged: { addListener: (f) => changed.push(f) } },
    i18n: {
      getUILanguage: () => lang,
      getMessage(key, subs) {
        const m = messages[key];
        if (!m) return '';
        return [].concat(subs || []).reduce((s, v, i) => s.replaceAll(`$${i + 1}`, v), m.message);
      },
    },
    action: {
      async setBadgeText({ text }) { badge.text = text; tell(); },
      async setBadgeBackgroundColor({ color }) { badge.color = color; tell(); },
    },
    alarms: { async clear() {}, async create() {}, onAlarm: { addListener() {} } },
    runtime: {
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: { addListener: (f) => listeners.push(f) },
      sendMessage: (message) => new Promise((resolve) => {
        let async = false;
        listeners.forEach((f) => { if (f(message, {}, resolve) === true) async = true; });
        if (!async) resolve();
      }),
      openOptionsPage() { parent.postMessage({ pioOpen: 'options' }, '*'); if (parent === self) location.href = `/options.html${location.search}`; },
    },
  };
  self.importScripts = () => {};

  const realFetch = self.fetch.bind(self);
  self.fetch = async (url, options) => {
    if (!String(url).startsWith('https://api-przybysz.duw.pl/')) return realFetch(url, options);
    await new Promise((r) => setTimeout(r, delay));
    const { status, body } = self.PIO_MOCK.answer(String(url), options);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  // options.js closes the window after saving; in the harness that would end the recording
  self.close = () => parent.postMessage({ pioClosed: true }, '*');
})();
