import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useDispatch, useSelector } from 'react-redux';
import MapView from '../map/core/MapView';
import MapSelectedDevice from '../map/main/MapSelectedDevice';
import MapAccuracy from '../map/main/MapAccuracy';
import MapGeofence from '../map/MapGeofence';
import MapCurrentLocation from '../map/MapCurrentLocation';
import PoiMap from '../map/main/PoiMap';
import MapPadding from '../map/MapPadding';
import { devicesActions } from '../store';
import MapDefaultCamera from '../map/main/MapDefaultCamera';
import MapLiveRoutes from '../map/main/MapLiveRoutes';
import MapPositions from '../map/MapPositions';
import MapOverlay from '../map/overlay/MapOverlay';
import MapGeocoder from '../map/geocoder/MapGeocoder';
import MapScale from '../map/MapScale';
import MapNotification from '../map/notification/MapNotification';
import MapFollow from '../map/main/MapFollow';
import useFeatures from '../common/util/useFeatures';
import { useTranslation } from '../common/components/LocalizationProvider';

// Custom UI: hide follow/search/notifications shortcuts on map sidebar (keep GPS button).
const HIDDEN_MAP_BUTTONS = new Set(['follow', 'search', 'notifications']);

const MainMap = ({ filteredPositions, selectedPosition, onEventsClick }) => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const t = useTranslation();

  const desktop = useMediaQuery(theme.breakpoints.up('md'));

  const eventsAvailable = useSelector((state) => !!state.events.items.length);
  const selectedId = useSelector((state) => state.devices.selectedId);
  const selectTime = useSelector((state) => state.devices.selectTime);

  const features = useFeatures();

  const [followEnabled, setFollowEnabled] = useState(false);

  useEffect(() => {
    if (selectedId) {
      setFollowEnabled(true);
    } else {
      setFollowEnabled(false);
    }
  }, [selectedId, selectTime]);

  const onMarkerClick = useCallback((_, deviceId) => {
    dispatch(devicesActions.selectId(deviceId));
  }, [dispatch]);

  const showFollow = Boolean(selectedId) && !HIDDEN_MAP_BUTTONS.has('follow');
  const showSearch = !HIDDEN_MAP_BUTTONS.has('search');
  const showNotifications = !HIDDEN_MAP_BUTTONS.has('notifications') && !features.disableEvents;

  const handleFollowToggle = useCallback(() => {
    if (!selectedId) {
      return;
    }
    setFollowEnabled((prev) => !prev);
  }, [selectedId]);

  return (
    <>
      <MapView>
        <MapOverlay />
        <MapGeofence />
        <MapAccuracy positions={filteredPositions} />
        <MapLiveRoutes deviceIds={filteredPositions.map((p) => p.deviceId)} />
        <MapPositions
          positions={filteredPositions}
          onMarkerClick={onMarkerClick}
          selectedPosition={selectedPosition}
          showStatus
        />
        <MapDefaultCamera />
        <MapSelectedDevice followEnabled={followEnabled} setFollowEnabled={setFollowEnabled} />
        <PoiMap />
      </MapView>
      <MapScale />
      <MapCurrentLocation />
      {showFollow && (
        <MapFollow
          enabled={followEnabled}
          visible={Boolean(selectedId)}
          onToggle={handleFollowToggle}
          titleOn={t('deviceFollow')}
          titleOff={t('mapRecenter')}
        />
      )}
      {showSearch && <MapGeocoder />}
      {showNotifications && (
        <MapNotification enabled={eventsAvailable} onClick={onEventsClick} />
      )}
      {desktop && (
        <MapPadding start={parseInt(theme.dimensions.drawerWidthDesktop, 10) + parseInt(theme.spacing(1.5), 10)} />
      )}
    </>
  );
};

export default MainMap;
