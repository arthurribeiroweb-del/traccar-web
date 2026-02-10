import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useSelector } from 'react-redux';
import dayjs from 'dayjs';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { getDeviceDisplayName } from '../common/util/deviceUtils';

const TIMEOUT_MS = 12_000;
const RETRY_DELAY_MS = 800;
const STOP_GAP_MINUTES = 5;

const severityRank = {
  high: 3,
  medium: 2,
  low: 1,
};

const mapSeverity = (event) => {
  const type = event?.type;
  if (!type) return null;
  if (type === 'deviceOverspeed' || type === 'overspeed') return 'high';
  if (type === 'geofenceEnter' || type === 'geofenceExit') return 'medium';
  if (type === 'ignitionOn' || type === 'ignitionOff') return 'low';
  return null;
};

const getPlateValue = (device) => (
  device?.attributes?.plate
  || device?.attributes?.licensePlate
  || device?.attributes?.vehiclePlate
  || ''
);

const createAttemptSignal = (mainSignal, timeoutMs) => {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (mainSignal) {
    if (mainSignal.aborted) {
      controller.abort();
    } else {
      mainSignal.addEventListener('abort', onAbort, { once: true });
    }
  }
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const cleanup = () => {
    clearTimeout(timeout);
    if (mainSignal) {
      mainSignal.removeEventListener('abort', onAbort);
    }
  };
  return { signal: controller.signal, cleanup };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const deriveStopsFromTrips = (trips) => {
  if (!Array.isArray(trips) || trips.length < 2) return [];
  const sorted = [...trips].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const stops = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const gapMs = dayjs(next.startTime).diff(dayjs(current.endTime), 'millisecond');
    if (gapMs >= STOP_GAP_MINUTES * 60 * 1000) {
      stops.push({
        deviceId: current.deviceId,
        startTime: current.endTime,
        endTime: next.startTime,
        duration: gapMs,
        address: current.endAddress || next.startAddress || '',
        latitude: current.endLat,
        longitude: current.endLon,
        derived: true,
      });
    }
  }
  return stops;
};

const buildTimelineItems = (trips, stops) => {
  const items = [];
  (trips || []).forEach((trip) => {
    items.push({
      id: `trip_${trip.startTime}_${trip.endTime}`,
      type: 'trip',
      startTime: trip.startTime,
      endTime: trip.endTime,
      duration: trip.duration,
      distance: trip.distance,
      startAddress: trip.startAddress || '',
      endAddress: trip.endAddress || '',
    });
  });
  (stops || []).forEach((stop) => {
    items.push({
      id: `stop_${stop.startTime}_${stop.endTime}`,
      type: 'stop',
      startTime: stop.startTime,
      endTime: stop.endTime,
      duration: stop.duration,
      address: stop.address || '',
      derived: stop.derived,
    });
  });
  return items.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
};

const buildActivitySeries = (trips, from, to) => {
  if (!from || !to) return [];
  const start = dayjs(from).startOf('day');
  const end = dayjs(to).startOf('day');
  const days = [];
  let cursor = start;
  while (cursor.isBefore(end) || cursor.isSame(end)) {
    const key = cursor.format('YYYY-MM-DD');
    days.push({ key, label: cursor.format('DD/MM') });
    cursor = cursor.add(1, 'day');
  }
  const totals = new Map(days.map((day) => [day.key, { distance: 0, moving: 0 }]));
  (trips || []).forEach((trip) => {
    const key = dayjs(trip.startTime).format('YYYY-MM-DD');
    if (!totals.has(key)) return;
    const current = totals.get(key);
    totals.set(key, {
      distance: current.distance + (trip.distance || 0),
      moving: current.moving + (trip.duration || 0),
    });
  });
  return days.map((day) => ({
    day: day.label,
    distance: totals.get(day.key)?.distance || 0,
    moving: totals.get(day.key)?.moving || 0,
  }));
};

const buildFavoritePlaces = (stops) => {
  if (!Array.isArray(stops) || stops.length === 0) return [];
  const groups = new Map();
  stops.forEach((stop) => {
    const key = (stop.address || '').trim() || `${stop.latitude || ''},${stop.longitude || ''}`;
    const current = groups.get(key) || { address: stop.address || '', stoppedTotal: 0 };
    groups.set(key, {
      address: current.address || stop.address || '',
      stoppedTotal: current.stoppedTotal + (stop.duration || 0),
    });
  });
  return Array.from(groups.values())
    .sort((a, b) => b.stoppedTotal - a.stoppedTotal)
    .slice(0, 3);
};

const buildSafetyEvents = (events, positionsMap) => {
  if (!Array.isArray(events) || events.length === 0) return [];
  const relevant = events.map((event) => ({
    event,
    severity: mapSeverity(event),
  })).filter((item) => item.severity);
  relevant.sort((a, b) => (
    severityRank[b.severity] - severityRank[a.severity]
      || new Date(b.event.eventTime) - new Date(a.event.eventTime)
  ));
  return relevant.slice(0, 8).map(({ event, severity }) => ({
    event,
    severity,
    time: event.eventTime,
    address: positionsMap?.[event.positionId]?.address || '',
  }));
};

const buildPositionsMap = (positions) => {
  const map = {};
  (positions || []).forEach((position) => {
    map[position.id] = position;
  });
  return map;
};

