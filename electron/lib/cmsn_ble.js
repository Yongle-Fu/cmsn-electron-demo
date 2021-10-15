/* eslint-disable require-atomic-updates */
const node_ble = require('cmsn-noble');
const { textDecoder } = require('./cmsn_utils');
const { CONNECTIVITY, CMSNError, BLE_UUID } = require("./cmsn_common");
const debug = require('debug');
const log = debug('cmsn');
const logD = log.extend('debug:ble');
const logI = log.extend('info:ble');
const logW = log.extend('warn:ble');
const logE = log.extend('error:ble');

const peripheralMap = new Map(); // (uuid: string, peripheral)

class CMSNBleAdapter {
    logMessage(name, message) {
        logI(name, message);
    }
    logWarn(name, message) {
        logW(`[WARN] [${name}]`, message);
    }
    logError(name, message) {
        logE(`[ERROR] [${name}]`, message);
    }

    initAdapter(listener) {
        if (!listener) return;
        const that = this;
        node_ble.on('stateChange', state => {
            logI('ble state change to', state);
            if (state === 'poweredOn') {
                that.available = true;
                if (listener.onAdapterAvailable) listener.onAdapterAvailable();
            } else {
                that.available = false;
                if (listener.onError) listener.onError(CMSNError.enum('ble_power_off'));
            }
        });
    }

    startListen(peripheral) {
        peripheralMap.set(peripheral.address, peripheral);
        peripheral.on('disconnect', () => {
            this.reset(peripheral);
            if (peripheral.onConnectivityChanged) peripheral.onConnectivityChanged(CONNECTIVITY.enum('disconnected'));
        });
    }

    reset(peripheral) {
        peripheral.dataStreamCharacteristicWrite = undefined;
        if (peripheral.dataStreamCharacteristicNotify) {
            peripheral.dataStreamCharacteristicNotify.notify(false);
            peripheral.dataStreamCharacteristicNotify = undefined;
        }
        if (peripheral.batteryLevelCharacteristic) {
            peripheral.batteryLevelCharacteristic.notify(false);
            peripheral.batteryLevelCharacteristic = undefined;
        }
    }

    disconnect(address) {
        const peripheral = peripheralMap.get(address);
        if (!peripheral) {
            logW(`[${peripheral.name}] ${peripheral.address} doesn't exists when disconnect`);
            return;
        }
        if (peripheralMap.has(address)) peripheralMap.delete(address);
        this.reset(peripheral);
        try {
            peripheral.disconnect();
        } catch (error) {
            logW('peripheral.disconnect error');
        }
    }

    connect(address) {
        const peripheral = peripheralMap.get(address);
        if (!peripheral) {
            logW(`[${peripheral.name}] ${peripheral.address} doesn't exists when connect`);
            return;
        }
        if (peripheral.onConnectivityChanged) peripheral.onConnectivityChanged(CONNECTIVITY.enum('connecting'));
        logI('connecting...', address);
        peripheral.removeAllListeners('servicesDiscover');
        peripheral.connect(async error => {
            if (error) { this.logError(peripheral.name, 'connect error'); return; }

            this.logMessage(peripheral.name, 'discoverServices...');
            try {
                const services = await this.discoverServices(peripheral);
                logD('services', services);
                for (let service of services) {
                    const characteristics = await this.getCharacteristics(peripheral, service);
                    await this.onDiscoverCharacteristics(peripheral, characteristics);
                }
                this.onDataStreamCharacteristicReady(peripheral);
            } catch (error) {
                logW('discoverServices error');
            }
        });
    }

    discoverServices(peripheral) {
        // return peripheral.discoverServicesAsync();
        return new Promise((resolve, reject) => {
            peripheral.discoverServices([
                BLE_UUID.SERVICE_UUID_DATA_STREAM,
                BLE_UUID.SERVICE_UUID_DEVICE_INFORMATION,
                BLE_UUID.SERVICE_UUID_BATTERY_LEVEL,
            ].map(e=>e.toLowerCase()), (error, services) => {
                if (error) {
                    logE(error);
                    reject(Error(`[${peripheral.name}] Error discovering services: ${JSON.stringify(error)}.`));
                } else resolve(services);
            });
        });
    }

