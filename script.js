let favoritesOnlyMode = false;
const FAVORITE_KEY = "favoritePerformers";
const FALLBACK_PERFORMER_ALIAS_DATA = {
  aliases: [{ currentName: "竹迫ゆうじだ！！！", aliases: ["竹迫ゆうじ"] }],
};
let performerRenameAliases = new Map();
let events = [];
let performerProfiles = new Map();
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

function normalizeTextWithoutAliases(text) {
  return (text || "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFKC")
    .replace(/[〜～~∼]/g, "〜")
    .toLowerCase();
}

function normalizeText(text) {
  const normalized = normalizeTextWithoutAliases(text);

  return performerRenameAliases.get(normalized) || normalized;
}

function buildPerformerAliasMap(data) {
  const aliasMap = new Map();
  const groups = data && Array.isArray(data.aliases) ? data.aliases : [];

  groups.forEach((group) => {
    const currentName = normalizeTextWithoutAliases(group && group.currentName);
    if (!currentName) return;

    aliasMap.set(currentName, currentName);
    (Array.isArray(group.aliases) ? group.aliases : []).forEach((alias) => {
      const normalizedAlias = normalizeTextWithoutAliases(alias);
      if (normalizedAlias) aliasMap.set(normalizedAlias, currentName);
    });
  });

  return aliasMap;
}

function getFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];

    const normalized = [...new Set(list.map((name) => normalizeText(name)).filter(Boolean))];

    if (JSON.stringify(list) !== JSON.stringify(normalized)) {
      saveFavorites(normalized);
    }

    return normalized;
  } catch (e) {
    return [];
  }
}

function saveFavorites(favorites) {
  localStorage.setItem(FAVORITE_KEY, JSON.stringify(favorites));
}

function todayString() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);

  if (jst.getUTCHours() < 3) {
    jst.setUTCDate(jst.getUTCDate() - 1);
  }

  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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
    btn.setAttribute("aria-pressed", isFavorite ? "true" : "false");
    btn.setAttribute("aria-label", getFavoriteAriaLabel(btn.dataset.name, isFavorite));
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

