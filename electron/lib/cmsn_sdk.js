/* eslint-disable require-atomic-updates */
const loadWasm = require('./cmsn');
const { hexToRGB, sleep } = require('./cmsn_utils');
const EventEmitter = require('events');
// const { CMSNDongleAdapter } = require('./cmsn_dongle');
const { CMSNBleAdapter } = require('./cmsn_ble');
const { CMD, CONNECTIVITY, CONTACT_STATE, AFE, IMU, CMSNError, CMSNLogLevel } = require('./cmsn_common');
const debug = require('debug');
const log = debug('cmsn');
const logD = log.extend('debug');
const logI = log.extend('info');
const logW = log.extend('warn');
const logE = log.extend('error');

// Global Variable
const deviceMap = new Map(); // (uuid: string, device)
const msgCallbackMap = new Map(); // (msgId, cb(success, error))
const sysInfoCallbackMap = new Map(); // (msgId, cb(systemInfo, error))
let libcmsn;
let cmsnSDK; //shared instance

class CrimsonSDK extends EventEmitter {
    static arrayToPtr(array) {
        var ptr = libcmsn._malloc(array.byteLength);
        libcmsn.HEAPF32.set(array, ptr/array.BYTES_PER_ELEMENT);
        return ptr;
    }

    static ptrToArray(ptr, length) {
        var array = new Float32Array(length)
        var pos = ptr / 4
        array.set(libcmsn.HEAPF32.subarray(pos, pos + length))
        return array
    }

