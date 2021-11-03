const debug = require('debug');
const log = debug('cmsn');
const isDevelopment = process.env.NODE_ENV !== 'production';

const d = !isDevelopment ? console.log : log.extend('debug');
const i = !isDevelopment ? console.log : log.extend('info');
const w = !isDevelopment ? console.log : log.extend('warn');
const e = !isDevelopment ? console.log : log.extend('error');

if (!isDevelopment) {
  log.log = console.log.bind(console);

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
