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

export const isVehicleOff = (device, position) => {
  if (!device) return false;
  if (device.status !== 'online') return true;
  if (position?.attributes?.ignition === false) return true;
  return false;
};