    /** filter **/
    static createFilter(passEnabled, lowPass, highPass, stopEnabled, lowStop, highStop) {
        if (!libcmsn) return;
        //带通 0.5~250, highPass > lowPass + 5
        if (passEnabled && (lowPass < 0.5 || lowPass > 250 || highPass < 0.5 || highPass > 250 || highPass - lowPass <= 5)) {
            lowPass = 2;
            highPass = 45;
        }
        //带通 0.5~250, highStop > lowStop
        if (stopEnabled && (lowStop < 0.5 || lowStop > 250 || highStop < 0.5 || highStop > 250 || highStop - lowStop <= 0)) {
            lowStop = 49;
            highStop = 51;
        }
        libcmsn.filterPtr = libcmsn.cmsn_create_sdk_filter(passEnabled, lowPass, highPass, stopEnabled, lowStop, highStop);
        logD('createFilter:', libcmsn.filterPtr);
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
        
        if (libcmsn) return;
        libcmsn = await loadWasm({
            onSayHello: (msg) => {
                logI(msg);
                logI('------------- Hello Crimson -------------');
            },
            onLog: (msg) => {
                logI(msg);
            },
            onConfigResp: (msgId, success, error) => {
                const cb = msgCallbackMap.get(msgId);
                if (cb) cb(success, error);
                logD(`onConfigResp, msgId=${msgId}, success=${success}, error=${error}`);
            },
            onSysInfoResp: (msgId, sysInfo, error) => {
                const cb = sysInfoCallbackMap.get(msgId);
                if (cb) cb(sysInfo, error);
            },
            onLeadOff: (deviceId, center, side) => {
                const device = deviceMap.get(deviceId);
                if (device) {
                    logD(`onLeadOff, center=${center}, side=${side}`);
                } else {
                    logE(`${deviceId} unavailable`);
                }
            },
            onSignalQualityWarning: (deviceId, quality) => {
                const device = deviceMap.get(deviceId);
                if (device) {
                    device.logMessage(`onSignalQualityWarning: ${quality}`);
                    device.getLeadOffStatus();
                } else {
                    logE(`${deviceId} unavailable`);
                }
            },
            onContactStateChanged: (deviceId, contactState) => {
                const device = deviceMap.get(deviceId);
                if (device) {
                    if (device.listener && device.listener.onContactStateChanged) device.listener.onContactStateChanged(device, contactState);
                } else {
                    logE(`${deviceId} unavailable`);
                }
            },
            onOrientationChanged: (deviceId, orientation) => {
                const device = deviceMap.get(deviceId);
                if (device) {
                    if (device.listener && device.listener.onOrientationChanged) device.listener.onOrientationChanged(device, orientation);
                } else {
                    logE(`${deviceId} unavailable`);
                }
            },
            onIMUData: (deviceId, imu) => {
                const device = deviceMap.get(deviceId);
                if (device) {
                    if (device.listener && device.listener.onIMUData) device.listener.onIMUData(device, imu);
                } else {
                    logE(`${deviceId} unavailable`);
                }
            },
            onEEGData: (deviceId, eeg) => {
                const device = deviceMap.get(deviceId);
                if (device) {
                    if (device.listener && device.listener.onEEGData) device.listener.onEEGData(device, eeg);
                } else {
                    logE(`${deviceId} unavailable`);
                }
            },
            onBrainWave: (deviceId, stats) => {
                const device = deviceMap.get(deviceId);
                if (device) {
                    if (device.listener && device.listener.onBrainWave) device.listener.onBrainWave(device, stats);
                } else {
                    logE(`${deviceId} unavailable`);
                }
            },
            onAttention: (deviceId, value) => {
                logD('onAttention-----', value);
                const device = deviceMap.get(deviceId);
                if (device) {
                    if (device.listener && device.listener.onAttention) device.listener.onAttention(device, value);
                } else {
                    logE(`${deviceId} unavailable`);
                }
            },
            onMeditation: (deviceId, value) => {
                logD('onMeditation-----', value);
                const device = deviceMap.get(deviceId);
                if (device) {
                    if (device.listener && device.listener.onMeditation) device.listener.onMeditation(device, value);
                } else {
                    logE(`${deviceId} unavailable`);
                }
            },
            onSocialEngagement: (deviceId, value) => {
                logD('onSocialEngagement-----', value);
                const device = deviceMap.get(deviceId);
                if (device) {
                    if (device.listener && device.listener.onSocialEngagement) device.listener.onSocialEngagement(device, value);
                } else {
                    logE(`${deviceId} unavailable`);
                }
            },
        });
        logI('------------- SDK init -------------');

        libcmsn.cmsn_create_device = libcmsn.cwrap('em_create_device', 'number', ['string']);
        libcmsn.cmsn_did_receive_data = libcmsn.cwrap('em_did_receive_data', 'number', ['number', 'array', 'number']);
        libcmsn.cmsn_get_contact_state = libcmsn.cwrap('em_cmsn_get_contact_state', 'number', ['number']);
        libcmsn.cmsn_gen_msg_id = libcmsn.cwrap('em_gen_msg_id', 'number', []);
        libcmsn.cmsn_sys_config_validate_pair_info_pack = libcmsn.cwrap('em_sys_config_validate_pair_info_pack', 'number', ['string']);
        libcmsn.cmsn_sys_config_pair_pack = libcmsn.cwrap('em_sys_config_pair_pack', 'number', ['string']);
        libcmsn.cmsn_sys_config_pack = libcmsn.cwrap('em_sys_config_pack', 'number', ['number']);
        libcmsn.cmsn_config_afe_pack = libcmsn.cwrap('em_config_afe_pack', 'number', ['number', 'number', 'number', 'number']);
        libcmsn.cmsn_config_imu_pack = libcmsn.cwrap('em_config_imu_pack', 'number', ['number', 'number']);
        libcmsn.cmsn_set_device_name_pack = libcmsn.cwrap('em_set_device_name_pack', 'number', ['number', 'string']);
        libcmsn.cmsn_set_led_color_pack = libcmsn.cwrap('em_set_led_color_pack', 'number', ['number', 'number', 'number', 'number']);
        libcmsn.cmsn_set_sleep_pack = libcmsn.cwrap('em_set_sleep_pack', 'number', ['number', 'number']);
        libcmsn.cmsn_set_vibration_pack = libcmsn.cwrap('em_set_vibration_pack', 'number', ['number', 'number']);
        libcmsn.cmsn_enable_impedance_test = libcmsn.cwrap('em_enable_impedance_test', 'null', ['number', 'boolean']);
        libcmsn.cmsn_enable_filters = libcmsn.cwrap('em_enable_filters', 'null', ['number', 'boolean']);
        libcmsn.cmsn_create_sdk_filter = libcmsn.cwrap('em_create_sdk_filter', 'number', ['boolean', 'number', 'number', 'boolean', 'number', 'number']);
        libcmsn.cmsn_get_filter_data = libcmsn.cwrap('em_dev_filter', 'null', ['number', 'number', 'number']);
        libcmsn.cmsn_set_data_subscription = libcmsn.cwrap('em_set_data_subscription', 'number', ['number', 'boolean', 'boolean', 'boolean']);
        libcmsn.cmsn_set_log_level = libcmsn.cwrap('em_set_log_level', 'number', ['number']);
        
        if (logLevel) this.setLogLevel(logLevel);
        await cmsnSDK.initAdapter(useDongle);

        return cmsnSDK;
    }

    /** process.onExit **/
    static async dispose() {
        deviceMap.forEach((d, _) => {
            d.disconnect();
        });
        await sleep(200);
        if (!cmsnSDK) return;
        if (cmsnSDK.adapter) cmsnSDK.adapter.dispose();
        cmsnSDK = null;
        await sleep(300);
    }

