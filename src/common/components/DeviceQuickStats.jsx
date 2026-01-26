import { useState } from 'react';
import { Tooltip, Typography } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import SpeedIcon from '@mui/icons-material/Speed';
import KeyIcon from '@mui/icons-material/VpnKey';
import RouteIcon from '@mui/icons-material/Route';
import NotificationsIcon from '@mui/icons-material/Notifications';
import dayjs from 'dayjs';
import { useTranslation } from './LocalizationProvider';
import { useAttributePreference } from '../util/preferences';
import { formatDistance, formatSpeed } from '../util/formatter';
import { useRestriction } from '../util/permissions';
import { useEffectAsync } from '../../reactHelper';

const useStyles = makeStyles()((theme) => ({
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
    padding: theme.spacing(0.5, 2, 1),
    flexWrap: 'nowrap',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    flexWrap: 'wrap',
    flex: 1,
    minWidth: 0,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
  },
  item: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    color: theme.palette.text.secondary,
    fontSize: '0.8rem',
    lineHeight: 1,
  },
  label: {
    fontSize: '0.72rem',
    opacity: 0.85,
  },
  value: {
    fontWeight: 500,
  },
  accOn: {
    color: theme.palette.success.main,
  },
}));

const formatCount = (count) => {
  if (count > 999) {
    const value = (count / 1000).toFixed(count < 10000 ? 1 : 0);
    return `${value}k`;
  }
  if (count > 99) {
    return '99+';
  }
  return String(count);
};

const DeviceQuickStats = ({ device, position }) => {
  const { classes } = useStyles();
  const t = useTranslation();
  const disableReports = useRestriction('disableReports');

  const speedUnit = useAttributePreference('speedUnit');
  const distanceUnit = useAttributePreference('distanceUnit');

  const [dailySummary, setDailySummary] = useState({ distance: null, alerts: null });

  const dayKey = dayjs().format('YYYY-MM-DD');

  useEffectAsync(async () => {
    if (!device?.id || disableReports) {
      setDailySummary({ distance: null, alerts: null });
      return;
    }
    try {
      const query = new URLSearchParams({ deviceId: String(device.id) });
      const response = await fetch(`/api/reports/daily?${query.toString()}`);
      if (!response.ok) {
        setDailySummary({ distance: null, alerts: null });
        return;
      }
      const summaries = await response.json();
      const summary = summaries.find((item) => item.deviceId === device.id) || summaries[0];
      setDailySummary({
        distance: summary?.distance ?? null,
        alerts: summary?.alerts ?? null,
      });
    } catch (error) {
      setDailySummary({ distance: null, alerts: null });
    }
  }, [device?.id, dayKey, disableReports]);

  const offline = !device || device.status !== 'online';
  const ignition = position?.attributes?.ignition;

  const speedText = offline || position?.speed == null
    ? '--'
    : formatSpeed(position.speed, speedUnit, t);

  const accText = offline || ignition == null
    ? '--'
    : ignition ? 'ON' : 'OFF';

  const distanceText = dailySummary.distance == null
    ? '--'
    : formatDistance(dailySummary.distance, distanceUnit, t);

  const alertsValue = dailySummary.alerts == null ? '--' : formatCount(dailySummary.alerts);
  const alertsTooltip = dailySummary.alerts == null ? '--' : dailySummary.alerts;

  return (
    <div className={classes.root}>
      <div className={classes.left}>
        {offline && (
          <Typography className={classes.item}>
            {t('deviceOffline')}
          </Typography>
        )}
        <span className={classes.item}>
          <SpeedIcon fontSize="inherit" />
          <span className={classes.value}>{speedText}</span>
        </span>
        <span className={`${classes.item} ${ignition ? classes.accOn : ''}`}>
          <KeyIcon fontSize="inherit" />
          <span className={classes.value}>{accText}</span>
        </span>
        <span className={classes.item}>
          <RouteIcon fontSize="inherit" />
          <span className={classes.label}>{t('distanceToday')}</span>
          <span className={classes.value}>{distanceText}</span>
        </span>
      </div>
      <div className={classes.right}>
        <Tooltip title={`${t('alertsToday')}: ${alertsTooltip}`}>
          <Typography className={classes.item} component="span">
            <NotificationsIcon fontSize="inherit" />
            <span className={classes.label}>{t('alertsToday')}:</span>
            <span className={classes.value}>{alertsValue}</span>
          </Typography>
        </Tooltip>
      </div>
    </div>
  );
};

export default DeviceQuickStats;
