/* eslint-disable require-atomic-updates */
const { AdapterFactory } = require('cmsn-nrf-ble-driver-js');
const { textDecoder, sleep } = require('./cmsn_utils');
const DeviceLister = require('cmsn-nrf-device-lister');
const { CMSNError, BLE_UUID, CONNECTIVITY } = require('./cmsn_common');
const debug = require('debug');
const log = debug('cmsn');
const logD = log.extend('debug:dongle');
const logI = log.extend('info:dongle');
const logW = log.extend('warn:dongle');
const logE = log.extend('error:dongle');

const peripheralMap = new Map(); // (uuid: string, peripheral)
const adapterFactory = AdapterFactory.getInstance(undefined, { enablePolling: false });
const lister = new DeviceLister({ serialport: true, nordicUsb: true });

class CMSNDongleAdapter {
    startListen(peripheral) {
        peripheralMap.set(peripheral.address, peripheral);
    }

    dispose() {
        logI('closeAdapter');
        if (!this.adapter) return;
        if (this.dongleScanner) this.dongleScanner.stop();
        this.adapter.close(error => {
            if (error) logI(`adapter close error ${error}`);
            else logI('adapter Closed');
        });
    }

    async initAdapter(listener) {
        if (this.adapter) return;

        try {
            const that = this;
            lister.on('error', function (error) {
                if (error) logE('on NordicUsb dongle error:', error.errorCode, error.message);
                else return;

                if (error.usb) {
                    logE('Error originated from USB device ' +
                        'VID: ' + error.usb.deviceDescriptor.idVendor + ' ' +
                        'PID: ' + error.usb.deviceDescriptor.idProduct);
                } else return;
                
                if (error.serialport) {
                    logE('Error originated from serial port device at', error.serialport.path);
                }
            });
            lister.on('conflated', async function(deviceMap) {
                logI('found NordicUsb dongle size:', deviceMap.size);
                if (deviceMap.size > 0) {
                    if (!that.selectedDevice) {
                        that.selectedDevice = deviceMap.values().next().value; 
                        logI(that.selectedDevice);
                        const adapter = adapterFactory.createAdapter('v5', that.selectedDevice.serialport.path, '');
                        that.adapter = adapter;
                        that.setupAdapterListeners();
                        await that.openAdapter();
                        logI('Opened adapter.');
                        that.available = true;
                        if (listener.onAdapterAvailable) listener.onAdapterAvailable();
                    }
                } else {
                    if (that.selectedDevice) {
                        that.selectedDevice = null;
                        that.adapter = null;
                        that.available = false;
                        if (listener.onError) listener.onError(CMSNError.enum('dongle_unavailable'));
                    }
                }
            });
            logI('Start discovering NordicUsb dongle...');
            lister.start();
            this.dongleScanner = lister;
        } catch (error) {
            lister.stop();
            logE(error); //TODO: callback
        }
    }

    openAdapter() {
        const adapter = this.adapter;
        return new Promise((resolve, reject) => {
            logI(`Opening adapter with ID: ${adapter.instanceId}...`);
            // Opening adapter fails occasionally when trying to open right after the device has been set up. 
            // Applying this setTimeout hack, so that the port / devkit has some time to clean up before we open.
            setTimeout(() => {
                adapter.open({ logLevel: 'error', enableBLE: true }, error => {
                    if (error) {
                        reject(Error(`Error opening adapter: ${error}.`));
                        return;
                    }
                    resolve();
                });
            }, 500);
        });
    }

