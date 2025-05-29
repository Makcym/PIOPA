// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('PIO Application Checker extension installed');
  checkNews();
  chrome.alarms.create('checkNews', { periodInMinutes: 60 * 5 });
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

function getPeriodStart(period) {
  const now = new Date();
  switch (period) {
    case 'all': return new Date(0);
    case '5y': return new Date(now.getFullYear() - 5, now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
    case '4y': return new Date(now.getFullYear() - 4, now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
    case '3y': return new Date(now.getFullYear() - 3, now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
    case '2y': return new Date(now.getFullYear() - 2, now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
    case '1y': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
    case '6m': return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
    case '1m': return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
    case '1w': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '3d': return new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    case '1d': return new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    case '5h': return new Date(now.getTime() - 5 * 60 * 60 * 1000);
    default: return new Date(now.getFullYear() - 3, now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
  }
}

// Function to check news
async function checkNews() {
  try {
    // Get saved settings
    const settings = await chrome.storage.sync.get(['username', 'password', 'applications', 'newsPeriod']);
    
    if (!settings.username || !settings.password || !settings.applications) {
      console.log('Settings not configured');
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    // Get token
    const tokenResponse = await fetch('https://api-przybysz.duw.pl/api/v1/token/obtain', {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Origin': 'https://pio-przybysz.duw.pl',
        'Referer': 'https://pio-przybysz.duw.pl/'
      },
      body: JSON.stringify({
        login: settings.username,
        password: settings.password
      })
    });

    if (!tokenResponse.ok) {
      console.error('Failed to get token');
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    const tokenData = await tokenResponse.json();
    const token = tokenData.token;

    // Get application map (number -> id)
    const applicationNumbers = settings.applications.split(',').map(app => app.trim());
    const appMap = await getApplicationsMap(token);

    // For each applicationNumber, get news by applicationId
    let allNews = [];
    for (const number of applicationNumbers) {
      const appId = appMap[number];
      if (!appId) continue;
      const newsResponse = await fetch(`https://api-przybysz.duw.pl/api/v1/communiques?application=${appId}&pagination=false`, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Origin': 'https://pio-przybysz.duw.pl',
          'Referer': 'https://pio-przybysz.duw.pl/'
        }
      });

      if (!newsResponse.ok) {
        console.error(`Failed to get news for application ${number}`);
        continue;
      }

      const newsData = await newsResponse.json();
      if (newsData['hydra:member'] && Array.isArray(newsData['hydra:member'])) {
        const news = newsData['hydra:member'].map(item => ({
          ...item,
          applicationNumber: number
        }));
        allNews = allNews.concat(news);
      }
    }

    // Store news in storage
    await chrome.storage.local.set({ 
      lastCheck: new Date().toISOString(),
      news: allNews,
      applicationNumbers
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

  } catch (error) {
    console.error('Error checking news:', error);
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
  }
}

async function getApplicationsMap(token) {
  const resp = await fetch('https://api-przybysz.duw.pl/api/v1/applications/proxy?pagination=false&status=3', {
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Origin': 'https://pio-przybysz.duw.pl',
      'Referer': 'https://pio-przybysz.duw.pl/'
    }
  });
  const data = await resp.json();
  const map = {};
  data.forEach(app => {
    map[app.applicationNumber] = app.applicationId;
  });
  return map;
}

// Check news every 5 hours
setInterval(checkNews, 5 * 60 * 60 * 1000); 

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'checkNews') {
    checkNews();
  }
}); 