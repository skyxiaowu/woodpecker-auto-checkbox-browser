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

const CLICK_NEXT_SCRIPT = `(() => {
  const tags = ['a', 'button', 'span', 'div', 'li', 'input[type="button"]', '[role="button"]'];

  function collectRoots(root) {
    const roots = [root];
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    });
    return roots;
  }

  function tryClickInDocument(doc) {
    if (!doc) return false;
    const seen = new Set();
    for (const root of collectRoots(doc)) {
      for (const tag of tags) {
        for (const el of root.querySelectorAll(tag)) {
          if (seen.has(el)) continue;
          seen.add(el);
          const text = (el.innerText || el.textContent || '').trim();
          if (text !== '下一页') continue;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          if (el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true') continue;
          el.click();
          return true;
        }
      }
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
const PAGE_WAIT_MS = 800;
const AFTER_CLICK_MS = 1500;
const MAX_PAGES = 500;
const BOOKMARKS_KEY = 'zhuomuniao-bookmarks';

let tabIdCounter = 0;
let activeTabId = null;
const tabs = new Map();

let autoCheckRunning = false;
let autoCheckAbort = false;

const tabsEl = document.getElementById('tabs');
const webviewContainer = document.getElementById('webview-container');
const urlInput = document.getElementById('url-input');
const statusText = document.getElementById('status-text');
const logPanel = document.getElementById('log-panel');

const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const btnGo = document.getElementById('btn-go');
const btnNewTab = document.getElementById('btn-new-tab');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnBookmark = document.getElementById('btn-bookmark');
const bookmarkListEl = document.getElementById('bookmark-list');
const bootErrorEl = document.getElementById('boot-error');

let bookmarks = [];

function showBootError(message) {
  if (!bootErrorEl) return;
  bootErrorEl.hidden = false;
  bootErrorEl.textContent = message;
  console.error('[renderer-error]', message);
}

function getWebviewUrl(webview) {
  if (!webview) return '';
  try {
    if (typeof webview.getURL === 'function') {
      const url = webview.getURL();
      if (url) return url;
    }
  } catch (_err) {
    // webview 尚未 dom-ready 时 getURL 可能抛错
  }
  return webview.getAttribute('src') || webview.src || '';
}

function configureWebview(webview) {
  webview.partition = 'persist:main';
  webview.setAttribute('allowpopups', '');
  webview.setAttribute(
    'webpreferences',
    'contextIsolation=yes,nodeIntegration=no,sandbox=no,webSecurity=yes'
  );
}

function isValidBookmarkUrl(url) {
  return url && url !== DEFAULT_HOME && !url.startsWith('about:') && /^https?:\/\//i.test(url);
}

function loadBookmarks() {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    bookmarks = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(bookmarks)) bookmarks = [];
  } catch (_err) {
    bookmarks = [];
  }
}

function saveBookmarks() {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
  } catch (_err) {
    // localStorage 不可用时忽略
  }
}

function getCurrentPageInfo() {
  const webview = getActiveWebview();
  if (!webview) return null;

  const url = getWebviewUrl(webview);
  if (!isValidBookmarkUrl(url)) return null;

  const tab = getActiveTab();
  const title = (tab && tab.titleEl && tab.titleEl.textContent.trim()) || url;
  return { url, title };
}

function isCurrentPageBookmarked() {
  const info = getCurrentPageInfo();
  if (!info) return false;
  return bookmarks.some((item) => item.url === info.url);
}

function updateBookmarkButton() {
  if (!btnBookmark) return;
  try {
    const bookmarked = isCurrentPageBookmarked();
    btnBookmark.textContent = bookmarked ? '★' : '☆';
    btnBookmark.classList.toggle('active', bookmarked);
    btnBookmark.title = bookmarked ? '取消存入标签' : '存入标签';
  } catch (_err) {
    btnBookmark.textContent = '☆';
    btnBookmark.classList.remove('active');
  }
}

function renderBookmarks() {
  if (!bookmarkListEl) return;
  bookmarkListEl.innerHTML = '';

  if (bookmarks.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'bookmark-empty';
    empty.textContent = '点击地址栏右侧 ☆ 保存当前网页';
    bookmarkListEl.appendChild(empty);
    return;
  }

  bookmarks.forEach((item) => {
    const chip = document.createElement('div');
    chip.className = 'bookmark-item';
    chip.title = item.url;

    const titleEl = document.createElement('span');
    titleEl.className = 'bookmark-item-title';
    titleEl.textContent = item.title || item.url;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'bookmark-item-remove';
    removeBtn.textContent = '×';
    removeBtn.title = '删除标签';

    chip.addEventListener('click', () => {
      navigateActive(item.url);
    });

    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      bookmarks = bookmarks.filter((b) => b.url !== item.url);
      saveBookmarks();
      renderBookmarks();
      updateBookmarkButton();
    });

    chip.appendChild(titleEl);
    chip.appendChild(removeBtn);
    bookmarkListEl.appendChild(chip);
  });
}

function toggleBookmark() {
  const info = getCurrentPageInfo();
  if (!info) {
    setStatus('请先打开一个有效网页再存入标签');
    addLog('当前页面无法存入标签', 'warn');
    return;
  }

  const existingIndex = bookmarks.findIndex((item) => item.url === info.url);
  if (existingIndex >= 0) {
    bookmarks.splice(existingIndex, 1);
    addLog(`已取消标签：${info.title}`, 'warn');
  } else {
    bookmarks.unshift({ url: info.url, title: info.title, addedAt: Date.now() });
    addLog(`已存入标签：${info.title}`, 'ok');
  }

  saveBookmarks();
  renderBookmarks();
  updateBookmarkButton();
}

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

  const webview = document.createElement('webview');
  configureWebview(webview);
  webview.src = url;
  webview.classList.add('active');
  webviewContainer.appendChild(webview);

  const tab = { id, tabEl, titleEl, webview, url };
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

  webview.addEventListener('did-start-loading', () => {
    if (tab.id === activeTabId) {
      setStatus('页面加载中…');
    }
  });

  webview.addEventListener('did-stop-loading', () => {
    if (tab.id === activeTabId) {
      updateNavButtons();
      updateBookmarkButton();
      if (!autoCheckRunning) {
        setStatus('就绪。登录后点击「开始自动勾选」（登录状态会自动保留）');
      }
    }
  });

  webview.addEventListener('page-title-updated', (e) => {
    tab.titleEl.textContent = e.title || '新标签页';
    const url = getWebviewUrl(webview);
    const bookmark = bookmarks.find((item) => item.url === url);
    if (bookmark && e.title) {
      bookmark.title = e.title;
      saveBookmarks();
      renderBookmarks();
    }
    if (tab.id === activeTabId) {
      updateBookmarkButton();
    }
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
    tab.webview.classList.toggle('active', isActive);
  });

  const tab = tabs.get(id);
  urlInput.value = tab.url === DEFAULT_HOME ? '' : tab.url;
  updateNavButtons();

  if (!autoCheckRunning) {
    setStatus('就绪。登录后点击「开始自动勾选」（登录状态会自动保留）');
  }
  updateBookmarkButton();
}

function closeTab(id) {
  if (!tabs.has(id)) return;

  if (autoCheckRunning && id === activeTabId) {
    stopAutoCheck();
  }

  const tab = tabs.get(id);
  tab.webview.remove();
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

async function runAutoCheck() {
  if (autoCheckRunning) return;

  const webview = getActiveWebview();
  if (!webview) {
    setStatus('请先打开一个网页');
    addLog('没有打开的标签页', 'warn');
    return;
  }

  const currentUrl = getWebviewUrl(webview);
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

  try {
    while (!autoCheckAbort && pageNum <= MAX_PAGES) {
      await waitForWebviewLoad(webview);
      await sleep(PAGE_WAIT_MS);

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

      addLog(`第 ${pageNum} 页：勾选 ${count} 个`, 'ok');
      setStatus(`正在处理第 ${pageNum} 页，本页勾选 ${count} 个`);

      if (autoCheckAbort) break;

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

      addLog(`点击「下一页」，等待第 ${pageNum + 1} 页加载…`, 'ok');
      pageNum++;
      await sleep(AFTER_CLICK_MS);
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

function bindUiEvents() {
  btnNewTab.addEventListener('click', () => createTab());
  btnGo.addEventListener('click', () => navigateActive(urlInput.value));
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
  if (btnBookmark) {
    btnBookmark.addEventListener('click', toggleBookmark);
  }
}

function bootstrapApp() {
  if (!tabsEl || !webviewContainer || !urlInput) {
    showBootError('界面元素加载失败，请重新安装软件或联系技术支持。');
    return;
  }

  try {
    bindUiEvents();
    loadBookmarks();
    renderBookmarks();
    createTab();
    updateBookmarkButton();
  } catch (err) {
    showBootError(`界面初始化失败：${err.message}\n\n请尝试在终端运行 auto-checkbox-browser 查看详细报错。`);
  }
}

window.addEventListener('error', (event) => {
  showBootError(`脚本运行错误：${event.message}\n${event.filename || ''}:${event.lineno || ''}`);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason && event.reason.message ? event.reason.message : String(event.reason);
  showBootError(`未处理的异步错误：${reason}`);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
