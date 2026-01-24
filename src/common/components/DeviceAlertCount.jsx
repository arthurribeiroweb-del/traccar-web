import { useState } from 'react';
import { Tooltip, Typography } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import NotificationsIcon from '@mui/icons-material/Notifications';
import dayjs from 'dayjs';
import { useTranslation } from './LocalizationProvider';
import { useEffectAsync } from '../../reactHelper';
import useFeatures from '../util/useFeatures';

const useStyles = makeStyles()((theme) => ({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    color: theme.palette.text.secondary,
    fontSize: '0.8rem',
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  value: {
    fontWeight: 500,
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

const DeviceAlertCount = ({ deviceId }) => {
  const { classes } = useStyles();
  const t = useTranslation();
  const { disableEvents } = useFeatures();

  const [count, setCount] = useState(null);

  const dayKey = dayjs().format('YYYY-MM-DD');
  const from = dayjs().startOf('day').toISOString();
  const to = dayjs().endOf('day').toISOString();

  useEffectAsync(async () => {
    if (!deviceId || disableEvents) {
      setCount(null);
      return;
    }
    try {
      const query = new URLSearchParams({
        deviceId: String(deviceId),
        from,
        to,
      });
      const response = await fetch(`/api/events?${query.toString()}`);
      if (!response.ok) {
        setCount(null);
        return;
      }
      const events = await response.json();
      const alarmCount = events.filter((event) => event.type === 'alarm' || event.attributes?.alarm).length;
      setCount(alarmCount);
    } catch (error) {
      setCount(null);
    }
  }, [deviceId, dayKey, disableEvents]);

  const displayValue = count == null ? '--' : formatCount(count);
  const tooltipValue = count == null ? '--' : count;

  return (
    <Tooltip title={`${t('alertsToday')}: ${tooltipValue}`}>
      <Typography className={classes.root} component="span">
        <NotificationsIcon fontSize="inherit" />
        <span className={classes.value}>{displayValue}</span>
      </Typography>
    </Tooltip>
  );
};

export default DeviceAlertCount;