    setupAdapterListeners() {
        const adapter = this.adapter;
        adapter.removeAllListeners();

        // Handling error and log message events from the adapter
        adapter.on('error', error => { logE({ error: `${JSON.stringify(error, null, 1)}.` }); });
        adapter.on('warning', error => { logW({ warning: `${JSON.stringify(error, null, 1)}.` }); });
        adapter.on('logMessage', (severity, message) => { if (severity > 3) logI(message); });

        // Listen to adapter changes
        adapter.on('stateChanged', state => {
            logI(`[${state.instanceId}] stateChanged => bleEnabled:${state.bleEnabled}, scanning:${state.scanning}, connecting:${state.connecting}`);
            // stateChanged => {
            //     "_instanceId": "./dev/tty.usbmodemC30D5FE66C862", "_port": "/dev/tty.usbmodemC30D5FE66C862", "_address": null, "_addressType": null, "baudRate": 1000000, "parity": "none", "flowControl": "none",
            //     "opening": true, "available": false, "bleEnabled": false, "scanning": false, "advertising": false, "connecting": false, "name": null, "firmwareVersion": null
            // }
            // stateChanged => {
            //     "_instanceId": "./dev/tty.usbmodemC30D5FE66C862", "_port": "/dev/tty.usbmodemC30D5FE66C862", "_address": "C3:0D:5F:E6:6C:86", "_addressType": "BLE_GAP_ADDR_TYPE_RANDOM_STATIC", "baudRate": 1000000, "parity": "none", "flowControl": "none",
            //     "opening": false, "available": true, "bleEnabled": true, "scanning": true, "advertising": false, "connecting": false, "name": "nRF5x", "firmwareVersion": { "version_number": 9, "company_id": 89, "subversion_number": 165 }
            // }
        });
        adapter.on('status', status => {
            logI(`adapter status, ${JSON.stringify(status)}`);
            // if (status.name === "IO_RESOURCES_UNAVAILABLE") {
            // else if (status.name === "PKT_SEND_MAX_RETRIES_REACHED") { //tips 插拔dongle
            // else if (status.name === "RESET_PERFORMED") {
            // else if (status.name === "CONNECTION_ACTIVE") { //open done
            // }
        });

        adapter.on('scanTimedOut', () => logI('scanTimedOut'));
        adapter.on('deviceDiscovered', peripheral => {
            if (peripheral.adData) {
                /*
                if (peripheral.name == 'CM_666') {
                    peripheral.batteryLevel = 66;
                    peripheral.isInPairingMode = true;
                    logI(`Discovered [${peripheral.name}] address=${peripheral.address} rssi=${peripheral.rssi}`);
                    if (CMSNDongleAdapter.onFoundDevcie) CMSNDongleAdapter.onFoundDevcie(peripheral);
                    return;
                } */
                if (!CMSNDongleAdapter.onFoundDevcie) return;
                
                const manufacturerData = peripheral.adData.BLE_GAP_AD_TYPE_MANUFACTURER_SPECIFIC_DATA;
                // NOTE: scan filter by serviceUuids can't works, so use scan filter by manufacturerData 0x5242 instead.
                if (manufacturerData && manufacturerData.length >= 4 && manufacturerData[0] == 0x42 && manufacturerData[1] == 0x52) {
                    peripheral.batteryLevel = manufacturerData[2];
                    peripheral.isInPairingMode = manufacturerData[3] == 1;

                    // Android mock headband
                    if (peripheral.isInPairingMode && !peripheral.name) {
                        logI(peripheral);
                        peripheral.name = 'CM_' + peripheral.address;
                    }

                    logI(`Discovered [${peripheral.name}] address=${peripheral.address} rssi=${peripheral.rssi} batteryLevel=${peripheral.batteryLevel} isInPairingMode=${peripheral.isInPairingMode}`);
                    if (CMSNDongleAdapter.onFoundDevcie) CMSNDongleAdapter.onFoundDevcie(peripheral);
                }
            }
        });

        adapter.on('attMtuRequest', async(device, mtu) => {
            logI(device.address, 'on attMtuRequest', mtu);
            this.adapter.attMtuReply(device.instanceId, mtu, async(error) => {
                if (error) {
                    logI(device.address,`attMtuReply failed, error=${JSON.stringify(error)}`);
                } else {
                    logI(device.address, `attMtuReply sucees`);
                    await sleep(500); //wait data length request update
                    await this.onDeviceConnected(device);
                }
            });
        });
        adapter.on('attMtuChanged', (device, newMtu) => {
            logI(device.address, 'MTU updated to', newMtu);
        });

        adapter.on('dataLengthUpdateRequest', (device, requestedDataLengthParams) => {
            logD(device.address, 'dataLengthUpdateRequest', requestedDataLengthParams);
            const { max_rx_octets: rx, max_tx_octets: tx } = requestedDataLengthParams;
            const dataLength = Math.max(rx, tx);
            adapter.dataLengthUpdate(device.instanceId, { max_rx_octets: dataLength, max_tx_octets: dataLength }, (error, _updatedDevice) => {
                if (error) {
                    logE(error.message);
                }
            });
        });

        adapter.on('dataLengthUpdated', (device, effective_params) => {
            logI(device.address, 'DataLength updated to', effective_params.effective_params.max_tx_octets);
        });

        adapter.on('connParamUpdateRequest', (device, requestedConnectionParams) => {
            logD(device.address, `[${device.address}] connParamUpdateRequest, ${JSON.stringify(requestedConnectionParams)}`);
        });

        adapter.on('connParamUpdate', (device, _connectionParams) => {
            logD(device.address, `connParamUpdate: ${device.instanceId}.`);
        });

        adapter.on('phyUpdateRequest', (device, requestedPhyParams) => {
            logD(device.address, 'phyUpdateRequest', requestedPhyParams);
        });

        adapter.on('phyUpdated', (device, params) => {
            logD(device.address, 'phyUpdated', params);
        });

        adapter.on('connectTimedOut', deviceAddress => logI(deviceAddress, `connectTimedOut`));

        adapter.on('deviceConnected', async device => {
            logI({ msg: `Device connected, ${device.address} ${device.addressType}` });
            if (device.addressType == 'BLE_GAP_ADDR_TYPE_RANDOM_PRIVATE_RESOLVABLE') {
                await this.onDeviceConnected(device);
            }
        });

        adapter.on('deviceDisconnected', async device => {
            logI({ msg: `Device disconnected, ${device.address}` });
            await this.onDeviceDisconnected(device);
        });

        adapter.on('characteristicValueChanged', characteristic => {
            if (characteristic.uuid === BLE_UUID.CHARACTERISTIC_UUID_DATA_STREAM_NOTIFY) {
                const device = adapter._getDeviceByCharacteristicId(characteristic.instanceId);
                const peripheral = peripheralMap.get(device.address);
                if (!peripheral) {
                    logW(`[${device.address}] doesn't exists when Received Data`);
                    return;
                }
                const data = Uint8Array.from(characteristic.value);
                if (peripheral.onReceiveData) peripheral.onReceiveData(data);

            } else if (characteristic.uuid === BLE_UUID.CHARACTERISTIC_UUID_BATTERY_LEVEL) {
                const device = adapter._getDeviceByCharacteristicId(characteristic.instanceId);
                const peripheral = peripheralMap.get(device.address);
                if (!peripheral) {
                    logW(`[${device.address}] doesn't exists when Received battery level changed`);
                    return;
                }
                const batteryLevel = characteristic.value[0];
                logI(peripheral.address, `> Battery Level: ${batteryLevel}.`);
                peripheral.batteryLevel = batteryLevel;
            }
        });
    }

