/* eslint-disable no-unused-vars */
/* eslint-disable require-atomic-updates */
/* eslint-disable indent */
const loadWasm = require('./cmsn');
const { hexToRGB, sleep } = require('./cmsn_utils');
const EventEmitter = require('events');
const { CMSNDongleAdapter } = require('./cmsn_dongle');
const { CMSNBleAdapter } = require('./cmsn_ble');
const { CMD, CONNECTIVITY, CONTACT_STATE, AFE, IMU, CMSNError, CMSNLogLevel } = require('./cmsn_common');
const CrimsonLogger = require('./cmsn_logger');

// Global Variable
const cmsnDeviceMap = new Map(); // (uuid: string, device)
const msgCallbackMap = new Map(); // (msgId, cb(success, error))
const sysInfoCallbackMap = new Map(); // (msgId, cb(systemInfo, error))
let libcmsn;
let cmsnSDK; //shared instance

class CrimsonSDK extends EventEmitter {
  static arrayToPtr(array) {
    var ptr = libcmsn._malloc(array.byteLength);
    libcmsn.HEAPF32.set(array, ptr / array.BYTES_PER_ELEMENT);
    return ptr;
  }

  static ptrToArray(ptr, length) {
    var array = new Float32Array(length);
    var pos = ptr / 4;
    array.set(libcmsn.HEAPF32.subarray(pos, pos + length));
    return array;
  }

  /** filter **/
  static createFilter(passEnabled, lowPass, highPass, stopEnabled, lowStop, highStop) {
    if (!libcmsn) return;
    //带通 0.5~250, highPass > lowPass + 5
    if (
      passEnabled &&
      (lowPass < 0.5 || lowPass > 250 || highPass < 0.5 || highPass > 250 || highPass - lowPass <= 5)
    ) {
      lowPass = 2;
      highPass = 45;
    }
    //带通 0.5~250, highStop > lowStop
    if (
      stopEnabled &&
      (lowStop < 0.5 || lowStop > 250 || highStop < 0.5 || highStop > 250 || highStop - lowStop <= 0)
    ) {
      lowStop = 49;
      highStop = 51;
    }
    libcmsn.filterPtr = libcmsn.cmsn_create_sdk_filter(passEnabled, lowPass, highPass, stopEnabled, lowStop, highStop);
    CrimsonLogger.d('createFilter:', libcmsn.filterPtr);
  }

  static getFilterData(array) {
    if (!libcmsn || !libcmsn.filterPtr) return array;
    var ptr = CrimsonSDK.arrayToPtr(new Float32Array(array));
    var length = array.length;
    libcmsn.cmsn_get_filter_data(libcmsn.filterPtr, ptr, length);
    var newArr = CrimsonSDK.ptrToArray(ptr, length);
    libcmsn._free(ptr);
    return newArr;
  }

