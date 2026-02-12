import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import circle from '@turf/circle';
import maplibregl from 'maplibre-gl';
import { useSelector } from 'react-redux';
import { map } from './core/MapView';
import radarIconUrl from '../resources/images/icon/community-radar.svg';
import speed20IconUrl from '../resources/images/icon/speed-limit-20-sign-icon.svg';
import speed30IconUrl from '../resources/images/icon/speed-limit-30-sign-icon.svg';
import speed40IconUrl from '../resources/images/icon/speed-limit-40-sign-icon.svg';
import speed50IconUrl from '../resources/images/icon/speed-limit-50-sign-icon.svg';
import speed60IconUrl from '../resources/images/icon/speed-limit-60-sign-icon.svg';
import speed70IconUrl from '../resources/images/icon/speed-limit-70-sign-icon.svg';
import speed80IconUrl from '../resources/images/icon/speed-limit-80-sign-icon.svg';
import speed90IconUrl from '../resources/images/icon/speed-limit-90-sign-icon.svg';
import speed100IconUrl from '../resources/images/icon/speed-limit-100-sign-icon.svg';
import speed110IconUrl from '../resources/images/icon/speed-limit-110-sign-icon.svg';
import speed120IconUrl from '../resources/images/icon/speed-limit-120-sign-icon.svg';
import beepSoundUrl from '../resources/bipe.mp3';
import { useAdministrator } from '../common/util/permissions';
import fetchOrThrow from '../common/util/fetchOrThrow';

const STATIC_RADARS_MIN_ZOOM = 10;
const RADAR_ICON_BASE_SIZE = 64;
const STATIC_RADARS_MIN_SPEED_KPH = 20;
const STATIC_RADARS_MAX_SPEED_KPH = 120;
const STATIC_RADARS_DEFAULT_RADIUS_METERS = 30;
const STATIC_RADARS_EDIT_MIN_RADIUS_METERS = 5;
const STATIC_RADARS_EDIT_MAX_RADIUS_METERS = 200;
const STATIC_RADARS_FILE = 'scdb-radars-br.geojson';
const STATIC_RADARS_PATH = `radars/${STATIC_RADARS_FILE}`;
const STATIC_RADARS_COMMON_PREFIXES = ['/login', '/rastreador'];
const STATIC_RADARS_CACHE_DB_NAME = 'traccar-static-radars';
const STATIC_RADARS_CACHE_DB_VERSION = 1;
const STATIC_RADARS_CACHE_STORE_NAME = 'geojson';
const STATIC_RADARS_CACHE_KEY = STATIC_RADARS_FILE;
const STATIC_RADARS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STATIC_RADARS_AUDIT_COLOR = '#E11D48';
const RADAR_PROXIMITY_COOLDOWN_MS = 30000;
const RADAR_ALERT_REPEAT_COUNT = 1;
const RADAR_ALERT_REPEAT_GAP_MS = 450;
const RADAR_ALERT_BASE_WARNING_METERS = 80;
const RADAR_ALERT_LOOKAHEAD_SECONDS = 10;
const RADAR_ALERT_MIN_WARNING_METERS = 120;
const RADAR_ALERT_MAX_WARNING_METERS = 450;
const RADAR_ALERT_EXIT_HYSTERESIS_METERS = 80;
const RADAR_ALERT_MAX_BEARING_DELTA_DEGREES = 55;
const RADAR_ALERT_MIN_SPEED_MPS_FOR_DIRECTION = 2;
const EARTH_RADIUS_METERS = 6371000;
const PROXIMITY_GRID_CELL_DEGREES = 0.02;
const PROXIMITY_MIN_QUERY_METERS = 300;
const PROXIMITY_QUERY_BUFFER_METERS = 50;
const STATIC_RADARS_DEFER_LOAD_MS = 120;
const STATIC_RADARS_RETRY_LOAD_MS = 30000;
const KNOTS_TO_METERS_PER_SECOND = 0.514444;
const EMPTY_FEATURE_COLLECTION = {
  type: 'FeatureCollection',
  features: [],
};

const toRadians = (value) => (value * Math.PI) / 180;

const distanceMeters = (latitudeA, longitudeA, latitudeB, longitudeB) => {
  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);
  const deltaLat = toRadians(latitudeB - latitudeA);
  const deltaLng = toRadians(longitudeB - longitudeA);
  const a = (Math.sin(deltaLat / 2) ** 2)
    + Math.cos(lat1) * Math.cos(lat2) * (Math.sin(deltaLng / 2) ** 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

const toDegrees = (value) => (value * 180) / Math.PI;

const normalizeDegrees = (value) => {
  if (!Number.isFinite(value)) {
    return null;
  }
  const normalized = ((value % 360) + 360) % 360;
  return normalized;
};

const absoluteBearingDelta = (a, b) => {
  const normalizedA = normalizeDegrees(a);
  const normalizedB = normalizeDegrees(b);
  if (!Number.isFinite(normalizedA) || !Number.isFinite(normalizedB)) {
    return null;
  }
  const delta = Math.abs(normalizedA - normalizedB);
  return Math.min(delta, 360 - delta);
};

const bearingDegrees = (latitudeA, longitudeA, latitudeB, longitudeB) => {
  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);
  const deltaLongitude = toRadians(longitudeB - longitudeA);
  const y = Math.sin(deltaLongitude) * Math.cos(lat2);
  const x = (Math.cos(lat1) * Math.sin(lat2))
    - (Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLongitude));
  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
};

