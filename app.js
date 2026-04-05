import { LCK_TEAMS, MANUAL_SCHEDULE } from './scheduleData.js';

const WEEKS_PER_PAGE = 1;
const DISPLAY_DAYS = [3, 4, 5, 6, 0]; // 수~일

const statusText = document.getElementById('statusText');
const teamButtons = document.getElementById('teamButtons');
const scheduleList = document.getElementById('scheduleList');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const listTitle = document.getElementById('listTitle');
const resetFilterBtn = document.getElementById('resetFilterBtn');

let allSchedules = MANUAL_SCHEDULE;
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

function setStatus() {
  const start = getStartOfWeekMonday();
  const end = getEndOfWeekSunday();
  statusText.textContent = `수동 데이터 기준 · 이번 주(${formatDate(start)} ~ ${formatDate(end)})를 먼저 보여줍니다`;
}

function init() {
  renderTeamButtons();
  setStatus();
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
