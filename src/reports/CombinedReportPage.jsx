import { useMemo, useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import {
  Box,
  Chip,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import LocationSearchingIcon from '@mui/icons-material/LocationSearching';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import dayjs from 'dayjs';
import ReportFilter from './components/ReportFilter';
import { useTranslation } from '../common/components/LocalizationProvider';
import PageLayout from '../common/components/PageLayout';
import ReportsMenu from './components/ReportsMenu';
import { useCatch } from '../reactHelper';
import MapView from '../map/core/MapView';
import { map } from '../map/core/MapView';
import useReportStyles from './common/useReportStyles';
import MapCamera from '../map/MapCamera';
import MapGeofence from '../map/MapGeofence';
import { formatDistance, formatSpeed, formatTime } from '../common/util/formatter';
import { prefixString } from '../common/util/stringUtils';
import MapMarkers from '../map/MapMarkers';
import MapRouteCoordinates from '../map/MapRouteCoordinates';
import MapScale from '../map/MapScale';
import MapReplayMarkers from '../map/MapReplayMarkers';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { speedFromKnots } from '../common/util/converter';
import { useAttributePreference } from '../common/util/preferences';

const useStyles = makeStyles()((theme, { mapExpanded }) => ({
  mapPanel: {
    position: 'relative',
    [theme.breakpoints.down('md')]: {
      height: mapExpanded ? '60vh' : '35vh',
      flexBasis: 'auto',
    },
  },
  mapToggle: {
    position: 'absolute',
    top: theme.spacing(1),
    right: theme.spacing(1),
    zIndex: 2,
    backgroundColor: theme.palette.background.paper,
    boxShadow: theme.shadows[2],
  },
  summaryCard: {
    padding: theme.spacing(2),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: theme.spacing(1),
    [theme.breakpoints.down('md')]: {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
  },
  periodLabel: {
    marginTop: theme.spacing(0.5),
    color: theme.palette.text.secondary,
  },
  eventsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    padding: theme.spacing(2),
    [theme.breakpoints.down('md')]: {
      padding: theme.spacing(1.5),
    },
  },
  eventCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.25, 1.5),
    borderRadius: theme.spacing(1),
    backgroundColor: theme.palette.background.paper,
  },
  eventInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.25),
    minWidth: 0,
    flex: 1,
  },
  eventMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    color: theme.palette.text.secondary,
    fontSize: '0.75rem',
  },
  eventTime: {
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  eventType: {
    fontWeight: 500,
  },
  eventSub: {
    color: theme.palette.text.secondary,
    fontSize: '0.75rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  emptyState: {
    padding: theme.spacing(2),
    color: theme.palette.text.secondary,
  },
}));

const STOP_MINUTES = 5;
const STOP_SPEED_KMH = 1;
const KNOTS_PER_MPS = 1 / 0.514444;

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) {
    return '--';
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
};

const formatClock = (value) => {
  if (!value) {
    return '--:--';
  }
  return dayjs(value).format('HH:mm');
};

const haversineMeters = (a, b) => {
  if (!a || !b) {
    return 0;
  }
  const toRad = (value) => (value * Math.PI) / 180;
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = lat2 - lat1;
  const dLon = toRad(b.longitude - a.longitude);
  const radius = 6371000;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
};