const useReportsDashboard = ({ deviceId, from, to }) => {
  const devices = useSelector((state) => state.devices.items);
  const positions = useSelector((state) => state.session.positions);

  const device = deviceId ? devices[deviceId] : null;
  const position = deviceId ? positions[deviceId] : null;

  const header = useMemo(() => ({
    deviceName: getDeviceDisplayName(device) || device?.name || '',
    plate: getPlateValue(device),
    status: device?.status || 'unknown',
    lastUpdate: device?.lastUpdate || '',
    batteryLevel: position?.attributes?.batteryLevel,
    gpsSat: position?.attributes?.sat || position?.attributes?.satVisible || position?.attributes?.gps,
    gpsValid: position?.valid,
  }), [device, position]);

  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    kpis: null,
    timelineItems: [],
    activitySeries: [],
    safetyEvents: [],
    favoritePlaces: [],
    movementTotals: { moving: 0, stopped: 0 },
    stopsDerived: false,
  });

  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  const paramsRef = useRef({ deviceId, from, to });

  const loadData = useCallback(async (params) => {
    if (!params.deviceId || !params.from || !params.to) {
      setStatus('empty');
      return;
    }

    setStatus('loading');
    setError(null);

    const mainController = new AbortController();
    abortRef.current = mainController;

    const runAttempt = async (attempt) => {
      const { signal, cleanup } = createAttemptSignal(mainController.signal, TIMEOUT_MS);
      try {
        const query = new URLSearchParams({
          deviceId: params.deviceId,
          from: params.from,
          to: params.to,
        });
        const [summaryRes, tripsRes, eventsRes, stopsRes] = await Promise.all([
          fetchOrThrow(`/api/reports/summary?${query.toString()}`, { headers: { Accept: 'application/json' }, signal }),
          fetchOrThrow(`/api/reports/trips?${query.toString()}`, { headers: { Accept: 'application/json' }, signal }),
          fetchOrThrow(`/api/reports/events?${query.toString()}`, { headers: { Accept: 'application/json' }, signal }),
          fetchOrThrow(`/api/reports/stops?${query.toString()}`, { headers: { Accept: 'application/json' }, signal })
            .catch(() => null),
        ]);

        const [summaryItems, trips, events, stops] = await Promise.all([
          summaryRes.json(),
          tripsRes.json(),
          eventsRes.json(),
          stopsRes ? stopsRes.json() : null,
        ]);

        let positionsMap = {};
        if (events?.length) {
          const ids = Array.from(new Set(events.map((item) => item.positionId).filter(Boolean))).slice(0, 128);
          if (ids.length) {
            const positionsQuery = new URLSearchParams();
            ids.forEach((id) => positionsQuery.append('id', id));
            const positionsRes = await fetchOrThrow(`/api/positions?${positionsQuery.toString()}`, {
              headers: { Accept: 'application/json' },
              signal,
            });
            const positionsArray = await positionsRes.json();
            positionsMap = buildPositionsMap(positionsArray);
          }
        }

        const summaryItem = Array.isArray(summaryItems)
          ? (summaryItems.find((item) => item.deviceId === params.deviceId) || summaryItems[0])
          : null;

        const tripsArray = Array.isArray(trips) ? trips : [];
        const stopsArray = Array.isArray(stops) ? stops : [];
        const derivedStops = stopsArray.length ? stopsArray : deriveStopsFromTrips(tripsArray);

        const movingTotal = tripsArray.reduce((sum, item) => sum + (item.duration || 0), 0);
        const stoppedTotal = derivedStops.reduce((sum, item) => sum + (item.duration || 0), 0);

        const distanceTotal = summaryItem?.distance ?? tripsArray.reduce((sum, item) => sum + (item.distance || 0), 0);
        const maxSpeed = summaryItem?.maxSpeed ?? null;
        const avgSpeed = summaryItem?.averageSpeed ?? null;

        const nextData = {
          kpis: {
            distance: distanceTotal || 0,
            moving: movingTotal || 0,
            stopped: stoppedTotal || 0,
            maxSpeed,
            avgSpeed,
          },
          timelineItems: buildTimelineItems(tripsArray, derivedStops),
          activitySeries: buildActivitySeries(tripsArray, params.from, params.to),
          safetyEvents: buildSafetyEvents(events, positionsMap),
          favoritePlaces: buildFavoritePlaces(derivedStops),
          movementTotals: { moving: movingTotal || 0, stopped: stoppedTotal || 0 },
          stopsDerived: !stopsArray.length,
        };

        const empty = distanceTotal === 0 && tripsArray.length === 0;
        setData(nextData);
        setStatus(empty ? 'empty' : 'success');
      } catch (err) {
        if (mainController.signal.aborted) {
          return;
        }
        if (attempt === 0 && (err?.name === 'AbortError' || err instanceof TypeError)) {
          await sleep(RETRY_DELAY_MS);
          if (!mainController.signal.aborted) {
            await runAttempt(1);
          }
          return;
        }
        setError(err);
        setStatus('error');
      } finally {
        cleanup();
      }
    };

    await runAttempt(0);
  }, []);

  useEffect(() => {
    paramsRef.current = { deviceId, from, to };
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (abortRef.current) {
      abortRef.current.abort();
    }
    debounceRef.current = setTimeout(() => {
      loadData(paramsRef.current);
    }, 250);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [deviceId, from, to, loadData]);

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  const refetch = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    loadData(paramsRef.current);
  }, [loadData]);

  return {
    status,
    error,
    refetch,
    header,
    kpis: data.kpis,
    timelineItems: data.timelineItems,
    activitySeries: data.activitySeries,
    safetyEvents: data.safetyEvents,
    favoritePlaces: data.favoritePlaces,
    movementTotals: data.movementTotals,
    stopsDerived: data.stopsDerived,
  };
};

export default useReportsDashboard;