    static setLogLevel(level) {
        logI('[CMSN]', 'setLogLevel', level);
        if (level >= 0 && level < 4) {
            libcmsn.cmsn_set_log_level(level);

            const log_level_arr = ['debug', 'info', 'warn', 'error'];
            const cmsn_log_namespaces = log_level_arr.slice(level).map(e => `cmsn:${e}*`).join(',');
            var namespaces = debug.namespaces;
            if (namespaces) debug.enable(`${namespaces}, ${cmsn_log_namespaces}`);
            else debug.enable(`${cmsn_log_namespaces}`);
            console.log('debug.namespaces', debug.namespaces);
        } else {
            debug.disable();
            libcmsn.cmsn_set_log_level(CMSNLogLevel.enum('none'));
        }
        // logD.log = console.debug.bind(console);
        // logI.log = console.info.bind(console);
        // logW.log = console.warn.bind(console);
        // logE.log = console.error.bind(console);
    }

    constructor() {
        super();
        this.scanning = false;
    }

    async initAdapter(useDongle) {
        if (this.adapter) {
            logI('dispose old adapter...');
            this.adapter.dispose();
            this.adapter = null;
            await sleep(1500);
        }
        logI('useDongle', useDongle);
        const adapter = new CMSNBleAdapter();
        // var adapter;
        // if (useDongle) {
        //     const { CMSNDongleAdapter } = require('../src/cmsn_dongle');
        //     adapter = new CMSNDongleAdapter();
        // } else {
        //     const { CMSNBleAdapter } = require('./cmsn_ble');
        //     adapter = new CMSNBleAdapter();
        // }
        try {
            const that = this;
            await adapter.initAdapter({
                onError: function (error) {
                    logE('[CMSN ERROR]:', error);
                    that.emit('error', error);
                },
                onAdapterAvailable: function () {
                    logI('onAdapterAvailable');
                    that.emit('onAdapterAvailable');
                },
            });
        } catch (error) {
            logE('initAdapter error', error);
        }
        this.adapter = adapter;
    }

    /** Scan BLE Device **/
    async startScan(cb) {
        if (this.scanning) {
            logE('Already scanning for Crimson devices.');
            return;
        }

        try {
            logI('start scanning...');
            const adapter = cmsnSDK.adapter;
            await adapter.startScan(p => {
                if (this.scanning) cb(new CMSNDevice(p));
            });
            this.scanning = true;
            logI(`started scanning.`);

        } catch (error) {
            logE('start scanning failed.', error);
            this.emitError(CMSNError.enum('scan_error'));
        }
    }

    /** Stop scan BLE Device **/
    async stopScan() {
        if (!this.scanning) {
            logW('stop scanning, while no instance scanning for Crimson devices.');
            return;
        }

        try {
            logI('stop scanning...');
            await cmsnSDK.adapter.stopScan();
            this.scanning = false;
            logI(`stopped scanning.`);

        } catch (error) {
            logE(`stop scanning failed.`);
            logE(error);
        }
    }
}

const availableCallbacks = {
    'onError': '(CMSNDevice, Error)=>Void',
    'onConnectivityChanged': '(CMSNDevice, Connectivity)=>Void',
    'onDeviceInfoReady': '(CMSNDevice, DeviceInfo)=>Void',
    'onContactStateChanged': '(CMSNDevice, ContactState)=>Void',
    'onOrientationChanged': '(CMSNDevice, Orientation)=>Void',
    'onIMUData': '(CMSNDevice, IMUData)=>Void',
    'onEEGData': '(CMSNDevice, EEGData)=>Void',
    'onBrainWave': '(CMSNDevice, BrainWave)=>Void',
    'onAttention': '(CMSNDevice, Float)=>Void',
    'onMeditation': '(CMSNDevice, Float)=>Void',
    'onSocialEngagement': '(CMSNDevice, Float)=>Void',
};

