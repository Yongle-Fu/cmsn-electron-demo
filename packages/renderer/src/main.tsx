import { StrictMode } from 'react'
import { render } from 'react-dom'
import './samples/electron-store'
import './styles/index.css'
import CrimsonActions from './cmsn/CrimsonActions'
import App from './App'

render(
  <StrictMode>
    <App cmsnObservable={CrimsonActions.cmsnObservable} CrimsonActions={CrimsonActions} />
  </StrictMode>,
  document.getElementById('root'),
  window.removeLoading
)

// console.log('fs', window.fs)
// console.log('ipcRenderer', window.ipcRenderer)

// Usage of ipcRenderer.on
window.ipcRenderer.on('main-process-message', (_event, ...args) => {
  const verisons = args[0];
  // console.log('[Receive Main-process message]:', ...args)
  console.log('[Receive Main-process message]:', verisons)

  const replaceText = (selector: string, text: string) => {
    const element = document.getElementById(selector);
    if (element != null) element.innerText = text;
  };
  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, verisons[type])
  }
  CrimsonActions.initSDK();
})

// window.addEventListener('DOMContentLoaded', () => {
//   console.log('DOMContentLoaded');
//   CrimsonActions.initSDK();
// });
