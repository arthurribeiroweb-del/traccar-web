import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Button,
  Alert,
  Box,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { map } from '../map/core/MapView';
import { useTranslation } from '../common/components/LocalizationProvider';

const DEFAULT_TRAFFIC_ZOOM = 14;
const LAST_USER_LOCATION_KEY = 'trafficLastUserLocation';

const isValidCoordinate = (latitude, longitude) => Number.isFinite(latitude)
  && Number.isFinite(longitude)
  && latitude >= -90
  && latitude <= 90
  && longitude >= -180
  && longitude <= 180;

const parseCoordinates = (latitude, longitude) => {
  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);
  if (!isValidCoordinate(parsedLatitude, parsedLongitude)) {
    return null;
  }
  return { latitude: parsedLatitude, longitude: parsedLongitude };
};

const getMapCenterCoordinates = () => {
  if (!map || !map.loaded()) {
    return null;
  }
  const center = map.getCenter();
  return parseCoordinates(center?.lat, center?.lng);
};

const readLastUserLocation = () => {
  try {
    const stored = window.localStorage.getItem(LAST_USER_LOCATION_KEY);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored);
    return parseCoordinates(parsed.latitude, parsed.longitude);
  } catch {
    return null;
  }
};

const writeLastUserLocation = (coordinates) => {
  window.localStorage.setItem(LAST_USER_LOCATION_KEY, JSON.stringify(coordinates));
};

const resolveTrafficCoordinates = ({
  selectedPosition,
  mapCenter,
  userLocation,
  fallbackCoordinates,
}) => parseCoordinates(selectedPosition?.latitude, selectedPosition?.longitude)
  || mapCenter
  || userLocation
  || fallbackCoordinates
  || { latitude: 0, longitude: 0 };

const buildTrafficUrl = ({ latitude, longitude, zoom = DEFAULT_TRAFFIC_ZOOM }) => (
  `https://embed.waze.com/iframe?zoom=${zoom}&lat=${latitude}&lon=${longitude}`
);

const TrafficView = ({
  open,
  onClose,
  selectedPosition,
  fallbackCoordinates,
}) => {
  const t = useTranslation();
  const [mapCenter, setMapCenter] = useState(null);
  const [lastUserLocation, setLastUserLocation] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setMapCenter(getMapCenterCoordinates());
    setLastUserLocation(readLastUserLocation());
  }, [open]);

  useEffect(() => {
    if (!open || !navigator.geolocation) {
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates = parseCoordinates(position.coords.latitude, position.coords.longitude);
        if (coordinates) {
          setLastUserLocation(coordinates);
          writeLastUserLocation(coordinates);
        }
      },
      () => {},
      { maximumAge: 60000, timeout: 5000, enableHighAccuracy: false },
    );
  }, [open]);

  const fallback = useMemo(
    () => parseCoordinates(fallbackCoordinates?.latitude, fallbackCoordinates?.longitude),
    [fallbackCoordinates?.latitude, fallbackCoordinates?.longitude],
  );

  const coordinates = useMemo(() => resolveTrafficCoordinates({
    selectedPosition,
    mapCenter,
    userLocation: lastUserLocation,
    fallbackCoordinates: fallback,
  }), [selectedPosition, mapCenter, lastUserLocation, fallback]);

  const trafficUrl = useMemo(
    () => buildTrafficUrl({ ...coordinates, zoom: DEFAULT_TRAFFIC_ZOOM }),
    [coordinates],
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    loadedRef.current = false;
    setLoadError(false);
    const timeoutId = window.setTimeout(() => {
      if (!loadedRef.current) {
        setLoadError(true);
      }
    }, 12000);
    return () => window.clearTimeout(timeoutId);
  }, [open, reloadCount, trafficUrl]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      aria-labelledby="traffic-view-title"
    >
      <DialogTitle id="traffic-view-title" sx={{ pr: 6 }}>
        {t('trafficViewTitle')}
        <IconButton
          aria-label={t('sharedClose')}
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0, height: '70vh', minHeight: 420 }}>
        {loadError ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 2,
              height: '100%',
              p: 3,
              textAlign: 'center',
            }}
          >
            <Alert severity="warning" sx={{ width: '100%', maxWidth: 480 }}>
              {t('trafficLoadError')}
            </Alert>
            <Typography variant="body2">
              {t('trafficLiveWaze')}
            </Typography>
            <Button
              variant="contained"
              onClick={() => setReloadCount((value) => value + 1)}
            >
              {t('trafficTryAgain')}
            </Button>
          </Box>
        ) : (
          <iframe
            key={`${trafficUrl}:${reloadCount}`}
            title={t('trafficLiveWaze')}
            src={trafficUrl}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            sandbox="allow-scripts allow-same-origin"
            onLoad={() => {
              loadedRef.current = true;
            }}
            onError={() => {
              setLoadError(true);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TrafficView;
