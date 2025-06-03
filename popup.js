// Function to display news
function getDaysSince(dateString, untilDate) {
  if (!dateString) return null;
  const accepted = new Date(dateString);
  const until = untilDate ? new Date(untilDate) : new Date();
  const diff = Math.floor((until - accepted) / (1000 * 60 * 60 * 24));
  return diff;
}

function getPeriodStart(period) {
  const now = new Date();
  switch (period) {
    case 'all': return new Date(0);
    case '5y': {
      const date = new Date(now);
      date.setFullYear(date.getFullYear() - 5);
      return date;
    }
    case '4y': {
      const date = new Date(now);
      date.setFullYear(date.getFullYear() - 4);
      return date;
    }
    case '3y': {
      const date = new Date(now);
      date.setFullYear(date.getFullYear() - 3);
      return date;
    }
    case '2y': {
      const date = new Date(now);
      date.setFullYear(date.getFullYear() - 2);
      return date;
    }
    case '1y': {
      const date = new Date(now);
      date.setFullYear(date.getFullYear() - 1);
      return date;
    }
    case '6m': {
      const date = new Date(now);
      date.setMonth(date.getMonth() - 6);
      return date;
    }
    case '1m': {
      const date = new Date(now);
      date.setMonth(date.getMonth() - 1);
      return date;
    }
    case '1w': {
      const date = new Date(now);
      date.setDate(date.getDate() - 7);
      return date;
    }
    case '3d': {
      const date = new Date(now);
      date.setDate(date.getDate() - 3);
      return date;
    }
    case '1d': {
      const date = new Date(now);
      date.setDate(date.getDate() - 1);
      return date;
    }
    case '5h': {
      const date = new Date(now);
      date.setHours(date.getHours() - 5);
      return date;
    }
    default: {
      const date = new Date(now);
      date.setFullYear(date.getFullYear() - 3);
      return date;
    }
  }
}

function displayNews(news, applicationNumbers, newsPeriod, applicationMeta) {
  const statusDiv = document.getElementById('status');
  const newsListDiv = document.getElementById('newsList');
  
  // Clear previous results
  statusDiv.textContent = '';
  statusDiv.className = '';
  newsListDiv.innerHTML = '';

  // Filter news by period and ensure they are valid news items
  const now = new Date();
  const periodStart = getPeriodStart(newsPeriod || '3y');
  console.log('Period start:', periodStart.toISOString());
  console.log('Now:', now.toISOString());
  
  const filteredNews = news.filter(item => {
    const sentAt = new Date(item.sentAt);
    console.log('News item:', item.title, 'sent at:', sentAt.toISOString());
    const isInPeriod = sentAt >= periodStart && sentAt <= now;
    console.log('Is in period:', isInPeriod);
    return isInPeriod;
  });

  console.log('Filtered news count:', filteredNews.length);
  console.log('Original news count:', news.length);

  // Group news by applicationNumber
  const groupedNews = {};
  filteredNews.forEach(item => {
    const appNum = item.applicationNumber;
    if (!groupedNews[appNum]) groupedNews[appNum] = [];
    groupedNews[appNum].push(item);
  });

  // Используем все номера заявок из настроек
  const filteredAppNumbers = applicationNumbers;
  console.log('Application numbers:', filteredAppNumbers);

  // Update status (счётчик новостей за диапазон)
  statusDiv.textContent = `Found ${filteredNews.length} news item${filteredNews.length === 1 ? '' : 's'}`;
  statusDiv.className = 'success';

  // For each applicationNumber from settings, show news or 'No news for application X'
  filteredAppNumbers.forEach(appNum => {
    const meta = applicationMeta && applicationMeta[appNum] ? applicationMeta[appNum] : {};
    const caseNews = groupedNews[appNum] || [];
    let inspector = meta.applicationInspector || '';
    let headerText = `Application ${appNum}`;
    // Если последняя новость Decyzja — дни до неё, иначе до текущей даты
    let showDays = true;
    let days = null;
    if (caseNews.length > 0) {
      // Последняя новость — самая свежая по дате
      const lastNews = [...caseNews].sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))[0];
      if (lastNews.title && lastNews.title.toLowerCase().includes('decyzja')) {
        showDays = true;
        days = getDaysSince(meta.applicationAcceptedAt, lastNews.sentAt);
      } else {
        days = getDaysSince(meta.applicationAcceptedAt);
      }
    } else {
      days = getDaysSince(meta.applicationAcceptedAt);
    }
    if (showDays && days !== null && !isNaN(days)) {
      headerText += ` (${days} days)`;
    }
    const caseHeader = document.createElement('div');
    caseHeader.className = 'case-header';
    caseHeader.textContent = headerText;
    caseHeader.style.fontWeight = 'bold';
    caseHeader.style.marginTop = '10px';
    caseHeader.style.marginBottom = '5px';
    newsListDiv.appendChild(caseHeader);

    if (caseNews.length > 0) {
      caseNews.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
      caseNews.forEach(item => {
        const newsItem = document.createElement('div');
        newsItem.className = 'news-item';

        // If title contains 'Decyzja', make background slightly green
        if (item.title && item.title.toLowerCase().includes('decyzja')) {
          newsItem.style.backgroundColor = '#e0f7e9';
        }

        const title = document.createElement('div');
        title.className = 'news-title';
        title.textContent = item.title;

        // Add inspector after title in light gray
        if (inspector) {
          const insp = document.createElement('span');
          insp.textContent = ` (${inspector})`;
          insp.style.color = '#b0b0b0';
          insp.style.fontWeight = 'normal';
          title.appendChild(insp);
        }

        const date = document.createElement('div');
        date.className = 'news-date';
        date.textContent = new Date(item.sentAt).toLocaleString();

        newsItem.appendChild(title);
        newsItem.appendChild(date);
        newsListDiv.appendChild(newsItem);
      });
    } else {
      const noNews = document.createElement('div');
      noNews.className = 'no-news';
      noNews.textContent = `No news for application ${appNum}`;
      newsListDiv.appendChild(noNews);
    }
  });
}

