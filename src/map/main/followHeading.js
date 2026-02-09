const DEFAULT_OPTIONS = {
  minSpeedKmh: 5,
  minDistanceMeters: 10,
  jitterDistanceMeters: 5,
  maxBearings: 3,
  minHeadingDelta: 15,
  maxHeadingHoldMs: 5000,
  smoothingFactor: 0.35,
};

const toRadians = (degrees) => degrees * (Math.PI / 180);

export const normalizeAngle = (angle) => ((angle % 360) + 360) % 360;

const shortestAngleDelta = (from, to) => {
  const normalizedFrom = normalizeAngle(from);
  const normalizedTo = normalizeAngle(to);
  const diff = normalizedTo - normalizedFrom;
  if (diff > 180) return diff - 360;
  if (diff < -180) return diff + 360;
  return diff;
};

export const angularDiff = (from, to) => Math.abs(shortestAngleDelta(from, to));

export const speedKnotsToKmh = (value) => (Number.isFinite(value) ? value * 1.852 : 0);

export const distanceMeters = (pointA, pointB) => {
  const lat1 = toRadians(pointA.latitude);
  const lon1 = toRadians(pointA.longitude);
  const lat2 = toRadians(pointB.latitude);
  const lon2 = toRadians(pointB.longitude);
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371000 * c;
};

export const bearing = (pointA, pointB) => {
  const lat1 = toRadians(pointA.latitude);
  const lon1 = toRadians(pointA.longitude);
  const lat2 = toRadians(pointB.latitude);
  const lon2 = toRadians(pointB.longitude);
  const dLon = lon2 - lon1;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return normalizeAngle((Math.atan2(y, x) * 180) / Math.PI);
};

const averageAngles = (angles) => {
  if (!angles.length) {
    return null;
  }
  const x = angles.reduce((sum, value) => sum + Math.cos(toRadians(value)), 0) / angles.length;
  const y = angles.reduce((sum, value) => sum + Math.sin(toRadians(value)), 0) / angles.length;
  return normalizeAngle((Math.atan2(y, x) * 180) / Math.PI);
};

export const smoothHeading = (previousHeading, nextHeading, factor = DEFAULT_OPTIONS.smoothingFactor) => {
  if (!Number.isFinite(previousHeading)) {
    return normalizeAngle(nextHeading);
  }
  const delta = shortestAngleDelta(previousHeading, nextHeading);
  return normalizeAngle(previousHeading + delta * factor);
};

export const shouldUpdateHeading = (
  previousHeading,
  nextHeading,
  lastUpdateAt,
  now,
  options = DEFAULT_OPTIONS,
) => {
  if (!Number.isFinite(nextHeading)) {
    return false;
  }
  if (!Number.isFinite(previousHeading)) {
    return true;
  }
  return angularDiff(previousHeading, nextHeading) >= options.minHeadingDelta
    || now - (lastUpdateAt || 0) >= options.maxHeadingHoldMs;
};

export const computeHeadingCandidate = (buffer, position, options = DEFAULT_OPTIONS) => {
  if (buffer.length < 2) {
    return { status: 'loading', heading: null };
  }

  const latest = buffer[buffer.length - 1];
  const previous = buffer[buffer.length - 2];
  const latestDistance = distanceMeters(previous, latest);
  const speedKmh = speedKnotsToKmh(Number(position?.speed));
  const motionValid = speedKmh >= options.minSpeedKmh || latestDistance >= options.minDistanceMeters;

  const rawCourse = Number(position?.course);
  if (Number.isFinite(rawCourse) && rawCourse >= 0 && motionValid) {
    return { status: 'ready', heading: normalizeAngle(rawCourse) };
  }

  if (latestDistance < options.jitterDistanceMeters) {
    return { status: 'unavailable', heading: null };
  }

  const bearings = [];
  for (let i = buffer.length - 1; i > 0 && bearings.length < options.maxBearings; i -= 1) {
    const start = buffer[i - 1];
    const end = buffer[i];
    const segmentDistance = distanceMeters(start, end);
    if (segmentDistance < options.jitterDistanceMeters) {
      continue;
    }
    if (segmentDistance < options.minDistanceMeters) {
      continue;
    }
    bearings.push(bearing(start, end));
  }

  if (!bearings.length || !motionValid) {
    return { status: 'unavailable', heading: null };
  }

  return { status: 'ready', heading: averageAngles(bearings) };
};

export const headingDefaults = DEFAULT_OPTIONS;
