import {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  Paper,
  Slider,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import TuneIcon from '@mui/icons-material/Tune';
import DownloadIcon from '@mui/icons-material/Download';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import FastForwardIcon from '@mui/icons-material/FastForward';
import FastRewindIcon from '@mui/icons-material/FastRewind';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import CropFreeIcon from '@mui/icons-material/CropFree';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import dayjs from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import maplibregl from 'maplibre-gl';
import MapView from '../map/core/MapView';
import { map } from '../map/core/MapView';
import MapRoutePath from '../map/MapRoutePath';
import MapRoutePoints from '../map/MapRoutePoints';
import MapPositions from '../map/MapPositions';
import { formatDistance, formatTime } from '../common/util/formatter';
import { getDeviceDisplayName } from '../common/util/deviceUtils';
import ReportFilter, { updateReportParams } from '../reports/components/ReportFilter';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useCatch } from '../reactHelper';
import MapGeofence from '../map/MapGeofence';
import StatusCard from '../common/components/StatusCard';
import MapScale from '../map/MapScale';
import BackIcon from '../common/components/BackIcon';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { speedFromKnots } from '../common/util/converter';
import { useAttributePreference } from '../common/util/preferences';
import usePersistedState from '../common/util/usePersistedState';
import MapReplayMarkers from '../map/MapReplayMarkers';

const useStyles = makeStyles()((theme) => {
  const toolbarMinHeight = typeof theme.mixins.toolbar.minHeight === 'number'
    ? theme.mixins.toolbar.minHeight
    : 56;

  return ({
  root: {
    height: '100%',
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    zIndex: 3,
    left: 0,
    top: 0,
    margin: theme.spacing(1.5),
    width: theme.dimensions.drawerWidthDesktop,
    [theme.breakpoints.down('md')]: {
      width: '100%',
      margin: 0,
    },
  },
  title: {
    flexGrow: 1,
  },
  slider: {
    width: '100%',
  },
  controls: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  formControlLabel: {
    height: '100%',
    width: '100%',
    paddingRight: theme.spacing(1),
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    padding: theme.spacing(2),
    gap: theme.spacing(1.5),
    [theme.breakpoints.down('md')]: {
      margin: theme.spacing(1),
      padding: theme.spacing(1.5),
      paddingBottom: `calc(${theme.spacing(1.5)} + env(safe-area-inset-bottom))`,
      gap: theme.spacing(1),
      maxHeight: `calc(35vh - ${toolbarMinHeight}px)`,
      minHeight: 0,
      overflow: 'hidden',
      '@supports (height: 100dvh)': {
        maxHeight: `calc(35dvh - ${toolbarMinHeight}px)`,
      },
    },
    [theme.breakpoints.up('md')]: {
      marginTop: theme.spacing(1),
    },
  },
  summaryArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    minHeight: 0,
    flex: 1,
    overflowY: 'auto',
  },
  summaryHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
  },
  summaryCompactLine: {
    fontSize: '0.8rem',
    color: theme.palette.text.secondary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  summaryToggle: {
    minWidth: 'auto',
    padding: theme.spacing(0.25, 0.5),
    textTransform: 'none',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: theme.spacing(1),
    [theme.breakpoints.down('md')]: {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: theme.spacing(0.75),
    },
  },
  chipsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  },
  stopList: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
  stopItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    padding: theme.spacing(1),
    borderRadius: theme.spacing(1),
    backgroundColor: theme.palette.background.default,
  },
  mapActions: {
    position: 'absolute',
    right: theme.spacing(1.5),
    top: theme.spacing(10),
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    zIndex: 2,
  },
  detailsToggle: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  controlsCompact: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    paddingBottom: 'env(safe-area-inset-bottom)',
    minHeight: theme.spacing(5),
  },
  controlsArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
  sliderCompact: {
    flex: 1,
    minWidth: 0,
  },
  speedButton: {
    minWidth: theme.spacing(5),
    padding: theme.spacing(0.25, 1),
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.75rem',
  },
  timeCompact: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    whiteSpace: 'nowrap',
  },
});
});

