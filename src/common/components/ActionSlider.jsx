import { useEffect, useMemo, useRef, useState } from 'react';
import { makeStyles } from 'tss-react/mui';

const thumbSize = 32;
const confirmThreshold = 0.98;

const useStyles = makeStyles()((theme, { disabled, status, tone }) => {
  const neutral = theme.palette.action.disabledBackground;
  const warning = theme.palette.warning.light;
  const success = theme.palette.success.light;
  const error = theme.palette.error.light;
  const trackColor = status === 'error'
    ? error
    : tone === 'success'
      ? success
      : tone === 'warning'
        ? warning
        : neutral;

  const textColor = disabled
    ? theme.palette.text.disabled
    : theme.palette.text.primary;

  return {
    root: {
      width: '100%',
      minWidth: 180,
      maxWidth: 260,
      userSelect: 'none',
    },
    track: {
      position: 'relative',
      height: 40,
      borderRadius: 999,
      background: trackColor,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: theme.spacing(1.5),
      paddingRight: theme.spacing(1.5),
      touchAction: 'pan-y',
      transition: 'background 200ms ease',
      border: `1px solid ${theme.palette.divider}`,
      opacity: disabled ? 0.7 : 1,
    },
    label: {
      position: 'relative',
      zIndex: 1,
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: '0.2px',
      color: textColor,
      textTransform: 'uppercase',
      textAlign: 'center',
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

  const maxOffset = useMemo(() => Math.max(trackWidth - thumbSize - 8, 0), [trackWidth]);
  const offset = Math.round(progress * maxOffset);

  const updateProgress = (nextOffset) => {
    if (!maxOffset) {
      setProgress(0);
      return;
    }
    setProgress(clamp(nextOffset, 0, maxOffset) / maxOffset);
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
        <div className={classes.label}>{label}</div>
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