    startScan(cb) {
        logD('startScan');
        return new Promise((resolve, reject) => {
            if (!this.adapter || !this.adapter.state.bleEnabled) {
                reject(Error(`dongle ble disabled`));
                return;
            }
            const scanParameters = { active: true, interval: 100, window: 50, timeout: 0 };
            CMSNDongleAdapter.onFoundDevcie = cb;
            this.adapter.startScan(scanParameters, error => {
                if (error) {
                    CMSNDongleAdapter.onFoundDevcie = null;
                    reject(Error(`start scanning failed, error: ${ error }`));
                } else {
                    resolve();
                }
            });
        });
    }

    stopScan() {
        return new Promise((resolve, reject) => {
            if (!this.adapter) reject(Error('adapter is null'));
            this.adapter.stopScan(error => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    disconnect(address) {
        const peripheral = peripheralMap.get(address);
        if (!peripheral) {
            logW(`[${address}]`, 'not exists when disconnect');
            return;
        }
        if (peripheral.deviceInstanceId) {
            if (!this.adapter) {
                logW(`[${address}]`, 'adapter is null');
                this.onDeviceDisconnected(peripheral);
            } else {
                this.adapter.disconnect(peripheral.deviceInstanceId, error => {
                    if (error) logE(peripheral.name, 'disconnect error');
                });
            }
        }
        if (peripheralMap.has(address)) peripheralMap.delete(address);
    }

    connect(address) {
        if (!this.adapter) {
            logW(` [${address}] `, 'adapter is null');
            return;
        }
        const peripheral = peripheralMap.get(address);
        if (!peripheral) {
            logW('Could not connect, cannot found peripheral.', peripheral.name);
            return;
        }
        if (this.adapter.state.connecting) {
            logW('Could not connect, another connect is in progress.', peripheral.name);
            return;
        }
        if (peripheral.onConnectivityChanged) peripheral.onConnectivityChanged(CONNECTIVITY.enum('connecting'));
        logI(`Connecting to`, peripheral.name, peripheral.address, peripheral.addressType);
        const options = {
            scanParams: { active: true, interval: 100, window: 50, timeout: 0 },
            connParams: { min_conn_interval: 20, max_conn_interval: 30, slave_latency: 0, conn_sup_timeout: 3000 },
        };
        // peripheral.addressType
        var type = peripheral.addressType == 'BLE_GAP_ADDR_TYPE_RANDOM_PRIVATE_RESOLVABLE' ? 'BLE_GAP_ADDR_TYPE_RANDOM_STATIC' : peripheral.addressType;
        this.adapter.connect({ address: peripheral.address, type: type }, options, error => {
            if (error) {
                logE(`Error connecting to ${peripheral.name}`, error);
                return;
            }
        });
    }

    async onDeviceDisconnected(device) {
        const peripheral = peripheralMap.get(device.address);
        if (!peripheral) {
            logW(`[${device.address}]`, `doesn't exists onDeviceDisconnected`);
            return;
        }
        peripheral.batteryLevelCharacteristic = null;
        peripheral.dataStreamCharacteristicNotify = null;
        peripheral.dataStreamCharacteristicWrite = null;
        peripheral.deviceInstanceId = null;
        if (this.connectingAddress == peripheral.address) this.connectingAddress = null;
        if (peripheral.onConnectivityChanged) peripheral.onConnectivityChanged(CONNECTIVITY.enum('disconnected'));
    }

    async onDeviceConnected(device) {
        const peripheral = peripheralMap.get(device.address);
        if (!peripheral) {
            logW(`[${device.address}]`, `doesn't exists onDeviceConnected`);
            return;
        }
        try {
            peripheral.deviceInstanceId = device.instanceId;

            logI(peripheral.name, 'discoverServices...');
            const services = await this.discoverServices(device);
            logI(peripheral.name, 'discoverServices done');
            for (let service of services) {
                logD(peripheral.name, `> Service: ${JSON.stringify(service)}`);
                if (service.uuid !== BLE_UUID.SERVICE_UUID_DATA_STREAM &&
                    service.uuid !== BLE_UUID.SERVICE_UUID_BATTERY_LEVEL &&
                    service.uuid !== BLE_UUID.SERVICE_UUID_DEVICE_INFORMATION &&
                    service.uuid !== BLE_UUID.SERVICE_UUID_GENERIC_ACCESS) {
                    continue;
                }

                logD(peripheral.name, 'discoverCharacteristics...');
                const characteristics = await this.getCharacteristics(service);
                for (let characteristic of characteristics) {
                    logD(peripheral.name, `> characteristic.uuid: ${characteristic.uuid}`);
                    switch (characteristic.uuid) {
                    case BLE_UUID.CHARACTERISTIC_UUID_DATA_STREAM_WRITE:
                        peripheral.dataStreamCharacteristicWrite = characteristic;
                        break;
                    case BLE_UUID.CHARACTERISTIC_UUID_DATA_STREAM_NOTIFY:
                        try {
                            peripheral.dataStreamCharacteristicNotify = characteristic;
                            await this.startNotification(characteristic);
                            logI(peripheral.name, 'enabled data stream notification');
                        } catch (error) {
                            logE(peripheral.name, `enabling data stream notification failed.`, error);
                        }
                        break;
                    case BLE_UUID.CHARACTERISTIC_UUID_BATTERY_LEVEL:
                        peripheral.batteryLevelCharacteristic = characteristic;
                        try {
                            await this.startNotification(characteristic);
                            logI(peripheral.name, 'enabled battery level notification');
                        } catch (error) {
                            logE(peripheral.name, `enabling battery level notification failed`, error);
                        }
                        // read once battery level
                        try {
                            var value = await this.readCharacteristicValue(characteristic);
                            peripheral.batteryLevel = value[0];
                            logI(peripheral.name, `batteryLevel=${peripheral.batteryLevel}.`);
                        } catch (e) {
                            logW(peripheral.name, `read batteryLevel error=${JSON.stringify(e)}.`);
                        }
                        break;
                    case BLE_UUID.CHARACTERISTIC_UUID_NRF_DEVICE_NAME:
                        var deviceName = await this.readCharacteristicString(characteristic);
                        logI(peripheral.name, '> device_name:', deviceName);
                        break;
                    case BLE_UUID.CHARACTERISTIC_UUID_MANUFACTURER_NAME:
                        var manufacturer_name = await this.readCharacteristicString(characteristic);
                        logI(peripheral.name, '> manufacturer_name:', manufacturer_name);
                        peripheral.manufacturer_name = manufacturer_name;
                        break;
                    case BLE_UUID.CHARACTERISTIC_UUID_MODEL_NUMBER:
                        var model_number = await this.readCharacteristicString(characteristic);
                        logI(peripheral.name, '> model_number:' + model_number);
                        peripheral.model_number = model_number;
                        break;
                    case BLE_UUID.CHARACTERISTIC_UUID_SERIAL_NUMBER:
                        var serial_number = await this.readCharacteristicString(characteristic);
                        logI(peripheral.name, '> serial_number:', serial_number);
                        peripheral.serial_number = serial_number;
                        break;
                    case BLE_UUID.CHARACTERISTIC_UUID_HARDWARE_REVISION:
                        var hardware_revision = await this.readCharacteristicString(characteristic);
                        logI(peripheral.name, '> hardware_revision:', hardware_revision);
                        peripheral.hardware_revision = hardware_revision;
                        break;
                    case BLE_UUID.CHARACTERISTIC_UUID_FIRMWARE_REVISION:
                        var firmware_revision = await this.readCharacteristicString(characteristic);
                        logI(peripheral.name, '> firmware_revision:', firmware_revision);
                        peripheral.firmware_revision = firmware_revision;
                        break;
                    default:
                        break;
                    }
                }
            }
            if (peripheral.dataStreamCharacteristicNotify && peripheral.dataStreamCharacteristicWrite) {
                logI(peripheral.name, `device reday`);
                if (peripheral.onConnectivityChanged) peripheral.onConnectivityChanged(CONNECTIVITY.enum('connected'));
            } else {
                logE(peripheral.name, 'discoverServices error, cannot get dataStreamCharacteristicNotify or dataStreamCharacteristicWrite');
            }

        } catch (error) {
            if (error) {
                logE(peripheral.name, `discoverServices error`, error);
            }
        }
    }

    discoverServices(device) {
        return new Promise((resolve, reject) => {
            if (!this.adapter) reject(Error('adapter is null'));
            this.adapter.getServices(device.instanceId, (error, services) => {
                if (error) {
                    logE(error);
                    reject(Error(`discovering services`));
                } else resolve(services);
            });
        });
    }

    getCharacteristics(service) {
        return new Promise((resolve, reject) => {
            if (!this.adapter) reject(Error('adapter is null'));
            this.adapter.getCharacteristics(service.instanceId, (error, characteristics) => {
                if (error) {
                    logE(error);
                    reject(Error(`getting Characteristics`));
                } else resolve(characteristics);
            });
        });
    }

    startNotification(characteristic) {
        return new Promise((resolve, reject) => {
            if (!this.adapter) reject(Error('adapter is null'));
            this.adapter.getDescriptors(characteristic.instanceId, (error, _descriptors) => {
                if (error) {
                    reject(Error(`Error discovering notify characteristic's CCCD: ${error}.`));
                } else {
                    this.adapter.startCharacteristicsNotifications(characteristic.instanceId, false, error => {
                        if (error) {
                            reject(Error(`enabled notifications error, characteristic: [${characteristic.uuid}]: ${error}.`));
                        } else {
                            logI(`enabled notifications on the characteristic[${characteristic.uuid}]`);
                            resolve();
                        }
                    });
                }
            });
        });
    }

    async stopNotification(characteristic) {
        logI('stopNotification');
        try {
            await new Promise((resolve, reject) => {
                if (!this.adapter) reject(Error('adapter is null'));
                this.adapter.stopCharacteristicsNotifications(characteristic.instanceId, error => {
                    if (error) {
                        reject(Error(`disabled notifications error, characteristic: [${characteristic.uuid}]: ${error}.`));
                    } else {
                        resolve();
                    }
                });
            });
            logI('stop notification', characteristic.uuid);
        } catch (error) {
            logI(error);
        }
    }

    readCharacteristicValue(characteristic) {
        return new Promise((resolve, reject) => {
            if (!this.adapter) reject(Error('adapter is null'));
            this.adapter.readCharacteristicValue(characteristic.instanceId, (error, value) => {
                if (error) reject(Error(`readCharacteristicValue error=${error}.`));
                else resolve(value);
            });
        });
    }

    async readCharacteristicString(characteristic) {
        try {
            let value = await this.readCharacteristicValue(characteristic);
            return textDecoder.decode(Uint8Array.from(value));
        } catch (e) {
            logW(`readCharacteristicString error=${JSON.stringify(e)}.`);
        }
        return '';
    }

    writeData(address, data, ack) {
        return new Promise((resolve, reject) => {
            if (!this.adapter) reject(Error('adapter is null'));
            const peripheral = peripheralMap.get(address);
            if (!peripheral) {
                logW(`[${address}]`, `doesn't exists when writeData`);
                reject(Error('cannot found device when writeData'));
                return;
            }
            if (!peripheral.dataStreamCharacteristicWrite) {
                logE(peripheral.name, 'dataStreamCharacteristicWrite is unavailable');
                reject(Error('dataStreamCharacteristicWrite is unavailable'));
                return;
            }
            try {
                this.adapter.writeCharacteristicValue(peripheral.dataStreamCharacteristicWrite.instanceId, Array.from(data), ack, error => {
                    if (error) {
                        logW(peripheral.name, 'write data error', error);
                        reject(error);
                    } else {
                        logD('writeCharacteristicValue done');
                        resolve();
                    }
                });
            } catch (error) {
                logW(peripheral.name, 'write data error', error);
                reject(error);
            }
        });
    }
}

module.exports = {
    CMSNDongleAdapter
};