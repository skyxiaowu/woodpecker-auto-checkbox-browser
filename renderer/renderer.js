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
  webview.src = url;
  webview.partition = 'persist:main';
  webview.setAttribute('allowpopups', '');
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
      if (!autoCheckRunning) {
        setStatus('就绪。登录后点击「开始自动勾选」');
      }
    }
  });

  webview.addEventListener('page-title-updated', (e) => {
    tab.titleEl.textContent = e.title || '新标签页';
  });

  webview.addEventListener('did-navigate', (e) => {
    tab.url = e.url;
    if (tab.id === activeTabId) {
      urlInput.value = e.url === DEFAULT_HOME ? '' : e.url;
    }
  });

  webview.addEventListener('did-navigate-in-page', (e) => {
    tab.url = e.url;
    if (tab.id === activeTabId) {
      urlInput.value = e.url === DEFAULT_HOME ? '' : e.url;
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
    setStatus('就绪。登录后点击「开始自动勾选」');
  }
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

createTab();