const computeWarningDistanceMeters = (speedKnots) => {
  const speedMetersPerSecond = Number.isFinite(speedKnots) && speedKnots > 0
    ? speedKnots * KNOTS_TO_METERS_PER_SECOND
    : 0;
  const warningDistanceMeters = RADAR_ALERT_BASE_WARNING_METERS
    + (speedMetersPerSecond * RADAR_ALERT_LOOKAHEAD_SECONDS);
  return Math.min(
    RADAR_ALERT_MAX_WARNING_METERS,
    Math.max(RADAR_ALERT_MIN_WARNING_METERS, warningDistanceMeters),
  );
};

const metersToLatitudeDegrees = (meters) => meters / 111320;

const metersToLongitudeDegrees = (meters, latitude) => {
  const cosLatitude = Math.abs(Math.cos(toRadians(latitude)));
  const stableCosLatitude = Math.max(cosLatitude, 0.01);
  return meters / (111320 * stableCosLatitude);
};

const gridKey = (latCell, lngCell) => `${latCell}:${lngCell}`;

const buildProximityIndex = (features) => {
  const cells = new Map();
  let maxRadiusMeters = STATIC_RADARS_DEFAULT_RADIUS_METERS;

  features.forEach((feature) => {
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return;
    }

    const radarLng = Number(coordinates[0]);
    const radarLat = Number(coordinates[1]);
    if (!Number.isFinite(radarLng) || !Number.isFinite(radarLat)) {
      return;
    }

    const radiusMeters = Number(feature?.properties?.radiusMeters);
    if (Number.isFinite(radiusMeters) && radiusMeters > 0) {
      maxRadiusMeters = Math.max(maxRadiusMeters, radiusMeters);
    }

    const latCell = Math.floor(radarLat / PROXIMITY_GRID_CELL_DEGREES);
    const lngCell = Math.floor(radarLng / PROXIMITY_GRID_CELL_DEGREES);
    const key = gridKey(latCell, lngCell);
    const bucket = cells.get(key);
    if (bucket) {
      bucket.push(feature);
    } else {
      cells.set(key, [feature]);
    }
  });

  return {
    cells,
    maxRadiusMeters,
  };
};

const getProximityCandidates = (index, latitude, longitude, queryRadiusHintMeters = PROXIMITY_MIN_QUERY_METERS) => {
  if (!index?.cells?.size) {
    return [];
  }

  const queryRadiusMeters = Math.max(
    Number.isFinite(queryRadiusHintMeters) ? queryRadiusHintMeters : PROXIMITY_MIN_QUERY_METERS,
    (index.maxRadiusMeters || STATIC_RADARS_DEFAULT_RADIUS_METERS) + PROXIMITY_QUERY_BUFFER_METERS,
  );
  const latDelta = metersToLatitudeDegrees(queryRadiusMeters);
  const lngDelta = metersToLongitudeDegrees(queryRadiusMeters, latitude);

  const minLatCell = Math.floor((latitude - latDelta) / PROXIMITY_GRID_CELL_DEGREES);
  const maxLatCell = Math.floor((latitude + latDelta) / PROXIMITY_GRID_CELL_DEGREES);
  const minLngCell = Math.floor((longitude - lngDelta) / PROXIMITY_GRID_CELL_DEGREES);
  const maxLngCell = Math.floor((longitude + lngDelta) / PROXIMITY_GRID_CELL_DEGREES);

  const candidates = [];
  for (let latCell = minLatCell; latCell <= maxLatCell; latCell += 1) {
    for (let lngCell = minLngCell; lngCell <= maxLngCell; lngCell += 1) {
      const bucket = index.cells.get(gridKey(latCell, lngCell));
      if (bucket?.length) {
        candidates.push(...bucket);
      }
    }
  }
  return candidates;
};

const normalizeRadiusOverrides = (overrides) => {
  if (!overrides || typeof overrides !== 'object') {
    return {};
  }
  return Object.entries(overrides).reduce((result, [externalId, radius]) => {
    const normalizedId = typeof externalId === 'string' ? externalId.trim() : '';
    const parsedRadius = Number(radius);
    if (normalizedId && Number.isFinite(parsedRadius) && parsedRadius > 0) {
      result[normalizedId] = parsedRadius;
    }
    return result;
  }, {});
};

