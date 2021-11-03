/* eslint-disable no-unused-vars */
const utils = require('./cmsn_utils');
const CrimsonLogger = require('./cmsn_logger');
const { CrimsonSDK, CMSNDeviceListener, cmsnDeviceMap } = require('./cmsn_sdk');
const { CONNECTIVITY, CONTACT_STATE, ORIENTATION, CMSNError, CMSNLogLevel, IMU } = require('./cmsn_common');

async function _runErrorCB(error) {
  if (!error) return;

  var message;
  switch (error) {
    case CMSNError.enum('ble_power_off'):
      message = 'Bluetooth is unavailable, please check the radio is opened';
      message = '蓝牙不可用，请检查蓝牙状态';
      await _onAdapterDisabled();
      break;
    case CMSNError.enum('dongle_unavailable'):
      message = 'nRF Dongle is unavailable, please check';
      message = '蓝牙串口设备不可用，请检查设备是否连接良好';
      await _onAdapterDisabled();
      break;
    case CMSNError.enum('scan_error'):
      message = 'Start scanning error';
      message = '扫描设备失败，请检查蓝牙串口设备';
      break;
    default:
      console.error('[ERROR]', error);
      return;
  }
  console.error('_runErrorCB', error, message);

  if (_onCrimsonError) {
    _onCrimsonError({ success: false, code: error, msg: message });
  }
}

function _runDeviceErrorCB(device, error) {
  if (!error) return;

  var message;
  switch (error) {
    case CMSNError.enum('pair_failed'):
      message = 'please try again.';
      message = '配对失败，请稍候重试';
      break;
    case CMSNError.enum('validate_info_failed'):
      message = 'please switch to pairing mode then connect again.';
      message = `请将设备${device && device.name}调整至配对模式。`;
      // message = '校验配对信息失败，请将设备切换到配对模式（LED蓝灯快闪）再进行连接';
      break;
    default:
      // message = 'Unkonwn error';
      // message = '未知错误';
      return;
  }
  CrimsonLogger.e(device.name, message, error);

  if (device.delegate && device.delegate.onError) {
    device.delegate.onError({ code: error, message: message });
  }
}

const _deviceListener = new CMSNDeviceListener({
  onError: (device, error) => _runDeviceErrorCB(device, error),
  onConnectivityChanged: async (device, connectivity) => {
    CrimsonLogger.i({ message: `[${device.name}] Connectivity changed to: ${CONNECTIVITY(connectivity)}` });
    _startReconnectTimer();

    if (device.isConnected) {
      if (device.delegate && device.delegate.onConnectivityChanged) {
        device.delegate.onConnectivityChanged(CONNECTIVITY.enum('connecting'));
      }
      device.pair(async (success, error) => {
        if (success) {
          CrimsonLogger.i({ msg: `[${device.name}] pair success` });
          device.isInPairingMode = false;
          if (device.delegate && device.delegate.onConnectivityChanged) {
            device.delegate.onConnectivityChanged(CONNECTIVITY.enum('connected'));
          }
          device.startDataStream(async (success, error) => {
            if (success) {
              console.log(device.name, 'EEG data stream started.');
              device.getLeadOffStatus();
            } else _runDeviceErrorCB(device, error);
          });
        } else _runDeviceErrorCB(device, error);
      });
    } else {
      if (device.delegate && device.delegate.onConnectivityChanged) {
        device.delegate.onConnectivityChanged(connectivity);
      }
    }
  },
  onDeviceInfoReady: (device, deviceInfo) => {
    CrimsonLogger.i(device.name, `Device info is ready:`, deviceInfo);
    if (device.delegate && device.delegate.onDeviceInfoReady) device.delegate.onDeviceInfoReady(deviceInfo);
  },
  onContactStateChanged: (device, contactState) => {
    CrimsonLogger.i(device.name, `Contact state changed to:`, CONTACT_STATE(contactState));
    if (device.delegate && device.delegate.onContactStateChanged) device.delegate.onContactStateChanged(contactState);

    if (contactState == CONTACT_STATE.enum('contact')) {
      _startIMU(device);
    } else {
      device.orientation = ORIENTATION.enum('unknown');
      if (device.delegate && device.delegate.onOrientationChanged)
        device.delegate.onOrientationChanged(device.orientation);

      _stopIMU(device);
    }
  },
  onOrientationChanged: (device, orientation) => {
    CrimsonLogger.i(device.name, `Orientation changed to:`, ORIENTATION(orientation));
    if (device.delegate && device.delegate.onOrientationChanged) device.delegate.onOrientationChanged(orientation);

    // stop imu when device orientation is normal
    if (orientation == ORIENTATION.enum('normal')) {
      _stopIMU(device);
    } else if (device.contactState == CONTACT_STATE.enum('contact')) {
      _startIMU(device);
    }
  },
  onIMUData: (device, imu) => {
    CrimsonLogger.d(device.name, `IMU data received:`, imu);
    if (device.delegate && device.delegate.onIMUData) device.delegate.onIMUData(imu);
  },
  onEEGData: (device, eeg) => {
    CrimsonLogger.d(device.name, 'EEG data received:', eeg);
    if (device.delegate && device.delegate.onEEGData) device.delegate.onEEGData(eeg);
  },
  onBrainWave: (device, stats) => {
    CrimsonLogger.d(device.name, 'BrainWave data received:', stats);
    if (device.delegate && device.delegate.onBrainWave) device.delegate.onBrainWave(stats);
  },
  onAttention: (device, attention) => {
    CrimsonLogger.i(device.name, `Attention:`, attention);
    if (device.delegate && device.delegate.onAttention) device.delegate.onAttention(attention);
  },
  onMeditation: (device, meditation) => {
    CrimsonLogger.i(device.name, `Meditation:`, meditation);
    if (device.delegate && device.delegate.onMeditation) device.delegate.onMeditation(meditation);
  },
  onSocialEngagement: (device, social) => {
    CrimsonLogger.i(device.name, `SocialEngagement:`, social);
    if (device.delegate && device.delegate.onSocialEngagement) device.delegate.onSocialEngagement(social);
  },
});

