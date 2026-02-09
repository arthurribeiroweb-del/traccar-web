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

const MapSelectedDevice = ({
  mapReady,
  followEnabled,
  onDisableFollow,
  selectedHeading,
  rotateMapWithHeading,
  suspendFollow,
}) => {
  const currentTime = useSelector((state) => state.devices.selectTime);
  const currentId = useSelector((state) => state.devices.selectedId);
  const previousTime = usePrevious(currentTime);
  const previousId = usePrevious(currentId);

  const selectZoom = useAttributePreference('web.selectZoom', 0);
  const userZoomingRef = useRef(false);

  const position = useSelector((state) => state.session.positions[currentId]);

  const previousPosition = usePrevious(position);
  const previousFollow = usePrevious(followEnabled);
  const previousHeading = usePrevious(selectedHeading);

  useEffect(() => {
    if (!mapReady) return;

    const handleZoomStart = (event) => {
      if (event.originalEvent) {
        userZoomingRef.current = true;
        if (followEnabled) {
          onDisableFollow();
        }
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
  }, [followEnabled, mapReady, onDisableFollow]);

  useEffect(() => {
    if (!mapReady) return;

    const disableOnUserInteraction = (event) => {
      if (event.originalEvent && followEnabled) {
        onDisableFollow();
      }
    };

    map.on('dragstart', disableOnUserInteraction);
    map.on('rotatestart', disableOnUserInteraction);
    map.on('pitchstart', disableOnUserInteraction);

    return () => {
      map.off('dragstart', disableOnUserInteraction);
      map.off('rotatestart', disableOnUserInteraction);
      map.off('pitchstart', disableOnUserInteraction);
    };
  }, [mapReady, followEnabled, onDisableFollow]);

  useEffect(() => {
    if (!mapReady) return;

    const positionChanged = position && (!previousPosition
      || position.latitude !== previousPosition.latitude || position.longitude !== previousPosition.longitude);
    const headingChanged = Number.isFinite(selectedHeading) && selectedHeading !== previousHeading;

    const selectionChanged = currentId !== previousId || currentTime !== previousTime;
    const followActivated = followEnabled && !previousFollow;

    const shouldFollowMove = followEnabled
      && !suspendFollow
      && position
      && (positionChanged || followActivated || headingChanged);

    if (shouldFollowMove) {
      map.easeTo({
        center: [position.longitude, position.latitude],
        zoom: map.getZoom(),
        offset: [0, 0],
        duration: 280,
        easing: (value) => 1 - ((1 - value) ** 2),
        bearing: rotateMapWithHeading && Number.isFinite(selectedHeading)
          ? selectedHeading
          : map.getBearing(),
      });
      return;
    }

    if (!followEnabled && selectionChanged && position) {
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

    if (!followEnabled && previousFollow && rotateMapWithHeading && Math.abs(map.getBearing()) > 0.5) {
      map.easeTo({
        bearing: 0,
        duration: 220,
      });
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
    previousHeading,
    selectedHeading,
    rotateMapWithHeading,
    suspendFollow,
    onDisableFollow,
    selectZoom,
    mapReady,
  ]);

  return null;
};

MapSelectedDevice.handlesMapReady = true;

export default MapSelectedDevice;
