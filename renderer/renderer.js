const CHECK_ALL_SCRIPT = `(() => {
  let count = 0;

  function collectRoots(root) {
    const roots = [root];
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    });
    return roots;
  }

  function processDocument(doc) {
    if (!doc) return;
    for (const root of collectRoots(doc)) {
      root.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        if (!cb.disabled && !cb.checked) {
          cb.click();
          count++;
        }
      });
    }
    doc.querySelectorAll('iframe, frame, object, embed').forEach((frameEl) => {
      try {
        const innerDoc = frameEl.contentDocument
          || frameEl.contentWindow?.document
          || frameEl.getSVGDocument?.();
        processDocument(innerDoc);
      } catch (_err) {
        // 跨域子页面无法直接访问，由主进程逐帧注入脚本处理
      }
    });
  }

  processDocument(document);
  return count;
})()`;

const PAGE_STATE_SCRIPT = `(() => {
  function collectRoots(root) {
    const roots = [root];
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    });
    return roots;
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) > 0;
  }

  function scanDocument(doc, state) {
    if (!doc) return;
    for (const root of collectRoots(doc)) {
      for (const mask of root.querySelectorAll(
        '.datagrid-mask, .datagrid-mask-msg, .messager-progress, .pagination-loading'
      )) {
        if (isVisible(mask)) state.loading = true;
      }
      for (const cb of root.querySelectorAll('input[type="checkbox"]')) {
        if (isVisible(cb)) state.count++;
      }
    }
    doc.querySelectorAll('iframe, frame, object, embed').forEach((frameEl) => {
      try {
        const innerDoc = frameEl.contentDocument
          || frameEl.contentWindow?.document
          || frameEl.getSVGDocument?.();
        scanDocument(innerDoc, state);
      } catch (_err) {
        // 跨域子页面无法直接访问
      }
    });
  }

  const state = { loading: false, count: 0 };
  scanDocument(document, state);
  return state;
})()`;

const PAGE_DIMENSIONS_SCRIPT = `(() => {
  function measureDocument(doc, size) {
    if (!doc) return;
    const root = doc.documentElement;
    const body = doc.body;
    size.width = Math.max(
      size.width,
      root?.scrollWidth || 0,
      root?.offsetWidth || 0,
      body?.scrollWidth || 0,
      body?.offsetWidth || 0
    );
    size.height = Math.max(
      size.height,
      root?.scrollHeight || 0,
      root?.offsetHeight || 0,
      body?.scrollHeight || 0,
      body?.offsetHeight || 0
    );

    for (const sel of ['.datagrid-view', '.datagrid-view2', '.panel-body', 'table', '.layout-panel']) {
      doc.querySelectorAll(sel).forEach((el) => {
        size.width = Math.max(size.width, el.scrollWidth || 0, el.offsetWidth || 0);
        size.height = Math.max(size.height, el.scrollHeight || 0, el.offsetHeight || 0);
      });
    }

    doc.querySelectorAll('iframe, frame, object, embed').forEach((frameEl) => {
      try {
        const innerDoc = frameEl.contentDocument
          || frameEl.contentWindow?.document
          || frameEl.getSVGDocument?.();
        measureDocument(innerDoc, size);
      } catch (_err) {
        // 跨域子页面无法直接访问
      }
    });
  }

  const size = { width: 0, height: 0 };
  measureDocument(document, size);
  return size;
})()`;

const ENABLE_PAGE_SCROLL_SCRIPT = `(() => {
  if (document.documentElement.dataset.zmnScrollFix === '1') return true;
  document.documentElement.dataset.zmnScrollFix = '1';
  const style = document.createElement('style');
  style.textContent = [
    'html, body { overflow: auto !important; }',
    'body { min-width: min-content; }'
  ].join('\\n');
  (document.head || document.documentElement).appendChild(style);
  return true;
})()`;

