/* eslint-disable indent */
const CrimsonLogger = require('./cmsn_logger');
const { CrimsonSDK, CMSNDeviceListener, cmsnDeviceMap } = require('./cmsn_sdk');
const { CONNECTIVITY, CONTACT_STATE, ORIENTATION, CMSNLogLevel, IMU, CMSNError, getErrorMessage } = require('./cmsn_common');

async function _runErrorCB(error) {
  if (!error) return;
  console.error('_runErrorCB', error);
  if (_onErrorCb) {
    _onErrorCb({ code: error, message: getErrorMessage(error) });
  }
}

function _runDeviceErrorCB(device, error) {
  if (!error) return;
  console.error('_runDeviceErrorCB', device.name, error);
  if (device.delegate && device.delegate.onError) {
    device.delegate.onError({ code: error, message: getErrorMessage(error, device.name) });
  }
}

function _pairDevice(device) {
  if (device.isConnected) {
    if (device.delegate && device.delegate.onConnectivityChanged) {
      device.delegate.onConnectivityChanged(device, CONNECTIVITY.enum('connecting'));
    }
    device.pair(async (success, error) => {
      if (success) {
        CrimsonLogger.i({ msg: `[${device.name}] pair success` });
        device.isInPairingMode = false;
        if (device.delegate && device.delegate.onConnectivityChanged) {
          device.delegate.onConnectivityChanged(device, CONNECTIVITY.enum('connected'));
        }
        device.startDataStream(async (success, error) => {
          if (success) {
            console.log(device.name, 'EEG data stream started.');
            device.getLeadOffStatus();
          } else _runDeviceErrorCB(device, error);
        });
      } else _runDeviceErrorCB(device, error);
    });
  }
}

const _deviceListener = new CMSNDeviceListener({
  onError: (device, error) => _runDeviceErrorCB(device, error),
  onDeviceInfoReady: (device, deviceInfo) => {
    CrimsonLogger.i(device.name, `Device info is ready:`, deviceInfo);
    if (device.delegate && device.delegate.onDeviceInfoReady) device.delegate.onDeviceInfoReady(device, deviceInfo);
  },
  onBatteryLevelChanged: (device, batteryLevel) => {
    CrimsonLogger.i(device.name, `onBatteryLevelChanged:`, batteryLevel);
    if (device.delegate && device.delegate.onBatteryLevel) device.delegate.onBatteryLevelChanged(device, batteryLevel);
  },
  onConnectivityChanged: async (device, connectivity) => {
    CrimsonLogger.i({ message: `[${device.name}] Connectivity changed to: ${CONNECTIVITY(connectivity)}` });
    _startReconnectTimer();

    if (device.isConnected) {
      _pairDevice(device);
    } else {
      if (device.delegate && device.delegate.onConnectivityChanged) {
        device.delegate.onConnectivityChanged(device, connectivity);
      }
    }
  },
  onContactStateChanged: (device, contactState) => {
    CrimsonLogger.i(device.name, `Contact state changed to:`, CONTACT_STATE(contactState));
    if (device.delegate && device.delegate.onContactStateChanged) device.delegate.onContactStateChanged(device, contactState);

    if (contactState == CONTACT_STATE.enum('contact')) {
      _startIMU(device);
    } else {
      device.orientation = ORIENTATION.enum('unknown');
      if (device.delegate && device.delegate.onOrientationChanged) device.delegate.onOrientationChanged(device, device.orientation);

      _stopIMU(device);
    }
  },
  onOrientationChanged: (device, orientation) => {
    CrimsonLogger.i(device.name, `Orientation changed to:`, ORIENTATION(orientation));
    device.orientation = orientation;
    if (device.delegate && device.delegate.onOrientationChanged) device.delegate.onOrientationChanged(device, orientation);

    // stop imu when device orientation is normal
    if (orientation == ORIENTATION.enum('normal')) {
      _stopIMU(device);
    }
  },
  onIMUData: (device, imu) => {
    CrimsonLogger.d(device.name, `IMU data received:`, imu);
    if (device.delegate && device.delegate.onIMUData) device.delegate.onIMUData(device, imu);
  },
  onEEGData: (device, eeg) => {
    CrimsonLogger.d(device.name, 'EEG data received:', eeg);
    if (device.delegate && device.delegate.onEEGData) device.delegate.onEEGData(device, eeg);
  },
  onBrainWave: (device, stats) => {
    CrimsonLogger.d(device.name, 'BrainWave data received:', stats);
    if (device.delegate && device.delegate.onBrainWave) device.delegate.onBrainWave(device, stats);
  },
  onAttention: (device, attention) => {
    if (device.contactState != CONTACT_STATE.enum('contact') || device.orientation != ORIENTATION.enum('normal')) {
      CrimsonLogger.i(device.name, `contactState:`, device.contactState, 'orientation', device.orientation);
      return;
    }
    CrimsonLogger.i(device.name, `Attention:`, attention);
    if (device.delegate && device.delegate.onAttention) device.delegate.onAttention(device, attention);
  },
  onMeditation: (device, meditation) => {
    if (device.contactState != CONTACT_STATE.enum('contact') || device.orientation != ORIENTATION.enum('normal')) {
      CrimsonLogger.i(device.name, `contactState:`, device.contactState, 'orientation', device.orientation);
      return;
    }
    CrimsonLogger.i(device.name, `Meditation:`, meditation);
    if (device.delegate && device.delegate.onMeditation) device.delegate.onMeditation(device, meditation);
  },
  onSocialEngagement: (device, social) => {
    if (device.contactState != CONTACT_STATE.enum('contact') || device.orientation != ORIENTATION.enum('normal')) {
      CrimsonLogger.i(device.name, `contactState:`, device.contactState, 'orientation', device.orientation);
      return;
    }
    CrimsonLogger.i(device.name, `SocialEngagement:`, social);
    if (device.delegate && device.delegate.onSocialEngagement) device.delegate.onSocialEngagement(device, social);
  },
});

