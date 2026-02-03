import {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { sessionActions } from '../../store';
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Snackbar,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useTranslation } from './LocalizationProvider';
import { pollPositionsOnce, requestReconnect } from '../util/realtimeApi';

const DELAYED_THRESHOLD_S = 15;
const RECONNECTING_THRESHOLD_S = 90;
const OFFLINE_HARD_THRESHOLD_S = 300;
const RECENT_UPDATE_THRESHOLD_S = 30;
const RECONNECT_TOAST_MS = 1500;
const BACKOFF_MS = [1000, 2000, 5000, 10000, 20000, 30000];

const debugReconnectLog = (payload) => {
  window.dispatchEvent(new CustomEvent('traccar-reconnect-debug', { detail: payload }));
};

const getFixTimeMs = (position) => {
  const value = position?.fixTime || position?.deviceTime;
  if (!value) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

export const useRealtimeStatus = (position) => {
  const [now, setNow] = useState(Date.now());
  const user = useSelector((state) => state.session.user);
  const socketStatus = useSelector((state) => state.session.socketStatus);
  const socketConnected = useSelector((state) => Boolean(state.session.socket));

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fixTimeMs = getFixTimeMs(position);
  const ageMs = fixTimeMs == null ? Infinity : now - fixTimeMs;
  const ageSec = Number.isFinite(ageMs)
    ? Math.max(0, Math.floor(ageMs / 1000))
    : Infinity;

  const connectionState = useMemo(() => {
    if (fixTimeMs == null) {
      if (
        !socketConnected
        || socketStatus === 'connecting'
        || socketStatus === 'reconnecting'
        || socketStatus === 'error'
      ) {
        return 'RECONNECTING';
      }
      return 'DELAYED';
    }
    if (ageSec > OFFLINE_HARD_THRESHOLD_S) {
      return 'OFFLINE_HARD';
    }
    if (
      !socketConnected
      || socketStatus === 'connecting'
      || socketStatus === 'reconnecting'
      || socketStatus === 'error'
      || ageSec > RECONNECTING_THRESHOLD_S
    ) {
      return 'RECONNECTING';
    }
    if (ageSec > DELAYED_THRESHOLD_S) {
      return 'DELAYED';
    }
    return 'ONLINE';
  }, [ageSec, fixTimeMs, socketConnected, socketStatus]);

  const statusLabel = useMemo(() => {
    switch (connectionState) {
      case 'DELAYED':
        return 'realtimeUpdating';
      case 'RECONNECTING':
        return 'realtimeNoSignalReconnecting';
      case 'OFFLINE_HARD':
        return 'realtimeNoSignalTapRetry';
      default:
        return null;
    }
  }, [connectionState]);

  const chipColor = useMemo(() => {
    switch (connectionState) {
      case 'DELAYED':
        return 'warning';
      case 'OFFLINE_HARD':
        return 'error';
      case 'RECONNECTING':
      default:
        return 'default';
    }
  }, [connectionState]);

  const isAdmin = user?.administrator === true;
  const showStatusChip = connectionState !== 'ONLINE';
  const canManualRetry = connectionState === 'OFFLINE_HARD';
  const updatedText = Number.isFinite(ageSec) ? `Atualizado h\u00e1 ${ageSec}s` : '--';

  return {
    ageSec,
    canManualRetry,
    chipColor,
    connectionState,
    isAdmin,
    showStatusChip,
    socketConnected,
    statusLabel,
    updatedText,
  };
};

const RealtimeStatusChip = ({
  position,
  compact = false,
}) => {
  const dispatch = useDispatch();
  const t = useTranslation();
  const {
    ageSec,
    canManualRetry,
    chipColor,
    connectionState,
    isAdmin,
    showStatusChip,
    socketConnected,
    statusLabel,
    updatedText,
  } = useRealtimeStatus(position);

  const [showReconnectToast, setShowReconnectToast] = useState(false);
  const timerRef = useRef(null);
  const retryIndexRef = useRef(0);
  const latestStateRef = useRef({ connectionState, ageSec, socketConnected });
  const previousStateRef = useRef(connectionState);

  useEffect(() => {
    latestStateRef.current = { connectionState, ageSec, socketConnected };
  }, [connectionState, ageSec, socketConnected]);

  const stopReconnectLoop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    retryIndexRef.current = 0;
  }, []);

  const retryOnce = useCallback(async (reason = 'auto') => {
    dispatch(sessionActions.updateSocketStatus('reconnecting'));
    debugReconnectLog({
      type: 'retry',
      reason,
      state: latestStateRef.current.connectionState,
      ageSec: latestStateRef.current.ageSec,
    });
    requestReconnect();
    await pollPositionsOnce(dispatch, { silent: true });
  }, [dispatch]);

  const scheduleRetry = useCallback(() => {
    if (timerRef.current) {
      return;
    }
    const delay = BACKOFF_MS[Math.min(retryIndexRef.current, BACKOFF_MS.length - 1)];
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      retryIndexRef.current += 1;
      await retryOnce('backoff');
      const latest = latestStateRef.current;
      const recovered = latest.socketConnected && latest.ageSec <= RECENT_UPDATE_THRESHOLD_S;
      if (!recovered && (latest.connectionState === 'RECONNECTING' || latest.connectionState === 'OFFLINE_HARD')) {
        scheduleRetry();
      } else {
        retryIndexRef.current = 0;
      }
    }, delay);
  }, [retryOnce]);

  const forceReconnect = useCallback(async () => {
    stopReconnectLoop();
    await retryOnce('manual');
    const latest = latestStateRef.current;
    if (latest.connectionState === 'RECONNECTING' || latest.connectionState === 'OFFLINE_HARD') {
      scheduleRetry();
    }
  }, [retryOnce, scheduleRetry, stopReconnectLoop]);

  const handleRefresh = useCallback(async () => {
    await pollPositionsOnce(dispatch, { silent: true });
  }, [dispatch]);

  useEffect(() => {
    if (connectionState === 'RECONNECTING' || connectionState === 'OFFLINE_HARD') {
      scheduleRetry();
    } else {
      stopReconnectLoop();
    }
  }, [connectionState, scheduleRetry, stopReconnectLoop]);

  useEffect(() => () => {
    stopReconnectLoop();
  }, [stopReconnectLoop]);

  useEffect(() => {
    const previous = previousStateRef.current;
    if (
      (previous === 'RECONNECTING' || previous === 'OFFLINE_HARD')
      && connectionState === 'ONLINE'
    ) {
      setShowReconnectToast(true);
    }
    previousStateRef.current = connectionState;
  }, [connectionState]);

  const label = statusLabel ? t(statusLabel) : '';
  const showUpdatedText = !compact;
  const showAdminActions = isAdmin && !compact && showStatusChip;
  const chipNode = showStatusChip ? (
    <Chip
      size="small"
      color={chipColor}
      label={label}
      clickable={canManualRetry}
      sx={{ fontWeight: 500 }}
    />
  ) : null;

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        {canManualRetry && chipNode ? (
          <ButtonBase
            onClick={forceReconnect}
            aria-label="Tentar reconectar"
            sx={{ minHeight: 44, borderRadius: 999 }}
          >
            {chipNode}
          </ButtonBase>
        ) : chipNode}
        {showUpdatedText && (
          <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
            {updatedText}
          </Box>
        )}
        {showAdminActions && (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={forceReconnect}
            >
              {t('realtimeReconnect')}
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={handleRefresh}
            >
              {t('realtimeRefreshNow')}
            </Button>
          </Box>
        )}
      </Box>
      <Snackbar
        open={showReconnectToast}
        autoHideDuration={RECONNECT_TOAST_MS}
        message={t('realtimeReconnected')}
        onClose={() => setShowReconnectToast(false)}
      />
    </>
  );
};

export default RealtimeStatusChip;
