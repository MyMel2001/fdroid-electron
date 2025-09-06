const { app, BrowserWindow, ipcMain } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');

// Determine the correct adb executable name based on the OS
const adbExecutable = os.platform() === 'win32' ? 'adb.exe' : 'adb';

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    autoHideMenuBar: true,
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.on('connect-adb', async (event) => {
  execFile(adbExecutable, ['devices'], (error, stdout, stderr) => {
    if (error) {
      event.reply('connection-error', 'Is ADB in your PATH? Error: ' + error.message);
      return;
    }
    const devices = stdout.split('\n')
      .slice(1)
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.includes('offline') && !line.includes('*'))
      .map(line => {
        const parts = line.split('\t');
        return { serial: parts[0], type: parts[1] };
      });
    
    event.reply('devices-found', devices);
  });
});

ipcMain.on('install-apk', async (event, { apkData }) => {
  execFile(adbExecutable, ['devices'], (err, stdout, stderr) => {
    if (err) {
      event.reply('installation-status', { success: false, message: 'No devices found. Is ADB server running?' });
      return;
    }
    const devices = stdout.split('\n')
      .slice(1)
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.includes('offline') && !line.includes('*'));

    if (devices.length === 0) {
      event.reply('installation-status', { success: false, message: 'No devices found.' });
      return;
    }
    const serial = devices[0].split('\t')[0];

    const tempApkPath = `${os.tmpdir()}/temp-app.apk`;
    fs.writeFileSync(tempApkPath, Buffer.from(apkData, 'base64'));

    execFile(adbExecutable, ['-s', serial, 'install', '-r', tempApkPath], (error, stdout, stderr) => {
      fs.unlinkSync(tempApkPath); // Clean up temp file

      if (error) {
        event.reply('installation-status', { success: false, message: stderr });
        return;
      }
      if (stdout.includes('Success')) {
        event.reply('installation-status', { success: true, message: stdout });
      } else {
        event.reply('installation-status', { success: false, message: stdout });
      }
    });
  });
});