const resolveStaticRadarsUrls = () => {
  const candidates = [
    STATIC_RADARS_PATH,
    `/${STATIC_RADARS_PATH}`,
  ];

  if (typeof window === 'undefined') {
    return candidates;
  }

  const pathname = window.location.pathname || '/';
  const normalizedPath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  if (normalizedPath && normalizedPath !== '/') {
    candidates.push(`${normalizedPath}/${STATIC_RADARS_PATH}`);

    const firstSegment = normalizedPath.split('/').filter(Boolean)[0];
    if (firstSegment) {
      candidates.push(`/${firstSegment}/${STATIC_RADARS_PATH}`);
    }
  }

  STATIC_RADARS_COMMON_PREFIXES.forEach((prefix) => {
    candidates.push(`${prefix}/${STATIC_RADARS_PATH}`);
  });

  return [...new Set(candidates)];
};

const loadStaticRadarsGeoJson = async () => {
  const urls = resolveStaticRadarsUrls();

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
        return { data, url };
      }
    } catch {
      // Ignore and try the next candidate URL.
    }
  }

  return { data: null, url: null, attemptedUrls: urls };
};

const openStaticRadarsCacheDb = () => new Promise((resolve) => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    resolve(null);
    return;
  }
  try {
    const request = window.indexedDB.open(STATIC_RADARS_CACHE_DB_NAME, STATIC_RADARS_CACHE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATIC_RADARS_CACHE_STORE_NAME)) {
        db.createObjectStore(STATIC_RADARS_CACHE_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      resolve(null);
    };
  } catch {
    resolve(null);
  }
});

