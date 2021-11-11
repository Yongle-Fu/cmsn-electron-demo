// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.

// if (module.hot) {
//   module.hot.accept();
// }
// console.log(module.hot);

// const isDevelopment = process.env.NODE_ENV !== 'production';

const ReactDOM = require('react-dom');
const React = require('react');
const { observer } = require('mobx-react');
const { cmsnObservable, CrimsonActions } = require('./CrimsonActions');
const { ScanButton, ScanDeviceList } = require('./ScanDeviceWidget');
const { CrimsonDeviceList } = require('./CrimsonDeviceWidget');

window.addEventListener('DOMContentLoaded', () => {
  // console.log('DOMContentLoaded');
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type]);
  }
  CrimsonActions.initSDK();
});

const App = observer(
  class App extends React.Component {
    constructor() {
      super();
    }

    render() {
      const cmsn = this.props.cmsnObservable;
      if (!cmsn.adapterAvailable) {
        return (<div>
          <p />
          蓝牙连接不可用
        </div>);
      }
      var devicesList =
        cmsn.devices.length > 0 ? (
          <div>
            <p />
            连接中/已连接设备列表
            <CrimsonDeviceList devices={cmsn.devices} />
          </div>
        ) : null;
      // var debugBtn = isDevelopment ? (
      //   <button onClick={() => CrimsonActions.disconnectAll()}>disconnectAll</button>
      // ) : null;
      return (
        <div>
          <button onClick={() => CrimsonActions.disconnectAll()}>disconnectAll</button>
          <p />
          <ScanButton scanning={cmsn.adapterScanning} />
          <p />
          扫描到的设备列表
          <ScanDeviceList devices={cmsn.scannedDevices} />
          {devicesList}
        </div>
      );
    }
  }
);

const app = document.createElement('div');
document.body.appendChild(app);
ReactDOM.render(<App cmsnObservable={cmsnObservable}/>, app);
