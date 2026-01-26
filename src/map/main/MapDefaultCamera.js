import maplibregl from 'maplibre-gl';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { usePreference } from '../../common/util/preferences';
import { map } from '../core/MapView';
import {
  DEFAULT_SCALE_METERS,
  getStoredZoom,
  markDefaultZoomApplied,
  shouldApplyDefaultZoom,
  zoomForScale,
} from './mapZoomDefaults';

const MapDefaultCamera = ({ mapReady }) => {
  const selectedDeviceId = useSelector((state) => state.devices.selectedId);
  const positions = useSelector((state) => state.session.positions);

  const defaultLatitude = usePreference('latitude');
  const defaultLongitude = usePreference('longitude');
  const defaultZoom = usePreference('zoom', 0);

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!mapReady || initialized) return;
    const storedZoom = getStoredZoom();
    const applyDefault = shouldApplyDefaultZoom();

    const resolveZoom = (latitude) => {
      if (storedZoom != null) {
        return storedZoom;
      }
      if (applyDefault && Number.isFinite(latitude)) {
        return Math.min(map.getMaxZoom(), zoomForScale(DEFAULT_SCALE_METERS, latitude));
      }
      return Math.max(defaultZoom > 0 ? defaultZoom : map.getZoom(), 10);
    };

    if (selectedDeviceId) {
      const position = positions[selectedDeviceId];
      if (position) {
        map.jumpTo({
          center: [position.longitude, position.latitude],
          zoom: resolveZoom(position.latitude),
        });
        if (applyDefault && storedZoom == null) {
          markDefaultZoomApplied();
        }
        setInitialized(true);
      }
    } else {
      if (defaultLatitude && defaultLongitude) {
        map.jumpTo({
          center: [defaultLongitude, defaultLatitude],
          zoom: resolveZoom(defaultLatitude),
        });
        if (applyDefault && storedZoom == null) {
          markDefaultZoomApplied();
        }
        setInitialized(true);
      } else {
        const coordinates = Object.values(positions).map((item) => [item.longitude, item.latitude]);
        if (coordinates.length > 1) {
          const bounds = coordinates.reduce((bounds, item) => bounds.extend(item), new maplibregl.LngLatBounds(coordinates[0], coordinates[1]));
          const canvas = map.getCanvas();
          map.fitBounds(bounds, {
            duration: 0,
            padding: Math.min(canvas.width, canvas.height) * 0.1,
          });
          setInitialized(true);
        } else if (coordinates.length) {
          const [individual] = coordinates;
          map.jumpTo({
            center: individual,
            zoom: resolveZoom(individual[1]),
          });
          if (applyDefault && storedZoom == null) {
            markDefaultZoomApplied();
          }
          setInitialized(true);
        }
      }
    }
  }, [selectedDeviceId, initialized, defaultLatitude, defaultLongitude, defaultZoom, positions, mapReady]);

  return null;
};

MapDefaultCamera.handlesMapReady = true;

export default MapDefaultCamera;
