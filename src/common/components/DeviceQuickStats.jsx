import { useState } from 'react';
import { Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { makeStyles } from 'tss-react/mui';
import SpeedIcon from '@mui/icons-material/Speed';
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
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: theme.spacing(1),
    padding: theme.spacing(1, 2, 1.5),
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.4),
    padding: theme.spacing(1),
    borderRadius: theme.shape.borderRadius * 1.25,
    backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.35 : 0.85),
    border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
    alignItems: 'center',
    textAlign: 'center',
  },
  statHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    color: theme.palette.text.secondary,
    fontSize: '0.7rem',
  },
  statValue: {
    fontWeight: 600,
    fontSize: '1.05rem',
    color: theme.palette.text.primary,
    lineHeight: 1.2,
  },
  statUnit: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    lineHeight: 1.1,
  },
  alertsValue: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
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

const splitValueUnit = (valueText) => {
  if (!valueText || valueText === '--') {
    return { value: '--', unit: '' };
  }
  const parts = String(valueText).trim().split(' ');
  if (parts.length < 2) {
    return { value: valueText, unit: '' };
  }
  const unit = parts.pop();
  return { value: parts.join(' '), unit };
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
  const speedText = offline || position?.speed == null
    ? '--'
    : formatSpeed(position.speed, speedUnit, t);

  const distanceText = dailySummary.distance == null
    ? '--'
    : formatDistance(dailySummary.distance, distanceUnit, t);

  const alertsValue = dailySummary.alerts == null ? '--' : formatCount(dailySummary.alerts);
  const alertsTooltip = dailySummary.alerts == null ? '--' : dailySummary.alerts;
  const speedParts = splitValueUnit(speedText);
  const distanceParts = splitValueUnit(distanceText);

  return (
    <div className={classes.root}>
      <div className={classes.stat}>
        <div className={classes.statHeader}>
          <SpeedIcon fontSize="inherit" />
        </div>
        <div className={classes.statValue}>{speedParts.value}</div>
        {speedParts.unit && <div className={classes.statUnit}>{speedParts.unit}</div>}
      </div>
      <div className={classes.stat}>
        <div className={classes.statHeader}>
          <RouteIcon fontSize="inherit" />
        </div>
        <div className={classes.statValue}>{distanceParts.value}</div>
        {distanceParts.unit && <div className={classes.statUnit}>{distanceParts.unit}</div>}
      </div>
      <Tooltip title={`${t('alertsToday')}: ${alertsTooltip}`}>
        <div className={classes.stat}>
          <div className={classes.statHeader}>
            <NotificationsIcon fontSize="inherit" />
          </div>
          <div className={`${classes.statValue} ${classes.alertsValue}`}>{alertsValue}</div>
        </div>
      </Tooltip>
    </div>
  );
};

export default DeviceQuickStats;