class CMSNDeviceListener {
    constructor(callbacks) {
        const cbs = callbacks ? callbacks : {};
        for (const [key, cb] of Object.entries(cbs)) {
            if (key in availableCallbacks) {
                if (typeof cb == 'function') this[key] = cb;
                else logE(`ERROR: Callback for ${key} is not a function, should be ${CMSNDeviceListener.availableCallbacks[key]}`);
            } else logE(`ERROR:${key} is not an option for ${this}`);
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
        logI(this.name, message);
    }
    logWarn(message) {
        logW(`[WARN] [${this.name}]`, message);
    }
    logError(message) {
        logE(`[ERROR] [${this.name}]`, message);
    }

    get description() {
        return `${this.name}], id=${this.id}, isInPairingMode=${this.isInPairingMode}, rssi=${this.rssi}, batteryLevel=${this.batteryLevel}`;
    }

    /**
     * @param {CONNECTIVITY} connectivity
     */
    get connectivity() { return this._connectivity; }
    set connectivity(connectivity) {
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

    get isDisconnected() { return this._connectivity == undefined || this._connectivity == CONNECTIVITY.enum('disconnected'); }
    get isDisconnecting() { return this._connectivity == CONNECTIVITY.enum('disconnecting'); }
    get isConnecting() { return this._connectivity == CONNECTIVITY.enum('connecting'); }
    get isConnected() { return this._connectivity == CONNECTIVITY.enum('connected'); }

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

    disconnect() {
        if (this.isDisconnected || this.isDisconnecting) {
            this.logWarn(`Device is already disconnected or disconnecting`);
        } else {
            this.logMessage(`disconnect...`);
            cmsnSDK.adapter.disconnect(this.id);
        }
        if (deviceMap.has(this.id)) deviceMap.delete(this.id);
    }

    connect() {
        if (!this.devicePtr) {
            this.devicePtr = libcmsn.cmsn_create_device(this.id);
            deviceMap.set(this.id, this);

            const that = this;
            this.peripheral.onReceiveData = (buffer) => {
                // if (that.paired) {
                //     logD('onReceiveData', buffer.length);
                //     logD('onReceiveData', buffer);
                //     return;
                // }
                libcmsn.cmsn_did_receive_data(that.devicePtr, buffer, buffer.length);
            };
            this.peripheral.onConnectivityChanged = (connectivity) => {
                that.connectivity = connectivity;
            };
            cmsnSDK.adapter.startListen(this.peripheral);
        }
        if (!this.isDisconnected) {
            this.onError(`The device is not disconnected when calling connect`);
            return;
        }

        cmsnSDK.adapter.connect(this.id);
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
            logI(e);
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
        const data = pairingMode ?
            libcmsn.cmsn_sys_config_pair_pack(uuid, msgId) :
            libcmsn.cmsn_sys_config_validate_pair_info_pack(uuid, msgId);
        this.logMessage(pairingMode ? 'pair' : 'check_pair_info', `msgId=${msgId}, isInPairingMode=${this.isInPairingMode}, uuid=${uuid}`);
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
            logE('setDataSubscription, while devicePtr == null');
            return;
        }
        libcmsn.cmsn_set_data_subscription(this.devicePtr, enableAttention == true, enableMeditation == true, enableSocial == true);
    }

    async enableFilters(enabled) {
        if (!this.devicePtr) {
            logE('cmsn_enable_filters, while devicePtr == null');
            return;
        }
        libcmsn.cmsn_enable_filters(this.devicePtr, enabled);
        logD('cmsn_enable_filters', enabled);
    }

    async enableImpedanceTest(enabled, cb) {
        if (!this.devicePtr) {
            logE('enableImpedanceTest, while devicePtr == null');
            return;
        }
        const msgId = libcmsn.cmsn_gen_msg_id();
        const sampleRate = AFE.SAMPLE_RATE.enum('sr250');
        const dataChannel = AFE.CHANNEL.enum(enabled ? 'both' : 'ch1');
        const rldChannel = AFE.CHANNEL.enum('both');
        const leadOffChannel = AFE.CHANNEL.enum(enabled ? 'both' : 'ch2');
        const leadOffOption = AFE.LEAD_OFF_OPTION.enum(enabled ? 'ac' : 'dc_6na');
        const data = libcmsn.cmsn_config_afe_pack(msgId, sampleRate, dataChannel, rldChannel, leadOffChannel, leadOffOption);
        await this.writeData(data);
        logD('send afe config, sampleRate:', AFE.SAMPLE_RATE(sampleRate));
        logD('dataChannel:', AFE.CHANNEL(dataChannel));
        logD('rldChannel:', AFE.CHANNEL(rldChannel));
        logD('leadOffChannel:', AFE.CHANNEL(leadOffChannel));
        logD('leadOffOption:', AFE.LEAD_OFF_OPTION(leadOffOption));
        
        libcmsn.cmsn_enable_impedance_test(this.devicePtr, enabled);
        logD('cmsn_enable_impedance_test', enabled);
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
            this.onError("Invalid sampleRate input, sampleRate should be in (sr125 ~ sr833)");
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
        const rgb = typeof(color) === 'string' ? hexToRGB(color) : color;
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
            this.onError("Cannot set device name with length smaller than 4 or longer than 18");
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
            this.onError("Invalid idle time input, idle time should be a int value with in (0~1000)");
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
            this.onError("Invalid intensity input, intensity should be a int value with in (0~100)");
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
    deviceMap,
};