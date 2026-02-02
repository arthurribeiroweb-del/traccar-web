import { useMemo, useRef } from 'react';
import {
  Paper,
  Typography,
  IconButton,
  Skeleton,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { makeStyles } from 'tss-react/mui';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAttributePreference } from '../common/util/preferences';
import { speedFromKnots, speedUnitString } from '../common/util/converter';
import { getDeviceDisplayName } from '../common/util/deviceUtils';
import RealtimeStatusChip from '../common/components/RealtimeStatusChip';

const swipeThresholdPx = 24;

const useStyles = makeStyles()((theme, { desktopPadding }) => ({
  root: {
    pointerEvents: 'none',
    position: 'fixed',
    zIndex: 5,
    left: '50%',
    transform: 'translateX(-50%)',
    [theme.breakpoints.up('md')]: {
      left: `calc(50% + ${desktopPadding} / 2)`,
      bottom: theme.spacing(2),
    },
    [theme.breakpoints.down('md')]: {
      left: '50%',
      bottom: `calc(${theme.spacing(2)} + ${theme.dimensions.bottomBarHeight}px)`,
    },
  },
  card: {
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(0.75, 1.5),
    minHeight: 38,
    width: `calc(100vw - ${theme.spacing(4)})`,
    maxWidth: theme.dimensions.popupMaxWidth,
    backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.7 : 0.9),
    border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
    backdropFilter: 'blur(10px)',
    boxShadow: theme.shadows[6],
    borderRadius: theme.shape.borderRadius * 2,
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'transform 160ms ease, opacity 160ms ease',
  },
  text: {
    flex: 1,
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontWeight: 500,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.25),
  },
}));

const BottomPeekCard = ({
  device,
  position,
  desktopPadding = 0,
  onExpand,
  onClose,
  enableSwipe = true,
}) => {
  const { classes } = useStyles({ desktopPadding });
  const t = useTranslation();
  const speedUnit = useAttributePreference('speedUnit');
  const swipeRef = useRef(null);

  const statusLabel = useMemo(() => {
    const ignition = position?.attributes?.ignition;
    const acc = position?.attributes?.acc;
    const ignitionValue = ignition ?? acc;
    if (ignitionValue != null) {
      return ignitionValue ? t('eventIgnitionOn') : t('eventIgnitionOff');
    }
    const moving = Number.isFinite(position?.speed) && position.speed > 0;
    return moving ? t('eventDeviceMoving') : t('eventDeviceStopped');
  }, [position, t]);

  const speedLabel = useMemo(() => {
    if (!Number.isFinite(position?.speed) || position.speed <= 0) {
      return null;
    }
    const value = Math.round(speedFromKnots(position.speed, speedUnit));
    return `${value} ${speedUnitString(speedUnit, t)}`;
  }, [position, speedUnit, t]);

  const lineText = useMemo(() => {
    const parts = [];
    const label = device ? (getDeviceDisplayName(device) || device.name) : '';
    if (label) {
      parts.push(label);
    }
    if (statusLabel) {
      parts.push(statusLabel);
    }
    if (speedLabel) {
      parts.push(speedLabel);
    }
    return parts.join(' | ');
  }, [device, statusLabel, speedLabel]);

  const isLoading = !device || !position;

  const handlePointerDown = (event) => {
    if (!enableSwipe) {
      return;
    }
    if (event.pointerType === 'mouse' && event.buttons !== 1) {
      return;
    }
    swipeRef.current = { y: event.clientY };
  };

  const handlePointerMove = (event) => {
    if (!enableSwipe || !swipeRef.current) {
      return;
    }
    const delta = swipeRef.current.y - event.clientY;
    if (delta > swipeThresholdPx) {
      swipeRef.current = null;
      onExpand?.();
    }
  };

  const clearSwipe = () => {
    swipeRef.current = null;
  };

  return (
    <div className={classes.root}>
      <Paper
        elevation={4}
        className={classes.card}
        onClick={() => onExpand?.()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={clearSwipe}
        onPointerCancel={clearSwipe}
        onPointerLeave={clearSwipe}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onExpand?.();
          }
        }}
      >
        {isLoading ? (
          <Skeleton variant="text" width="70%" />
        ) : (
          <>
            <Typography variant="body2" color="textPrimary" className={classes.text}>
              {lineText}
            </Typography>
            <RealtimeStatusChip position={position} compact />
          </>
        )}
        <div className={classes.actions}>
          <KeyboardArrowUpIcon fontSize="small" color="action" />
          <IconButton
            size="small"
            aria-label={t('sharedCancel')}
            onClick={(event) => {
              event.stopPropagation();
              onClose?.();
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </div>
      </Paper>
    </div>
  );
};

export default BottomPeekCard;
