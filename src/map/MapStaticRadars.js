import {
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';
import circle from '@turf/circle';
import maplibregl from 'maplibre-gl';
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
import speed120IconUrl from '../resources/images/icon/speed-limit-120-sign-icon.svg';
import { useAdministrator } from '../common/util/permissions';
import { useTranslation } from '../common/components/LocalizationProvider';

const STATIC_RADARS_MIN_ZOOM = 10;
const RADAR_ICON_BASE_SIZE = 64;
const STATIC_RADARS_MIN_SPEED_KPH = 20;
const STATIC_RADARS_MAX_SPEED_KPH = 120;
const STATIC_RADARS_DEFAULT_RADIUS_METERS = 30;
const STATIC_RADARS_FILE = 'scdb-radars-br.geojson';
const STATIC_RADARS_PATH = `radars/${STATIC_RADARS_FILE}`;
const STATIC_RADARS_COMMON_PREFIXES = ['/login', '/rastreador'];
const STATIC_RADARS_AUDIT_COLOR = '#E11D48';
const EMPTY_FEATURE_COLLECTION = {
  type: 'FeatureCollection',
  features: [],
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
    } catch (error) {
      // Ignore and try the next candidate URL.
    }
  }

  return { data: null, url: null, attemptedUrls: urls };
};

const normalizeStaticRadarsData = (data) => {
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
        const speedKph = Number(properties.speedKph);
        if (!Number.isFinite(speedKph)
          || speedKph < STATIC_RADARS_MIN_SPEED_KPH
          || speedKph > STATIC_RADARS_MAX_SPEED_KPH) {
          return null;
        }

        const rawRadius = Number(properties.radiusMeters);
        const radiusMeters = Number.isFinite(rawRadius) && rawRadius > 0
          ? rawRadius
          : STATIC_RADARS_DEFAULT_RADIUS_METERS;

        return {
          ...feature,
          properties: {
            ...properties,
            speedKph: Math.round(speedKph),
            radiusMeters,
          },
        };
      })
      .filter(Boolean),
  };
};

const MapStaticRadars = ({ enabled }) => {
  const id = useId();
  const isAdmin = useAdministrator();
  const t = useTranslation();
  const sourceId = `${id}-static-radars-source`;
  const layerId = `${id}-static-radars-layer`;
  const selectedRadiusSourceId = `${id}-static-radars-selected-radius-source`;
  const selectedRadiusAreaLayerId = `${id}-static-radars-selected-radius-area`;
  const selectedRadiusBorderLayerId = `${id}-static-radars-selected-radius-border`;
  const popupRef = useRef(null);

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
    SPEED_120: `${id}-static-radars-120`,
  }), [id]);

  useEffect(() => {
    const clearPopup = () => {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
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
      map.getCanvas().style.cursor = 'pointer';
    };

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    const onRadarClick = (event) => {
      const feature = event.features?.[0];
      const coordinates = feature?.geometry?.coordinates;
      if (!feature?.properties || !Array.isArray(coordinates) || coordinates.length < 2) {
        return;
      }

      const speedKph = Number(feature.properties.speedKph);
      const rawRadiusMeters = Number(feature.properties.radiusMeters);
      const radiusMeters = Number.isFinite(rawRadiusMeters) && rawRadiusMeters > 0
        ? rawRadiusMeters
        : STATIC_RADARS_DEFAULT_RADIUS_METERS;
      const externalId = feature.properties.externalId || '-';
      const radarTitle = Number.isFinite(speedKph)
        ? `Radar ${Math.round(speedKph)} km/h`
        : 'Radar';

      if (isAdmin) {
        const radiusFeature = circle([Number(coordinates[0]), Number(coordinates[1])], radiusMeters, {
          steps: 40,
          units: 'meters',
        });
        map.getSource(selectedRadiusSourceId)?.setData({
          type: 'FeatureCollection',
          features: [radiusFeature],
        });
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
      idLine.textContent = `ID catalogo: ${externalId}`;
      container.appendChild(idLine);

      const radiusLine = document.createElement('div');
      radiusLine.style.fontSize = '12px';
      radiusLine.textContent = `Raio de alerta: ${Math.round(radiusMeters)} m`;
      container.appendChild(radiusLine);

      if (isAdmin) {
        const adminLine = document.createElement('div');
        adminLine.style.fontSize = '12px';
        adminLine.style.color = '#475569';
        adminLine.textContent = t('radarPopupRadius');
        container.appendChild(adminLine);
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

    map.on('mouseenter', layerId, onMouseEnter);
    map.on('mouseleave', layerId, onMouseLeave);
    map.on('click', layerId, onRadarClick);

    const loadData = async () => {
      try {
        const result = await loadStaticRadarsGeoJson();
        if (!result?.data) {
          // eslint-disable-next-line no-console
          console.warn(
            `Falha ao carregar ${STATIC_RADARS_FILE}. URLs testadas:`,
            result?.attemptedUrls || resolveStaticRadarsUrls(),
          );
          return;
        }

        map.getSource(sourceId)?.setData(normalizeStaticRadarsData(result.data));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`Erro ao carregar ${STATIC_RADARS_FILE}`, error);
      }
    };

    loadData();

    return () => {
      map.off('mouseenter', layerId, onMouseEnter);
      map.off('mouseleave', layerId, onMouseLeave);
      map.off('click', layerId, onRadarClick);
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
    t,
  ]);

  return null;
};

export default MapStaticRadars;