const computeSummary = (items) => {
  let distanceMeters = 0;
  let movingTimeSec = 0;
  let stoppedTimeSec = 0;
  let maxSpeedKnots = null;
  let stopsCount = 0;
  let tripsCount = 0;
  const stops = [];
  const stopThresholdSec = STOP_MINUTES * 60;

  items.forEach((item) => {
    const positions = (item.positions || [])
      .filter((p) => p && p.fixTime)
      .sort((a, b) => new Date(a.fixTime) - new Date(b.fixTime));
    if (positions.length < 2) {
      return;
    }

    let stopStart = null;
    let stopStartPosition = null;

    for (let i = 1; i < positions.length; i += 1) {
      const prev = positions[i - 1];
      const curr = positions[i];
      const prevTime = new Date(prev.fixTime).getTime();
      const currTime = new Date(curr.fixTime).getTime();
      const delta = (currTime - prevTime) / 1000;
      if (!Number.isFinite(delta) || delta <= 0) {
        continue;
      }
      const prevSpeedKmh = speedFromKnots(prev.speed || 0, 'kmh');
      const isStopped = prevSpeedKmh <= STOP_SPEED_KMH;

      if (isStopped) {
        stoppedTimeSec += delta;
        if (!stopStart) {
          stopStart = prev.fixTime;
          stopStartPosition = prev;
        }
      } else {
        movingTimeSec += delta;
        distanceMeters += haversineMeters(prev, curr);
        if (stopStart && stopStartPosition) {
          const stopEnd = prev.fixTime;
          const durationSec = (new Date(stopEnd).getTime() - new Date(stopStart).getTime()) / 1000;
          if (durationSec >= stopThresholdSec) {
            stopsCount += 1;
            tripsCount += 1;
            stops.push({
              id: `${item.deviceId}-${stopStart}-${stopEnd}`,
              deviceId: item.deviceId,
              start: stopStart,
              end: stopEnd,
              durationSec,
              latitude: stopStartPosition.latitude,
              longitude: stopStartPosition.longitude,
              address: stopStartPosition.address,
            });
          }
          stopStart = null;
          stopStartPosition = null;
        }
      }

      if (Number.isFinite(curr.speed) && (maxSpeedKnots == null || curr.speed > maxSpeedKnots)) {
        maxSpeedKnots = curr.speed;
      }
    }

    if (stopStart) {
      const lastFix = positions[positions.length - 1].fixTime;
      const durationSec = (new Date(lastFix).getTime() - new Date(stopStart).getTime()) / 1000;
      if (durationSec >= stopThresholdSec) {
        stopsCount += 1;
        stops.push({
          id: `${item.deviceId}-${stopStart}-${lastFix}`,
          deviceId: item.deviceId,
          start: stopStart,
          end: lastFix,
          durationSec,
          latitude: stopStartPosition.latitude,
          longitude: stopStartPosition.longitude,
          address: stopStartPosition.address,
        });
      }
    }
  });

  const averageSpeedKnots = movingTimeSec > 0
    ? (distanceMeters / movingTimeSec) * KNOTS_PER_MPS
    : null;

  return {
    distanceMeters,
    movingTimeSec,
    stoppedTimeSec,
    maxSpeedKnots,
    stopsCount,
    tripsCount,
    averageSpeedKnots,
    stops,
  };
};

