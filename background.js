// Service worker: checks the portal on a timer and keeps the badge up to date.
// All portal calls and the badge logic are in core.js.
importScripts('core.js');

const ALARM = 'checkNews';
let running = null;

async function schedule() {
  const settings = await PIO.loadSettings();
  await chrome.alarms.clear(ALARM);
  await chrome.alarms.create(ALARM, { periodInMinutes: PIO.updateHours(settings) * 60 });
}

async function check() {
  const settings = await PIO.loadSettings();
  if (!PIO.isConfigured(settings)) {
    await chrome.action.setBadgeText({ text: '' });
    return { ok: false, error: 'setup' };
  }
  try {
    const data = await PIO.fetchAll(settings);
    const { seenAt } = await chrome.storage.local.get('seenAt');
    // First successful check: everything already in the portal counts as seen.
    if (!seenAt) data.seenAt = data.lastCheck;
    await chrome.storage.local.set({ ...data, lastError: null });
    await PIO.updateBadge();
    return { ok: true };
  } catch (e) {
    const code = e && e.code ? e.code : 'network';
    await chrome.storage.local.set({ lastError: { code, at: new Date().toISOString() } });
    await PIO.updateBadge();
    return { ok: false, error: code };
  }
}

// Two triggers at once (the timer and an open popup) share one run.
function checkOnce() {
  if (!running) running = check().finally(() => { running = null; });
  return running;
}

chrome.runtime.onInstalled.addListener(() => { schedule(); checkOnce(); });
chrome.runtime.onStartup.addListener(() => { schedule(); checkOnce(); });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) checkOnce();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;
  if (message.type === 'checkNews') {
    checkOnce().then(sendResponse);
    return true; // the answer comes later
  }
  if (message.type === 'settingsSaved') {
    schedule().then(checkOnce).then(sendResponse);
    return true;
  }
  if (message.type === 'seen') {
    PIO.updateBadge().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
