import { useMemo, useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { sessionActions } from '../../store';
import { Chip, Button, Box } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useTranslation } from './LocalizationProvider';
import { pollPositionsOnce, requestReconnect } from '../util/realtimeApi';

const LIVE_THRESHOLD_S = 15;
const DELAYED_THRESHOLD_S = 120;

export const useRealtimeStatus = (position) => {
  const [now, setNow] = useState(Date.now());
  const socketStatus = useSelector((state) => state.session.socketStatus);
  const socket = useSelector((state) => state.session.socket);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fixTime = position?.fixTime || position?.deviceTime;
  const ageMs = fixTime ? now - new Date(fixTime).getTime() : Infinity;
  const ageSec = Math.floor(ageMs / 1000);

  const status = useMemo(() => {
    if (socketStatus === 'connecting') return 'connecting';
    if (socketStatus === 'reconnecting') return 'reconnecting';
    if (socketStatus === 'error') return 'error';
    if (!socket) return 'offline';
    if (ageSec > DELAYED_THRESHOLD_S) return 'offline';
    if (ageSec > LIVE_THRESHOLD_S) return 'delayed';
    return 'live';
  }, [socketStatus, socket, ageSec]);

  const statusLabel = useMemo(() => {
    switch (status) {
      case 'connecting': return 'realtimeConnecting';
      case 'live': return 'realtimeLive';
      case 'delayed': return 'realtimeDelayed';
      case 'offline': return 'realtimeOffline';
      case 'reconnecting': return 'realtimeReconnecting';
      case 'error': return 'realtimeError';
      default: return 'realtimeLive';
    }
  }, [status]);

  const chipColor = useMemo(() => {
    switch (status) {
      case 'live': return 'success';
      case 'connecting':
      case 'reconnecting': return 'info';
      case 'delayed': return 'warning';
      case 'offline':
      case 'error': return 'error';
      default: return 'default';
    }
  }, [status]);

  const showActions = status === 'delayed' || status === 'offline' || status === 'error';

  const updatedText = fixTime
    ? `Atualizado há ${ageSec}s`
    : '--';

  return {
    status,
    statusLabel,
    chipColor,
    ageSec,
    updatedText,
    showActions,
  };
};

const RealtimeStatusChip = ({
  position,
  compact = false,
}) => {
  const dispatch = useDispatch();
  const t = useTranslation();
  const {
    statusLabel,
    chipColor,
    updatedText,
    showActions,
  } = useRealtimeStatus(position);
  const showActionsResolved = !compact && showActions;

  const handleReconnect = () => {
    requestReconnect();
  };

  const handleRefresh = async () => {
    dispatch(sessionActions.updateSocketStatus('reconnecting'));
    await pollPositionsOnce(dispatch);
    dispatch(sessionActions.updateSocketStatus('live'));
  };

  const ageSecForLabel = position
    ? Math.floor((Date.now() - new Date(position?.fixTime || position?.deviceTime).getTime()) / 1000)
    : 0;
  const label = statusLabel === 'realtimeDelayed'
    ? (t(statusLabel) || '').replace('{{s}}', String(ageSecForLabel))
    : t(statusLabel);

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
      <Chip
        size="small"
        color={chipColor}
        label={label}
        sx={{ fontWeight: 500 }}
      />
      <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
        {updatedText}
      </Box>
      {showActionsResolved && (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleReconnect}
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
  );
};

export default RealtimeStatusChip;
