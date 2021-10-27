// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.

/*
const { ipcRenderer, remote } = require('electron');
const { CrimsonSDK } = remote.require('./lib/cmsn_sdk');

const useDongle = false; // not support connect at the same time
let cmsnSDK;
const initSDK = async () => {
    console.debug('CrimsonSDK.init');
    if (cmsnSDK) return;

    // eslint-disable-next-line require-atomic-updates
    cmsnSDK = await CrimsonSDK.init(useDongle, CMSNLogLevel.enum('info')); //info/error/warn
    CrimsonSDK.createFilter(true, 2, 45, true, 49, 51);
};

console.log(window);
window.ipc = ipcRenderer;
window.ipc.on("onDeviceStatusChange", function (_e, eeg) {
    initSDK();
    console.log("EEG data received:", eeg.eegData.slice(0, 10));
    console.log("EEG filter data:", CrimsonSDK.getFilterData(eeg.eegData).slice(0, 10));
});
*/