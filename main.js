const { app, BrowserWindow, ipcMain, webContents, nativeImage, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;

// 银河麒麟等 Linux 桌面需关闭 Chromium 沙箱，否则可能出现白屏或 webview 无法加载
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}

function resolveIconPath() {
  const candidates = [
    path.join(__dirname, 'woodpecker.png'),
    path.join(process.resourcesPath, 'woodpecker.png'),
    path.join(__dirname, 'build', 'icons', '512x512.png'),
    path.join(process.resourcesPath, 'icons', '512x512.png')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.join(__dirname, 'woodpecker.png');
}

function loadAppIcon() {
  const iconPath = resolveIconPath();
  let icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    return { iconPath, icon: null };
  }

  if (process.platform === 'linux') {
    icon = icon.resize({ width: 256, height: 256, quality: 'best' });
  }

  return { iconPath, icon };
}

function applyWindowIcon(win) {
  const { icon } = loadAppIcon();
  if (!icon || icon.isEmpty()) return;

  if (process.platform === 'linux') {
    app.setIcon(icon);
  }
  win.setIcon(icon);
}

function getAllFrames(frame) {
  const frames = [frame];
  for (const child of frame.frames) {
    frames.push(...getAllFrames(child));
  }
  return frames;
}

ipcMain.handle('webview:execute-in-all-frames', async (_event, guestWebContentsId, script, mode) => {
  const wc = webContents.fromId(guestWebContentsId);
  if (!wc || wc.isDestroyed()) {
    throw new Error('无法访问网页内容，请刷新页面后重试');
  }

  const frames = getAllFrames(wc.mainFrame);
  const results = [];

  for (const frame of frames) {
    try {
      const result = await frame.executeJavaScript(script, true);
      results.push(result);
      if (mode === 'first-true' && result === true) {
        return results;
      }
    } catch (_err) {
      // 某些子框架可能暂时不可访问，跳过即可
    }
  }

  return results;
});

function createWindow() {
  Menu.setApplicationMenu(null);

  const { iconPath, icon } = loadAppIcon();
  const rendererHtml = path.join(__dirname, 'renderer', 'index.html');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: '啄木鸟自动勾选浏览器',
    icon: icon && !icon.isEmpty() ? icon : iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false
    }
  });

  applyWindowIcon(mainWindow);
  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('界面加载失败:', errorCode, errorDescription, validatedURL);
  });

  mainWindow.loadFile(rendererHtml).catch((err) => {
    console.error('loadFile 失败:', rendererHtml, err);
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