const CLICK_NEXT_SCRIPT = `(() => {
  const tags = ['a', 'button', 'span', 'div', 'li', 'input[type="button"]', '[role="button"]'];

  function collectRoots(root) {
    const roots = [root];
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    });
    return roots;
  }

  function isDisabled(el) {
    if (!el) return true;
    let node = el;
    while (node && node !== document.documentElement) {
      if (node.disabled) return true;
      if (node.classList?.contains('disabled') || node.classList?.contains('l-btn-disabled')) return true;
      if (node.getAttribute?.('aria-disabled') === 'true') return true;
      node = node.parentElement;
    }
    const style = window.getComputedStyle(el);
    return style.display === 'none'
      || style.visibility === 'hidden'
      || style.pointerEvents === 'none';
  }

  function findClickable(el) {
    return el.closest('a, button, [role="button"]') || el;
  }

  function tryClickEasyUINext(root) {
    for (const icon of root.querySelectorAll('.pagination-next, .l-btn-icon.pagination-next')) {
      const btn = findClickable(icon);
      if (!btn || isDisabled(btn)) continue;
      btn.click();
      return true;
    }
    return false;
  }

  function tryClickTextNext(root, seen) {
    for (const tag of tags) {
      for (const el of root.querySelectorAll(tag)) {
        if (seen.has(el)) continue;
        seen.add(el);
        const text = (el.innerText || el.textContent || '').trim();
        if (text !== '下一页') continue;
        if (isDisabled(el)) continue;
        el.click();
        return true;
      }
    }
    return false;
  }

  function tryClickInDocument(doc) {
    if (!doc) return false;
    const seen = new Set();
    for (const root of collectRoots(doc)) {
      if (tryClickEasyUINext(root)) return true;
      if (tryClickTextNext(root, seen)) return true;
    }
    for (const frameEl of doc.querySelectorAll('iframe, frame, object, embed')) {
      try {
        const innerDoc = frameEl.contentDocument
          || frameEl.contentWindow?.document
          || frameEl.getSVGDocument?.();
        if (tryClickInDocument(innerDoc)) return true;
      } catch (_err) {
        // 跨域子页面无法直接访问
      }
    }
    return false;
  }

  return tryClickInDocument(document);
})()`;

const DEFAULT_HOME = 'about:blank';
const PAGE_READY_POLL_MS = 200;
const PAGE_READY_STABLE_POLLS = 3;
const PAGE_READY_TIMEOUT_MS = 30000;
const MAX_PAGES = 500;
const BOOKMARK_STORAGE_KEY = 'zhuomuniao.bookmarks.v1';
const PAGE_WIDTH_STORAGE_KEY = 'zhuomuniao.pageWidth.v1';
const PAGE_WIDTH_MIN = 800;
const PAGE_WIDTH_MAX = 3840;
const PAGE_WIDTH_STEP = 50;
const PAGE_WIDTH_BASE = 1280;
const PAGE_ZOOM_MIN = 0.25;
const PAGE_ZOOM_MAX = 4;
const MAX_BOOKMARKS = 80;
const CONTENT_SIZE_DELAYS_MS = [300, 1000, 2500];

let tabIdCounter = 0;
let activeTabId = null;
const tabs = new Map();
let bookmarks = [];

let autoCheckRunning = false;
let autoCheckAbort = false;

const tabsEl = document.getElementById('tabs');
const webviewContainer = document.getElementById('webview-container');
const pageWidthSlider = document.getElementById('page-width-slider');
const pageWidthValue = document.getElementById('page-width-value');
const pageWidthPanel = document.getElementById('page-width-panel');
const btnPageWidth = document.getElementById('btn-page-width');
const rulerTicksEl = document.getElementById('ruler-ticks');
const widthCrosshair = document.getElementById('width-crosshair');

function updateCrosshairPosition() {
  if (!widthCrosshair || !pageWidthSlider) return;
  const min = Number(pageWidthSlider.min) || PAGE_WIDTH_MIN;
  const max = Number(pageWidthSlider.max) || PAGE_WIDTH_MAX;
  const value = Number(pageWidthSlider.value);
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  widthCrosshair.style.left = `${percent}%`;
}

function buildApplyPageLayoutScript(width) {
  return `(() => {
    const targetWidth = ${Math.max(1, Math.round(width))};
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      (document.head || document.documentElement).appendChild(meta);
    }
    meta.content = 'width=' + targetWidth + ', initial-scale=1';
    window.dispatchEvent(new Event('resize'));
    return window.innerWidth;
  })()`;
}

function getViewportSize() {
  if (!webviewContainer) return { width: 0, height: 0 };
  const rect = webviewContainer.getBoundingClientRect();
  return {
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height))
  };
}

function getManualPageWidth() {
  if (!pageWidthSlider) return PAGE_WIDTH_MIN;
  const value = Number.parseInt(pageWidthSlider.value, 10);
  if (!Number.isFinite(value)) return PAGE_WIDTH_MIN;
  return Math.max(PAGE_WIDTH_MIN, value);
}

