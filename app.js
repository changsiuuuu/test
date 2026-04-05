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
let selectedTeams = [];
let currentWeekIndex = 0;
let touchStartX = null;
let lastSwipeDirection = 0;

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

function applyTeamFilter(events) {
  if (selectedTeams.length === 0) return events;

  if (selectedTeams.length === 1) {
    const [team] = selectedTeams;
    return events.filter((event) => event.teamA === team || event.teamB === team);
  }

  const [team1, team2] = selectedTeams;
  return events.filter(
    (event) =>
      (event.teamA === team1 && event.teamB === team2) ||
      (event.teamA === team2 && event.teamB === team1)
  );
}

function formatDate(date) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).format(date);
}

function formatMonthDay(date) {
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

function formatDateTime(isoString) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(isoString));
}

function toLocalDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getEventsFromCurrentWeek(events) {
  const currentWeekStart = getStartOfWeekMonday();
  return events.filter((event) => getStartOfWeekMonday(new Date(event.startTime)) >= currentWeekStart);
}

function getUpcomingEvents(events) {
  const now = new Date();
  return events.filter((event) => new Date(event.startTime) >= now);
}

function getSaturdayFirstMatchIds(events) {
  const saturdays = new Map();

  for (const event of events) {
    const date = new Date(event.startTime);
    if (date.getDay() !== 6) continue;

    const key = toLocalDateKey(date);
    if (!saturdays.has(key)) saturdays.set(key, []);
    saturdays.get(key).push(event);
  }

  const ids = new Set();
  for (const matches of saturdays.values()) {
    matches.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    if (matches[0]?.id) ids.add(matches[0].id);
  }

  return ids;
}

function groupEventsByWeek(events) {
  const weekMap = new Map();

  for (const event of events) {
    const startTime = new Date(event.startTime);
    const weekStart = getStartOfWeekMonday(startTime);
    const weekKey = toLocalDateKey(weekStart);

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
    btn.className = `team-button ${selectedTeams.includes(team) ? 'active' : ''}`;
    btn.textContent = team;
    btn.addEventListener('click', () => {
      const isSelected = selectedTeams.includes(team);

      if (isSelected) {
        selectedTeams = selectedTeams.filter((item) => item !== team);
      } else if (selectedTeams.length < 2) {
        selectedTeams = [...selectedTeams, team];
      } else {
        selectedTeams = [selectedTeams[1], team];
      }

      currentWeekIndex = 0;
      renderTeamButtons();
      renderList();
    });
    teamButtons.append(btn);
  }
}


function renderWeekdayHeader() {
  const wrap = document.createElement('li');
  wrap.className = 'weekday-header-row';

  const days = ['수', '목', '금', '토', '일'];
  for (const day of days) {
    const cell = document.createElement('div');
    cell.className = 'weekday-header-cell';
    cell.textContent = day;
    wrap.append(cell);
  }

  return wrap;
}

function renderWeekRow(week, saturdayFirstMatchIds, weekNumber, mobileSwipe = false) {
  const wrap = document.createElement('li');
  wrap.className = 'week-row';

  if (mobileSwipe) {
    if (lastSwipeDirection < 0) wrap.classList.add('swipe-from-left');
    if (lastSwipeDirection > 0) wrap.classList.add('swipe-from-right');
  }

  const title = document.createElement('div');
  title.className = 'week-title';
  const weekEnd = new Date(week.weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  title.textContent = `${weekNumber}주차`;

  const grid = document.createElement('div');
  grid.className = 'week-grid';
  const byDate = eventsByDate(week.events);

  for (const day of DISPLAY_DAYS) {
    const date = new Date(week.weekStart);
    const diff = day === 0 ? 6 : day - 1;
    date.setDate(date.getDate() + diff);
    const isoDate = toLocalDateKey(date);

    const cell = document.createElement('div');
    cell.className = 'day-cell';

    const dayHeader = document.createElement('div');
    dayHeader.className = 'day-header';
    dayHeader.textContent = formatMonthDay(date);
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
        item.className = `day-match ${saturdayFirstMatchIds.has(match.id) ? 'featured-sat' : ''}`;
        item.textContent = `${match.teamA} vs ${match.teamB}`;
        cell.append(item);
      }
    }

    grid.append(cell);
  }

  wrap.append(title, grid);
  return wrap;
}

