import {
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';
import circle from '@turf/circle';
import maplibregl from 'maplibre-gl';
import { useTheme } from '@mui/material/styles';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { map } from './core/MapView';
import { findFonts, geofenceToFeature } from './core/mapUtil';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAdministrator } from '../common/util/permissions';
import {
  getRadarRadiusMeters,
  getRadarSpeedLimitKph,
  isRadarActive,
  parseCircleArea,
} from '../common/util/radar';

const RADAR_COLOR = '#E11D48';

const collectCoordinates = (coordinates, result = []) => {
  if (Array.isArray(coordinates) && coordinates.length === 2
      && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])) {
    result.push(coordinates);
    return result;
  }
  if (Array.isArray(coordinates)) {
    coordinates.forEach((coordinate) => collectCoordinates(coordinate, result));
  }
  return result;
};

const getGeometryCenter = (geometry) => {
  const coordinates = collectCoordinates(geometry?.coordinates);
  if (!coordinates.length) {
    return null;
  }
  const bounds = coordinates.reduce((currentBounds, coordinate) => ({
    minLng: Math.min(currentBounds.minLng, coordinate[0]),
    maxLng: Math.max(currentBounds.maxLng, coordinate[0]),
    minLat: Math.min(currentBounds.minLat, coordinate[1]),
    maxLat: Math.max(currentBounds.maxLat, coordinate[1]),
  }), {
    minLng: coordinates[0][0],
    maxLng: coordinates[0][0],
    minLat: coordinates[0][1],
    maxLat: coordinates[0][1],
  });
  return [
    (bounds.minLng + bounds.maxLng) / 2,
    (bounds.minLat + bounds.maxLat) / 2,
  ];
};

