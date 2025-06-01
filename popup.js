// Function to display news
function getDaysSince(dateString, untilDate) {
  if (!dateString) return null;
  const accepted = new Date(dateString);
  const until = untilDate ? new Date(untilDate) : new Date();
  const diff = Math.floor((until - accepted) / (1000 * 60 * 60 * 24));
  return diff;
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

  // Filter applicationNumbers: only those that have news in the filteredNews
  const appNumbersToDisplay = applicationNumbers.filter(appNum => {
    return filteredNews.some(newsItem => newsItem.applicationNumber === appNum);
  });

  // Update status (счётчик новостей за диапазон)
  statusDiv.textContent = `Found ${filteredNews.length} news item${filteredNews.length === 1 ? '' : 's'}`;
  statusDiv.className = 'success';

  // For each applicationNumber that has news in the selected period, show news or 'No news for application X'
  appNumbersToDisplay.forEach(appNum => {
    const meta = applicationMeta && applicationMeta[appNum] ? applicationMeta[appNum] : {};
    // Ensure caseNews is also filtered by the period by taking from filteredNews
    const caseNews = filteredNews.filter(item => item.applicationNumber === appNum) || [];
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

// Unified function to refresh news data
async function refreshNewsData() {
  const statusDiv = document.getElementById('status');
  const newsListDiv = document.getElementById('newsList');

  statusDiv.textContent = '';
  statusDiv.className = '';
  newsListDiv.innerHTML = '<div class="loading">Loading news...</div>';

  try {
    const settings = await chrome.storage.sync.get(['username', 'password', 'applications', 'newsPeriod']);
    if (!settings.username || !settings.password || !settings.applications) {
      showSettingsRequired();
      return;
    }

    const tokenData = await fetchPioApi('token/obtain', {
      method: 'POST',
      body: JSON.stringify({
        login: settings.username,
        password: settings.password
      })
    });
    const token = tokenData.token;

    const applicationNumbers = settings.applications.split(',').map(app => app.trim());
    const appMap = await getApplicationsMap(token);

    let allNews = [];
    for (const number of applicationNumbers) {
      const appId = appMap[number];
      if (!appId) {
        console.warn(`No appId found for application number: ${number}. Skipping.`);
        continue;
      }
      // Constructing endpoint for fetching news for a specific application
      const newsEndpoint = `communiques?application=${appId}&pagination=false`;
      const newsData = await fetchPioApi(newsEndpoint, {}, token);
      if (newsData && newsData['hydra:member'] && Array.isArray(newsData['hydra:member'])) {
        const validNews = newsData['hydra:member']
          .filter(item => item && item.title && item.sentAt && typeof item.title === 'string' && item.title.trim() !== '')
          .map(item => ({ ...item, applicationNumber: number }));
        allNews = allNews.concat(validNews);
      }
    }

    const metaResult = await chrome.storage.local.get(['applicationMeta']);
    const applicationMeta = metaResult.applicationMeta || {};

    await chrome.storage.local.set({
      lastCheck: new Date().toISOString(), // Note: popup primarily reads, background writes this. Consider if needed here.
      news: allNews, // Same as above.
      applicationNumbers // Same as above.
    });

    displayNews(allNews, applicationNumbers, settings.newsPeriod || '3y', applicationMeta);

  } catch (error) {
    console.error('Error in refreshNewsData:', error);
    statusDiv.textContent = 'Error: ' + (error.message || 'Failed to get news. Check console for details.');
    statusDiv.className = 'error';
    newsListDiv.innerHTML = '';
  }
}

// Load news when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  refreshNewsData(); // Directly call the unified function

  document.getElementById('settingsButton').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('refreshButton').addEventListener('click', () => {
    refreshNewsData(); // Call the unified function
  });
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'checkNews') {
    refreshNewsData(); // Call the unified function
  }
  // It's good practice to return true for async sendResponse, though not used here.
  return true;
}); 