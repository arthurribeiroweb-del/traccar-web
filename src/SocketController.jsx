import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { useDispatch, useSelector, connect } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Button, Snackbar } from '@mui/material';
import { devicesActions, sessionActions } from './store';
import { useCatchCallback, useEffectAsync } from './reactHelper';
import { snackBarDurationLongMs } from './common/util/duration';
import alarm from './resources/alarm.mp3';
import { eventsActions } from './store/events';
import useFeatures from './common/util/useFeatures';
import { useAttributePreference } from './common/util/preferences';
import { handleNativeNotificationListeners, nativePostMessage } from './common/components/NativeInterface';
import fetchOrThrow from './common/util/fetchOrThrow';
import { REALTIME_RECONNECT_EVENT } from './common/util/realtimeApi';

const logoutCode = 4000;
const BACKOFF_MS = [1000, 2000, 5000, 10000, 20000, 30000];
const FALLBACK_POLL_INTERVAL_MS = 5000;

const pollOnceWithAuth = async (dispatch, navigate) => {
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
    if (devicesRes.status === 401 || positionsRes.status === 401) {
      navigate('/login');
    }
  } catch {
    // ignore
  }
};

const SocketController = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const authenticated = useSelector((state) => Boolean(state.session.user));
  const devicesMap = useSelector((state) => state.devices.items || {});
  const userId = useSelector((state) => state.session.user?.id);
  const includeLogs = useSelector((state) => state.session.includeLogs);

  const socketRef = useRef();
  const reconnectTimeoutRef = useRef();
  const fallbackPollRef = useRef();
  const backoffIndexRef = useRef(0);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const stopFallbackPoll = useCallback(() => {
    if (fallbackPollRef.current) {
      clearInterval(fallbackPollRef.current);
      fallbackPollRef.current = null;
    }
  }, []);

  const startFallbackPoll = useCallback(() => {
    stopFallbackPoll();
    fallbackPollRef.current = setInterval(() => {
      pollOnceWithAuth(dispatch, navigate);
    }, FALLBACK_POLL_INTERVAL_MS);
  }, [dispatch, navigate, stopFallbackPoll]);

  const [notifications, setNotifications] = useState([]);

  const soundEvents = useAttributePreference('soundEvents', '');
  const soundAlarms = useAttributePreference('soundAlarms', 'sos');

  const features = useFeatures();

  const handleEvents = useCallback((events) => {
    if (!features.disableEvents) {
      dispatch(eventsActions.add({ events, userId }));
    }
    if (events.some((e) => soundEvents.includes(e.type)
        || (e.type === 'alarm' && soundAlarms.includes(e.attributes?.alarm)))) {
      new Audio(alarm).play();
    }

    const genericNotifications = events
      .filter((event) => event.attributes?.message)
      .map((event) => ({
        id: event.id ?? `evt-${Date.now()}`,
        message: event.attributes.message,
        show: true,
      }));

    const oilEvents = events.filter((e) => e.type === 'oilChangeSoon' || e.type === 'oilChangeDue');
    const built = oilEvents.map((event) => {
      const notificationId = `oil-${event.id ?? `${event.deviceId}-${Date.now()}`}`;
      const device = devicesMap[event.deviceId] || {};
      const name = device.name || device.uniqueId || `Veículo ${event.deviceId}`;
      const kmRemaining = event.attributes?.oilKmRemaining;
      const daysRemaining = event.attributes?.oilDaysRemaining;
      const dueKm = event.attributes?.oilDueKm;
      const dueDate = event.attributes?.oilDueDate;

      let message = '';
      if (event.type === 'oilChangeDue') {
        message = `${name}: troca de óleo necessária`;
      } else {
        const parts = [];
        if (kmRemaining != null) parts.push(`faltam ${kmRemaining} km`);
        if (daysRemaining != null) parts.push(`faltam ${daysRemaining} dias`);
        const suffix = parts.length ? parts.join(' · ') : 'troca de óleo em breve';
        message = `${name}: ${suffix}`;
      }
      if (dueKm != null) {
        message += ` • alvo ${dueKm} km`;
      } else if (dueDate) {
        message += ` • alvo ${dueDate}`;
      }

      return {
        id: notificationId,
        message,
        show: true,
        action: () => {
          navigate(`/settings/maintenance-center?deviceId=${event.deviceId}`);
          setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
        },
      };
    });

    if (genericNotifications.length || built.length) {
      if (built.length) {
        console.debug('[OilChange] snackbar events', built);
      }
      setNotifications((prev) => [...built, ...genericNotifications, ...prev]);
    }
  }, [features, dispatch, soundEvents, soundAlarms, userId, devicesMap, navigate]);

  const scheduleReconnect = useCallback(() => {
    clearReconnectTimeout();
    const delay = BACKOFF_MS[Math.min(backoffIndexRef.current, BACKOFF_MS.length - 1)];
    backoffIndexRef.current += 1;
    dispatch(sessionActions.updateSocketStatus('reconnecting'));
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      connectSocket();
    }, delay);
  }, [clearReconnectTimeout, dispatch]);

  const connectSocket = useCallback(() => {
    clearReconnectTimeout();
    stopFallbackPoll();
    if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
      socketRef.current.close();
    }
    dispatch(sessionActions.updateSocketStatus('connecting'));
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/socket`);
    socketRef.current = socket;

    socket.onopen = () => {
      backoffIndexRef.current = 0;
      dispatch(sessionActions.updateSocket(true));
      dispatch(sessionActions.updateSocketStatus('live'));
      pollOnceWithAuth(dispatch, navigate);
    };

    socket.onclose = async (event) => {
      dispatch(sessionActions.updateSocket(false));
      if (event.code !== logoutCode) {
        dispatch(sessionActions.updateSocketStatus('offline'));
        await pollOnceWithAuth(dispatch, navigate);
        startFallbackPoll();
        scheduleReconnect();
      }
    };

    socket.onerror = () => {
      dispatch(sessionActions.updateSocketStatus('error'));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.devices) {
        dispatch(devicesActions.update(data.devices));
      }
      if (data.positions) {
        dispatch(sessionActions.updatePositions(data.positions));
        dispatch(sessionActions.updateSocketStatus('live'));
      }
      if (data.events) {
        handleEvents(data.events);
      }
      if (data.logs) {
        dispatch(sessionActions.updateLogs(data.logs));
      }
    };
  }, [
    clearReconnectTimeout,
    stopFallbackPoll,
    startFallbackPoll,
    scheduleReconnect,
    dispatch,
    navigate,
    handleEvents,
  ]);

  useEffect(() => {
    socketRef.current?.send(JSON.stringify({ logs: includeLogs }));
  }, [includeLogs]);

  useEffectAsync(async () => {
    if (authenticated) {
      const response = await fetchOrThrow('/api/devices');
      dispatch(devicesActions.refresh(await response.json()));
      nativePostMessage('authenticated');
      connectSocket();
      return () => {
        clearReconnectTimeout();
        stopFallbackPoll();
        socketRef.current?.close(logoutCode);
      };
    }
    return null;
  }, [authenticated]);

  const handleNativeNotification = useCatchCallback(async (message) => {
    const eventId = message.data?.eventId;
    if (eventId) {
      const response = await fetch(`/api/events/${eventId}`);
      if (response.ok) {
        const event = await response.json();
        const eventWithMessage = {
          ...event,
          attributes: { ...event.attributes, message: message.notification?.body },
        };
        handleEvents([eventWithMessage]);
      }
    }
  }, [handleEvents]);

  useEffect(() => {
    handleNativeNotificationListeners.add(handleNativeNotification);
    return () => handleNativeNotificationListeners.delete(handleNativeNotification);
  }, [handleNativeNotification]);

  useEffect(() => {
    if (!authenticated) return;
    const reconnectIfNeeded = () => {
      const socket = socketRef.current;
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        backoffIndexRef.current = 0;
        connectSocket();
      } else if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send('{}');
        } catch {
          // test connection
        }
      }
    };
    const onVisibility = () => {
      if (!document.hidden) {
        reconnectIfNeeded();
      }
    };
    const onReconnectRequest = () => {
      backoffIndexRef.current = 0;
      connectSocket();
    };
    window.addEventListener('online', reconnectIfNeeded);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(REALTIME_RECONNECT_EVENT, onReconnectRequest);
    return () => {
      window.removeEventListener('online', reconnectIfNeeded);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(REALTIME_RECONNECT_EVENT, onReconnectRequest);
    };
  }, [authenticated, connectSocket]);

  return (
    <>
      {notifications.map((notification) => (
        <Snackbar
          key={notification.id}
          open={notification.show}
          message={notification.message}
          autoHideDuration={snackBarDurationLongMs}
          action={notification.action ? (
            <Button color="secondary" size="small" onClick={notification.action}>
              Ver
            </Button>
          ) : null}
          onClose={() => setNotifications(notifications.filter((e) => e.id !== notification.id))}
        />
      ))}
    </>
  );
};

export default connect()(SocketController);