const _useDongle = false;
let _cmsnSDK;
let _onErrorCb;
let adapterAvailable = false;

const initSDK = async (onError, onAdapterStateChanged) => {
  if (_cmsnSDK) return;
  console.log('CrimsonSDK.init');
  _onErrorCb = onError;

  // eslint-disable-next-line require-atomic-updates
  _cmsnSDK = await CrimsonSDK.init(_useDongle, CMSNLogLevel.enum('info')); //info/error/warn
  _cmsnSDK.on('error', (e) => _runErrorCB(e));
  _cmsnSDK.on('onAdapterStateChanged', async (available) => {
    adapterAvailable = available;
    if (available) {
      if (cmsnDeviceMap.size > 0) _startReconnectTimer();
    } else {
      _runErrorCB(_useDongle ? CMSNError.enum('dongle_unavailable') : CMSNError.enum('ble_power_off'));
      await stopScan();
      //NOTE: 在cmsnDeviceMap中保留，不删除，用于设备重连
      cmsnDeviceMap.forEach(device => device.disconnect(false));
    }
    if (onAdapterStateChanged) onAdapterStateChanged(available);
  });
  if (_cmsnSDK.adapter.available) await _doScan();
  console.log('CrimsonSDK.init done');
};

const disposeSDK = async () => {
  disconnectAll();
  await CrimsonSDK.dispose();
};

//退出程序时保证可以断开头环
process.on('SIGINT', async () => {
    console.log({ message: `SIGINT signal received.` });
    await disposeSDK();
    console.log('End program');
    process.exit(0);
});

async function disconnectAll() {
  _stopReconnectTimer();
  cmsnDeviceMap.forEach(device => device.disconnect());
  cmsnDeviceMap.clear();

  _targetDeviceId = null;
  _scannedDeviceMap.clear();
  await stopScan();
}

/** Scan **/
var _onScanning = null;
var _onFoundDevices = null;
async function startScan(onScanning, onFoundDevices, targetDeviceId) {
  if (targetDeviceId) CrimsonLogger.i('[cmsn] scan target device', targetDeviceId);
  else {
    CrimsonLogger.i('[cmsn] startScan');
  }

  _onScanning = onScanning;
  _onFoundDevices = onFoundDevices;
  _targetDeviceId = targetDeviceId;

  if (_cmsnSDK.scanning) return;
  if (_cmsnSDK.adapter.available) await _doScan();
  else _runErrorCB(_useDongle ? CMSNError.enum('dongle_unavailable') : CMSNError.enum('ble_power_off'));
}

async function stopScan(cb) {
  console.log('stopScan');
  if (_onScanning) {
    _onScanning(false);
    _onScanning = null;
  }
  _onFoundDevices = null;

  if (_scanTimer) {
    clearInterval(_scanTimer);
    _scanTimer = null;
  }
  if (adapterAvailable && _cmsnSDK && _cmsnSDK.scanning) await _cmsnSDK.stopScan(cb);
}

const _scannedDeviceMap = new Map();
var _scanTimer;
async function _doScan() {
  if (!adapterAvailable || !_cmsnSDK || _cmsnSDK.scanning) return;
  if (!_targetDeviceId && !_onFoundDevices) return;

  if (_onScanning) _onScanning(true);
  _scannedDeviceMap.clear();
  await _cmsnSDK.startScan(async (device) => {
    // CrimsonLogger.i('[CMSN] found device', device.id, device && device.name);
    _scannedDeviceMap.set(device.id, device);

    if (_targetDeviceId && _targetDeviceId == device.id) {
      await _onFoundTargetDevice(device);
    }
  });

  if (_onFoundDevices) {
    if (_scanTimer) clearInterval(_scanTimer);
    _scanTimer = setInterval(() => {
      const curTimestamp = new Date().getTime();
      const devices = Array.from(_scannedDeviceMap.values()).filter((e) => curTimestamp - e.timestamp <= 30000);
      CrimsonLogger.i('[CMSN]: found devices: ', devices.length);
      CrimsonLogger.d(devices.map((e) => e.description));
      if (_onFoundDevices) _onFoundDevices(devices);
    }, 1000); //invoked per second
  }
}

