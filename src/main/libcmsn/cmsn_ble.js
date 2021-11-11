/* eslint-disable require-atomic-updates */
/* eslint-disable indent */
const node_ble = require('cmsn-noble');
const { textDecoder } = require('./cmsn_utils');
const { CONNECTIVITY, BLE_UUID } = require('./cmsn_common');
const CrimsonLogger = require('./cmsn_logger');

const peripheralMap = new Map(); // (uuid: string, peripheral)

class CMSNBleAdapter {
  logMessage(name, message) {
    CrimsonLogger.i(name, message);
  }

  initAdapter(listener) {
    if (!listener) return;
    const that = this;
    node_ble.on('stateChange', (state) => {
      CrimsonLogger.i('ble state change to', state);
      const available = state === 'poweredOn';
      if (that.available == undefined || that.available != available) {
        that.available = available;
        if (listener.onAdapterStateChaged) listener.onAdapterStateChaged(available);
      }
    });
  }

  reset(peripheral) {
    this.discoveringServices = false;
    if (!peripheral) return;
    peripheral.dataStreamCharacteristicWrite = undefined;
    peripheral.dataStreamCharacteristicNotify = undefined;
    peripheral.batteryLevelCharacteristic = undefined;
    if (peripheral.onConnectivityChanged) peripheral.onConnectivityChanged(CONNECTIVITY.enum('disconnected'));
  }

  disconnect(address) {
    const peripheral = peripheralMap.get(address);
    if (!peripheral) {
      CrimsonLogger.w(address, `device unavaliable when disconnect`);
      return;
    }
    try {
      peripheral.disconnect();
    } catch (error) {
      CrimsonLogger.w(peripheral.name, 'disconnect error', error);
    }
    // if (peripheralMap.has(address)) peripheralMap.delete(address);
  }

  connect(address, peripheral) {
    if (!address || !peripheral) {
      CrimsonLogger.w('connect params invalid', address, peripheral);
      return;
    }
    peripheralMap.set(peripheral.address, peripheral);
    var name = peripheral.name;
    peripheral.removeAllListeners('servicesDiscover');
    peripheral.removeAllListeners('disconnect');
    peripheral.on('disconnect', () => {
      this.reset(peripheral);
    });

    CrimsonLogger.i('cmsn_ble, connecting...', address, name, peripheral.state);
    if (peripheral.onConnectivityChanged) peripheral.onConnectivityChanged(CONNECTIVITY.enum('connecting'));
    if (peripheral.state == 'connected') {
      this.onConnected(peripheral);
      return;
    }
    const that = this;
    peripheral.connect(async (error) => {
      if (error) {
        CrimsonLogger.w(name, 'connect error', error);
        that.reset(peripheral);
        return;
      }
      if (peripheral) that.onConnected(peripheral);
    });
  }

  async onConnected(peripheral) {
    const name = peripheral.name;
    if (this.discoveringServices) {
        CrimsonLogger.i(name, 'already in discoveringServices');
        return;
      }
      this.discoveringServices = true;
      this.logMessage(name, 'discoverServices...');
      try {
        const services = await this.discoverServices(peripheral);
        CrimsonLogger.d('services', services);
        for (let service of services) {
          const characteristics = await this.getCharacteristics(peripheral, service);
          await this.onDiscoverCharacteristics(peripheral, characteristics);
        }
        this.onDataStreamCharacteristicReady(peripheral);
      } catch (error) {
        CrimsonLogger.w('discoverServices error', error);
      }
  }

  discoverServices(peripheral) {
    if (!peripheral) return;
    var name = peripheral.name;
    return new Promise((resolve, reject) => {
      peripheral.discoverServices(
        [
          BLE_UUID.SERVICE_UUID_DATA_STREAM,
          BLE_UUID.SERVICE_UUID_DEVICE_INFORMATION,
          BLE_UUID.SERVICE_UUID_BATTERY_LEVEL,
        ].map((e) => e.toLowerCase()),
        (error, services) => {
          if (error) {
            CrimsonLogger.e(error);
            reject(Error(`[${name}] Error discovering services: ${JSON.stringify(error)}.`));
          } else resolve(services);
        }
      );
    });
  }

