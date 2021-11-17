const React = require('react');
const { CONNECTIVITY, CONTACT_STATE, ORIENTATION } = require('../main/libcmsn/cmsn_common');
const { CrimsonActions } = require('./CrimsonActions');

export function CrimsonDeviceList(props) {
  return props.devices.map((device) => <CrimsonDeviceWidget key={device.id} device={device} />);
}

class CrimsonDeviceWidget extends React.Component {
  render() {
    var device = this.props.device;
    return (
      <div>
        <p>
          ID: {device.id}, name: {device.name}, batteryLevel: {device.batteryLevel}
        </p>
        <p>DeviceInfo: {JSON.stringify(device.deviceInfo)}</p>
        <button onClick={() => CrimsonActions.disconnect(device)}>disconnect</button>
        <p>connectivity: {CONNECTIVITY(this._safeInt(device.connectivity))}</p>
        <p>contactState: {CONTACT_STATE(this._safeInt(device.contactState))}</p>
        <p>orientation: {ORIENTATION(this._safeInt(device.orientation))}</p>
        <p>attention: {this._safeFloat(device.attention)}</p>
        <p>meditation: {this._safeFloat(device.meditation)}</p>
        <p>social:{this._safeFloat(device.social)}</p>
        <p>BrainWave: {JSON.stringify(device.stats)}</p>
      </div>
    );
  }

  _safeInt(value) {
    if (!value) return 0;
    return value;
  }

  _safeFloat(value) {
    if (!value) return null;
    return value;
  }
}
