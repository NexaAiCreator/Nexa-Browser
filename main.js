const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;

function createBrowserWindow() {
    if (mainWindow) {
        if (mainWindow.isDestroyed()) {
            mainWindow = null;
        } else {
            mainWindow.focus();
            return;
        }
    }

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        frame: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true
        }
    });
    mainWindow.loadFile('src/renderer/chrome.html');
}

app.whenReady().then(() => {
    createBrowserWindow();
});

// Prevent app from quitting if only hidden windows are left
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});