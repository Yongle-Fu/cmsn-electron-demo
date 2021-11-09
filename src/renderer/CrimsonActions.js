const { ipcRenderer } = require('electron');
// const Store = require('electron-store');
const { observable, runInAction } = require('mobx');
const { CONNECTIVITY } = require('../main/libcmsn/cmsn_common');

const messageReq = 'cmsn-request';
const messageRes = 'cmsn-respnose';

const scanObservable = observable({
  scanning: false,
  devices: [],
});

const cmsnObservable = observable({
  devices: [],
});

const _cmsnMap = new Map();

class CrimsonActions {
  static _initialized = false;
  static initSDK() {
    ipcRenderer.on(messageRes, (_, arg) => {
      switch (arg.cmd) {
        case 'onInitialized':
          console.log(arg);
          this._initialized = true;
          this._autoConnect();
          break;
        case 'onScanning':
          console.log(arg);
          runInAction(() => {
            scanObservable.scanning = arg.scanning;
          });
          break;
        case 'onFoundDevices':
          console.log(arg);
          runInAction(() => {
            scanObservable.devices = arg.devices;
          });
          break;
        case 'onError':
          console.log('[onError] deviceId', arg.deviceId, 'error', error);
          break;

        // case 'onDeviceSystemInfo':
        // case 'onDeviceBatteryLevel':
        case 'onDeviceInfoReady':
        case 'onConnectivityChanged':
        case 'onContactStateChanged':
        case 'onOrientationChanged':
          console.log(arg);
          this.onDeviceEvent(arg);
          break;

        case 'onEEGData':
        case 'onIMUData':
        case 'onBrainWave':
        case 'onAttention':
        case 'onMeditation':
        case 'onSocialEngagement':
          this.onDeviceEvent(arg);
          break;
        default:
          break;
      }
    });

    this._sendCmd('initSDK');
  }

  static disposeSDK() {
    this._initialized = false;
    this._sendCmd('disposeSDK');
  }

  static _sendCmd(cmd, params) {
    if (!this._initialized && cmd != 'initSDK') {
      console.log(cmd, 'while Crimson SDK is not initialized');
      return;
    }
    console.log('[CrimsonActions]', cmd);
    ipcRenderer.send(messageReq, { cmd: cmd, ...params });
  }

  static startScan() {
    runInAction(() => {
      scanObservable.devices = [];
    });
    this._sendCmd('startScan');
  }

  static stopScan() {
    runInAction(() => {
      scanObservable.devices = [];
    });
    this._sendCmd('stopScan');
  }

  static toogleScan() {
    if (!scanObservable.scanning) {
      this.startScan();
    } else {
      this.stopScan();
    }
  }

  static connect(device) {
    if (!device) return;
    var deviceId = device.id;
    if (!deviceId) return;

    _cmsnMap.set(deviceId, { id: deviceId, name: device.name });
    this._sendCmd('connect', { deviceId: deviceId });
    // this._sendCmd('stopScan', { deviceId: deviceId }); //for debug
    this._notifyUpdateDevices();
  }

  static disconnect(device) {
    if (!device) return;
    var deviceId = device.id;
    if (!deviceId) return;

    _cmsnMap.delete(deviceId);
    this._sendCmd('disconnect', { deviceId: deviceId });
    this._notifyUpdateDevices();
    this._updateDeviceRecords();
  }

  static disconnectAll() {
    _cmsnMap.clear();
    _cmsnMap.forEach((device) => {
      device.store = null;
    });
    this._sendCmd('disconnectAll');
    this._notifyUpdateDevices();
    this._updateDeviceRecords();
  }

  static _notifyUpdateDevices() {
    const devices = Array.from(_cmsnMap.values());
    // console.log('_notifyUpdateDevices', devices);
    //refresh ui
    runInAction(() => {
      cmsnObservable.devices = devices;
    });
  }

  static onDeviceEvent(arg) {
    var deviceId = arg.deviceId;
    if (!deviceId) return;
    var device = _cmsnMap.get(deviceId);
    if (!device) return;

    switch (arg.cmd) {
      case 'onDeviceInfoReady':
        device.deviceInfo = arg.deviceInfo;
        this._notifyUpdateDevices();
        break;
      case 'onConnectivityChanged':
        console.log('onConnectivityChanged', arg.connectivity);
        device.connectivity = arg.connectivity;
        if (device.connectivity == CONNECTIVITY.enum('connected')) {
          if (!device.store) {
            device.store = true;
            this._updateDeviceRecords();
          }
        } else {
          //reset other state when device is not connected
          device.contactState = 0;
          device.orientation = 0;
          device.attention = 0;
          device.meditation = 0;
          device.social = 0;
          device.stats = null;
        }
        this._notifyUpdateDevices();
        break;
      case 'onContactStateChanged':
        device.contactState = arg.contactState;
        this._notifyUpdateDevices();

        break;
      case 'onOrientationChanged':
        device.orientation = arg.orientation;
        this._notifyUpdateDevices();
        break;
      case 'onBrainWave':
        device.stats = arg.stats;
        this._notifyUpdateDevices();
        break;
      case 'onAttention':
        console.log(arg);
        device.attention = arg.attention;
        this._notifyUpdateDevices();
        break;
      case 'onMeditation':
        device.meditation = arg.meditation;
        this._notifyUpdateDevices();
        break;
      case 'onSocialEngagement':
        device.social = arg.social;
        this._notifyUpdateDevices();
        break;
      case 'onEEGData':
        device.eeg = arg.eeg;
        break;
      case 'onIMUData':
        device.imu = arg.imu;
        break;
      default:
        break;
    }
  }

  // [TBD] move to main progress
  // static deviceStore = new Store();
  static _updateDeviceRecords() {
    const records = Array.from(_cmsnMap.values())
      .filter((e) => e.store == true)
      .map((e) => {
        return { id: e.id, name: e.name };
      });
    console.log('_updateDeviceRecords', records);
    // deviceStore.set('cmsnRecords', records);
  }

  static _autoConnect() {
    console.log('loadDeviceRecords');
    // const devices = deviceStore.get('cmsnRecords');
    // if (Array.isArray(devices) && devices.length > 0) {
    //   console.log('autoConnect');
    //   devices.forEach((device) => {
    //     if (device.id && device.name) {
    //       device.store = true;
    //       this.connect(device);
    //     }
    //   });
    //   this._notifyUpdateDevices();
    // }
  }
}

module.exports = {
  CrimsonActions,
  cmsnObservable,
  scanObservable,
};
