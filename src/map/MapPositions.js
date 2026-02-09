import {
  useId, useCallback, useEffect, useRef,
} from 'react';
import { useSelector } from 'react-redux';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { map } from './core/MapView';
import { formatTime, getStatusColor } from '../common/util/formatter';
import { getDeviceDisplayName } from '../common/util/deviceUtils';
import { VEHICLE_MARKER_IMAGE_KEY } from './core/preloadImages';
import { useAttributePreference } from '../common/util/preferences';
import { useCatchCallback } from '../reactHelper';
import { findFonts } from './core/mapUtil';

const HEADING_DELTA_THRESHOLD = 5;
const HEADING_UPDATE_THROTTLE_MS = 200;

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

const MapPositions = ({ positions, onMapClick, onMarkerClick, showStatus }) => {
  const id = useId();
  const clusters = `${id}-clusters`;
  const selected = `${id}-selected`;

  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const iconScale = useAttributePreference('iconScale', desktop ? 0.75 : 1) * 0.95;

  const devices = useSelector((state) => state.devices.items);
  const selectedDeviceId = useSelector((state) => state.devices.selectedId);

  const mapCluster = useAttributePreference('mapCluster', true);
  const rotationCacheRef = useRef({});

  const resolveRotation = (deviceId, position) => {
    const now = Date.now();
    const nextCourse = Number(position.course);
    const cached = rotationCacheRef.current[deviceId] || { rotation: 0, updatedAt: 0 };

    if (!Number.isFinite(nextCourse)) {
      rotationCacheRef.current[deviceId] = { rotation: 0, updatedAt: now };
      return 0;
    }

    const nextRotation = normalizeAngle(nextCourse);
    const delta = Math.abs(shortestAngleDelta(cached.rotation, nextRotation));
    if (now - cached.updatedAt < HEADING_UPDATE_THROTTLE_MS || delta < HEADING_DELTA_THRESHOLD) {
      return cached.rotation;
    }

    rotationCacheRef.current[deviceId] = {
      rotation: nextRotation,
      updatedAt: now,
    };
    return nextRotation;
  };

  const createFeature = (position) => {
    const device = devices[position.deviceId];
    return {
      id: position.id,
      deviceId: position.deviceId,
      name: getDeviceDisplayName(device) || device.name,
      fixTime: formatTime(position.fixTime, 'seconds'),
      markerIcon: VEHICLE_MARKER_IMAGE_KEY,
      color: showStatus ? position.attributes.color || getStatusColor(device.status) : 'neutral',
      rotation: resolveRotation(position.deviceId, position),
    };
  };

  const onMouseEnter = () => map.getCanvas().style.cursor = 'pointer';
  const onMouseLeave = () => map.getCanvas().style.cursor = '';

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
    [id, selected].forEach((source) => {
      map.addLayer({
        id: source,
        type: 'symbol',
        source,
        filter: ['!has', 'point_count'],
        layout: {
          'icon-image': '{markerIcon}',
          'icon-size': iconScale,
          'icon-allow-overlap': true,
          'icon-rotate': ['get', 'rotation'],
          'icon-rotation-alignment': 'map',
          'icon-anchor': 'center',
          'icon-offset': [0, 0.15],
          'symbol-sort-key': ['get', 'id'],
        },
      });
      map.on('mouseenter', source, onMouseEnter);
      map.on('mouseleave', source, onMouseLeave);
      map.on('click', source, onMarkerClickCallback);
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

    map.on('mouseenter', clusters, onMouseEnter);
    map.on('mouseleave', clusters, onMouseLeave);
    map.on('click', clusters, onClusterClick);
    map.on('click', onMapClickCallback);

    return () => {
      map.off('mouseenter', clusters, onMouseEnter);
      map.off('mouseleave', clusters, onMouseLeave);
      map.off('click', clusters, onClusterClick);
      map.off('click', onMapClickCallback);

      if (map.getLayer(clusters)) {
        map.removeLayer(clusters);
      }

      [id, selected].forEach((source) => {
        map.off('mouseenter', source, onMouseEnter);
        map.off('mouseleave', source, onMouseLeave);
        map.off('click', source, onMarkerClickCallback);

        if (map.getLayer(source)) {
          map.removeLayer(source);
        }
        if (map.getSource(source)) {
          map.removeSource(source);
        }
      });
    };
  }, [mapCluster, clusters, iconScale, onMarkerClickCallback, onClusterClick, onMapClickCallback]);

  useEffect(() => {
    [id, selected].forEach((source) => {
      map.getSource(source)?.setData({
        type: 'FeatureCollection',
        features: positions.filter((it) => devices.hasOwnProperty(it.deviceId))
          .filter((it) => (source === id ? it.deviceId !== selectedDeviceId : it.deviceId === selectedDeviceId))
          .map((position) => ({
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
    devices,
    positions,
    selectedDeviceId,
  ]);

  return null;
};

export default MapPositions;
