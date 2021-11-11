/* eslint-disable indent */
const debug = require('debug');
const log = debug('cmsn');
const d = log.extend('debug');
const i = log.extend('info');
const w = log.extend('warn');
const e = log.extend('error');

// const isDevelopment = process.env.NODE_ENV !== 'production';
// const shouldLogging = !isDevelopment;
const shouldLogging = false;
if (shouldLogging) {
  // log.log = console.log.bind(console);
  const electronLog = require('electron-log');
  console.log = electronLog.log;
}

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
