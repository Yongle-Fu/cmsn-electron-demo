// BLE_UUID
const BLE_UUID = {
    BSTAR_SERVICE_UUID_DATA_STREAM: '6E400001B5A3F393E0A9E50E24DCCA9E',
    BSTAR_CHARACTERISTIC_UUID_DATA_STREAM_NOTIFY: '6E400002B5A3F393E0A9E50E24DCCA9E',

    //crimson
    SERVICE_UUID_GENERIC_ACCESS: '1800',
    SERVICE_UUID_DEVICE_INFORMATION: '180A',
    SERVICE_UUID_BATTERY_LEVEL: '180F',
    SERVICE_UUID_DFU: 'FE59',
    SERVICE_UUID_DATA_STREAM: '0D740001D26F4DBB95E8A4F5C55C57A9',

    CHARACTERISTIC_UUID_DFU_CONTROL: '8EC90001F3154F609FB8838830DAEA50',
    CHARACTERISTIC_UUID_DFU_PACKET: '8EC90002F3154F609FB8838830DAEA50',
    CHARACTERISTIC_UUID_DFU_WITHOUT_BONDS: '8EC90003F3154F609FB8838830DAEA50',
    CHARACTERISTIC_UUID_DFU_WITH_BONDS: '8EC90004F3154F609FB8838830DAEA50',
    CHARACTERISTIC_UUID_DATA_STREAM_WRITE: '0D740002D26F4DBB95E8A4F5C55C57A9',
    CHARACTERISTIC_UUID_DATA_STREAM_NOTIFY: '0D740003D26F4DBB95E8A4F5C55C57A9',
    CHARACTERISTIC_UUID_NRF_DEVICE_NAME: '2A00',
    CHARACTERISTIC_UUID_BATTERY_LEVEL: '2A19',
    CHARACTERISTIC_UUID_MANUFACTURER_NAME: '2A29',
    CHARACTERISTIC_UUID_MODEL_NUMBER: '2A24',
    CHARACTERISTIC_UUID_SERIAL_NUMBER: '2A25',
    CHARACTERISTIC_UUID_FIRMWARE_REVISION: '2A26',
    CHARACTERISTIC_UUID_HARDWARE_REVISION: '2A27',

    DESCRIPTOR_UUID_CCCD: '2902',
};

// Enum: 
const CMSNLogLevel = createEnum({
    debug: 0,
    info: 1, //default
    warn: 2,
    error: 3,
    none: 4,
});

/*
get message() {
    switch (this.name) {
    case 'NONE':
        return "Success";
    case 'BLE_UNAVAILABLE':
        return "Bluetooth is unavailable, please check the radio opened";
    case 'DONGLE_DEVICE_UNAVAILABLE':
        return "DONGLE device is unavailable";
    case 'SCAN_ERROR':
        "Start scanning error";
        return this.name; //todo
    default:
        return 'UNKNOWN error';
    }
} */
// Enum: CMSNError
const CMSNError = createEnum({
    none: 0,
    pair_failed: 3,
    validate_info_failed: 4,
    ble_power_off: -1001,
    dongle_unavailable: -1002,
    scan_error: -1003,
});

// Enum: CMD
const CMD = createEnum({
    afeConfig: -1,
    imuConfig: -2,
    unused: 0,
    pair: 1,
    checkPairStatus: 2,
    startDataStream: 3,
    stopDataStream: 4,
    shutdown: 5,
    enterOTA: 6,
    enterFactoryMode: 7,
    restoreFactorySettings: 8,
    setLEDColor: 9,
    setDeviceName: 10,
    setSleepIdleTime: 11,
    setVibrationIntensity: 12,
    getSystemInfo: 13,
    getLeadOffStatus: 14,
});

// Enum: CONNECTIVITY
const CONNECTIVITY = createEnum({
    connecting: 0,
    connected: 1,
    disconnecting: 2,
    disconnected: 3,
});

// Enum: CONTACT_STATE
const CONTACT_STATE = createEnum({
    unknown: 0,
    contact: 1,
    no_contact: 2,
});

// Enum: ORIENTATION
const ORIENTATION = createEnum({
    unknown: 0,
    normal: 1,
    upsideDown: 2,
});

// Enum: AFE.SAMPLE_RATE, AFE.CHANNEL, AFE.LEAD_OFF_OPTION
const AFE = {
    SAMPLE_RATE: createEnum({
        sr125: 0,
        sr250: 1,
        sr500: 2,
        sr1000: 3,
    }),

    CHANNEL: createEnum({
        none: 0,
        ch1: 1,
        ch2: 2,
        both: 3,
    }),

    LEAD_OFF_OPTION: createEnum({
        disabled: 0,
        ac: 1,
        dc_6na: 2,
        dc_22na: 3,
        dc_6ua: 4,
        dc_22ua: 5,
    })
};

// Enum: ACC.SAMPLE_RATE, ACC.OPTION
const ACC = {
    SAMPLE_RATE: createEnum({
        sr1: 0,
        sr10: 1,
        sr25: 2,
        sr50: 3,
        sr100: 4,
        sr200: 5,
    }),

    OPTION: createEnum({
        disabled: 0,
        raw: 1,
        six_d: 2,
    })
};

const IMU = {
    SAMPLE_RATE: createEnum({
        unused: 0,
        sr125: 0x10,
        sr26: 0x20,
        sr52: 0x30,
        sr104: 0x40,
        sr208: 0x50,
        sr416: 0x60,
        sr833: 0x70,
    }),
};

/* Example:
 * const STATE = createEnum({
 * on: 0,
 * off: 1
 * });
 *
 * STATE.ON => 'on'
 * STATE.OFF => 'off'
 *
 * STATE(0) => 'on'
 * STATE(1) => 'off'
 * STATE(2) => Error: unknown input enum: 2.
 *
 * STATE.enum.ON => 0
 * STATE.enum.OFF => 1
 *
 * STATE.enum('on') => 0
 * STATE.enum('off') => 1
 * STATE.enum(null) => Error: unknown input value: null.
 */
function createEnum(input, type = String) {
    // check the input, which should be one-to-one relationship
    let doc = ` ENUM => VALUE (${type.name})\n`;
    doc += ' -----------------------\n';
    const valueMap = new Map();
    const enumMap = new Map();
    for (const v in input) {
        const val = type(v);
        const num = input[val];
        if (enumMap.has(num)) {
            throw Error(`the enum '${num}' is duplicated`);
        }
        valueMap.set(val, num);
        enumMap.set(num, val);
        doc += ` ${num} => ${val}\n`;
    }

    const FN = (num) => {
        if (!enumMap.has(num)) {
            throw Error(`Invalid Enum: ${num}. The enum/value should be:\n${doc}`);
        }
        return enumMap.get(num);
    };

    FN.enum = (val) => {
        if (!valueMap.has(val)) {
            throw Error(`Invalid Value: ${val}. The enum/value should be:\n${doc}`);
        }
        return valueMap.get(val);
    };

    for (const val in input) {
        const symbol = String(val).toUpperCase();
        FN[symbol] = type(val);
        FN.enum[symbol] = input[val];
    }

    return FN;
}

module.exports = {
    BLE_UUID,
    CMSNLogLevel,
    CMSNError,
    CMD,
    CONNECTIVITY,
    CONTACT_STATE,
    ORIENTATION,
    AFE,
    IMU,
    ACC,
};