function timeToMinutes(timeString) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(timeString || ""));
  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
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
      date: cursor.toISOString().slice(0, 10),
      month: cursor.getMonth() + 1,
      day: cursor.getDate(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function getEventOccurrences(ev) {
  const ticketLinks = getEventTicketLinks(ev);

  if (ticketLinks.length) {
    return ticketLinks
      .map((link) => {
        const dateObj = new Date(link.date);
        if (Number.isNaN(dateObj.getTime())) return null;

        return {
          date: link.date,
          month: dateObj.getMonth() + 1,
          day: dateObj.getDate(),
          timeMinutes: timeToMinutes(link.time) ?? ev.timeMinutes ?? 0,
        };
      })
      .filter(Boolean);
  }

  return getEventDateParts(ev).map((part) => ({
    ...part,
    timeMinutes: ev.timeMinutes ?? 0,
  }));
}

function eventMatchesDateTimeFilters(ev, filters) {
  const hasDateTimeFilter =
    filters.month !== "all" ||
    filters.day !== "all" ||
    filters.hour !== "all";

  if (!hasDateTimeFilter) return true;

  return getEventOccurrences(ev).some((occurrence) => {
    if (filters.month !== "all" && occurrence.month !== Number(filters.month)) return false;
    if (filters.day !== "all" && occurrence.day !== Number(filters.day)) return false;
    if (filters.hour !== "all" && occurrence.timeMinutes < Number(filters.hour) * 60) return false;

    return true;
  });
}

function eventMatchesFilters(ev, filters, includePast = false, options = {}) {
  const { ignoreNameQuery = false, ignoreFavoritesOnly = false } = options;
  const today = todayString();

  if (!includePast && (ev.dateEnd || ev.date) < today) return false;
  if (includePast && (ev.dateEnd || ev.date) >= today) return false;
  if (filters.eventType !== "all" && ev.eventType !== filters.eventType) return false;
  if (!eventMatchesDateTimeFilters(ev, filters)) return false;

  if (!ignoreNameQuery && filters.nameQuery) {
    const hit = (ev.performers || []).some((name) => normalizeText(name).includes(filters.nameQuery));
    if (!hit) return false;
  }

  if (!ignoreFavoritesOnly && favoritesOnlyMode && !eventHasFavorite(ev)) return false;

  return true;
}

function pickRandomPerformer() {
  const favorites = new Set(getFavorites());

  const allNames = [...new Set(
    events.flatMap((ev) => Array.isArray(ev.performers) ? ev.performers : [])
  )].filter((name) => name && name.trim());

  const pool = allNames.filter((name) => !favorites.has(normalizeText(name)));

  if (!pool.length) {
    alert("お気に入り未登録の出演者が見つかりませんでした");
    return;
  }

  const selected = pool[Math.floor(Math.random() * pool.length)];

  document.getElementById("nameQuery").value = selected;
  document.getElementById("eventType").value = "all";
  document.getElementById("month").value = "all";
  document.getElementById("day").value = "all";
  document.getElementById("hour").value = "all";
  favoritesOnlyMode = false;
  updateFavoritesOnlyButton();

  const today = todayString();
  const selectedKey = normalizeText(selected);
  const hasPastHit = events.some((ev) =>
    (ev.dateEnd || ev.date) < today &&
    Array.isArray(ev.performers) &&
    ev.performers.some((name) => normalizeText(name) === selectedKey)
  );

  setArchiveOpen(hasPastHit);
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
    .filter((ev) => (ev.dateEnd || ev.date) >= today)
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

  const pendingGroups = getPendingStageGroups({
    nameQuery: "",
    eventType: "all",
    month: "all",
    day: "all",
    hour: "all",
  }, { favoritesOnly: true });

  pendingGroups.forEach((group) => {
    if (group.nextDate && group.nextDate < today) return;

    group.names.forEach((name) => upcomingKeys.add(normalizeText(name)));

    const dateObj = group.nextDate ? new Date(group.nextDate) : new Date();
    eventGroups.push({
      event: {
        id: group.id,
        eventType: group.nextEventType,
        title: group.nextEventTitle,
        date: group.nextDate || today,
        month: Number.isNaN(dateObj.getTime()) ? 0 : dateObj.getMonth() + 1,
        day: Number.isNaN(dateObj.getTime()) ? 0 : dateObj.getDate(),
        time: group.nextTime || "未定",
        timeMinutes: timeToMinutes(group.nextTime) ?? 0,
        venue: group.venue || "詳細未定",
        performers: group.names,
        isPendingStage: true,
      },
      names: group.names,
    });
  });

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
          <button class="favorite-item favorite-jump-btn" type="button" data-event-id="${escapeHTML(event.id)}">
            <div class="favorite-meta favorite-event-line">${escapeHTML(formatDisplayDate(event))} ${escapeHTML(event.venue)}</div>
            <div class="favorite-name">${names.map((name) => escapeHTML(name)).join("／")}</div>
          </button>
        `).join("")}
      </div>
    `
    : `<p class="empty favorite-empty">掲載中の出演予定はありません</p>`;

  const noUpcomingHTML = favoriteScheduleExpanded && noUpcoming.length
    ? `
      <div class="favorite-no-upcoming">
        <div class="favorite-no-upcoming-title">掲載中の出演予定なし</div>
        <div class="favorite-name-list">${noUpcoming.map(({ name }) => escapeHTML(name)).join("、")}</div>
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
    const nameHTML = getPerformerNameHTML(name);

    return `
      <span class="performer ${isFavorite ? "favorite" : ""}">
        <button
          class="star"
          data-name="${escapeHTML(name)}"
          data-key="${escapeHTML(normalizedName)}"
          type="button"
          aria-pressed="${isFavorite ? "true" : "false"}"
          aria-label="${escapeHTML(getFavoriteAriaLabel(name, isFavorite))}"
        >${isFavorite ? "★" : "☆"}</button>
        ${nameHTML}
      </span>
    `;
  }).join("");
}

function getFavoriteAriaLabel(name, isFavorite) {
  return isFavorite
    ? `${name}をお気に入りから解除`
    : `${name}をお気に入りに追加`;
}

function getStageResults(ev) {
  if (Array.isArray(ev.stageResults) && ev.stageResults.length) {
    return ev.stageResults
      .map((result) => ({
        status: result.status || "advanced",
        label: result.label || "次ステージ進出者",
        nextEventType: result.nextEventType || "",
        nextEventTitle: result.nextEventTitle || "",
        nextDate: result.nextDate || "",
        nextTime: result.nextTime || "",
        nextVenue: result.nextVenue || "",
        performers: Array.isArray(result.performers) ? result.performers : [],
        displayStyle: result.displayStyle || "next-stage",
      }))
      .filter((result) => result.status === "none" || result.performers.length);
  }

  if (Array.isArray(ev.nextStageSections) && ev.nextStageSections.length) {
    return ev.nextStageSections
      .map((section) => ({
        status: "advanced",
        label: section.label || "次ステージ進出者",
        performers: Array.isArray(section.performers) ? section.performers : [],
        displayStyle: "next-stage",
      }))
      .filter((result) => result.performers.length);
  }

  if (ev.qualifiedResult === "none") {
    return [{
      status: "none",
      label: "2nd進出者",
      performers: [],
      displayStyle: "qualified",
    }];
  }

  if (Array.isArray(ev.qualifiedPerformers) && ev.qualifiedPerformers.length) {
    return [{
      status: "advanced",
      label: getQualifiedStageLabel(ev),
      nextEventType: "audition-2nd-east",
      nextEventTitle: "オーディション2ndステージ EAST",
      nextDate: ev.qualifiedNextStageDate || "",
      performers: ev.qualifiedPerformers,
      displayStyle: "qualified",
    }];
  }

  return [];
}

function getQualifiedStageResultsHTML(results, favorites) {
  return results.map((result) => {
    const content = result.status === "none"
      ? '<div class="qualified-none">該当者なし</div>'
      : `<div class="performers qualified-list">${buildPerformerChipsHTML(result.performers, favorites)}</div>`;

    return `
      <div class="qualified-performers">
        <div class="card-section-label">${escapeHTML(result.label)}</div>
        ${content}
      </div>
    `;
  }).join("");
}

function getNextStageResultsHTML(results, favorites) {
  const sections = results.map((result) => {
    const performers = buildPerformerChipsHTML(result.performers, favorites);
    if (!performers) return "";

    return `
      <div class="next-stage-group">
        <div class="card-section-label">${escapeHTML(result.label)}</div>
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

function getStageResultsHTML(ev, favorites) {
  const results = getStageResults(ev);
  if (!results.length) return "";

  const qualifiedResults = results.filter((result) => result.displayStyle === "qualified");
  const nextStageResults = results.filter((result) => result.displayStyle !== "qualified");

  return `
    ${getQualifiedStageResultsHTML(qualifiedResults, favorites)}
    ${getNextStageResultsHTML(nextStageResults, favorites)}
  `;
}

function getQualifiedPerformersHTML(ev, favorites) {
  return getStageResultsHTML(ev, favorites);
}

function hasPublishedStageDetails(result) {
  if (!result || !result.nextEventType || !result.nextDate) return false;

  return events.some((ev) => {
    if (ev.eventType !== result.nextEventType) return false;
    if (!Array.isArray(ev.performers) || !ev.performers.length) return false;

    if (ev.date === result.nextDate) return true;
    if (ev.dateEnd && ev.date <= result.nextDate && result.nextDate <= ev.dateEnd) return true;

    return false;
  });
}

function filtersAllowPendingStageCard(filters, result) {
  if (!result || !result.nextEventType) return false;
  if (hasPublishedStageDetails(result)) return false;
  if (filters.eventType !== "all" && filters.eventType !== result.nextEventType) return false;

  const hasDateTimeFilter =
    filters.month !== "all" ||
    filters.day !== "all" ||
    filters.hour !== "all";

  if (!hasDateTimeFilter) return true;
  if (!result.nextDate) return false;

  const dateObj = new Date(result.nextDate);
  if (Number.isNaN(dateObj.getTime())) return false;

  const occurrence = {
    month: dateObj.getMonth() + 1,
    day: dateObj.getDate(),
    timeMinutes: timeToMinutes(result.nextTime) ?? 0,
  };

  if (filters.month !== "all" && occurrence.month !== Number(filters.month)) return false;
  if (filters.day !== "all" && occurrence.day !== Number(filters.day)) return false;
  if (filters.hour !== "all" && occurrence.timeMinutes < Number(filters.hour) * 60) return false;

  return true;
}

function getPendingStageEventId(group) {
  return `pending-${group.nextEventType || "stage"}-${group.nextDate || "undecided"}`;
}

function getPendingStageGroups(filters, options = {}) {
  const favorites = getFavoritePerformersSet();
  const useFavoritesOnly = options.favoritesOnly ?? favoritesOnlyMode;
  const groups = new Map();

  events.forEach((sourceEvent) => {
    getStageResults(sourceEvent).forEach((result) => {
      if (result.status !== "advanced") return;
      if (!result.performers.length) return;
      if (!result.nextEventType) return;
      if (!filtersAllowPendingStageCard(filters, result)) return;

      const groupKey = [
        result.nextEventType || "",
        result.nextDate || "",
        result.nextEventTitle || result.label || "",
      ].join("|");

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: "",
          nextEventType: result.nextEventType || "",
          nextEventTitle: result.nextEventTitle || result.label || "次ステージ",
          nextDate: result.nextDate || "",
          nextTime: result.nextTime || "",
          venue: result.nextVenue || "詳細未定",
          label: result.label || "出演予定者",
          names: [],
          seen: new Set(),
        });
      }

      const group = groups.get(groupKey);
      result.performers.forEach((name) => {
        const key = normalizeText(name);

        if (!key || group.seen.has(key)) return;
        if (filters.nameQuery && !key.includes(filters.nameQuery)) return;
        if (useFavoritesOnly && !favorites.has(key)) return;

        group.names.push(name);
        group.seen.add(key);
      });
    });
  });

  return [...groups.values()]
    .filter((group) => group.names.length)
    .map((group) => {
      group.id = getPendingStageEventId(group);
      delete group.seen;
      return group;
    })
    .sort((a, b) =>
      (a.nextDate || "9999-99-99").localeCompare(b.nextDate || "9999-99-99") ||
      (timeToMinutes(a.nextTime) ?? 0) - (timeToMinutes(b.nextTime) ?? 0) ||
      a.nextEventTitle.localeCompare(b.nextEventTitle, "ja")
    );
}

