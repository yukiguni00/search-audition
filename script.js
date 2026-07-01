let favoritesOnlyMode = false;
const FAVORITE_KEY = "favoritePerformers";
let events = [];
let archiveOpen = false;
let favoriteScheduleExpanded = false;

function formatDisplayDate(ev) {
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const dateObj = new Date(ev.date);
  const weekday = weekdays[dateObj.getDay()];
  const startLabel = `${ev.month}月${ev.day}日(${weekday})`;

  if (ev.dateEnd && ev.dateEnd !== ev.date) {
    const endObj = new Date(ev.dateEnd);
    const endWeekday = weekdays[endObj.getDay()];
    const endLabel = `${endObj.getMonth() + 1}月${endObj.getDate()}日(${endWeekday})`;
    return `${startLabel}〜${endLabel} ${ev.time}`;
  }

  if (ev.time === "出演公演未定" || ev.time === "未定") {
    return `${startLabel} ${ev.time}`;
  }

  return `${startLabel} 開演${ev.time}`;
}

function normalizeText(text) {
  return (text || "").trim().replace(/\s+/g, " ").normalize("NFKC").toLowerCase();
}

function getFavorites() {
  return JSON.parse(localStorage.getItem(FAVORITE_KEY) || "[]");
}

function saveFavorites(favorites) {
  localStorage.setItem(FAVORITE_KEY, JSON.stringify(favorites));
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function toggleFavorite(name) {
  const favorites = getFavorites();
  const key = normalizeText(name);
  const idx = favorites.indexOf(key);

  let isFavorite;

  if (idx >= 0) {
    favorites.splice(idx, 1);
    isFavorite = false;
  } else {
    favorites.push(key);
    isFavorite = true;
  }

  saveFavorites(favorites);
  renderFavoriteSchedule();

  if (favoritesOnlyMode) {
    runSearch();
  } else {
    updateFavoriteUI(key, isFavorite);
  }
}

function updateFavoriteUI(key, isFavorite) {
  document.querySelectorAll(`.star[data-key="${CSS.escape(key)}"]`).forEach((btn) => {
    btn.textContent = isFavorite ? "★" : "☆";
    const performer = btn.closest(".performer");
    if (performer) {
      performer.classList.toggle("favorite", isFavorite);
    }
  });
}

function populateSelects() {
  const monthSelect = document.getElementById("month");
  const daySelect = document.getElementById("day");
  const hourSelect = document.getElementById("hour");

  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement("option");
    opt.value = String(m);
    opt.textContent = `${m}月`;
    monthSelect.appendChild(opt);
  }
  for (let d = 1; d <= 31; d++) {
    const opt = document.createElement("option");
    opt.value = String(d);
    opt.textContent = `${d}日`;
    daySelect.appendChild(opt);
  }
  for (let h = 10; h <= 20; h++) {
    const opt = document.createElement("option");
    opt.value = String(h);
    opt.textContent = `${h}時以降`;
    hourSelect.appendChild(opt);
  }
}

function getCurrentFilters() {
  return {
    nameQuery: normalizeText(document.getElementById("nameQuery").value),
    eventType: document.getElementById("eventType").value,
    month: document.getElementById("month").value,
    day: document.getElementById("day").value,
    hour: document.getElementById("hour").value,
  };
}

