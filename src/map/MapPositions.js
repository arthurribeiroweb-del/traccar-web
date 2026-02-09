import {
  useId, useCallback, useEffect, useRef,
} from 'react';
import { useSelector } from 'react-redux';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { map } from './core/MapView';
import { formatTime } from '../common/util/formatter';
import { getDeviceDisplayName } from '../common/util/deviceUtils';
import {
  VEHICLE_MARKER_IMAGE_KEY,
} from './core/preloadImages';
import { useAttributePreference } from '../common/util/preferences';
import { useCatchCallback } from '../reactHelper';
import { findFonts } from './core/mapUtil';

const HEADING_DELTA_THRESHOLD = 5;
const HEADING_UPDATE_THROTTLE_MS = 200;
const MARKER_SIZE_MIN_SCALE = 40 / 44;
const SELECTED_SIZE_MULTIPLIER = 48 / 44;

const normalizeAngle = (angle) => ((angle % 360) + 360) % 360;

const shortestAngleDelta = (from, to) => {
  const fromAngle = normalizeAngle(from);
  const toAngle = normalizeAngle(to);
  const diff = toAngle - fromAngle;
  if (diff > 180) {
    return diff - 360;
  }
  if (diff < -180) {
    return diff + 360;
  }
  return diff;
};