function renderFilteredTextList(events, saturdayFirstMatchIds) {
  const sorted = [...events].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  if (!sorted.length) {
    scheduleList.innerHTML = '<li class="empty">표시할 경기가 없습니다.</li>';
    return;
  }

  for (const event of sorted) {
    const li = document.createElement('li');
    li.className = `text-schedule-item ${saturdayFirstMatchIds.has(event.id) ? 'featured-sat-text' : ''}`;
    li.textContent = `${formatDateTime(event.startTime)} · ${event.teamA} vs ${event.teamB}`;
    scheduleList.append(li);
  }
}

function renderList() {
  const currentWeekEvents = getEventsFromCurrentWeek(allSchedules);
  const filteredEvents = applyTeamFilter(currentWeekEvents);
  const saturdayFirstMatchIds = getSaturdayFirstMatchIds(currentWeekEvents);

  scheduleList.innerHTML = '';

  if (selectedTeams.length === 2) {
    listTitle.textContent = `${selectedTeams[0]} vs ${selectedTeams[1]} 일정`;
  } else if (selectedTeams.length === 1) {
    listTitle.textContent = `${selectedTeams[0]} 일정`;
  } else {
    listTitle.textContent = '전체 일정';
  }

  if (selectedTeams.length > 0) {
    const upcomingFilteredEvents = getUpcomingEvents(filteredEvents);
    loadMoreBtn.hidden = true;
    scheduleList.classList.add('filtered-scroll');
    renderFilteredTextList(upcomingFilteredEvents, saturdayFirstMatchIds);
    return;
  }

  const weeks = groupEventsByWeek(filteredEvents);

  if (!weeks.length) {
    scheduleList.classList.remove('filtered-scroll', 'main-scroll');
    scheduleList.innerHTML = '<li class="empty">표시할 남은 경기가 없습니다.</li>';
    loadMoreBtn.hidden = true;
    return;
  }

  const isMobile = window.matchMedia('(max-width: 900px)').matches;

  if (isMobile) {
    scheduleList.classList.remove('main-scroll', 'filtered-scroll');
    if (currentWeekIndex < 0) currentWeekIndex = 0;
    if (currentWeekIndex > weeks.length - 1) currentWeekIndex = weeks.length - 1;
    scheduleList.append(renderWeekdayHeader());
    scheduleList.append(renderWeekRow(weeks[currentWeekIndex], saturdayFirstMatchIds, currentWeekIndex + 1, true));
  } else {
    scheduleList.classList.add('main-scroll');
    scheduleList.classList.remove('filtered-scroll');
    scheduleList.append(renderWeekdayHeader());
    weeks.forEach((week, index) => {
      scheduleList.append(renderWeekRow(week, saturdayFirstMatchIds, index + 1));
    });
  }

  loadMoreBtn.hidden = true;
  lastSwipeDirection = 0;
}

function setStatus() {
  statusText.textContent = "";
}

function init() {
  renderTeamButtons();
  setStatus();
  renderList();
}

function navigateWeek(delta) {
  if (selectedTeams.length > 0) return;
  if (!window.matchMedia('(max-width: 900px)').matches) return;
  lastSwipeDirection = delta;
  currentWeekIndex += delta;
  renderList();
}

scheduleList.addEventListener('touchstart', (event) => {
  touchStartX = event.touches[0]?.clientX ?? null;
}, { passive: true });

scheduleList.addEventListener('touchend', (event) => {
  if (touchStartX === null || selectedTeams.length > 0) return;
  const endX = event.changedTouches[0]?.clientX ?? touchStartX;
  const diffX = endX - touchStartX;
  touchStartX = null;

  if (Math.abs(diffX) < 35) return;
  if (diffX < 0) navigateWeek(1); // 좌로 스와이프 -> 다음 주
  else navigateWeek(-1); // 우로 스와이프 -> 이전 주
}, { passive: true });

resetFilterBtn.addEventListener('click', () => {
  selectedTeams = [];
  currentWeekIndex = 0;
  renderTeamButtons();
  renderList();
});

loadMoreBtn.hidden = true;
window.addEventListener('resize', renderList);
init();