// Function to show settings required message
function showSettingsRequired() {
  const statusDiv = document.getElementById('status');
  const newsListDiv = document.getElementById('newsList');
  
  statusDiv.textContent = '';
  statusDiv.className = '';
  newsListDiv.innerHTML = `
    <div class="settings-required">
      Please configure your settings first.<br>
      Click the Settings button to set up your credentials and application numbers.
    </div>
  `;
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

// Function to check news
async function checkNews() {
  const statusDiv = document.getElementById('status');
  const newsListDiv = document.getElementById('newsList');
  
  // Show loading state
  statusDiv.textContent = '';
  statusDiv.className = '';
  newsListDiv.innerHTML = '<div class="loading">Loading news...</div>';

  try {
    // Get saved settings
    const settings = await chrome.storage.sync.get(['username', 'password', 'applications', 'newsPeriod']);
    if (!settings.username || !settings.password || !settings.applications) {
      showSettingsRequired();
      return;
    }

    // Получаем валидный токен через background script
    const token = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'getToken' }, response => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.token);
        }
      });
    });

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
      if (!newsResponse.ok) continue;
      const newsData = await newsResponse.json();
      if (newsData['hydra:member'] && Array.isArray(newsData['hydra:member'])) {
        // Filter and add only valid news items
        const validNews = newsData['hydra:member']
          .filter(item => item && item.title && item.sentAt && typeof item.title === 'string' && item.title.trim() !== '')
          .map(item => ({
            ...item,
            applicationNumber: number
          }));
        allNews = allNews.concat(validNews);
      }
    }

    // Get applicationMeta from storage (it will be set by background.js)
    const metaResult = await chrome.storage.local.get(['applicationMeta']);
    const applicationMeta = metaResult.applicationMeta || {};

    // Store news in storage
    await chrome.storage.local.set({ 
      lastCheck: new Date().toISOString(),
      news: allNews,
      applicationNumbers
    });

    // Display all news filtered by period
    displayNews(allNews, applicationNumbers, settings.newsPeriod || '3y', applicationMeta);

  } catch (error) {
    statusDiv.textContent = 'Error: ' + (error.message || 'Failed to get news');
    statusDiv.className = 'error';
    newsListDiv.innerHTML = '';
  }
}

// Load news when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  // Get applicationMeta from storage for display
  const metaResult = await chrome.storage.local.get(['applicationMeta']);
  const applicationMeta = metaResult.applicationMeta || {};
  checkNewsWithMeta(applicationMeta);

  document.getElementById('settingsButton').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('refreshButton').addEventListener('click', () => {
    checkNews();
  });
});

async function checkNewsWithMeta(applicationMeta) {
  const statusDiv = document.getElementById('status');
  const newsListDiv = document.getElementById('newsList');
  
  // Show loading state
  statusDiv.textContent = '';
  statusDiv.className = '';
  newsListDiv.innerHTML = '<div class="loading">Loading news...</div>';

  try {
    // Get saved settings
    const settings = await chrome.storage.sync.get(['username', 'password', 'applications', 'newsPeriod']);
    if (!settings.username || !settings.password || !settings.applications) {
      showSettingsRequired();
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
      throw new Error('Failed to get token');
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
      if (!newsResponse.ok) continue;
      const newsData = await newsResponse.json();
      if (newsData['hydra:member'] && Array.isArray(newsData['hydra:member'])) {
        // Filter and add only valid news items
        const validNews = newsData['hydra:member']
          .filter(item => item && item.title && item.sentAt && typeof item.title === 'string' && item.title.trim() !== '')
          .map(item => ({
            ...item,
            applicationNumber: number
          }));
        allNews = allNews.concat(validNews);
      }
    }

    // Store news in storage
    await chrome.storage.local.set({ 
      lastCheck: new Date().toISOString(),
      news: allNews,
      applicationNumbers
    });

    // Display all news filtered by period
    displayNews(allNews, applicationNumbers, settings.newsPeriod || '3y', applicationMeta);

  } catch (error) {
    statusDiv.textContent = 'Error: ' + (error.message || 'Failed to get news');
    statusDiv.className = 'error';
    newsListDiv.innerHTML = '';
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'checkNews') {
    checkNews();
  }
}); 