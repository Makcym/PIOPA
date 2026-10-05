(function () {
  'use strict';
  const { t } = PIO;
  const $ = (id) => document.getElementById(id);

  function showError(text) {
    $('errorMessage').textContent = text;
    $('errorMessage').style.display = text ? 'block' : 'none';
  }

  function errorText(e) {
    const key = { auth: 'errorAuth', network: 'errorNetwork', format: 'errorFormat' }[e && e.code];
    return key ? t(key) : (e && e.message) || t('errorNetwork');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    PIO.localize(document);
    document.title = `PIO Application Checker — ${t('optionsTitle')}`;
    const s = await PIO.loadSettings();
    if (s.username) $('username').value = s.username;
    if (s.password) $('password').value = s.password;
    if (s.applications) $('applications').value = s.applications;
    if (s.newsPeriod) $('newsPeriod').value = s.newsPeriod;
    if (s.autoUpdatePeriod) $('autoUpdatePeriod').value = s.autoUpdatePeriod;
  });

  $('save').addEventListener('click', async () => {
    await PIO.saveSettings({
      username: $('username').value.trim(),
      password: $('password').value,
      applications: PIO.parseNumbers($('applications').value).join(', '),
      newsPeriod: $('newsPeriod').value,
      autoUpdatePeriod: $('autoUpdatePeriod').value,
    });
    $('successMessage').style.display = 'inline';
    chrome.runtime.sendMessage({ type: 'settingsSaved' }).catch(() => {});
    setTimeout(() => window.close(), 1000);
  });

  // Signs in with what is typed in the form and lists the account's applications.
  $('testConnection').addEventListener('click', async () => {
    const username = $('username').value.trim();
    const password = $('password').value;
    const list = $('applicationsList');
    const content = $('applicationsListContent');
    if (!username || !password) { showError(t('enterCredentials')); return; }

    $('testConnection').disabled = true;
    try {
      const token = await PIO.login(username, password);
      const applications = await PIO.listApplications(token);
      content.textContent = '';
      applications.forEach((app) => {
        const row = document.createElement('div');
        row.className = 'app';
        const left = document.createElement('div');
        const number = document.createElement('span');
        number.className = 'app-number';
        number.textContent = app.number;
        const date = document.createElement('span');
        date.className = 'app-date';
        date.textContent = app.acceptedAt
          ? new Date(app.acceptedAt).toLocaleDateString(PIO.locale(), { dateStyle: 'medium' })
          : '';
        left.appendChild(number);
        left.appendChild(date);
        const add = document.createElement('button');
        add.className = 'btn';
        add.textContent = t('add');
        add.onclick = () => {
          const current = PIO.parseNumbers($('applications').value);
          if (!current.includes(app.number)) current.push(app.number);
          $('applications').value = current.join(', ');
        };
        row.appendChild(left);
        row.appendChild(add);
        content.appendChild(row);
      });
      if (!applications.length) content.textContent = t('noApplications');
      list.style.display = 'block';
      showError('');
    } catch (e) {
      showError(errorText(e));
      list.style.display = 'none';
    } finally {
      $('testConnection').disabled = false;
    }
  });
})();