function buildPendingStageCardHTML(group, favorites) {
  const dateLabel = formatDateLabel(group.nextDate) || "日程未定";
  const timeLabel = group.nextTime ? `開演${escapeHTML(group.nextTime)}` : "開演時間未定";

  return `
    <article class="result-card pending-stage-card" id="event-${group.id}">
      <div class="datetime-venue">
        <div>${dateLabel} ${timeLabel}</div>
        <div class="venue-line">会場：${escapeHTML(group.venue)}</div>
      </div>
      <h3>${escapeHTML(group.nextEventTitle)}</h3>
      <p class="pending-stage-note">
        ※詳しい公演情報が公開され次第更新します
      </p>
      <div class="performer-section">
        <div class="card-section-label">出演予定者</div>
        <div class="performers">${buildPerformerChipsHTML(group.names, favorites)}</div>
      </div>
    </article>
  `;
}

function buildPendingStageCardsHTML(filters, favorites) {
  return getPendingStageGroups(filters)
    .map((group) => buildPendingStageCardHTML(group, favorites))
    .join("");
}


function isLineupOrderedEvent(ev) {
  if (ev.lineupOrder === false) return false;
  if (ev.lineupOrder === true) return true;

  return ev.eventType === "audition-1st-east" || ev.eventType === "audition-2nd-east";
}