    getCharacteristics(peripheral, service) {
        return new Promise((resolve, reject) => {
            if (peripheral.state !== 'connected') {
                reject(Error(`[${peripheral.name}], device state changed to ${peripheral.state}`));
                return;
            }
            this.logMessage(peripheral.name, '> Service: ' + service.uuid + ' discoverCharacteristics...');
            try {
                service.discoverCharacteristics([
                    BLE_UUID.CHARACTERISTIC_UUID_DATA_STREAM_NOTIFY,
                    BLE_UUID.CHARACTERISTIC_UUID_DATA_STREAM_WRITE,
                    BLE_UUID.CHARACTERISTIC_UUID_BATTERY_LEVEL,
                    BLE_UUID.CHARACTERISTIC_UUID_MANUFACTURER_NAME,
                    BLE_UUID.CHARACTERISTIC_UUID_MODEL_NUMBER,
                    BLE_UUID.CHARACTERISTIC_UUID_SERIAL_NUMBER,
                    BLE_UUID.CHARACTERISTIC_UUID_FIRMWARE_REVISION,
                    BLE_UUID.CHARACTERISTIC_UUID_HARDWARE_REVISION,
                ].map(e=>e.toLowerCase()), (error, characteristics) => {
                    if (error) {
                        this.logWarn(peripheral.name, error);
                        reject(Error(`[${peripheral.name}], discoverCharacteristics error=${error}`));
                    } else resolve(characteristics);
                });
            } catch (error) {
                logW('discoverCharacteristics error');
            }
        });
    }

    enableNotification(characteristic, enabled) {
        return new Promise((resolve, reject) => {
            characteristic.notify(enabled, error => {
                if (error) reject(Error(`enableNotification failed, error: ${ error }`));
                else resolve();
            });
        });
    }

    readCharacteristicValue(characteristic) {
        return new Promise((resolve, reject) => {
            characteristic.read((error, buffer) => {
                if (error) reject(Error(`readCharacteristicValue failed, error: ${ error }`));
                else resolve(buffer);
            });
        });
    }

    async readCharacteristicString(characteristic) {
        try {
            let value = await this.readCharacteristicValue(characteristic);
            return textDecoder.decode(value);
        } catch (e) {
            logW(`readCharacteristicString error=${JSON.stringify(e)}.`);
        }
        return '';
    }

    async onDiscoverCharacteristics(peripheral, characteristics) {
        for (let characteristic of characteristics) {
            if (peripheral.state !== 'connected') {
                this.logWarn(peripheral.name, 'device state changed to ' + peripheral.state);
                return;
            }
            logD(peripheral.name, '>> Characteristic: ' + characteristic);
            switch (characteristic.uuid.toUpperCase()) {
            case BLE_UUID.CHARACTERISTIC_UUID_DATA_STREAM_WRITE:
                peripheral.dataStreamCharacteristicWrite = characteristic;
                break;

            case BLE_UUID.CHARACTERISTIC_UUID_DATA_STREAM_NOTIFY:
                peripheral.dataStreamCharacteristicNotify = characteristic;
                characteristic.on('read', (buffer, _) => {
                    if (peripheral.onReceiveData) peripheral.onReceiveData(buffer);
                });
                try {
                    await this.enableNotification(characteristic, true);
                    this.logMessage('data stream notification enabled');
                } catch (error) {
                    this.logError('enabling data stream notification failed', error);
                }
                break;

            case BLE_UUID.CHARACTERISTIC_UUID_BATTERY_LEVEL:
                peripheral.batteryLevelCharacteristic = characteristic;
                characteristic.on('read', (buffer, _) => {
                    if (buffer.byteLength > 0) {
                        peripheral.batteryLevel = buffer[0];
                        this.logMessage(peripheral.name, '> Battery Level is ' + peripheral.batteryLevel + '%');
                    }
                });
                try {
                    await this.enableNotification(characteristic, true);
                    this.logMessage('battery level notification enabled');
                } catch (error) {
                    this.logError('enabling battery level notification failed', error);
                }
                characteristic.read(); // read once battery level
                break;

            case BLE_UUID.CHARACTERISTIC_UUID_MANUFACTURER_NAME:
                peripheral.manufacturer_name = await this.readCharacteristicString(characteristic);
                this.logMessage(peripheral.name, '> manufacturer_name: ' + peripheral.manufacturer_name);
                break;
            case BLE_UUID.CHARACTERISTIC_UUID_MODEL_NUMBER:
                peripheral.model_number = await this.readCharacteristicString(characteristic);
                this.logMessage(peripheral.name, '> model_number: ' + peripheral.model_number);
                break;
            case BLE_UUID.CHARACTERISTIC_UUID_SERIAL_NUMBER:
                peripheral.serial_number = await this.readCharacteristicString(characteristic);
                this.logMessage(peripheral.name, '> serial_number: ' + peripheral.serial_number);
                break;
            case BLE_UUID.CHARACTERISTIC_UUID_HARDWARE_REVISION:
                peripheral.hardware_revision = await this.readCharacteristicString(characteristic);
                this.logMessage(peripheral.name, '> hardware_revision: ' + peripheral.hardware_revision);
                break;
            case BLE_UUID.CHARACTERISTIC_UUID_FIRMWARE_REVISION:
                peripheral.firmware_revision = await this.readCharacteristicString(characteristic);
                this.logMessage(peripheral.name, '> firmware_revision: ' + peripheral.firmware_revision);
                break;
            default:
                break;
            }
        }
    }

