const EARTH_CIRCUMFERENCE_METERS = 40075016.68557849;
const TILE_SIZE = 512; // MapLibre default tile size (see maplibre-gl transform helper).
export const SCALE_CONTROL_WIDTH_PX = 100; // ScaleControl default width in MapLibre.
export const DEFAULT_SCALE_METERS = 30;
const LAST_ZOOM_KEY = 'mapLastZoom';

// Reference (approx.): at latitude ~-23°, 10 m scale -> zoom ~19.46, 30 m scale -> zoom ~17.87.

let defaultZoomApplied = false;
let userZoomed = false;

export const getStoredZoom = () => {
  const raw = window.localStorage.getItem(LAST_ZOOM_KEY);
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

export const markUserZoomed = (zoom) => {
  userZoomed = true;
  if (Number.isFinite(zoom)) {
    window.localStorage.setItem(LAST_ZOOM_KEY, String(zoom));
  }
};

export const hasUserZoomed = () => userZoomed || getStoredZoom() != null;

export const shouldApplyDefaultZoom = () => !hasUserZoomed() && !defaultZoomApplied;

export const markDefaultZoomApplied = () => {
  defaultZoomApplied = true;
};

export const zoomForScale = (meters, latitude) => {
  // Convert desired scale (meters displayed over SCALE_CONTROL_WIDTH_PX) into a zoom level.
  const metersPerPixel = meters / SCALE_CONTROL_WIDTH_PX;
  const metersPerPixelAtZoom0 = (EARTH_CIRCUMFERENCE_METERS * Math.cos((latitude * Math.PI) / 180)) / TILE_SIZE;
  return Math.log2(metersPerPixelAtZoom0 / metersPerPixel);
};
