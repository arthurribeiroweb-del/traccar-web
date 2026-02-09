import { useEffect, useMemo } from 'react';
import { useTheme } from '@mui/material';
import { map } from '../core/MapView';
import './follow.css';

const statusClass = (status) => `maplibregl-ctrl-icon maplibre-ctrl-follow maplibre-ctrl-follow-${status}`;

class FollowControl {
  constructor(onClick, getTitle) {
    this.onClick = onClick;
    this.getTitle = getTitle;
  }

  onAdd() {
    this.button = document.createElement('button');
    this.button.className = statusClass('off');
    this.button.type = 'button';
    this.button.onclick = () => this.onClick(this);
    const title = this.getTitle(false);
    this.button.title = title;
    this.button.setAttribute('aria-label', title);
    this.button.setAttribute('aria-pressed', 'false');

    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl-group maplibregl-ctrl';
    this.container.appendChild(this.button);

    return this.container;
  }

  onRemove() {
    this.container.parentNode.removeChild(this.container);
  }

  setEnabled(enabled) {
    this.button.className = statusClass(enabled ? 'on' : 'off');
    const title = this.getTitle(enabled);
    this.button.title = title;
    this.button.setAttribute('aria-label', title);
    this.button.setAttribute('aria-pressed', String(Boolean(enabled)));
  }

  setVisible(visible) {
    if (this.container) {
      this.container.style.display = visible ? '' : 'none';
    }
  }
}

const MapFollow = ({
  enabled,
  visible,
  onToggle,
  titleOn,
  titleOff,
}) => {
  const theme = useTheme();
  const control = useMemo(() => new FollowControl(onToggle, (value) => (value ? titleOn : titleOff)), [onToggle, titleOn, titleOff]);

  useEffect(() => {
    map.addControl(control, theme.direction === 'rtl' ? 'top-left' : 'top-right');
    return () => map.removeControl(control);
  }, [control, theme.direction]);

  useEffect(() => {
    control.setEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    control.setVisible(visible);
  }, [visible]);

  return null;
};

export default MapFollow;
