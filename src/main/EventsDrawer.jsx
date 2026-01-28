import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Drawer, IconButton, List, ListItemButton, ListItemText, Toolbar, Typography,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import DeleteIcon from '@mui/icons-material/Delete';
import dayjs from 'dayjs';
import { formatNotificationTitle, formatTime } from '../common/util/formatter';
import { useTranslation } from '../common/components/LocalizationProvider';
import { eventsActions } from '../store';
import useFeatures from '../common/util/useFeatures';

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

  const events = useSelector((state) => state.events.items);
  const deviceIds = useMemo(() => Object.keys(devices).sort(), [devices]);
  const deviceIdsKey = useMemo(() => deviceIds.join(','), [deviceIds]);
  const eventsRef = useRef(events);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const formatType = (event) => formatNotificationTitle(t, {
    type: event.type,
    attributes: {
      alarms: event.attributes.alarm,
    },
  });

  useEffect(() => {
    const ids = deviceIdsKey ? deviceIdsKey.split(',') : [];
    if (!open || features.disableEvents) {
      setLoading(false);
      return undefined;
    }
    if (!ids.length) {
      dispatch(eventsActions.deleteAll());
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
        dispatch(eventsActions.deleteAll());
        if (mergedList.length) {
          dispatch(eventsActions.add(mergedList));
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
  }, [open, deviceIdsKey, dispatch, features.disableEvents]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
    >
      <Toolbar className={classes.toolbar} disableGutters>
        <Typography variant="h6" className={classes.title}>
          {t('reportEvents')}
        </Typography>
        <IconButton size="small" color="inherit" onClick={() => dispatch(eventsActions.deleteAll())}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Toolbar>
      <List className={classes.drawer} dense>
        {loading && !events.length && (
          <ListItemButton disabled>
            <ListItemText primary={t('sharedLoading')} />
          </ListItemButton>
        )}
        {!loading && !events.length && (
          <ListItemButton disabled>
            <ListItemText primary={t('sharedNoData')} />
          </ListItemButton>
        )}
        {events.map((event) => (
          <ListItemButton
            key={event.id}
            onClick={() => navigate(`/event/${event.id}`)}
            disabled={!event.id}
          >
            <ListItemText
              primary={`${devices[event.deviceId]?.name || event.deviceId} - ${formatType(event)}`}
              secondary={formatTime(event.eventTime, 'seconds')}
            />
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                dispatch(eventsActions.delete(event));
              }}
            >
              <DeleteIcon fontSize="small" className={classes.delete} />
            </IconButton>
          </ListItemButton>
        ))}
      </List>
    </Drawer>
  );
};

export default EventsDrawer;
