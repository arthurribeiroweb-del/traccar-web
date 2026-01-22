import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import {
  IconButton, Tooltip, Avatar, ListItemAvatar, ListItemText, ListItemButton,
  Typography, Menu, MenuItem, ListItemIcon,
} from '@mui/material';
import BatteryFullIcon from '@mui/icons-material/BatteryFull';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import Battery60Icon from '@mui/icons-material/Battery60';
import BatteryCharging60Icon from '@mui/icons-material/BatteryCharging60';
import Battery20Icon from '@mui/icons-material/Battery20';
import BatteryCharging20Icon from '@mui/icons-material/BatteryCharging20';
import ErrorIcon from '@mui/icons-material/Error';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { devicesActions } from '../store';
import {
  formatAlarm, formatBoolean, formatPercentage, formatStatus, getStatusColor,
} from '../common/util/formatter';
import { useTranslation } from '../common/components/LocalizationProvider';
import { mapIconKey, mapIcons } from '../map/core/preloadImages';
import { useAdministrator } from '../common/util/permissions';
import EngineIcon from '../resources/images/data/engine.svg?react';
import { useAttributePreference } from '../common/util/preferences';
import GeofencesValue from '../common/components/GeofencesValue';
import DriverValue from '../common/components/DriverValue';
import deviceCategories from '../common/util/deviceCategories';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { useCatch } from '../reactHelper';

dayjs.extend(relativeTime);

const useStyles = makeStyles()((theme) => ({
  icon: {
    width: '25px',
    height: '25px',
    filter: 'brightness(0) invert(1)',
  },
  menuIcon: {
    width: '20px',
    height: '20px',
  },
  batteryText: {
    fontSize: '0.75rem',
    fontWeight: 'normal',
    lineHeight: '0.875rem',
  },
  success: {
    color: theme.palette.success.main,
  },
  warning: {
    color: theme.palette.warning.main,
  },
  error: {
    color: theme.palette.error.main,
  },
  neutral: {
    color: theme.palette.neutral.main,
  },
  selected: {
    backgroundColor: theme.palette.action.selected,
  },
}));