  getCharacteristics(peripheral, service) {
    if (!peripheral) return;
    var name = peripheral.name;
    return new Promise((resolve, reject) => {
      if (!peripheral || peripheral.state !== 'connected') {
        reject(Error(`[${name}], device is not connected`));
        return;
      }
      // this.logMessage(name, '> Service: ' + service.uuid + ' discoverCharacteristics...');
      try {
        service.discoverCharacteristics(
          [
            BLE_UUID.CHARACTERISTIC_UUID_DATA_STREAM_NOTIFY,
            BLE_UUID.CHARACTERISTIC_UUID_DATA_STREAM_WRITE,
            BLE_UUID.CHARACTERISTIC_UUID_BATTERY_LEVEL,
            BLE_UUID.CHARACTERISTIC_UUID_MANUFACTURER_NAME,
            BLE_UUID.CHARACTERISTIC_UUID_MODEL_NUMBER,
            BLE_UUID.CHARACTERISTIC_UUID_SERIAL_NUMBER,
            BLE_UUID.CHARACTERISTIC_UUID_FIRMWARE_REVISION,
            BLE_UUID.CHARACTERISTIC_UUID_HARDWARE_REVISION,
          ].map((e) => e.toLowerCase()),
          (error, characteristics) => {
            if (error) {
              this.logWarn(name, error);
              reject(Error(`[${name}], discoverCharacteristics error=${error}`));
            } else resolve(characteristics);
          }
        );
      } catch (error) {
        CrimsonLogger.w('discoverCharacteristics error');
      }
    });
  }

  enableNotification(characteristic, enabled) {
    return new Promise((resolve, reject) => {
      characteristic.notify(enabled, (error) => {
        if (error) reject(Error(`enableNotification failed, error: ${error}`));
        else resolve();
      });
    });
  }

  readCharacteristicValue(characteristic) {
    return new Promise((resolve, reject) => {
      characteristic.read((error, buffer) => {
        if (error) reject(Error(`readCharacteristicValue failed, error: ${error}`));
        else resolve(buffer);
      });
    });
  }

  async readCharacteristicString(characteristic) {
    try {
      let value = await this.readCharacteristicValue(characteristic);
      return textDecoder.decode(value);
    } catch (e) {
      CrimsonLogger.w(`readCharacteristicString error=${JSON.stringify(e)}.`);
    }
    return '';
  }

  async onDiscoverCharacteristics(peripheral, characteristics) {
    if (!peripheral) return;
    var name = peripheral.name;
    for (let characteristic of characteristics) {
      if (peripheral.state !== 'connected') {
        CrimsonLogger.w(name, 'device state changed to ' + peripheral.state);
        return;
      }
      CrimsonLogger.d(name, '>> Characteristic: ' + characteristic);
      switch (characteristic.uuid.toUpperCase()) {
        case BLE_UUID.CHARACTERISTIC_UUID_DATA_STREAM_WRITE:
          peripheral.dataStreamCharacteristicWrite = characteristic;
          break;

        case BLE_UUID.CHARACTERISTIC_UUID_DATA_STREAM_NOTIFY:
          peripheral.dataStreamCharacteristicNotify = characteristic;
          characteristic.on('read', (buffer) => {
            if (peripheral.onReceiveData) peripheral.onReceiveData(buffer);
          });
          try {
            await this.enableNotification(characteristic, true);
            this.logMessage('data stream notification enabled');
          } catch (error) {
            CrimsonLogger.w(name, 'enabling data stream notification failed', error);
          }
          break;

        case BLE_UUID.CHARACTERISTIC_UUID_BATTERY_LEVEL:
          peripheral.batteryLevelCharacteristic = characteristic;
          characteristic.on('read', (buffer) => {
            if (buffer.byteLength > 0) {
              peripheral.batteryLevel = buffer[0];
              this.logMessage(name, '> Battery Level is ' + peripheral.batteryLevel + '%');
              if (peripheral.onBatteryLevelChanged) peripheral.onBatteryLevelChanged(peripheral.batteryLevel);
            }
          });
          try {
            await this.enableNotification(characteristic, true);
            this.logMessage(name, 'battery level notification enabled');
          } catch (error) {
            CrimsonLogger.w(name, 'enabling battery level notification failed', error);
          }
          characteristic.read(); // read once battery level
          break;

        case BLE_UUID.CHARACTERISTIC_UUID_MANUFACTURER_NAME:
          peripheral.manufacturer_name = await this.readCharacteristicString(characteristic);
          // this.logMessage(name, '> manufacturer_name: ' + peripheral.manufacturer_name);
          break;
        case BLE_UUID.CHARACTERISTIC_UUID_MODEL_NUMBER:
          peripheral.model_number = await this.readCharacteristicString(characteristic);
          // this.logMessage(name, '> model_number: ' + peripheral.model_number);
          break;
        case BLE_UUID.CHARACTERISTIC_UUID_SERIAL_NUMBER:
          peripheral.serial_number = await this.readCharacteristicString(characteristic);
          this.logMessage(name, '> serial_number: ' + peripheral.serial_number);
          break;
        case BLE_UUID.CHARACTERISTIC_UUID_HARDWARE_REVISION:
          peripheral.hardware_revision = await this.readCharacteristicString(characteristic);
          // this.logMessage(name, '> hardware_revision: ' + peripheral.hardware_revision);
          break;
        case BLE_UUID.CHARACTERISTIC_UUID_FIRMWARE_REVISION:
          peripheral.firmware_revision = await this.readCharacteristicString(characteristic);
          this.logMessage(name, '> firmware_revision: ' + peripheral.firmware_revision);
          break;
        default:
          break;
      }
    }
  }

