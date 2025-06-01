importScripts('utils.js');

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('PIO Application Checker extension installed');
  checkNews();
  const settings = await chrome.storage.sync.get(['autoUpdatePeriod']);
  let period = parseFloat(settings.autoUpdatePeriod);
  if (isNaN(period) || period <= 0) period = 3;
  chrome.alarms.create('checkNews', { periodInMinutes: period * 60 });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'status') {
    // Forward status messages to popup if it's open
    chrome.runtime.sendMessage(message);
  } else if (message.type === 'checkNews') {
    checkNews();
  }
});

// Function to check news
async function checkNews() {
  try {
    // Get saved settings
    const settings = await chrome.storage.sync.get(['username', 'password', 'applications', 'newsPeriod', 'autoUpdatePeriod']);
    
    if (!settings.username || !settings.password || !settings.applications) {
      console.log('Settings not configured');
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    // Get token
    const tokenData = await fetchPioApi('token/obtain', {
      method: 'POST',
      body: JSON.stringify({
        login: settings.username,
        password: settings.password
      })
    });
    const token = tokenData.token; // Assuming tokenData structure is { token: "..." }

    // Get application map (number -> id)
    const applicationNumbers = settings.applications.split(',').map(app => app.trim());
    const appMap = await getApplicationsMap(token);

    // Получить мета-данные заявок
    const appMeta = {};
    // Using fetchPioApi for getting all application details for metadata
    const allApps = await fetchPioApi('applications/proxy?pagination=false&status=3', {}, token);

    if (Array.isArray(allApps)) {
      allApps.forEach(app => {
        appMeta[app.applicationNumber] = {
          applicationAcceptedAt: app.applicationAcceptedAt,
          applicationInspector: app.applicationInspector
        };
      });
    } else {
      console.error("checkNews (background): Expected allApps to be an array but received:", allApps);
      // Decide if to throw or proceed with empty appMeta
    }

    // For each applicationNumber, get news by applicationId
    let allNews = [];
    for (const number of applicationNumbers) {
      const appId = appMap[number];
      if (!appId) {
        console.warn(`No appId found for application number in background: ${number}. Skipping.`);
        continue;
      }
      const newsEndpoint = `communiques?application=${appId}&pagination=false`;
      try {
        const newsData = await fetchPioApi(newsEndpoint, {}, token);
        if (newsData && newsData['hydra:member'] && Array.isArray(newsData['hydra:member'])) {
          const news = newsData['hydra:member'].map(item => ({
            ...item,
            applicationNumber: number
          }));
          allNews = allNews.concat(news);
        }
      } catch (e) {
        console.error(`Failed to get news for application ${number}: ${e.message}`);
        // Continue to next application if one fails
      }
    }

    // Store news in storage
    await chrome.storage.local.set({ 
      lastCheck: new Date().toISOString(),
      news: allNews,
      applicationNumbers,
      applicationMeta: appMeta
    });

    // Count news for selected period
    const now = new Date();
    const period = settings.newsPeriod || '3y';
    const periodStart = getPeriodStart(period);
    const newsInPeriod = allNews.filter(item => {
      const sentAt = new Date(item.sentAt);
      return sentAt >= periodStart && sentAt <= now;
    });
    const count = newsInPeriod.length;
    chrome.action.setBadgeBackgroundColor({ color: '#2196F3' });
    chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });

    // После выполнения — обновить alarm
    let autoUpdatePeriod = parseFloat(settings.autoUpdatePeriod);
    if (isNaN(autoUpdatePeriod) || autoUpdatePeriod <= 0) autoUpdatePeriod = 3; // default 3 hours
    chrome.alarms.clear('checkNews', () => {
      chrome.alarms.create('checkNews', { periodInMinutes: autoUpdatePeriod * 60 });
    });

  } catch (error) {
    console.error('Error checking news:', error);
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
  }
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'checkNews') {
    checkNews();
  }
}); 