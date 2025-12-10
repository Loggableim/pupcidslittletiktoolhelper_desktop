/**
 * LTTH Electron - Root Entry Point
 * 
 * This file serves as the main entry point for the Electron desktop application.
 * It starts the backend server and creates the Electron browser window.
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src', 'electron-bootstrap.js')
    },
    icon: path.join(__dirname, 'assets', 'images', 'ltthappicon.png')
  });

  // Start the backend server
  serverProcess = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, 'src'),
    stdio: 'inherit'
  });

  // Wait for server to start, then load the app
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 3000);

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