function updatePageWidthLabel() {
  if (pageWidthValue) {
    const width = getManualPageWidth();
    const tab = activeTabId != null ? tabs.get(activeTabId) : null;
    const zoom = tab ? getPageZoomFactor(tab) : width / PAGE_WIDTH_BASE;
    pageWidthValue.textContent = `${width}px · ${Math.round(zoom * 100)}%`;
  }
  updateCrosshairPosition();
}

function renderRulerTicks() {
  if (!rulerTicksEl || !pageWidthSlider) return;

  const min = Number(pageWidthSlider.min) || PAGE_WIDTH_MIN;
  const max = Number(pageWidthSlider.max) || PAGE_WIDTH_MAX;
  const step = Number(pageWidthSlider.step) || PAGE_WIDTH_STEP;

  rulerTicksEl.innerHTML = '';
  for (let value = min; value <= max; value += step) {
    const tick = document.createElement('span');
    const isMajor = value % 400 === 0 || value === min || value === max;
    tick.className = `width-tick ${isMajor ? 'major' : 'minor'}`;
    tick.style.left = `${((value - min) / (max - min)) * 100}%`;
    rulerTicksEl.appendChild(tick);
  }

  updateCrosshairPosition();
}

function loadPageWidthMode() {
  if (!pageWidthSlider) return;
  try {
    const saved = localStorage.getItem(PAGE_WIDTH_STORAGE_KEY);
    if (saved) {
      const value = Number.parseInt(saved, 10);
      if (Number.isFinite(value) && value >= PAGE_WIDTH_MIN) {
        pageWidthSlider.value = String(Math.min(value, Number(pageWidthSlider.max) || PAGE_WIDTH_MAX));
      }
    }
  } catch (_err) {
    // 忽略本地存储不可用
  }
  updatePageWidthLabel();
}

function savePageWidthMode() {
  if (!pageWidthSlider) return;
  try {
    localStorage.setItem(PAGE_WIDTH_STORAGE_KEY, String(getManualPageWidth()));
  } catch (_err) {
    // 忽略本地存储不可用
  }
}

function initPageWidthSlider() {
  if (!pageWidthSlider) return;

  pageWidthSlider.min = String(PAGE_WIDTH_MIN);
  pageWidthSlider.max = String(PAGE_WIDTH_MAX);
  pageWidthSlider.step = String(PAGE_WIDTH_STEP);

  loadPageWidthMode();

  try {
    if (!localStorage.getItem(PAGE_WIDTH_STORAGE_KEY)) {
      const viewport = getViewportSize();
      if (viewport.width >= PAGE_WIDTH_MIN) {
        pageWidthSlider.value = String(Math.max(PAGE_WIDTH_MIN, viewport.width));
      }
    }
  } catch (_err) {
    // 忽略本地存储不可用
  }

  updatePageWidthLabel();
  renderRulerTicks();
}

function getPageZoomFactor(tab) {
  const target = getManualPageWidth();
  const base = tab?.naturalWidth || PAGE_WIDTH_BASE;
  const zoom = target / base;
  return Math.max(PAGE_ZOOM_MIN, Math.min(PAGE_ZOOM_MAX, zoom));
}

function applyPageZoom(tab, zoom) {
  if (!tab?.webview) return;

  const factor = Math.max(PAGE_ZOOM_MIN, Math.min(PAGE_ZOOM_MAX, zoom));
  try {
    if (typeof tab.webview.setZoomFactor === 'function') {
      tab.webview.setZoomFactor(factor);
      return;
    }
  } catch (_err) {
    // 回退到主进程设置
  }

  const guestId = getWebviewGuestId(tab.webview);
  if (guestId && window.electronAPI?.setWebviewZoom) {
    window.electronAPI.setWebviewZoom(guestId, factor).catch(() => {});
  }
}

async function applyPageLayoutWidth(tab, width) {
  if (!tab?.webview) return;
  try {
    await executeInAllFrames(tab.webview, buildApplyPageLayoutScript(width));
  } catch (_err) {
    // 忽略注入失败
  }
}

function applyPageDisplaySettings(tab) {
  if (!tab?.webview || tab.id !== activeTabId) return;

  const zoom = getPageZoomFactor(tab);
  const width = getManualPageWidth();
  applyPageZoom(tab, zoom);
  applyPageLayoutWidth(tab, width);
  updatePageWidthLabel();
}

