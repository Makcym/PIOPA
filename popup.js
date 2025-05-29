// Function to display news
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

function displayNews(news, applicationNumbers, newsPeriod) {
  const statusDiv = document.getElementById('status');
  const newsListDiv = document.getElementById('newsList');
  
  // Clear previous results
  statusDiv.textContent = '';
  statusDiv.className = '';
  newsListDiv.innerHTML = '';

  // Filter news by period
  const now = new Date();
  const periodStart = getPeriodStart(newsPeriod || '3y');
  const filteredNews = news.filter(item => {
    const sentAt = new Date(item.sentAt);
    return sentAt >= periodStart && sentAt <= now;
  });

  // Update status
  statusDiv.textContent = `Found ${filteredNews.length} news items`;
  statusDiv.className = 'success';

  // Group news by applicationNumber
  const groupedNews = {};
  filteredNews.forEach(item => {
    const appNum = item.applicationNumber;
    if (!groupedNews[appNum]) groupedNews[appNum] = [];
    groupedNews[appNum].push(item);
  });

  // For each applicationNumber from settings, show news or 'No news for application X'
  applicationNumbers.forEach(appNum => {
    const caseHeader = document.createElement('div');
    caseHeader.className = 'case-header';
    caseHeader.textContent = `Case ${appNum}`;
    caseHeader.style.fontWeight = 'bold';
    caseHeader.style.marginTop = '10px';
    caseHeader.style.marginBottom = '5px';
    newsListDiv.appendChild(caseHeader);

    const caseNews = groupedNews[appNum] || [];
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

    // Display all news filtered by period
    displayNews(allNews, applicationNumbers, settings.newsPeriod || '3y');

  } catch (error) {
    statusDiv.textContent = 'Error: ' + (error.message || 'Failed to get news');
    statusDiv.className = 'error';
    newsListDiv.innerHTML = '';
  }
}

// Load news when popup opens
document.addEventListener('DOMContentLoaded', () => {
  checkNews(); // Always update news on popup open

  document.getElementById('settingsButton').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('refreshButton').addEventListener('click', () => {
    checkNews();
  });
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'checkNews') {
    checkNews();
  }
}); 