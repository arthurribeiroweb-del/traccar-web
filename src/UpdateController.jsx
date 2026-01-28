import { Snackbar, IconButton } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from './common/components/LocalizationProvider';
import { nativeEnvironment } from './common/components/NativeInterface';

// Based on https://vite-pwa-org.netlify.app/frameworks/react.html
const WebUpdateController = ({ swUpdateInterval }) => {
  const t = useTranslation();

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

  return (
    <Snackbar
      open={needRefresh}
      message={t('settingsUpdateAvailable')}
      action={(
        <IconButton color="inherit" onClick={() => updateServiceWorker(true)}>
          <RefreshIcon />
        </IconButton>
      )}
    />
  );
};

const UpdateController = () => {
  const swUpdateInterval = useSelector((state) => state.session.server.attributes.serviceWorkerUpdateInterval || 3600000);

  useEffect(() => {
    if (!nativeEnvironment || !('serviceWorker' in navigator)) {
      return undefined;
    }

    const disabledFlag = 'traccar.sw.disabled';
    if (window.sessionStorage.getItem(disabledFlag)) {
      return undefined;
    }

    const disableServiceWorker = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } finally {
        window.sessionStorage.setItem(disabledFlag, '1');
        window.location.reload();
      }
    };

    disableServiceWorker();
    return undefined;
  }, []);

  if (nativeEnvironment) {
    return null;
  }

  return <WebUpdateController swUpdateInterval={swUpdateInterval} />;
};

export default UpdateController;