function togglePageWidthPanel(forceOpen) {
  if (!pageWidthPanel || !btnPageWidth) return;

  const shouldOpen = typeof forceOpen === 'boolean'
    ? forceOpen
    : pageWidthPanel.classList.contains('is-hidden');

  pageWidthPanel.classList.toggle('is-hidden', !shouldOpen);
  btnPageWidth.classList.toggle('is-open', shouldOpen);
}

function initPageWidthPanel() {
  if (!pageWidthSlider) return;

  initPageWidthSlider();

  if (btnPageWidth) {
    btnPageWidth.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePageWidthPanel();
    });
  }

  pageWidthSlider.addEventListener('input', () => {
    updatePageWidthLabel();
    layoutWebviews();
    const tab = activeTabId != null ? tabs.get(activeTabId) : null;
    if (tab) applyPageDisplaySettings(tab);
  });

  pageWidthSlider.addEventListener('change', () => {
    savePageWidthMode();
    layoutWebviews();
    const tab = activeTabId != null ? tabs.get(activeTabId) : null;
    if (tab) applyPageDisplaySettings(tab);
  });

  document.addEventListener('click', (e) => {
    if (!pageWidthPanel || pageWidthPanel.classList.contains('is-hidden')) return;
    if (pageWidthPanel.contains(e.target) || btnPageWidth?.contains(e.target)) return;
    togglePageWidthPanel(false);
  });
}

function maybeExtendPageWidthMax(detectedWidth) {
  if (!pageWidthSlider || !detectedWidth || detectedWidth <= PAGE_WIDTH_MAX) return;
  const nextMax = Math.min(Math.ceil(detectedWidth / PAGE_WIDTH_STEP) * PAGE_WIDTH_STEP, 6000);
  if (nextMax > Number(pageWidthSlider.max)) {
    pageWidthSlider.max = String(nextMax);
    renderRulerTicks();
  }
}

function syncWebviewGuestSize(webview, width, height) {
  if (!webview || width <= 0 || height <= 0) return;

  const guestId = getWebviewGuestId(webview);
  if (guestId && window.electronAPI?.setWebviewSize) {
    window.electronAPI.setWebviewSize(guestId, width, height).catch(() => {});
  }
}

function layoutWebviews() {
  if (!webviewContainer) return;

  const viewport = getViewportSize();

  tabs.forEach((tab) => {
    const { webview, frame } = tab;
    if (tab.id === activeTabId && viewport.width > 0 && viewport.height > 0) {
      const zoom = getPageZoomFactor(tab);
      const contentH = tab.contentHeight || viewport.height;
      const frameHeight = Math.max(viewport.height, Math.round(contentH * zoom));

      frame.style.width = `${viewport.width}px`;
      frame.style.height = `${frameHeight}px`;

      syncWebviewGuestSize(webview, viewport.width, frameHeight);
      applyPageZoom(tab, zoom);
    } else {
      frame.style.width = '0px';
      frame.style.height = '0px';
    }
  });

  updatePageWidthLabel();
}

async function updateTabContentSize(tab) {
  if (!tab?.webview || tab.id !== activeTabId) return;

  const url = tab.webview.getURL?.() || tab.url;
  if (!url || url === DEFAULT_HOME) {
    tab.contentHeight = 0;
    layoutWebviews();
    return;
  }

  try {
    const results = await executeInAllFrames(tab.webview, PAGE_DIMENSIONS_SCRIPT);
    let maxW = 0;
    let maxH = 0;
    for (const result of results) {
      if (!result || typeof result !== 'object') continue;
      maxW = Math.max(maxW, result.width || 0);
      maxH = Math.max(maxH, result.height || 0);
    }

    const viewport = getViewportSize();
    tab.contentHeight = maxH > 0 ? maxH : viewport.height;
    if (maxW > 0) {
      tab.naturalWidth = maxW;
    } else if (!tab.naturalWidth) {
      tab.naturalWidth = PAGE_WIDTH_BASE;
    }
    maybeExtendPageWidthMax(maxW);
    layoutWebviews();
    applyPageDisplaySettings(tab);
  } catch (_err) {
    layoutWebviews();
  }
}

