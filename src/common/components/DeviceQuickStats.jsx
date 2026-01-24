import { Typography } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import SpeedIcon from '@mui/icons-material/Speed';
import KeyIcon from '@mui/icons-material/VpnKey';
import RouteIcon from '@mui/icons-material/Route';
import { useTranslation } from './LocalizationProvider';
import { useAttributePreference } from '../util/preferences';
import { formatDistance, formatSpeed } from '../util/formatter';

const useStyles = makeStyles()((theme) => ({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    padding: theme.spacing(0.5, 2, 1),
    flexWrap: 'wrap',
  },
  item: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    color: theme.palette.text.secondary,
    fontSize: '0.8rem',
    lineHeight: 1,
  },
  value: {
    fontWeight: 500,
  },
  accOn: {
    color: theme.palette.success.main,
  },
}));

const resolveTodayDistance = (position) => {
  if (!position?.attributes) {
    return null;
  }
  if (position.attributes.hasOwnProperty('dailyDistance')) {
    return position.attributes.dailyDistance;
  }
  if (position.attributes.hasOwnProperty('todayDistance')) {
    return position.attributes.todayDistance;
  }
  if (position.attributes.hasOwnProperty('distance')) {
    return position.attributes.distance;
  }
  return null;
};

const DeviceQuickStats = ({ device, position }) => {
  const { classes } = useStyles();
  const t = useTranslation();

  const speedUnit = useAttributePreference('speedUnit');
  const distanceUnit = useAttributePreference('distanceUnit');

  const offline = !device || device.status !== 'online';
  const ignition = position?.attributes?.ignition;
  const todayDistance = resolveTodayDistance(position);

  const speedText = offline || position?.speed == null
    ? '--'
    : formatSpeed(position.speed, speedUnit, t);

  const accText = offline || ignition == null
    ? '--'
    : ignition ? 'ON' : 'OFF';

  const distanceText = offline || todayDistance == null
    ? '--'
    : formatDistance(todayDistance, distanceUnit, t);

  return (
    <div className={classes.root}>
      {offline && (
        <Typography className={classes.item}>
          {t('deviceOffline')}
        </Typography>
      )}
      {!offline && (
        <>
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
            <span className={classes.value}>{distanceText}</span>
          </span>
        </>
      )}
      {offline && (
        <>
          <span className={classes.item}>
            <SpeedIcon fontSize="inherit" />
            <span className={classes.value}>--</span>
          </span>
          <span className={classes.item}>
            <KeyIcon fontSize="inherit" />
            <span className={classes.value}>--</span>
          </span>
          <span className={classes.item}>
            <RouteIcon fontSize="inherit" />
            <span className={classes.value}>--</span>
          </span>
        </>
      )}
    </div>
  );
};

export default DeviceQuickStats;
