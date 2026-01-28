import { useEffect, useMemo, useRef, useState } from 'react';
import { alpha } from '@mui/material/styles';
import { makeStyles } from 'tss-react/mui';

const thumbSize = 32;
const confirmThreshold = 0.98;

const useStyles = makeStyles()((theme, { disabled, status, tone }) => {
  const baseTrack = theme.palette.mode === 'dark'
    ? alpha(theme.palette.common.white, 0.08)
    : alpha(theme.palette.common.black, 0.08);
  const accent = tone === 'danger'
    ? theme.palette.error.main
    : tone === 'success'
      ? theme.palette.success.main
      : tone === 'warning'
        ? theme.palette.warning.main
        : theme.palette.text.secondary;
  const accentSoft = alpha(accent, 0.18);
  const textColor = disabled ? theme.palette.text.disabled : theme.palette.text.primary;

  return {
    root: {
      width: '100%',
      minWidth: 220,
      maxWidth: '100%',
      userSelect: 'none',
      [theme.breakpoints.down('sm')]: {
        minWidth: 180,
      },
    },
    track: {
      position: 'relative',
      height: 52,
      borderRadius: 999,
      background: baseTrack,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: thumbSize + 12,
      paddingRight: thumbSize + 12,
      touchAction: 'pan-y',
      transition: 'background 200ms ease',
      border: `1px solid ${alpha(accent, 0.25)}`,
      opacity: disabled ? 0.7 : 1,
    },
    progress: {
      position: 'absolute',
      inset: 0,
      width: 0,
      background: accentSoft,
      transition: 'width 120ms ease',
    },
    label: {
      position: 'absolute',
      left: thumbSize + 12,
      right: thumbSize + 12,
      zIndex: 3,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.3px',
      color: textColor,
      textTransform: 'uppercase',
      textAlign: 'center',
      whiteSpace: 'nowrap',
      overflow: 'visible',
      pointerEvents: 'none',
    },
    thumb: {
      position: 'absolute',
      top: '50%',
      left: 4,
      width: thumbSize,
      height: thumbSize,
      borderRadius: '50%',
      background: theme.palette.common.white,
      boxShadow: theme.shadows[2],
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: theme.palette.text.secondary,
      transition: disabled ? 'none' : 'transform 160ms ease',
      zIndex: 2,
    },
  };
});

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const ActionSlider = ({
  label,
  disabled,
  status = 'idle',
  tone = 'neutral',
  icon,
  direction = 'right',
  progressOverride = null,
  onConfirm,
  onStart,
}) => {
  const { classes } = useStyles({ disabled, status, tone });
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const pointerRef = useRef({ startX: 0, startOffset: 0 });
  const [trackWidth, setTrackWidth] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      setTrackWidth(trackRef.current?.clientWidth || 0);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!draggingRef.current && status !== 'idle') {
      setProgress(0);
    }
  }, [status]);

  useEffect(() => {
    if (disabled) {
      setProgress(0);
    }
  }, [disabled]);

  useEffect(() => {
    setProgress(0);
  }, [direction]);

  const maxOffset = useMemo(() => Math.max(trackWidth - thumbSize - 8, 0), [trackWidth]);
  const displayProgress = progressOverride != null ? progressOverride : progress;
  const offset = Math.round((direction === 'left' ? (1 - displayProgress) : displayProgress) * maxOffset);
  const labelOpacity = disabled ? 0.7 : Math.max(1 - displayProgress * 0.5, 0.5);

  const updateProgress = (nextOffset) => {
    if (!maxOffset) {
      setProgress(0);
      return;
    }
    const clamped = clamp(nextOffset, 0, maxOffset);
    const nextProgress = direction === 'left'
      ? 1 - (clamped / maxOffset)
      : (clamped / maxOffset);
    setProgress(clamp(nextProgress, 0, 1));
  };

  const handlePointerDown = (event) => {
    if (disabled) {
      return;
    }
    onStart?.();
    draggingRef.current = true;
    pointerRef.current = { startX: event.clientX, startOffset: offset };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!draggingRef.current || disabled) {
      return;
    }
    const delta = event.clientX - pointerRef.current.startX;
    updateProgress(pointerRef.current.startOffset + delta);
  };

  const handlePointerEnd = (event) => {
    if (!draggingRef.current) {
      return;
    }
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (progress >= confirmThreshold && !disabled) {
      setProgress(1);
      onConfirm?.();
    } else {
      setProgress(0);
    }
  };

  return (
    <div className={classes.root}>
      <div
        ref={trackRef}
        className={classes.track}
        role="slider"
        aria-disabled={disabled}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div className={classes.progress} style={{ width: `${Math.round(displayProgress * 100)}%` }} />
        <div className={classes.label} style={{ opacity: labelOpacity }}>{label}</div>
        <div
          className={classes.thumb}
          style={{ transform: `translate(${offset}px, -50%)` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          {icon}
        </div>
      </div>
    </div>
  );
};

export default ActionSlider;