function scheduleContentSizeUpdate(tab) {
  if (!tab) return;
  const runId = ++tab.sizeRunId;
  tab.sizeRunId = runId;

  CONTENT_SIZE_DELAYS_MS.forEach((delay) => {
    setTimeout(() => {
      if (tab.sizeRunId !== runId || tab.id !== activeTabId) return;
      updateTabContentSize(tab);
    }, delay);
  });
}

async function enablePageScroll(tab) {
  if (!tab?.webview) return;
  try {
    await executeInAllFrames(tab.webview, ENABLE_PAGE_SCROLL_SCRIPT);
  } catch (_err) {
    // 忽略注入失败
  }
}

const urlInput = document.getElementById('url-input');
const statusText = document.getElementById('status-text');
const logPanel = document.getElementById('log-panel');
const bookmarkBarEl = document.getElementById('bookmark-bar');

const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const btnGo = document.getElementById('btn-go');
const btnBookmark = document.getElementById('btn-bookmark');
const btnNewTab = document.getElementById('btn-new-tab');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(input) {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_HOME;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function setStatus(text) {
  statusText.textContent = `状态：${text}`;
}

function addLog(message, type = 'ok') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  entry.textContent = `[${time}] ${message}`;
  logPanel.prepend(entry);
  while (logPanel.children.length > 50) {
    logPanel.removeChild(logPanel.lastChild);
  }
}

function safeParseBookmarks(raw) {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item) => item && typeof item.url === 'string')
    .map((item) => ({
      url: item.url,
      title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : item.url
    }))
    .filter((item, index, list) => /^https?:\/\//i.test(item.url) && list.findIndex((saved) => saved.url === item.url) === index)
    .slice(0, MAX_BOOKMARKS);
}

function loadBookmarks() {
  try {
    return safeParseBookmarks(localStorage.getItem(BOOKMARK_STORAGE_KEY));
  } catch (_err) {
    try {
      localStorage.removeItem(BOOKMARK_STORAGE_KEY);
    } catch (_storageErr) {
      // 本地存储异常时保持空收藏，避免启动白屏
    }
    return [];
  }
}

function saveBookmarks() {
  try {
    localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(bookmarks));
  } catch (_err) {
    addLog('收藏保存失败：本地存储不可用', 'warn');
  }
}

function getActivePageInfo() {
  const tab = getActiveTab();
  const webview = getActiveWebview();
  if (!tab || !webview) return null;
  const url = webview.getURL();
  if (!url || url === DEFAULT_HOME || url.startsWith('about:')) return null;
  const title = (tab.titleEl.textContent || '').trim();
  return {
    url,
    title: title && title !== '新标签页' ? title : url
  };
}

function updateBookmarkButton() {
  const pageInfo = getActivePageInfo();
  const isBookmarked = pageInfo ? bookmarks.some((item) => item.url === pageInfo.url) : false;
  btnBookmark.textContent = isBookmarked ? '★' : '☆';
  btnBookmark.title = isBookmarked ? '已收藏当前网页' : '收藏当前网页';
}

function renderBookmarks() {
  bookmarkBarEl.replaceChildren();

  bookmarks.forEach((bookmark) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'bookmark-item';
    itemEl.role = 'button';
    itemEl.tabIndex = 0;
    itemEl.title = bookmark.url;

    const titleEl = document.createElement('span');
    titleEl.className = 'bookmark-title';
    titleEl.textContent = bookmark.title;

    const removeEl = document.createElement('button');
    removeEl.className = 'bookmark-remove';
    removeEl.type = 'button';
    removeEl.title = '删除这个收藏';
    removeEl.textContent = '×';

    itemEl.appendChild(titleEl);
    itemEl.appendChild(removeEl);

    itemEl.addEventListener('click', () => {
      navigateActive(bookmark.url);
    });

    itemEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateActive(bookmark.url);
      }
    });

    removeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      bookmarks = bookmarks.filter((item) => item.url !== bookmark.url);
      saveBookmarks();
      renderBookmarks();
      addLog(`已删除收藏：${bookmark.title}`, 'warn');
    });

    bookmarkBarEl.appendChild(itemEl);
  });

  updateBookmarkButton();
}

