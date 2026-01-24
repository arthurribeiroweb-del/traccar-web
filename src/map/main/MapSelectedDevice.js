import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import dimensions from '../../common/theme/dimensions';
import { map } from '../core/MapView';
import { usePrevious } from '../../reactHelper';
import { useAttributePreference } from '../../common/util/preferences';

const MapSelectedDevice = ({ mapReady }) => {
  const currentTime = useSelector((state) => state.devices.selectTime);
  const currentId = useSelector((state) => state.devices.selectedId);
  const previousTime = usePrevious(currentTime);
  const previousId = usePrevious(currentId);

  const selectZoom = useAttributePreference('web.selectZoom', 0);
  const mapFollow = useAttributePreference('mapFollow', false);
  const selectZoomMeters = 200;

  const zoomForMeters = (meters, latitude) => {
    const canvas = map.getCanvas();
    const minDimension = Math.max(Math.min(canvas.width, canvas.height), 1);
    const metersPerPixel = meters / minDimension;
    const metersPerPixelAtZoom0 = 156543.03392 * Math.cos((latitude * Math.PI) / 180);
    return Math.log2(metersPerPixelAtZoom0 / metersPerPixel);
  };

  const position = useSelector((state) => state.session.positions[currentId]);

  const previousPosition = usePrevious(position);

  useEffect(() => {
    if (!mapReady) return;

    const positionChanged = position && (!previousPosition || position.latitude !== previousPosition.latitude || position.longitude !== previousPosition.longitude);

    if ((currentId !== previousId || currentTime !== previousTime || (mapFollow && positionChanged)) && position) {
      const targetZoom = selectZoom > 0
        ? selectZoom
        : Math.min(map.getMaxZoom(), zoomForMeters(selectZoomMeters, position.latitude));

      map.easeTo({
        center: [position.longitude, position.latitude],
        zoom: Math.max(map.getZoom(), targetZoom),
        offset: [0, -dimensions.popupMapOffset / 2],
      });
    }
  }, [currentId, previousId, currentTime, previousTime, mapFollow, position, selectZoom, mapReady]);

  return null;
};

MapSelectedDevice.handlesMapReady = true;

export default MapSelectedDevice;