  /** init sdk **/
  static async init(useDongle, logLevel) {
    if (cmsnSDK) return;
    cmsnSDK = new CrimsonSDK();
    cmsnSDK.useDongle = useDongle;

    if (libcmsn) return;
    libcmsn = await loadWasm({
      onSayHello: (msg) => {
        CrimsonLogger.i(msg);
        CrimsonLogger.i('------------- Hello Crimson -------------');
      },
      onLog: (msg) => {
        CrimsonLogger.i(msg);
      },
      onConfigResp: (msgId, success, error) => {
        const cb = msgCallbackMap.get(msgId);
        if (cb) cb(success, error);
        CrimsonLogger.d(`onConfigResp, msgId=${msgId}, success=${success}, error=${error}`);
      },
      onSysInfoResp: (msgId, sysInfo, error) => {
        const cb = sysInfoCallbackMap.get(msgId);
        if (cb) cb(sysInfo, error);
      },
      onLeadOff: (deviceId, center, side) => {
        const device = cmsnDeviceMap.get(deviceId);
        if (device) {
          CrimsonLogger.d(`onLeadOff, center=${center}, side=${side}`);
        } else {
          CrimsonLogger.e(`${deviceId} unavailable`);
        }
      },
      onSignalQualityWarning: (deviceId, quality) => {
        const device = cmsnDeviceMap.get(deviceId);
        if (device) {
          device.logMessage(`onSignalQualityWarning: ${quality}`);
          device.getLeadOffStatus();
        } else {
          CrimsonLogger.e(`${deviceId} unavailable`);
        }
      },
      onContactStateChanged: (deviceId, contactState) => {
        const device = cmsnDeviceMap.get(deviceId);
        if (device) {
          if (device.listener && device.listener.onContactStateChanged)
            device.listener.onContactStateChanged(device, contactState);
        } else {
          CrimsonLogger.e(`${deviceId} unavailable`);
        }
      },
      onOrientationChanged: (deviceId, orientation) => {
        const device = cmsnDeviceMap.get(deviceId);
        if (device) {
          if (device.listener && device.listener.onOrientationChanged)
            device.listener.onOrientationChanged(device, orientation);
        } else {
          CrimsonLogger.e(`${deviceId} unavailable`);
        }
      },
      onIMUData: (deviceId, imu) => {
        const device = cmsnDeviceMap.get(deviceId);
        if (device) {
          if (device.listener && device.listener.onIMUData) device.listener.onIMUData(device, imu);
        } else {
          CrimsonLogger.e(`${deviceId} unavailable`);
        }
      },
      onEEGData: (deviceId, eeg) => {
        const device = cmsnDeviceMap.get(deviceId);
        if (device) {
          if (device.listener && device.listener.onEEGData) device.listener.onEEGData(device, eeg);
        } else {
          CrimsonLogger.e(`${deviceId} unavailable`);
        }
      },
      onBrainWave: (deviceId, stats) => {
        const device = cmsnDeviceMap.get(deviceId);
        if (device) {
          if (device.listener && device.listener.onBrainWave) device.listener.onBrainWave(device, stats);
        } else {
          CrimsonLogger.e(`${deviceId} unavailable`);
        }
      },
      onAttention: (deviceId, value) => {
        CrimsonLogger.d('onAttention-----', value);
        const device = cmsnDeviceMap.get(deviceId);
        if (device) {
          if (device.listener && device.listener.onAttention) device.listener.onAttention(device, value);
        } else {
          CrimsonLogger.e(`${deviceId} unavailable`);
        }
      },
      onMeditation: (deviceId, value) => {
        CrimsonLogger.d('onMeditation-----', value);
        const device = cmsnDeviceMap.get(deviceId);
        if (device) {
          if (device.listener && device.listener.onMeditation) device.listener.onMeditation(device, value);
        } else {
          CrimsonLogger.e(`${deviceId} unavailable`);
        }
      },
      onSocialEngagement: (deviceId, value) => {
        CrimsonLogger.d('onSocialEngagement-----', value);
        const device = cmsnDeviceMap.get(deviceId);
        if (device) {
          if (device.listener && device.listener.onSocialEngagement) device.listener.onSocialEngagement(device, value);
        } else {
          CrimsonLogger.e(`${deviceId} unavailable`);
        }
      },
    });
    CrimsonLogger.i('------------- SDK init -------------');

    libcmsn.cmsn_create_device = libcmsn.cwrap('em_create_device', 'number', ['string']);
    libcmsn.cmsn_did_receive_data = libcmsn.cwrap('em_did_receive_data', 'number', ['number', 'array', 'number']);
    libcmsn.cmsn_get_contact_state = libcmsn.cwrap('em_cmsn_get_contact_state', 'number', ['number']);
    libcmsn.cmsn_gen_msg_id = libcmsn.cwrap('em_gen_msg_id', 'number', []);
    libcmsn.cmsn_sys_config_validate_pair_info_pack = libcmsn.cwrap('em_sys_config_validate_pair_info_pack', 'number', [
      'string',
    ]);
    libcmsn.cmsn_sys_config_pair_pack = libcmsn.cwrap('em_sys_config_pair_pack', 'number', ['string']);
    libcmsn.cmsn_sys_config_pack = libcmsn.cwrap('em_sys_config_pack', 'number', ['number']);
    libcmsn.cmsn_config_afe_pack = libcmsn.cwrap('em_config_afe_pack', 'number', [
      'number',
      'number',
      'number',
      'number',
    ]);
    libcmsn.cmsn_config_imu_pack = libcmsn.cwrap('em_config_imu_pack', 'number', ['number', 'number']);
    libcmsn.cmsn_set_device_name_pack = libcmsn.cwrap('em_set_device_name_pack', 'number', ['number', 'string']);
    libcmsn.cmsn_set_led_color_pack = libcmsn.cwrap('em_set_led_color_pack', 'number', [
      'number',
      'number',
      'number',
      'number',
    ]);
    libcmsn.cmsn_set_sleep_pack = libcmsn.cwrap('em_set_sleep_pack', 'number', ['number', 'number']);
    libcmsn.cmsn_set_vibration_pack = libcmsn.cwrap('em_set_vibration_pack', 'number', ['number', 'number']);
    libcmsn.cmsn_enable_impedance_test = libcmsn.cwrap('em_enable_impedance_test', 'null', ['number', 'boolean']);
    libcmsn.cmsn_enable_filters = libcmsn.cwrap('em_enable_filters', 'null', ['number', 'boolean']);
    libcmsn.cmsn_create_sdk_filter = libcmsn.cwrap('em_create_sdk_filter', 'number', [
      'boolean',
      'number',
      'number',
      'boolean',
      'number',
      'number',
    ]);
    libcmsn.cmsn_get_filter_data = libcmsn.cwrap('em_dev_filter', 'null', ['number', 'number', 'number']);
    libcmsn.cmsn_set_data_subscription = libcmsn.cwrap('em_set_data_subscription', 'number', [
      'number',
      'boolean',
      'boolean',
      'boolean',
    ]);
    libcmsn.cmsn_set_log_level = libcmsn.cwrap('em_set_log_level', 'number', ['number']);

    if (logLevel) this.setLogLevel(logLevel);
    await cmsnSDK.initAdapter(useDongle);

    return cmsnSDK;
  }

