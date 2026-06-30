const { app, BrowserWindow, ipcMain, webContents, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;

const appName = '啄木鸟自动勾选浏览器';
const linuxDesktopName = 'auto-checkbox-browser.desktop';
const linuxWindowClass = 'auto-checkbox-browser';

app.setName(appName);
if (process.platform === 'win32') {
  app.setAppUserModelId('com.autocheckbox.browser');
} else if (process.platform === 'linux') {
  app.setDesktopName(linuxDesktopName);
  app.commandLine.appendSwitch('class', linuxWindowClass);
}

function resolveIconPath() {
  const candidates = [
    path.join(process.resourcesPath || '', 'woodpecker.png'),
    path.join(__dirname, 'woodpecker.png'),
    path.join(__dirname, 'build', 'icons', '256x256.png')
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || path.join(__dirname, 'woodpecker.png');
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
  const iconPath = resolveIconPath();
  const appIcon = nativeImage.createFromPath(iconPath);
  const windowIcon = appIcon.isEmpty() ? iconPath : appIcon;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: appName,
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setIcon(windowIcon);
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
