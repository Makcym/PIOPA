/*
 * Shared by the service worker (importScripts) and by the popup and options pages
 * (<script src="core.js">). Everything that talks to the portal lives here, once.
 *
 * The portal: pio-przybysz.duw.pl ("Przybysz", Dolnośląski Urząd Wojewódzki).
 * Its API is not public and not documented; the calls below repeat what the portal's
 * own web client sends. Do not change their shape without checking against a real
 * account.
 */
(function (root) {
  'use strict';

  const API = 'https://api-przybysz.duw.pl/api/v1';
  const SETTING_KEYS = ['username', 'password', 'applications', 'newsPeriod', 'autoUpdatePeriod'];
  const DEFAULT_PERIOD = '3y';
  const DEFAULT_UPDATE_HOURS = 3;
  const BADGE_BLUE = '#2196F3';
  const BADGE_NEW = '#F59E0B';
  const BADGE_ERROR = '#F44336';

  // Stage number → the portal's own wording. Polish on purpose: these are the terms
  // the office uses in letters and at the counter, so they are not translated.
  const STAGES = {
    1: 'Wniosek złożony',
    2: 'W trakcie weryfikacji',
    3: 'Oczekuje na dokumenty',
    4: 'Dokumenty kompletne',
    5: 'W trakcie rozpatrywania',
    6: 'Oczekuje na decyzję',
    7: 'Decyzja wydana',
    8: 'Decyzja pozytywna',
    9: 'Decyzja negatywna',
    10: 'Karta w produkcji',
    11: 'Karta pobytu do odbioru',
    12: 'Karta pobytu wydana',
    13: 'Sprawa zakończona',
    14: 'Odwołanie',
    15: 'Inne',
  };

  class PioError extends Error {
    /** @param {'auth'|'network'|'format'} code */
    constructor(code, message) {
      super(message || code);
      this.name = 'PioError';
      this.code = code;
    }
  }

  function stageText(stage) {
    return STAGES[stage] || `Status ${stage}`;
  }

  function periodStart(period, now = new Date()) {
    const back = (years, months) => new Date(
      now.getFullYear() - years, now.getMonth() - months, now.getDate(),
      now.getHours(), now.getMinutes(), now.getSeconds(),
    );
    const ago = (ms) => new Date(now.getTime() - ms);
    const HOUR = 60 * 60 * 1000;
    switch (period) {
      case 'all': return new Date(0);
      case '5y': return back(5, 0);
      case '4y': return back(4, 0);
      case '3y': return back(3, 0);
      case '2y': return back(2, 0);
      case '1y': return back(1, 0);
      case '6m': return back(0, 6);
      case '1m': return back(0, 1);
      case '1w': return ago(7 * 24 * HOUR);
      case '3d': return ago(3 * 24 * HOUR);
      case '1d': return ago(24 * HOUR);
      case '5h': return ago(5 * HOUR);
      default: return back(3, 0);
    }
  }

  function parseNumbers(applications) {
    return String(applications || '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
  }

  function isConfigured(s) {
    return Boolean(s && s.username && s.password && parseNumbers(s.applications).length);
  }

  function updateHours(s) {
    const h = parseFloat(s && s.autoUpdatePeriod);
    return Number.isFinite(h) && h > 0 ? h : DEFAULT_UPDATE_HOURS;
  }

  function isMessage(item) {
    return Boolean(
      item && typeof item.title === 'string' && item.title.trim() !== '' &&
      item.sentAt && !Number.isNaN(new Date(item.sentAt).getTime()),
    );
  }

  function inPeriod(news, period, now = new Date()) {
    const from = periodStart(period || DEFAULT_PERIOD, now);
    return (news || []).filter((item) => {
      if (!isMessage(item)) return false;
      const sent = new Date(item.sentAt);
      return sent >= from && sent <= now;
    });
  }

  function isDecision(item) {
    return Boolean(item && item.title && item.title.toLowerCase().includes('decyzja'));
  }

  function daysBetween(from, until) {
    if (!from) return null;
    const a = new Date(from);
    const b = until ? new Date(until) : new Date();
    const d = Math.floor((b - a) / (24 * 60 * 60 * 1000));
    return Number.isNaN(d) ? null : d;
  }

  // ---- settings -----------------------------------------------------------------

  /**
   * Settings live in storage.local. Up to 6.0 they were in storage.sync, which put
   * the portal password — and the last access token — into the Google account sync;
   * the first read moves the settings over and removes the synced copy with the token.
   */
  async function loadSettings() {
    let s = await chrome.storage.local.get(SETTING_KEYS);
    if (!s.username && !s.applications) {
      const old = await chrome.storage.sync.get(SETTING_KEYS);
      if (old.username || old.applications) {
        await chrome.storage.local.set(old);
        await chrome.storage.sync.remove([...SETTING_KEYS, 'token', 'tokenTimestamp']);
        s = old;
      }
    }
    return s;
  }

  async function saveSettings(s) {
    const clean = {};
    SETTING_KEYS.forEach((k) => { if (s[k] !== undefined) clean[k] = s[k]; });
    await chrome.storage.local.set(clean);
  }

  // ---- the portal ---------------------------------------------------------------

  // Origin and Referer are what the portal's web client sends. A browser drops them
  // from fetch() as forbidden header names; they stay here so the request reads the
  // same as the one it was copied from.
  function headers(token) {
    const h = {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'Origin': 'https://pio-przybysz.duw.pl',
      'Referer': 'https://pio-przybysz.duw.pl/',
    };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }

  async function request(url, options) {
    try {
      return await fetch(url, options);
    } catch (e) {
      throw new PioError('network', e && e.message);
    }
  }

  async function login(username, password) {
    const r = await request(`${API}/token/obtain`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ login: username, password }),
    });
    if (!r.ok) throw new PioError(r.status >= 500 ? 'network' : 'auth', `HTTP ${r.status}`);
    const data = await r.json();
    if (!data || !data.token) throw new PioError('format', 'no token in the answer');
    return data.token;
  }

  /** The applications the options page offers to add: [{ number, acceptedAt }]. */
  async function listApplications(token) {
    const r = await request(`${API}/applications`, { headers: headers(token) });
    if (!r.ok) throw new PioError('network', `HTTP ${r.status}`);
    const data = await r.json();
    const list = data && data['hydra:member'];
    if (!Array.isArray(list)) throw new PioError('format', 'no list in the answer');
    return list
      .map((a) => ({ number: String(a.number), acceptedAt: a.acceptedAt }))
      .sort((a, b) => new Date(b.acceptedAt) - new Date(a.acceptedAt));
  }

  /**
   * One full check: sign in, map the application numbers to ids, read the stage and
   * the messages of each. Returns what the popup shows; stores nothing.
   */
  async function fetchAll(settings) {
    const token = await login(settings.username, settings.password);
    const numbers = parseNumbers(settings.applications);

    const listResponse = await request(`${API}/applications/proxy?pagination=false&status=3`, {
      headers: headers(token),
    });
    if (!listResponse.ok) throw new PioError('network', `HTTP ${listResponse.status}`);
    // The portal has answered both with a bare list and with { "hydra:member": [...] };
    // 6.0 accepted either, and so does this.
    const answer = await listResponse.json();
    const list = Array.isArray(answer) ? answer : answer && answer['hydra:member'];
    if (!Array.isArray(list)) throw new PioError('format', 'the application list is not a list');

    const idByNumber = {};
    const meta = {};
    list.forEach((app) => {
      if (!app || !app.applicationNumber) return;
      idByNumber[app.applicationNumber] = app.applicationId;
      meta[app.applicationNumber] = {
        applicationAcceptedAt: app.applicationAcceptedAt,
        applicationInspector: app.applicationInspector,
      };
      // the stage is not in every answer; without it the popup shows no stage at all
      if (app.applicationStage != null) {
        meta[app.applicationNumber].applicationStage = app.applicationStage;
        meta[app.applicationNumber].applicationStatus = stageText(app.applicationStage);
      }
    });

    let news = [];
    for (const number of numbers) {
      const id = idByNumber[number];
      if (!id) continue;

      // The detail view sometimes knows a later stage than the list does.
      try {
        const detailResponse = await request(`${API}/applications/${id}`, { headers: headers(token) });
        if (detailResponse.ok) {
          const detail = await detailResponse.json();
          const stage = detail && (detail.stage || detail.applicationStage);
          if (stage) {
            meta[number].applicationStage = stage;
            meta[number].applicationStatus = stageText(stage);
          }
        }
      } catch (e) {
        // the list's stage stays
      }

      const newsResponse = await request(`${API}/communiques?application=${id}&pagination=false`, {
        headers: headers(token),
      });
      if (!newsResponse.ok) continue;
      const data = await newsResponse.json();
      const members = data && data['hydra:member'];
      if (Array.isArray(members)) {
        news = news.concat(
          members.filter(isMessage).map((item) => ({
            id: item.id,
            title: item.title,
            sentAt: item.sentAt,
            applicationNumber: number,
          })),
        );
      }
    }

    return {
      news,
      applicationNumbers: numbers,
      applicationMeta: meta,
      lastCheck: new Date().toISOString(),
    };
  }

  // ---- badge --------------------------------------------------------------------

  /**
   * The number is how many messages fall into the chosen period. It is blue when
   * the user has seen them all and amber when something came after the popup was
   * last opened.
   */
  async function updateBadge() {
    const [state, settings] = await Promise.all([
      chrome.storage.local.get(['news', 'seenAt', 'lastError']),
      loadSettings(),
    ]);
    if (!isConfigured(settings)) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }
    if (state.lastError) {
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_ERROR });
      await chrome.action.setBadgeText({ text: '!' });
      return;
    }
    const shown = inPeriod(state.news, settings.newsPeriod);
    const seen = state.seenAt ? new Date(state.seenAt) : null;
    const fresh = seen ? shown.some((item) => new Date(item.sentAt) > seen) : false;
    await chrome.action.setBadgeBackgroundColor({ color: fresh ? BADGE_NEW : BADGE_BLUE });
    await chrome.action.setBadgeText({ text: shown.length > 0 ? String(shown.length) : '' });
  }

  // ---- interface text -----------------------------------------------------------

  function t(key, substitutions) {
    const text = chrome.i18n.getMessage(key, substitutions);
    return text || key;
  }

  function locale() {
    return chrome.i18n.getUILanguage ? chrome.i18n.getUILanguage() : 'en';
  }

  /** "12 days" in the interface language: days_one / days_few / days_many / days_other. */
  function daysText(n) {
    let form = 'other';
    try {
      form = new Intl.PluralRules(locale()).select(n);
    } catch (e) {
      // 'other'
    }
    const text = chrome.i18n.getMessage(`days_${form}`, [String(n)]);
    return text || t('days_other', [String(n)]);
  }

  /** Fills data-i18n / data-i18n-placeholder / data-i18n-title in a page. */
  function localize(doc) {
    doc.documentElement.lang = locale().slice(0, 2);
    doc.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    doc.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    doc.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
      el.setAttribute('aria-label', el.title);
    });
  }

  root.PIO = {
    API, SETTING_KEYS, DEFAULT_PERIOD, DEFAULT_UPDATE_HOURS,
    PioError,
    stageText, periodStart, parseNumbers, isConfigured, updateHours,
    isMessage, inPeriod, isDecision, daysBetween,
    loadSettings, saveSettings,
    login, listApplications, fetchAll,
    updateBadge,
    t, locale, daysText, localize,
  };
})(typeof self !== 'undefined' ? self : globalThis);