function getResultNoteMessage(futureResults, pendingStageCards) {
  if (pendingStageCards && !futureResults.length) return "";

  const hasLineupOrderedEvent = futureResults.some((ev) => isLineupOrderedEvent(ev));
  if (!hasLineupOrderedEvent) return "";

  const hasUnorderedEvent = futureResults.some((ev) => !isLineupOrderedEvent(ev));

  return hasUnorderedEvent
    ? "※オーディションの出演者は香盤順です"
    : "※出演者は香盤順です";
}

function updateResultNoteForCurrentResults(futureResults, pendingStageCards) {
  const note = document.getElementById("resultNote") || document.querySelector(".result-note");
  if (!note) return;

  const message = getResultNoteMessage(futureResults, pendingStageCards);
  note.hidden = !message;
  note.innerHTML = message ? `${escapeHTML(message)}<br>` : "";
}

function renderMainEvents(targetId, list, filters) {
  const target = document.getElementById(targetId);
  const favorites = getFavorites();
  const pendingStageGroups = targetId === "results"
    ? getPendingStageGroups(filters)
    : [];

  if (targetId === "results") {
    updateResultNoteForCurrentResults(list, pendingStageGroups.length > 0);
  }

  const renderItems = [
    ...list.map((ev) => ({
      date: ev.date || "9999-99-99",
      timeMinutes: ev.timeMinutes ?? 0,
      title: ev.title || "",
      html: buildEventCardHTML(ev, targetId, favorites),
    })),
    ...pendingStageGroups.map((group) => ({
      date: group.nextDate || "9999-99-99",
      // 開演時間未定は、同じ日の時刻確定済み公演より後ろに並べる。
      timeMinutes: timeToMinutes(group.nextTime) ?? 24 * 60,
      title: group.nextEventTitle || "",
      html: buildPendingStageCardHTML(group, favorites),
    })),
  ].sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.timeMinutes - b.timeMinutes ||
    a.title.localeCompare(b.title, "ja")
  );

  if (!renderItems.length) {
    target.innerHTML = targetId === "results"
      ? '<p class="empty">該当する今後の開催はありません</p>'
      : '<p class="empty"></p>';
    return;
  }

  target.innerHTML = renderItems.map((item) => item.html).join("");
  bindStarButtons(target);
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