function addCurrentPageBookmark() {
  const pageInfo = getActivePageInfo();
  if (!pageInfo) {
    addLog('当前页面不能收藏，请先打开一个网页', 'warn');
    setStatus('请先打开一个网页后再收藏');
    return;
  }

  const existing = bookmarks.find((item) => item.url === pageInfo.url);
  if (existing) {
    existing.title = pageInfo.title;
    addLog(`已更新收藏：${pageInfo.title}`, 'ok');
  } else {
    bookmarks.unshift(pageInfo);
    bookmarks = bookmarks.slice(0, MAX_BOOKMARKS);
    addLog(`已收藏：${pageInfo.title}`, 'ok');
  }

  saveBookmarks();
  renderBookmarks();
}

function getActiveTab() {
  return activeTabId !== null ? tabs.get(activeTabId) : null;
}

function getActiveWebview() {
  const tab = getActiveTab();
  return tab ? tab.webview : null;
}

function updateNavButtons() {
  const webview = getActiveWebview();
  if (!webview) {
    btnBack.disabled = true;
    btnForward.disabled = true;
    return;
  }
  btnBack.disabled = !webview.canGoBack();
  btnForward.disabled = !webview.canGoForward();
}

function createTab(url = DEFAULT_HOME) {
  const id = ++tabIdCounter;

  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.tabId = id;

  const titleEl = document.createElement('span');
  titleEl.className = 'tab-title';
  titleEl.textContent = '新标签页';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.textContent = '×';
  closeBtn.title = '关闭标签';

  tabEl.appendChild(titleEl);
  tabEl.appendChild(closeBtn);
  tabsEl.appendChild(tabEl);

  const frame = document.createElement('div');
  frame.className = 'webview-frame';

  const webview = document.createElement('webview');
  webview.src = url;
  webview.partition = 'persist:main';
  webview.setAttribute('allowpopups', '');
  frame.appendChild(webview);
  webviewContainer.appendChild(frame);

  const tab = {
    id,
    tabEl,
    titleEl,
    frame,
    webview,
    url,
    contentHeight: 0,
    naturalWidth: 0,
    sizeRunId: 0
  };
  tabs.set(id, tab);

  tabEl.addEventListener('click', (e) => {
    if (e.target === closeBtn) return;
    switchTab(id);
  });

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(id);
  });

  bindWebviewEvents(tab);
  switchTab(id);
  return tab;
}

function bindWebviewEvents(tab) {
  const { webview } = tab;

  webview.addEventListener('dom-ready', () => {
    if (tab.id !== activeTabId) return;
    enablePageScroll(tab);
    layoutWebviews();
    updateTabContentSize(tab);
    scheduleContentSizeUpdate(tab);
    applyPageDisplaySettings(tab);
  });

  webview.addEventListener('did-start-loading', () => {
    if (tab.id === activeTabId) {
      setStatus('页面加载中…');
    }
  });

  webview.addEventListener('did-stop-loading', () => {
    if (tab.id !== activeTabId) return;
    layoutWebviews();
    updateTabContentSize(tab);
    scheduleContentSizeUpdate(tab);
    updateNavButtons();
    if (!autoCheckRunning) {
      setStatus('就绪。点击标签栏「宽度」调节页面缩放，登录后点击「开始自动勾选」');
    }
  });

  webview.addEventListener('page-title-updated', (e) => {
    tab.titleEl.textContent = e.title || '新标签页';
    updateBookmarkButton();
  });

  webview.addEventListener('did-navigate', (e) => {
    tab.url = e.url;
    if (tab.id === activeTabId) {
      urlInput.value = e.url === DEFAULT_HOME ? '' : e.url;
      updateBookmarkButton();
    }
  });

  webview.addEventListener('did-navigate-in-page', (e) => {
    tab.url = e.url;
    if (tab.id === activeTabId) {
      urlInput.value = e.url === DEFAULT_HOME ? '' : e.url;
      updateBookmarkButton();
    }
  });

  webview.addEventListener('new-window', (e) => {
    createTab(e.url);
  });

  webview.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return;
    if (tab.id === activeTabId) {
      setStatus(`页面加载失败：${e.errorDescription}`);
      addLog(`加载失败：${e.errorDescription}`, 'err');
    }
  });
}