  /** process.onExit **/
  static async dispose() {
    cmsnDeviceMap.forEach((d, _) => {
      d.disconnect();
    });
    cmsnDeviceMap.clear();
    await sleep(200);

    if (!cmsnSDK) return;
    if (cmsnSDK.adapter) cmsnSDK.adapter.dispose();
    cmsnSDK = null;
    await sleep(300);
  }

  static setLogLevel(level) {
    CrimsonLogger.setLogLevel(level);
    CrimsonLogger.i('[CMSN]', 'setLogLevel', level);
    if (level >= 0 && level < 4) {
      libcmsn.cmsn_set_log_level(level);
    } else {
      libcmsn.cmsn_set_log_level(CMSNLogLevel.enum('none'));
    }
  }

  constructor() {
    super();
    this.scanning = false;
  }

  async initAdapter(useDongle) {
    if (this.adapter) {
      CrimsonLogger.i('dispose old adapter...');
      this.adapter.dispose();
      this.adapter = null;
      await sleep(1500);
    }
    CrimsonLogger.i('useDongle', useDongle);
    var adapter;
    if (useDongle) {
      adapter = new CMSNDongleAdapter();
    } else {
      adapter = new CMSNBleAdapter();
    }
    try {
      const that = this;
      await adapter.initAdapter({
        onError: function (error) {
          CrimsonLogger.e('[CMSN ERROR]:', error);
          that.emit('error', error);
        },
        onAdapterStateChaged: function (available) {
          CrimsonLogger.i('onAdapterStateChaged', available);
          that.emit('onAdapterStateChaged', available);
        },
      });
    } catch (error) {
      CrimsonLogger.e('initAdapter error', error);
    }
    this.adapter = adapter;
  }

  /** Scan BLE Device **/
  async startScan(cb) {
    if (this.scanning) {
      CrimsonLogger.e('Already scanning for Crimson devices.');
      return;
    }

    const adapter = cmsnSDK.adapter;
    if (!adapter.available) {
      this.emitError(this.useDongle == true ? CMSNError.enum('dongle_unavailable') : CMSNError.enum('ble_power_off'));
      return;
    }

    try {
      CrimsonLogger.i('start scanning...');
      await adapter.startScan((p) => {
        if (this.scanning) cb(new CMSNDevice(p));
      });
      this.scanning = true;
      CrimsonLogger.i(`started scanning.`);
    } catch (error) {
      CrimsonLogger.e('start scanning failed.', error);
      this.emitError(CMSNError.enum('scan_error'));
    }
  }

