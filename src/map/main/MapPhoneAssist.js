import { useEffect, useMemo } from 'react';
import { useTheme } from '@mui/material';
import { map } from '../core/MapView';
import './phoneAssist.css';

const statusClass = (status) => `maplibregl-ctrl-icon maplibre-ctrl-phone-assist maplibre-ctrl-phone-assist-${status}`;

class PhoneAssistControl {
  constructor(onClick) {
    this.onClick = onClick;
  }

  onAdd() {
    this.button = document.createElement('button');
    this.button.className = statusClass('off');
    this.button.type = 'button';
    this.button.onclick = () => this.onClick(this);
    this.button.title = 'Modo premium por celular';
    this.button.setAttribute('aria-label', 'Modo premium por celular');
    this.button.setAttribute('aria-pressed', 'false');

    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl-group maplibregl-ctrl';
    this.container.appendChild(this.button);

    return this.container;
  }

  onRemove() {
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  setState(state, title) {
    if (!this.button) {
      return;
    }
    this.button.className = statusClass(state);
    this.button.title = title;
    this.button.setAttribute('aria-label', title);
    this.button.setAttribute('aria-pressed', String(state === 'on'));
  }

  setVisible(visible) {
    if (this.container) {
      this.container.style.display = visible ? '' : 'none';
    }
  }
}

const resolveControlState = ({ enabled, active, available }) => {
  if (!available) {
    return 'unavailable';
  }
  if (!enabled) {
    return 'off';
  }
  if (active) {
    return 'on';
  }
  return 'pending';
};

const resolveTitle = (state, {
  titleOn,
  titleOff,
  titlePending,
  titleUnavailable,
}) => {
  switch (state) {
    case 'on':
      return titleOn;
    case 'pending':
      return titlePending;
    case 'unavailable':
      return titleUnavailable;
    default:
      return titleOff;
  }
};

const MapPhoneAssist = ({
  enabled,
  active,
  available,
  visible,
  onToggle,
  titleOn,
  titleOff,
  titlePending,
  titleUnavailable,
}) => {
  const theme = useTheme();
  const control = useMemo(() => new PhoneAssistControl(onToggle), [onToggle]);

  const state = resolveControlState({ enabled, active, available });
  const title = resolveTitle(state, {
    titleOn,
    titleOff,
    titlePending,
    titleUnavailable,
  });

  useEffect(() => {
    map.addControl(control, theme.direction === 'rtl' ? 'top-left' : 'top-right');
    return () => map.removeControl(control);
  }, [control, theme.direction]);

  useEffect(() => {
    control.setState(state, title);
  }, [control, state, title]);

  useEffect(() => {
    control.setVisible(visible);
  }, [control, visible]);

  return null;
};

export default MapPhoneAssist;
