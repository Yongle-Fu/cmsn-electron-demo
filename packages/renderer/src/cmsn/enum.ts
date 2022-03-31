enum CMSNLogLevel { debug, info, warn, error, none }
enum CMSNError {
  none,
  pair_failed = 3,
  validate_info_failed = 4,
  ble_power_off = -1001,
  dongle_unavailable = -1002,
  scan_error = -1003
}
enum CONNECTIVITY { connecting, connected, disconnecting, disconnected }
enum CONTACT_STATE { unknown, contact, noContact }
enum ORIENTATION { unknown, normal, upsideDown }

export { CMSNLogLevel, CMSNError, CONNECTIVITY, CONTACT_STATE, ORIENTATION }

