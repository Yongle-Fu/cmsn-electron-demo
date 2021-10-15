/* eslint-disable no-unused-vars */
const utils = require('./lib/cmsn_utils');
const { CrimsonSDK, CMSNDevice, CMSNDeviceListener, deviceMap } = require('./lib/cmsn_sdk');
const { CONNECTIVITY, CONTACT_STATE, ORIENTATION, CMSNError, CMSNLogLevel } = require('./lib/cmsn_common');
const { BrowserWindow } = require('electron');

const debug = require('debug');
const log = debug('example');
const logD = log.extend('debug');
const logI = log.extend('info');
const logE = log.extend('error');

// 单头环
const TARGET_DEVICE_NAME_ARRAY = ["cmsn_OK"];
const TARGET_DEVICE_COUNT = 1;
// 多头环
// const TARGET_DEVICE_NAME_ARRAY = ['cmsn_OK', 'CM11-0A595', 'CM11-0A084', 'CM11-0A57F'];
// const TARGET_DEVICE_COUNT = TARGET_DEVICE_NAME_ARRAY.length;

const RUNNING_DURATION_MS = 100 * (60 * 1000); // Running the app for 100 minute
exitProgram(RUNNING_DURATION_MS);
async function exitProgram(ms) {
    await (new Promise(resolve => setTimeout(() => {
        logI('Time out');
        resolve();
    }, ms)));
}

// 演示连接单个或多个头环，每次启动应用后扫描设备，扫描到全部设定的设备时则开始连接
async function example_main() {
    debug.enable('example:info,example:error');
    logI('------------- Example Main -------------');
    onCrimsonError = error => {
        logD(error);
    };
    const exampleTargetDevices = new Map(); 
    const exampleFoundDevicesCb = async devices => {
        for (let device of devices) {
            if (exampleTargetDevices.has(device.id)) continue;

            if (utils.array_contains(TARGET_DEVICE_NAME_ARRAY, device.name)) {
                exampleTargetDevices.set(device.id, device);
                logI(`exampleTargetDevices.size=${exampleTargetDevices.size}`);
            }

            if (exampleTargetDevices.size >= TARGET_DEVICE_COUNT) {
                await stopScan();
            
                for (let targetDevice of exampleTargetDevices.values()) {
                    targetDevice.listener = exampleListener;
                    await targetDevice.connect();
                }
                break;
            }
        }
    };
    await startScan(exampleFoundDevicesCb);
}

async function example_dispose() {
    logI({ message: `SIGINT signal received.` });
    await disposeSDK();
    logI('End program');
}

let onCrimsonError = null;
async function runErrorCB(error) {
    if (!error) return;

    var message;
    switch (error) {
    case CMSNError.enum('ble_power_off'):
        message = 'Bluetooth is unavailable, please check the radio is opened';
        message = '蓝牙不可用，请检查蓝牙状态';
        await onAdapterDisabled();
        break;
        case CMSNError.enum('dongle_unavailable'):
        message = 'nRF Dongle is unavailable, please check';
        message = '蓝牙串口设备不可用，请检查设备是否连接良好';
        await onAdapterDisabled();
        break;
    case CMSNError.enum('scan_error'):
        message = 'Start scanning error';
        message = '扫描设备失败，请检查蓝牙串口设备';
        break;
    default:
        console.error('[ERROR]', error);
        return;
    }
    console.error('runErrorCB', error, message);

    if (onCrimsonError) {
        onCrimsonError({success: false, code: error, msg: message});
    }
}

function runDeviceErrorCB(device, error) {
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
    logE(device.name, message, error);

    if (device.onDeviceErrorCB) {
        device.onDeviceErrorCB({code: error, message: message});
    }
}