  /** Stop scan BLE Device **/
  async stopScan() {
    if (!this.scanning) {
      CrimsonLogger.w('stop scanning, while no instance scanning for Crimson devices.');
      return;
    }

    try {
      CrimsonLogger.i('stop scanning...');
      await cmsnSDK.adapter.stopScan();
      this.scanning = false;
      CrimsonLogger.i(`stopped scanning.`);
    } catch (error) {
      CrimsonLogger.e(`stop scanning failed.`);
      CrimsonLogger.e(error);
    }
  }
}

const availableCallbacks = {
  onError: '(CMSNDevice, Error)=>Void',
  onDeviceInfoReady: '(CMSNDevice, DeviceInfo)=>Void',
  onBatteryLevelChanged: '(CMSNDevice, int)=>Void',
  onConnectivityChanged: '(CMSNDevice, Connectivity)=>Void',
  onContactStateChanged: '(CMSNDevice, ContactState)=>Void',
  onOrientationChanged: '(CMSNDevice, Orientation)=>Void',
  onIMUData: '(CMSNDevice, IMUData)=>Void',
  onEEGData: '(CMSNDevice, EEGData)=>Void',
  onBrainWave: '(CMSNDevice, BrainWave)=>Void',
  onAttention: '(CMSNDevice, Float)=>Void',
  onMeditation: '(CMSNDevice, Float)=>Void',
  onSocialEngagement: '(CMSNDevice, Float)=>Void',
};

class CMSNDeviceListener {
  constructor(callbacks) {
    const cbs = callbacks ? callbacks : {};
    for (const [key, cb] of Object.entries(cbs)) {
      if (key in availableCallbacks) {
        if (typeof cb == 'function') this[key] = cb;
        else
          CrimsonLogger.e(
            `ERROR: Callback for ${key} is not a function, should be ${CMSNDeviceListener.availableCallbacks[key]}`
          );
      } else CrimsonLogger.e(`ERROR:${key} is not an option for ${this}`);
    }
  }
}

class CMSNDevice {
  constructor(peripheral) {
    this.peripheral = peripheral;
    this.id = peripheral.address;
    this.name = peripheral.name;
    this.paired = false;
    this.timestamp = new Date().getTime();
  }

  logMessage(message) {
    CrimsonLogger.i(this.name, message);
  }
  logWarn(message) {
    CrimsonLogger.w(`[WARN] [${this.name}]`, message);
  }
  logError(message) {
    CrimsonLogger.e(`[ERROR] [${this.name}]`, message);
  }

  get description() {
    return `${this.name}], id=${this.id}, isInPairingMode=${this.isInPairingMode}, rssi=${this.rssi}, batteryLevel=${this.batteryLevel}`;
  }

  /**
   * @param {CONNECTIVITY} connectivity
   */
  get connectivity() {
    return this._connectivity;
  }
  set connectivity(connectivity) {
    if (this._connectivity == connectivity) return;
    this._connectivity = connectivity;
    this.logMessage('> connectivity:' + connectivity);
    this.paired = false;

    if (!this.listener) return;
    if (this.isConnected && this.listener.onDeviceInfoReady && this.peripheral) {
      const info = {
        manufacturer_name: this.peripheral.manufacturer_name,
        model_number: this.peripheral.model_number,
        serial_number: this.peripheral.serial_number,
        hardware_revision: this.peripheral.hardware_revision,
        firmware_revision: this.peripheral.firmware_revision,
      };
      this.listener.onDeviceInfoReady(this, info);
    }
    if (this.listener.onConnectivityChanged) this.listener.onConnectivityChanged(this, connectivity);
  }

  get isDisconnected() {
    return this._connectivity == undefined || this._connectivity == CONNECTIVITY.enum('disconnected');
  }
  get isDisconnecting() {
    return this._connectivity == CONNECTIVITY.enum('disconnecting');
  }
  get isConnecting() {
    return this._connectivity == CONNECTIVITY.enum('connecting');
  }
  get isConnected() {
    return this._connectivity == CONNECTIVITY.enum('connected');
  }

  get contactState() {
    return this.devicePtr ? libcmsn.cmsn_get_contact_state(this.devicePtr) : CONTACT_STATE.UNKNOWN;
  }

