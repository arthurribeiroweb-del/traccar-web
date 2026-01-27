import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import dimensions from '../../common/theme/dimensions';
import { map } from '../core/MapView';
import { usePrevious } from '../../reactHelper';
import { useAttributePreference } from '../../common/util/preferences';
import {
  DEFAULT_SCALE_METERS,
  getStoredZoom,
  hasUserZoomed,
  markDefaultZoomApplied,
  markUserZoomed,
  shouldApplyDefaultZoom,
  zoomForScale,
} from './mapZoomDefaults';

const DEAD_ZONE_RATIO = 0.3;

const MapSelectedDevice = ({ mapReady, followEnabled, setFollowEnabled }) => {
  const currentTime = useSelector((state) => state.devices.selectTime);
  const currentId = useSelector((state) => state.devices.selectedId);
  const previousTime = usePrevious(currentTime);
  const previousId = usePrevious(currentId);

  const selectZoom = useAttributePreference('web.selectZoom', 0);
  const userZoomingRef = useRef(false);

  const position = useSelector((state) => state.session.positions[currentId]);

  const previousPosition = usePrevious(position);
  const previousFollow = usePrevious(followEnabled);

  useEffect(() => {
    if (!mapReady) return;

    const handleZoomStart = (event) => {
      if (event.originalEvent) {
        userZoomingRef.current = true;
      }
    };
    const handleZoomEnd = () => {
      if (userZoomingRef.current) {
        userZoomingRef.current = false;
        markUserZoomed(map.getZoom());
      }
    };

    map.on('zoomstart', handleZoomStart);
    map.on('zoomend', handleZoomEnd);
    return () => {
      map.off('zoomstart', handleZoomStart);
      map.off('zoomend', handleZoomEnd);
    };
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady) return;

    const handleDragStart = (event) => {
      if (event.originalEvent && followEnabled) {
        setFollowEnabled(false);
      }
    };

    map.on('dragstart', handleDragStart);
    return () => {
      map.off('dragstart', handleDragStart);
    };
  }, [mapReady, followEnabled, setFollowEnabled]);

  useEffect(() => {
    if (!mapReady) return;

    const positionChanged = position && (!previousPosition
      || position.latitude !== previousPosition.latitude || position.longitude !== previousPosition.longitude);

    const selectionChanged = currentId !== previousId || currentTime !== previousTime;
    const followActivated = followEnabled && !previousFollow;

    const shouldRecenterForFollow = () => {
      if (!followEnabled || !positionChanged) {
        return false;
      }
      const canvas = map.getCanvas();
      if (!canvas) {
        return true;
      }
      const point = map.project([position.longitude, position.latitude]);
      const centerX = canvas.clientWidth / 2;
      const centerY = canvas.clientHeight / 2;
      const limitX = canvas.clientWidth * DEAD_ZONE_RATIO;
      const limitY = canvas.clientHeight * DEAD_ZONE_RATIO;
      return Math.abs(point.x - centerX) > limitX || Math.abs(point.y - centerY) > limitY;
    };

    if ((selectionChanged || followActivated || shouldRecenterForFollow()) && position) {
      const storedZoom = getStoredZoom();
      const userHasZoomed = hasUserZoomed();
      const applyDefault = selectionChanged && shouldApplyDefaultZoom();
      const defaultZoom = Math.min(map.getMaxZoom(), zoomForScale(DEFAULT_SCALE_METERS, position.latitude));
      const targetZoom = selectZoom > 0
        ? selectZoom
        : (storedZoom ?? defaultZoom);

      const shouldApplyZoom = selectionChanged && !userHasZoomed && applyDefault;

      map.easeTo({
        center: [position.longitude, position.latitude],
        zoom: shouldApplyZoom ? targetZoom : map.getZoom(),
        offset: [0, -dimensions.popupMapOffset / 2],
      });

      if (shouldApplyZoom) {
        markDefaultZoomApplied();
      }
    }
  }, [
    currentId,
    previousId,
    currentTime,
    previousTime,
    followEnabled,
    previousFollow,
    position,
    previousPosition,
    selectZoom,
    mapReady,
  ]);

  return null;
};

MapSelectedDevice.handlesMapReady = true;

export default MapSelectedDevice;