function getTicketInfo(ev) {
  const ticket = ev.ticket || {};

  return {
    purchaseNote: ticket.purchaseNote ?? ev.ticketNote ?? "",
    saleInfo: ticket.saleInfo ?? ev.ticketSaleInfo ?? "",
    links: Array.isArray(ticket.links)
      ? ticket.links
      : (Array.isArray(ev.ticketLinks) ? ev.ticketLinks : []),
    url: ticket.url ?? ticket.ticketUrl ?? ev.ticketUrl ?? "",
    streamingUrl: ticket.streamingUrl ?? ev.streamingUrl ?? "",
    streamingLabel: ticket.streamingLabel ?? ev.streamingLabel ?? "配信",
    streamingNote: ticket.streamingNote ?? ev.streamingNote ?? "",
  };
}

function getEventTicketLinks(ev) {
  return getTicketInfo(ev).links;
}

function getEventNoticeHTML(ev) {
  if (!ev.eventNotice) return "";
  return `<p class="event-notice">${escapeHTML(ev.eventNotice)}</p>`;
}

function getNextStageSectionsHTML(ev, favorites) {
  return getStageResultsHTML(ev, favorites);
}

function getTicketLinkHTML(ev, targetId) {
  if (targetId !== "results") return "";

  const ticket = getTicketInfo(ev);

  const notePart = ticket.purchaseNote
    ? `<div class="ticket-extra-note">${escapeHTML(ticket.purchaseNote)}</div>`
    : "";

  let linkPart = "";

  if (ticket.links.length) {
    linkPart = `
      <div class="ticket-purchase-label">購入：</div>
      <div class="ticket-link-list">
        ${ticket.links.map((link) => `
          <div class="ticket-link-row">
            <span>${escapeHTML(link.label)} ${escapeHTML(formatDateLabel(link.date))} ${escapeHTML(link.time)}</span>
            <a href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer">FANYチケット</a>
          </div>
        `).join("")}
      </div>
    `;
  } else if (ticket.url) {
    if (ticket.purchaseNote) {
      linkPart = `
        <div class="ticket-purchase-link">
          購入：
          <a href="${escapeHTML(ticket.url)}" target="_blank" rel="noopener noreferrer">FANYチケット</a>
        </div>
      `;
    } else {
      linkPart = ev.eventType === "audition-2nd-east"
        ? `
          <div class="ticket-purchase-link">
            チケットは
            <a href="${escapeHTML(ticket.url)}" target="_blank" rel="noopener noreferrer">FANYチケット</a>
            からご購入ください
          </div>
        `
        : `
          <div class="ticket-purchase-link">
            チケットは取り置き、もしくは
            <a href="${escapeHTML(ticket.url)}" target="_blank" rel="noopener noreferrer">FANYチケット</a>から
          </div>
        `;
    }
  }

  const streamingPart = ticket.streamingUrl
    ? `
      <div class="ticket-streaming-link">
        ${escapeHTML(ticket.streamingLabel)}：
        <a href="${escapeHTML(ticket.streamingUrl)}" target="_blank" rel="noopener noreferrer">配信チケット</a>
      </div>
    `
    : (ticket.streamingNote
      ? `<div class="ticket-streaming-note">${escapeHTML(ticket.streamingNote)}</div>`
      : "");

  const salePart = ticket.saleInfo
    ? `<div class="ticket-sale-info">${escapeHTML(ticket.saleInfo)}</div>`
    : "";

  const parts = [notePart, linkPart, streamingPart, salePart].filter((part) => part && part.trim());

  if (!parts.length) return "";

  return `<div class="ticket-note">${parts.join("")}</div>`;
}

