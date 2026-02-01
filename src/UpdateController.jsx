import { Snackbar, IconButton } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useRegisterSW } from 'virtual:pwa-register/react';
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

const clearCaches = async () => {
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

const navigateWithCacheBust = () => {
  const url = buildCacheBustUrl();
  try {
    window.location.replace(url);
  } catch {
    window.location.href = url;
  }
};

const forceReload = (eager) => {
  if (eager) {
    clearCaches();
    navigateWithCacheBust();
    return;
  }
  clearCaches().finally(() => {
    navigateWithCacheBust();
  });
};

// Based on https://vite-pwa-org.netlify.app/frameworks/react.html
const WebUpdateController = ({ swUpdateInterval }) => {
  const t = useTranslation();
  const [updating, setUpdating] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, swRegistration) {
      if (swUpdateInterval > 0 && swRegistration) {
        setInterval(async () => {
          if (!(!swRegistration.installing && navigator)) {
            return;
          }

          if (('connection' in navigator) && !navigator.onLine) {
            return;
          }

          const newSW = await fetch(swUrl, {
            cache: 'no-store',
            headers: {
              cache: 'no-store',
              'cache-control': 'no-cache',
            },
          });

          if (newSW?.status === 200) {
            await swRegistration.update();
          }
        }, swUpdateInterval);
      }
    },
  });

  useEffect(() => {
    if (needRefresh) {
      const timer = setTimeout(() => updateServiceWorker(true), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [needRefresh, updateServiceWorker]);

  const handleReload = async () => {
    if (updating) {
      return;
    }
    setUpdating(true);
    setTimeout(() => setUpdating(false), 4000);
    try {
      await updateServiceWorker(true);
    } catch {
      // ignore
    }
    forceReload(false);
  };

  return (
    <Snackbar
      open={needRefresh}
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

const NativeUpdateController = () => {
  const t = useTranslation();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const appVersion = import.meta.env.VITE_APP_VERSION
    || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null);

  useEffect(() => {
    if (!nativeEnvironment || !appVersion) {
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
        // ignore fetch errors
      }
    };
    checkVersion();
    const interval = setInterval(checkVersion, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [appVersion]);

  const handleReload = () => {
    if (updating) {
      return;
    }
    setUpdating(true);
    setTimeout(() => setUpdating(false), 4000);
    forceReload(true);
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

const UpdateController = () => {
  const swUpdateInterval = useSelector((state) => state.session.server.attributes.serviceWorkerUpdateInterval || 3600000);
  if (nativeEnvironment) {
    return null;
  }
  return <WebUpdateController swUpdateInterval={swUpdateInterval} />;
};

export default UpdateController;
