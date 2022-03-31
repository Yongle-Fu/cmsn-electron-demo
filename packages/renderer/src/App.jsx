// import electron from '@/assets/electron.png'
// import react from '@/assets/react.svg'
// import vite from '@/assets/vite.svg'
// import styles from '@/styles/app.module.scss'
// import { useState, Component } from 'react'
import { Component } from 'react'
import { observer } from 'mobx-react';
import { ScanButton, ScanDeviceList } from './cmsn/CrimsonScanPage';
import { CrimsonDeviceList } from './cmsn/CrimsonDeviceWidget';
import CrimsonActions from './cmsn/CrimsonActions'
import { Button } from '@mantine/core';

const App = observer(
  class App extends Component {
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
      return (
        <div>
          <Button
            variant="light"
            radius="xl"
            size="md"
            onClick={() => CrimsonActions.disconnectAll()}>disconnectAll</Button>
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

export default App

/*
const App2 = observer(() => {
  const [count, setCount] = useState(0)
  return (
    <div className={styles.app}>
      <header className={styles.appHeader}>
        <div className={styles.logos}>
          <div className={styles.imgBox}>
            <img
              src={electron}
              style={{ height: '24vw' }}
              className={styles.appLogo}
              alt="electron"
            />
          </div>
          <div className={styles.imgBox}>
            <img
              src={vite}
              style={{ height: '19vw' }}
              // className={styles.appLogo}
              alt="vite" />
          </div>
          <div className={styles.imgBox}>
            <img
              src={react}
              style={{ maxWidth: '100%' }}
              className={styles.appLogo}
              alt="logo"
            />
          </div>
        </div>
        <p>Hello Electron + Vite + React!</p>
        <p>
          <button onClick={() => setCount((count) => count + 1)}>
            count is: {count}
          </button>
        </p>
        <p>
          Edit <code>App.tsx</code> and save to test HMR updates.
        </p>
        <div>
          <a
            className={styles.appLink}
            href="https://reactjs.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn React
          </a>
          {' | '}
          <a
            className={styles.appLink}
            href="https://vitejs.dev/guide/features.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vite Docs
          </a>
          <div className={styles.staticPublic}>
            Place static files into the{' '}
            <code>src/renderer/public</code> folder
            <img style={{ width: 90 }} src="./images/node.png" />
          </div>
        </div>
      </header>
    </div>
  )
}) */