/// Default: _subscription attention data stream only
const _subscription = { attention: true, meditation: true, socialEngagement: false };
async function _onFoundTargetDevice(device) {
  // if (_cmsnSDK.scanning) await stopScan();

  device.delegate = _targetDeviceDelegate;
  device.listener = _deviceListener;

  device.shouldReconnect = true;
  await device.connect();
  if (_subscription) {
    device.setDataSubscription(_subscription.attention, _subscription.meditation, _subscription.socialEngagement);
  }
}

var _targetDeviceId = null;
var _targetDeviceDelegate = null;
async function connect(deviceId, delegate) {
  if (!deviceId) return;
  if (typeof deviceId !== 'string' || deviceId.length == 0) return;

  _targetDeviceDelegate = delegate;
  var device = _scannedDeviceMap.get(deviceId);
  if (device) {
    if (!_cmsnSDK.adapter.available) {
      const error = _useDongle ? CMSNError.enum('dongle_unavailable') : CMSNError.enum('ble_power_off');
      _runDeviceErrorCB(device, error);
      return;
    }
    // 连接到已扫描到的设备
    console.log(`[CMSN], bind device`, device.id, device.name);
    _onFoundTargetDevice(device);
  } else {
    // 根据设备ID扫描并连接
    console.log(`[CMSN], auto connect device`, deviceId);
    await startScan(null, null, deviceId);
  }
}

const disconnect = async (deviceId, cb) => {
  if (!deviceId) return;
  console.log(`[CMSN], disconnect`, deviceId);
  setEnableReconnect(false);
  if (_targetDeviceId == deviceId) _targetDeviceId = null;
  var device = cmsnDeviceMap.get(deviceId);
  if (device) {
    // if (utils.isWin64()) device.shutdown(); // Windows下断开连接不及时，故直接发送关机指令
    await device.disconnect();
  }
  if (cb) cb();
};

const setLEDColor = (deviceId, color) => {
  if (!deviceId) return;
  var device = cmsnDeviceMap.get(deviceId);
  if (device) device.setLEDColor(color);
};

const setSleepIdleTime = (deviceId, time, cb) => {
  if (!deviceId) return;
  var device = cmsnDeviceMap.get(deviceId);
  if (device) device.setSleepIdleTime(time, cb);
};

const setVibrationIntensity = (deviceId, value, cb) => {
  if (!deviceId) return;
  var device = cmsnDeviceMap.get(deviceId);
  if (device) device.setVibrationIntensity(value, cb);
};

const getSystemInfo = (deviceId, cb) => {
  if (!deviceId) return;
  var device = cmsnDeviceMap.get(deviceId);
  if (device) device.getSystemInfo(cb);
};

const getSerialNumber = (deviceId) => {
  if (!deviceId) return;
  var device = cmsnDeviceMap.get(deviceId);
  if (device) return device.peripheral.serial_number;
  return '';
};

/** imu **/
async function _startIMU(device) {
  if (device.imuEnabled) return;
  device.imuEnabled = true;
  await device.startIMU(IMU.SAMPLE_RATE.enum('sr104'), (success) => {
    if (success) console.log('imu started');
    else device.imuEnabled = false;
  });
}

async function _stopIMU(device) {
  if (!device.imuEnabled) return;
  device.imuEnabled = false;
  await device.stopIMU((success) => {
    if (success) console.log('imu stopped');
    else device.imuEnabled = true;
  });
}

/** _reconnect **/
let _reconnectEnabled = true;
const setEnableReconnect = (enabled) => {
  _reconnectEnabled = enabled;
};

let _reconnectTimer = null;
function _startReconnectTimer() {
  if (!_reconnectEnabled) return;
  if (_reconnectTimer == null) {
    _reconnectTimer = setInterval(_reconnect, 3000);
    CrimsonLogger.i('reconnect timer started');
  }
}

function _stopReconnectTimer() {
  if (_reconnectTimer) {
    clearInterval(_reconnectTimer);
    _reconnectTimer = null;
    CrimsonLogger.i('reconnect timer stopped');
  }
}

async function _reconnect() {
  if (!_reconnectEnabled || !adapterAvailable || cmsnDeviceMap.size == 0) {
    _stopReconnectTimer();
    return;
  }

  for (let device of cmsnDeviceMap.values()) {
    if (!device.shouldReconnect) continue;
    //自动重连历史配对成功过且当前处于未连接的设备
    if (device.isDisconnected) {
      CrimsonLogger.i(`[${device.name}] try _reconnect ...`);
      await device.connect();
      if (_useDongle) break;
    } else if (device.isConnecting) CrimsonLogger.i(`[${device.name}] connecting ...`);
  }
}

module.exports = {
  initSDK,
  disposeSDK,
  adapterAvailable,
  startScan,
  stopScan,
  connect,
  disconnect,
  disconnectAll,
  setLEDColor,
  setSleepIdleTime,
  setVibrationIntensity,
  getSystemInfo,
  getSerialNumber,
};
