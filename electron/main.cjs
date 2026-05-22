const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

// 获取命令行参数中的 session 标识，默认为 default
const sessionId = process.argv.find(arg => arg.startsWith('--session='))?.split('=')[1] || 'default';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: `智能仿真银行 - 会话: ${sessionId}`,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // 核心：使用不同的 partition 来隔离本地存储 (localStorage)
      partition: `persist:${sessionId}`
    },
    titleBarStyle: 'hiddenInset', 
  });

  mainWindow.loadURL('http://localhost:5173');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// 监听支付宝沙箱支付弹窗请求
ipcMain.on('open-alipay-window', (event, payUrl) => {
  console.log("Opening payUrl externally in default system browser:", payUrl);
  shell.openExternal(payUrl).catch(err => {
    console.error("Failed to open external URL:", err);
  });
});

