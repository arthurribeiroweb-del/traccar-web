import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { Alert, Snackbar } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useDispatch, useSelector } from 'react-redux';
import MapView from '../map/core/MapView';
import MapSelectedDevice from '../map/main/MapSelectedDevice';
import MapAccuracy from '../map/main/MapAccuracy';
import MapGeofence from '../map/MapGeofence';
import MapRadar from '../map/MapRadar';
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
import { useAttributePreference } from '../common/util/preferences';
import {
  computeHeadingCandidate,
  headingDefaults,
  shouldUpdateHeading,
  smoothHeading,
} from '../map/main/followHeading';

// Custom UI: hide specific shortcuts on map sidebar (swap follow vs GPS when needed).
const HIDE_MAP_SHORTCUTS = {
  follow: false,
  search: true,
  notifications: true,
  geolocate: true,
};

const BUFFER_SIZE = 5;
const NO_UPDATE_TIMEOUT_MS = 30000;

const MainMap = ({
  filteredPositions,
  selectedPosition,
  onEventsClick,
  showRadars,
}) => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));

  const eventsAvailable = useSelector((state) => !!state.events.items.length);
  const selectedId = useSelector((state) => state.devices.selectedId);
  const followDeviceId = useSelector((state) => state.devices.followDeviceId);
  const headingByDeviceId = useSelector((state) => state.devices.headingByDeviceId || {});
  const positionsByDeviceId = useSelector((state) => state.session.positions);
  const followRotateMapPreference = useAttributePreference('web.followRotateMap', false);

  const features = useFeatures();
  const followEnabled = Boolean(selectedId) && String(followDeviceId) === String(selectedId);
  const selectedHeading = selectedId != null ? headingByDeviceId[selectedId] : null;
  const selectedLivePosition = selectedId != null ? positionsByDeviceId[selectedId] : null;
  const followRotateMap = useMemo(
    () => followRotateMapPreference === true || followRotateMapPreference === 'true',
    [followRotateMapPreference],
  );

  const [snackbar, setSnackbar] = useState(null);
  const [selectedStale, setSelectedStale] = useState(false);
  const [selectedHeadingState, setSelectedHeadingState] = useState('idle');

  const headingBuffersRef = useRef({});
  const headingMetaRef = useRef({});
  const lastPositionSignatureRef = useRef({});
  const lastAutoFollowSelectedRef = useRef(null);
  const selectedUpdateRef = useRef({ deviceId: null, signature: null, lastAt: 0 });
  const announcedStateRef = useRef({ stale: false, heading: null });

  const showFollowMessage = useCallback((message, severity) => {
    setSnackbar({
      key: Date.now(),
      message,
      severity,
    });
  }, []);

  useEffect(() => {
    if (!selectedId) {
      if (followDeviceId != null) {
        dispatch(devicesActions.setFollowDeviceId(null));
      }
      lastAutoFollowSelectedRef.current = null;
      announcedStateRef.current = { stale: false, heading: null };
      setSelectedHeadingState('idle');
      setSelectedStale(false);
      selectedUpdateRef.current = { deviceId: null, signature: null, lastAt: 0 };
      return;
    }

    const selectedKey = String(selectedId);
    const selectedChanged = lastAutoFollowSelectedRef.current !== selectedKey;
    const followingSelected = String(followDeviceId) === selectedKey;
    const followBoundToOtherDevice = followDeviceId != null && !followingSelected;

    if (!followingSelected && (selectedChanged || followBoundToOtherDevice)) {
      dispatch(devicesActions.setFollowDeviceId(selectedId));
      setSelectedStale(false);
    }
    lastAutoFollowSelectedRef.current = selectedKey;
  }, [dispatch, followDeviceId, selectedId]);

  const onMarkerClick = useCallback((_, deviceId) => {
    dispatch(devicesActions.selectId(deviceId));
  }, [dispatch]);

  const handleFollowToggle = useCallback(() => {
    if (!selectedId) {
      showFollowMessage('Selecione um veículo', 'warning');
      return;
    }

    if (followEnabled) {
      dispatch(devicesActions.setFollowDeviceId(null));
      showFollowMessage('Seguir desativado', 'warning');
    } else {
      dispatch(devicesActions.setFollowDeviceId(selectedId));
      setSelectedStale(false);
      showFollowMessage('Seguindo veículo', 'info');
    }
  }, [dispatch, followEnabled, selectedId, showFollowMessage]);

  const handleAutoDisableFollow = useCallback(() => {
    if (!followEnabled) {
      return;
    }
    dispatch(devicesActions.setFollowDeviceId(null));
    showFollowMessage('Seguir desativado', 'warning');
  }, [dispatch, followEnabled, showFollowMessage]);

  useEffect(() => {
    const headingUpdates = {};
    const activeDeviceIds = new Set(Object.keys(positionsByDeviceId));
    const now = Date.now();

    Object.entries(positionsByDeviceId).forEach(([deviceId, position]) => {
      if (!position || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) {
        return;
      }

      const signature = `${position.id ?? ''}:${position.fixTime ?? ''}:${position.latitude}:${position.longitude}:${position.speed ?? ''}:${position.course ?? ''}`;
      if (lastPositionSignatureRef.current[deviceId] === signature) {
        return;
      }
      lastPositionSignatureRef.current[deviceId] = signature;

      const history = headingBuffersRef.current[deviceId] || [];
      history.push({
        latitude: position.latitude,
        longitude: position.longitude,
        at: now,
      });
      headingBuffersRef.current[deviceId] = history.slice(-BUFFER_SIZE);

      const nextCandidate = computeHeadingCandidate(
        headingBuffersRef.current[deviceId],
        position,
        headingDefaults,
      );
      const metadata = headingMetaRef.current[deviceId] || { lastHeadingUpdateAt: 0, status: 'loading' };
      metadata.status = nextCandidate.status;

      if (Number.isFinite(nextCandidate.heading)) {
        const previousHeading = headingByDeviceId[deviceId];
        if (shouldUpdateHeading(
          previousHeading,
          nextCandidate.heading,
          metadata.lastHeadingUpdateAt,
          now,
          headingDefaults,
        )) {
          headingUpdates[deviceId] = smoothHeading(previousHeading, nextCandidate.heading);
          metadata.lastHeadingUpdateAt = now;
          metadata.status = 'ready';
        }
      }

      headingMetaRef.current[deviceId] = metadata;
    });

    Object.keys(headingBuffersRef.current).forEach((deviceId) => {
      if (!activeDeviceIds.has(deviceId)) {
        delete headingBuffersRef.current[deviceId];
        delete headingMetaRef.current[deviceId];
        delete lastPositionSignatureRef.current[deviceId];
      }
    });

    if (Object.keys(headingUpdates).length) {
      dispatch(devicesActions.updateHeadings(headingUpdates));
    }

    if (selectedId == null) {
      setSelectedHeadingState('idle');
    } else {
      setSelectedHeadingState(headingMetaRef.current[selectedId]?.status || 'loading');
    }
  }, [dispatch, headingByDeviceId, positionsByDeviceId, selectedId]);

  useEffect(() => {
    if (!selectedId || !selectedLivePosition) {
      selectedUpdateRef.current = { deviceId: null, signature: null, lastAt: 0 };
      setSelectedStale(false);
      return;
    }

    const signature = `${selectedLivePosition.id ?? ''}:${selectedLivePosition.fixTime ?? ''}:${selectedLivePosition.latitude}:${selectedLivePosition.longitude}`;
    if (
      selectedUpdateRef.current.deviceId !== String(selectedId)
      || selectedUpdateRef.current.signature !== signature
    ) {
      selectedUpdateRef.current = {
        deviceId: String(selectedId),
        signature,
        lastAt: Date.now(),
      };
      setSelectedStale(false);
    }
  }, [selectedId, selectedLivePosition]);

  useEffect(() => {
    if (!followEnabled) {
      setSelectedStale(false);
      return undefined;
    }

    const timer = window.setInterval(() => {
      const lastAt = selectedUpdateRef.current.lastAt;
      const stale = Boolean(lastAt) && Date.now() - lastAt > NO_UPDATE_TIMEOUT_MS;
      setSelectedStale((previous) => (previous === stale ? previous : stale));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [followEnabled]);

  useEffect(() => {
    if (!followEnabled) {
      announcedStateRef.current = { stale: false, heading: null };
      return;
    }

    if (selectedStale && !announcedStateRef.current.stale) {
      showFollowMessage('Sem atualização', 'warning');
    }
    announcedStateRef.current.stale = selectedStale;

    if (selectedStale) {
      return;
    }

    if (selectedHeadingState === 'loading' && announcedStateRef.current.heading !== 'loading') {
      if (import.meta.env.DEV) {
        console.debug('[FollowHeading] calculating direction');
      }
    } else if (selectedHeadingState === 'unavailable' && announcedStateRef.current.heading !== 'unavailable') {
      if (import.meta.env.DEV) {
        console.debug('[FollowHeading] direction unavailable');
      }
    }
    announcedStateRef.current.heading = selectedHeadingState;
  }, [followEnabled, selectedHeadingState, selectedStale, showFollowMessage]);

  const handleSnackbarClose = useCallback(() => {
    setSnackbar(null);
  }, []);

  return (
    <>
      <MapView>
        <MapOverlay />
        <MapGeofence />
        <MapRadar enabled={showRadars} />
        <MapAccuracy positions={filteredPositions} />
        <MapLiveRoutes deviceIds={filteredPositions.map((p) => p.deviceId)} />
        <MapPositions
          positions={filteredPositions}
          onMarkerClick={onMarkerClick}
          selectedPosition={selectedPosition}
          showStatus
        />
        <MapDefaultCamera />
        <MapSelectedDevice
          followEnabled={followEnabled}
          selectedHeading={selectedHeading}
          rotateMapWithHeading={followRotateMap}
          suspendFollow={selectedStale}
          onDisableFollow={handleAutoDisableFollow}
        />
        <PoiMap />
      </MapView>
      <MapScale />
      {!HIDE_MAP_SHORTCUTS.geolocate && <MapCurrentLocation />}
      {!HIDE_MAP_SHORTCUTS.follow && (
        <MapFollow
          enabled={followEnabled}
          visible
          onToggle={handleFollowToggle}
          titleOn="Seguindo (toque para parar)"
          titleOff="Seguir veículo"
        />
      )}
      {!HIDE_MAP_SHORTCUTS.search && <MapGeocoder />}
      {!HIDE_MAP_SHORTCUTS.notifications && !features.disableEvents && (
        <MapNotification enabled={eventsAvailable} onClick={onEventsClick} />
      )}
      {desktop && (
        <MapPadding start={parseInt(theme.dimensions.drawerWidthDesktop, 10) + parseInt(theme.spacing(1.5), 10)} />
      )}
      <Snackbar
        key={snackbar?.key}
        open={Boolean(snackbar)}
        autoHideDuration={2500}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar?.severity || 'info'}
          variant="filled"
          onClose={handleSnackbarClose}
          sx={{ width: '100%' }}
        >
          {snackbar?.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default MainMap;