const exampleListener = new CMSNDeviceListener({
    onError: (device, error) => runDeviceErrorCB(device, error),
    onConnectivityChanged: async (device, connectivity) => { //Connectivity
        logI({ message: `[${device.name}] Connectivity changed to: ${CONNECTIVITY(connectivity)}` });
        startReconnectTimer();

        if (device.isConnected) {
            //await utils.sleep(100);
            device.pair(async (success, error) => {
                if (success) {
                    logI({msg: `[${device.name}] pair success`});
                    device.isInPairingMode = false;
                    if (device.onPairSuccessCB) {
                        device.onPairSuccessCB(device);
                        device.onPairSuccessCB = null;
                    }
                    //StartEEG
                    device.startDataStream(async (success, error) => {
                        if (success) {
                            console.log(device.name, 'EEG data stream started.');
                            //await onTest(device);
                        } else runDeviceErrorCB(device, error);
                    });
                } else runDeviceErrorCB(device, error);
            });
        }
    },
    onDeviceInfoReady: (device, deviceInfo) => { //deviceInfo
        logI(device.name, `Device info is ready:`, deviceInfo);
    },
    onContactStateChanged: (device, contactState) => { //ContactState
        logI(device.name, `Contact state changed to:`, CONTACT_STATE(contactState));
    },
    onOrientationChanged: (device, orientation) => { //Orientation
        logI(device.name, `Orientation changed to:`, ORIENTATION(orientation));
    },
    onIMUData: (device, imu) => { //IMUData
        logD(device.name, `IMU data received:`, imu);
    },
    onEEGData: (device, eeg) => { //EEGData
        // logD(device.name, "EEG data received:", eeg);
        // logI(device.name, "EEG data received:", eeg.eegData.slice(0, 10));
        BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('onDeviceStatusChange', eeg));
        //logI(device.name, "EEG filter data:", CrimsonSDK.getFilterData(eeg.eegData).slice(0, 10));
    },
    onBrainWave: (device, stats) => { //BrainWave
        logD(device.name, "BrainWave data received:", stats);
    },
    onAttention: (device, attention) => { //Float
        logI(device.name, `Attention:`, attention);
    },
    onMeditation: (device, meditation) => { //Float
        logI(device.name, `Meditation:`, meditation);
    },
    onSocialEngagement: (device, value) => { //Float
        logI(device.name, `SocialEngagement:`, value);
    },
});

const useDongle = false;
let cmsnSDK;
const initSDK = async () => {
    console.debug('CrimsonSDK.init');
    if (cmsnSDK) return;

    // eslint-disable-next-line require-atomic-updates
    cmsnSDK = await CrimsonSDK.init(useDongle, CMSNLogLevel.enum('info')); //info/error/warn
    CrimsonSDK.createFilter(true, 2, 45, true, 49, 51);

    cmsnSDK.on('error', e => runErrorCB(e));
    cmsnSDK.on('onAdapterAvailable', async () => {
        var message = useDongle ? 'nRF Dongle is available now' : 'ble adapter is available now';
        message = useDongle ? '蓝牙串口设备已连接' : '蓝牙已开启';
        console.log({ msg: message });
        adapterDisbaled = false;
        await doScan();
    });
    if (cmsnSDK.adapter.available) await doScan();
    console.debug('CrimsonSDK.init done');
};

const disposeSDK = async () => {
    await CrimsonSDK.dispose();
};

var adapterDisbaled = true;
async function onAdapterDisabled() {
    adapterDisbaled = true;
    stopReconnectTimer();
    for (let device of deviceMap.values()) {
        await device.disconnect();
    }
}

/** Scan **/
var onFoundDevicesCB = null; 
async function startScan(cb) {
    logI('startScan');
    onFoundDevicesCB = cb;

    await initSDK();
    if (cmsnSDK.scanning) return;
    if (cmsnSDK.adapter.available) await doScan();
}

async function stopScan(cb) {
    console.log('stopScan');
    onFoundDevicesCB = null;

    if (scanTimer) {
        clearInterval(scanTimer);
        scanTimer = null;
    }
    if (cmsnSDK && cmsnSDK.scanning) await cmsnSDK.stopScan(cb);
}