function getFavoritePerformersSet() {
  try {
    const raw = localStorage.getItem(FAVORITE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch (e) {
    return new Set();
  }
}

function eventHasFavorite(ev) {
  const favorites = getFavoritePerformersSet();
  if (!favorites.size || !Array.isArray(ev.performers)) return false;
  return ev.performers.some(name => favorites.has(normalizeText(name)));
}

function updateFavoritesOnlyButton() {
  const btn = document.getElementById("favoritesOnlyBtn");
  if (!btn) return;
  btn.setAttribute("aria-pressed", favoritesOnlyMode ? "true" : "false");
  btn.classList.toggle("is-active", favoritesOnlyMode);
}

function setArchiveOpen(isOpen) {
  archiveOpen = isOpen;

  const btn = document.getElementById("archiveToggleBtn");
  const body = document.getElementById("archiveBody");

  if (btn) {
    btn.setAttribute("aria-expanded", archiveOpen ? "true" : "false");
    const icon = btn.querySelector(".archive-toggle-icon");
    if (icon) icon.textContent = archiveOpen ? "−" : "＋";
  }

  if (body) {
    body.hidden = !archiveOpen;
  }
}

function hasActiveFilters(filters) {
  return Boolean(
    filters.nameQuery ||
    filters.eventType !== "all" ||
    filters.month !== "all" ||
    filters.day !== "all" ||
    filters.hour !== "all" ||
    favoritesOnlyMode
  );
}

function updateArchiveMessage(message) {
  const target = document.getElementById("archiveMessage");
  if (!target) return;
  target.textContent = message || "";
}

function getEventDateParts(ev) {
  const start = new Date(ev.date);
  const end = new Date(ev.dateEnd || ev.date);
  const dates = [];

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [{ month: ev.month, day: ev.day }];
  }

  const cursor = new Date(start);
  while (cursor <= end && dates.length < 10) {
    dates.push({
      month: cursor.getMonth() + 1,
      day: cursor.getDate(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function eventMatchesFilters(ev, filters, includePast = false, options = {}) {
  const { ignoreNameQuery = false, ignoreFavoritesOnly = false } = options;
  const today = todayString();

  if (!includePast && (ev.dateEnd || ev.date) < today) return false;
  if (includePast && ev.date >= today) return false;
  if (filters.eventType !== "all" && ev.eventType !== filters.eventType) return false;

  const dateParts = getEventDateParts(ev);
  if (filters.month !== "all" && !dateParts.some((part) => part.month === Number(filters.month))) return false;
  if (filters.day !== "all" && !dateParts.some((part) => part.day === Number(filters.day))) return false;

  if (filters.hour !== "all" && ev.timeMinutes < Number(filters.hour) * 60) return false;
  if (!ignoreNameQuery && filters.nameQuery) {
    const hit = (ev.performers || []).some((name) => normalizeText(name).includes(filters.nameQuery));
    if (!hit) return false;
  }
  if (!ignoreFavoritesOnly && favoritesOnlyMode && !eventHasFavorite(ev)) return false;
  return true;
}

function pickRandomPerformer() {
  const filters = getCurrentFilters();
  const favorites = new Set(getFavorites());

  const getUniqueNames = (eventList) => [...new Set(
    eventList.flatMap((ev) => Array.isArray(ev.performers) ? ev.performers : [])
  )];

  const futureEvents = events.filter((ev) =>
    eventMatchesFilters(ev, filters, false, { ignoreNameQuery: true })
  );
  const futureNames = getUniqueNames(futureEvents);

  let poolSource = "future";
  let allNames = futureNames;

  if (!allNames.length) {
    const pastEvents = events.filter((ev) =>
      eventMatchesFilters(ev, filters, true, { ignoreNameQuery: true })
    );
    allNames = getUniqueNames(pastEvents);
    poolSource = "past";
  }

  if (!allNames.length) {
    alert("この条件で選べる出演者が見つかりませんでした");
    return;
  }

  const nonFavoriteNames = allNames.filter((name) => !favorites.has(normalizeText(name)));
  const pool = nonFavoriteNames.length ? nonFavoriteNames : allNames;
  const selected = pool[Math.floor(Math.random() * pool.length)];

  document.getElementById("nameQuery").value = selected;

  if (poolSource === "past") {
    setArchiveOpen(true);
  }

  runSearch();
}

function clearFilters() {
  document.getElementById("nameQuery").value = "";
  document.getElementById("eventType").value = "all";
  document.getElementById("month").value = "all";
  document.getElementById("day").value = "all";
  document.getElementById("hour").value = "all";
  favoritesOnlyMode = false;
  updateFavoritesOnlyButton();
  runSearch();
}

function filterEvents(list, includePast = false) {
  const filters = getCurrentFilters();

  return list
    .filter((ev) => eventMatchesFilters(ev, filters, includePast))
    .sort((a, b) => {
      if (includePast) {
        return b.date.localeCompare(a.date) || b.timeMinutes - a.timeMinutes;
      }
      return a.date.localeCompare(b.date) || a.timeMinutes - b.timeMinutes;
    });
}

function findPerformerDisplayName(key) {
  for (const ev of events) {
    if (!Array.isArray(ev.performers)) continue;
    const found = ev.performers.find((name) => normalizeText(name) === key);
    if (found) return found;
  }
  return key;
}

function getFavoriteScheduleData() {
  const favorites = getFavorites();
  const today = todayString();

  const futureEvents = events
    .filter((ev) => ev.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.timeMinutes - b.timeMinutes);

  const favoriteSet = new Set(favorites);
  const upcomingKeys = new Set();
  const eventGroups = [];

  futureEvents.forEach((ev) => {
    if (!Array.isArray(ev.performers)) return;

    const matchedNames = ev.performers.filter((name) => {
      const key = normalizeText(name);
      return favoriteSet.has(key);
    });

    if (!matchedNames.length) return;

    matchedNames.forEach((name) => upcomingKeys.add(normalizeText(name)));

    eventGroups.push({
      event: ev,
      names: matchedNames,
    });
  });

  const pendingSecondDate = getMainPendingSecondStageDate();

  if (pendingSecondDate && pendingSecondDate >= today && !hasPublishedSecondStageDetails(pendingSecondDate)) {
    const pendingNames = [];
    const seenPending = new Set();

    events
      .filter((ev) => ev.eventType === "audition-1st-east")
      .filter((ev) => ev.qualifiedNextStageDate === pendingSecondDate)
      .filter((ev) => Array.isArray(ev.qualifiedPerformers) && ev.qualifiedPerformers.length)
      .sort((a, b) => a.date.localeCompare(b.date) || a.timeMinutes - b.timeMinutes)
      .forEach((ev) => {
        ev.qualifiedPerformers.forEach((name) => {
          const key = normalizeText(name);

          if (!key || seenPending.has(key)) return;
          seenPending.add(key);

          if (!favoriteSet.has(key)) return;

          pendingNames.push(name);
          upcomingKeys.add(key);
        });
      });

    if (pendingNames.length) {
      const dateObj = new Date(pendingSecondDate);
      eventGroups.push({
        event: {
          id: `${pendingSecondDate}-audition-2nd-east`,
          eventType: "audition-2nd-east",
          title: "オーディション2ndステージ EAST",
          date: pendingSecondDate,
          month: dateObj.getMonth() + 1,
          day: dateObj.getDate(),
          time: "未定",
          timeMinutes: 0,
          venue: "詳細未定",
          performers: pendingNames,
          isPendingSecondStage: true,
        },
        names: pendingNames,
      });
    }
  }

  eventGroups.sort((a, b) =>
    a.event.date.localeCompare(b.event.date) ||
    (a.event.timeMinutes || 0) - (b.event.timeMinutes || 0)
  );

  const noUpcoming = favorites
    .filter((key) => !upcomingKeys.has(key))
    .map((key) => ({
      key,
      name: findPerformerDisplayName(key),
    }));

  return {
    total: favorites.length,
    upcomingCount: upcomingKeys.size,
    eventGroups,
    noUpcoming,
  };
}

function renderFavoriteSchedule() {
  const panel = document.getElementById("favoritePanel");
  const target = document.getElementById("favoriteSchedule");
  if (!panel || !target) return;

  const favorites = getFavorites();

  if (!favorites.length) {
    favoriteScheduleExpanded = false;
    panel.hidden = true;
    target.innerHTML = "";
    return;
  }

  panel.hidden = false;

  const { total, upcomingCount, eventGroups, noUpcoming } = getFavoriteScheduleData();
  const visibleGroups = favoriteScheduleExpanded ? eventGroups : eventGroups.slice(0, 3);
  const hasMore = eventGroups.length > 3 || noUpcoming.length > 0;

  const upcomingHTML = visibleGroups.length
    ? `
      <div class="favorite-list">
        ${visibleGroups.map(({ event, names }) => `
          <button class="favorite-item favorite-jump-btn" type="button" data-event-id="${event.id}">
            <div class="favorite-meta favorite-event-line">${formatDisplayDate(event)} ${event.venue}</div>
            <div class="favorite-name">${names.join("／")}</div>
          </button>
        `).join("")}
      </div>
    `
    : `<p class="empty favorite-empty">掲載中の出演予定はありません</p>`;

  const noUpcomingHTML = favoriteScheduleExpanded && noUpcoming.length
    ? `
      <div class="favorite-no-upcoming">
        <div class="favorite-no-upcoming-title">掲載中の出演予定なし</div>
        <div class="favorite-name-list">${noUpcoming.map(({ name }) => name).join("、")}</div>
      </div>
    `
    : "";

  const moreText = favoriteScheduleExpanded ? "閉じる" : "すべて表示";
  const moreButtonHTML = hasMore
    ? `<button id="favoriteScheduleToggleBtn" class="secondary-btn favorite-toggle-btn" type="button">${moreText}</button>`
    : "";

  target.innerHTML = `
    <p class="favorite-summary">お気に入り${total}組中、${upcomingCount}組の出演情報があります</p>
    ${upcomingHTML}
    ${noUpcomingHTML}
    ${moreButtonHTML}
    <button id="favoriteBackupBtn" class="favorite-backup-link" type="button">お気に入りをバックアップ・復元</button>
  `;


  target.querySelectorAll(".favorite-jump-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      jumpToEventCard(btn.dataset.eventId);
    });
  });

  const backupBtn = document.getElementById("favoriteBackupBtn");
  if (backupBtn) {
    backupBtn.addEventListener("click", openFavoriteBackup);
  }

  const toggleBtn = document.getElementById("favoriteScheduleToggleBtn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      favoriteScheduleExpanded = !favoriteScheduleExpanded;
      renderFavoriteSchedule();
    });
  }
}


function jumpToEventCard(eventId) {
  document.getElementById("nameQuery").value = "";
  document.getElementById("eventType").value = "all";
  document.getElementById("month").value = "all";
  document.getElementById("day").value = "all";
  document.getElementById("hour").value = "all";

  favoritesOnlyMode = false;
  updateFavoritesOnlyButton();
  setArchiveOpen(false);
  updateArchiveMessage("");

  runSearch();

  requestAnimationFrame(() => {
    const target = document.getElementById(`event-${eventId}`);
    if (!target) return;

    target.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    target.classList.add("is-highlighted");

    window.setTimeout(() => {
      target.classList.remove("is-highlighted");
    }, 1600);
  });
}



function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeBackupPayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return bytesToBase64(bytes);
}

