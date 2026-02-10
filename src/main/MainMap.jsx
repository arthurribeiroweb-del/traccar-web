import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Alert,
  Snackbar,
  Drawer,
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  MenuItem,
  TextField,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useDispatch, useSelector } from 'react-redux';
import DangerousIcon from '@mui/icons-material/Dangerous';
import SpeedIcon from '@mui/icons-material/Speed';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import MapView from '../map/core/MapView';
import MapSelectedDevice from '../map/main/MapSelectedDevice';
import MapAccuracy from '../map/main/MapAccuracy';
import MapGeofence from '../map/MapGeofence';
import MapRadar from '../map/MapRadar';
import MapStaticRadars from '../map/MapStaticRadars';
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
import MapCommunityReports from '../map/MapCommunityReports';
import useFeatures from '../common/util/useFeatures';
import { useAttributePreference } from '../common/util/preferences';
import { map } from '../map/core/MapView';
import { useAdministrator } from '../common/util/permissions';
import fetchOrThrow from '../common/util/fetchOrThrow';
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
const REPORT_MOVE_DEBOUNCE_MS = 300;
const COMMUNITY_REFRESH_INTERVAL_MS = 15000;

const COMMUNITY_TYPES = [
  { key: 'BURACO', label: 'Buraco', icon: DangerousIcon },
  { key: 'QUEBRA_MOLAS', label: 'Lombada', icon: SpeedIcon },
  { key: 'RADAR', label: 'Radar', icon: CameraAltIcon },
];

const RADAR_SPEED_OPTIONS = [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];

const getCommunityTypeLabel = (type) => COMMUNITY_TYPES
  .find((item) => item.key === type)?.label || type || 'Aviso';

