import {
  Alert,
  Box,
  Button,
  IconButton,
  Skeleton,
  Tooltip,
  Typography,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import LocationSearchingIcon from '@mui/icons-material/LocationSearching';
import RouteIcon from '@mui/icons-material/Route';
import dayjs from 'dayjs';
import AddressValue from '../../common/components/AddressValue';
import { useTranslation } from '../../common/components/LocalizationProvider';

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
  title: {
    fontWeight: 600,
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
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    flexShrink: 0,
  },
  actionButton: {
    width: 44,
    height: 44,
  },
  stateCard: {
    padding: theme.spacing(2),
  },
  stateHint: {
    marginTop: theme.spacing(0.5),
    color: theme.palette.text.secondary,
  },
}));

const formatClock = (value) => dayjs(value).format('HH:mm');
const formatDate = (value) => dayjs(value).format('DD/MM/YYYY');

const TripCardList = ({
  items,
  loading = false,
  error = false,
  onRetry,
  onFocusMap,
  onReplay,
  showDate = false,
  showDeviceName = false,
  getDistanceLabel,
  getDurationLabel,
  getAverageSpeedLabel,
  getMaxSpeedLabel,
}) => {
  const { classes } = useStyles();
  const t = useTranslation();

  if (loading) {
    return (
      <div className={classes.list}>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} variant="rounded" height={130} />
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

  if (!items.length) {
    return (
      <div className={classes.list}>
        <Box className={classes.stateCard}>
          <Typography variant="body2">{t('sharedNoData')}</Typography>
          <Typography variant="caption" className={classes.stateHint}>
            {t('reportNoEventsHint')}
          </Typography>
        </Box>
      </div>
    );
  }

  return (
    <div className={classes.list}>
      {items.map((item) => {
        const timeLabel = `${formatClock(item.startTime)} - ${formatClock(item.endTime)}`;
        const dateLabel = showDate ? formatDate(item.startTime) : null;
        const distanceLabel = getDistanceLabel(item);
        const durationLabel = getDurationLabel(item);
        const avgLabel = getAverageSpeedLabel(item);
        const maxLabel = getMaxSpeedLabel(item);
        return (
          <div key={`${item.startPositionId}-${item.endPositionId}-${item.deviceId}`} className={classes.card}>
            <div className={classes.info}>
              <div className={classes.meta}>
                <span className={classes.time}>{timeLabel}</span>
                {dateLabel && <span>{dateLabel}</span>}
              </div>
              <Typography variant="body2" className={classes.title}>
                {`${distanceLabel} • ${durationLabel}`}
              </Typography>
              {showDeviceName && (
                <Typography className={classes.subtitle} title={item.deviceName}>
                  {item.deviceName}
                </Typography>
              )}
              <Typography className={classes.subtitle} title={`${avgLabel} • ${maxLabel}`}>
                {`${avgLabel} • ${maxLabel}`}
              </Typography>
              <Typography className={classes.addressLine}>
                {`${t('reportStartAddress')}: `}
                <AddressValue
                  inline
                  latitude={item.startLat}
                  longitude={item.startLon}
                  originalAddress={item.startAddress}
                />
              </Typography>
              <Typography className={classes.addressLine}>
                {`${t('reportEndAddress')}: `}
                <AddressValue
                  inline
                  latitude={item.endLat}
                  longitude={item.endLon}
                  originalAddress={item.endAddress}
                />
              </Typography>
            </div>
            <div className={classes.actions}>
              <Tooltip title={t('reportViewOnMap')}>
                <span>
                  <IconButton
                    className={classes.actionButton}
                    aria-label={t('reportViewOnMap')}
                    onClick={() => onFocusMap?.(item)}
                  >
                    <LocationSearchingIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={t('reportReplay')}>
                <span>
                  <IconButton
                    className={classes.actionButton}
                    aria-label={t('reportReplay')}
                    onClick={() => onReplay?.(item)}
                  >
                    <RouteIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TripCardList;