  onDataStreamCharacteristicReady(peripheral) {
    if (!peripheral) return;
    if (peripheral.state !== 'connected') {
      CrimsonLogger.w(peripheral.name, 'device state changed to ' + peripheral.state);
      return;
    }
    if (peripheral.dataStreamCharacteristicNotify && peripheral.dataStreamCharacteristicWrite) {
      if (peripheral.onConnectivityChanged) peripheral.onConnectivityChanged(CONNECTIVITY.enum('connected'));
    } else {
      CrimsonLogger.w(
        peripheral.name,
        'discoverServices error, cannot get dataStreamCharacteristicNotify or dataStreamCharacteristicWrite'
      );
    }
  }

  writeData(address, data, ack) {
    return new Promise((resolve, reject) => {
      const peripheral = peripheralMap.get(address);
      if (!peripheral) {
        CrimsonLogger.w(address, `device unavaliable when writeData`);
        reject(Error('device unavaliable when writeData'));
        return;
      }
      var name = peripheral.name;
      if (!peripheral.dataStreamCharacteristicWrite) {
        CrimsonLogger.w(name, 'dataStreamCharacteristicWrite is unavailable');
        reject(Error('dataStreamCharacteristicWrite is unavailable'));
        return;
      }
      const withoutResponse = ack !== true;
      peripheral.dataStreamCharacteristicWrite.write(Buffer.from(data), withoutResponse, (error) => {
        if (error) {
          CrimsonLogger.w(name, 'write data error', error);
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
    return new Promise((resolve) => {
      node_ble.stopScanning(() => resolve());
      this.onStopScan();
    });
  }

  dispose() {
    this.stopScan();
  }

  onStartScan() {
    if (CMSNBleAdapter.scanObserved) return;
    CMSNBleAdapter.scanObserved = true;

    node_ble.on('discover', async (p) => {
      //mock headband
      if (p.advertisement && p.advertisement.localName && p.advertisement.localName.startsWith('CM_')) {
        p.name = p.advertisement.localName;
        p.batteryLevel = 66;
        p.isInPairingMode = true;
        CrimsonLogger.i(`Discovered [${p.name}] addressType=${p.addressType} address=${p.address} rssi=${p.rssi}`);
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
                CrimsonLogger.i(p);
                p.name = 'CM_' + p.id;
            }
          */

          CrimsonLogger.d(
            `Discovered [${p.name}] addressType=${p.addressType} address=${p.address} rssi=${p.rssi} batteryLevel=${p.batteryLevel} isInPairingMode=${p.isInPairingMode}`
          );
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
  CMSNBleAdapter,
};
