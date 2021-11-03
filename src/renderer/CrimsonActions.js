const { ipcRenderer } = require('electron');
const { observable, runInAction } = require('mobx');

const messageReq = 'cmsn-request';
const messageRes = 'cmsn-respnose';

const cmsnObservable = observable({
  scanning: false,
  devices: [],
  cmsnDeviceMap: new Map(),
});

class CrimsonActions {
  static initSDK() {
    ipcRenderer.on(messageRes, (_, arg) => {
      //   console.log(arg);
      switch (arg.cmd) {
        case 'onScanning':
          runInAction(() => {
            cmsnObservable.scanning = arg.scanning;
          });
          break;
        case 'onFoundDevices':
          runInAction(() => {
            cmsnObservable.devices = arg.devices;
          });
          break;
        case 'onError':
          console.log('[onError] deviceId', arg.deviceId, 'error', error);
          break;
        case 'onDeviceInfoReady':
          var deviceId = arg.deviceId;
          var device = cmsnObservable.cmsnDeviceMap.get(deviceId);
          if (device) {
            runInAction(() => {
              device.deviceInfo = arg.deviceInfo;
              //refresh ui
              cmsnObservable.cmsnDeviceMap.delete(deviceId);
              cmsnObservable.cmsnDeviceMap.set(deviceId, device);
            });
          }
          break;
        case 'onConnectivityChanged':
          var deviceId = arg.deviceId;
          var device = cmsnObservable.cmsnDeviceMap.get(deviceId);
          if (device) {
            runInAction(() => {
              device.connectivity = arg.connectivity;
              //refresh ui
              cmsnObservable.cmsnDeviceMap.delete(deviceId);
              cmsnObservable.cmsnDeviceMap.set(deviceId, device);
            });
          }
          break;
        case 'onContactStateChanged':
          var deviceId = arg.deviceId;
          var device = cmsnObservable.cmsnDeviceMap.get(deviceId);
          if (device) {
            runInAction(() => {
              device.contactState = arg.contactState;
              //refresh ui
              cmsnObservable.cmsnDeviceMap.delete(deviceId);
              cmsnObservable.cmsnDeviceMap.set(deviceId, device);
            });
          }
          break;
        case 'onOrientationChanged':
          var deviceId = arg.deviceId;
          var device = cmsnObservable.cmsnDeviceMap.get(deviceId);
          if (device) {
            runInAction(() => {
              device.orientation = arg.orientation;
              //refresh ui
              cmsnObservable.cmsnDeviceMap.delete(deviceId);
              cmsnObservable.cmsnDeviceMap.set(deviceId, device);
            });
          }
          break;
        case 'onEEGData':
          var deviceId = arg.deviceId;
          var device = cmsnObservable.cmsnDeviceMap.get(deviceId);
          if (device) {
            device.eeg = arg.eeg;
          }
          break;
        case 'onIMUData':
          var deviceId = arg.deviceId;
          var device = cmsnObservable.cmsnDeviceMap.get(deviceId);
          if (device) {
            device.imu = arg.imu;
          }
          break;
        case 'onBrainWave':
          var deviceId = arg.deviceId;
          var device = cmsnObservable.cmsnDeviceMap.get(deviceId);
          if (device) {
            runInAction(() => {
              device.stats = arg.stats;
              //refresh ui
              cmsnObservable.cmsnDeviceMap.delete(deviceId);
              cmsnObservable.cmsnDeviceMap.set(deviceId, device);
            });
          }
          break;
        case 'onAttention':
          console.log(arg);
          var deviceId = arg.deviceId;
          var device = cmsnObservable.cmsnDeviceMap.get(deviceId);
          if (device) {
            runInAction(() => {
              device.attention = arg.attention;
              //refresh ui
              cmsnObservable.cmsnDeviceMap.delete(deviceId);
              cmsnObservable.cmsnDeviceMap.set(deviceId, device);
            });
          }
          break;
        case 'onMeditation':
          var deviceId = arg.deviceId;
          var device = cmsnObservable.cmsnDeviceMap.get(deviceId);
          if (device) {
            runInAction(() => {
              device.meditation = arg.meditation;
              //refresh ui
              cmsnObservable.cmsnDeviceMap.delete(deviceId);
              cmsnObservable.cmsnDeviceMap.set(deviceId, device);
            });
          }
          break;
        case 'onSocialEngagement':
          var deviceId = arg.deviceId;
          var device = cmsnObservable.cmsnDeviceMap.get(deviceId);
          if (device) {
            runInAction(() => {
              device.social = arg.social;
              //refresh ui
              cmsnObservable.cmsnDeviceMap.delete(deviceId);
              cmsnObservable.cmsnDeviceMap.set(deviceId, device);
            });
          }
          break;
        default:
          break;
      }
    });

    this.sendCmd('initSDK');
    // autoConnect();
  }

  static disposeSDK() {
    this.sendCmd('disposeSDK');
  }

  static sendCmd(cmd, params) {
    console.log('[CrimsonActions]', cmd);
    ipcRenderer.send(messageReq, { cmd: cmd, ...params });
  }

  static startScan() {
    runInAction(() => {
      cmsnObservable.devices = [];
    });
    this.sendCmd('startScan');
  }

  static stopScan() {
    runInAction(() => {
      cmsnObservable.devices = [];
    });
    this.sendCmd('stopScan');
  }

  static toogleScan() {
    if (!cmsnObservable.scanning) {
      this.startScan();
    } else {
      this.stopScan();
    }
  }

  static connect(device) {
    var deviceId = device.id;

    if (!cmsnObservable.cmsnDeviceMap.has(deviceId)) {
      runInAction(() => {
        cmsnObservable.cmsnDeviceMap.set(deviceId, device);
      });
    } else {
      const device = cmsnObservable.cmsnDeviceMap.get(deviceId);
      device.isInPairingMode = device.isInPairingMode;
    }
    this.sendCmd('connect', { deviceId: deviceId });
  }

  static disconnect(device) {
    var deviceId = device.id;
    this.sendCmd('disconnect', { deviceId: deviceId });

    if (cmsnObservable.cmsnDeviceMap.has(deviceId)) {
      runInAction(() => {
        cmsnObservable.cmsnDeviceMap.delete(deviceId);
      });
    }
  }

  static disconnectAll() {
    this.sendCmd('disconnectAll');
    if (cmsnObservable.cmsnDeviceMap.size > 0) {
      runInAction(() => {
        cmsnObservable.cmsnDeviceMap.clear();
      });
    }
  }
}

module.exports = {
  CrimsonActions,
  cmsnObservable,
};