function buildEventCardHTML(ev, targetId, favorites) {
  const performers = buildPerformerChipsHTML(ev.performers, favorites);
  const stageResults = getStageResultsHTML(ev, favorites);
  const eventDetails = getEventDetailHTML(ev, targetId);
  const eventNotice = getEventNoticeHTML(ev);
  const ticketLink = getTicketLinkHTML(ev, targetId);

  return `
    <article class="result-card" id="event-${escapeHTML(ev.id)}">
      <div class="datetime-venue">
        <div>${escapeHTML(formatDisplayDate(ev))}</div>
        <div class="venue-line">会場：${escapeHTML(ev.venue)}</div>
      </div>
      <h3>${escapeHTML(ev.title)}</h3>
      ${eventDetails}
      ${stageResults}
      ${eventNotice}
      <div class="performer-section ${stageResults ? "has-qualified" : ""}">
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

  renderMainEvents("results", futureResults, filters);

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


async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`${path} を読み込めませんでした`);
  }
  return res.json();
}

function extractEventsList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.events)) return data.events;
  throw new Error("イベントJSONの形式が正しくありません");
}

async function loadEventsData() {
  try {
    const index = await fetchJSON("data/events-index.json");
    if (!index || !Array.isArray(index.files) || !index.files.length) {
      throw new Error("events-index.json の files が空です");
    }

    const monthlyEvents = await Promise.all(
      index.files.map(async (file) => {
        const path = file.startsWith("data/") ? file : `data/${file}`;
        const data = await fetchJSON(path);
        return extractEventsList(data);
      })
    );

    return monthlyEvents.flat();
  } catch (e) {
    console.warn("月別JSONの読み込みに失敗したため、従来の data/events.json を読み込みます", e);
    const data = await fetchJSON("data/events.json");
    return extractEventsList(data);
  }
}

function extractProfilesMap(data) {
  const profiles = data && data.profiles && typeof data.profiles === "object"
    ? data.profiles
    : {};

  const profileMap = new Map();

  Object.entries(profiles).forEach(([name, profile]) => {
    const officialUrl = profile && (profile.officialUrl || profile.url);
    if (!name || !officialUrl) return;

    profileMap.set(normalizeText(name), {
      name,
      officialUrl,
      checkedAt: profile.checkedAt || "",
    });
  });

  return profileMap;
}

async function loadPerformerAliasesData() {
  try {
    const data = await fetchJSON("data/performer-aliases.json");
    return buildPerformerAliasMap(data);
  } catch (e) {
    console.warn("performer-aliases.json を読み込めなかったため、内蔵の改名情報を使用します", e);
    return buildPerformerAliasMap(FALLBACK_PERFORMER_ALIAS_DATA);
  }
}

async function loadProfilesData() {
  try {
    const data = await fetchJSON("data/profiles.json");
    return extractProfilesMap(data);
  } catch (e) {
    console.warn("profiles.json を読み込めなかったため、プロフィールリンクなしで表示します", e);
    return new Map();
  }
}

function getPerformerProfile(name) {
  return performerProfiles.get(normalizeText(name)) || null;
}

function getPerformerNameHTML(name) {
  const profile = getPerformerProfile(name);

  if (!profile || !profile.officialUrl) {
    return `<span class="performer-name">${escapeHTML(name)}</span>`;
  }

  return `
    <a
      class="performer-profile-link"
      href="${escapeHTML(profile.officialUrl)}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="${escapeHTML(name)}の公式プロフィールを開く"
    >
      <span class="performer-name-text">${escapeHTML(name)}</span>
      <span class="external-link-icon" aria-hidden="true">↗</span>
    </a>
  `;
}

async function loadSiteAlertData() {
  try {
    return await fetchJSON("data/site-alert.json");
  } catch (e) {
    console.warn("site-alert.json を読み込めなかったため、HTML内のお知らせを表示します", e);
    return null;
  }
}

function renderSiteAlert(alertData) {
  const wrapper = document.getElementById("siteAlert");
  const icon = document.getElementById("siteAlertIcon");
  const heading = document.getElementById("siteAlertHeading");
  const message = document.getElementById("siteAlertMessage");
  const note = document.getElementById("siteAlertNote");

  if (!wrapper || !heading || !message || !note) return;

  if (alertData && alertData.enabled === false) {
    wrapper.hidden = true;
    return;
  }

  if (!alertData) {
    wrapper.hidden = false;
    return;
  }

  if (icon) {
    icon.textContent = alertData.icon || "⚠️";
  }

  heading.textContent = alertData.heading || "";
  message.textContent = alertData.message || "";
  note.textContent = alertData.note ? `※${alertData.note}` : "";
  note.hidden = !alertData.note;
  wrapper.hidden = !(alertData.heading || alertData.message || alertData.note);
}

async function loadSiteNoticeData() {
  try {
    return await fetchJSON("data/site-notice.json");
  } catch (e) {
    console.warn("site-notice.json を読み込めなかったため、お知らせは非表示にします", e);
    return null;
  }
}

function renderSiteNotice(noticeData) {
  const wrapper = document.getElementById("siteNotice");
  const track = document.getElementById("siteNoticeTrack");
  if (!wrapper || !track) return;

  const items = noticeData && noticeData.enabled && Array.isArray(noticeData.items)
    ? noticeData.items.filter((item) => item && item.message)
    : [];

  if (!items.length) {
    wrapper.hidden = true;
    track.innerHTML = "";
    return;
  }

  const text = items.map((item) => {
    const label = item.label ? `${item.label} ` : "";
    const detail = item.detail ? `　${item.detail}` : "";
    return `${label}${item.message}${detail}`;
  }).join("　／　");

  const content = `<span>${escapeHTML(text)}</span>`;

  wrapper.hidden = false;
  track.innerHTML = `${content}${content}`;
}

async function init() {
  populateSelects();
  bindAutoSearch();
  bindFloatingTop();
  bindFavoriteBackup();
  setArchiveOpen(false);

  try {
    performerRenameAliases = await loadPerformerAliasesData();

    const [loadedEvents, loadedProfiles, loadedNotice, loadedAlert] = await Promise.all([
      loadEventsData(),
      loadProfilesData(),
      loadSiteNoticeData(),
      loadSiteAlertData(),
    ]);

    events = loadedEvents;
    performerProfiles = loadedProfiles;
    renderSiteNotice(loadedNotice);
    renderSiteAlert(loadedAlert);
  } catch (e) {
    console.error(e);
    const results = document.getElementById("results");
    if (results) {
      results.innerHTML = '<p class="empty">イベント情報を読み込めませんでした。時間をおいて再読み込みしてください。</p>';
    }
    return;
  }

  renderFavoriteSchedule();
  runSearch();
}

init();
