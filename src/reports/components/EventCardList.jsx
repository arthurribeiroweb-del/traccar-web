import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import dayjs from 'dayjs';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Skeleton,
  Tooltip,
  Typography,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import LocationSearchingIcon from '@mui/icons-material/LocationSearching';
import fetchOrThrow from '../../common/util/fetchOrThrow';
import { useTranslation } from '../../common/components/LocalizationProvider';
import { getCommandBadge, getEventSubtitle, getEventTitle } from '../common/eventLabels';

const useStyles = makeStyles()((theme) => ({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    padding: theme.spacing(2),
    [theme.breakpoints.down('md')]: {
      padding: theme.spacing(1.5),
    },
  },
  card: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing(1.25),
    padding: theme.spacing(1.25, 1.5),
    borderRadius: theme.spacing(1),
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    minWidth: 0,
    flex: 1,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    color: theme.palette.text.secondary,
    fontSize: '0.75rem',
  },
  time: {
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    minWidth: 0,
  },
  title: {
    fontWeight: 600,
    minWidth: 0,
  },
  subtitle: {
    color: theme.palette.text.secondary,
    fontSize: '0.8rem',
    lineHeight: 1.35,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  addressLine: {
    color: theme.palette.text.secondary,
    fontSize: '0.78rem',
    lineHeight: 1.35,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  addressAction: {
    fontSize: '0.78rem',
    lineHeight: 1.35,
    minHeight: 44,
    justifyContent: 'flex-start',
    padding: 0,
  },
  mapAction: {
    width: 44,
    height: 44,
    flexShrink: 0,
  },
  stateCard: {
    padding: theme.spacing(2),
  },
  stateHint: {
    marginTop: theme.spacing(0.5),
    color: theme.palette.text.secondary,
  },
}));

const formatEventTime = (value) => dayjs(value).format('HH:mm');
const formatEventDate = (value) => dayjs(value).format('DD/MM/YYYY');

const EventCardList = ({
  events,
  loading = false,
  error = false,
  onRetry,
  onFocusMap,
  showDate = false,
  commandsById = {},
}) => {
  const { classes } = useStyles();
  const t = useTranslation();
  const [addressState, setAddressState] = useState({});

  useEffect(() => {
    setAddressState((previous) => {
      const next = {};
      events.forEach(({ event, position }) => {
        const current = previous[event.id];
        if (position?.address) {
          next[event.id] = { status: 'loaded', value: position.address };
        } else if (current) {
          next[event.id] = current;
        }
      });
      return next;
    });
  }, [events]);

  const loadAddress = useCallback(async ({ event, position }) => {
    if (!position) {
      return;
    }
    setAddressState((previous) => ({
      ...previous,
      [event.id]: { status: 'loading', value: '' },
    }));
    try {
      const query = new URLSearchParams({
        latitude: position.latitude,
        longitude: position.longitude,
      });
      const response = await fetchOrThrow(`/api/server/geocode?${query.toString()}`);
      const text = (await response.text()).trim();
      if (!text || text.toLowerCase() === 'null') {
        throw new Error('Address unavailable');
      }
      setAddressState((previous) => ({
        ...previous,
        [event.id]: { status: 'loaded', value: text },
      }));
    } catch {
      setAddressState((previous) => ({
        ...previous,
        [event.id]: { status: 'error', value: '' },
      }));
    }
  }, []);

  const skeletons = useMemo(() => Array.from({ length: 6 }, (_, index) => index), []);

  if (loading) {
    return (
      <div className={classes.list}>
        {skeletons.map((item) => (
          <Skeleton key={item} variant="rounded" height={108} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={classes.list}>
        <Alert
          severity="error"
          action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>{t('reportRetry')}</Button> : null}
        >
          {t('reportEventsLoadError')}
        </Alert>
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className={classes.list}>
        <Box className={classes.stateCard}>
          <Typography variant="body2">{t('reportNoEventsPeriod')}</Typography>
          <Typography variant="caption" className={classes.stateHint}>
            {t('reportNoEventsHint')}
          </Typography>
        </Box>
      </div>
    );
  }

  return (
    <div className={classes.list}>
      {events.map((item) => {
        const {
          event,
          position,
          deviceName,
          geofenceName,
          showDeviceName,
        } = item;
        const title = getEventTitle(event, t);
        const subtitle = getEventSubtitle({
          event,
          geofenceName,
          deviceName,
          showDeviceName,
          commandsById,
          t,
        });
        const badge = getCommandBadge(event, t);
        const localAddress = addressState[event.id];
        const addressStatus = localAddress?.status;
        const addressValue = localAddress?.value || position?.address || '';
        const canLoadAddress = Boolean(position && !addressValue && addressStatus !== 'loading');

        return (
          <div key={event.id} className={classes.card}>
            <div className={classes.info}>
              <div className={classes.meta}>
                <span className={classes.time}>{formatEventTime(event.eventTime)}</span>
                {showDate && <span>{formatEventDate(event.eventTime)}</span>}
              </div>
              <div className={classes.titleRow}>
                <Typography variant="body2" className={classes.title}>
                  {title}
                </Typography>
                {badge && (
                  <Chip
                    size="small"
                    label={badge.label}
                    color={badge.tone}
                    sx={{ height: 20, fontSize: '0.68rem' }}
                  />
                )}
              </div>
              {Boolean(subtitle) && (
                <Typography className={classes.subtitle} title={subtitle}>
                  {subtitle}
                </Typography>
              )}

              {addressValue ? (
                <Typography className={classes.addressLine} title={addressValue}>
                  {addressValue}
                </Typography>
              ) : addressStatus === 'loading' ? (
                <Typography className={classes.addressLine}>
                  {t('reportLoadingAddress')}
                </Typography>
              ) : addressStatus === 'error' ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography className={classes.addressLine}>
                    {t('reportAddressUnavailable')}
                  </Typography>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => loadAddress(item)}
                    className={classes.addressAction}
                  >
                    {t('reportRetry')}
                  </Button>
                </Box>
              ) : canLoadAddress ? (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => loadAddress(item)}
                  className={classes.addressAction}
                >
                  {t('reportLoadAddress')}
                </Button>
              ) : null}
            </div>
            <Tooltip title={t('reportViewOnMap')}>
              <span>
                <IconButton
                  className={classes.mapAction}
                  aria-label={t('reportViewOnMap')}
                  onClick={() => onFocusMap?.(item)}
                  disabled={!position}
                >
                  <LocationSearchingIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
};

export default EventCardList;
