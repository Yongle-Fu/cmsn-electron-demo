/* eslint-disable indent */
const electronLog = require('electron-log');
const debug = require('debug');
const cmsnLogger = debug('cmsn');
const d = cmsnLogger.extend('debug');
const i = cmsnLogger.extend('info');
const w = cmsnLogger.extend('warn');
const e = cmsnLogger.extend('error');

debug.log = electronLog.log;
console.log = electronLog.log;

const log_level_arr = ['debug', 'info', 'warn', 'error'];
function setLogLevel(level) {
  if (level >= 0 && level < 4) {
    const cmsn_log_namespaces = log_level_arr
      .slice(level)
      .map((e) => `cmsn:${e}*`)
      .join(',');
    var namespaces = debug.namespaces;
    if (namespaces) debug.enable(`${namespaces}, ${cmsn_log_namespaces}`);
    else debug.enable(`${cmsn_log_namespaces}`);
    console.log('debug.namespaces', debug.namespaces);
  } else {
    debug.disable();
  }
}

module.exports = {
  setLogLevel,
  d,
  i,
  w,
  e,
};