const _useDongle = false;
let _cmsnSDK;
let _onCrimsonError;
const initSDK = async () => {
  if (_cmsnSDK) return;
  console.log('CrimsonSDK.init');
  _onCrimsonError = (error) => {
    CrimsonLogger.i(error);
  };

  // eslint-disable-next-line require-atomic-updates
  _cmsnSDK = await CrimsonSDK.init(_useDongle, CMSNLogLevel.enum('info')); //info/error/warn
  // CrimsonSDK.createFilter(true, 2, 45, true, 49, 51);

  // console.log(_cmsnSDK);
  _cmsnSDK.on('error', (e) => _runErrorCB(e));
  _cmsnSDK.on('onAdapterAvailable', async () => {
    var message = _useDongle ? 'nRF Dongle is available now' : 'ble adapter is available now';
    message = _useDongle ? '蓝牙串口设备已连接' : '蓝牙已开启';
    console.log({ msg: message });
    _adapterDisbaled = false;
    await _doScan();
  });
  if (_cmsnSDK.adapter.available) await _doScan();
  console.log('CrimsonSDK.init done');
};

const disposeSDK = async () => {
  disconnectAll();
  await CrimsonSDK.dispose();
};

var _adapterDisbaled = true;
async function _onAdapterDisabled() {
  _adapterDisbaled = true;
  disconnectAll();
}

async function disconnectAll() {
  _stopReconnectTimer();
  for (let device of cmsnDeviceMap.values()) {
    await device.disconnect();
  }
  cmsnDeviceMap.clear();

  _scannedDeviceMap.clear();
  await stopScan();
}

/** Scan **/
var _onScanning = null;
var _onFoundDevices = null;
async function startScan(onScanning, onFoundDevices) {
  CrimsonLogger.i('startScan');
  _onScanning = onScanning;
  _onFoundDevices = onFoundDevices;

  await initSDK();
  if (_cmsnSDK.scanning) return;
  if (_cmsnSDK.adapter.available) await _doScan();
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
  if (_cmsnSDK && _cmsnSDK.scanning) await _cmsnSDK.stopScan(cb);
}

const _scannedDeviceMap = new Map();
var _scanTimer;
async function _doScan() {
  if (!_cmsnSDK || _cmsnSDK.scanning) return;
  console.log({ targetDeviceId: _targetDeviceId, onFoundDevices: _onFoundDevices });
  if (!_targetDeviceId && !_onFoundDevices) return;

  if (_onScanning) _onScanning(true);
  _scannedDeviceMap.clear();
  await _cmsnSDK.startScan(async (device) => {
    CrimsonLogger.d('[CMSN] found device', device.id, device && device.name);
    _scannedDeviceMap.set(device.id, device);

    if (device.id === _targetDeviceId) await _onFoundTargetDevice(device);
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
const _subscription = { attention: true, meditation: true, socialEngagement: true };
async function _onFoundTargetDevice(device) {
  if (_cmsnSDK.scanning) await stopScan();

  device.delegate = _targetDeviceDelegate;
  device.listener = _deviceListener;
  _targetDeviceId = null;
  _targetDeviceDelegate = null;

  await device.connect();
  if (_subscription) {
    device.setDataSubscription(_subscription.attention, _subscription.meditation, _subscription.socialEngagement);
  }
}

var _targetDeviceId = null;
var _targetDeviceDelegate = null;
async function connect(deviceId, delegate) {
  console.log(`[CMSN], connectTargetDevice ${deviceId}`);
  if (typeof deviceId !== 'string' || deviceId.length == 0) return;

  _targetDeviceId = deviceId;
  _targetDeviceDelegate = delegate;

  var device = _scannedDeviceMap.get(deviceId);
  if (device) {
    // 连接到已扫描到的设备
    _onFoundTargetDevice(device);
  } else {
    // 根据设备ID扫描并连接
    await startScan();
  }
}

const disconnect = async (deviceId, cb) => {
  setEnableReconnect(false);
  await stopScan();

  var device = cmsnDeviceMap.get(deviceId);
  if (device) {
    if (utils.isWin64()) device.shutdown(); // Windows下断开连接不及时，故直接发送关机指令
    await device.disconnect();
  }
  if (cb) cb();
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
    _reconnectTimer = setInterval(_reconnect, _useDongle ? 1000 : 3000);
    CrimsonLogger.i('started _reconnect timer');
  }
}

function _stopReconnectTimer() {
  if (_reconnectTimer) {
    clearInterval(_reconnectTimer);
    CrimsonLogger.i('stoped _reconnect timer');
  }
}

async function _reconnect() {
  if (!_reconnectEnabled) return;
  if (_adapterDisbaled) return;

  for (let device of cmsnDeviceMap.values()) {
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
  startScan,
  stopScan,
  connect,
  disconnect,
  disconnectAll,
};

// async function onTest(device) {
// device.getSystemInfo((systemInfo, error) => {
//     if (systemInfo) CrimsonLogger.i(JSON.stringify(systemInfo));
//     else device.logError(error);
// }, null);
// device.setSleepIdleTime(900);
// device.setVibrationIntensity(30);
// device.setDeviceName('cmsn_linxin');
// device.setLEDColor('#ff0000');
// device.startIMU(IMU.SAMPLE_RATE.enum('sr104'));
// device.setImpedanceTestMode(true);
// }