    onDataStreamCharacteristicReady(peripheral) {
        if (peripheral.state !== 'connected') {
            this.logError(peripheral.name, 'device state changed to ' + peripheral.state);
            return;
        }
        if (peripheral.dataStreamCharacteristicNotify && peripheral.dataStreamCharacteristicWrite) {
            if (peripheral.onConnectivityChanged) peripheral.onConnectivityChanged(CONNECTIVITY.enum('connected'));
        } else {
            this.logError(peripheral.name, 'discoverServices error, cannot get dataStreamCharacteristicNotify or dataStreamCharacteristicWrite');
        }
    }

    writeData(address, data, ack) {
        return new Promise((resolve, reject) => {
            const peripheral = peripheralMap.get(address);
            if (!peripheral) {
                logW(`[${peripheral.name}] ${peripheral.address} doesn't exists when writeData`);
                reject(Error('cannot found device when writeData'));
                return;
            }
            if (!peripheral.dataStreamCharacteristicWrite) {
                this.logError(peripheral.name, 'dataStreamCharacteristicWrite is unavailable');
                reject(Error('dataStreamCharacteristicWrite is unavailable'));
                return;
            }
            const withoutResponse = ack !== true;
            peripheral.dataStreamCharacteristicWrite.write(Buffer.from(data), withoutResponse, error => {
                if (error) {
                    logW(peripheral.name, 'write data error', error);
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    startScan(cb) {
        return new Promise((resolve, reject) => {
            if (node_ble.state === 'poweredOn') {
                this._startScan(cb, resolve, reject);
                return;
            }
            node_ble.once('stateChange', (state) => {
                if (state === 'poweredOn') {
                    this._startScan(cb, resolve, reject);
                } else {
                    reject(Error('bluetooth state: ' + state));
                }
            });
        });
    }

    _startScan(cb, resolve, reject) {
        try {
            // NOTE: scan filter by serviceUuids can't works on Windows, so use scan filter by manufacturerData 0x5242 instead.
            node_ble.startScanning([], true); //allowDuplicates
            CMSNBleAdapter.onFoundDevcie = cb;
            this.onStartScan();
            resolve();
        } catch (error) {
            reject(Error(`BLE startScan error: ${error}.`));
        }
    }

    stopScan() {
        return new Promise((resolve, _reject) => {
            node_ble.stopScanning(() => resolve());
            this.onStopScan();
        });
    }

    dispose() { this.stopScan(); }

    onStartScan() {
        if (CMSNBleAdapter.scanObserved) return;
        CMSNBleAdapter.scanObserved = true;

        node_ble.on('discover', async (p) => {
            //mock headband
            if (p.advertisement && p.advertisement.localName && p.advertisement.localName.startsWith('CM_')) {
                p.name = p.advertisement.localName;
                p.batteryLevel = 66;
                p.isInPairingMode = true;
                logI(`Discovered [${p.name}] addressType=${p.addressType} address=${p.address} rssi=${p.rssi}`);
                if (CMSNBleAdapter.onFoundDevcie) CMSNBleAdapter.onFoundDevcie(p);
                return;
            }
            
            const manufacturerData = p.advertisement.manufacturerData;
            if (manufacturerData && manufacturerData.byteLength >= 4) {
                // NOTE: scan filter by serviceUuids can't works on Windows, so use scan filter by manufacturerData 0x5242 instead.
                if (manufacturerData[0] == 0x42 && manufacturerData[1] == 0x52) {
                    p.name = p.advertisement.localName;
                    p.batteryLevel = manufacturerData[2];
                    p.isInPairingMode = manufacturerData[3] == 1;

                    //mock headband
                    /*
                    if (p.name == undefined && p.isInPairingMode) {
                        logI(p);
                        p.name = 'CM_' + p.id;
                    } 
                    */

                    logD(`Discovered [${p.name}] addressType=${p.addressType} address=${p.address} rssi=${p.rssi} batteryLevel=${p.batteryLevel} isInPairingMode=${p.isInPairingMode}`);
                    if (CMSNBleAdapter.onFoundDevcie) CMSNBleAdapter.onFoundDevcie(p);
                }
            }
        });
    }

    onStopScan() {
        if (!CMSNBleAdapter.scan) return;
        CMSNBleAdapter.scanObserved = false;

        node_ble.removeAllListeners('discover');
    }
}

CMSNBleAdapter.scanObserved = false;
module.exports = {
    CMSNBleAdapter
};