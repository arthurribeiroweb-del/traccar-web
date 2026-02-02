import { Snackbar, IconButton } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from './common/components/LocalizationProvider';
import { nativeEnvironment } from './common/components/NativeInterface';

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((resolve) => setTimeout(resolve, ms)),
]);

const buildCacheBustUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.set('v', Date.now().toString());
  return url.toString();
};

const clearServiceWorkerState = async () => {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await withTimeout(Promise.all(registrations.map((registration) => registration.unregister())), 2000);
    }
  } catch {
    // ignore
  }
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await withTimeout(Promise.all(keys.map((key) => caches.delete(key))), 2000);
    }
  } catch {
    // ignore
  }
};

const forceReload = () => {
  clearServiceWorkerState().finally(() => {
    const url = buildCacheBustUrl();
    try {
      window.location.replace(url);
    } catch {
      window.location.href = url;
    }
  });
};

const UpdateController = () => {
  const t = useTranslation();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const updateInterval = useSelector((state) => state.session.server.attributes.serviceWorkerUpdateInterval || 3600000);
  const appVersion = import.meta.env.VITE_APP_VERSION || 'unknown';
  const cleanedRef = useRef(false);

  useEffect(() => {
    if (nativeEnvironment || cleanedRef.current) {
      return;
    }
    cleanedRef.current = true;
    clearServiceWorkerState();
  }, []);

  useEffect(() => {
    if (nativeEnvironment || updateInterval <= 0 || appVersion === 'unknown') {
      return undefined;
    }

    let cancelled = false;

    const checkVersion = async () => {
      try {
        const response = await fetch(`/version.json?ts=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            cache: 'no-store',
            'cache-control': 'no-cache',
          },
        });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (!cancelled && data?.version && data.version !== appVersion) {
          setUpdateAvailable(true);
        }
      } catch {
        // ignore
      }
    };

    const timer = setInterval(checkVersion, updateInterval);
    checkVersion();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [appVersion, updateInterval]);

  if (nativeEnvironment) {
    return null;
  }

  const handleReload = () => {
    if (updating) {
      return;
    }
    setUpdating(true);
    setTimeout(() => setUpdating(false), 4000);
    forceReload();
  };

  return (
    <Snackbar
      open={updateAvailable}
      message={updating ? t('settingsUpdating') : t('settingsUpdateAvailable')}
      action={(
        <IconButton color="inherit" onClick={handleReload} disabled={updating}>
          <RefreshIcon />
        </IconButton>
      )}
      onClick={handleReload}
      ContentProps={{ onClick: handleReload, style: { cursor: updating ? 'default' : 'pointer' } }}
    />
  );
};

export default UpdateController;