function switchTab(id) {
  if (!tabs.has(id)) return;
  activeTabId = id;

  tabs.forEach((tab, tabId) => {
    const isActive = tabId === id;
    tab.tabEl.classList.toggle('active', isActive);
    tab.frame.classList.toggle('active', isActive);
  });

  const tab = tabs.get(id);
  urlInput.value = tab.url === DEFAULT_HOME ? '' : tab.url;
  updateNavButtons();
  updateBookmarkButton();

  if (!autoCheckRunning) {
    setStatus('就绪。点击标签栏「宽度」调节页面缩放，登录后点击「开始自动勾选」');
  }

  if (webviewContainer) {
    webviewContainer.scrollTop = 0;
    webviewContainer.scrollLeft = 0;
  }

  requestAnimationFrame(() => {
    layoutWebviews();
    updateTabContentSize(tab);
    scheduleContentSizeUpdate(tab);
    applyPageDisplaySettings(tab);
  });
}

function closeTab(id) {
  if (!tabs.has(id)) return;

  if (autoCheckRunning && id === activeTabId) {
    stopAutoCheck();
  }

  const tab = tabs.get(id);
  tab.frame.remove();
  tab.tabEl.remove();
  tabs.delete(id);

  if (tabs.size === 0) {
    createTab();
    return;
  }

  if (activeTabId === id) {
    const lastId = [...tabs.keys()].pop();
    switchTab(lastId);
  }
}

function navigateActive(url) {
  const webview = getActiveWebview();
  if (!webview) return;
  const normalized = normalizeUrl(url);
  webview.loadURL(normalized);
}

function waitForWebviewLoad(webview, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (!webview.isLoading()) {
      resolve();
      return;
    }

    let timer;
    const onStop = () => {
      clearTimeout(timer);
      webview.removeEventListener('did-stop-loading', onStop);
      resolve();
    };

    timer = setTimeout(() => {
      webview.removeEventListener('did-stop-loading', onStop);
      reject(new Error('页面加载超时'));
    }, timeoutMs);

    webview.addEventListener('did-stop-loading', onStop);
  });
}

function getWebviewGuestId(webview) {
  if (typeof webview.getWebContentsId === 'function') {
    return webview.getWebContentsId();
  }
  throw new Error('当前环境不支持多框架脚本注入，请更新 Electron 版本');
}

async function executeInAllFrames(webview, script, mode = 'all') {
  try {
    const guestId = getWebviewGuestId(webview);
    return await window.electronAPI.executeInAllFrames(guestId, script, mode);
  } catch (_err) {
    const result = await webview.executeJavaScript(script);
    return [result];
  }
}

function sumFrameResults(results) {
  return results.reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
}

function hasTruthyFrameResult(results) {
  return results.some((value) => value === true);
}

function mergePageState(results) {
  let loading = false;
  let count = 0;
  for (const value of results) {
    if (!value || typeof value !== 'object') continue;
    if (value.loading) loading = true;
    count += typeof value.count === 'number' ? value.count : 0;
  }
  return { loading, count };
}

async function getPageCheckboxState(webview) {
  const results = await executeInAllFrames(webview, PAGE_STATE_SCRIPT);
  return mergePageState(results);
}

async function waitForPageReady(webview, prevCount = null) {
  const start = Date.now();
  let readyForStable = prevCount === null;
  let sawLoading = false;
  let sawCountChange = false;
  let lastCount = -1;
  let stableCount = 0;

  while (!autoCheckAbort) {
    if (Date.now() - start > PAGE_READY_TIMEOUT_MS) {
      throw new Error('等待页面 checkbox 就绪超时');
    }

    const { loading, count } = await getPageCheckboxState(webview);

    if (!readyForStable) {
      if (loading) sawLoading = true;
      if (count === 0 || count !== prevCount) sawCountChange = true;
      if (sawLoading && !loading) readyForStable = true;
      if (sawCountChange && !loading) readyForStable = true;
      if (Date.now() - start > 3000 && !loading) readyForStable = true;
      await sleep(PAGE_READY_POLL_MS);
      continue;
    }

    if (loading) {
      lastCount = -1;
      stableCount = 0;
      await sleep(PAGE_READY_POLL_MS);
      continue;
    }

    if (count === lastCount) {
      stableCount += 1;
      if (stableCount >= PAGE_READY_STABLE_POLLS) {
        return count;
      }
    } else {
      lastCount = count;
      stableCount = 1;
    }

    await sleep(PAGE_READY_POLL_MS);
  }

  return 0;
}

