import { speedFromKnots } from './converter';

const STOP_SPEED_KMH = 1;

/**
 * Haversine distance between two positions, in meters.
 * @param {object} a - { latitude, longitude }
 * @param {object} b - { latitude, longitude }
 * @returns {number}
 */
export const haversineMeters = (a, b) => {
  if (!a || !b) return 0;
  const toRad = (v) => (v * Math.PI) / 180;
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = lat2 - lat1;
  const dLon = toRad(b.longitude - a.longitude);
  const R = 6371000;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/**
 * Sum of segment distances when moving (speed > STOP_SPEED_KMH).
 * Matches Replay "Distância" logic so card and replay show the same value.
 * @param {Array<{ latitude, longitude, speed, fixTime }>} positions - sorted by fixTime
 * @returns {number} distance in meters
 */
export const computeRouteDistanceFromPositions = (positions) => {
  if (!Array.isArray(positions) || positions.length < 2) return 0;
  let meters = 0;
  for (let i = 1; i < positions.length; i += 1) {
    const prev = positions[i - 1];
    const curr = positions[i];
    const prevTime = new Date(prev.fixTime).getTime();
    const currTime = new Date(curr.fixTime).getTime();
    const deltaSec = (currTime - prevTime) / 1000;
    if (!Number.isFinite(deltaSec) || deltaSec <= 0) continue;
    const prevSpeedKmh = speedFromKnots(prev.speed ?? 0, 'kmh');
    const currSpeedKmh = speedFromKnots(curr.speed ?? 0, 'kmh');
    const isStopped = prevSpeedKmh <= STOP_SPEED_KMH;
    if (!isStopped) {
      meters += haversineMeters(prev, curr);
    }
  }
  return meters;
};
