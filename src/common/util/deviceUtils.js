/**
 * Display name for a device: user-facing name (displayName) or fallback to technical name.
 * @param {object} device
 * @returns {string}
 */
export const getDeviceDisplayName = (device) => {
  if (!device) return '';
  const dn = device.attributes?.displayName?.trim();
  return device.name || dn || '';
};

/**
 * Returns true when the position reports ignition/acc as OFF.
 * Mirrors the exact same logic used by BottomPeekCard and StatusCard UI:
 *   position.attributes.ignition ?? position.attributes.acc
 * Returns false when unknown (no attribute present) — treat as "on".
 */
export const isIgnitionOff = (position) => {
  const ignition = position?.attributes?.ignition ?? position?.attributes?.acc;
  if (ignition == null) return false;
  return !ignition;
};

/**
 * Returns true when device is not online (offline / unknown / missing).
 */
export const isDeviceOffline = (device) => {
  return !device || device.status !== 'online';
};

/**
 * Central policy: should Phone Assist be allowed for this device?
 * Returns false when vehicle is offline OR ignition/acc is off.
 */
export const shouldEnablePhoneAssistForDevice = (device, position) => {
  return !isDeviceOffline(device) && !isIgnitionOff(position);
};
