// Screenplay of the promo video (Russian). A beat is one narration line plus the
// on-screen actions that start with it. `text` is the caption; `say` is what the voice
// reads when the spelling differs (Latin names in Cyrillic, a stress mark U+0301).
//
// Actions are calls on window.stage of stage.html: ['openPopup'], ['ring', 'popup',
// '.news'], ['tap', 'tab', '#save'], ['type', 'tab', '#username', '…'], ['wait', ms].
// '$extra' in the arguments is the send time of the message that "arrives" during
// the video (set once, when the scene that needs it starts).
//
// Voice: ElevenLabs «Алан», the same as in the owner's other videos.
export const VOICE = { id: 'zWSsRd3J6WyZFl12aGMB', name: 'Алан' };
export const MODEL = 'eleven_multilingual_v2';
export const SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 };

const ACCOUNT = { login: 'anna.nowak@example.com', password: 'correct-horse' };

export const SCENES = [
  {
    id: 'intro',
    pre: [['card', `{brand}
      <h1>Заявление на карту побыту — <em>под присмотром</em></h1>
      <p>Расширение для Chrome само заходит в портал Przybysz и показывает, что изменилось в вашем деле.</p>`]],
    beats: [{
      text: 'PIO Application Checker — расширение для Chrome. Оно само следит за вашим заявлением на карту побыту.',
      say: 'Пи-Ай-О Эппликейшн Чекер — расширение для Хрома. Оно само следит за вашим заявлением на ка́рту побы́ту.',
    }],
  },
  {
    id: 'problem',
    pre: [['card', `{brand}
      <h1>Месяцы ожидания — и каждый раз <em>вход по паролю</em></h1>
      <ul><li>открыть портал</li><li>ввести почту и пароль</li><li>найти своё дело</li><li>новостей нет</li></ul>`]],
    beats: [{
      text: 'Заявление рассматривают месяцами. Чтобы узнать, есть ли новости, приходится каждый раз заходить в портал Przybysz и вводить пароль.',
      say: 'Заявление рассматривают месяцами. Чтобы узнать, есть ли новости, приходится каждый раз заходить в портал Пши́быш и вводить пароль.',
    }],
  },
  {
    id: 'popup', chapter: '01 · Одно нажатие',
    pre: [['reset', 'configured'], ['newTab'], ['show', 'browser'], ['check']],
    beats: [
      { text: 'Теперь достаточно нажать на значок расширения.',
        act: [['wait', 500], ['tap', 'stage', '#ext'], ['openPopup']] },
      { text: 'По каждому заявлению видно этап рассмотрения, инспектора и сколько дней дело в работе.',
        act: [['hideCursor'], ['ring', 'popup', '.case-head'], ['wait', 2300], ['ring', 'popup', '.case-meta']] },
      { text: 'Ниже — все сообщения ведомства, самые свежие сверху.',
        act: [['ring', 'popup', '.news']] },
      { text: 'Сообщение о решении выделено зелёным, и счётчик дней на нём останавливается.',
        act: [['ring', 'popup', '.news-item.decision'], ['wait', 2600], ['ring', 'popup', '.case-days']] },
    ],
  },
  {
    id: 'badge', chapter: '02 · Значок',
    pre: [['closePopup']],
    beats: [
      { text: 'Число на значке — сколько сообщений пришло за выбранный период.',
        act: [['ring', 'stage', '#ext', null, 9]] },
      { text: 'Расширение проверяет портал само. Пришло новое сообщение — значок становится оранжевым.',
        act: [['wait', 2400], ['check', '$extra']] },
      { text: 'Открываете — новое сообщение помечено.',
        act: [['ringOff'], ['tap', 'stage', '#ext'], ['openPopup', '$extra'], ['hideCursor'], ['ring', 'popup', '.news-item', 'Wezwanie do osobistego'], ['wait', 2200]] },
    ],
  },
  {
    id: 'settings', chapter: '03 · Настройка',
    pre: [['closePopup'], ['reset', 'empty'], ['check'], ['openOptions']],
    beats: [
      { text: 'Настройка занимает минуту. Введите почту и пароль от портала.',
        act: [['wait', 600], ['type', 'tab', '#username', ACCOUNT.login], ['type', 'tab', '#password', ACCOUNT.password]] },
      { text: 'Нажмите «Получить заявления» — расширение покажет ваши дела, и нужные добавляются одним нажатием.',
        act: [['tap', 'tab', '#testConnection'], ['wait', 1300], ['tap', 'tab', '.app:nth-child(1) .btn'], ['tap', 'tab', '.app:nth-child(2) .btn'], ['hideCursor'], ['ring', 'tab', '#applications']] },
      { text: 'Выберите, за какой срок показывать сообщения и как часто проверять: от получаса до десяти часов.',
        act: [['ring', 'tab', '.row'], ['wait', 1800], ['select', 'tab', '#newsPeriod', '1y'], ['wait', 1500], ['select', 'tab', '#autoUpdatePeriod', '1']] },
      { text: 'Сохраните — и первая проверка начнётся сразу.',
        act: [['ringOff'], ['tap', 'tab', '#save'], ['hideCursor'], ['wait', 900], ['ring', 'stage', '#ext', null, 9]] },
    ],
  },
  {
    id: 'privacy', chapter: '04 · Приватность',
    pre: [],
    beats: [{
      text: 'Пароль хранится только в вашем браузере. Расширение обращается к одному адресу — серверу самого портала. Ни аналитики, ни сторонних серверов.',
      act: [['ring', 'tab', '.privacy']],
    }],
  },
  {
    id: 'outro',
    pre: [['card', `{brand}
      <h1>Бесплатно. <em>Код открыт.</em></h1>
      <ul><li>Русский</li><li>English</li><li>Polski</li></ul>
      <div class="url">markarov.dev/demo/piopa</div>
      <div class="fine">Независимый проект. Не связан с Dolnośląski Urząd Wojewódzki и порталом Przybysz.</div>`]],
    beats: [
      { text: 'Расширение бесплатное, код открыт. Интерфейс — на русском, английском и польском.' },
      { text: 'Как установить — на странице markarov.dev/demo/piopa. Это независимый проект, он не связан с ведомством.',
        say: 'Как установить — на странице маркаров точка дев. Это независимый проект, он не связан с ведомством.' },
    ],
  },
];