function decodeBackupPayload(code) {
  const trimmed = (code || "").trim();
  if (!trimmed) throw new Error("バックアップコードが空です");

  const bytes = base64ToBytes(trimmed);
  const json = new TextDecoder().decode(bytes);
  const payload = JSON.parse(json);

  if (!payload || payload.v !== 1 || !Array.isArray(payload.favorites)) {
    throw new Error("バックアップコードの形式が正しくありません");
  }

  const normalizedFavorites = [...new Set(
    payload.favorites
      .map((name) => normalizeText(name))
      .filter(Boolean)
  )];

  return normalizedFavorites;
}

function setBackupStatus(targetId, message, isError = false) {
  const status = document.getElementById(targetId);
  if (!status) return;

  status.textContent = message || "";
  status.classList.toggle("is-error", Boolean(isError));
}

function clearBackupStatuses() {
  setBackupStatus("backupCreateStatus", "");
  setBackupStatus("backupRestoreStatus", "");
}

function openFavoriteBackup() {
  const panel = document.getElementById("favoriteBackupPanel");
  if (!panel) return;

  panel.hidden = false;
  clearBackupStatuses();

  requestAnimationFrame(() => {
    panel.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

function closeFavoriteBackup() {
  const panel = document.getElementById("favoriteBackupPanel");
  if (!panel) return;

  panel.hidden = true;
  clearBackupStatuses();
}

function createFavoriteBackupCode() {
  const favorites = getFavorites();
  const output = document.getElementById("backupCodeOutput");
  if (!output) return;

  if (!favorites.length) {
    output.value = "";
    setBackupStatus("backupCreateStatus", "お気に入りが登録されていません", true);
    return;
  }

  const payload = {
    v: 1,
    favorites,
    createdAt: new Date().toISOString(),
  };

  output.value = encodeBackupPayload(payload);
  setBackupStatus("backupCreateStatus", `バックアップコードを生成しました（${favorites.length}組）`);
}

async function copyFavoriteBackupCode() {
  const output = document.getElementById("backupCodeOutput");
  if (!output || !output.value.trim()) {
    setBackupStatus("backupCreateStatus", "先にバックアップコードを生成してください", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(output.value.trim());
    setBackupStatus("backupCreateStatus", "バックアップコードをコピーしました");
  } catch (e) {
    output.focus();
    output.select();
    setBackupStatus("backupCreateStatus", "コピーできない場合は、コードを選択して手動でコピーしてください", true);
  }
}

function restoreFavoriteBackupCode() {
  const input = document.getElementById("backupCodeInput");
  if (!input) return;

  let restoredFavorites;

  try {
    restoredFavorites = decodeBackupPayload(input.value);
  } catch (e) {
    setBackupStatus("backupRestoreStatus", e.message || "バックアップコードを読み取れませんでした", true);
    return;
  }

  const ok = window.confirm("現在のお気に入りを上書きして復元します。よろしいですか？");
  if (!ok) return;

  saveFavorites(restoredFavorites);
  favoriteScheduleExpanded = false;
  favoritesOnlyMode = false;

  updateFavoritesOnlyButton();
  renderFavoriteSchedule();
  runSearch();

  setBackupStatus("backupRestoreStatus", `お気に入りを復元しました（${restoredFavorites.length}組）`);
}

function bindFavoriteBackup() {

  const createBtn = document.getElementById("createBackupBtn");
  if (createBtn) createBtn.addEventListener("click", createFavoriteBackupCode);

  const copyBtn = document.getElementById("copyBackupBtn");
  if (copyBtn) copyBtn.addEventListener("click", copyFavoriteBackupCode);

  const restoreBtn = document.getElementById("restoreBackupBtn");
  if (restoreBtn) restoreBtn.addEventListener("click", restoreFavoriteBackupCode);

  const closeBtn = document.getElementById("closeBackupBtn");
  if (closeBtn) closeBtn.addEventListener("click", closeFavoriteBackup);
}


function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateLabel(dateString) {
  if (!dateString) return "";
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const dateObj = new Date(dateString);
  if (Number.isNaN(dateObj.getTime())) return "";
  return `${dateObj.getMonth() + 1}月${dateObj.getDate()}日(${weekdays[dateObj.getDay()]})`;
}

function getQualifiedStageLabel(ev) {
  if (ev.qualifiedResult === "none") return "2nd進出者";

  const nextStageDate = formatDateLabel(ev.qualifiedNextStageDate);
  return nextStageDate
    ? `2nd進出者 (${nextStageDate}出演予定)`
    : "2nd進出者 (日程未定)";
}

function buildPerformerChipsHTML(names, favorites) {
  return (names || []).map((name) => {
    const normalizedName = normalizeText(name);
    const isFavorite = favorites.includes(normalizedName);
    return `<span class="performer ${isFavorite ? "favorite" : ""}"><button class="star" data-name="${escapeHTML(name)}" data-key="${escapeHTML(normalizedName)}" type="button">${isFavorite ? "★" : "☆"}</button>${escapeHTML(name)}</span>`;
  }).join("");
}

function getQualifiedPerformersHTML(ev, favorites) {
  if (ev.qualifiedResult === "none") {
    return `
      <div class="qualified-performers">
        <div class="card-section-label">${getQualifiedStageLabel(ev)}</div>
        <div class="qualified-none">該当者なし</div>
      </div>
    `;
  }

  if (!Array.isArray(ev.qualifiedPerformers) || !ev.qualifiedPerformers.length) return "";

  return `
    <div class="qualified-performers">
      <div class="card-section-label">${getQualifiedStageLabel(ev)}</div>
      <div class="performers qualified-list">${buildPerformerChipsHTML(ev.qualifiedPerformers, favorites)}</div>
    </div>
  `;
}

function getScheduledSecondPerformersSet() {
  const scheduled = new Set();

  events
    .filter((ev) => ev.eventType === "audition-2nd-east" && Array.isArray(ev.performers))
    .forEach((ev) => {
      ev.performers.forEach((name) => {
        scheduled.add(normalizeText(name));
      });
    });

  return scheduled;
}


function isQualifiedPerformerScheduled(name, qualifiedEvent) {
  const key = normalizeText(name);
  const nextStageDate = qualifiedEvent.qualifiedNextStageDate;

  return events.some((ev) => {
    if (ev.eventType !== "audition-2nd-east" || !Array.isArray(ev.performers)) return false;

    const hasName = ev.performers.some((performerName) => normalizeText(performerName) === key);
    if (!hasName) return false;

    if (nextStageDate) {
      return ev.date === nextStageDate;
    }

    return ev.date > qualifiedEvent.date;
  });
}

function getPendingQualifiedGroups(filters) {
  const favorites = getFavoritePerformersSet();

  return events
    .filter((ev) => ev.eventType === "audition-1st-east")
    .filter((ev) => Array.isArray(ev.qualifiedPerformers) && ev.qualifiedPerformers.length)
    .map((ev) => {
      const names = ev.qualifiedPerformers.filter((name) => {
        const key = normalizeText(name);

        if (isQualifiedPerformerScheduled(name, ev)) return false;
        if (filters.nameQuery && !key.includes(filters.nameQuery)) return false;
        if (favoritesOnlyMode && !favorites.has(key)) return false;

        return true;
      });

      return {
        event: ev,
        names,
      };
    })
    .filter((group) => group.names.length)
    .sort((a, b) =>
      (a.event.qualifiedNextStageDate || "").localeCompare(b.event.qualifiedNextStageDate || "") ||
      a.event.date.localeCompare(b.event.date) ||
      a.event.timeMinutes - b.event.timeMinutes
    );
}


function hasPublishedSecondStageDetails(nextStageDate) {
  if (!nextStageDate) return false;

  return events.some((ev) =>
    ev.eventType === "audition-2nd-east" &&
    ev.date === nextStageDate &&
    Array.isArray(ev.performers) &&
    ev.performers.length
  );
}

function getPendingSecondStageDateKeys() {
  return [...new Set(
    events
      .filter((ev) => ev.eventType === "audition-1st-east")
      .filter((ev) => Array.isArray(ev.qualifiedPerformers) && ev.qualifiedPerformers.length)
      .map((ev) => ev.qualifiedNextStageDate)
      .filter(Boolean)
  )].sort();
}

function getMainPendingSecondStageDate() {
  const today = todayString();
  const upcoming = getPendingSecondStageDateKeys().filter((date) => date >= today);
  return upcoming[0] || getPendingSecondStageDateKeys()[0] || "";
}

function filtersAllowPendingSecondStageCard(filters, nextStageDate) {
  if (!nextStageDate) return false;
  if (hasPublishedSecondStageDetails(nextStageDate)) return false;
  if (filters.eventType !== "all" && filters.eventType !== "audition-2nd-east") return false;

  const dateObj = new Date(nextStageDate);
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();

  if (filters.month !== "all" && Number(filters.month) !== month) return false;
  if (filters.day !== "all" && Number(filters.day) !== day) return false;

  return true;
}

function getPendingSecondStagePerformers(filters) {
  const nextStageDate = getMainPendingSecondStageDate();
  if (!filtersAllowPendingSecondStageCard(filters, nextStageDate)) {
    return {
      nextStageDate,
      names: [],
    };
  }

  const favorites = getFavoritePerformersSet();
  const names = [];
  const seen = new Set();

  events
    .filter((ev) => ev.eventType === "audition-1st-east")
    .filter((ev) => ev.qualifiedNextStageDate === nextStageDate)
    .filter((ev) => Array.isArray(ev.qualifiedPerformers) && ev.qualifiedPerformers.length)
    .sort((a, b) => a.date.localeCompare(b.date) || a.timeMinutes - b.timeMinutes)
    .forEach((ev) => {
      ev.qualifiedPerformers.forEach((name) => {
        const key = normalizeText(name);

        if (!key || seen.has(key)) return;
        if (filters.nameQuery && !key.includes(filters.nameQuery)) return;
        if (favoritesOnlyMode && !favorites.has(key)) return;

        names.push(name);
        seen.add(key);
      });
    });

  return {
    nextStageDate,
    names,
  };
}

function buildPendingSecondStageCardHTML(filters, favorites) {
  const { nextStageDate, names } = getPendingSecondStagePerformers(filters);
  if (!names.length) return "";

  const dateLabel = formatDateLabel(nextStageDate) || "日程未定";

  return `
    <article class="result-card pending-second-card" id="event-${nextStageDate || "pending"}-audition-2nd-east">
      <div class="datetime-venue">
        <div>${dateLabel} 開演時間未定</div>
        <div class="venue-line">会場：詳細未定</div>
      </div>
      <h3>オーディション2ndステージ EAST</h3>
      <p class="pending-second-note">
        ※詳しい公演情報が公開され次第更新します
      </p>
      <div class="performer-section">
        <div class="card-section-label">出演予定者</div>
        <div class="performers">${buildPerformerChipsHTML(names, favorites)}</div>
      </div>
    </article>
  `;
}

function updateResultNoteForPendingSecondStage(futureResults, pendingSecondStageCard) {
  const note = document.querySelector(".result-note");
  if (!note) return;

  const hasOnlyPendingSecondStageCard = Boolean(pendingSecondStageCard) && futureResults.length === 0;
  const hasNonLineupOrderEvent = futureResults.some((ev) => ev.lineupOrder === false);

  note.hidden = hasOnlyPendingSecondStageCard || hasNonLineupOrderEvent;
}

function renderMainEvents(targetId, list, filters) {
  const target = document.getElementById(targetId);
  const favorites = getFavorites();
  const pendingSecondStageCard = targetId === "results"
    ? buildPendingSecondStageCardHTML(filters, favorites)
    : "";

  if (targetId === "results") {
    updateResultNoteForPendingSecondStage(list, pendingSecondStageCard);
  }

  if (!list.length && !pendingSecondStageCard) {
    target.innerHTML = targetId === "results"
      ? '<p class="empty">該当する今後の開催はありません</p>'
      : '<p class="empty"></p>';
    return;
  }

  target.innerHTML = `${pendingSecondStageCard}${list.map((ev) => buildEventCardHTML(ev, targetId, favorites)).join("")}`;
  bindStarButtons(target);
}


function renderQualifiedSummary(filters) {
  const target = document.getElementById("qualifiedSummary");
  if (!target) return false;

  // 2nd進出者は検索結果カードとして表示するため、一覧表示は使わない
  target.innerHTML = "";
  return false;

  if (filters.eventType !== "audition-2nd-east") {
    target.innerHTML = "";
    return false;
  }

  const groups = getPendingQualifiedGroups(filters);

  if (!groups.length) {
    target.innerHTML = "";
    return false;
  }

  const dateGroups = new Map();

  groups.forEach(({ event, names }) => {
    const key = event.qualifiedNextStageDate || "undecided";
    if (!dateGroups.has(key)) dateGroups.set(key, []);
    dateGroups.get(key).push({ event, names });
  });

  const dateGroupEntries = [...dateGroups.entries()];
  const isSingleNextStageDate = dateGroupEntries.length === 1;
  const singleDateLabel = isSingleNextStageDate
    ? (dateGroupEntries[0][0] === "undecided" ? "日程未定" : `${formatDateLabel(dateGroupEntries[0][0])}出演予定`)
    : "";

  target.innerHTML = `
    <section class="qualified-summary">
      <h3>2nd進出者一覧${singleDateLabel ? ` ${singleDateLabel}` : ""}</h3>
      ${dateGroupEntries.map(([dateKey, items]) => {
        const dateLabel = dateKey === "undecided"
          ? "日程未定"
          : `${formatDateLabel(dateKey)}出演予定`;

        return `
          <div class="qualified-summary-date-group">
            ${isSingleNextStageDate ? "" : `<div class="qualified-summary-date">${dateLabel}</div>`}
            <div class="qualified-summary-list">
              ${items.map(({ event, names }) => `
                <div class="qualified-summary-item">
                  <div class="qualified-source">${formatDateLabel(event.date)} ${event.time} 通過</div>
                  <div class="qualified-summary-names">${names.map(escapeHTML).join("／")}</div>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      }).join("")}
    </section>
  `;

  return true;
}


function getEventDetailHTML(ev, targetId) {
  if (targetId !== "results") return "";

  const details = [];

  if (ev.openTime || ev.endTime) {
    const timeParts = [];
    if (ev.openTime) timeParts.push(`開場${escapeHTML(ev.openTime)}`);
    if (ev.endTime) timeParts.push(`終演${escapeHTML(ev.endTime)}`);
    if (timeParts.length) details.push(timeParts.join("｜"));
  }

  if (ev.mc) {
    details.push(`MC：${escapeHTML(ev.mc)}`);
  }

  if (ev.eventInfo) {
    details.push(escapeHTML(ev.eventInfo));
  }

  if (!details.length) return "";

  return `<div class="event-detail-note">${details.map((line) => `<div>${line}</div>`).join("")}</div>`;
}


function getEventNoticeHTML(ev) {
  if (!ev.eventNotice) return "";
  return `<p class="event-notice">${escapeHTML(ev.eventNotice)}</p>`;
}

function getNextStageSectionsHTML(ev, favorites) {
  if (!Array.isArray(ev.nextStageSections) || !ev.nextStageSections.length) return "";

  const sections = ev.nextStageSections.map((section) => {
    const performers = buildPerformerChipsHTML(section.performers || [], favorites);
    if (!performers) return "";

    return `
      <div class="next-stage-group">
        <div class="card-section-label">${escapeHTML(section.label)}</div>
        <div class="performers next-stage-list">${performers}</div>
      </div>
    `;
  }).join("");

  if (!sections.trim()) return "";

  return `
    <div class="next-stage-performers">
      ${sections}
    </div>
  `;
}

function getTicketLinkHTML(ev, targetId) {
  if (targetId !== "results") return "";

  const notePart = ev.ticketNote
    ? `<div class="ticket-extra-note">${escapeHTML(ev.ticketNote)}</div>`
    : "";

  let linkPart = "";

  if (Array.isArray(ev.ticketLinks) && ev.ticketLinks.length) {
    linkPart = `
      <div class="ticket-purchase-label">購入：</div>
      <div class="ticket-link-list">
        ${ev.ticketLinks.map((link) => `
          <div class="ticket-link-row">
            <span>${escapeHTML(link.label)} ${escapeHTML(formatDateLabel(link.date))} ${escapeHTML(link.time)}</span>
            <a href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer">FANYチケット</a>
          </div>
        `).join("")}
      </div>
    `;
  } else if (ev.ticketUrl) {
    if (ev.ticketNote) {
      linkPart = `
        <div class="ticket-purchase-link">
          購入：
          <a href="${escapeHTML(ev.ticketUrl)}" target="_blank" rel="noopener noreferrer">FANYチケット</a>
        </div>
      `;
    } else {
      linkPart = ev.eventType === "audition-2nd-east"
        ? `
          <div class="ticket-purchase-link">
            チケットは
            <a href="${escapeHTML(ev.ticketUrl)}" target="_blank" rel="noopener noreferrer">FANYチケット</a>
            からご購入ください
          </div>
        `
        : `
          <div class="ticket-purchase-link">
            チケットは取り置き、もしくは
            <a href="${escapeHTML(ev.ticketUrl)}" target="_blank" rel="noopener noreferrer">FANYチケット</a>から
          </div>
        `;
    }
  }

  const salePart = ev.ticketSaleInfo
    ? `<div class="ticket-sale-info">${escapeHTML(ev.ticketSaleInfo)}</div>`
    : "";

  const parts = [notePart, linkPart, salePart].filter((part) => part && part.trim());

  if (!parts.length) return "";

  return `<div class="ticket-note">${parts.join("")}</div>`;
}

function buildEventCardHTML(ev, targetId, favorites) {
  const performers = buildPerformerChipsHTML(ev.performers, favorites);
  const qualifiedPerformers = getQualifiedPerformersHTML(ev, favorites);
  const nextStageSections = getNextStageSectionsHTML(ev, favorites);
  const eventDetails = getEventDetailHTML(ev, targetId);
  const eventNotice = getEventNoticeHTML(ev);
  const ticketLink = getTicketLinkHTML(ev, targetId);

  return `
    <article class="result-card" id="event-${ev.id}">
      <div class="datetime-venue">
        <div>${formatDisplayDate(ev)}</div>
        <div class="venue-line">会場：${escapeHTML(ev.venue)}</div>
      </div>
      <h3>${escapeHTML(ev.title)}</h3>
      ${eventDetails}
      ${qualifiedPerformers}
      ${nextStageSections}
      ${eventNotice}
      <div class="performer-section ${(qualifiedPerformers || nextStageSections) ? "has-qualified" : ""}">
        <div class="card-section-label">出演者</div>
        <div class="performers">${performers}</div>
      </div>
      ${ticketLink}
    </article>
  `;
}

function bindStarButtons(target) {
  target.querySelectorAll(".star").forEach((btn) => {
    btn.addEventListener("click", () => toggleFavorite(btn.dataset.name));
  });
}

function renderEvents(targetId, list) {
  const target = document.getElementById(targetId);
  const favorites = getFavorites();

  if (!list.length) {
    target.innerHTML = targetId === "results"
      ? '<p class="empty">該当する今後の開催はありません</p>'
      : '<p class="empty"></p>';
    return;
  }

  target.innerHTML = list.map((ev) => buildEventCardHTML(ev, targetId, favorites)).join("");
  bindStarButtons(target);
}

function renderArchiveEvents(targetId, list, openMonths = false) {
  const target = document.getElementById(targetId);
  const favorites = getFavorites();

  if (!list.length) {
    target.innerHTML = '<p class="empty">該当する過去の開催はありません</p>';
    return;
  }

  const groups = new Map();
  list.forEach((ev) => {
    const label = `${ev.date.slice(0, 4)}年${ev.month}月`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(ev);
  });

  target.innerHTML = [...groups.entries()].map(([label, items]) => {
    const cards = items.map((ev) => buildEventCardHTML(ev, "archiveResults", favorites)).join("");
    return `
      <details class="archive-month" ${openMonths ? "open" : ""}>
        <summary>${label}</summary>
        <div class="archive-month-content">
          ${cards}
        </div>
      </details>
    `;
  }).join("");

  bindStarButtons(target);
}

function runSearch() {
  const filters = getCurrentFilters();
  const futureResults = filterEvents(events, false);
  const pastResults = filterEvents(events, true);
  const activeFilters = hasActiveFilters(filters);
  const pastOnlyHit = activeFilters && futureResults.length === 0 && pastResults.length > 0;

  const hasQualifiedSummary = renderQualifiedSummary(filters);

  if (hasQualifiedSummary && futureResults.length === 0) {
    const results = document.getElementById("results");
    if (results) results.innerHTML = "";
  } else {
    renderMainEvents("results", futureResults, filters);
  }

  if (pastOnlyHit) {
    setArchiveOpen(true);
    updateArchiveMessage("今後の開催には該当がありません。過去の開催に該当があります。");
  } else if (activeFilters && futureResults.length > 0 && pastResults.length > 0) {
    updateArchiveMessage("過去の開催にも該当があります。");
  } else {
    updateArchiveMessage("");
  }

  if (archiveOpen) {
    renderArchiveEvents("archiveResults", pastResults, activeFilters || pastOnlyHit);
  } else {
    const archiveResults = document.getElementById("archiveResults");
    if (archiveResults) archiveResults.innerHTML = "";
  }
}

function bindAutoSearch() {
  let debounceTimer;

  ["nameQuery", "eventType", "month", "day", "hour"].forEach((id) => {
    const el = document.getElementById(id);

    if (id === "nameQuery") {
      el.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runSearch, 300);
      });
    } else {
      el.addEventListener("change", runSearch);
    }
  });

  document.getElementById("clearBtn").addEventListener("click", clearFilters);
  document.getElementById("favoritesOnlyBtn").addEventListener("click", () => {
    favoritesOnlyMode = !favoritesOnlyMode;
    updateFavoritesOnlyButton();
    runSearch();
  });
  document.getElementById("randomPerformerBtn").addEventListener("click", pickRandomPerformer);
  document.getElementById("archiveToggleBtn").addEventListener("click", () => {
    setArchiveOpen(!archiveOpen);
    runSearch();
  });
  updateFavoritesOnlyButton();
}

function bindFloatingTop() {
  const floatingTopBtn = document.getElementById("floatingTopBtn");
  floatingTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", () => {
    if (window.scrollY > 280) {
      floatingTopBtn.classList.add("show");
    } else {
      floatingTopBtn.classList.remove("show");
    }
  });
}

async function init() {
  populateSelects();
  bindAutoSearch();
  bindFloatingTop();
  bindFavoriteBackup();
  setArchiveOpen(false);

  const res = await fetch("data/events.json", { cache: "no-store" });
  events = await res.json();
  renderFavoriteSchedule();
  runSearch();
}

init();