const DeviceRow = ({ devices, index, style }) => {
  const { classes } = useStyles();
  const dispatch = useDispatch();
  const t = useTranslation();

  const admin = useAdministrator();
  const selectedDeviceId = useSelector((state) => state.devices.selectedId);

  const item = devices[index];
  const position = useSelector((state) => state.session.positions[item.id]);
  const [categoryAnchorEl, setCategoryAnchorEl] = useState(null);

  const devicePrimary = useAttributePreference('devicePrimary', 'name');
  const deviceSecondary = useAttributePreference('deviceSecondary', '');

  const resolveFieldValue = (field) => {
    if (field === 'geofenceIds') {
      const geofenceIds = position?.geofenceIds;
      return geofenceIds?.length ? <GeofencesValue geofenceIds={geofenceIds} /> : null;
    }
    if (field === 'driverUniqueId') {
      const driverUniqueId = position?.attributes?.driverUniqueId;
      return driverUniqueId ? <DriverValue driverUniqueId={driverUniqueId} /> : null;
    }
    return item[field];
  };

  const primaryValue = resolveFieldValue(devicePrimary);
  const secondaryValue = resolveFieldValue(deviceSecondary);
  const categoryMenuOpen = Boolean(categoryAnchorEl);
  const categoryLabel = (category) => t(`category${category.replace(/^\w/, (c) => c.toUpperCase())}`);

  const secondaryText = () => {
    let status;
    if (item.status === 'online' || !item.lastUpdate) {
      status = formatStatus(item.status, t);
    } else {
      status = dayjs(item.lastUpdate).fromNow();
    }
    return (
      <>
        {secondaryValue && (<>{secondaryValue}{' • '}</>)}
        <span className={classes[getStatusColor(item.status)]}>{status}</span>
      </>
    );
  };

  const handleCategoryOpen = (event) => {
    event.stopPropagation();
    setCategoryAnchorEl(event.currentTarget);
  };

  const handleCategoryClose = (event) => {
    event?.stopPropagation();
    setCategoryAnchorEl(null);
  };

  const handleCategorySelect = useCatch(async (event) => {
    event.stopPropagation();
    const { value } = event.currentTarget.dataset;
    handleCategoryClose(event);
    if (value === item.category) {
      return;
    }
    const response = await fetchOrThrow(`/api/devices/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, category: value }),
    });
    dispatch(devicesActions.update([await response.json()]));
  });

  return (
    <div style={style}>
      <ListItemButton
        key={item.id}
        onClick={() => dispatch(devicesActions.selectId(item.id))}
        disabled={!admin && item.disabled}
        selected={selectedDeviceId === item.id}
        className={selectedDeviceId === item.id ? classes.selected : null}
      >
        <ListItemAvatar>
          <Avatar>
            <img className={classes.icon} src={mapIcons[mapIconKey(item.category)]} alt="" />
          </Avatar>
        </ListItemAvatar>
        <ListItemText
          primary={primaryValue}
          secondary={secondaryText()}
          slots={{
            primary: Typography,
            secondary: Typography,
          }}
          slotProps={{
            primary: { noWrap: true },
            secondary: { noWrap: true },
          }}
        />
        {admin && (
          <>
            <Tooltip title={t('deviceCategory')}>
              <IconButton size="small" onClick={handleCategoryOpen} onMouseDown={(event) => event.stopPropagation()}>
                <DirectionsCarIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={categoryAnchorEl}
              open={categoryMenuOpen}
              onClose={handleCategoryClose}
              onClick={(event) => event.stopPropagation()}
            >
              {deviceCategories.map((category) => (
                <MenuItem
                  key={category}
                  data-value={category}
                  selected={category === item.category}
                  onClick={handleCategorySelect}
                >
                  <ListItemIcon>
                    <img className={classes.menuIcon} src={mapIcons[mapIconKey(category)]} alt="" />
                  </ListItemIcon>
                  {categoryLabel(category)}
                </MenuItem>
              ))}
            </Menu>
          </>
        )}
        {position && (
          <>
            {position.attributes.hasOwnProperty('alarm') && (
              <Tooltip title={`${t('eventAlarm')}: ${formatAlarm(position.attributes.alarm, t)}`}>
                <IconButton size="small">
                  <ErrorIcon fontSize="small" className={classes.error} />
                </IconButton>
              </Tooltip>
            )}
            {position.attributes.hasOwnProperty('ignition') && (
              <Tooltip title={`${t('positionIgnition')}: ${formatBoolean(position.attributes.ignition, t)}`}>
                <IconButton size="small">
                  {position.attributes.ignition ? (
                    <EngineIcon width={20} height={20} className={classes.success} />
                  ) : (
                    <EngineIcon width={20} height={20} className={classes.neutral} />
                  )}
                </IconButton>
              </Tooltip>
            )}
            {position.attributes.hasOwnProperty('batteryLevel') && (
              <Tooltip title={`${t('positionBatteryLevel')}: ${formatPercentage(position.attributes.batteryLevel)}`}>
                <IconButton size="small">
                  {(position.attributes.batteryLevel > 70 && (
                    position.attributes.charge
                      ? (<BatteryChargingFullIcon fontSize="small" className={classes.success} />)
                      : (<BatteryFullIcon fontSize="small" className={classes.success} />)
                  )) || (position.attributes.batteryLevel > 30 && (
                    position.attributes.charge
                      ? (<BatteryCharging60Icon fontSize="small" className={classes.warning} />)
                      : (<Battery60Icon fontSize="small" className={classes.warning} />)
                  )) || (
                    position.attributes.charge
                      ? (<BatteryCharging20Icon fontSize="small" className={classes.error} />)
                      : (<Battery20Icon fontSize="small" className={classes.error} />)
                  )}
                </IconButton>
              </Tooltip>
            )}
          </>
        )}
      </ListItemButton>
    </div>
  );
};

export default DeviceRow;
