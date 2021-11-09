/* eslint-disable require-atomic-updates */
/* eslint-disable indent */
// const { AdapterFactory } = require('cmsn-nrf-ble-driver-js');
const { AdapterFactory } = require('pc-ble-driver-js');
const { textDecoder, sleep } = require('./cmsn_utils');
const DeviceLister = require('cmsn-nrf-device-lister');
const { CMSNError, BLE_UUID, CONNECTIVITY } = require('./cmsn_common');
const CrimsonLogger = require('./cmsn_logger');

const peripheralMap = new Map(); // (uuid: string, peripheral)
const adapterFactory = AdapterFactory.getInstance(undefined, { enablePolling: false });
const lister = new DeviceLister({ serialport: true, nordicUsb: true });

class CMSNDongleAdapter {
  dispose() {
    CrimsonLogger.i('closeAdapter');
    if (!this.adapter) return;
    if (this.dongleScanner) this.dongleScanner.stop();
    this.adapter.close((error) => {
      if (error) CrimsonLogger.i(`adapter close error ${error}`);
      else CrimsonLogger.i('adapter Closed');
    });
  }

  async initAdapter(listener) {
    if (this.adapter) return;

    try {
      const that = this;
      lister.on('error', function (error) {
        if (error) CrimsonLogger.e('on NordicUsb dongle error:', error.errorCode, error.message);
        else return;

        if (error.usb) {
          CrimsonLogger.e(
            'Error originated from USB device ' +
              'VID: ' +
              error.usb.deviceDescriptor.idVendor +
              ' ' +
              'PID: ' +
              error.usb.deviceDescriptor.idProduct
          );
        } else return;

        if (error.serialport) {
          CrimsonLogger.e('Error originated from serial port device at', error.serialport.path);
        }
      });
      lister.on('conflated', async function (cmsnDeviceMap) {
        CrimsonLogger.i('found NordicUsb dongle size:', cmsnDeviceMap.size);
        if (cmsnDeviceMap.size > 0) {
          if (!that.selectedDevice) {
            that.selectedDevice = cmsnDeviceMap.values().next().value;
            CrimsonLogger.i(that.selectedDevice);
            const adapter = adapterFactory.createAdapter('v5', that.selectedDevice.serialport.path, '');
            that.adapter = adapter;
            that.setupAdapterListeners();
            await that.openAdapter();
            CrimsonLogger.i('Opened adapter.');
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
      CrimsonLogger.i('Start discovering NordicUsb dongle...');
      lister.start();
      this.dongleScanner = lister;
    } catch (error) {
      lister.stop();
      CrimsonLogger.e(error); //TODO: callback
    }
  }

  openAdapter() {
    const adapter = this.adapter;
    return new Promise((resolve, reject) => {
      CrimsonLogger.i(`Opening adapter with ID: ${adapter.instanceId}...`);
      // Opening adapter fails occasionally when trying to open right after the device has been set up.
      // Applying this setTimeout hack, so that the port / devkit has some time to clean up before we open.
      setTimeout(() => {
        adapter.open({ logLevel: 'error', enableBLE: true }, (error) => {
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
    adapter.on('error', (error) => {
      CrimsonLogger.e({ error: `${JSON.stringify(error, null, 1)}.` });
    });
    adapter.on('warning', (error) => {
      CrimsonLogger.w({ warning: `${JSON.stringify(error, null, 1)}.` });
    });
    adapter.on('logMessage', (severity, message) => {
      if (severity > 3) CrimsonLogger.i(message);
    });

    // Listen to adapter changes
    adapter.on('stateChanged', (state) => {
      CrimsonLogger.i(
        `[${state.instanceId}] stateChanged => bleEnabled:${state.bleEnabled}, scanning:${state.scanning}, connecting:${state.connecting}`
      );
      // stateChanged => {
      //     "_instanceId": "./dev/tty.usbmodemC30D5FE66C862", "_port": "/dev/tty.usbmodemC30D5FE66C862", "_address": null, "_addressType": null, "baudRate": 1000000, "parity": "none", "flowControl": "none",
      //     "opening": true, "available": false, "bleEnabled": false, "scanning": false, "advertising": false, "connecting": false, "name": null, "firmwareVersion": null
      // }
      // stateChanged => {
      //     "_instanceId": "./dev/tty.usbmodemC30D5FE66C862", "_port": "/dev/tty.usbmodemC30D5FE66C862", "_address": "C3:0D:5F:E6:6C:86", "_addressType": "BLE_GAP_ADDR_TYPE_RANDOM_STATIC", "baudRate": 1000000, "parity": "none", "flowControl": "none",
      //     "opening": false, "available": true, "bleEnabled": true, "scanning": true, "advertising": false, "connecting": false, "name": "nRF5x", "firmwareVersion": { "version_number": 9, "company_id": 89, "subversion_number": 165 }
      // }
    });
    adapter.on('status', (status) => {
      CrimsonLogger.i(`adapter status, ${JSON.stringify(status)}`);
      // if (status.name === "IO_RESOURCES_UNAVAILABLE") {
      // else if (status.name === "PKT_SEND_MAX_RETRIES_REACHED") { //tips 插拔dongle
      // else if (status.name === "RESET_PERFORMED") {
      // else if (status.name === "CONNECTION_ACTIVE") { //open done
      // }
    });

    adapter.on('scanTimedOut', () => CrimsonLogger.i('scanTimedOut'));
    adapter.on('deviceDiscovered', (peripheral) => {
      if (peripheral.adData) {
        // if (peripheral.name == 'CM_666') {
        //     peripheral.batteryLevel = 66;
        //     peripheral.isInPairingMode = true;
        //     CrimsonLogger.i(`Discovered [${peripheral.name}] address=${peripheral.address} rssi=${peripheral.rssi}`);
        //     if (CMSNDongleAdapter.onFoundDevcie) CMSNDongleAdapter.onFoundDevcie(peripheral);
        //     return;
        // }
        if (!CMSNDongleAdapter.onFoundDevcie) return;

        const manufacturerData = peripheral.adData.BLE_GAP_AD_TYPE_MANUFACTURER_SPECIFIC_DATA;
        // NOTE: scan filter by serviceUuids can't works, so use scan filter by manufacturerData 0x5242 instead.
        if (
          manufacturerData &&
          manufacturerData.length >= 4 &&
          manufacturerData[0] == 0x42 &&
          manufacturerData[1] == 0x52
        ) {
          peripheral.batteryLevel = manufacturerData[2];
          peripheral.isInPairingMode = manufacturerData[3] == 1;

          // Android mock headband
          if (peripheral.isInPairingMode && !peripheral.name) {
            CrimsonLogger.i(peripheral);
            peripheral.name = 'CM_' + peripheral.address;
          }

          CrimsonLogger.i(
            `Discovered [${peripheral.name}] address=${peripheral.address} rssi=${peripheral.rssi} batteryLevel=${peripheral.batteryLevel} isInPairingMode=${peripheral.isInPairingMode}`
          );
          if (CMSNDongleAdapter.onFoundDevcie) CMSNDongleAdapter.onFoundDevcie(peripheral);
        }
      }
    });

    adapter.on('attMtuRequest', async (device, mtu) => {
      CrimsonLogger.i(device.address, 'on attMtuRequest', mtu);
      this.adapter.attMtuReply(device.instanceId, mtu, async (error) => {
        if (error) {
          CrimsonLogger.i(device.address, `attMtuReply failed, error=${JSON.stringify(error)}`);
        } else {
          CrimsonLogger.i(device.address, `attMtuReply sucees`);
          await sleep(500); //wait data length request update
          await this.onDeviceConnected(device);
        }
      });
    });
    adapter.on('attMtuChanged', (device, newMtu) => {
      CrimsonLogger.i(device.address, 'MTU updated to', newMtu);
    });

    adapter.on('dataLengthUpdateRequest', (device, requestedDataLengthParams) => {
      CrimsonLogger.d(device.address, 'dataLengthUpdateRequest', requestedDataLengthParams);
      const { max_rx_octets: rx, max_tx_octets: tx } = requestedDataLengthParams;
      const dataLength = Math.max(rx, tx);
      adapter.dataLengthUpdate(
        device.instanceId,
        { max_rx_octets: dataLength, max_tx_octets: dataLength },
        (error, _updatedDevice) => {
          if (error) {
            CrimsonLogger.e(error.message);
          }
        }
      );
    });

    adapter.on('dataLengthUpdated', (device, effective_params) => {
      CrimsonLogger.i(device.address, 'DataLength updated to', effective_params.effective_params.max_tx_octets);
    });

    adapter.on('connParamUpdateRequest', (device, requestedConnectionParams) => {
      CrimsonLogger.d(
        device.address,
        `[${device.address}] connParamUpdateRequest, ${JSON.stringify(requestedConnectionParams)}`
      );
    });

    adapter.on('connParamUpdate', (device, _connectionParams) => {
      CrimsonLogger.d(device.address, `connParamUpdate: ${device.instanceId}.`);
    });

    adapter.on('phyUpdateRequest', (device, requestedPhyParams) => {
      CrimsonLogger.d(device.address, 'phyUpdateRequest', requestedPhyParams);
    });

    adapter.on('phyUpdated', (device, params) => {
      CrimsonLogger.d(device.address, 'phyUpdated', params);
    });

    adapter.on('connectTimedOut', (deviceAddress) => CrimsonLogger.i(deviceAddress, `connectTimedOut`));

    adapter.on('deviceConnected', async (device) => {
      CrimsonLogger.i({ msg: `Device connected, ${device.address} ${device.addressType}` });
      if (device.addressType == 'BLE_GAP_ADDR_TYPE_RANDOM_PRIVATE_RESOLVABLE') {
        await this.onDeviceConnected(device);
      }
    });

    adapter.on('deviceDisconnected', async (device) => {
      CrimsonLogger.i({ msg: `Device disconnected, ${device.address}` });
      await this.onDeviceDisconnected(device);
    });

    adapter.on('characteristicValueChanged', (characteristic) => {
      if (characteristic.uuid === BLE_UUID.CHARACTERISTIC_UUID_DATA_STREAM_NOTIFY) {
        const device = adapter._getDeviceByCharacteristicId(characteristic.instanceId);
        const peripheral = peripheralMap.get(device.address);
        if (!peripheral) {
          CrimsonLogger.w(`[${device.address}] device unavaliable when received data`);
          return;
        }
        const data = Uint8Array.from(characteristic.value);
        if (peripheral.onReceiveData) peripheral.onReceiveData(data);
      } else if (characteristic.uuid === BLE_UUID.CHARACTERISTIC_UUID_BATTERY_LEVEL) {
        const device = adapter._getDeviceByCharacteristicId(characteristic.instanceId);
        const peripheral = peripheralMap.get(device.address);
        if (!peripheral) {
          CrimsonLogger.w(`[${device.address}] device unavaliable when received battery level changed`);
          return;
        }
        const batteryLevel = characteristic.value[0];
        CrimsonLogger.i(peripheral.address, `> Battery Level: ${batteryLevel}.`);
        peripheral.batteryLevel = batteryLevel;
      }
    });
  }

  startScan(cb) {
    CrimsonLogger.d('startScan');
    return new Promise((resolve, reject) => {
      if (!this.adapter || !this.adapter.state.bleEnabled) {
        reject(Error(`dongle ble disabled`));
        return;
      }
      const scanParameters = { active: true, interval: 100, window: 50, timeout: 0 };
      CMSNDongleAdapter.onFoundDevcie = cb;
      this.adapter.startScan(scanParameters, (error) => {
        if (error) {
          CMSNDongleAdapter.onFoundDevcie = null;
          reject(Error(`start scanning failed, error: ${error}`));
        } else {
          resolve();
        }
      });
    });
  }

  stopScan() {
    return new Promise((resolve, reject) => {
      if (!this.adapter) reject(Error('adapter is null'));
      this.adapter.stopScan((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  disconnect(address) {
    const peripheral = peripheralMap.get(address);
    if (!peripheral) {
      CrimsonLogger.w(`[${address}]`, 'not exists when disconnect');
      return;
    }
    if (peripheral.deviceInstanceId) {
      if (!this.adapter) {
        CrimsonLogger.w(`[${address}]`, 'adapter is null');
        this.onDeviceDisconnected(peripheral);
      } else {
        this.adapter.disconnect(peripheral.deviceInstanceId, (error) => {
          if (error) CrimsonLogger.e(peripheral.name, 'disconnect error');
        });
      }
    }
    // if (peripheralMap.has(address)) peripheralMap.delete(address);
  }

  connect(address, peripheral) {
    if (!address || !peripheral) {
      CrimsonLogger.w('connect params invalid', address, peripheral);
      return;
    }
    if (!this.adapter) {
      CrimsonLogger.w(` [${address}] `, 'adapter is null');
      return;
    }
    if (this.adapter.state.connecting) {
      CrimsonLogger.w('Could not connect, another connect is in progress.', peripheral.name);
      return;
    }

    peripheralMap.set(peripheral.address, peripheral);
    if (peripheral.onConnectivityChanged) peripheral.onConnectivityChanged(CONNECTIVITY.enum('connecting'));
    CrimsonLogger.i(`Connecting to`, peripheral.name, peripheral.address, peripheral.addressType);
    const options = {
      scanParams: { active: true, interval: 100, window: 50, timeout: 0 },
      connParams: { min_conn_interval: 20, max_conn_interval: 30, slave_latency: 0, conn_sup_timeout: 3000 },
    };
    // peripheral.addressType
    var type =
      peripheral.addressType == 'BLE_GAP_ADDR_TYPE_RANDOM_PRIVATE_RESOLVABLE'
        ? 'BLE_GAP_ADDR_TYPE_RANDOM_STATIC'
        : peripheral.addressType;
    this.adapter.connect({ address: peripheral.address, type: type }, options, (error) => {
      if (error) {
        CrimsonLogger.e(`Error connecting to ${peripheral.name}`, error);
        return;
      }
    });
  }

  async onDeviceDisconnected(device) {
    const peripheral = peripheralMap.get(device.address);
    if (!peripheral) {
      CrimsonLogger.w(`[${device.address}]`, `device unavaliable when onDeviceDisconnected`);
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
      CrimsonLogger.w(`[${device.address}]`, `doesn't exists onDeviceConnected`);
      return;
    }
    try {
      peripheral.deviceInstanceId = device.instanceId;

      CrimsonLogger.i(peripheral.name, 'discoverServices...');
      const services = await this.discoverServices(device);
      CrimsonLogger.i(peripheral.name, 'discoverServices done');
      for (let service of services) {
        CrimsonLogger.d(peripheral.name, `> Service: ${JSON.stringify(service)}`);
        if (
          service.uuid !== BLE_UUID.SERVICE_UUID_DATA_STREAM &&
          service.uuid !== BLE_UUID.SERVICE_UUID_BATTERY_LEVEL &&
          service.uuid !== BLE_UUID.SERVICE_UUID_DEVICE_INFORMATION &&
          service.uuid !== BLE_UUID.SERVICE_UUID_GENERIC_ACCESS
        ) {
          continue;
        }

        CrimsonLogger.d(peripheral.name, 'discoverCharacteristics...');
        const characteristics = await this.getCharacteristics(service);
        for (let characteristic of characteristics) {
          CrimsonLogger.d(peripheral.name, `> characteristic.uuid: ${characteristic.uuid}`);
          switch (characteristic.uuid) {
            case BLE_UUID.CHARACTERISTIC_UUID_DATA_STREAM_WRITE:
              peripheral.dataStreamCharacteristicWrite = characteristic;
              break;
            case BLE_UUID.CHARACTERISTIC_UUID_DATA_STREAM_NOTIFY:
              try {
                peripheral.dataStreamCharacteristicNotify = characteristic;
                await this.startNotification(characteristic);
                CrimsonLogger.i(peripheral.name, 'enabled data stream notification');
              } catch (error) {
                CrimsonLogger.e(peripheral.name, `enabling data stream notification failed.`, error);
              }
              break;
            case BLE_UUID.CHARACTERISTIC_UUID_BATTERY_LEVEL:
              peripheral.batteryLevelCharacteristic = characteristic;
              try {
                await this.startNotification(characteristic);
                CrimsonLogger.i(peripheral.name, 'enabled battery level notification');
              } catch (error) {
                CrimsonLogger.e(peripheral.name, `enabling battery level notification failed`, error);
              }
              // read once battery level
              try {
                var value = await this.readCharacteristicValue(characteristic);
                peripheral.batteryLevel = value[0];
                CrimsonLogger.i(peripheral.name, `batteryLevel=${peripheral.batteryLevel}.`);
              } catch (e) {
                CrimsonLogger.w(peripheral.name, `read batteryLevel error=${JSON.stringify(e)}.`);
              }
              break;
            case BLE_UUID.CHARACTERISTIC_UUID_NRF_DEVICE_NAME:
              var deviceName = await this.readCharacteristicString(characteristic);
              CrimsonLogger.i(peripheral.name, '> device_name:', deviceName);
              break;
            case BLE_UUID.CHARACTERISTIC_UUID_MANUFACTURER_NAME:
              var manufacturer_name = await this.readCharacteristicString(characteristic);
              CrimsonLogger.i(peripheral.name, '> manufacturer_name:', manufacturer_name);
              peripheral.manufacturer_name = manufacturer_name;
              break;
            case BLE_UUID.CHARACTERISTIC_UUID_MODEL_NUMBER:
              var model_number = await this.readCharacteristicString(characteristic);
              CrimsonLogger.i(peripheral.name, '> model_number:' + model_number);
              peripheral.model_number = model_number;
              break;
            case BLE_UUID.CHARACTERISTIC_UUID_SERIAL_NUMBER:
              var serial_number = await this.readCharacteristicString(characteristic);
              CrimsonLogger.i(peripheral.name, '> serial_number:', serial_number);
              peripheral.serial_number = serial_number;
              break;
            case BLE_UUID.CHARACTERISTIC_UUID_HARDWARE_REVISION:
              var hardware_revision = await this.readCharacteristicString(characteristic);
              CrimsonLogger.i(peripheral.name, '> hardware_revision:', hardware_revision);
              peripheral.hardware_revision = hardware_revision;
              break;
            case BLE_UUID.CHARACTERISTIC_UUID_FIRMWARE_REVISION:
              var firmware_revision = await this.readCharacteristicString(characteristic);
              CrimsonLogger.i(peripheral.name, '> firmware_revision:', firmware_revision);
              peripheral.firmware_revision = firmware_revision;
              break;
            default:
              break;
          }
        }
      }
      if (peripheral.dataStreamCharacteristicNotify && peripheral.dataStreamCharacteristicWrite) {
        CrimsonLogger.i(peripheral.name, `device reday`);
        if (peripheral.onConnectivityChanged) peripheral.onConnectivityChanged(CONNECTIVITY.enum('connected'));
      } else {
        CrimsonLogger.e(
          peripheral.name,
          'discoverServices error, cannot get dataStreamCharacteristicNotify or dataStreamCharacteristicWrite'
        );
      }
    } catch (error) {
      if (error) {
        CrimsonLogger.e(peripheral.name, `discoverServices error`, error);
      }
    }
  }

  discoverServices(device) {
    return new Promise((resolve, reject) => {
      if (!this.adapter) reject(Error('adapter is null'));
      this.adapter.getServices(device.instanceId, (error, services) => {
        if (error) {
          CrimsonLogger.e(error);
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
          CrimsonLogger.e(error);
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
          this.adapter.startCharacteristicsNotifications(characteristic.instanceId, false, (error) => {
            if (error) {
              reject(Error(`enabled notifications error, characteristic: [${characteristic.uuid}]: ${error}.`));
            } else {
              CrimsonLogger.i(`enabled notifications on the characteristic[${characteristic.uuid}]`);
              resolve();
            }
          });
        }
      });
    });
  }

  async stopNotification(characteristic) {
    CrimsonLogger.i('stopNotification');
    try {
      await new Promise((resolve, reject) => {
        if (!this.adapter) reject(Error('adapter is null'));
        this.adapter.stopCharacteristicsNotifications(characteristic.instanceId, (error) => {
          if (error) {
            reject(Error(`disabled notifications error, characteristic: [${characteristic.uuid}]: ${error}.`));
          } else {
            resolve();
          }
        });
      });
      CrimsonLogger.i('stop notification', characteristic.uuid);
    } catch (error) {
      CrimsonLogger.i(error);
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
      CrimsonLogger.w(`readCharacteristicString error=${JSON.stringify(e)}.`);
    }
    return '';
  }

  writeData(address, data, ack) {
    return new Promise((resolve, reject) => {
      if (!this.adapter) reject(Error('adapter is null'));
      const peripheral = peripheralMap.get(address);
      if (!peripheral) {
        CrimsonLogger.w(`[${address}]`, `doesn't exists when writeData`);
        reject(Error('cannot found device when writeData'));
        return;
      }
      if (!peripheral.dataStreamCharacteristicWrite) {
        CrimsonLogger.e(peripheral.name, 'dataStreamCharacteristicWrite is unavailable');
        reject(Error('dataStreamCharacteristicWrite is unavailable'));
        return;
      }
      try {
        this.adapter.writeCharacteristicValue(
          peripheral.dataStreamCharacteristicWrite.instanceId,
          Array.from(data),
          ack,
          (error) => {
            if (error) {
              CrimsonLogger.w(peripheral.name, 'write data error', error);
              reject(error);
            } else {
              CrimsonLogger.d('writeCharacteristicValue done');
              resolve();
            }
          }
        );
      } catch (error) {
        CrimsonLogger.w(peripheral.name, 'write data error', error);
        reject(error);
      }
    });
  }
}

module.exports = {
  CMSNDongleAdapter,
};
