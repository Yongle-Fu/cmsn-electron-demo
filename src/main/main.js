/* eslint-disable no-fallthrough */
const { app, BrowserWindow, ipcMain } = require('electron');
// const path = require('path');
// const url = require('url');
const cmsn = require('./libcmsn/cmsn_electron');

const messageReq = 'cmsn-request';
const messageRes = 'cmsn-respnose';

const isDevelopment = process.env.NODE_ENV !== 'production';

if (module.hot) {
  module.hot.decline();
}

async function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      // preload: path.join(__dirname, 'preload.js'),
    },
  });

  ipcMain.on(messageReq, async (event, arg) => {
    console.log('main receive:', arg);
    var cmd = arg.cmd;
    switch (cmd) {
    case 'initSDK':
      await cmsn.initSDK((e) => {
        if (e && e.message) {
          console.error(e.message);
          event.reply(messageRes, { cmd: 'onError', error: e });
        }
      }, (adapterAvailable) => {
        event.reply(messageRes, { cmd: 'onAdapterAvailableChanged', adapterAvailable: adapterAvailable });
      });
      break;
    case 'disposeSDK':
      await cmsn.disposeSDK();
      break;
    case 'startScan':
      // await cmsn.connect('cmsn_OK');
      // await cmsn.connect('58:94:b2:00:02:39');
      // 58:94:b2:00:a5:7f
      // break;
      await cmsn.startScan(
        (adapterScanning) => {
          event.reply(messageRes, { cmd: 'onScanning', adapterScanning: adapterScanning });
        },
        (devices) => {
          event.reply(messageRes, {
            cmd: 'onFoundDevices',
            devices: devices.map((e) => ({
              id: e.id,
              name: e.name,
              isInPairingMode: e.isInPairingMode,
              batteryLevel: e.batteryLevel,
            })),
          });
        }
      );
      break;
    case 'stopScan':
      await cmsn.stopScan();
      break;
    case 'connect':
      var deviceId = arg.deviceId;
      // eslint-disable-next-line no-case-declarations
      const deviceListener = {
        onError: (_, error) => {
          event.reply(messageRes, { deviceId: deviceId, cmd: 'onError', error: error });
        },
        onDeviceInfoReady: (_, deviceInfo) => {
          event.reply(messageRes, { deviceId: deviceId, cmd: 'onDeviceInfoReady', deviceInfo: deviceInfo });
        },
        onConnectivityChanged: (_, connectivity) => {
          event.reply(messageRes, { deviceId: deviceId, cmd: 'onConnectivityChanged', connectivity: connectivity });
        },
        onContactStateChanged: (_, contactState) => {
          event.reply(messageRes, { deviceId: deviceId, cmd: 'onContactStateChanged', contactState: contactState });
        },
        onOrientationChanged: (_, orientation) => {
          event.reply(messageRes, { deviceId: deviceId, cmd: 'onOrientationChanged', orientation: orientation });
        },
        onIMUData: (_, imu) => {
          event.reply(messageRes, { deviceId: deviceId, cmd: 'onIMUData', imu: imu });
        },
        onEEGData: (_, eeg) => {
          event.reply(messageRes, { deviceId: deviceId, cmd: 'onEEGData', eeg: eeg });
        },
        onBrainWave: (_, stats) => {
          event.reply(messageRes, { deviceId: deviceId, cmd: 'onBrainWave', stats: stats });
        },
        onAttention: (_, attention) => {
          event.reply(messageRes, { deviceId: deviceId, cmd: 'onAttention', attention: attention });
        },
        onMeditation: (_, meditation) => {
          event.reply(messageRes, { deviceId: deviceId, cmd: 'onMeditation', meditation: meditation });
        },
        onSocialEngagement: (social) => {
          event.reply(messageRes, { deviceId: deviceId, cmd: 'onSocialEngagement', social: social });
        },
      };
      await cmsn.connect(deviceId, deviceListener);
      break;
    case 'disconnect':
      await cmsn.disconnect(deviceId);
      break;
    case 'disconnectAll':
      await cmsn.disconnectAll();
    default:
      break;
    }
  });

  if (isDevelopment) {
    // const { default: installExtension, REACT_DEVELOPER_TOOLS } = require('electron-devtools-installer');
    // installExtension(REACT_DEVELOPER_TOOLS)
    //   .then((name) => {
    //     console.log(`Added Extension:  ${name}`);
    //   })
    //   .catch((err) => {
    //     console.log('An error occurred: ', err);
    //   });
    mainWindow.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}`);
    mainWindow.webContents.openDevTools();
  } else {
    // mainWindow.loadFile('index.html');
    let url = `file://${__dirname}/index.html`;
    mainWindow.loadURL(url);
    mainWindow.webContents.openDevTools();
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('will-quit', async function () {
    console.log('will-quit');
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', async function () {
  console.log('window-all-closed');
  await cmsn.disposeSDK();
  if (process.platform !== 'darwin') app.quit();
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
