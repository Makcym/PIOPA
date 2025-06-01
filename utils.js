async function fetchPioApi(endpoint, options = {}, token = null) {
  const baseUrl = 'https://api-przybysz.duw.pl/api/v1/';
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Origin': 'https://pio-przybysz.duw.pl',
    'Referer': 'https://pio-przybysz.duw.pl/',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers: headers,
  };

  const response = await fetch(`${baseUrl}${endpoint}`, config);

  if (!response.ok) {
    const errorData = await response.text(); // Try to get more error info
    throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorData}`);
  }

  // For 'token/obtain', the response might be text/plain if error, handle it
  // However, successful token is application/json
  // For other JSON responses, this will work.
  // If an endpoint legitimately returns non-JSON on success, this needs adjustment.
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.indexOf("application/json") !== -1) {
    return response.json();
  }
  return response.text(); // Or handle as per specific endpoint needs if non-JSON success
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

async function getApplicationsMap(token) {
  // Endpoint to get all applications (status=3 means 'accepted')
  const endpoint = 'applications/proxy?pagination=false&status=3';
  const data = await fetchPioApi(endpoint, {}, token);

  const map = {};
  if (Array.isArray(data)) { // Ensure data is an array as expected
    data.forEach(app => {
      map[app.applicationNumber] = app.applicationId;
    });
  } else {
    console.error("getApplicationsMap: Expected an array but received:", data);
    // Depending on strictness, could throw an error here
    // throw new Error("Failed to retrieve applications correctly.");
  }
  return map;
}
