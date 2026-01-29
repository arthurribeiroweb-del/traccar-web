import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Rnd } from 'react-rnd';
import {
  Card,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Snackbar,
  Alert,
  Divider,
  Button,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { makeStyles } from 'tss-react/mui';
import CloseIcon from '@mui/icons-material/Close';
import RouteIcon from '@mui/icons-material/Route';
import EditIcon from '@mui/icons-material/Edit';
import AddLocationAltIcon from '@mui/icons-material/AddLocationAlt';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import CircularProgress from '@mui/material/CircularProgress';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';

import { useTranslation } from './LocalizationProvider';
import ActionSlider from './ActionSlider';
import RemoveDialog from './RemoveDialog';
import PositionValue from './PositionValue';
import DeviceQuickStats from './DeviceQuickStats';
import AddressValue from './AddressValue';
import { canSeeDeviceAction, useDeviceReadonly, useRestriction } from '../util/permissions';
import { getDeviceDisplayName } from '../util/deviceUtils';
import usePositionAttributes from '../attributes/usePositionAttributes';
import { devicesActions } from '../../store';
import { useCatch, useCatchCallback } from '../../reactHelper';
import { useAttributePreference } from '../util/preferences';
import fetchOrThrow from '../util/fetchOrThrow';
import { snackBarDurationShortMs } from '../util/duration';

const useStyles = makeStyles()((theme, { desktopPadding, actionTone }) => ({
  card: {
    pointerEvents: 'auto',
    width: theme.dimensions.popupMaxWidth,
    backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.92 : 0.98),
    border: `1px solid ${alpha(theme.palette.divider, 0.25)}`,
    boxShadow: theme.shadows[8],
    borderRadius: theme.shape.borderRadius * 2,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing(1.5, 2, 1),
  },
  headerMain: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.25),
    minWidth: 0,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: theme.shape.borderRadius * 1.5,
    backgroundColor: alpha(theme.palette.common.white, theme.palette.mode === 'dark' ? 0.08 : 0.2),
    border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  titleStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  title: {
    fontWeight: 600,
    fontSize: '1rem',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    color: theme.palette.text.secondary,
    fontSize: '0.75rem',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: theme.palette.text.disabled,
  },
  statusDotOn: {
    backgroundColor: theme.palette.success.main,
  },
  statusDotOff: {
    backgroundColor: theme.palette.warning.main,
  },
  statusDotOffline: {
    backgroundColor: theme.palette.error.main,
  },
  statusDotNeutral: {
    backgroundColor: theme.palette.text.disabled,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
  },
  section: {
    padding: theme.spacing(0.5, 2, 1.5),
  },
  divider: {
    borderColor: alpha(theme.palette.divider, 0.35),
  },
  infoGrid: {
    display: 'grid',
    gap: theme.spacing(1),
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  infoLabel: {
    fontSize: '0.72rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: theme.palette.text.secondary,
  },
  infoValue: {
    fontSize: '0.9rem',
    fontWeight: 500,
    color: theme.palette.text.primary,
    lineHeight: 1.35,
  },
  addressClamp: {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    wordBreak: 'break-word',
    cursor: 'pointer',
  },
  addressExpanded: {
    WebkitLineClamp: 'unset',
    overflow: 'visible',
  },
  detailsGrid: {
    marginTop: theme.spacing(1),
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: theme.spacing(0.75, 1.5),
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  detailLabel: {
    fontSize: '0.7rem',
    color: theme.palette.text.secondary,
  },
  detailValue: {
    fontSize: '0.8rem',
    color: theme.palette.text.primary,
  },
  primaryAction: {
    padding: theme.spacing(1.5, 2),
    backgroundColor: alpha(actionTone, theme.palette.mode === 'dark' ? 0.12 : 0.08),
    borderTop: `1px solid ${alpha(actionTone, 0.18)}`,
    borderBottom: `1px solid ${alpha(actionTone, 0.12)}`,
  },
  primaryActionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing(1),
  },
  primaryActionTitle: {
    fontWeight: 600,
    fontSize: '0.9rem',
  },
  primaryActionBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    fontSize: '0.7rem',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: actionTone,
  },
  commandWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
  },
  pendingHint: {
    fontSize: 11,
    lineHeight: 1.2,
    textAlign: 'center',
    color: theme.palette.text.secondary,
  },
  quickActions: {
    display: 'flex',
    justifyContent: 'center',
    gap: theme.spacing(2.5),
    padding: theme.spacing(1.25, 2, 1.5),
    [theme.breakpoints.down('sm')]: {
      gap: theme.spacing(1.5),
    },
  },
  quickActionButton: {
    padding: theme.spacing(0.75),
    backgroundColor: alpha(theme.palette.common.white, theme.palette.mode === 'dark' ? 0.06 : 0.4),
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

const RETRY_MS = 60_000;
const TIMEOUT_MS = 120_000;
const TICK_MS = 500;

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
  const theme = useTheme();
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

  const [actionsEl, setActionsEl] = useState(null);

  const [removing, setRemoving] = useState(false);
  const [commandController, setCommandController] = useState(null);
  const [commandToast, setCommandToast] = useState(false);
  const [localBlocked, setLocalBlocked] = useState(null);
  const commandTimerRef = useRef(null);
  const commandControllerRef = useRef(null);
  const retryFiredRef = useRef(false);
  commandControllerRef.current = commandController;

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

  const sendCommand = useCallback((targetBlocked) => {
    const type = targetBlocked ? 'engineStop' : 'engineResume';
    return fetchOrThrow('/api/commands/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, type }),
    });
  }, [deviceId]);

  const handleCommandSend = useCatchCallback(async () => {
    const effectiveBlocked = resolvedBlockedState.blocked;
    const targetBlocked = !effectiveBlocked;
    if (commandController?.state === 'processing') return;
    try {
      await sendCommand(targetBlocked);
      setCommandController({
        state: 'processing',
        attempt: 1,
        startedAt: Date.now(),
        targetBlocked,
        retrying: false,
      });
      try {
        const r = await fetchOrThrow('/api/devices');
        const list = await r.json();
        dispatch(devicesActions.refresh(list));
      } catch (e) {
        debugLog('[device-lock] devices refetch after send', e);
      }
    } catch (error) {
      debugLog('[device-lock] send failed', error);
      throw error;
    }
  }, [commandController?.state, dispatch, resolvedBlockedState.blocked, sendCommand]);

  useEffect(() => {
    const c = commandController;
    if (!c || c.state !== 'processing') {
      retryFiredRef.current = false;
      return;
    }
    retryFiredRef.current = false;
    const clearTimer = () => {
      if (commandTimerRef.current) {
        clearInterval(commandTimerRef.current);
        commandTimerRef.current = null;
      }
    };
    const startedAt = c.startedAt;
    const targetBlocked = c.targetBlocked;
    commandTimerRef.current = setInterval(() => {
      const cc = commandControllerRef.current;
      if (!cc || cc.state !== 'processing') return;
      const elapsed = Date.now() - startedAt;
      if (elapsed >= TIMEOUT_MS) {
        clearTimer();
        setCommandController((prev) => prev && prev.state === 'processing'
          ? { ...prev, state: 'timeout' }
          : prev);
        return;
      }
      if (elapsed >= RETRY_MS && !retryFiredRef.current) {
        retryFiredRef.current = true;
        setCommandController((prev) => (prev?.state === 'processing' ? { ...prev, attempt: 2, retrying: true } : prev));
        sendCommand(targetBlocked)
          .then(async () => {
            try {
              const r = await fetchOrThrow('/api/devices');
              dispatch(devicesActions.refresh(await r.json()));
            } catch (e) {
              debugLog('[device-lock] devices refetch after retry', e);
            }
          })
          .catch((err) => debugLog('[device-lock] retry send failed', err))
          .finally(() => {
            setCommandController((prev) => (prev?.state === 'processing' && prev.retrying
              ? { ...prev, retrying: false }
              : prev));
          });
      }
    }, TICK_MS);
    return clearTimer;
  }, [commandController?.state, commandController?.startedAt, dispatch, sendCommand]);

  useEffect(() => {
    const c = commandController;
    if (!c || c.state !== 'processing') return;
    const posMatch = positionBlockedKnown && positionBlockedValue === c.targetBlocked;
    const devMatch = deviceBlockedKnown && deviceBlockedValue === c.targetBlocked;
    if (posMatch || devMatch) {
      if (commandTimerRef.current) {
        clearInterval(commandTimerRef.current);
        commandTimerRef.current = null;
      }
      persistLocalBlocked({ blocked: c.targetBlocked, at: Date.now() });
      setCommandToast(true);
      setCommandController(null);
    }
  }, [
    commandController,
    deviceBlockedKnown,
    deviceBlockedValue,
    persistLocalBlocked,
    positionBlockedKnown,
    positionBlockedValue,
  ]);

  const commandDisabled = disableActions || readonly || deviceReadonly || limitCommands || !deviceOnline;
  const editDisabled = disableActions || readonly || deviceReadonly;
  const editTooltip = editDisabled
    ? (t('deviceEditNoPermission') || 'No permission to edit')
    : t('sharedEdit');

  const effectiveBlocked = resolvedBlockedState.blocked;
  const isProcessing = commandController?.state === 'processing';
  const isTimeout = commandController?.state === 'timeout';
  const stateText = effectiveBlocked ? 'BLOQUEADO' : 'DESBLOQUEADO';
  const stateLineText = `Veículo: ${stateText}`;
  const actionText = effectiveBlocked ? 'DESBLOQUEAR VEÍCULO' : 'BLOQUEAR VEÍCULO';
  const actionIcon = effectiveBlocked ? <LockOpenIcon fontSize="inherit" /> : <LockIcon fontSize="inherit" />;
  const sliderLabel = stateText;
  const sliderTone = isProcessing
    ? 'neutral'
    : (effectiveBlocked ? 'danger' : 'success');
  const actionTone = sliderTone === 'danger'
    ? theme.palette.error.main
    : sliderTone === 'success'
      ? theme.palette.success.main
      : theme.palette.text.secondary;
  const sliderDirection = effectiveBlocked ? 'right' : 'left';
  const sliderIcon = isProcessing
    ? <CircularProgress size={14} />
    : (effectiveBlocked ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />);

  let commandStatusLine = null;
  if (isProcessing) {
    const c = commandController;
    if (c?.retrying) {
      commandStatusLine = t('deviceCommandRetrySending');
    } else if (c?.attempt === 2) {
      commandStatusLine = t('deviceCommandProcessing2');
    } else {
      commandStatusLine = t('deviceCommandProcessing1');
    }
  } else if (isTimeout) {
    commandStatusLine = null;
  }

  const handleSliderStart = () => {};

  const handleRetryClick = () => {
    setCommandController(null);
  };
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
    });
  }, [deviceId, resolvedBlockedState.blocked, resolvedBlockedState.source]);

  const statusInfo = useMemo(() => {
    if (!device) {
      return { label: t('deviceStatusUnknown'), tone: 'neutral' };
    }
    if (!deviceOnline) {
      return { label: t('deviceStatusOffline'), tone: 'offline' };
    }
    const ignition = position?.attributes?.ignition ?? position?.attributes?.acc;
    if (ignition != null) {
      return {
        label: ignition ? t('eventIgnitionOn') : t('eventIgnitionOff'),
        tone: ignition ? 'on' : 'off',
      };
    }
    const moving = Number.isFinite(position?.speed) && position.speed > 0;
    return {
      label: moving ? t('eventDeviceMoving') : t('eventDeviceStopped'),
      tone: moving ? 'on' : 'off',
    };
  }, [device, deviceOnline, position, t]);

  const primaryInfoKeys = ['fixTime', 'address'];

  const infoKeys = useMemo(() => {
    if (!position) {
      return [];
    }
    const keys = new Set(primaryInfoKeys);
    positionItems.split(',')
      .map((key) => key.trim())
      .filter(Boolean)
      .forEach((key) => keys.add(key));
    return Array.from(keys)
      .filter((key) => !hiddenPositionKeys.has(key))
      .filter((key) => primaryInfoKeys.includes(key)
        || position.hasOwnProperty(key)
        || position.attributes.hasOwnProperty(key));
  }, [position, positionItems]);
  const secondaryInfoKeys = infoKeys.filter((key) => !primaryInfoKeys.includes(key));

  const menuItems = useMemo(() => {
    if (!position) {
      return [];
    }
    const items = [
      {
        action: 'OPEN_COMMAND',
        element: (
          <MenuItem
            key="command"
            onClick={() => {
              setActionsEl(null);
              navigate(`/settings/device/${deviceId}/command`);
            }}
            disabled={disableActions}
          >
            {t('commandTitle')}
          </MenuItem>
        ),
      },
      {
        action: 'REMOVE_DEVICE',
        element: (
          <MenuItem
            key="remove"
            onClick={() => {
              setActionsEl(null);
              setRemoving(true);
            }}
            disabled={disableActions || deviceReadonly}
          >
            {t('sharedRemove')}
          </MenuItem>
        ),
      },
      {
        action: 'OPEN_GOOGLE_MAPS',
        element: (
          <MenuItem
            key="google-maps"
            component="a"
            target="_blank"
            href={`https://www.google.com/maps/search/?api=1&query=${position.latitude}%2C${position.longitude}`}
            onClick={() => setActionsEl(null)}
          >
            {t('linkGoogleMaps')}
          </MenuItem>
        ),
      },
      {
        action: 'OPEN_APPLE_MAPS',
        element: (
          <MenuItem
            key="apple-maps"
            component="a"
            target="_blank"
            href={`http://maps.apple.com/?ll=${position.latitude},${position.longitude}`}
            onClick={() => setActionsEl(null)}
          >
            {t('linkAppleMaps')}
          </MenuItem>
        ),
      },
      {
        action: 'OPEN_STREET_VIEW',
        element: (
          <MenuItem
            key="street-view"
            component="a"
            target="_blank"
            href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${position.latitude}%2C${position.longitude}&heading=${position.course}`}
            onClick={() => setActionsEl(null)}
          >
            {t('linkStreetView')}
          </MenuItem>
        ),
      },
    ];

    if (navigationAppTitle) {
      items.push({
        action: 'OPEN_NAV_APP',
        element: (
          <MenuItem
            key="nav-app"
            component="a"
            target="_blank"
            href={navigationAppLink.replace('{latitude}', position.latitude).replace('{longitude}', position.longitude)}
            onClick={() => setActionsEl(null)}
          >
            {navigationAppTitle}
          </MenuItem>
        ),
      });
    }

    if (!shareDisabled && !user.temporary) {
      items.push({
        action: 'SHARE_DEVICE',
        element: (
          <MenuItem
            key="share"
            onClick={() => {
              setActionsEl(null);
              navigate(`/settings/device/${deviceId}/share`);
            }}
          >
            <Typography color="secondary">{t('deviceShare')}</Typography>
          </MenuItem>
        ),
      });
    }

    return items;
  }, [
    deviceId,
    deviceReadonly,
    disableActions,
    navigationAppLink,
    navigationAppTitle,
    navigate,
    position,
    setActionsEl,
    shareDisabled,
    t,
    user?.temporary,
  ]);

  const visibleMenuItems = useMemo(
    () => menuItems.filter((item) => canSeeDeviceAction(user, item.action)),
    [menuItems, user],
  );
  const showMenuButton = Boolean(position) && visibleMenuItems.length > 0;

  const { classes } = useStyles({ desktopPadding, actionTone });

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
              <div className={`${classes.header} draggable-header`}>
                <div className={classes.headerMain}>
                  {deviceImage && (
                    <div className={classes.avatar}>
                      <img
                        className={classes.avatarImage}
                        src={`/api/media/${device.uniqueId}/${deviceImage}`}
                        alt={getDeviceDisplayName(device) || device.name}
                      />
                    </div>
                  )}
                  <div className={classes.titleStack}>
                    <Typography className={classes.title}>{getDeviceDisplayName(device) || device.name}</Typography>
                    <div className={classes.statusRow}>
                      <span
                        className={`${classes.statusDot} ${
                          statusInfo.tone === 'offline'
                            ? classes.statusDotOffline
                            : statusInfo.tone === 'on'
                              ? classes.statusDotOn
                              : statusInfo.tone === 'neutral'
                                ? classes.statusDotNeutral
                                : classes.statusDotOff
                        }`}
                      />
                      <PowerSettingsNewIcon fontSize="inherit" />
                      <span>{statusInfo.label}</span>
                    </div>
                  </div>
                </div>
                <div className={classes.headerActions}>
                  {showMenuButton && (
                    <Tooltip title={t('sharedExtra')}>
                      <span>
                        <IconButton
                          size="small"
                          onClick={(e) => setActionsEl(e.currentTarget)}
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                  <IconButton
                    size="small"
                    onClick={onClose}
                    onTouchStart={onClose}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </div>
              </div>
              <DeviceQuickStats device={device} position={position} />
              {position && (
                <>
                  <Divider className={classes.divider} />
                  <div className={classes.section}>
                    <div className={classes.infoGrid}>
                      {primaryInfoKeys.map((key) => (
                        <div key={key} className={classes.infoItem}>
                          <Typography className={classes.infoLabel}>
                            {positionAttributes[key]?.name || key}
                          </Typography>
                          <Typography className={classes.infoValue}>
                            {key === 'address' ? (
                              <AddressValue
                                latitude={position.latitude}
                                longitude={position.longitude}
                                originalAddress={position.address}
                                inline
                                enableExpand
                                showTooltip
                                className={classes.addressClamp}
                                expandedClassName={classes.addressExpanded}
                              />
                            ) : (
                              <PositionValue
                                position={position}
                                property={position.hasOwnProperty(key) ? key : null}
                                attribute={position.hasOwnProperty(key) ? null : key}
                              />
                            )}
                          </Typography>
                        </div>
                      ))}
                    </div>
                    {secondaryInfoKeys.length > 0 && (
                      <div className={classes.detailsGrid}>
                        {secondaryInfoKeys.map((key) => (
                          <div key={key} className={classes.detailItem}>
                            <span className={classes.detailLabel}>
                              {positionAttributes[key]?.name || key}
                            </span>
                            <span className={classes.detailValue}>
                              <PositionValue
                                position={position}
                                property={position.hasOwnProperty(key) ? key : null}
                                attribute={position.hasOwnProperty(key) ? null : key}
                              />
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              <div className={classes.primaryAction}>
                <div className={classes.primaryActionHeader}>
                  <Typography className={classes.primaryActionTitle}>
                    {stateLineText}
                  </Typography>
                  <span className={classes.primaryActionBadge}>
                    {actionIcon}
                    {actionText}
                  </span>
                </div>
                <Tooltip title={
                  !deviceOnline
                    ? t('deviceOffline')
                    : limitCommands
                      ? t('commandRestricted')
                      : actionText
                }
                >
                  <span className={classes.commandWrapper}>
                    <ActionSlider
                      label={sliderLabel}
                      status={isProcessing ? 'sending' : 'idle'}
                      tone={sliderTone}
                      icon={sliderIcon}
                      direction={sliderDirection}
                      disabled={commandDisabled || isProcessing}
                      progressOverride={isProcessing ? 0.5 : null}
                      onStart={handleSliderStart}
                      onConfirm={handleCommandSend}
                    />
                    {commandStatusLine && (
                      <Typography variant="caption" className={classes.pendingHint}>
                        {commandStatusLine}
                      </Typography>
                    )}
                    {isTimeout && (
                      <>
                        <Typography variant="caption" className={classes.pendingHint}>
                          {t('deviceCommandTimeoutMessage')}
                        </Typography>
                        <Button
                          size="small"
                          variant="outlined"
                          color="primary"
                          onClick={handleRetryClick}
                          sx={{ alignSelf: 'center', minHeight: 44 }}
                        >
                          {t('deviceCommandRetryButton')}
                        </Button>
                      </>
                    )}
                  </span>
                </Tooltip>
              </div>
              <Divider className={classes.divider} />
              <div className={classes.quickActions}>
                <Tooltip title={t('reportReplay')}>
                  <span>
                    <IconButton
                      className={classes.quickActionButton}
                      onClick={() => navigate(`/replay?deviceId=${deviceId}`)}
                      disabled={disableActions || !position}
                    >
                      <RouteIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={t('sharedCreateGeofence')}>
                  <span>
                    <IconButton
                      className={classes.quickActionButton}
                      onClick={handleGeofence}
                      disabled={!position || readonly}
                    >
                      <AddLocationAltIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={editTooltip}>
                  <span>
                    <IconButton
                      className={classes.quickActionButton}
                      onClick={onEditDevice || (() => navigate(`/settings/device/${deviceId}`))}
                      disabled={editDisabled}
                    >
                      <EditIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </div>
            </Card>
          </Rnd>
        )}
      </div>
      {showMenuButton && (
        <Menu anchorEl={actionsEl} open={Boolean(actionsEl)} onClose={() => setActionsEl(null)}>
          {visibleMenuItems.map((item) => item.element)}
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
