import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Snackbar,
  Toolbar,
  Typography,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import DeleteIcon from '@mui/icons-material/Delete';
import dayjs from 'dayjs';
import { formatNotificationTitle, formatTime } from '../common/util/formatter';
import { getDeviceDisplayName } from '../common/util/deviceUtils';
import { useTranslation } from '../common/components/LocalizationProvider';
import { eventsActions } from '../store';
import useFeatures from '../common/util/useFeatures';
import { radarOverspeedInfoFromEvent } from '../common/util/radar';

const useStyles = makeStyles()((theme) => ({
  drawer: {
    width: theme.dimensions.eventsDrawerWidth,
  },
  toolbar: {
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
  },
  title: {
    flexGrow: 1,
  },
}));

const EventsDrawer = ({ open, onClose }) => {
  const { classes } = useStyles();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const t = useTranslation();
  const features = useFeatures();

  const devices = useSelector((state) => state.devices.items);
  const user = useSelector((state) => state.session.user);

  const events = useSelector((state) => state.events.items);
  const deviceIds = useMemo(() => Object.keys(devices).sort(), [devices]);
  const deviceIdsKey = useMemo(() => deviceIds.join(','), [deviceIds]);
  const eventsRef = useRef(events);
  const [loading, setLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const formatType = (event) => formatNotificationTitle(t, {
    type: event.type,
    attributes: {
      ...event.attributes,
      alarms: event.attributes?.alarm,
    },
  });

  const formatSecondary = (event) => {
    const radarInfo = radarOverspeedInfoFromEvent(event);
    if (!radarInfo) {
      return formatTime(event.eventTime, 'seconds');
    }
    const radarSuffix = radarInfo.radarName ? ` — ${t('radarLabel')} ${radarInfo.radarName}` : '';
    return `${formatTime(event.eventTime, 'seconds')} • ${radarInfo.speedKph} km/h (${t('radarOverspeedLimit')} ${radarInfo.limitKph} km/h)${radarSuffix}`;
  };

  useEffect(() => {
    const ids = deviceIdsKey ? deviceIdsKey.split(',') : [];
    if (!open || features.disableEvents) {
      setLoading(false);
      return undefined;
    }
    if (!ids.length) {
      dispatch(eventsActions.reset());
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    const loadEvents = async () => {
      setLoading(true);
      try {
        const from = dayjs().subtract(7, 'day').toISOString();
        const to = dayjs().toISOString();
        const query = new URLSearchParams({ from, to });
        ids.forEach((id) => query.append('deviceId', id));
        const response = await fetch(`/api/reports/events?${query.toString()}`, {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok || cancelled) {
          return;
        }
        const data = await response.json();
        const sorted = data
          .slice()
          .sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime())
          .slice(0, 50);
        const merged = new Map();
        sorted.forEach((event) => {
          if (event?.id != null) {
            merged.set(event.id, event);
          }
        });
        eventsRef.current.forEach((event) => {
          if (event?.id != null) {
            merged.set(event.id, event);
          }
        });
        const mergedList = Array.from(merged.values())
          .sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime())
          .slice(0, 50);
        dispatch(eventsActions.reset());
        if (mergedList.length) {
          dispatch(eventsActions.add({ events: mergedList, userId: user?.id }));
        }
      } catch {
        // ignore errors to keep UI clean
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    loadEvents();
    return () => {
      cancelled = true;
    };
  }, [open, deviceIdsKey, dispatch, features.disableEvents, user?.id]);

  const handleRemove = (event, item) => {
    event.stopPropagation();
    if (!item?.id) {
      return;
    }
    setRemovingId(item.id);
    try {
      dispatch(eventsActions.dismiss({ event: item, userId: user?.id }));
      setToast({ open: true, message: 'Notificação removida.', severity: 'success' });
    } catch {
      setToast({ open: true, message: 'Não foi possível remover. Tentar novamente.', severity: 'error' });
    } finally {
      setRemovingId(null);
    }
  };

  const handleClearAll = () => {
    setConfirmClear(true);
  };

  const handleClearConfirm = () => {
    try {
      dispatch(eventsActions.dismissAll({ userId: user?.id, dismissedBefore: Date.now() }));
      setToast({ open: true, message: 'Notificações limpas.', severity: 'success' });
    } catch {
      setToast({ open: true, message: 'Não foi possível limpar. Tentar novamente.', severity: 'error' });
    } finally {
      setConfirmClear(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
    >
      <Toolbar className={classes.toolbar} disableGutters>
        <Typography variant="h6" className={classes.title}>
          {t('sharedNotifications')}
        </Typography>
        <Button
          size="small"
          color="inherit"
          startIcon={<DeleteIcon fontSize="small" />}
          onClick={handleClearAll}
          disabled={loading || !events.length}
          aria-label="Limpar todas as notificações"
        >
          Limpar tudo
        </Button>
      </Toolbar>
      <List className={classes.drawer} dense>
        {loading && !events.length && (
          <ListItemButton disabled>
            <ListItemText primary={t('sharedLoading')} />
          </ListItemButton>
        )}
        {!loading && !events.length && (
          <ListItemButton disabled>
            <ListItemText primary="Sem notificações" />
          </ListItemButton>
        )}
        {events.map((event) => (
          <ListItemButton
            key={event.id}
            onClick={() => navigate(`/event/${event.id}`)}
            disabled={!event.id}
          >
            <ListItemText
              primary={`${(devices[event.deviceId] && (getDeviceDisplayName(devices[event.deviceId]) || devices[event.deviceId].name)) || event.deviceId} - ${formatType(event)}`}
              secondary={formatSecondary(event)}
            />
            <IconButton
              size="small"
              onClick={(e) => handleRemove(e, event)}
              aria-label="Remover notificação"
            >
              {removingId === event.id ? (
                <CircularProgress size={16} />
              ) : (
                <DeleteIcon fontSize="small" className={classes.delete} />
              )}
            </IconButton>
          </ListItemButton>
        ))}
      </List>
      <Dialog open={confirmClear} onClose={() => setConfirmClear(false)}>
        <DialogTitle>Limpar notificações?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Isso remove as notificações da sua lista. Você pode continuar recebendo novas.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClear(false)}>Cancelar</Button>
          <Button color="error" onClick={handleClearConfirm}>Limpar</Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      >
        <Alert severity={toast.severity} variant="filled">
          {toast.message}
        </Alert>
      </Snackbar>
    </Drawer>
  );
};

export default EventsDrawer;
