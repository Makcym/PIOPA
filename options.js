// Load saved settings when the page loads
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['username', 'password', 'applications', 'newsPeriod', 'autoUpdatePeriod'], (result) => {
    if (result.username) document.getElementById('username').value = result.username;
    if (result.password) document.getElementById('password').value = result.password;
    if (result.applications) document.getElementById('applications').value = result.applications;
    if (result.newsPeriod) document.getElementById('newsPeriod').value = result.newsPeriod;
    if (result.autoUpdatePeriod) document.getElementById('autoUpdatePeriod').value = result.autoUpdatePeriod;
  });
});

// Save settings when the save button is clicked
document.getElementById('save').addEventListener('click', () => {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const applications = document.getElementById('applications').value;
  const newsPeriod = document.getElementById('newsPeriod').value;
  const autoUpdatePeriod = document.getElementById('autoUpdatePeriod').value;

  chrome.storage.sync.set({
    username,
    password,
    applications,
    newsPeriod,
    autoUpdatePeriod
  }, () => {
    const successMessage = document.getElementById('successMessage');
    successMessage.style.display = 'block';
    
    // Close options page after 1 second
    setTimeout(() => {
      window.close();
    }, 1000);

    // Trigger news check in background
    chrome.runtime.sendMessage({ type: 'checkNews' });
  });
});

// Format date to Polish format
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

// Test connection and fetch applications list
document.getElementById('testConnection').addEventListener('click', async () => {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const errorMessage = document.getElementById('errorMessage');
  const applicationsList = document.getElementById('applicationsList');
  const applicationsListContent = document.getElementById('applicationsListContent');

  if (!username || !password) {
    errorMessage.textContent = 'Please enter email and password';
    errorMessage.style.display = 'block';
    return;
  }

  try {
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
        login: username,
        password: password
      })
    });

    if (!tokenResponse.ok) {
      throw new Error('Invalid email or password');
    }

    const tokenData = await tokenResponse.json();
    const token = tokenData.token;

    // Get applications list
    const applicationsResponse = await fetch('https://api-przybysz.duw.pl/api/v1/applications', {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Origin': 'https://pio-przybysz.duw.pl',
        'Referer': 'https://pio-przybysz.duw.pl/'
      }
    });

    if (!applicationsResponse.ok) {
      throw new Error('Failed to get applications list');
    }

    const applicationsData = await applicationsResponse.json();
    const applications = applicationsData['hydra:member'];

    // Sort applications by date (newest first)
    applications.sort((a, b) => new Date(b.acceptedAt) - new Date(a.acceptedAt));

    // Display applications list
    applicationsListContent.innerHTML = '';
    applications.forEach(app => {
      const appElement = document.createElement('div');
      appElement.className = 'application-item';
      
      const numberSpan = document.createElement('span');
      numberSpan.className = 'application-number';
      numberSpan.textContent = `Application ${app.number}`;
      
      const dateSpan = document.createElement('span');
      dateSpan.className = 'application-date';
      dateSpan.textContent = formatDate(app.acceptedAt);
      
      // Add button
      const addButton = document.createElement('button');
      addButton.textContent = 'Add';
      addButton.style.background = '#2196F3';
      addButton.style.color = 'white';
      addButton.style.border = 'none';
      addButton.style.padding = '6px 12px';
      addButton.style.borderRadius = '4px';
      addButton.style.cursor = 'pointer';
      addButton.style.marginLeft = '10px';
      addButton.onclick = () => {
        const applicationsInput = document.getElementById('applications');
        const currentValue = applicationsInput.value;
        const newValue = currentValue ? `${currentValue}, ${app.number}` : app.number;
        applicationsInput.value = newValue;
      };
      
      appElement.appendChild(numberSpan);
      appElement.appendChild(dateSpan);
      appElement.appendChild(addButton);
      
      applicationsListContent.appendChild(appElement);
    });

    applicationsList.style.display = 'block';
    errorMessage.style.display = 'none';

  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.style.display = 'block';
    applicationsList.style.display = 'none';
  }
}); 