const MapPositions = ({
  positions, onMapClick, onMarkerClick, selectedPosition, titleField,
}) => {
  const id = useId();
  const clusters = `${id}-clusters`;
  const selected = `${id}-selected`;

  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const rawIconScale = useAttributePreference('iconScale', desktop ? 1 : MARKER_SIZE_MIN_SCALE);
  const iconScale = Math.max(MARKER_SIZE_MIN_SCALE, rawIconScale);
  const hoverIconScale = desktop ? Math.max(iconScale, SELECTED_SIZE_MULTIPLIER) : iconScale;
  const selectedIconScale = desktop ? Math.max(iconScale * SELECTED_SIZE_MULTIPLIER, SELECTED_SIZE_MULTIPLIER) : iconScale;

  const devices = useSelector((state) => state.devices.items);
  const selectedDeviceId = useSelector((state) => state.devices.selectedId);
  const headingByDeviceId = useSelector((state) => state.devices.headingByDeviceId || {});

  const mapCluster = useAttributePreference('mapCluster', true);
  const directionType = useAttributePreference('mapDirection', 'selected');

  const rotationCacheRef = useRef({});
  const hoveredFeatureRef = useRef({});

  const setHoveredFeature = useCallback((sourceId, featureId) => {
    const previous = hoveredFeatureRef.current[sourceId];
    if (previous != null && previous !== featureId) {
      map.setFeatureState({ source: sourceId, id: previous }, { hover: false });
    }
    if (featureId != null && previous !== featureId) {
      map.setFeatureState({ source: sourceId, id: featureId }, { hover: true });
    }
    hoveredFeatureRef.current[sourceId] = featureId ?? null;
  }, []);

  const resolveRotation = useCallback((deviceId, rawRotation, showDirection) => {
    const now = Date.now();
    const cached = rotationCacheRef.current[deviceId] || { rotation: 0, updatedAt: 0 };
    if (!showDirection || !Number.isFinite(rawRotation)) {
      rotationCacheRef.current[deviceId] = { rotation: 0, updatedAt: now };
      return 0;
    }

    const nextRotation = normalizeAngle(rawRotation);
    const delta = Math.abs(shortestAngleDelta(cached.rotation, nextRotation));
    if (now - cached.updatedAt < HEADING_UPDATE_THROTTLE_MS || delta < HEADING_DELTA_THRESHOLD) {
      return cached.rotation;
    }

    rotationCacheRef.current[deviceId] = {
      rotation: nextRotation,
      updatedAt: now,
    };
    return nextRotation;
  }, []);

  const createFeature = useCallback((position) => {
    const device = devices[position.deviceId];
    const computedHeading = headingByDeviceId[position.deviceId];
    const fallbackCourse = Number(position.course);
    const rotationSource = Number.isFinite(computedHeading) ? computedHeading : fallbackCourse;
    const hasDirection = Number.isFinite(rotationSource);

    let showDirection;
    switch (directionType) {
      case 'none':
        showDirection = false;
        break;
      case 'all':
        showDirection = hasDirection;
        break;
      default:
        showDirection = selectedPosition?.id === position.id && hasDirection;
        break;
    }

    return {
      id: position.id,
      deviceId: position.deviceId,
      name: getDeviceDisplayName(device) || device.name,
      fixTime: formatTime(position.fixTime, 'seconds'),
      markerIcon: VEHICLE_MARKER_IMAGE_KEY,
      rotation: resolveRotation(position.deviceId, rotationSource, showDirection),
    };
  }, [devices, headingByDeviceId, directionType, selectedPosition?.id, resolveRotation]);

  const onMouseEnter = useCallback(() => {
    map.getCanvas().style.cursor = 'pointer';
  }, []);

  const onMouseLeave = useCallback((sourceId) => {
    map.getCanvas().style.cursor = '';
    setHoveredFeature(sourceId, null);
  }, [setHoveredFeature]);

  const onMouseMove = useCallback((sourceId, event) => {
    const featureId = event?.features?.[0]?.id;
    setHoveredFeature(sourceId, featureId);
  }, [setHoveredFeature]);

  const onMapClickCallback = useCallback((event) => {
    if (!event.defaultPrevented && onMapClick) {
      onMapClick(event.lngLat.lat, event.lngLat.lng);
    }
  }, [onMapClick]);

  const onMarkerClickCallback = useCallback((event) => {
    event.preventDefault();
    const feature = event.features[0];
    if (onMarkerClick) {
      onMarkerClick(feature.properties.id, feature.properties.deviceId);
    }
  }, [onMarkerClick]);

  const onClusterClick = useCatchCallback(async (event) => {
    event.preventDefault();
    const features = map.queryRenderedFeatures(event.point, {
      layers: [clusters],
    });
    const clusterId = features[0].properties.cluster_id;
    const zoom = await map.getSource(id).getClusterExpansionZoom(clusterId);
    map.easeTo({
      center: features[0].geometry.coordinates,
      zoom,
    });
  }, [clusters]);

  useEffect(() => {
    map.addSource(id, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
      cluster: mapCluster,
      clusterMaxZoom: 14,
      clusterRadius: 50,
    });
    map.addSource(selected, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });

    const sourceHandlers = {};
    [id, selected].forEach((sourceId) => {
      const currentIconScale = sourceId === selected ? selectedIconScale : iconScale;
      const currentTextOffset = sourceId === selected
        ? [0, -2 * selectedIconScale]
        : [0, -2 * iconScale];
      const leaveHandler = () => onMouseLeave(sourceId);
      const moveHandler = (event) => onMouseMove(sourceId, event);

      map.addLayer({
        id: sourceId,
        type: 'symbol',
        source: sourceId,
        filter: ['!has', 'point_count'],
        layout: {
          'icon-image': '{markerIcon}',
          'icon-size': sourceId === id
            ? ['case', ['boolean', ['feature-state', 'hover'], false], hoverIconScale, currentIconScale]
            : currentIconScale,
          'icon-allow-overlap': true,
          'icon-rotate': ['get', 'rotation'],
          'icon-rotation-alignment': 'map',
          'icon-anchor': 'center',
          'icon-offset': [0, 0.15],
          'text-field': `{${titleField || 'name'}}`,
          'text-allow-overlap': true,
          'text-anchor': 'bottom',
          'text-offset': currentTextOffset,
          'text-font': findFonts(map),
          'text-size': 12,
          'symbol-sort-key': ['get', 'id'],
        },
        paint: {
          'text-halo-color': 'white',
          'text-halo-width': 2,
        },
      });
      map.on('mouseenter', sourceId, onMouseEnter);
      map.on('mouseleave', sourceId, leaveHandler);
      map.on('mousemove', sourceId, moveHandler);
      map.on('click', sourceId, onMarkerClickCallback);
      sourceHandlers[sourceId] = { leaveHandler, moveHandler };
    });

    map.addLayer({
      id: clusters,
      type: 'symbol',
      source: id,
      filter: ['has', 'point_count'],
      layout: {
        'icon-image': 'background',
        'icon-size': iconScale,
        'text-field': '{point_count_abbreviated}',
        'text-font': findFonts(map),
        'text-size': 14,
      },
    });

    const clusterLeaveHandler = () => onMouseLeave(id);
    map.on('mouseenter', clusters, onMouseEnter);
    map.on('mouseleave', clusters, clusterLeaveHandler);
    map.on('click', clusters, onClusterClick);
    map.on('click', onMapClickCallback);

    return () => {
      map.off('mouseenter', clusters, onMouseEnter);
      map.off('mouseleave', clusters, clusterLeaveHandler);
      map.off('click', clusters, onClusterClick);
      map.off('click', onMapClickCallback);

      if (map.getLayer(clusters)) {
        map.removeLayer(clusters);
      }

      [id, selected].forEach((sourceId) => {
        map.off('mouseenter', sourceId, onMouseEnter);
        map.off('mouseleave', sourceId, sourceHandlers[sourceId].leaveHandler);
        map.off('mousemove', sourceId, sourceHandlers[sourceId].moveHandler);
        map.off('click', sourceId, onMarkerClickCallback);

        const hoveredId = hoveredFeatureRef.current[sourceId];
        if (hoveredId != null) {
          map.setFeatureState({ source: sourceId, id: hoveredId }, { hover: false });
          hoveredFeatureRef.current[sourceId] = null;
        }

        if (map.getLayer(sourceId)) {
          map.removeLayer(sourceId);
        }
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      });
    };
  }, [
    mapCluster,
    clusters,
    iconScale,
    selectedIconScale,
    hoverIconScale,
    onMarkerClickCallback,
    onClusterClick,
    onMapClickCallback,
    onMouseEnter,
    onMouseLeave,
    onMouseMove,
    id,
    selected,
    titleField,
  ]);

  useEffect(() => {
    [id, selected].forEach((sourceId) => {
      map.getSource(sourceId)?.setData({
        type: 'FeatureCollection',
        features: positions.filter((it) => devices.hasOwnProperty(it.deviceId))
          .filter((it) => (sourceId === id ? it.deviceId !== selectedDeviceId : it.deviceId === selectedDeviceId))
          .map((position) => ({
            id: position.id,
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [position.longitude, position.latitude],
            },
            properties: createFeature(position),
          })),
      });
    });
  }, [
    id,
    selected,
    devices,
    positions,
    selectedDeviceId,
    createFeature,
  ]);

  return null;
};

export default MapPositions;
