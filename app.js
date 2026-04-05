import { LCK_TEAMS, MANUAL_SCHEDULE } from './scheduleData.js';

const LCK_LEAGUE_ID = '98767991310872058';
const PUBLIC_API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const WEEKS_PER_PAGE = 1;
const MAX_API_PAGES = 4;
const DISPLAY_DAYS = [3, 4, 5, 6, 0]; // 수~일

const TEAM_ALIAS = {
  'Dplus KIA': 'DK',
  'DN FREECS': 'DNS',
  'BNK FEARX': 'BFX',
  'Nongshim RedForce': 'NS',
  'OKSavingsBank BRION': 'BRO',
  'Hanwha Life Esports': 'HLE',
  'Gen.G': 'GEN',
};

const statusText = document.getElementById('statusText');
const teamButtons = document.getElementById('teamButtons');
const scheduleList = document.getElementById('scheduleList');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const listTitle = document.getElementById('listTitle');
const resetFilterBtn = document.getElementById('resetFilterBtn');

let allSchedules = [];
let selectedTeam = null;
let visibleWeekCount = WEEKS_PER_PAGE;

function getStartOfWeekMonday(date = new Date()) {
  const local = new Date(date);
  const day = local.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  local.setDate(local.getDate() + diff);
  local.setHours(0, 0, 0, 0);
  return local;
}

function getEndOfWeekSunday(date = new Date()) {
  const end = getStartOfWeekMonday(date);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function normalizeTeamName(value) {
  if (!value) return 'TBD';
  return TEAM_ALIAS[value] ?? value;
}

function normalizeEvent(raw) {
  return {
    id: raw.id,
    startTime: raw.startTime,
    teamA: normalizeTeamName(raw.teamA),
    teamB: normalizeTeamName(raw.teamB),
    league: raw.league ?? 'LCK',
    stage: raw.stage ?? '',
  };
}

function mapLolesportsEvent(event) {
  const teams = event?.match?.teams ?? [];
  if (teams.length < 2) return null;

  return {
    id: event.id,
    startTime: event.startTime,
    teamA: normalizeTeamName(teams[0]?.code || teams[0]?.name),
    teamB: normalizeTeamName(teams[1]?.code || teams[1]?.name),
    league: event?.league?.name || 'LCK',
    stage: event?.blockName || '',
  };
}

async function fetchSchedulePage({ apiKey, pageToken }) {
  const url = new URL('https://esports-api.lolesports.com/persisted/gw/getSchedule');
  url.searchParams.set('hl', 'ko-KR');
  url.searchParams.append('leagueId', LCK_LEAGUE_ID);
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  const headers = {};
  if (apiKey) headers['x-api-key'] = apiKey;

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    throw new Error(`공식 API 호출 실패 (${response.status})`);
  }
  return response.json();
}

async function fetchFromLolesports() {
  const runtimeKey = (window.LCK_API_KEY || '').trim();
  const candidates = [runtimeKey, PUBLIC_API_KEY, ''].filter((value, index, arr) => value || index === arr.indexOf(''));

  let lastError;

  for (const apiKey of candidates) {
    try {
      let pageToken;
      const collected = [];

      for (let i = 0; i < MAX_API_PAGES; i += 1) {
        const body = await fetchSchedulePage({ apiKey, pageToken });
        const schedule = body?.data?.schedule;
        collected.push(...(schedule?.events ?? []));
        pageToken = schedule?.pages?.newer;
        if (!pageToken) break;
      }

      const mapped = collected.map(mapLolesportsEvent).filter(Boolean);
      if (mapped.length) return mapped;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('공식 API 데이터가 비어 있습니다.');
}

function getFutureEvents(events) {
  const now = new Date();
  return events.filter((event) => new Date(event.startTime) >= now);
}

function applyTeamFilter(events) {
  if (!selectedTeam) return events;
  return events.filter((event) => event.teamA === selectedTeam || event.teamB === selectedTeam);
}

function formatDate(date) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).format(date);
}

function formatDateNumber(date) {
  return new Intl.DateTimeFormat('ko-KR', { day: 'numeric' }).format(date);
}

function groupEventsByWeek(events) {
  const weekMap = new Map();

  for (const event of events) {
    const startTime = new Date(event.startTime);
    const weekStart = getStartOfWeekMonday(startTime);
    const weekKey = weekStart.toISOString().slice(0, 10);

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, { weekStart, events: [] });
    }
    weekMap.get(weekKey).events.push(event);
  }

  return [...weekMap.values()]
    .sort((a, b) => a.weekStart - b.weekStart)
    .map((week) => ({
      ...week,
      events: week.events.sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
    }));
}