const MainMap = ({
  filteredPositions,
  selectedPosition,
  onEventsClick,
  showRadars,
  reportRequestId,
  onReportPanelOpenChange,
  onPendingCommunityCountChange,
}) => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));

  const eventsAvailable = useSelector((state) => !!state.events.items.length);
  const selectedId = useSelector((state) => state.devices.selectedId);
  const followDeviceId = useSelector((state) => state.devices.followDeviceId);
  const headingByDeviceId = useSelector((state) => state.devices.headingByDeviceId || {});
  const positionsByDeviceId = useSelector((state) => state.session.positions);
  const followRotateMapPreference = useAttributePreference('web.followRotateMap', true);
  const administrator = useAdministrator();

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
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState(null);
  const [reportTypeWaitingClick, setReportTypeWaitingClick] = useState(null);
  const [reportClickPosition, setReportClickPosition] = useState(null);
  const [selectedRadarSpeedLimit, setSelectedRadarSpeedLimit] = useState(40);
  const [waitingForMapClick, setWaitingForMapClick] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [publicReports, setPublicReports] = useState([]);
  const [pendingReports, setPendingReports] = useState([]);
  const [optimisticReports, setOptimisticReports] = useState([]);

  const headingBuffersRef = useRef({});
  const headingMetaRef = useRef({});
  const lastPositionSignatureRef = useRef({});
  const lastAutoFollowSelectedRef = useRef(null);
  const selectedUpdateRef = useRef({ deviceId: null, signature: null, lastAt: 0 });
  const announcedStateRef = useRef({ stale: false, heading: null });
  const reportMoveTimerRef = useRef(null);
  const lastReportRequestRef = useRef(reportRequestId);

  const showFollowMessage = useCallback((message, severity) => {
    setSnackbar({
      key: Date.now(),
      message,
      severity,
    });
  }, []);

  const mapReportErrorToMessage = useCallback((error) => {
    const text = error?.message || '';
    const upperText = text.toUpperCase();
    const codeMatch = text.match(/IllegalArgumentException:\s*([A-Z_]+)/i)
      || text.match(/\b([A-Z_]{6,})\b/);
    const backendCode = (codeMatch?.[1] || '').toUpperCase();

    if (backendCode.includes('DUPLICATE') || backendCode.includes('TOO_CLOSE')) {
      return 'Ja existe um buraco marcado aqui.';
    }
    if (backendCode.includes('COOLDOWN_ACTIVE')) {
      return 'Aguarde 30s para enviar outro aviso.';
    }
    if (backendCode.includes('RATE_LIMIT_DAILY')) {
      return 'Voce atingiu o limite de avisos de hoje.';
    }
    if (backendCode.includes('INVALID_COORDINATES')) {
      return 'Localizacao invalida no mapa. Tente novamente.';
    }
    if (text.includes('DUPLICATE_NEARBY')) {
      return 'Ja existe um buraco marcado aqui.';
    }
    if (text.includes('COOLDOWN_ACTIVE')) {
      return 'Aguarde 30s para enviar outro aviso.';
    }
    if (text.includes('RATE_LIMIT_DAILY')) {
      return 'Voce atingiu o limite de avisos de hoje.';
    }
    if (text.includes('CANCEL_WINDOW_EXPIRED')) {
      return 'Janela para cancelar ja expirou.';
    }
    if (text.includes('INVALID_RADAR_SPEED_LIMIT')) {
      return 'Informe a velocidade do radar (20 a 120 km/h).';
    }
    if (text.includes('INVALID_COORDINATES')) {
      return 'Localizacao invalida no mapa. Tente novamente.';
    }
    if (text.includes('Unrecognized field') && text.includes('radarSpeedLimit')) {
      return 'Servidor desatualizado para o novo campo de radar. Atualize a VPS.';
    }

    const isSqlError = upperText.includes('SQLEXCEPTION') || upperText.includes('SQL ERROR')
      || upperText.includes('DATABASE') || upperText.includes('STORAGEEXCEPTION');
    const isColumnError = upperText.includes('COLUMN') || upperText.includes('UNKNOWN')
      || upperText.includes('DOES NOT EXIST') || upperText.includes('NO SUCH COLUMN')
      || upperText.includes('UNKNOWN COLUMN');
    const mentionsCommunityColumns = upperText.includes('RADARSPEEDLIMIT')
      || upperText.includes('RADAR_SPEED_LIMIT')
      || upperText.includes('EXISTSVOTES')
      || upperText.includes('GONEVOTES')
      || upperText.includes('LASTVOTEDAT')
      || upperText.includes('REMOVEDAT');

    if (isSqlError && isColumnError && mentionsCommunityColumns) {
      return 'Banco de dados desatualizado. Execute a atualizacao completa na VPS.';
    }
    if (backendCode) {
      return `Nao foi possivel enviar (${backendCode}).`;
    }
    return 'Nao foi possivel enviar. Tente novamente.';
  }, []);

  const computeCancelable = useCallback((report) => {
    const createdAt = new Date(report.createdAt || 0).getTime();
    if (!Number.isFinite(createdAt) || report.status !== 'PENDING_PRIVATE') {
      return false;
    }
    return Date.now() - createdAt <= 120000;
  }, []);

  const loadPendingReports = useCallback(async () => {
    const response = await fetchOrThrow('/api/community/reports?scope=mine&status=pending_private');
    const items = await response.json();
    setPendingReports(items.map((item) => ({
      ...item,
      cancelable: computeCancelable(item),
    })));
  }, [computeCancelable]);

  const loadPublicReports = useCallback(async () => {
    if (!map || !map.loaded()) {
      return;
    }
    const bounds = map.getBounds();
    const west = bounds.getWest();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const north = bounds.getNorth();
    const latSpan = Math.max(north - south, 0.002);
    const lngSpan = Math.max(east - west, 0.002);
    const padLat = latSpan * 0.2;
    const padLng = lngSpan * 0.2;
    const boundsParam = [
      west - padLng,
      south - padLat,
      east + padLng,
      north + padLat,
    ].join(',');
    try {
      const response = await fetchOrThrow(`/api/community/reports?scope=public&bounds=${encodeURIComponent(boundsParam)}`);
      const items = await response.json();
      setPublicReports(Array.isArray(items) ? items : []);
    } catch (err) {
      console.warn('loadPublicReports failed', err);
    }
  }, []);

  const loadAdminPendingCount = useCallback(async () => {
    if (!administrator) {
      onPendingCommunityCountChange?.(0);
      return;
    }
    const response = await fetchOrThrow('/api/admin/community/reports/count?status=pending_private');
    const data = await response.json();
    onPendingCommunityCountChange?.(data.count || 0);
  }, [administrator, onPendingCommunityCountChange]);

  const refreshCommunityReports = useCallback(async () => {
    await Promise.all([
      loadPublicReports(),
      loadPendingReports(),
      loadAdminPendingCount(),
    ]);
  }, [loadAdminPendingCount, loadPendingReports, loadPublicReports]);

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
    } else {
      dispatch(devicesActions.setFollowDeviceId(selectedId));
      setSelectedStale(false);
    }
  }, [dispatch, followEnabled, selectedId, showFollowMessage]);

  const handleAutoDisableFollow = useCallback(() => {
    if (!followEnabled) {
      return;
    }
    dispatch(devicesActions.setFollowDeviceId(null));
  }, [dispatch, followEnabled]);

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

  useEffect(() => {
    if (typeof reportRequestId !== 'number') {
      return;
    }
    if (lastReportRequestRef.current !== reportRequestId) {
      lastReportRequestRef.current = reportRequestId;
      setReportSheetOpen(true);
    }
  }, [reportRequestId]);

  useEffect(() => {
    onReportPanelOpenChange?.(reportSheetOpen || Boolean(selectedReportType));
  }, [onReportPanelOpenChange, reportSheetOpen, selectedReportType]);

  useEffect(() => {
    if (!map) {
      return undefined;
    }

    const scheduleReload = () => {
      if (reportMoveTimerRef.current) {
        window.clearTimeout(reportMoveTimerRef.current);
      }
      reportMoveTimerRef.current = window.setTimeout(() => {
        loadPublicReports().catch(() => {});
      }, REPORT_MOVE_DEBOUNCE_MS);
    };

    map.on('moveend', scheduleReload);
    map.on('zoomend', scheduleReload);

    const onMapLoaded = () => {
      refreshCommunityReports().catch(() => {});
    };

    if (map.loaded()) {
      onMapLoaded();
    } else {
      map.once('load', () => {
        setTimeout(onMapLoaded, 500);
      });
    }

    return () => {
      map.off('moveend', scheduleReload);
      map.off('zoomend', scheduleReload);
      if (reportMoveTimerRef.current) {
        window.clearTimeout(reportMoveTimerRef.current);
        reportMoveTimerRef.current = null;
      }
    };
  }, [loadPublicReports, refreshCommunityReports]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshCommunityReports().catch(() => {});
    }, COMMUNITY_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refreshCommunityReports]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPendingReports((reports) => reports.map((item) => ({
        ...item,
        cancelable: computeCancelable(item),
      })));
      setOptimisticReports((reports) => reports.map((item) => ({
        ...item,
        cancelable: computeCancelable(item),
      })));
    }, 5000);

    return () => window.clearInterval(timer);
  }, [computeCancelable]);

  useEffect(() => {
    if (!administrator) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      loadAdminPendingCount().catch(() => {});
    }, 30000);
    return () => window.clearInterval(timer);
  }, [administrator, loadAdminPendingCount]);

  const handleReportTypeSelect = useCallback((type) => {
    setReportSheetOpen(false);
    setReportClickPosition(null);
    setReportTypeWaitingClick(type);
    setWaitingForMapClick(true);
    showFollowMessage(`Clique no mapa onde esta a ${getCommunityTypeLabel(type).toLowerCase()}.`, 'info');
  }, [showFollowMessage]);

  useEffect(() => {
    if (!waitingForMapClick || !map) {
      return undefined;
    }
    const onMapClick = (e) => {
      setReportClickPosition({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      setWaitingForMapClick(false);
      setSelectedReportType(reportTypeWaitingClick);
      setReportTypeWaitingClick(null);
    };
    map.once('click', onMapClick);
    map.getCanvas().style.cursor = 'crosshair';
    return () => {
      map.off('click', onMapClick);
      map.getCanvas().style.cursor = '';
    };
  }, [reportTypeWaitingClick, waitingForMapClick]);

  const handleReportConfirm = useCallback(async () => {
    if (!selectedReportType) {
      return;
    }
    if (!map || !map.loaded()) {
      showFollowMessage('Não foi possível enviar. Tente novamente.', 'error');
      setSelectedReportType(null);
      setReportTypeWaitingClick(null);
      return;
    }

    const latitude = reportClickPosition
      ? Number(reportClickPosition.lat)
      : Number(map.getCenter().lat);
    const longitude = reportClickPosition
      ? Number(reportClickPosition.lng)
      : Number(map.getCenter().lng);
    const radarSpeedLimit = Number(selectedRadarSpeedLimit);
    if (selectedReportType === 'RADAR'
      && (!Number.isInteger(radarSpeedLimit) || radarSpeedLimit < 20 || radarSpeedLimit > 120 || radarSpeedLimit % 10 !== 0)) {
      showFollowMessage('Selecione uma velocidade valida do radar (20 a 120 km/h).', 'warning');
      return;
    }

    const tempId = `temp-${Date.now()}-${Math.round(Math.random() * 100000)}`;
    const tempItem = {
      id: tempId,
      type: selectedReportType,
      status: 'PENDING_PRIVATE',
      latitude,
      longitude,
      radarSpeedLimit: selectedReportType === 'RADAR' ? radarSpeedLimit : null,
      createdAt: new Date().toISOString(),
      cancelable: false,
    };

    setReportSubmitting(true);
    setOptimisticReports((items) => [tempItem, ...items]);

    try {
      const payload = {
        type: selectedReportType,
        latitude,
        longitude,
      };
      if (selectedReportType === 'RADAR') {
        payload.radarSpeedLimit = radarSpeedLimit;
      }
      const response = await fetchOrThrow('/api/community/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const saved = await response.json();
      setOptimisticReports((items) => items.filter((item) => item.id !== tempId));
      setPendingReports((items) => [
        { ...saved, cancelable: computeCancelable(saved) },
        ...items,
      ]);
      showFollowMessage('Enviado para aprovação.', 'success');
      loadAdminPendingCount().catch(() => {});
    } catch (error) {
      setOptimisticReports((items) => items.filter((item) => item.id !== tempId));
      showFollowMessage(mapReportErrorToMessage(error), 'error');
    } finally {
      setReportSubmitting(false);
      setSelectedReportType(null);
      setReportTypeWaitingClick(null);
      setReportClickPosition(null);
      setSelectedRadarSpeedLimit(40);
    }
  }, [
    selectedReportType,
    selectedRadarSpeedLimit,
    reportClickPosition,
    showFollowMessage,
    computeCancelable,
    loadAdminPendingCount,
    mapReportErrorToMessage,
  ]);

  const handleCancelPendingReport = useCallback(async (reportId) => {
    await fetchOrThrow(`/api/community/reports/${reportId}`, { method: 'DELETE' });
    setPendingReports((items) => items.filter((item) => String(item.id) !== String(reportId)));
    setOptimisticReports((items) => items.filter((item) => String(item.id) !== String(reportId)));
    showFollowMessage('Envio cancelado.', 'info');
    loadAdminPendingCount().catch(() => {});
  }, [loadAdminPendingCount, showFollowMessage]);

  const handleCancelPendingWrapper = useCallback(async (reportId) => {
    try {
      await handleCancelPendingReport(reportId);
    } catch (error) {
      showFollowMessage(mapReportErrorToMessage(error), 'error');
      throw error;
    }
  }, [handleCancelPendingReport, mapReportErrorToMessage, showFollowMessage]);

  const combinedPendingReports = useMemo(() => [
    ...optimisticReports,
    ...pendingReports,
  ], [optimisticReports, pendingReports]);

  const handleSnackbarClose = useCallback(() => {
    setSnackbar(null);
  }, []);

  return (
    <>
      <MapView>
        <MapOverlay />
        <MapGeofence />
        <MapRadar enabled={showRadars} />
        <MapStaticRadars enabled={showRadars} />
        <MapAccuracy positions={filteredPositions} />
        <MapLiveRoutes deviceIds={filteredPositions.map((p) => p.deviceId)} />
        <MapPositions
          positions={filteredPositions}
          onMarkerClick={onMarkerClick}
          selectedPosition={selectedPosition}
          showStatus
          stabilizeSelectedInFollow={followEnabled && followRotateMap}
        />
        <MapCommunityReports
          publicReports={publicReports}
          pendingReports={combinedPendingReports}
          onCancelPending={handleCancelPendingWrapper}
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
      <Drawer
        anchor="bottom"
        open={reportSheetOpen}
        onClose={() => {
          setReportSheetOpen(false);
          setWaitingForMapClick(false);
          setReportTypeWaitingClick(null);
          setSelectedRadarSpeedLimit(40);
        }}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            pb: 2,
          },
        }}
      >
        <Box sx={{ px: 2, pt: 2 }}>
          <Typography variant="h6">Reportar</Typography>
          <Typography variant="body2" color="text.secondary">
            Escolha o tipo. Depois clique no mapa no local exato e confirme.
          </Typography>
        </Box>
        <List>
          {COMMUNITY_TYPES.map((item) => {
            const Icon = item.icon;
            return (
              <ListItemButton
                key={item.key}
                onClick={() => handleReportTypeSelect(item.key)}
                sx={{ minHeight: 44 }}
              >
                <ListItemIcon>
                  <Icon />
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            );
          })}
        </List>
      </Drawer>
      <Dialog
        open={Boolean(selectedReportType)}
        onClose={() => {
          setSelectedReportType(null);
          setReportTypeWaitingClick(null);
          setReportClickPosition(null);
          setSelectedRadarSpeedLimit(40);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{`Adicionar ${getCommunityTypeLabel(selectedReportType).toUpperCase()} aqui?`}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {reportClickPosition
              ? 'Local = ponto que você clicou no mapa. Confirme para enviar para aprovação.'
              : 'Local = centro do mapa. Confirme para enviar para aprovação.'}
          </Typography>
          {selectedReportType === 'RADAR' && (
            <TextField
              select
              fullWidth
              margin="normal"
              label="Velocidade do radar"
              value={selectedRadarSpeedLimit}
              onChange={(event) => setSelectedRadarSpeedLimit(Number(event.target.value))}
              helperText="Selecione de 10 em 10 (20 a 120 km/h)."
            >
              {RADAR_SPEED_OPTIONS.map((speed) => (
                <MenuItem key={speed} value={speed}>
                  {`${speed} km/h`}
                </MenuItem>
              ))}
            </TextField>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setSelectedReportType(null);
              setReportTypeWaitingClick(null);
              setSelectedRadarSpeedLimit(40);
            }}
            disabled={reportSubmitting}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleReportConfirm}
            disabled={reportSubmitting}
            startIcon={reportSubmitting ? <CircularProgress size={16} /> : null}
          >
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>
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




