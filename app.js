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
let lastSwipeDirection = 0;
let touchStartX = 0;
let touchStartY = 0;

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

function formatMonthDay(date, isMobile) {
  const base = `${date.getMonth() + 1}.${date.getDate()}`;
  if (!isMobile) return base;
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${base} ${weekdays[date.getDay()]}`;
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


function getTodayMatchIds(events) {
  const todayKey = toLocalDateKey(new Date());
  const ids = new Set();

  for (const event of events) {
    const eventKey = toLocalDateKey(new Date(event.startTime));
    if (eventKey === todayKey && event.id) ids.add(event.id);
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


function getCurrentWeekIndex(weeks) {
  if (!weeks.length) return 0;

  const now = new Date();
  const currentWeekStart = getStartOfWeekMonday(now);
  const currentKey = toLocalDateKey(currentWeekStart);

  const exactIndex = weeks.findIndex((week) => toLocalDateKey(week.weekStart) === currentKey);
  if (exactIndex >= 0) return exactIndex;

  for (let i = 0; i < weeks.length; i += 1) {
    if (weeks[i].weekStart > currentWeekStart) return i;
  }

  return weeks.length - 1;
}

function eventsByDate(events) {
  const map = new Map();
  for (const event of events) {
    const key = toLocalDateKey(new Date(event.startTime));
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
    btn.className = `btn team-button ${selectedTeams.includes(team) ? 'active' : ''}`;
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

      if (selectedTeams.length === 0) {
        currentWeekIndex = getCurrentWeekIndex(groupEventsByWeek(allSchedules));
      } else {
        currentWeekIndex = 0;
      }
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

function renderWeekRow(week, saturdayFirstMatchIds, todayMatchIds, weekNumber, isMobile, mobileSwipe = false) {
  const wrap = document.createElement('li');
  wrap.className = 'week-row';
  wrap.dataset.weekIndex = String(weekNumber);

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
    dayHeader.textContent = formatMonthDay(date, isMobile);
    cell.append(dayHeader);

    const matches = byDate.get(isoDate) ?? [];
    const hasTodayMatch = matches.some((match) => todayMatchIds.has(match.id));
    if (hasTodayMatch) {
      cell.classList.add('today-cell');
    }

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

function renderFilteredTextList(events, saturdayFirstMatchIds, todayMatchIds) {
  const sorted = [...events].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  if (!sorted.length) {
    scheduleList.innerHTML = '<li class="empty">표시할 경기가 없습니다.</li>';
    return;
  }

  for (const event of sorted) {
    const li = document.createElement('li');
    li.className = `text-schedule-item ${saturdayFirstMatchIds.has(event.id) ? 'featured-sat-text' : ''} ${todayMatchIds.has(event.id) ? 'today-match' : ''}`;
    li.textContent = `${formatDateTime(event.startTime)} · ${event.teamA} vs ${event.teamB}`;
    scheduleList.append(li);
  }
}

function renderList() {
  const weeks = groupEventsByWeek(allSchedules);
  const filteredEvents = applyTeamFilter(allSchedules);
  const saturdayFirstMatchIds = getSaturdayFirstMatchIds(allSchedules);
  const todayMatchIds = getTodayMatchIds(allSchedules);

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
    const isMobileFilter = window.matchMedia('(max-width: 900px)').matches;
    scheduleList.classList.remove('main-scroll', 'mobile-scroll', 'filtered-scroll');
    if (!isMobileFilter) {
      scheduleList.classList.add('filtered-scroll');
    }
    renderFilteredTextList(upcomingFilteredEvents, saturdayFirstMatchIds, todayMatchIds);
    return;
  }

  if (!weeks.length) {
    scheduleList.classList.remove('filtered-scroll', 'main-scroll', 'mobile-scroll');
    scheduleList.innerHTML = '<li class="empty">표시할 남은 경기가 없습니다.</li>';
    loadMoreBtn.hidden = true;
    return;
  }

  const isMobile = window.matchMedia('(max-width: 900px)').matches;
  const currentWeekAutoIndex = getCurrentWeekIndex(weeks);
  if (currentWeekIndex >= weeks.length) {
    currentWeekIndex = Math.max(weeks.length - 1, 0);
  }

  scheduleList.classList.remove('main-scroll', 'filtered-scroll', 'mobile-scroll');

  if (isMobile) {
    if (currentWeekIndex === 0 && selectedTeams.length === 0) {
      currentWeekIndex = currentWeekAutoIndex;
    }
    const week = weeks[currentWeekIndex];
    scheduleList.append(renderWeekRow(week, saturdayFirstMatchIds, todayMatchIds, currentWeekIndex + 1, true, true));
  } else {
    currentWeekIndex = currentWeekAutoIndex;
    scheduleList.classList.add('main-scroll');
    scheduleList.append(renderWeekdayHeader());

    weeks.forEach((week, index) => {
      scheduleList.append(renderWeekRow(week, saturdayFirstMatchIds, todayMatchIds, index + 1, false, false));
    });

    requestAnimationFrame(() => {
      const currentWeekEl = scheduleList.querySelector(`.week-row[data-week-index="${currentWeekIndex + 1}"]`);
      if (!currentWeekEl) return;
      const weekdayHeader = scheduleList.querySelector('.weekday-header-row');
      const stickyOffset = weekdayHeader ? weekdayHeader.offsetHeight : 0;
      scheduleList.scrollTop = Math.max(currentWeekEl.offsetTop - stickyOffset - 8, 0);
    });
  }

  loadMoreBtn.hidden = true;
  lastSwipeDirection = 0;
}

function setStatus() {
  statusText.textContent = "";
}

function init() {
  currentWeekIndex = getCurrentWeekIndex(groupEventsByWeek(allSchedules));
  renderTeamButtons();
  setStatus();
  renderList();
}


resetFilterBtn.addEventListener('click', () => {
  selectedTeams = [];
  currentWeekIndex = getCurrentWeekIndex(groupEventsByWeek(allSchedules));
  renderTeamButtons();
  renderList();
});

scheduleList.addEventListener('touchstart', (event) => {
  const isMobile = window.matchMedia('(max-width: 900px)').matches;
  if (!isMobile || selectedTeams.length > 0) return;
  const touch = event.changedTouches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
});

scheduleList.addEventListener('touchend', (event) => {
  const isMobile = window.matchMedia('(max-width: 900px)').matches;
  if (!isMobile || selectedTeams.length > 0) return;

  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;
  if (Math.abs(deltaX) < 40 || Math.abs(deltaX) <= Math.abs(deltaY)) return;

  const weeks = groupEventsByWeek(allSchedules);
  if (!weeks.length) return;

  if (deltaX < 0 && currentWeekIndex < weeks.length - 1) {
    currentWeekIndex += 1;
    lastSwipeDirection = -1;
    renderList();
  } else if (deltaX > 0 && currentWeekIndex > 0) {
    currentWeekIndex -= 1;
    lastSwipeDirection = 1;
    renderList();
  }
});

loadMoreBtn.hidden = true;
window.addEventListener('resize', renderList);
init();
