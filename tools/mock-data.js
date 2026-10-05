// A made-up account for the tests, the screenshots and the video. Nothing here comes
// from a real person: numbers, names and dates are invented. The shapes follow what
// core.js reads from the portal's answers.
(function (root) {
  const DAY = 24 * 60 * 60 * 1000;
  const ago = (days, hour = 10, minute = 15) => {
    const d = new Date(Date.now() - days * DAY);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  root.PIO_MOCK = {
    login: 'anna.nowak@example.com',
    password: 'correct-horse',
    token: 'mock-token',
    applications: [
      { id: 501, number: '2026/04812', acceptedAt: ago(142), stage: 7, inspector: 'M. Wiśniewska' },
      { id: 502, number: '2026/11307', acceptedAt: ago(38), stage: 5, inspector: 'P. Zieliński' },
    ],
    communiques: {
      501: [
        { id: 9001, title: 'Wniosek został zarejestrowany', sentAt: ago(142, 9, 5) },
        { id: 9002, title: 'Wezwanie do uzupełnienia dokumentów', sentAt: ago(96, 13, 40) },
        { id: 9003, title: 'Dokumenty zostały dołączone do akt sprawy', sentAt: ago(81, 11, 20) },
        { id: 9004, title: 'Decyzja została wydana', sentAt: ago(3, 14, 30) },
      ],
      502: [
        { id: 9101, title: 'Wniosek został zarejestrowany', sentAt: ago(38, 10, 0) },
        { id: 9102, title: 'Wyznaczono termin złożenia odcisków palców', sentAt: ago(12, 15, 45) },
      ],
    },
  };

  /** What the portal would answer. `url` is absolute; returns { status, body }. */
  root.PIO_MOCK.answer = function (url, options) {
    const m = root.PIO_MOCK;
    const u = new URL(url);
    const p = u.pathname.replace(/^\/api\/v1/, '');
    const auth = (options && options.headers && (options.headers.Authorization || options.headers.authorization)) || '';
    if (p === '/token/obtain') {
      const body = JSON.parse((options && options.body) || '{}');
      return body.login === m.login && body.password === m.password
        ? { status: 200, body: { token: m.token } }
        : { status: 401, body: { code: 401, message: 'Invalid credentials.' } };
    }
    if (auth !== `Bearer ${m.token}`) return { status: 401, body: { code: 401 } };
    if (p === '/applications/proxy') {
      return {
        status: 200,
        body: m.applications.map((a) => ({
          applicationId: a.id, applicationNumber: a.number, applicationAcceptedAt: a.acceptedAt,
          applicationInspector: a.inspector, applicationStage: a.stage,
        })),
      };
    }
    if (p === '/applications') {
      return { status: 200, body: { 'hydra:member': m.applications.map((a) => ({ id: a.id, number: a.number, acceptedAt: a.acceptedAt })) } };
    }
    const detail = p.match(/^\/applications\/(\d+)$/);
    if (detail) {
      const a = m.applications.find((x) => x.id === Number(detail[1]));
      return a ? { status: 200, body: { id: a.id, number: a.number, stage: a.stage } } : { status: 404, body: {} };
    }
    if (p === '/communiques') {
      return { status: 200, body: { 'hydra:member': m.communiques[u.searchParams.get('application')] || [] } };
    }
    return { status: 404, body: {} };
  };
})(typeof self !== 'undefined' ? self : globalThis);