const CombinedReportPage = () => {
  const { classes } = useReportStyles();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mapExpanded, setMapExpanded] = useState(false);
  const { classes: localClasses } = useStyles({ mapExpanded });
  const t = useTranslation();

  const devices = useSelector((state) => state.devices.items);
  const geofences = useSelector((state) => state.geofences.items);

  const speedUnit = useAttributePreference('speedUnit');
  const distanceUnit = useAttributePreference('distanceUnit');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEventPosition, setSelectedEventPosition] = useState(null);
  const [range, setRange] = useState({ from: null, to: null });

  const itemsCoordinates = useMemo(() => items.flatMap((item) => item.route || []), [items]);

  const eventItems = useMemo(() => items.flatMap((item) => {
    const positionsById = new Map((item.positions || []).map((position) => [position.id, position]));
    return (item.events || []).map((event) => {
      const position = positionsById.get(event.positionId);
      return {
        event,
        position,
        deviceId: item.deviceId,
        deviceName: devices[item.deviceId]?.name,
      };
    });
  }), [items, devices]);

  const summary = useMemo(() => {
    if (!items.length) {
      return null;
    }
    return computeSummary(items);
  }, [items]);

  const stopMarkers = useMemo(() => (summary?.stops || []).map((stop) => ({
    id: stop.id,
    latitude: stop.latitude,
    longitude: stop.longitude,
    type: 'stop',
    label: 'P',
    color: '#ff9800',
    textColor: '#ffffff',
    badgeColor: '#ff9800',
    title: t('replayStop'),
    subtitle: `${formatClock(stop.start)}-${formatClock(stop.end)} | ${formatDuration(stop.durationSec)}`,
    details: stop.address || `${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}`,
  })), [summary, t]);

  const markers = useMemo(() => eventItems
    .map((item) => item.position)
    .filter((position) => position != null)
    .map((position) => ({
      latitude: position.latitude,
      longitude: position.longitude,
    })), [eventItems]);

  const deviceCount = useMemo(() => new Set(items.map((item) => item.deviceId)).size, [items]);
  const showDevice = deviceCount > 1;

  useEffect(() => {
    if (items.length && isMobile) {
      setTimeout(() => {
        if (map && map.resize) {
          map.resize();
        }
      }, 100);
    }
  }, [mapExpanded, items.length, isMobile]);

  const onShow = useCatch(async ({ deviceIds, groupIds, from, to }) => {
    const query = new URLSearchParams({ from, to });
    deviceIds.forEach((deviceId) => query.append('deviceId', deviceId));
    groupIds.forEach((groupId) => query.append('groupId', groupId));
    setLoading(true);
    setSelectedEventPosition(null);
    setRange({ from, to });
    try {
      const response = await fetchOrThrow(`/api/reports/combined?${query.toString()}`);
      setItems(await response.json());
    } finally {
      setLoading(false);
    }
  });

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'reportCombined']}>
      <div className={classes.container}>
        {Boolean(items.length) && (
          <div className={`${classes.containerMap} ${localClasses.mapPanel}`}>
            <MapView>
              <MapGeofence />
              {items.map((item) => (
                <MapRouteCoordinates
                  key={item.deviceId}
                  name={devices[item.deviceId].name}
                  coordinates={item.route}
                  deviceId={item.deviceId}
                />
              ))}
              <MapMarkers markers={markers} />
              <MapReplayMarkers markers={stopMarkers} selectedStopId={null} />
            </MapView>
            <MapScale />
            {selectedEventPosition ? (
              <MapCamera latitude={selectedEventPosition.latitude} longitude={selectedEventPosition.longitude} />
            ) : (
              <MapCamera coordinates={itemsCoordinates} />
            )}
            {isMobile && (
              <IconButton
                className={localClasses.mapToggle}
                size="small"
                aria-label={mapExpanded ? 'Recolher mapa' : 'Expandir mapa'}
                onClick={() => setMapExpanded((expanded) => !expanded)}
              >
                {mapExpanded ? <CloseFullscreenIcon fontSize="small" /> : <OpenInFullIcon fontSize="small" />}
              </IconButton>
            )}
          </div>
        )}
        <div className={classes.containerMain}>
          <div className={classes.header}>
            <ReportFilter onShow={onShow} deviceType="multiple" loading={loading} />
          </div>
          {summary && (
            <div className={localClasses.summaryCard}>
              <Typography variant="subtitle2">{t('replaySummary')}</Typography>
              {range.from && range.to && (() => {
                const fromDate = formatTime(range.from, 'date');
                const toDate = formatTime(range.to, 'date');
                const dateLabel = fromDate === toDate ? fromDate : `${fromDate} - ${toDate}`;
                return (
                  <Typography variant="caption" className={localClasses.periodLabel}>
                    {`${dateLabel} | ${formatClock(range.from)}-${formatClock(range.to)}`}
                  </Typography>
                );
              })()}
              <Box className={localClasses.summaryGrid} sx={{ mt: 1 }}>
                <Chip label={`${t('replayDistance')}: ${formatDistance(summary.distanceMeters, distanceUnit, t)}`} size="small" />
                <Chip label={`${t('replayMovingTime')}: ${formatDuration(summary.movingTimeSec)}`} size="small" />
                <Chip label={`${t('replayStoppedTime')}: ${formatDuration(summary.stoppedTimeSec)}`} size="small" />
                <Chip label={`${t('replayMaxSpeed')}: ${Number.isFinite(summary.maxSpeedKnots) ? formatSpeed(summary.maxSpeedKnots, speedUnit, t) : '--'}`} size="small" />
                <Chip label={`${t('replayStops')}: ${summary.stopsCount ?? '--'}`} size="small" />
                <Chip label={`${t('replayTrips')}: ${summary.tripsCount ?? '--'}`} size="small" />
                {Number.isFinite(summary.averageSpeedKnots) && (
                  <Chip label={`${t('reportAverageSpeed')}: ${formatSpeed(summary.averageSpeedKnots, speedUnit, t)}`} size="small" />
                )}
              </Box>
            </div>
          )}
          <div className={localClasses.eventsList}>
            {loading && (
              <Typography variant="body2" className={localClasses.emptyState}>
                {t('sharedLoading')}
              </Typography>
            )}
            {!loading && eventItems.length === 0 && (
              <Typography variant="body2" className={localClasses.emptyState}>
                {t('sharedNoData')}
              </Typography>
            )}
            {!loading && eventItems.map(({ event, position, deviceName }) => {
              const geofenceId = event.geofenceId || event.attributes?.geofenceId;
              const geofenceName = geofenceId ? geofences[geofenceId]?.name : null;
              return (
                <div key={event.id} className={localClasses.eventCard}>
                  <div className={localClasses.eventInfo}>
                    <div className={localClasses.eventMeta}>
                      <span className={localClasses.eventTime}>{formatClock(event.eventTime)}</span>
                      {showDevice && (
                        <span>{deviceName}</span>
                      )}
                    </div>
                    <Typography variant="body2" className={localClasses.eventType}>
                      {t(prefixString('event', event.type))}
                    </Typography>
                    {geofenceName && (
                      <div className={localClasses.eventSub}>
                        {geofenceName}
                      </div>
                    )}
                  </div>
                  {position && (
                    <IconButton
                      size="small"
                      onClick={() => setSelectedEventPosition(position)}
                      aria-label={t('replayViewOnMap')}
                    >
                      <LocationSearchingIcon fontSize="small" />
                    </IconButton>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default CombinedReportPage;
