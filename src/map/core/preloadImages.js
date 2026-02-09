import { grey } from '@mui/material/colors';
import { createTheme } from '@mui/material';
import { loadImage, prepareIcon } from './mapUtil';

import directionSvg from '../../resources/images/direction.svg';
import backgroundSvg from '../../resources/images/background.svg';
import animalSvg from '../../resources/images/icon/animal.svg';
import bicycleSvg from '../../resources/images/icon/bicycle.svg';
import boatSvg from '../../resources/images/icon/boat.svg';
import busSvg from '../../resources/images/icon/bus.svg';
import carSvg from '../../resources/images/icon/car.svg';
import camperSvg from '../../resources/images/icon/camper.svg';
import craneSvg from '../../resources/images/icon/crane.svg';
import defaultSvg from '../../resources/images/icon/default.svg';
import startSvg from '../../resources/images/icon/start.svg';
import finishSvg from '../../resources/images/icon/finish.svg';
import helicopterSvg from '../../resources/images/icon/helicopter.svg';
import motorcycleSvg from '../../resources/images/icon/motorcycle.svg';
import personSvg from '../../resources/images/icon/person.svg';
import planeSvg from '../../resources/images/icon/plane.svg';
import scooterSvg from '../../resources/images/icon/scooter.svg';
import shipSvg from '../../resources/images/icon/ship.svg';
import tractorSvg from '../../resources/images/icon/tractor.svg';
import trailerSvg from '../../resources/images/icon/trailer.svg';
import trainSvg from '../../resources/images/icon/train.svg';
import tramSvg from '../../resources/images/icon/tram.svg';
import truckSvg from '../../resources/images/icon/truck.svg';
import vanSvg from '../../resources/images/icon/van.svg';
import vehicleTopdownSvg from '../../resources/images/icon/vehicle-topdown.svg';
import { DEVICE_ICON_CATEGORIES, normalizeDeviceIcon } from '../../common/util/deviceIcons';

export const mapIcons = {
  arrow: directionSvg,
  animal: animalSvg,
  bicycle: bicycleSvg,
  boat: boatSvg,
  bus: busSvg,
  car: carSvg,
  camper: camperSvg,
  crane: craneSvg,
  default: defaultSvg,
  finish: finishSvg,
  helicopter: helicopterSvg,
  motorcycle: motorcycleSvg,
  person: personSvg,
  plane: planeSvg,
  scooter: scooterSvg,
  ship: shipSvg,
  start: startSvg,
  tractor: tractorSvg,
  trailer: trailerSvg,
  train: trainSvg,
  tram: tramSvg,
  truck: truckSvg,
  van: vanSvg,
  vehicleTopdown: vehicleTopdownSvg,
};

export const mapIconKey = (category) => {
  switch (category) {
    case 'offroad':
    case 'pickup':
      return 'car';
    case 'trolleybus':
      return 'bus';
    default:
      return mapIcons.hasOwnProperty(category) ? category : 'default';
  }
};

export const mapVehicleMarkerKey = (category) => `vehicle-${category}`;
export const VEHICLE_MARKER_IMAGE_KEY = 'vehicle-topdown-premium';

export const mapDeviceIconKey = (device) => {
  const explicitIcon = normalizeDeviceIcon(device?.attributes?.deviceIcon, false);
  if (explicitIcon) {
    return explicitIcon;
  }

  const category = normalizeDeviceIcon(mapIconKey(device?.category), false);
  if (category) {
    return category;
  }

  const legacyIcon = normalizeDeviceIcon(device?.attributes?.deviceIcon, true);
  return legacyIcon || 'default';
};

export const mapImages = {};

const toImageData = (image) => {
  const canvas = document.createElement('canvas');
  canvas.width = image.width * devicePixelRatio;
  canvas.height = image.height * devicePixelRatio;
  canvas.style.width = `${image.width}px`;
  canvas.style.height = `${image.height}px`;

  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
};

const theme = createTheme({
  palette: {
    neutral: { main: grey[500] },
  },
});

export default async () => {
  const background = await loadImage(backgroundSvg);
  mapImages.background = await prepareIcon(background);
  mapImages.direction = await prepareIcon(await loadImage(directionSvg));

  try {
    mapImages[VEHICLE_MARKER_IMAGE_KEY] = toImageData(await loadImage(vehicleTopdownSvg));
  } catch (error) {
    mapImages[VEHICLE_MARKER_IMAGE_KEY] = toImageData(await loadImage(carSvg));
  }

  await Promise.all(DEVICE_ICON_CATEGORIES.map(async (category) => {
    try {
      mapImages[mapVehicleMarkerKey(category)] = toImageData(await loadImage(mapIcons[category]));
    } catch (error) {
      mapImages[mapVehicleMarkerKey(category)] = toImageData(await loadImage(vehicleTopdownSvg));
    }
  }));

  await Promise.all(Object.keys(mapIcons).map(async (category) => {
    const results = [];
    ['info', 'success', 'error', 'neutral'].forEach((color) => {
      results.push(loadImage(mapIcons[category]).then((icon) => {
        mapImages[`${category}-${color}`] = prepareIcon(background, icon, theme.palette[color].main);
      }));
    });
    await Promise.all(results);
  }));
};