  get isInPairingMode() {
    return this.peripheral ? this.peripheral.isInPairingMode : false;
  }
  set isInPairingMode(mode) {
    if (this.peripheral) this.peripheral.isInPairingMode = mode;
  }

  get batteryLevel() {
    return this.peripheral ? this.peripheral.batteryLevel : -1;
  }

  get rssi() {
    return this.peripheral ? this.peripheral.rssi : -1;
  }

  get pairUuid() {
    if (!this.peripheral) throw Error('peripheral should not unavailable');
    return this.peripheral.address;
  }

  onError(error) {
    if (error && this.listener && this.listener.onError) this.listener.onError(this, error);
  }

  disconnect(remove = true) {
    if (!cmsnSDK.adapter || !cmsnSDK.adapter.available) {
      CrimsonLogger.i('cmsnSDK.adapter', cmsnSDK.adapter);
      if (!this.isDisconnected) this.connectivity = CONNECTIVITY.enum('disconnected');
      return;
    }
    this.logMessage(`disconnect...`);
    if (this.peripheral) this.peripheral.onReceiveData = null;
    var id = this.id;
    cmsnSDK.adapter.disconnect(id);
    if (remove && cmsnDeviceMap.has(id)) cmsnDeviceMap.delete(id);
  }

  connect() {
    if (!this.isDisconnected) {
      this.onError(`The device is not disconnected when calling connect`);
      return;
    }

    const that = this;
    if (!this.devicePtr) {
      this.devicePtr = libcmsn.cmsn_create_device(this.id);
      this.peripheral.onConnectivityChanged = (connectivity) => {
        that.connectivity = connectivity;
      };
      this.peripheral.onBatteryLevelChanged = (batteryLevel) => {
        if (that.listener.onBatteryLevelChanged) that.listener.onBatteryLevelChanged(that, batteryLevel);
      };
      this.peripheral.onBatteryLevelChanged(this.batteryLevel);
    }

    cmsnDeviceMap.set(this.id, this);
    this.peripheral.onReceiveData = (buffer) => {
      // if (that.paired) {
      //     CrimsonLogger.d('onReceiveData', buffer.length);
      //     CrimsonLogger.d('onReceiveData', buffer);
      //     return;
      // }
      libcmsn.cmsn_did_receive_data(that.devicePtr, buffer, buffer.length);
    };
    cmsnSDK.adapter.connect(this.id, this.peripheral);
  }

  toUint8Array(ptr) {
    var view = new Uint8Array(libcmsn.HEAPU8.subarray(ptr, ptr + 6)); // read body_size
    var body_size = view[4] * 256 + view[5]; //(buffer[0] << 8) + buffer[1];
    var len = body_size + 10; //body_size + PKT_WRAPPER_LEN
    var array = new Uint8Array(libcmsn.HEAPU8.subarray(ptr, ptr + len));
    return array;
  }

  async writeData(data, ack) {
    if (!this.isConnected) {
      this.logWarn(`Device is not connected.`);
      return;
    }
    try {
      await cmsnSDK.adapter.writeData(this.id, this.toUint8Array(data), ack == true);
    } catch (e) {
      CrimsonLogger.i(e);
    }
  }

  async writeCmd(cmd, cb) {
    if (!this.isConnected) {
      this.logWarn(`Device is not connected.`);
      return;
    }
    if (!this.paired) {
      this.logWarn(`Device is not paired.`);
      return;
    }
    var msgId = libcmsn.cmsn_gen_msg_id();
    var data = libcmsn.cmsn_sys_config_pack(cmd, msgId);
    await this.writeData(data);
    if (cb) msgCallbackMap.set(msgId, cb);
  }

  async pair(cb) {
    if (!this.isConnected) {
      this.logWarn(`Device is not connected.`);
      return;
    }
    const msgId = libcmsn.cmsn_gen_msg_id();
    const uuid = this.pairUuid;
    const pairingMode = this.isInPairingMode == true;
    const data = pairingMode
      ? libcmsn.cmsn_sys_config_pair_pack(uuid, msgId)
      : libcmsn.cmsn_sys_config_validate_pair_info_pack(uuid, msgId);
    this.logMessage(
      pairingMode ? 'pair' : 'check_pair_info',
      `msgId=${msgId}, isInPairingMode=${this.isInPairingMode}, uuid=${uuid}`
    );
    await this.writeData(data);
    const that = this;
    msgCallbackMap.set(msgId, function (success, error) {
      that.paired = true;
      if (cb) cb(success, error);
    });
  }