function eventsByDate(events) {
  const map = new Map();
  for (const event of events) {
    const key = event.startTime.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(event);
  }
  for (const list of map.values()) {
    list.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  }
  return map;
}

function renderTeamButtons() {
  teamButtons.innerHTML = '';
  for (const team of LCK_TEAMS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `team-button ${selectedTeam === team ? 'active' : ''}`;
    btn.textContent = team;
    btn.addEventListener('click', () => {
      selectedTeam = selectedTeam === team ? null : team;
      visibleWeekCount = WEEKS_PER_PAGE;
      renderTeamButtons();
      renderList();
    });
    teamButtons.append(btn);
  }
}

function renderWeekRow(week) {
  const wrap = document.createElement('li');
  wrap.className = 'week-row';

  const title = document.createElement('div');
  title.className = 'week-title';
  const weekEnd = new Date(week.weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  title.textContent = `${formatDate(week.weekStart)} ~ ${formatDate(weekEnd)}`;

  const grid = document.createElement('div');
  grid.className = 'week-grid';

  const byDate = eventsByDate(week.events);

  for (const day of DISPLAY_DAYS) {
    const date = new Date(week.weekStart);
    const diff = day === 0 ? 6 : day - 1;
    date.setDate(date.getDate() + diff);
    const isoDate = date.toISOString().slice(0, 10);

    const cell = document.createElement('div');
    cell.className = 'day-cell';

    const dayHeader = document.createElement('div');
    dayHeader.className = 'day-header';
    const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase();
    dayHeader.textContent = `${dayName} ${formatDateNumber(date)}`;
    cell.append(dayHeader);

    const matches = byDate.get(isoDate) ?? [];
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'day-empty';
      empty.textContent = '-';
      cell.append(empty);
    } else {
      for (const match of matches) {
        const item = document.createElement('div');
        item.className = 'day-match';
        item.textContent = `${match.teamA} vs ${match.teamB}`;
        cell.append(item);
      }
    }

    grid.append(cell);
  }

  wrap.append(title, grid);
  return wrap;
}

function renderList() {
  let events = getFutureEvents(allSchedules);
  events = applyTeamFilter(events);

  const weeks = groupEventsByWeek(events);
  const visibleWeeks = weeks.slice(0, visibleWeekCount);

  listTitle.textContent = selectedTeam ? `${selectedTeam} 일정` : '전체 일정';
  scheduleList.innerHTML = '';

  if (!visibleWeeks.length) {
    scheduleList.innerHTML = '<li class="empty">표시할 남은 경기가 없습니다.</li>';
    loadMoreBtn.hidden = true;
    return;
  }

  for (const week of visibleWeeks) {
    scheduleList.append(renderWeekRow(week));
  }

  loadMoreBtn.hidden = visibleWeekCount >= weeks.length;
}

function setStatus(source = 'manual') {
  const start = getStartOfWeekMonday();
  const end = getEndOfWeekSunday();
  const sourceText = source === 'official' ? '공식 API' : '수동 데이터';
  statusText.textContent = `${sourceText} 기준 · 이번 주(${formatDate(start)} ~ ${formatDate(end)})를 먼저 보여줍니다`;
}

function renderError(message) {
  scheduleList.innerHTML = `<li class="error">${message}</li>`;
}

async function init() {
  renderTeamButtons();

  try {
    const official = await fetchFromLolesports();
    allSchedules = official.map(normalizeEvent);
    setStatus('official');
  } catch (error) {
    console.warn(error);
    allSchedules = MANUAL_SCHEDULE.map(normalizeEvent);
    setStatus('manual');
  }

  if (!allSchedules.length) {
    renderError('경기 데이터가 없습니다. scheduleData.js를 확인해 주세요.');
    loadMoreBtn.hidden = true;
    return;
  }

  renderList();
}

loadMoreBtn.addEventListener('click', () => {
  visibleWeekCount += WEEKS_PER_PAGE;
  renderList();
});

resetFilterBtn.addEventListener('click', () => {
  selectedTeam = null;
  visibleWeekCount = WEEKS_PER_PAGE;
  renderTeamButtons();
  renderList();
});

init();