const readStaticRadarsCache = async () => {
  const db = await openStaticRadarsCacheDb();
  if (!db) {
    return null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STATIC_RADARS_CACHE_STORE_NAME, 'readonly');
      const store = tx.objectStore(STATIC_RADARS_CACHE_STORE_NAME);
      const request = store.get(STATIC_RADARS_CACHE_KEY);
      request.onsuccess = () => {
        const value = request.result;
        resolve(value || null);
      };
      request.onerror = () => {
        resolve(null);
      };
      tx.oncomplete = () => {
        db.close();
      };
      tx.onerror = () => {
        db.close();
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
};

const writeStaticRadarsCache = async (data, sourceUrl = '') => {
  if (!data) {
    return;
  }
  const db = await openStaticRadarsCacheDb();
  if (!db) {
    return;
  }
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STATIC_RADARS_CACHE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(STATIC_RADARS_CACHE_STORE_NAME);
      store.put({
        id: STATIC_RADARS_CACHE_KEY,
        data,
        sourceUrl,
        updatedAt: Date.now(),
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
};

const normalizeStaticRadarsData = (data, radiusOverrides = {}) => {
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    return EMPTY_FEATURE_COLLECTION;
  }

  return {
    type: 'FeatureCollection',
    features: data.features
      .map((feature) => {
        const coordinates = feature?.geometry?.coordinates;
        const isPoint = feature?.geometry?.type === 'Point'
          && Array.isArray(coordinates)
          && coordinates.length >= 2
          && Number.isFinite(Number(coordinates[0]))
          && Number.isFinite(Number(coordinates[1]));
        if (!isPoint) {
          return null;
        }

        const properties = feature?.properties || {};
        const externalId = typeof properties.externalId === 'string' ? properties.externalId.trim() : '';
        const speedKph = Number(properties.speedKph);
        if (!Number.isFinite(speedKph)
          || speedKph < STATIC_RADARS_MIN_SPEED_KPH
          || speedKph > STATIC_RADARS_MAX_SPEED_KPH) {
          return null;
        }

        const rawRadius = Number(properties.radiusMeters);
        const overrideRadius = externalId ? Number(radiusOverrides[externalId]) : NaN;
        const radiusMeters = Number.isFinite(overrideRadius) && overrideRadius > 0
          ? overrideRadius
          : Number.isFinite(rawRadius) && rawRadius > 0
          ? rawRadius
          : STATIC_RADARS_DEFAULT_RADIUS_METERS;

        return {
          ...feature,
          properties: {
            ...properties,
            externalId,
            speedKph: Math.round(speedKph),
            radiusMeters,
          },
        };
      })
      .filter(Boolean),
  };
};

const hasValidCoordinates = (position) => Number.isFinite(Number(position?.latitude))
  && Number.isFinite(Number(position?.longitude));

const MapStaticRadars = ({ enabled, selectedPositionOverride = null }) => {
  const id = useId();
  const isAdmin = useAdministrator();
  const selectedId = useSelector((state) => state.devices.selectedId);
  const positionsByDeviceId = useSelector((state) => state.session.positions || {});
  const trackedSelectedPosition = selectedId != null ? positionsByDeviceId[selectedId] : null;
  const selectedPosition = useMemo(() => (
    hasValidCoordinates(selectedPositionOverride) ? selectedPositionOverride : trackedSelectedPosition
  ), [selectedPositionOverride, trackedSelectedPosition]);
  const sourceId = `${id}-static-radars-source`;
  const layerId = `${id}-static-radars-layer`;
  const selectedRadiusSourceId = `${id}-static-radars-selected-radius-source`;
  const selectedRadiusAreaLayerId = `${id}-static-radars-selected-radius-area`;
  const selectedRadiusBorderLayerId = `${id}-static-radars-selected-radius-border`;
  const popupRef = useRef(null);
  const sourceDataRef = useRef(EMPTY_FEATURE_COLLECTION);
  const proximityIndexRef = useRef({ cells: new Map(), maxRadiusMeters: STATIC_RADARS_DEFAULT_RADIUS_METERS });
  const dataLoadedRef = useRef(false);
  const dataLoadingRef = useRef(false);
  const deferredLoadTimerRef = useRef(null);
  const alertAudioRef = useRef(null);
  const alertSequenceTimersRef = useRef([]);
  const insideRadarKeysRef = useRef(new Set());
  const radarCooldownRef = useRef({});
  const [dataVersion, setDataVersion] = useState(0);
  const [visibilityVersion, setVisibilityVersion] = useState(0);

  const imageIds = useMemo(() => ({
    DEFAULT: `${id}-static-radars-generic`,
    SPEED_20: `${id}-static-radars-20`,
    SPEED_30: `${id}-static-radars-30`,
    SPEED_40: `${id}-static-radars-40`,
    SPEED_50: `${id}-static-radars-50`,
    SPEED_60: `${id}-static-radars-60`,
    SPEED_70: `${id}-static-radars-70`,
    SPEED_80: `${id}-static-radars-80`,
    SPEED_90: `${id}-static-radars-90`,
    SPEED_100: `${id}-static-radars-100`,
    SPEED_110: `${id}-static-radars-110`,
    SPEED_120: `${id}-static-radars-120`,
  }), [id]);

  const clearAlertSequence = useCallback(() => {
    alertSequenceTimersRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    alertSequenceTimersRef.current = [];
  }, []);

  const playRadarAlertSequence = useCallback(() => {
    if (!alertAudioRef.current) {
      return;
    }

    clearAlertSequence();
    const playOnce = () => {
      if (!alertAudioRef.current) {
        return;
      }
      alertAudioRef.current.pause();
      alertAudioRef.current.currentTime = 0;
      alertAudioRef.current.play().catch(() => {});
    };

    playOnce();
    for (let index = 1; index < RADAR_ALERT_REPEAT_COUNT; index += 1) {
      const timerId = window.setTimeout(playOnce, index * RADAR_ALERT_REPEAT_GAP_MS);
      alertSequenceTimersRef.current.push(timerId);
    }
  }, [clearAlertSequence]);

  useEffect(() => {
    const onVisibilityChange = () => {
      setVisibilityVersion((current) => current + 1);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (typeof Audio === 'undefined') {
      alertAudioRef.current = null;
      return;
    }
    const audio = new Audio(beepSoundUrl);
    audio.preload = 'auto';
    alertAudioRef.current = audio;
    return () => {
      clearAlertSequence();
      if (alertAudioRef.current) {
        alertAudioRef.current.pause();
        alertAudioRef.current.currentTime = 0;
      }
      alertAudioRef.current = null;
    };
  }, [clearAlertSequence]);

  useEffect(() => {
    if (!enabled) {
      insideRadarKeysRef.current = new Set();
      clearAlertSequence();
      return;
    }

    if (!selectedPosition || !Number.isFinite(Number(selectedPosition.latitude))
      || !Number.isFinite(Number(selectedPosition.longitude))) {
      insideRadarKeysRef.current = new Set();
      return;
    }

    if (document.visibilityState !== 'visible') {
      insideRadarKeysRef.current = new Set();
      clearAlertSequence();
      return;
    }

    const latitude = Number(selectedPosition.latitude);
    const longitude = Number(selectedPosition.longitude);
    const speedKnots = Number(selectedPosition.speed);
    const speedMetersPerSecond = Number.isFinite(speedKnots) && speedKnots > 0
      ? speedKnots * KNOTS_TO_METERS_PER_SECOND
      : 0;
    const courseDegrees = Number(selectedPosition.course);
    const warningDistanceMeters = computeWarningDistanceMeters(speedKnots);
    const queryRadiusMeters = warningDistanceMeters + PROXIMITY_QUERY_BUFFER_METERS;
    const features = getProximityCandidates(
      proximityIndexRef.current,
      latitude,
      longitude,
      queryRadiusMeters,
    );
    if (!features.length) {
      insideRadarKeysRef.current = new Set();
      return;
    }

    const now = Date.now();
    const nextInsideKeys = new Set();
    let shouldPlayAlert = false;

    features.forEach((feature) => {
      const coordinates = feature?.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return;
      }

      const radarLng = Number(coordinates[0]);
      const radarLat = Number(coordinates[1]);
      if (!Number.isFinite(radarLng) || !Number.isFinite(radarLat)) {
        return;
      }

      const radiusMeters = Number(feature?.properties?.radiusMeters);
      if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
        return;
      }

      const externalId = typeof feature?.properties?.externalId === 'string'
        ? feature.properties.externalId.trim()
        : '';
      const fallbackKey = `${radarLat.toFixed(6)}:${radarLng.toFixed(6)}:${Math.round(radiusMeters)}`;
      const radarKey = externalId || fallbackKey;
      const alertDistanceMeters = Math.max(warningDistanceMeters, radiusMeters + 20);
      const releaseDistanceMeters = alertDistanceMeters + RADAR_ALERT_EXIT_HYSTERESIS_METERS;
      const distanceToRadar = distanceMeters(latitude, longitude, radarLat, radarLng);
      const wasInside = insideRadarKeysRef.current.has(radarKey);
      const isInside = distanceToRadar <= alertDistanceMeters;

      if (!isInside && (!wasInside || distanceToRadar > releaseDistanceMeters)) {
        return;
      }

      const radarBearing = bearingDegrees(latitude, longitude, radarLat, radarLng);
      const directionReliable = Number.isFinite(courseDegrees)
        && speedMetersPerSecond >= RADAR_ALERT_MIN_SPEED_MPS_FOR_DIRECTION;
      const headingDelta = directionReliable
        ? absoluteBearingDelta(courseDegrees, radarBearing)
        : null;
      const approaching = !directionReliable
        || (Number.isFinite(headingDelta) && headingDelta <= RADAR_ALERT_MAX_BEARING_DELTA_DEGREES);

      if (!approaching && !wasInside) {
        return;
      }

      nextInsideKeys.add(radarKey);

      if (!wasInside && approaching) {
        const previousAlertAt = radarCooldownRef.current[radarKey] || 0;
        if (now - previousAlertAt >= RADAR_PROXIMITY_COOLDOWN_MS) {
          radarCooldownRef.current[radarKey] = now;
          shouldPlayAlert = true;
        }
      }
    });

    insideRadarKeysRef.current = nextInsideKeys;

    if (shouldPlayAlert) {
      playRadarAlertSequence();
    }
  }, [
    clearAlertSequence,
    dataVersion,
    enabled,
    playRadarAlertSequence,
    selectedPosition,
    visibilityVersion,
  ]);

  useEffect(() => {
    const clearPopup = () => {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };

    const clearDeferredLoad = () => {
      if (deferredLoadTimerRef.current) {
        window.clearTimeout(deferredLoadTimerRef.current);
        deferredLoadTimerRef.current = null;
      }
    };

    const clearSelectedRadius = () => {
      map.getSource(selectedRadiusSourceId)?.setData(EMPTY_FEATURE_COLLECTION);
    };

    const removeSelectedRadiusLayers = () => {
      [selectedRadiusBorderLayerId, selectedRadiusAreaLayerId].forEach((currentLayerId) => {
        if (map.getLayer(currentLayerId)) {
          map.removeLayer(currentLayerId);
        }
      });
      if (map.getSource(selectedRadiusSourceId)) {
        map.removeSource(selectedRadiusSourceId);
      }
    };

    if (!enabled) {
      sourceDataRef.current = EMPTY_FEATURE_COLLECTION;
      proximityIndexRef.current = { cells: new Map(), maxRadiusMeters: STATIC_RADARS_DEFAULT_RADIUS_METERS };
      dataLoadedRef.current = false;
      dataLoadingRef.current = false;
      clearDeferredLoad();
      setDataVersion((current) => current + 1);
      clearPopup();
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
      removeSelectedRadiusLayers();
      Object.values(imageIds).forEach((imgId) => {
        if (map.hasImage(imgId)) {
          map.removeImage(imgId);
        }
      });
      return () => {};
    }

    const iconEntries = [
      { imageId: imageIds.DEFAULT, iconUrl: radarIconUrl },
      { imageId: imageIds.SPEED_20, iconUrl: speed20IconUrl },
      { imageId: imageIds.SPEED_30, iconUrl: speed30IconUrl },
      { imageId: imageIds.SPEED_40, iconUrl: speed40IconUrl },
      { imageId: imageIds.SPEED_50, iconUrl: speed50IconUrl },
      { imageId: imageIds.SPEED_60, iconUrl: speed60IconUrl },
      { imageId: imageIds.SPEED_70, iconUrl: speed70IconUrl },
      { imageId: imageIds.SPEED_80, iconUrl: speed80IconUrl },
      { imageId: imageIds.SPEED_90, iconUrl: speed90IconUrl },
      { imageId: imageIds.SPEED_100, iconUrl: speed100IconUrl },
      { imageId: imageIds.SPEED_110, iconUrl: speed110IconUrl },
      { imageId: imageIds.SPEED_120, iconUrl: speed120IconUrl },
    ];

    const loadSvgAsMapImage = (imageId, iconUrl) => {
      if (map.hasImage(imageId)) {
        return;
      }
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (!map.hasImage(imageId)) {
          const width = image.naturalWidth || image.width || RADAR_ICON_BASE_SIZE;
          const height = image.naturalHeight || image.height || RADAR_ICON_BASE_SIZE;
          const pixelRatio = Math.max(width, height) / RADAR_ICON_BASE_SIZE;
          map.addImage(imageId, image, {
            pixelRatio: Math.max(pixelRatio, 0.01),
          });
        }
      };
      image.src = iconUrl;
    };

    iconEntries.forEach(({ imageId, iconUrl }) => {
      loadSvgAsMapImage(imageId, iconUrl);
    });

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: EMPTY_FEATURE_COLLECTION,
      });
    }

    if (isAdmin) {
      if (!map.getSource(selectedRadiusSourceId)) {
        map.addSource(selectedRadiusSourceId, {
          type: 'geojson',
          data: EMPTY_FEATURE_COLLECTION,
        });
      }
      if (!map.getLayer(selectedRadiusAreaLayerId)) {
        map.addLayer({
          id: selectedRadiusAreaLayerId,
          type: 'fill',
          source: selectedRadiusSourceId,
          paint: {
            'fill-color': STATIC_RADARS_AUDIT_COLOR,
            'fill-opacity': 0.11,
          },
        });
      }
      if (!map.getLayer(selectedRadiusBorderLayerId)) {
        map.addLayer({
          id: selectedRadiusBorderLayerId,
          type: 'line',
          source: selectedRadiusSourceId,
          paint: {
            'line-color': STATIC_RADARS_AUDIT_COLOR,
            'line-width': 2,
            'line-opacity': 0.95,
          },
        });
      }
    } else {
      clearSelectedRadius();
      removeSelectedRadiusLayers();
    }

    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: 'symbol',
        source: sourceId,
        minzoom: STATIC_RADARS_MIN_ZOOM,
        layout: {
          'icon-image': [
            'match',
            ['get', 'speedKph'],
            20, imageIds.SPEED_20,
            30, imageIds.SPEED_30,
            40, imageIds.SPEED_40,
            50, imageIds.SPEED_50,
            60, imageIds.SPEED_60,
            70, imageIds.SPEED_70,
            80, imageIds.SPEED_80,
            90, imageIds.SPEED_90,
            100, imageIds.SPEED_100,
            110, imageIds.SPEED_110,
            120, imageIds.SPEED_120,
            imageIds.DEFAULT,
          ],
          'icon-size': 0.6,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    }

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = isAdmin ? 'pointer' : '';
    };

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    const renderSelectedRadius = (coordinates, radiusMeters) => {
      const radiusFeature = circle([Number(coordinates[0]), Number(coordinates[1])], radiusMeters, {
        steps: 40,
        units: 'meters',
      });
      map.getSource(selectedRadiusSourceId)?.setData({
        type: 'FeatureCollection',
        features: [radiusFeature],
      });
    };

    const updateRadiusInSourceData = (externalId, nextRadiusMeters) => {
      if (!externalId || !sourceDataRef.current?.features) {
        return;
      }
      const nextFeatures = sourceDataRef.current.features.map((feature) => {
        const featureExternalId = feature?.properties?.externalId || '';
        if (featureExternalId !== externalId) {
          return feature;
        }
        return {
          ...feature,
          properties: {
            ...feature.properties,
            radiusMeters: nextRadiusMeters,
          },
        };
      });
      sourceDataRef.current = {
        ...sourceDataRef.current,
        features: nextFeatures,
      };
      proximityIndexRef.current = buildProximityIndex(nextFeatures);
      map.getSource(sourceId)?.setData(sourceDataRef.current);
      setDataVersion((current) => current + 1);
    };

    const onRadarClick = (event) => {
      if (!isAdmin) {
        return;
      }

      const feature = event.features?.[0];
      const coordinates = feature?.geometry?.coordinates;
      if (!feature?.properties || !Array.isArray(coordinates) || coordinates.length < 2) {
        return;
      }

      const speedKph = Number(feature.properties.speedKph);
      const rawRadiusMeters = Number(feature.properties.radiusMeters);
      let currentRadiusMeters = Number.isFinite(rawRadiusMeters) && rawRadiusMeters > 0
        ? rawRadiusMeters
        : STATIC_RADARS_DEFAULT_RADIUS_METERS;
      const externalId = typeof feature.properties.externalId === 'string'
        ? feature.properties.externalId.trim()
        : '';
      const externalIdLabel = externalId || '-';
      const radarTitle = Number.isFinite(speedKph)
        ? `Radar ${Math.round(speedKph)} km/h`
        : 'Radar';

      if (isAdmin) {
        renderSelectedRadius(coordinates, currentRadiusMeters);
      }

      clearPopup();
      const container = document.createElement('div');
      container.style.minWidth = '220px';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '6px';

      const title = document.createElement('div');
      title.style.fontWeight = '700';
      title.textContent = radarTitle;
      container.appendChild(title);

      const idLine = document.createElement('div');
      idLine.style.fontSize = '12px';
      idLine.textContent = `ID catalogo: ${externalIdLabel}`;
      container.appendChild(idLine);

      const radiusLine = document.createElement('div');
      radiusLine.style.fontSize = '12px';
      radiusLine.textContent = `Raio de alerta: ${Math.round(currentRadiusMeters)} m`;
      container.appendChild(radiusLine);

      if (isAdmin) {
        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.gap = '8px';
        controls.style.alignItems = 'center';

        const radiusInput = document.createElement('input');
        radiusInput.type = 'number';
        radiusInput.min = String(STATIC_RADARS_EDIT_MIN_RADIUS_METERS);
        radiusInput.max = String(STATIC_RADARS_EDIT_MAX_RADIUS_METERS);
        radiusInput.step = '1';
        radiusInput.value = String(Math.round(currentRadiusMeters));
        radiusInput.style.width = '84px';
        radiusInput.style.height = '30px';
        radiusInput.style.border = '1px solid #CBD5E1';
        radiusInput.style.borderRadius = '6px';
        radiusInput.style.padding = '0 8px';

        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.textContent = 'Salvar raio';
        saveButton.style.height = '30px';
        saveButton.style.border = '1px solid #CBD5E1';
        saveButton.style.borderRadius = '6px';
        saveButton.style.padding = '0 10px';
        saveButton.style.background = '#FFFFFF';
        saveButton.style.cursor = externalId ? 'pointer' : 'not-allowed';
        saveButton.disabled = !externalId;

        controls.appendChild(radiusInput);
        controls.appendChild(saveButton);
        container.appendChild(controls);

        const statusLine = document.createElement('div');
        statusLine.style.fontSize = '12px';
        statusLine.style.color = '#475569';
        statusLine.textContent = externalId
          ? `Ajuste admin (${STATIC_RADARS_EDIT_MIN_RADIUS_METERS}-${STATIC_RADARS_EDIT_MAX_RADIUS_METERS}m)`
          : 'Sem externalId: nao e possivel salvar override.';
        container.appendChild(statusLine);

        saveButton.onclick = async () => {
          if (!externalId) {
            return;
          }
          const nextRadiusMeters = Number(radiusInput.value);
          if (!Number.isFinite(nextRadiusMeters)
              || nextRadiusMeters < STATIC_RADARS_EDIT_MIN_RADIUS_METERS
              || nextRadiusMeters > STATIC_RADARS_EDIT_MAX_RADIUS_METERS) {
            statusLine.style.color = '#B91C1C';
            statusLine.textContent = `Informe entre ${STATIC_RADARS_EDIT_MIN_RADIUS_METERS} e ${STATIC_RADARS_EDIT_MAX_RADIUS_METERS} metros.`;
            return;
          }

          saveButton.disabled = true;
          radiusInput.disabled = true;
          statusLine.style.color = '#475569';
          statusLine.textContent = 'Salvando...';
          try {
            const response = await fetchOrThrow('/api/admin/static-radars/radius', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                externalId,
                radiusMeters: nextRadiusMeters,
              }),
            });
            const saved = await response.json();
            const savedRadius = Number(saved?.radiusMeters);
            currentRadiusMeters = Number.isFinite(savedRadius) && savedRadius > 0
              ? savedRadius
              : nextRadiusMeters;

            radiusInput.value = String(Math.round(currentRadiusMeters));
            radiusLine.textContent = `Raio de alerta: ${Math.round(currentRadiusMeters)} m`;
            renderSelectedRadius(coordinates, currentRadiusMeters);
            updateRadiusInSourceData(externalId, currentRadiusMeters);

            statusLine.style.color = '#166534';
            statusLine.textContent = 'Raio salvo com sucesso.';
          } catch {
            statusLine.style.color = '#B91C1C';
            statusLine.textContent = 'Falha ao salvar raio.';
          } finally {
            saveButton.disabled = false;
            radiusInput.disabled = false;
          }
        };
      }

      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: '260px',
      })
        .setLngLat([Number(coordinates[0]), Number(coordinates[1])])
        .setDOMContent(container)
        .addTo(map);

      popupRef.current.on('close', () => {
        clearSelectedRadius();
      });
    };

    if (isAdmin) {
      map.on('mouseenter', layerId, onMouseEnter);
      map.on('mouseleave', layerId, onMouseLeave);
      map.on('click', layerId, onRadarClick);
    }

    const loadRadiusOverrides = async () => {
      if (!isAdmin) {
        return {};
      }
      try {
        const response = await fetchOrThrow('/api/admin/static-radars/radius');
        const payload = await response.json();
        return normalizeRadiusOverrides(payload?.overrides);
      } catch {
        return {};
      }
    };

    const applyRadarsData = (rawData, radiusOverrides = {}) => {
      if (!rawData) {
        return;
      }
      const normalizedData = normalizeStaticRadarsData(rawData, radiusOverrides);
      sourceDataRef.current = normalizedData;
      proximityIndexRef.current = buildProximityIndex(normalizedData.features || []);
      map.getSource(sourceId)?.setData(normalizedData);
      dataLoadedRef.current = true;
      setDataVersion((current) => current + 1);
    };

    const scheduleRetryLoad = () => {
      if (dataLoadedRef.current || dataLoadingRef.current || deferredLoadTimerRef.current) {
        return;
      }
      deferredLoadTimerRef.current = window.setTimeout(() => {
        deferredLoadTimerRef.current = null;
        loadData();
      }, STATIC_RADARS_RETRY_LOAD_MS);
    };

    const loadData = async () => {
      if (dataLoadedRef.current || dataLoadingRef.current) {
        return;
      }

      dataLoadingRef.current = true;
      try {
        const radiusOverrides = await loadRadiusOverrides();
        const cachedEntry = await readStaticRadarsCache();
        if (cachedEntry?.data) {
          applyRadarsData(cachedEntry.data, radiusOverrides);
        }

        const cachedUpdatedAt = Number(cachedEntry?.updatedAt);
        const cacheAgeMs = Number.isFinite(cachedUpdatedAt)
          ? Date.now() - cachedUpdatedAt
          : Number.POSITIVE_INFINITY;
        const cacheIsFresh = cacheAgeMs >= 0 && cacheAgeMs <= STATIC_RADARS_CACHE_MAX_AGE_MS;

        if (!cacheIsFresh || !cachedEntry?.data) {
          const networkResult = await loadStaticRadarsGeoJson();
          if (networkResult?.data) {
            applyRadarsData(networkResult.data, radiusOverrides);
            await writeStaticRadarsCache(networkResult.data, networkResult.url);
          } else if (!cachedEntry?.data) {
            console.warn(
              `Falha ao carregar ${STATIC_RADARS_FILE}. URLs testadas:`,
              networkResult?.attemptedUrls || resolveStaticRadarsUrls(),
            );
          }
        }
      } catch (error) {
        console.warn(`Erro ao carregar ${STATIC_RADARS_FILE}`, error);
      } finally {
        dataLoadingRef.current = false;
        if (!dataLoadedRef.current) {
          scheduleRetryLoad();
        }
      }
    };

    const scheduleLoadData = () => {
      if (dataLoadedRef.current || dataLoadingRef.current) {
        return;
      }
      if (deferredLoadTimerRef.current) {
        return;
      }
      deferredLoadTimerRef.current = window.setTimeout(() => {
        deferredLoadTimerRef.current = null;
        loadData();
      }, STATIC_RADARS_DEFER_LOAD_MS);
    };

    // Keep a resilient load trigger. In some sessions map.loaded() can be false
    // after initial style load, and waiting only for a future 'load' event can miss the fetch.
    const triggerLoadData = () => {
      scheduleLoadData();
    };
    map.once('load', triggerLoadData);
    map.on('styledata', triggerLoadData);
    map.on('idle', triggerLoadData);
    scheduleLoadData();

    return () => {
      clearDeferredLoad();
      dataLoadedRef.current = false;
      dataLoadingRef.current = false;
      map.off('load', triggerLoadData);
      map.off('styledata', triggerLoadData);
      map.off('idle', triggerLoadData);
      if (isAdmin) {
        map.off('mouseenter', layerId, onMouseEnter);
        map.off('mouseleave', layerId, onMouseLeave);
        map.off('click', layerId, onRadarClick);
      }
      clearPopup();
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
      removeSelectedRadiusLayers();
      Object.values(imageIds).forEach((imgId) => {
        if (map.hasImage(imgId)) {
          map.removeImage(imgId);
        }
      });
      sourceDataRef.current = EMPTY_FEATURE_COLLECTION;
      proximityIndexRef.current = { cells: new Map(), maxRadiusMeters: STATIC_RADARS_DEFAULT_RADIUS_METERS };
    };
  }, [
    enabled,
    imageIds,
    isAdmin,
    layerId,
    selectedRadiusAreaLayerId,
    selectedRadiusBorderLayerId,
    selectedRadiusSourceId,
    sourceId,
  ]);

  return null;
};

export default MapStaticRadars;

