// Function to display news
function displayNews(news) {
  const statusDiv = document.getElementById('status');
  const newsListDiv = document.getElementById('newsList');
  
  // Clear previous results
  statusDiv.textContent = '';
  statusDiv.className = '';
  newsListDiv.innerHTML = '';

  // Update status
  statusDiv.textContent = `Found ${news.length} news items`;
  statusDiv.className = 'success';
  
  // Display news items
  if (news.length > 0) {
    // Sort news by date (newest first)
    news.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
    
    news.forEach(item => {
      const newsItem = document.createElement('div');
      newsItem.className = 'news-item';
      
      const title = document.createElement('a');
      title.className = 'news-title';
      title.textContent = item.title;
      title.href = `https://pio-przybysz.duw.pl/szczegoly-wniosku/${item.application}`;
      title.target = '_blank'; // Open in new tab
      
      const date = document.createElement('div');
      date.className = 'news-date';
      date.textContent = new Date(item.sentAt).toLocaleString();
      
      newsItem.appendChild(title);
      newsItem.appendChild(date);
      newsListDiv.appendChild(newsItem);
    });
  } else {
    newsListDiv.innerHTML = '<div class="no-news">No news found</div>';
  }
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
    const settings = await chrome.storage.sync.get(['username', 'password', 'applications']);
    
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

    // Get news for all applications
    const applications = settings.applications.split(',').map(app => app.trim());
    let allNews = [];

    for (const application of applications) {
      const newsResponse = await fetch(`https://api-przybysz.duw.pl/api/v1/communiques?application=${application}&pagination=false`, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Origin': 'https://pio-przybysz.duw.pl',
          'Referer': 'https://pio-przybysz.duw.pl/'
        }
      });

      if (!newsResponse.ok) {
        console.error(`Failed to get news for application ${application}`);
        continue;
      }

      const newsData = await newsResponse.json();
      const news = newsData['hydra:member'].map(item => ({
        ...item,
        application // Add application number to each news item
      }));
      allNews = allNews.concat(news);
    }

    // Store news in storage
    chrome.storage.local.set({ 
      lastCheck: new Date().toISOString(),
      news: allNews
    });

    // Display all news
    displayNews(allNews);

  } catch (error) {
    console.error('Error:', error);
    statusDiv.textContent = 'Error: ' + (error.message || 'Failed to get news');
    statusDiv.className = 'error';
    newsListDiv.innerHTML = '';
  }
}

// Load news when popup opens
document.addEventListener('DOMContentLoaded', () => {
  // First try to get stored news
  chrome.storage.local.get(['lastCheck', 'news'], (result) => {
    if (result.news) {
      displayNews(result.news);
      
      // Add last check time
      const lastCheck = new Date(result.lastCheck);
      const statusDiv = document.getElementById('status');
      statusDiv.textContent += ` (Last check: ${lastCheck.toLocaleTimeString()})`;
    } else {
      // If no stored news, fetch new data
      checkNews();
    }
  });

  // Add settings button handler
  document.getElementById('settingsButton').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const statusDiv = document.getElementById('status');
  
  if (message.type === 'status') {
    statusDiv.textContent = message.text;
    statusDiv.className = message.success ? 'success' : 'error';
  }
}); 