  async startDataStream(cb) {
    await this.writeCmd(CMD.enum('startDataStream'), cb);
  }

  async stopDataStream(cb) {
    await this.writeCmd(CMD.enum('stopDataStream'), cb);
  }

  async shutdown(cb) {
    await this.writeCmd(CMD.enum('shutdown'), cb);
  }

  async getSystemInfo(cb) {
    if (!this.isConnected) {
      this.logWarn(`Device is not connected.`);
      return;
    }
    if (!this.paired) {
      this.logWarn(`Device is not paired.`);
      return;
    }
    var cmd = CMD.enum('getSystemInfo');
    var msgId = libcmsn.cmsn_gen_msg_id();
    var data = libcmsn.cmsn_sys_config_pack(cmd, msgId);
    await this.writeData(data);
    if (cb) sysInfoCallbackMap.set(msgId, cb);
  }

  async getLeadOffStatus(cb) {
    await this.writeCmd(CMD.enum('getLeadOffStatus'), cb);
  }

  setDataSubscription(enableAttention, enableMeditation, enableSocial) {
    if (!this.devicePtr) {
      CrimsonLogger.e('setDataSubscription, while devicePtr == null');
      return;
    }
    libcmsn.cmsn_set_data_subscription(
      this.devicePtr,
      enableAttention == true,
      enableMeditation == true,
      enableSocial == true
    );
  }

  async enableFilters(enabled) {
    if (!this.devicePtr) {
      CrimsonLogger.e('cmsn_enable_filters, while devicePtr == null');
      return;
    }
    libcmsn.cmsn_enable_filters(this.devicePtr, enabled);
    CrimsonLogger.d('cmsn_enable_filters', enabled);
  }

  async enableImpedanceTest(enabled, cb) {
    if (!this.devicePtr) {
      CrimsonLogger.e('enableImpedanceTest, while devicePtr == null');
      return;
    }
    const msgId = libcmsn.cmsn_gen_msg_id();
    const sampleRate = AFE.SAMPLE_RATE.enum('sr250');
    const dataChannel = AFE.CHANNEL.enum(enabled ? 'both' : 'ch1');
    const rldChannel = AFE.CHANNEL.enum('both');
    const leadOffChannel = AFE.CHANNEL.enum(enabled ? 'both' : 'ch2');
    const leadOffOption = AFE.LEAD_OFF_OPTION.enum(enabled ? 'ac' : 'dc_6na');
    const data = libcmsn.cmsn_config_afe_pack(
      msgId,
      sampleRate,
      dataChannel,
      rldChannel,
      leadOffChannel,
      leadOffOption
    );
    await this.writeData(data);
    CrimsonLogger.d('send afe config, sampleRate:', AFE.SAMPLE_RATE(sampleRate));
    CrimsonLogger.d('dataChannel:', AFE.CHANNEL(dataChannel));
    CrimsonLogger.d('rldChannel:', AFE.CHANNEL(rldChannel));
    CrimsonLogger.d('leadOffChannel:', AFE.CHANNEL(leadOffChannel));
    CrimsonLogger.d('leadOffOption:', AFE.LEAD_OFF_OPTION(leadOffOption));

    libcmsn.cmsn_enable_impedance_test(this.devicePtr, enabled);
    CrimsonLogger.d('cmsn_enable_impedance_test', enabled);
    if (cb) msgCallbackMap.set(msgId, cb);
  }

  async startIMU(sampleRate, cb) {
    if (!this.isConnected) {
      this.logWarn(`Device is not connected.`);
      return;
    }
    if (!this.paired) {
      this.logWarn(`Device is not paired.`);
      return;
    }
    const sr = parseInt(sampleRate);
    if (sr < IMU.SAMPLE_RATE.enum('sr125') || sr > IMU.SAMPLE_RATE.enum('sr833')) {
      this.onError('Invalid sampleRate input, sampleRate should be in (sr125 ~ sr833)');
      return;
    }
    var msgId = libcmsn.cmsn_gen_msg_id();
    var data = libcmsn.cmsn_config_imu_pack(msgId, sr);
    await this.writeData(data);
    if (cb) msgCallbackMap.set(msgId, cb);
  }

