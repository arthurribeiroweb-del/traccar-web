const KPH_PER_KNOT = 1.852;

export const RADAR_DEFAULT_RADIUS_METERS = 30;
export const RADAR_MIN_RADIUS_METERS = 10;
export const RADAR_MAX_RADIUS_METERS = 200;

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return Number.NaN;
  }
  return Number(value);
};

export const parseCircleArea = (area) => {
  if (typeof area !== 'string' || !area.startsWith('CIRCLE')) {
    return null;
  }
  const values = area.replace(/CIRCLE|\(|\)|,/g, ' ').trim().split(/ +/).map(Number);
  if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return {
    latitude: values[0],
    longitude: values[1],
    radius: values[2],
  };
};

export const buildCircleArea = ({ latitude, longitude, radius }) => `CIRCLE (${latitude} ${longitude}, ${radius})`;

export const isRadarGeofence = (geofence) => Boolean(geofence?.attributes?.radar);

export const isRadarActive = (geofence) => isRadarGeofence(geofence) && geofence?.attributes?.radarActive !== false;

export const getRadarSpeedLimitKph = (geofence) => {
  const value = toNumber(geofence?.attributes?.radarSpeedLimitKph);
  return Number.isFinite(value) && value > 0 ? value : null;
};

export const getRadarRadiusMeters = (geofence) => {
  const fromAttributes = toNumber(geofence?.attributes?.radarRadiusMeters);
  if (Number.isFinite(fromAttributes) && fromAttributes > 0) {
    return fromAttributes;
  }
  const fromArea = parseCircleArea(geofence?.area)?.radius;
  return Number.isFinite(fromArea) && fromArea > 0 ? fromArea : RADAR_DEFAULT_RADIUS_METERS;
};

export const radarOverspeedInfoFromEvent = (event, fallbackRadarName) => {
  if (event?.type !== 'deviceOverspeed') {
    return null;
  }
  const radarId = event?.attributes?.radarId;
  const radarName = event?.attributes?.radarName || fallbackRadarName || null;
  if (!radarId && !radarName) {
    return null;
  }
  const speedKphRaw = toNumber(event?.attributes?.speedKph);
  const limitKphRaw = toNumber(event?.attributes?.limitKph ?? event?.attributes?.radarSpeedLimitKph);
  const speedKnots = toNumber(event?.attributes?.speed);
  const limitKnots = toNumber(event?.attributes?.speedLimit);

  const speedKph = Number.isFinite(speedKphRaw)
    ? speedKphRaw
    : (Number.isFinite(speedKnots) ? speedKnots * KPH_PER_KNOT : null);
  const limitKph = Number.isFinite(limitKphRaw)
    ? limitKphRaw
    : (Number.isFinite(limitKnots) ? limitKnots * KPH_PER_KNOT : null);

  if (!Number.isFinite(speedKph) || !Number.isFinite(limitKph)) {
    return null;
  }

  return {
    radarId,
    radarName,
    speedKph: Math.round(speedKph),
    limitKph: Math.round(limitKph),
  };
};
