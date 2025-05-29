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
  const filteredNews = news.filter(item => {
    // Check that this is a valid news item
    if (!item || !item.title || !item.sentAt || typeof item.title !== 'string' || item.title.trim() === '') {
      return false;
    }
    const sentAt = new Date(item.sentAt);
    if (isNaN(sentAt.getTime())) {
      return false;
    }
    return sentAt >= periodStart && sentAt <= now;
  });

  // Group news by applicationNumber
  const groupedNews = {};
  filteredNews.forEach(item => {
    const appNum = item.applicationNumber;
    if (!groupedNews[appNum]) groupedNews[appNum] = [];
    groupedNews[appNum].push(item);
  });

  // Filter applicationNumbers: только те, у которых заявка принята после начала периода
  const filteredAppNumbers = applicationNumbers.filter(appNum => {
    const meta = applicationMeta && applicationMeta[appNum] ? applicationMeta[appNum] : {};
    if (!meta.applicationAcceptedAt) return false;
    const accepted = new Date(meta.applicationAcceptedAt);
    return accepted >= periodStart;
  });

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
  data.forEach(app => {
    map[app.applicationNumber] = app.applicationId;
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