const scannedDeviceMap = new Map();
var scanTimer;
async function doScan() {
    if (!cmsnSDK || cmsnSDK.scanning) return;
    console.log({ targetDeviceId: targetDeviceId, onFoundDevicesCB: onFoundDevicesCB });
    if (!targetDeviceId && !onFoundDevicesCB) return;

    scannedDeviceMap.clear();
    await cmsnSDK.startScan(async device => {
        logD('[CMSN] found device', device.id, device && device.name);
        scannedDeviceMap.set(device.id, device);

        if (device.id === targetDeviceId) await onFoundTargetDevice(device);
    });

    if (onFoundDevicesCB) {
        if (scanTimer) clearInterval(scanTimer);
        scanTimer = setInterval(() => {
            if (!onFoundDevicesCB) return;
            const curTimestamp = new Date().getTime();
            const devices = Array.from(scannedDeviceMap.values()).filter((e) => curTimestamp - e.timestamp <= 30000);
            logI('[CMSN]: found devices: ', devices.length);
            logD(devices.map((e) => e.description));
            onFoundDevicesCB(devices);
        }, 1000); //invoked per second
    }
}

async function onFoundTargetDevice(device) {
    if (cmsnSDK.scanning) await stopScan();

    device.listener = exampleListener;
    await device.connect();
    // NOTE: default listen attention data stream only
    // device.setDataSubscription(true, false, false); //attention, meditation, socialEngagement
}

/** Connect **/
//连接扫描到的设备
async function connectDevice(device, successCb, errorCb) {
    console.log(`[CMSN], connectDevice`);
    if (device instanceof CMSNDevice) return;

    device.onPairSuccessCB = successCb;
    device.onDeviceErrorCB = errorCb;
    console.log(`[CMSN], connect ${device.id}`, device.name);
    await onFoundTargetDevice(device);
}

//开启扫描，根据设备ID自动重连上次绑定设备, 使用场景：开星果/CFDA
var targetDeviceId = null;
async function connectWithDeviceId(deviceId) {
    console.log(`[CMSN], connectTargetDevice ${deviceId}`);
    if (typeof deviceId !== 'string' || deviceId.length == 0) return;
    targetDeviceId = deviceId;
    await startScan();
}

const disconnect = async (deviceId, cb) => {
    setEnableReconnect(false);
    await stopScan();

    var device = deviceMap.getTime(deviceId);
    if (device) {
        if (utils.isWin64()) device.shutdown(); // Windows下断开连接不及时，故直接发送关机指令
        await device.disconnect();
    }
    if (cb) cb();
};

/** reconnect **/
let enableReconnect = true;
const setEnableReconnect = (enabled) => {
    enableReconnect = enabled;
};

let reconnectTimer = null;
function startReconnectTimer() {
    if (!enableReconnect) return;
    if (reconnectTimer == null) {
        reconnectTimer = setInterval(reconnect, useDongle ? 1000 : 3000);
        logI('started reconnect timer');
    }
}

function stopReconnectTimer() {
    if (reconnectTimer) {
        clearInterval(reconnectTimer);
        logI('stoped reconnect timer');
    }
}

async function reconnect() {
    if (!enableReconnect) return;
    if (adapterDisbaled) return;

    for (let device of deviceMap.values()) {
        if (device.isDisconnected) {
            logI(`[${device.name}] try reconnect ...`);
            await device.connect();
            if (useDongle) break;

        } else if (device.isConnecting) logI(`[${device.name}] connecting ...`);
    }
}

module.exports = {
    example_main, 
    example_dispose,
    initSDK,
    disposeSDK,
    startScan,
    stopScan,
    setEnableReconnect,
    connectWithDeviceId,
    connectDevice,
    disconnect,
};

// async function onTest(device) {
// device.getSystemInfo((systemInfo, error) => {
//     if (systemInfo) logI(JSON.stringify(systemInfo));
//     else device.logError(error);
// }, null);
// device.setSleepIdleTime(900);
// device.setVibrationIntensity(30);
// device.setDeviceName('cmsn_linxin');
// device.setLEDColor('#ff0000');
// device.startIMU(IMU.SAMPLE_RATE.enum('sr104'));
// device.setImpedanceTestMode(true);
// }