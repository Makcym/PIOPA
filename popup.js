// The popup shows what the last check stored and asks the service worker for a new
// one. It never signs in to the portal itself.
(function () {
  'use strict';
  const { t } = PIO;
  const statusDiv = document.getElementById('status');
  const listDiv = document.getElementById('newsList');
  const refreshButton = document.getElementById('refreshButton');
  // What the user had seen before this popup opened: newer messages get a "new" mark.
  let seenBefore = null;
  let busy = false;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatDate(value) {
    return new Date(value).toLocaleString(PIO.locale(), { dateStyle: 'medium', timeStyle: 'short' });
  }

  function showSetup() {
    statusDiv.textContent = '';
    statusDiv.className = 'status';
    listDiv.textContent = '';
    const box = el('div', 'empty');
    box.appendChild(el('div', null, t('setupNeeded')));
    const open = el('button', 'btn primary', t('openSettings'));
    open.onclick = () => chrome.runtime.openOptionsPage();
    box.appendChild(open);
    listDiv.appendChild(box);
  }

  function showStatus(state, shown) {
    if (state.lastError) {
      const key = { auth: 'errorAuth', network: 'errorNetwork', format: 'errorFormat' }[state.lastError.code] || 'errorNetwork';
      statusDiv.textContent = t(key);
      statusDiv.className = 'status error';
      return;
    }
    statusDiv.className = 'status';
    if (busy && !state.lastCheck) {
      statusDiv.textContent = t('loading');
      return;
    }
    const parts = [t('foundInPeriod', [String(shown)])];
    if (state.lastCheck) parts.push(t('updatedAt', [formatDate(state.lastCheck)]));
    if (busy) parts.push(t('refreshing'));
    statusDiv.textContent = parts.join(' · ');
  }

  function caseCard(number, meta, messages) {
    const card = el('div', 'case');
    const head = el('div', 'case-head');
    head.appendChild(el('div', 'case-number', t('applicationN', [number])));

    if (!meta || !meta.applicationAcceptedAt) {
      card.appendChild(head);
      card.appendChild(el('div', 'none', t('notInPortal')));
      return card;
    }

    // The clock stops on the decision: days from acceptance to the decision letter,
    // otherwise to today.
    const sorted = [...messages].sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
    const last = sorted[0];
    const until = last && PIO.isDecision(last) ? last.sentAt : null;
    const days = PIO.daysBetween(meta.applicationAcceptedAt, until);
    if (days !== null) head.appendChild(el('div', 'case-days', PIO.daysText(days)));
    card.appendChild(head);

    const info = el('div', 'case-meta');
    if (meta.applicationStatus) info.appendChild(el('span', 'chip', meta.applicationStatus));
    if (meta.applicationInspector) info.appendChild(el('span', null, t('inspector', [meta.applicationInspector])));
    if (info.childNodes.length) card.appendChild(info);

    if (!sorted.length) {
      card.appendChild(el('div', 'none', t('noNews')));
      return card;
    }
    const news = el('div', 'news');
    sorted.forEach((item) => {
      const row = el('div', 'news-item' + (PIO.isDecision(item) ? ' decision' : ''));
      const title = el('div', 'news-title', item.title);
      if (seenBefore && new Date(item.sentAt) > seenBefore) title.appendChild(el('span', 'fresh', t('fresh')));
      row.appendChild(title);
      row.appendChild(el('div', 'news-date', formatDate(item.sentAt)));
      news.appendChild(row);
    });
    card.appendChild(news);
    return card;
  }

  async function render() {
    const settings = await PIO.loadSettings();
    if (!PIO.isConfigured(settings)) { showSetup(); return; }

    const state = await chrome.storage.local.get(['news', 'applicationMeta', 'lastCheck', 'lastError']);
    const period = settings.newsPeriod || PIO.DEFAULT_PERIOD;
    const shown = PIO.inPeriod(state.news, period);
    const meta = state.applicationMeta || {};
    showStatus(state, shown.length);

    listDiv.textContent = '';
    if (!state.lastCheck) {
      if (!state.lastError) listDiv.appendChild(el('div', 'empty', t('loading')));
      return;
    }
    // Every application from the settings is listed, as in 6.0; the period only limits
    // which of its messages are shown.
    PIO.parseNumbers(settings.applications).forEach((number) => {
      listDiv.appendChild(caseCard(number, meta[number], shown.filter((item) => item.applicationNumber === number)));
    });
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    refreshButton.disabled = true;
    await render();
    try {
      await chrome.runtime.sendMessage({ type: 'checkNews' });
    } catch (e) {
      // the service worker answers through storage; a closed channel is not an error
    }
    busy = false;
    refreshButton.disabled = false;
    await render();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    PIO.localize(document);
    const { seenAt } = await chrome.storage.local.get('seenAt');
    seenBefore = seenAt ? new Date(seenAt) : null;

    document.getElementById('settingsButton').onclick = () => chrome.runtime.openOptionsPage();
    refreshButton.onclick = refresh;

    await refresh();

    // Opening the popup is "seeing" the messages: the badge goes back to blue.
    await chrome.storage.local.set({ seenAt: new Date().toISOString() });
    chrome.runtime.sendMessage({ type: 'seen' }).catch(() => {});
  });

  // A check that finished while the popup is open (the timer, the options page).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.lastCheck || changes.lastError) && !busy) render();
  });
})();
