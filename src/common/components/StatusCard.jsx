import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Rnd } from 'react-rnd';
import {
  Card,
  CardContent,
  Typography,
  CardActions,
  IconButton,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Menu,
  MenuItem,
  CardMedia,
  Tooltip,
  Snackbar,
  Alert,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import CloseIcon from '@mui/icons-material/Close';
import RouteIcon from '@mui/icons-material/Route';
import SendIcon from '@mui/icons-material/Send';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PendingIcon from '@mui/icons-material/Pending';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import CircularProgress from '@mui/material/CircularProgress';

import { useTranslation } from './LocalizationProvider';
import ActionSlider from './ActionSlider';
import RemoveDialog from './RemoveDialog';
import PositionValue from './PositionValue';
import DeviceQuickStats from './DeviceQuickStats';
import { useDeviceReadonly, useRestriction } from '../util/permissions';
import usePositionAttributes from '../attributes/usePositionAttributes';
import { devicesActions } from '../../store';
import { useCatch, useCatchCallback } from '../../reactHelper';
import { useAttributePreference } from '../util/preferences';
import fetchOrThrow from '../util/fetchOrThrow';
import { snackBarDurationShortMs } from '../util/duration';

const useStyles = makeStyles()((theme, { desktopPadding }) => ({
  card: {
    pointerEvents: 'auto',
    width: theme.dimensions.popupMaxWidth,
  },
  media: {
    height: theme.dimensions.popupImageHeight,
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
  },
  mediaButton: {
    color: theme.palette.common.white,
    mixBlendMode: 'difference',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing(1, 1, 0, 2),
  },
  content: {
    paddingTop: theme.spacing(1),
    paddingBottom: theme.spacing(1),
    maxHeight: theme.dimensions.cardContentMaxHeight,
    overflow: 'auto',
  },
  icon: {
    width: '25px',
    height: '25px',
    filter: 'brightness(0) invert(1)',
  },
  table: {
    '& .MuiTableCell-sizeSmall': {
      paddingLeft: 0,
      paddingRight: 0,
    },
    '& .MuiTableCell-sizeSmall:first-of-type': {
      paddingRight: theme.spacing(1),
    },
  },
  cell: {
    borderBottom: 'none',
  },
  actions: {
    justifyContent: 'space-between',
  },
  commandWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 4,
    margin: theme.spacing(0, 1),
  },
  pendingHint: {
    fontSize: 11,
    lineHeight: 1.2,
    textAlign: 'center',
    color: theme.palette.text.secondary,
  },
  root: {
    pointerEvents: 'none',
    position: 'fixed',
    zIndex: 5,
    left: '50%',
    [theme.breakpoints.up('md')]: {
      left: `calc(50% + ${desktopPadding} / 2)`,
      bottom: theme.spacing(3),
    },
    [theme.breakpoints.down('md')]: {
      left: '50%',
      bottom: `calc(${theme.spacing(3)} + ${theme.dimensions.bottomBarHeight}px)`,
    },
    transform: 'translateX(-50%)',
  },
}));

const StatusRow = ({ name, content }) => {
  const { classes } = useStyles({ desktopPadding: 0 });

  return (
    <TableRow>
      <TableCell className={classes.cell}>
        <Typography variant="body2">{name}</Typography>
      </TableCell>
      <TableCell className={classes.cell}>
        <Typography variant="body2" color="textSecondary">{content}</Typography>
      </TableCell>
    </TableRow>
  );
};

const pendingWindowMs = 5 * 60 * 1000;
const isDev = process.env.NODE_ENV === 'development';

const debugLog = (...args) => {
  if (isDev) {
    // eslint-disable-next-line no-console
    console.debug(...args);
  }
};