async function runAutoCheck() {
  if (autoCheckRunning) return;

  const webview = getActiveWebview();
  if (!webview) {
    setStatus('请先打开一个网页');
    addLog('没有打开的标签页', 'warn');
    return;
  }

  const currentUrl = webview.getURL();
  if (!currentUrl || currentUrl === DEFAULT_HOME || currentUrl.startsWith('about:')) {
    setStatus('请先在地址栏输入网址并打开网页');
    addLog('请先输入网址', 'warn');
    return;
  }

  autoCheckRunning = true;
  autoCheckAbort = false;
  btnStart.disabled = true;
  btnStop.disabled = false;

  addLog('开始自动勾选', 'ok');
  setStatus('自动勾选运行中…');

  let pageNum = 1;
  let countBeforeNext = null;

  try {
    while (!autoCheckAbort && pageNum <= MAX_PAGES) {
      await waitForWebviewLoad(webview);

      if (autoCheckAbort) break;

      let readyCount = 0;
      try {
        if (pageNum === 1) {
          setStatus('等待第 1 页 checkbox 加载…');
        } else {
          setStatus(`等待第 ${pageNum} 页 checkbox 加载…`);
        }
        readyCount = await waitForPageReady(webview, countBeforeNext);
      } catch (err) {
        addLog(`第 ${pageNum} 页等待就绪失败：${err.message}`, 'err');
        setStatus('等待页面就绪失败');
        break;
      }

      if (autoCheckAbort) break;

      let count = 0;
      try {
        const frameResults = await executeInAllFrames(webview, CHECK_ALL_SCRIPT);
        count = sumFrameResults(frameResults);
      } catch (err) {
        addLog(`第 ${pageNum} 页勾选失败：${err.message}`, 'err');
        setStatus('勾选失败，请确认已登录且页面中有表格');
        break;
      }

      addLog(`第 ${pageNum} 页：勾选 ${count} 个（检测到 ${readyCount} 个 checkbox）`, 'ok');
      setStatus(`正在处理第 ${pageNum} 页，本页勾选 ${count} 个`);

      if (autoCheckAbort) break;

      try {
        const pageState = await getPageCheckboxState(webview);
        countBeforeNext = pageState.count;
      } catch (err) {
        addLog(`读取第 ${pageNum} 页 checkbox 数量失败：${err.message}`, 'err');
        break;
      }

      let hasNext = false;
      try {
        const frameResults = await executeInAllFrames(webview, CLICK_NEXT_SCRIPT, 'first-true');
        hasNext = hasTruthyFrameResult(frameResults);
      } catch (err) {
        addLog(`查找下一页失败：${err.message}`, 'err');
        break;
      }

      if (!hasNext) {
        addLog(`全部完成，共处理 ${pageNum} 页`, 'ok');
        setStatus(`已完成，共处理 ${pageNum} 页`);
        break;
      }

      addLog(`点击「下一页」，等待第 ${pageNum + 1} 页 checkbox 就绪…`, 'ok');
      pageNum++;
    }

    if (pageNum > MAX_PAGES) {
      addLog(`已达到最大页数限制（${MAX_PAGES} 页），已自动停止`, 'warn');
      setStatus(`已停止：超过最大页数 ${MAX_PAGES}`);
    }
  } finally {
    autoCheckRunning = false;
    autoCheckAbort = false;
    btnStart.disabled = false;
    btnStop.disabled = true;
  }
}

function stopAutoCheck() {
  if (!autoCheckRunning) return;
  autoCheckAbort = true;
  addLog('用户点击停止', 'warn');
  setStatus('正在停止…');
}

btnNewTab.addEventListener('click', () => createTab());

btnGo.addEventListener('click', () => navigateActive(urlInput.value));
btnBookmark.addEventListener('click', addCurrentPageBookmark);

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') navigateActive(urlInput.value);
});

btnBack.addEventListener('click', () => {
  const webview = getActiveWebview();
  if (webview && webview.canGoBack()) webview.goBack();
});

btnForward.addEventListener('click', () => {
  const webview = getActiveWebview();
  if (webview && webview.canGoForward()) webview.goForward();
});

btnReload.addEventListener('click', () => {
  const webview = getActiveWebview();
  if (webview) webview.reload();
});

btnStart.addEventListener('click', runAutoCheck);
btnStop.addEventListener('click', stopAutoCheck);

bookmarks = loadBookmarks();
renderBookmarks();
initPageWidthPanel();

createTab();

if (typeof ResizeObserver !== 'undefined') {
  const webviewResizeObserver = new ResizeObserver(() => {
    layoutWebviews();
  });
  webviewResizeObserver.observe(webviewContainer);
}

window.addEventListener('resize', layoutWebviews);
