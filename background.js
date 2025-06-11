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
  } else if (message.type === 'getToken') {
    // Получаем настройки и возвращаем валидный токен
    chrome.storage.sync.get(['username', 'password'], async (settings) => {
      try {
        const token = await ensureValidToken(settings.username, settings.password);
        sendResponse({ token });
      } catch (error) {
        sendResponse({ error: error.message });
      }
    });
    return true; // Указываем, что ответ будет асинхронным
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

// Функция для получения нового токена
async function getNewToken(username, password) {
  const tokenResponse = await fetch('https://api-przybysz.duw.pl/api/v1/token/obtain', {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'Origin': 'https://pio-przybysz.duw.pl',
      'Referer': 'https://pio-przybysz.duw.pl/'
    },
    body: JSON.stringify({
      login: username,
      password: password
    })
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to get token');
  }

  const tokenData = await tokenResponse.json();
  return tokenData.token;
}

// Функция для проверки и обновления токена - всегда получаем свежий токен
async function ensureValidToken(username, password) {
  try {
    // Всегда получаем новый токен при каждом запросе для надежности
    console.log('Getting fresh token for user:', username);
    const newToken = await getNewToken(username, password);
    
    // Сохраняем новый токен и время его получения
    const now = Date.now();
    await chrome.storage.sync.set({
      token: newToken,
      tokenTimestamp: now
    });
    
    console.log('Fresh token obtained successfully');
    return newToken;
  } catch (error) {
    console.error('Error ensuring valid token:', error);
    throw error;
  }
}

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

    // Получаем валидный токен
    const token = await ensureValidToken(settings.username, settings.password);

    // Get application map (number -> id)
    const applicationNumbers = settings.applications.split(',').map(app => app.trim());
    const appMap = await getApplicationsMap(token);

    // Получить мета-данные заявок
    const appMeta = {};
    const allAppsResp = await fetch('https://api-przybysz.duw.pl/api/v1/applications/proxy?pagination=false&status=3', {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Origin': 'https://pio-przybysz.duw.pl',
        'Referer': 'https://pio-przybysz.duw.pl/'
      }
    });
    const allApps = await allAppsResp.json();
    // Проверяем, что allApps это массив или объект с hydra:member
    const applicationsData = Array.isArray(allApps) ? allApps : (allApps['hydra:member'] || []);
    applicationsData.forEach(app => {
      if (app && app.applicationNumber) {
        appMeta[app.applicationNumber] = {
          applicationAcceptedAt: app.applicationAcceptedAt,
          applicationInspector: app.applicationInspector
        };
      }
    });

    // For each applicationNumber, get news by applicationId
    let allNews = [];
    for (const number of applicationNumbers) {
      const appId = appMap[number];
      if (!appId) {
        console.log(`No appId found for application number: ${number}. Skipping.`);
        continue;
      }
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
      applicationNumbers,
      applicationMeta: appMeta
    });

    // Count news for selected period and display on badge
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
    
    console.log(`Badge updated with ${count} news items for period ${period}`);

    // После выполнения — обновить alarm
    let autoUpdatePeriod = parseFloat(settings.autoUpdatePeriod);
    if (isNaN(autoUpdatePeriod) || autoUpdatePeriod <= 0) autoUpdatePeriod = 3; // default 3 hours
    chrome.alarms.clear('checkNews', () => {
      chrome.alarms.create('checkNews', { periodInMinutes: autoUpdatePeriod * 60 });
    });

  } catch (error) {
    console.error('Error checking news:', error);
    // Очищаем значок при ошибке, чтобы он не "застревал"
    chrome.action.setBadgeText({ text: '' });
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
  
  // Проверяем, что data это массив или объект с hydra:member
  const applications = Array.isArray(data) ? data : (data['hydra:member'] || []);
  
  applications.forEach(app => {
    if (app && app.applicationNumber) {
      map[app.applicationNumber] = app.applicationId;
    }
  });
  
  return map;
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'checkNews') {
    checkNews();
  }
});