const StatusCard = ({
  deviceId,
  position,
  onClose,
  onEditDevice,
  disableActions,
  desktopPadding = 0,
}) => {
  const { classes } = useStyles({ desktopPadding });
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const t = useTranslation();

  const readonly = useRestriction('readonly');
  const limitCommands = useRestriction('limitCommands');
  const deviceReadonly = useDeviceReadonly();

  const shareDisabled = useSelector((state) => state.session.server.attributes.disableShare);
  const user = useSelector((state) => state.session.user);
  const device = useSelector((state) => state.devices.items[deviceId]);

  const deviceImage = device?.attributes?.deviceImage;
  const deviceOnline = device?.status === 'online';

  const positionBlockedKnown = position?.attributes && (
    Object.prototype.hasOwnProperty.call(position.attributes, 'blocked')
    || Object.prototype.hasOwnProperty.call(position.attributes, 'lock')
  );
  const positionBlockedValue = positionBlockedKnown
    ? Boolean(position?.attributes?.blocked ?? position?.attributes?.lock)
    : null;

  const deviceBlockedKnown = device?.attributes
    && Object.prototype.hasOwnProperty.call(device.attributes, 'blocked');
  const deviceBlockedValue = deviceBlockedKnown ? Boolean(device?.attributes?.blocked) : null;
  const deviceBlockedAt = device?.attributes?.blockedAt != null
    ? Number(device.attributes.blockedAt)
    : null;

  const positionAttributes = usePositionAttributes(t);
  const positionItems = useAttributePreference('positionItems', 'fixTime,address,speed,totalDistance');
  const hiddenPositionKeys = new Set(['speed', 'totalDistance']);

  const navigationAppLink = useAttributePreference('navigationAppLink');
  const navigationAppTitle = useAttributePreference('navigationAppTitle');

  const [anchorEl, setAnchorEl] = useState(null);

  const [removing, setRemoving] = useState(false);
  const [commandState, setCommandState] = useState('idle');
  const [commandToast, setCommandToast] = useState(false);
  const [localBlocked, setLocalBlocked] = useState(null);
  const [, setPendingTick] = useState(0);

  const localStorageKey = deviceId ? `deviceLockState:${deviceId}` : null;
  const readLocalBlocked = useCallback(() => {
    if (!localStorageKey) {
      return null;
    }
    try {
      const raw = localStorage.getItem(localStorageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (typeof parsed?.blocked !== 'boolean') {
        return null;
      }
      const at = Number(parsed?.at);
      return {
        blocked: parsed.blocked,
        at: Number.isFinite(at) ? at : Date.now(),
      };
    } catch (error) {
      return null;
    }
  }, [localStorageKey]);

  const persistLocalBlocked = useCallback((next) => {
    setLocalBlocked(next);
    if (!localStorageKey) {
      return;
    }
    try {
      if (next) {
        localStorage.setItem(localStorageKey, JSON.stringify(next));
      } else {
        localStorage.removeItem(localStorageKey);
      }
    } catch (error) {
      // Ignore storage errors (private mode, quota, etc.)
    }
  }, [localStorageKey]);

  useEffect(() => {
    setLocalBlocked(readLocalBlocked());
  }, [readLocalBlocked]);

  const resolvedBlockedState = useMemo(() => {
    if (positionBlockedKnown) {
      return { blocked: positionBlockedValue, source: 'position', at: null };
    }

    const optimisticIsNewer = localBlocked
      && (deviceBlockedAt == null || localBlocked.at > deviceBlockedAt);

    if (optimisticIsNewer) {
      return { blocked: localBlocked.blocked, source: 'local', at: localBlocked.at };
    }

    if (deviceBlockedKnown) {
      return { blocked: deviceBlockedValue, source: 'device', at: deviceBlockedAt };
    }

    if (localBlocked) {
      return { blocked: localBlocked.blocked, source: 'local', at: localBlocked.at };
    }

    return { blocked: false, source: 'none', at: null };
  }, [
    deviceBlockedAt,
    deviceBlockedKnown,
    deviceBlockedValue,
    localBlocked,
    positionBlockedKnown,
    positionBlockedValue,
  ]);

  const lastCommandAt = localBlocked?.at ?? deviceBlockedAt;
  const isPending = resolvedBlockedState.source !== 'position'
    && lastCommandAt != null
    && Date.now() - lastCommandAt < pendingWindowMs;

  const handleRemove = useCatch(async (removed) => {
    if (removed) {
      const response = await fetchOrThrow('/api/devices');
      dispatch(devicesActions.refresh(await response.json()));
    }
    setRemoving(false);
  });

  const handleGeofence = useCatchCallback(async () => {
    const newItem = {
      name: t('sharedGeofence'),
      area: `CIRCLE (${position.latitude} ${position.longitude}, 50)`,
    };
    const response = await fetchOrThrow('/api/geofences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItem),
    });
    const item = await response.json();
    await fetchOrThrow('/api/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: position.deviceId, geofenceId: item.id }),
    });
    navigate(`/settings/geofence/${item.id}`);
  }, [navigate, position]);

  const handleCommandSend = useCatchCallback(async () => {
    setCommandState('sending');
    try {
      const command = {
        deviceId,
        type: resolvedBlockedState.blocked ? 'engineResume' : 'engineStop',
      };
      const response = await fetchOrThrow('/api/commands/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }
      debugLog('[device-lock] commands/send response', {
        deviceId,
        status: response.status,
        payload,
      });
      debugLog('[device-lock] device/position after send', {
        deviceId: device?.id,
        deviceAttributes: device?.attributes,
        positionId: position?.id,
        positionAttributes: position?.attributes,
      });
      debugLog('[device-lock] decision after send', {
        deviceId,
        blocked: resolvedBlockedState.blocked,
        source: resolvedBlockedState.source,
      });

      persistLocalBlocked({
        blocked: !resolvedBlockedState.blocked,
        at: Date.now(),
      });
      setCommandToast(true);
      setCommandState('idle');
    } catch (error) {
      setCommandState('error');
      throw error;
    }
  }, [
    deviceId,
    device?.attributes,
    device?.id,
    persistLocalBlocked,
    position?.attributes,
    position?.id,
    resolvedBlockedState.blocked,
    resolvedBlockedState.source,
  ]);

  const commandDisabled = disableActions || readonly || deviceReadonly || limitCommands || !deviceOnline;
  const editDisabled = disableActions || readonly || deviceReadonly;
  const editTooltip = editDisabled
    ? (t('deviceEditNoPermission') || 'No permission to edit')
    : t('sharedEdit');

  const confirmedState = resolvedBlockedState.source === 'position';
  const effectiveBlocked = resolvedBlockedState.blocked;
  const retryLabel = t('deviceCommandRetry');
  const isSending = commandState === 'sending';
  let sliderLabel = effectiveBlocked ? t('deviceLocked') : t('deviceSliderLock');
  if (isSending) {
    sliderLabel = t('deviceCommandSending');
  } else if (commandState === 'error') {
    sliderLabel = retryLabel
      ? `${t('deviceCommandFailed')} ${retryLabel}`
      : t('deviceCommandFailed');
  } else if (effectiveBlocked) {
    sliderLabel = t('deviceLocked');
  }
  const sliderTone = isSending
    ? 'neutral'
    : (effectiveBlocked ? 'success' : 'warning');
  const sliderDirection = effectiveBlocked ? 'right' : 'left';
  const sliderIcon = isSending
    ? <CircularProgress size={14} />
    : (commandState === 'error'
      ? <PendingIcon fontSize="small" />
      : (effectiveBlocked ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />));

  const handleSliderStart = () => {
    if (commandState === 'error') {
      setCommandState('idle');
    }
  };
  useEffect(() => {
    if (lastCommandAt == null) {
      return undefined;
    }
    const remaining = pendingWindowMs - (Date.now() - lastCommandAt);
    if (remaining <= 0) {
      return undefined;
    }
    const timer = setTimeout(() => setPendingTick((tick) => tick + 1), remaining);
    return () => clearTimeout(timer);
  }, [lastCommandAt]);
  useEffect(() => {
    if (!localBlocked) {
      return;
    }

    if (positionBlockedKnown) {
      persistLocalBlocked(null);
      return;
    }

    if (deviceBlockedKnown && (deviceBlockedAt == null || deviceBlockedAt >= localBlocked.at)) {
      persistLocalBlocked(null);
    }
  }, [deviceBlockedAt, deviceBlockedKnown, localBlocked, persistLocalBlocked, positionBlockedKnown]);

  useEffect(() => {
    debugLog('[device-lock] decision', {
      deviceId,
      blocked: resolvedBlockedState.blocked,
      source: resolvedBlockedState.source,
      pending: isPending,
    });
  }, [deviceId, isPending, resolvedBlockedState.blocked, resolvedBlockedState.source]);

  return (
    <>
      <div className={classes.root}>
        {device && (
          <Rnd
            default={{ x: 0, y: 0, width: 'auto', height: 'auto' }}
            enableResizing={false}
            dragHandleClassName="draggable-header"
            style={{ position: 'relative' }}
          >
            <Card elevation={3} className={classes.card}>
              {deviceImage ? (
                <CardMedia
                  className={`${classes.media} draggable-header`}
                  image={`/api/media/${device.uniqueId}/${deviceImage}`}
                >
                  <IconButton
                    size="small"
                    onClick={onClose}
                    onTouchStart={onClose}
                  >
                    <CloseIcon fontSize="small" className={classes.mediaButton} />
                  </IconButton>
                </CardMedia>
              ) : (
                <div className={`${classes.header} draggable-header`}>
                  <Typography variant="body2" color="textSecondary">
                    {device.name}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={onClose}
                    onTouchStart={onClose}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </div>
              )}
              <DeviceQuickStats device={device} position={position} />
              {position && (
                <CardContent className={classes.content}>
                  <Table size="small" classes={{ root: classes.table }}>
                    <TableBody>
                      {positionItems.split(',')
                        .filter((key) => !hiddenPositionKeys.has(key))
                        .filter((key) => position.hasOwnProperty(key) || position.attributes.hasOwnProperty(key))
                        .map((key) => (
                        <StatusRow
                          key={key}
                          name={positionAttributes[key]?.name || key}
                          content={(
                            <PositionValue
                              position={position}
                              property={position.hasOwnProperty(key) ? key : null}
                              attribute={position.hasOwnProperty(key) ? null : key}
                            />
                          )}
                        />
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
              <CardActions classes={{ root: classes.actions }} disableSpacing>
                <Tooltip title={t('sharedExtra')}>
                  <IconButton
                    color="secondary"
                    onClick={(e) => setAnchorEl(e.currentTarget)}
                    disabled={!position}
                  >
                    <PendingIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title={
                  !deviceOnline
                    ? t('deviceOffline')
                    : limitCommands
                      ? t('commandRestricted')
                      : resolvedBlockedState.blocked
                        ? t('deviceUnlock')
                        : t('deviceLock')
                }
                >
                  <span className={classes.commandWrapper}>
                    <ActionSlider
                      label={sliderLabel}
                      status={commandState}
                      tone={sliderTone}
                      icon={sliderIcon}
                      direction={sliderDirection}
                      disabled={commandDisabled || isSending}
                      onStart={handleSliderStart}
                      onConfirm={handleCommandSend}
                    />
                    {isPending && !confirmedState && (
                      <Typography variant="caption" className={classes.pendingHint}>
                        {t('deviceLockPendingHint')}
                      </Typography>
                    )}
                  </span>
                </Tooltip>
                <Tooltip title={t('reportReplay')}>
                  <IconButton
                    onClick={() => navigate(`/replay?deviceId=${deviceId}`)}
                    disabled={disableActions || !position}
                  >
                    <RouteIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('commandTitle')}>
                  <IconButton
                    onClick={() => navigate(`/settings/device/${deviceId}/command`)}
                    disabled={disableActions}
                  >
                    <SendIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title={editTooltip}>
                  <span>
                    <IconButton
                      onClick={onEditDevice || (() => navigate(`/settings/device/${deviceId}`))}
                      disabled={editDisabled}
                    >
                      <EditIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={t('sharedRemove')}>
                  <IconButton
                    color="error"
                    onClick={() => setRemoving(true)}
                    disabled={disableActions || deviceReadonly}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </CardActions>
            </Card>
          </Rnd>
        )}
      </div>
      {position && (
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
          {!readonly && <MenuItem onClick={handleGeofence}>{t('sharedCreateGeofence')}</MenuItem>}
          <MenuItem component="a" target="_blank" href={`https://www.google.com/maps/search/?api=1&query=${position.latitude}%2C${position.longitude}`}>{t('linkGoogleMaps')}</MenuItem>
          <MenuItem component="a" target="_blank" href={`http://maps.apple.com/?ll=${position.latitude},${position.longitude}`}>{t('linkAppleMaps')}</MenuItem>
          <MenuItem component="a" target="_blank" href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${position.latitude}%2C${position.longitude}&heading=${position.course}`}>{t('linkStreetView')}</MenuItem>
          {navigationAppTitle && <MenuItem component="a" target="_blank" href={navigationAppLink.replace('{latitude}', position.latitude).replace('{longitude}', position.longitude)}>{navigationAppTitle}</MenuItem>}
          {!shareDisabled && !user.temporary && (
            <MenuItem onClick={() => navigate(`/settings/device/${deviceId}/share`)}><Typography color="secondary">{t('deviceShare')}</Typography></MenuItem>
          )}
        </Menu>
      )}
      <RemoveDialog
        open={removing}
        endpoint="devices"
        itemId={deviceId}
        onResult={(removed) => handleRemove(removed)}
      />
      <Snackbar
        open={commandToast}
        autoHideDuration={snackBarDurationShortMs}
        onClose={() => setCommandToast(false)}
      >
        <Alert severity="success" variant="filled">
          {t('commandSent')}
        </Alert>
      </Snackbar>
    </>
  );
};

export default StatusCard;
