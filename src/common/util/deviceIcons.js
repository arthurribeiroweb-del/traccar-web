export const DEVICE_ICON_CATEGORIES = [
  'default',
  'animal',
  'bicycle',
  'boat',
  'bus',
  'car',
  'crane',
  'motorcycle',
  'tractor',
  'trailer',
  'truck',
  'van',
  'scooter',
];

const LEGACY_DEVICE_ICON_MAP = {
  pin: 'default',
  arrow: 'default',
  car: 'car',
  moto: 'motorcycle',
  truck: 'truck',
  bus: 'bus',
  van: 'van',
  tractor: 'tractor',
  trailer: 'trailer',
  boat: 'boat',
  jetski: 'boat',
};

export const categoryTranslationKey = (category) => (
  `category${category.replace(/^\w/, (c) => c.toUpperCase())}`
);

export const normalizeDeviceIcon = (value, allowLegacy = true) => {
  if (!value) {
    return null;
  }
  if (DEVICE_ICON_CATEGORIES.includes(value)) {
    return value;
  }
  if (allowLegacy) {
    return LEGACY_DEVICE_ICON_MAP[value] || null;
  }
  return null;
};
