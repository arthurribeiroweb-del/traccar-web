import { devicesActions, sessionActions } from '../../store';

export const REALTIME_RECONNECT_EVENT = 'traccar-reconnect';

export const pollPositionsOnce = async (dispatch) => {
  try {
    const [devicesRes, positionsRes] = await Promise.all([
      fetch('/api/devices'),
      fetch('/api/positions'),
    ]);
    if (devicesRes.ok) {
      dispatch(devicesActions.update(await devicesRes.json()));
    }
    if (positionsRes.ok) {
      dispatch(sessionActions.updatePositions(await positionsRes.json()));
    }
  } catch {
    // ignore
  }
};

export const requestReconnect = () => {
  window.dispatchEvent(new CustomEvent(REALTIME_RECONNECT_EVENT));
};
