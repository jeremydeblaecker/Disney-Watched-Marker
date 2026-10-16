/** Disney+ Watched Marker — Firefox */
(() => {
  const STORAGE_KEY = "watchedItems";
  const SETTINGS_KEY = "settings";
  const SCAN_DEBOUNCE_MS = 450;
  const VIDEO_POLL_MS = 2000;
  const SAVE_MIN_INTERVAL_MS = 4000;
  let settings = { enabled: true, watchedThreshold: 0.9, showProgressBar: true, hideWatched: false };
  let watchedCache = {};
  let lastSaveAt = 0;
  let currentVideoId = null;
  let currentUrl = location.href;
  let videoPollTimer = null;
  const observedVideos = new WeakSet();

  function debounce(fn, wait) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; }
  function normalizePath(pathname) { return pathname.replace(/\/+$/, "") || "/"; }
  function isPlatformHost(host) { return host === "disneyplus.com" || host.endsWith(".disneyplus.com"); }

  function extractContentId(rawUrl) {
    try {
      const url = new URL(rawUrl, location.origin);
      const path = normalizePath(url.pathname);
      const entity = path.match(/\/browse\/entity-([0-9a-f-]{36})/i);
      if (entity) return `disney:${entity[1].toLowerCase()}`;
      const play = path.match(/\/play\/([0-9a-f-]{36})/i);
      if (play) return `disney:${play[1].toLowerCase()}`;
      return `path:${url.hostname}${path}`;
    } catch { return `raw:${rawUrl}`; }
  }

  function isContentLink(href) {
    if (!href) return false;
    try { const url = new URL(href, location.origin); if (!isPlatformHost(url.hostname)) return false; return /\/browse\/entity-[0-9a-f-]{36}/i.test(url.pathname) || /\/play\/[0-9a-f-]{36}/i.test(url.pathname); } catch { return false; }
  }

  function cleanTitle() { return document.title.replace(/\s*[-|–]\s*Disney\+.*$/i, "").replace(/^Disney\+\s*[-:]\s*/i, "").trim(); }
  async function loadState() { const data = await browser.storage.local.get([STORAGE_KEY, SETTINGS_KEY]); watchedCache = data[STORAGE_KEY] || {}; settings = { ...settings, ...(data[SETTINGS_KEY] || {}) }; applyHideWatchedClass(); }
  async function saveWatchedItem(id, patch) { watchedCache[id] = { ...(watchedCache[id] || {}), ...patch, updatedAt: Date.now() }; await browser.storage.local.set({ [STORAGE_KEY]: watchedCache }); }
  function applyHideWatchedClass() { document.documentElement.classList.toggle("nfwm-hide-watched", !!settings.hideWatched); }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORAGE_KEY]) watchedCache = changes[STORAGE_KEY].newValue || {};
    if (changes[SETTINGS_KEY]) { settings = { ...settings, ...(changes[SETTINGS_KEY].newValue || {}) }; applyHideWatchedClass(); }
    scheduleScan();
  });

  function attachVideoWatcher(video) {
    if (observedVideos.has(video)) return;
    observedVideos.add(video);
    const saveProgress = async () => {
      if (!settings.enabled || !video.duration || Number.isNaN(video.duration) || video.duration <= 0) return;
      const id = currentVideoId || extractContentId(location.href);
      const progress = Math.min(1, Math.max(0, video.currentTime / video.duration));
      const watched = progress >= settings.watchedThreshold;
      const now = Date.now();
      if (now - lastSaveAt >= SAVE_MIN_INTERVAL_MS || watched) {
        lastSaveAt = now;
        await saveWatchedItem(id, { progress, watched: watched || !!watchedCache[id]?.watched, title: cleanTitle(), url: location.href });
      }
    };
    video.addEventListener("timeupdate", debounce(saveProgress, 1000));
    video.addEventListener("pause", saveProgress);
    video.addEventListener("ended", async () => { const id = currentVideoId || extractContentId(location.href); await saveWatchedItem(id, { progress: 1, watched: true, title: cleanTitle(), url: location.href }); });
  }

  function pollForVideoElement() { clearInterval(videoPollTimer); videoPollTimer = setInterval(() => document.querySelectorAll("video").forEach(attachVideoWatcher), VIDEO_POLL_MS); document.querySelectorAll("video").forEach(attachVideoWatcher); }

  function findCardElement(anchor) {
    const visualSelector = "img, picture, video, [style*='background-image']";
    const candidates = [anchor];
    let el = anchor.parentElement;
    for (let i = 0; i < 8 && el; i++, el = el.parentElement) candidates.push(el);

    let best = anchor;
    let bestScore = -1;
    for (const candidate of candidates) {
      const r = candidate.getBoundingClientRect();
      if (r.width < 85 || r.height < 55 || r.width > 900 || r.height > 750) continue;
      const visual = candidate.querySelector(visualSelector);
      if (!visual) continue;

      const vr = visual.getBoundingClientRect();
      const visualCoverage = Math.min(1, (vr.width * vr.height) / Math.max(1, r.width * r.height));
      const anchorCoverage = Math.min(1, (anchor.getBoundingClientRect().width * anchor.getBoundingClientRect().height) / Math.max(1, r.width * r.height));
      const score = visualCoverage * 4 + anchorCoverage * 2 - candidates.indexOf(candidate) * 0.08;
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    return best;
  }

  function ensureLayer(card) {
    if (getComputedStyle(card).position === "static") card.classList.add("nfwm-relative");
    let layer=card.querySelector(":scope > .nfwm-badge-layer");
    if (!layer) { layer=document.createElement("div"); layer.className="nfwm-badge-layer"; card.appendChild(layer); }
    return layer;
  }

  function createToggleButton(id, isWatched) {
    const b=document.createElement("button"); b.type="button"; b.className="nfwm-toggle-btn"; b.title=isWatched?"Marquer comme non vu":"Marquer comme vu"; b.textContent="✓";
    b.addEventListener("mousedown",e=>e.stopPropagation());
    b.addEventListener("click",async e=>{ e.preventDefault(); e.stopPropagation(); const current=watchedCache[id]||{}; const watched=!current.watched; await saveWatchedItem(id,{watched,progress:watched?1:0,title:current.title||"",url:current.url||""}); scanAndMark(); });
    return b;
  }

  function clearMarker(card) {
    card.classList.remove("nfwm-card", "nfwm-watched");
    card.removeAttribute("data-nfwm-state");
    card.querySelector(":scope > .nfwm-badge-layer")?.remove();
  }

  function markCard(anchor) {
    const id = extractContentId(anchor.href);
    const item = watchedCache[id] || {};
    const isWatched = !!item.watched;
    const progress = Number(item.progress || 0);
    const progressPercent = settings.showProgressBar && progress > 0.02 && progress < 1
      ? Math.round(progress * 100)
      : 0;
    const card = findCardElement(anchor);

    if (!settings.enabled) {
      if (card.classList.contains("nfwm-card")) clearMarker(card);
      return card;
    }

    const state = `${id}|${isWatched ? 1 : 0}|${progressPercent}`;
    if (card.dataset.nfwmState === state && card.querySelector(":scope > .nfwm-badge-layer")) {
      return card;
    }

    card.classList.add("nfwm-card");
    card.classList.toggle("nfwm-watched", isWatched);
    card.dataset.nfwmState = state;

    const oldLayer = card.querySelector(":scope > .nfwm-badge-layer");
    const layer = document.createElement("div");
    layer.className = "nfwm-badge-layer";

    if (isWatched) {
      const label = document.createElement("div");
      label.className = "nfwm-watched-label";
      label.textContent = "Déjà vu";
      layer.appendChild(label);
    }

    layer.appendChild(createToggleButton(id, isWatched));

    if (progressPercent > 0) {
      const bar = document.createElement("div");
      bar.className = "nfwm-progress-bar";
      const fill = document.createElement("div");
      fill.className = "nfwm-progress-fill";
      fill.style.width = `${progressPercent}%`;
      bar.appendChild(fill);
      layer.appendChild(bar);
    }

    if (getComputedStyle(card).position === "static") card.classList.add("nfwm-relative");
    if (oldLayer) oldLayer.replaceWith(layer); else card.appendChild(layer);
    return card;
  }

  function scanAndMark() {
    if (!document.body) return;
    const seen = new Set();

    document.querySelectorAll("a[href]").forEach(anchor => {
      if (!isContentLink(anchor.href)) return;
      const card = findCardElement(anchor);
      if (seen.has(card)) return;
      seen.add(card);
      markCard(anchor);
    });

    document.querySelectorAll(".nfwm-card").forEach(card => {
      if (!seen.has(card) || !card.isConnected) clearMarker(card);
    });
  }
  const scheduleScan=debounce(scanAndMark,SCAN_DEBOUNCE_MS);
  function handleUrlChange() { if (location.href===currentUrl) return; currentUrl=location.href; currentVideoId=extractContentId(currentUrl); scheduleScan(); }
  function trackUrlChanges() { const ps=history.pushState, rs=history.replaceState; history.pushState=function(...a){const r=ps.apply(this,a);setTimeout(handleUrlChange,0);return r;}; history.replaceState=function(...a){const r=rs.apply(this,a);setTimeout(handleUrlChange,0);return r;}; window.addEventListener("popstate",handleUrlChange); setInterval(handleUrlChange,1500); }
  function isOwnMarkerMutation(record) {
    const isMarkerNode = node => {
      if (!(node instanceof Element)) return false;
      return node.classList.contains("nfwm-badge-layer") ||
        node.classList.contains("nfwm-watched-label") ||
        node.classList.contains("nfwm-toggle-btn") ||
        node.classList.contains("nfwm-progress-bar") ||
        node.classList.contains("nfwm-progress-fill") ||
        !!node.closest(".nfwm-badge-layer");
    };

    if (isMarkerNode(record.target)) return true;
    const changedNodes = [...record.addedNodes, ...record.removedNodes];
    return changedNodes.length > 0 && changedNodes.every(isMarkerNode);
  }

  function observeDom() {
    new MutationObserver(records => {
      if (records.every(isOwnMarkerMutation)) return;
      scheduleScan();
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  browser.runtime.onMessage.addListener(message=>{ if (message?.type==="REFRESH_MARKERS") scanAndMark(); });
  (async()=>{ await loadState(); currentVideoId=extractContentId(location.href); scanAndMark(); pollForVideoElement(); trackUrlChanges(); observeDom(); })();
})();
