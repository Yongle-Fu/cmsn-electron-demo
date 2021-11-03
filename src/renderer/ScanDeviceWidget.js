const React = require('react');
const { CrimsonActions } = require('./CrimsonActions');

export function ScanDeviceList(props) {
  return props.devices.map((device) => <ScanDeviceWidget key={device.id} device={device} />);
}

export function ScanButton(props) {
  return <button onClick={() => CrimsonActions.toogleScan()}>{props.scanning ? 'stopScan' : 'startScan'}</button>;
}

class ScanDeviceWidget extends React.Component {
  constructor() {
    super();
  }
  render() {
    var device = this.props.device;
    return (
      <div>
        <button onClick={() => CrimsonActions.connect(device)}>
          ID: {device.id}, name: {device.name}, 配对模式: {device.isInPairingMode ? 'Yes' : 'No'}, batteryLevel:
          {device.batteryLevel}
        </button>
      </div>
    );
  }
}