  async stopIMU(cb) {
    if (!this.isConnected) {
      this.logWarn(`Device is not connected.`);
      return;
    }
    if (!this.paired) {
      this.logWarn(`Device is not paired.`);
      return;
    }
    var msgId = libcmsn.cmsn_gen_msg_id();
    var data = libcmsn.cmsn_config_imu_pack(msgId, IMU.SAMPLE_RATE.enum('unused'));
    await this.writeData(data);
    if (cb) msgCallbackMap.set(msgId, cb);
  }

  /**
   * setLEDColor
   * @param {(string|number[])} color e.g. string '#FFAABB' or array [255, 0, 0]
   */
  async setLEDColor(color, cb) {
    if (!this.isConnected) {
      this.logWarn(`Device is not connected.`);
      return;
    }
    if (!this.paired) {
      this.logWarn(`Device is not paired.`);
      return;
    }
    if (this.ledColor == color) return;
    // always convert to RGB array
    const rgb = typeof color === 'string' ? hexToRGB(color) : color;
    if (rgb.length !== 3 || !rgb.every((x) => Number.isInteger(x) && x >= 0 && x <= 255)) {
      this.onError(`setLEDColor: invalid RGB input value (${rgb})`);
      return;
    }
    this.ledColor = color;
    this.logMessage(`setLEDColor ${color}`);

    var msgId = libcmsn.cmsn_gen_msg_id();
    var data = libcmsn.cmsn_set_led_color_pack(msgId, ...rgb);
    await this.writeData(data);
    const that = this;
    msgCallbackMap.set(msgId, function (success, error) {
      if (error) that.ledColor = null;
      if (cb) cb(success, error);
    });
  }

  async setDeviceName(name, cb) {
    if (!this.isConnected) {
      this.logWarn(`Device is not connected.`);
      return;
    }
    if (!this.paired) {
      this.logWarn(`Device is not paired.`);
      return;
    }
    if (name.length < 4 || name.length > 18) {
      this.onError('Cannot set device name with length smaller than 4 or longer than 18');
      return;
    }
    var msgId = libcmsn.cmsn_gen_msg_id();
    var data = libcmsn.cmsn_set_device_name_pack(msgId, name);
    await this.writeData(data);
    msgCallbackMap.set(msgId, (success, error) => {
      if (success) this.name = name;
      if (cb) cb(success, error);
    });
  }

  async setSleepIdleTime(secs, cb) {
    if (!this.isConnected) {
      this.logWarn(`Device is not connected.`);
      return;
    }
    if (!this.paired) {
      this.logWarn(`Device is not paired.`);
      return;
    }
    const idelTimeSecs = parseInt(secs);
    if (idelTimeSecs < 0 || idelTimeSecs > 1000) {
      this.onError('Invalid idle time input, idle time should be a int value with in (0~1000)');
      return;
    }
    var msgId = libcmsn.cmsn_gen_msg_id();
    var data = libcmsn.cmsn_set_sleep_pack(msgId, idelTimeSecs);
    await this.writeData(data);
    if (cb) msgCallbackMap.set(msgId, cb);
  }

  async setVibrationIntensity(intensity, cb) {
    if (!this.isConnected) {
      this.logWarn(`Device is not connected.`);
      return;
    }
    if (!this.paired) {
      this.logWarn(`Device is not paired.`);
      return;
    }
    const intensityVal = parseInt(intensity);
    if (intensityVal < 0 || intensityVal > 100) {
      this.onError('Invalid intensity input, intensity should be a int value with in (0~100)');
      return;
    }
    var msgId = libcmsn.cmsn_gen_msg_id();
    var data = libcmsn.cmsn_set_vibration_pack(msgId, intensityVal);
    await this.writeData(data);
    if (cb) msgCallbackMap.set(msgId, cb);
  }
}

module.exports = {
  CrimsonSDK,
  CMSNDeviceListener,
  CMSNDevice,
  cmsnDeviceMap,
};