const MapRadar = ({ enabled }) => {
  const theme = useTheme();
  const id = useId();
  const areaLayerId = `${id}-radar-area`;
  const borderLayerId = `${id}-radar-border`;
  const markerLayerId = `${id}-radar-marker`;
  const labelLayerId = `${id}-radar-label`;

  const navigate = useNavigate();
  const t = useTranslation();
  const isAdmin = useAdministrator();
  const geofences = useSelector((state) => state.geofences.items);
  const popupRef = useRef(null);
  const viewStateRef = useRef({ isAdmin, t, navigate });

  useEffect(() => {
    viewStateRef.current = { isAdmin, t, navigate };
  }, [isAdmin, t, navigate]);

  const radarFeatures = useMemo(() => {
    const features = [];
    Object.values(geofences)
      .filter((geofence) => !geofence.attributes?.hide && isRadarActive(geofence))
      .forEach((geofence) => {
        const circleArea = parseCircleArea(geofence.area);
        const baseFeature = geofenceToFeature(theme, geofence);
        const geometry = circleArea
          ? circle([circleArea.longitude, circleArea.latitude], getRadarRadiusMeters(geofence), { steps: 40, units: 'meters' }).geometry
          : baseFeature.geometry;
        const markerCoordinates = circleArea
          ? [circleArea.longitude, circleArea.latitude]
          : getGeometryCenter(baseFeature.geometry);
        if (!geometry || !markerCoordinates) {
          return;
        }
        const radius = getRadarRadiusMeters(geofence);
        const speedLimit = getRadarSpeedLimitKph(geofence);
        const sharedProperties = {
          radarId: geofence.id,
          radarName: geofence.name || '-',
          radarLimitKph: speedLimit,
          radarRadiusMeters: radius,
        };
        features.push({
          type: 'Feature',
          geometry,
          properties: {
            ...sharedProperties,
            featureType: 'area',
          },
        });
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: markerCoordinates,
          },
          properties: {
            ...sharedProperties,
            featureType: 'marker',
          },
        });
      });
    return {
      type: 'FeatureCollection',
      features,
    };
  }, [geofences, theme]);

  const clearPopup = () => {
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  };

  const removeLayerAndSource = () => {
    clearPopup();
    [labelLayerId, markerLayerId, borderLayerId, areaLayerId].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });
    if (map.getSource(id)) {
      map.removeSource(id);
    }
  };

  useEffect(() => {
    if (!enabled) {
      removeLayerAndSource();
      return () => {};
    }

    map.addSource(id, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });
    map.addLayer({
      id: areaLayerId,
      source: id,
      type: 'fill',
      filter: ['==', ['get', 'featureType'], 'area'],
      paint: {
        'fill-color': RADAR_COLOR,
        'fill-opacity': 0.14,
      },
    });
    map.addLayer({
      id: borderLayerId,
      source: id,
      type: 'line',
      filter: ['==', ['get', 'featureType'], 'area'],
      paint: {
        'line-color': RADAR_COLOR,
        'line-width': 2,
        'line-opacity': 0.95,
      },
    });
    map.addLayer({
      id: markerLayerId,
      source: id,
      type: 'symbol',
      filter: ['==', ['get', 'featureType'], 'marker'],
      layout: {
        'icon-image': 'default-error',
        'icon-size': 0.9,
        'icon-allow-overlap': true,
      },
    });
    map.addLayer({
      id: labelLayerId,
      source: id,
      type: 'symbol',
      filter: ['==', ['get', 'featureType'], 'marker'],
      layout: {
        'text-field': ['concat', 'Radar ', ['get', 'radarName']],
        'text-font': findFonts(map),
        'text-size': 11,
        'text-offset': [0, 1.8],
      },
      paint: {
        'text-color': '#1F2937',
        'text-halo-color': '#FFFFFF',
        'text-halo-width': 1,
      },
    });

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    const onRadarClick = (event) => {
      const feature = event.features?.[0];
      if (!feature?.properties) {
        return;
      }
      const {
        isAdmin: admin,
        t: translate,
        navigate: navigateTo,
      } = viewStateRef.current;

      clearPopup();

      const radarName = feature.properties.radarName || '-';
      const radarId = Number(feature.properties.radarId);
      const speedLimit = Number(feature.properties.radarLimitKph);
      const radius = Number(feature.properties.radarRadiusMeters);

      const container = document.createElement('div');
      container.style.minWidth = '220px';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '6px';

      const title = document.createElement('div');
      title.style.fontWeight = '700';
      title.textContent = `Radar: ${radarName}`;
      container.appendChild(title);

      const limitLine = document.createElement('div');
      limitLine.style.fontSize = '12px';
      limitLine.textContent = `${translate('radarPopupLimit')}: ${Math.round(speedLimit || 0)} km/h`;
      container.appendChild(limitLine);

      const radiusLine = document.createElement('div');
      radiusLine.style.fontSize = '12px';
      radiusLine.textContent = `${translate('radarPopupRadius')}: ${Math.round(radius || 0)} m`;
      container.appendChild(radiusLine);

      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.style.minHeight = '44px';
      actionButton.style.padding = '10px 12px';
      actionButton.style.border = '1px solid #CBD5E1';
      actionButton.style.borderRadius = '8px';
      actionButton.style.background = '#FFFFFF';
      actionButton.style.cursor = 'pointer';
      actionButton.style.textAlign = 'left';
      actionButton.style.fontWeight = '600';
      actionButton.textContent = admin ? translate('radarEdit') : translate('sharedClose');
      actionButton.onclick = () => {
        if (admin && Number.isFinite(radarId)) {
          navigateTo(`/settings/geofence/${radarId}`);
        } else {
          clearPopup();
        }
      };
      container.appendChild(actionButton);

      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: '260px',
      })
        .setLngLat(event.lngLat)
        .setDOMContent(container)
        .addTo(map);
    };

    [areaLayerId, markerLayerId, labelLayerId].forEach((layerId) => {
      map.on('mouseenter', layerId, onMouseEnter);
      map.on('mouseleave', layerId, onMouseLeave);
      map.on('click', layerId, onRadarClick);
    });

    return () => {
      [areaLayerId, markerLayerId, labelLayerId].forEach((layerId) => {
        map.off('mouseenter', layerId, onMouseEnter);
        map.off('mouseleave', layerId, onMouseLeave);
        map.off('click', layerId, onRadarClick);
      });
      removeLayerAndSource();
    };
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      map.getSource(id)?.setData(radarFeatures);
    }
  }, [enabled, radarFeatures]);

  return null;
};

export default MapRadar;