const STOP_MINUTES = 5;
const STOP_SPEED_KMH = 1;
const SPEED_OPTIONS = [1, 1.5, 2];
const DEFAULT_PLAYBACK_SPEED = 1;

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) {
    return '—';
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
    return '—';
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

const ReplayPage = () => {
  const t = useTranslation();
  const { classes } = useStyles();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const timerRef = useRef();

  const [searchParams, setSearchParams] = useSearchParams();

  const defaultDeviceId = useSelector((state) => state.devices.selectedId);

  const [positions, setPositions] = useState([]);
  const [index, setIndex] = useState(0);
  const [selectedDeviceId, setSelectedDeviceId] = useState(defaultDeviceId);
  const [showCard, setShowCard] = useState(false);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [followMode, setFollowMode] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(null);
  const [hasAppliedInitialZoom, setHasAppliedInitialZoom] = useState(false);
  const [showAllStops, setShowAllStops] = useState(false);
  const [selectedStopId, setSelectedStopId] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = usePersistedState('replayPlaybackSpeed', DEFAULT_PLAYBACK_SPEED);

  const loaded = Boolean(from && to && !loading && positions.length);
  const speedUnit = useAttributePreference('speedUnit');
  const distanceUnit = useAttributePreference('distanceUnit');

  const deviceName = useSelector((state) => {
    if (selectedDeviceId) {
      const device = state.devices.items[selectedDeviceId];
      if (device) {
        return getDeviceDisplayName(device) || device.name;
      }
    }
    return null;
  });

  useEffect(() => {
    if (!from && !to) {
      setPositions([]);
    }
  }, [from, to, setPositions]);

  useEffect(() => {
    if (!loaded) {
      setDetailsOpen(false);
    }
  }, [loaded]);

  useEffect(() => {
    if (playing && positions.length > 0) {
      const interval = 500 / playbackSpeed;
      timerRef.current = setInterval(() => {
        setIndex((index) => Math.min(index + 1, positions.length - 1));
      }, interval);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [playing, positions.length, playbackSpeed]);

  useEffect(() => {
    if (index >= positions.length - 1) {
      clearInterval(timerRef.current);
      setPlaying(false);
    }
  }, [index, positions]);

  useEffect(() => {
    if (!map) {
      return undefined;
    }
    const handleDragStart = () => setFollowMode(false);
    const handleZoomEnd = () => setCurrentZoom(map.getZoom());
    map.on('dragstart', handleDragStart);
    map.on('zoomend', handleZoomEnd);
    return () => {
      map.off('dragstart', handleDragStart);
      map.off('zoomend', handleZoomEnd);
    };
  }, []);

  const onPointClick = useCallback((_, index) => {
    setIndex(index);
  }, [setIndex]);

  const onMarkerClick = useCallback((positionId) => {
    setShowCard(!!positionId);
  }, [setShowCard]);

  const togglePlaybackSpeed = useCallback(() => {
    setPlaybackSpeed((current) => {
      const currentIndex = SPEED_OPTIONS.indexOf(current);
      if (currentIndex === -1) {
        return DEFAULT_PLAYBACK_SPEED;
      }
      return SPEED_OPTIONS[(currentIndex + 1) % SPEED_OPTIONS.length];
    });
  }, [setPlaybackSpeed]);

  const fitRoute = useCallback((positions) => {
    if (!positions.length) {
      return;
    }
    const coordinates = positions.map((item) => [item.longitude, item.latitude]);
    if (!coordinates.length) {
      return;
    }
    const bounds = coordinates.reduce(
      (bounds, item) => bounds.extend(item),
      new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
    );
    const canvas = map.getCanvas();
    map.fitBounds(bounds, {
      padding: Math.min(canvas.width, canvas.height) * 0.12,
      duration: 500,
    });
  }, []);

  const centerOnCurrent = useCallback((zoomOverride) => {
    if (!positions.length || index >= positions.length) {
      return;
    }
    const position = positions[index];
    const zoom = zoomOverride ?? currentZoom ?? Math.max(map.getZoom(), 15);
    map.easeTo({
      center: [position.longitude, position.latitude],
      zoom,
      duration: 450,
    });
  }, [positions, index, currentZoom]);

  useEffect(() => {
    if (!positions.length) {
      setHasAppliedInitialZoom(false);
      setFollowMode(false);
      return;
    }
    fitRoute(positions);
  }, [positions, fitRoute]);

  useEffect(() => {
    if (!playing || !followMode) {
      return;
    }
    centerOnCurrent();
  }, [index, playing, followMode, centerOnCurrent]);

  const onShow = useCatch(async ({ deviceIds, from, to }) => {
    const deviceId = deviceIds.find(() => true);
    setLoading(true);
    setSelectedDeviceId(deviceId);
    const query = new URLSearchParams({ deviceId, from, to });
    try {
      const response = await fetchOrThrow(`/api/positions?${query.toString()}`);
      setIndex(0);
      const positions = await response.json();
      setPositions(positions);
      if (!positions.length) {
        throw Error(t('sharedNoData'));
      }
    } finally {
      setLoading(false);
    }
  });

  const handleDownload = () => {
    const query = new URLSearchParams({ deviceId: selectedDeviceId, from, to });
    window.location.assign(`/api/positions/kml?${query.toString()}`);
  };

  const summary = useMemo(() => {
    if (positions.length < 2) {
      return null;
    }
    const stopThresholdSec = STOP_MINUTES * 60;
    let distanceMeters = 0;
    let movingTime = 0;
    let stoppedTime = 0;
    let maxSpeedKnots = 0;
    let maxSpeedTime = null;
    let stopStart = null;
    let stopStartPosition = null;
    let stops = [];
    let tripsCount = 0;

    for (let i = 1; i < positions.length; i += 1) {
      const prev = positions[i - 1];
      const curr = positions[i];
      const prevTime = new Date(prev.fixTime).getTime();
      const currTime = new Date(curr.fixTime).getTime();
      const delta = (currTime - prevTime) / 1000;
      if (!Number.isFinite(delta) || delta <= 0) {
        continue;
      }
      const prevSpeedKmh = speedFromKnots(prev.speed, 'kmh');
      const currSpeedKmh = speedFromKnots(curr.speed, 'kmh');
      const isStopped = prevSpeedKmh <= STOP_SPEED_KMH;

      if (isStopped) {
        stoppedTime += delta;
        if (!stopStart) {
          stopStart = prev.fixTime;
          stopStartPosition = prev;
        }
      } else {
        movingTime += delta;
        distanceMeters += haversineMeters(prev, curr);
        if (stopStart) {
          const stopEnd = prev.fixTime;
          const durationSec = (new Date(stopEnd).getTime() - new Date(stopStart).getTime()) / 1000;
          if (durationSec >= stopThresholdSec) {
            tripsCount += 1;
            stops = [
              ...stops,
              {
                id: `${stopStart}-${stopEnd}`,
                start: stopStart,
                end: stopEnd,
                durationSec,
                latitude: stopStartPosition.latitude,
                longitude: stopStartPosition.longitude,
                address: stopStartPosition.address,
              },
            ];
          }
          stopStart = null;
          stopStartPosition = null;
        }
      }

      if (curr.speed > maxSpeedKnots) {
        maxSpeedKnots = curr.speed;
        maxSpeedTime = curr.fixTime;
      }
    }

    if (stopStart && stopStartPosition) {
      const lastFix = positions[positions.length - 1].fixTime;
      const durationSec = (new Date(lastFix).getTime() - new Date(stopStart).getTime()) / 1000;
      if (durationSec >= stopThresholdSec) {
        stops = [
          ...stops,
          {
            id: `${stopStart}-${lastFix}`,
            start: stopStart,
            end: lastFix,
            durationSec,
            latitude: stopStartPosition.latitude,
            longitude: stopStartPosition.longitude,
            address: stopStartPosition.address,
          },
        ];
      }
    }

    const sortedStops = [...stops].sort((a, b) => b.durationSec - a.durationSec);
    const longestStop = sortedStops[0];

    const markers = [];
    if (positions[0]) {
      const startPosition = positions[0];
      const startSpeed = Number.isFinite(startPosition.speed) ? speedFromKnots(startPosition.speed, speedUnit) : null;
      const startLocation = startPosition.address || null;
      const startDetails = [
        `${t('replaySpeed')}: ${startSpeed != null ? startSpeed.toFixed(1) : '—'} ${t(speedUnit === 'mph' ? 'sharedMph' : speedUnit === 'kmh' ? 'sharedKmh' : 'sharedKn')}`,
      ];
      if (startLocation) {
        startDetails.push(`${t('replayLocation')}: ${startLocation}`);
      }
      markers.push({
        id: 'start',
        latitude: startPosition.latitude,
        longitude: startPosition.longitude,
        type: 'start',
        label: 'A',
        color: '#4caf50',
        title: t('replayStart'),
        subtitle: `${t('replayTime')}: ${formatClock(startPosition.fixTime)}`,
        details: startDetails.join('\n'),
      });
    }
    if (positions[positions.length - 1]) {
      const endPosition = positions[positions.length - 1];
      const endSpeed = Number.isFinite(endPosition.speed) ? speedFromKnots(endPosition.speed, speedUnit) : null;
      const endLocation = endPosition.address || null;
      const endDetails = [
        `${t('replaySpeed')}: ${endSpeed != null ? endSpeed.toFixed(1) : '—'} ${t(speedUnit === 'mph' ? 'sharedMph' : speedUnit === 'kmh' ? 'sharedKmh' : 'sharedKn')}`,
      ];
      if (endLocation) {
        endDetails.push(`${t('replayLocation')}: ${endLocation}`);
      }
      markers.push({
        id: 'end',
        latitude: endPosition.latitude,
        longitude: endPosition.longitude,
        type: 'end',
        label: 'B',
        color: '#f44336',
        title: t('replayEnd'),
        subtitle: `${t('replayTime')}: ${formatClock(endPosition.fixTime)}`,
        details: endDetails.join('\n'),
      });
    }
    stops.forEach((stop) => {
      const interval = `${formatClock(stop.start)}-${formatClock(stop.end)}`;
      markers.push({
        id: stop.id,
        latitude: stop.latitude,
        longitude: stop.longitude,
        type: 'stop',
        label: 'P',
        color: '#ff9800',
        textColor: '#ffffff',
        badgeColor: '#ff9800',
        title: t('replayStop'),
        subtitle: `${formatDuration(stop.durationSec)} ${interval}`,
        details: null,
      });
    });

    return {
      distanceMeters,
      movingTimeSec: movingTime,
      stoppedTimeSec: stoppedTime,
      maxSpeedKnots,
      maxSpeedTime,
      stops,
      stopsCount: stops.length,
      tripsCount,
      startTime: positions[0]?.fixTime,
      endTime: positions[positions.length - 1]?.fixTime,
      markers,
      highlights: {
        maxSpeedKnots,
        maxSpeedTime,
        longestStop,
      },
    };
  }, [positions, t, speedUnit]);

  const displayedStops = useMemo(() => {
    if (!summary?.stops?.length) {
      return [];
    }
    const sorted = [...summary.stops].sort((a, b) => b.durationSec - a.durationSec);
    return showAllStops ? sorted : sorted.slice(0, 10);
  }, [summary, showAllStops]);

  const highlights = summary ? (
    <Typography variant="caption" color="textSecondary">
      {t('replayHighlights')}
      {summary.highlights?.maxSpeedTime && ` • ${t('replayMaxSpeedAt')} ${formatTime(summary.highlights.maxSpeedTime, 'seconds')}`}
      {summary.highlights?.longestStop && ` • ${t('replayLongestStop')} ${formatDuration(summary.highlights.longestStop.durationSec)}`}
      {summary.startTime && ` • ${t('replayFirstPoint')} ${formatTime(summary.startTime, 'seconds')}`}
      {summary.endTime && ` • ${t('replayLastPoint')} ${formatTime(summary.endTime, 'seconds')}`}
    </Typography>
  ) : null;

  const stopsSection = summary?.stops?.length > 0 ? (
    <Box className={classes.stopList}>
      <Typography variant="subtitle2">{t('replayStopsTitle')}</Typography>
      {displayedStops.map((stop) => (
        <div key={stop.id} className={classes.stopItem}>
          <Typography variant="body2">
            {`${t('replayStop')} - ${formatDuration(stop.durationSec)} - ${formatClock(stop.start)}-${formatClock(stop.end)}`}
          </Typography>
          {stop.address && (
            <Typography variant="caption" color="textSecondary">
              {stop.address}
            </Typography>
          )}
          <Box>
            <Button
              size="small"
              onClick={() => {
                setSelectedStopId(stop.id);
                setFollowMode(false);
                map.easeTo({
                  center: [stop.longitude, stop.latitude],
                  zoom: currentZoom ?? Math.max(map.getZoom(), 15),
                  duration: 450,
                });
              }}
            >
              {t('replayViewOnMap')}
            </Button>
          </Box>
        </div>
      ))}
      {summary.stops.length > 10 && (
        <Button size="small" onClick={() => setShowAllStops(!showAllStops)}>
          {showAllStops ? t('replayViewLess') : t('replayViewAll')}
        </Button>
      )}
    </Box>
  ) : null;

  return (
    <div className={classes.root}>
      <MapView>
        <MapGeofence />
        <MapRoutePath positions={positions} />
        <MapRoutePoints positions={positions} onClick={onPointClick} showSpeedControl />
        {summary && (
          <MapReplayMarkers
            markers={summary.markers}
            selectedStopId={selectedStopId}
          />
        )}
        {index < positions.length && (
          <MapPositions positions={[positions[index]]} onMarkerClick={onMarkerClick} titleField="fixTime" />
        )}
      </MapView>
      <MapScale />
      {loaded && (
        <div className={classes.mapActions}>
          <Button
            size="small"
            variant={followMode ? 'contained' : 'outlined'}
            startIcon={<MyLocationIcon />}
            onClick={() => {
              setFollowMode(true);
              centerOnCurrent();
            }}
            aria-label={followMode ? t('replayFollowing') : t('replayFollow')}
          >
            {followMode ? t('replayFollowing') : t('replayFollow')}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<CropFreeIcon />}
            onClick={() => fitRoute(positions)}
            aria-label={t('replayFitRoute')}
          >
            {t('replayFitRoute')}
          </Button>
        </div>
      )}
      <div className={classes.sidebar}>
        <Paper elevation={3} square>
          <Toolbar>
            <IconButton edge="start" sx={{ mr: 2 }} onClick={() => navigate(-1)}>
              <BackIcon />
            </IconButton>
            <Typography variant="h6" className={classes.title}>{t('reportReplay')}</Typography>
            {loaded && (
              <>
                <IconButton onClick={handleDownload}>
                  <DownloadIcon />
                </IconButton>
                <IconButton edge="end" onClick={() => updateReportParams(searchParams, setSearchParams, 'ignore', [])}>
                  <TuneIcon />
                </IconButton>
              </>
            )}
          </Toolbar>
        </Paper>
        <Paper className={classes.content} square>
          {loaded ? (
            <>
              <Typography variant="subtitle1" align="center">{deviceName}</Typography>
              <div className={classes.summaryArea}>
                {summary ? (
                  <>
                    <div className={classes.summaryHeader}>
                      <Typography variant="subtitle2">{t('replaySummary')}</Typography>
                      {isMobile && (
                        <Button
                          size="small"
                          className={classes.summaryToggle}
                          onClick={() => setDetailsOpen((open) => !open)}
                          endIcon={detailsOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        >
                          {detailsOpen ? t('replayViewLess') : t('sharedShowDetails')}
                        </Button>
                      )}
                    </div>
                    {isMobile ? (
                      <>
                        <Typography className={classes.summaryCompactLine}>
                          {`${t('replayDistance')}: ${formatDistance(summary.distanceMeters, distanceUnit, t)} | ${t('replayMovingTime')}: ${formatDuration(summary.movingTimeSec)} | ${t('replayStoppedTime')}: ${formatDuration(summary.stoppedTimeSec)} | ${t('replayMaxSpeed')}: ${summary.maxSpeedKnots ? speedFromKnots(summary.maxSpeedKnots, speedUnit).toFixed(1) : '--'} ${t(speedUnit === 'mph' ? 'sharedMph' : speedUnit === 'kmh' ? 'sharedKmh' : 'sharedKn')}`}
                        </Typography>
                        <Collapse in={detailsOpen} timeout="auto" unmountOnExit>
                          <Box className={classes.summaryGrid}>
                            <Chip
                              label={`${t('replayDistance')}: ${formatDistance(summary.distanceMeters, distanceUnit, t)}`}
                              size="small"
                            />
                            <Chip
                              label={`${t('replayMovingTime')}: ${formatDuration(summary.movingTimeSec)}`}
                              size="small"
                            />
                            <Chip
                              label={`${t('replayStoppedTime')}: ${formatDuration(summary.stoppedTimeSec)}`}
                              size="small"
                            />
                            <Chip
                              label={`${t('replayMaxSpeed')}: ${summary.maxSpeedKnots ? speedFromKnots(summary.maxSpeedKnots, speedUnit).toFixed(1) : '--'} ${t(speedUnit === 'mph' ? 'sharedMph' : speedUnit === 'kmh' ? 'sharedKmh' : 'sharedKn')}`}
                              size="small"
                            />
                            <Chip
                              label={`${t('replayStops')}: ${summary.stopsCount ?? '--'}`}
                              size="small"
                            />
                            <Chip
                              label={`${t('replayTrips')}: ${summary.tripsCount ?? '--'}`}
                              size="small"
                            />
                          </Box>
                          {highlights}
                          {stopsSection}
                        </Collapse>
                      </>
                    ) : (
                      <>
                        <Box className={classes.summaryGrid}>
                          <Chip
                            label={`${t('replayDistance')}: ${formatDistance(summary.distanceMeters, distanceUnit, t)}`}
                            size="small"
                          />
                          <Chip
                            label={`${t('replayMovingTime')}: ${formatDuration(summary.movingTimeSec)}`}
                            size="small"
                          />
                          <Chip
                            label={`${t('replayStoppedTime')}: ${formatDuration(summary.stoppedTimeSec)}`}
                            size="small"
                          />
                          <Chip
                            label={`${t('replayMaxSpeed')}: ${summary.maxSpeedKnots ? speedFromKnots(summary.maxSpeedKnots, speedUnit).toFixed(1) : '--'} ${t(speedUnit === 'mph' ? 'sharedMph' : speedUnit === 'kmh' ? 'sharedKmh' : 'sharedKn')}`}
                            size="small"
                          />
                          <Chip
                            label={`${t('replayStops')}: ${summary.stopsCount ?? '--'}`}
                            size="small"
                          />
                          <Chip
                            label={`${t('replayTrips')}: ${summary.tripsCount ?? '--'}`}
                            size="small"
                          />
                        </Box>
                        {highlights}
                      </>
                    )}
                  </>
                ) : (
                  <Typography variant="caption" color="textSecondary">
                    {t('replayInsufficientData')}
                  </Typography>
                )}
              </div>
              <div className={classes.controlsArea}>
                {isMobile ? (
                  <div className={classes.controlsCompact}>
                    <IconButton
                      onClick={() => {
                        if (!playing) {
                          setFollowMode(true);
                          if (!hasAppliedInitialZoom) {
                            const zoom = currentZoom ?? Math.max(map.getZoom(), 15);
                            setCurrentZoom(zoom);
                            setHasAppliedInitialZoom(true);
                            centerOnCurrent(zoom);
                          } else {
                            centerOnCurrent();
                          }
                        }
                        setPlaying(!playing);
                      }}
                      disabled={index >= positions.length - 1}
                    >
                      {playing ? <PauseIcon /> : <PlayArrowIcon /> }
                    </IconButton>
                    <Slider
                      className={classes.sliderCompact}
                      max={positions.length - 1}
                      step={null}
                      marks={positions.map((_, index) => ({ value: index }))}
                      value={index}
                      onChange={(_, index) => setIndex(index)}
                      size="small"
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      className={classes.speedButton}
                      onClick={togglePlaybackSpeed}
                      aria-label={`${t('replaySpeed')} ${playbackSpeed}x`}
                    >
                      {`${playbackSpeed}x`}
                    </Button>
                    <Typography className={classes.timeCompact}>
                      {formatClock(positions[index].fixTime)}
                    </Typography>
                  </div>
                ) : (
                  <>
                    <Slider
                      className={classes.slider}
                      max={positions.length - 1}
                      step={null}
                      marks={positions.map((_, index) => ({ value: index }))}
                      value={index}
                      onChange={(_, index) => setIndex(index)}
                    />
                    <div className={classes.controls}>
                      {`${index + 1}/${positions.length}`}
                      <IconButton onClick={() => setIndex((index) => index - 1)} disabled={playing || index <= 0}>
                        <FastRewindIcon />
                      </IconButton>
                      <IconButton
                        onClick={() => {
                          if (!playing) {
                            setFollowMode(true);
                            if (!hasAppliedInitialZoom) {
                              const zoom = currentZoom ?? Math.max(map.getZoom(), 15);
                              setCurrentZoom(zoom);
                              setHasAppliedInitialZoom(true);
                              centerOnCurrent(zoom);
                            } else {
                              centerOnCurrent();
                            }
                          }
                          setPlaying(!playing);
                        }}
                        disabled={index >= positions.length - 1}
                      >
                        {playing ? <PauseIcon /> : <PlayArrowIcon /> }
                      </IconButton>
                      <IconButton onClick={() => setIndex((index) => index + 1)} disabled={playing || index >= positions.length - 1}>
                        <FastForwardIcon />
                      </IconButton>
                      <Button
                        size="small"
                        variant="outlined"
                        className={classes.speedButton}
                        onClick={togglePlaybackSpeed}
                        aria-label={`${t('replaySpeed')} ${playbackSpeed}x`}
                      >
                        {`${playbackSpeed}x`}
                      </Button>
                      {formatTime(positions[index].fixTime, 'seconds')}
                    </div>
                  </>
                )}
              </div>
              {!isMobile && stopsSection}
            </>
          ) : (
            <ReportFilter onShow={onShow} deviceType="single" loading={loading} />
          )}
        </Paper>
      </div>
      {showCard && index < positions.length && (
        <StatusCard
          deviceId={selectedDeviceId}
          position={positions[index]}
          onClose={() => setShowCard(false)}
          disableActions
        />
      )}
    </div>
  );
};

export default ReplayPage;
