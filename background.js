// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('PIO News Checker extension installed');
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'status') {
    // Forward status messages to popup if it's open
    chrome.runtime.sendMessage(message);
  }
});

// Function to check news
async function checkNews() {
  try {
    // Get saved settings
    const settings = await chrome.storage.sync.get(['username', 'password', 'applications']);
    
    if (!settings.username || !settings.password || !settings.applications) {
      console.log('Settings not configured');
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
      const news = newsData['hydra:member'];
      allNews = allNews.concat(news);
    }

    // Filter news for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayNews = allNews.filter(item => {
      const newsDate = new Date(item.sentAt);
      return newsDate >= today;
    });

    // Update badge with count
    if (todayNews.length > 0) {
      chrome.action.setBadgeText({ text: todayNews.length.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }

    // Store news in storage for popup
    chrome.storage.local.set({ 
      lastCheck: new Date().toISOString(),
      news: allNews,
      todayNews: todayNews
    });

  } catch (error) {
    console.error('Error checking news:', error);
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
  }
}

// Check news immediately when extension is installed/updated
checkNews();

// Check news every 5 hours
setInterval(checkNews, 5 * 60 * 60 * 1000); 