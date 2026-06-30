const { app, BrowserWindow, ipcMain, webContents, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;

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
  const { iconPath, icon } = loadAppIcon();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: '啄木鸟自动勾选浏览器',
    icon: icon && !icon.isEmpty() ? icon : iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  applyWindowIcon(mainWindow);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
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
