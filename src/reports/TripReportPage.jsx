import {
  useCallback,
  useMemo,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTheme } from '@mui/material/styles';
import {
  Alert,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  useMediaQuery,
} from '@mui/material';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import LocationSearchingIcon from '@mui/icons-material/LocationSearching';
import RouteIcon from '@mui/icons-material/Route';
import {
  formatDistance, formatSpeed, formatVolume, formatTime, formatNumericHours,
} from '../common/util/formatter';
import { getDeviceDisplayName } from '../common/util/deviceUtils';
import ReportFilter from './components/ReportFilter';
import { useAttributePreference } from '../common/util/preferences';
import { useTranslation } from '../common/components/LocalizationProvider';
import PageLayout from '../common/components/PageLayout';
import ReportsMenu from './components/ReportsMenu';
import ColumnSelect from './components/ColumnSelect';
import usePersistedState from '../common/util/usePersistedState';
import { useCatch, useEffectAsync } from '../reactHelper';
import useReportStyles from './common/useReportStyles';
import MapView from '../map/core/MapView';
import MapRoutePath from '../map/MapRoutePath';
import AddressValue from '../common/components/AddressValue';
import TableShimmer from '../common/components/TableShimmer';
import MapMarkers from '../map/MapMarkers';
import MapCamera from '../map/MapCamera';
import MapGeofence from '../map/MapGeofence';
import scheduleReport from './common/scheduleReport';
import MapScale from '../map/MapScale';
import fetchOrThrow from '../common/util/fetchOrThrow';
import exportExcel from '../common/util/exportExcel';
import TripCardList from './components/TripCardList';

const columnsArray = [
  ['startTime', 'reportStartTime'],
  ['startOdometer', 'reportStartOdometer'],
  ['startAddress', 'reportStartAddress'],
  ['endTime', 'reportEndTime'],
  ['endOdometer', 'reportEndOdometer'],
  ['endAddress', 'reportEndAddress'],
  ['distance', 'sharedDistance'],
  ['averageSpeed', 'reportAverageSpeed'],
  ['maxSpeed', 'reportMaximumSpeed'],
  ['duration', 'reportDuration'],
  ['spentFuel', 'reportSpentFuel'],
  ['driverName', 'sharedDriver'],
];
const columnsMap = new Map(columnsArray);

/** Colunas ocultas para usuario comum (Gasto combustivel, Motorista) */
const HIDDEN_COLUMNS_FOR_USER = ['spentFuel', 'driverName'];

const TripReportPage = () => {
  const navigate = useNavigate();
  const { classes } = useReportStyles();
  const t = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery('(max-width:768px)');

  const devices = useSelector((state) => state.devices.items);
  const administrator = useSelector((state) => state.session.user?.administrator);

  const distanceUnit = useAttributePreference('distanceUnit');
  const speedUnit = useAttributePreference('speedUnit');
  const volumeUnit = useAttributePreference('volumeUnit');

  const [columns, setColumns] = usePersistedState('tripColumns', ['startTime', 'endTime', 'distance', 'averageSpeed']);

  const displayColumns = useMemo(() => (
    administrator
      ? columns
      : columnsArray.map(([key]) => key).filter((key) => !HIDDEN_COLUMNS_FOR_USER.includes(key))
  ), [administrator, columns]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingError, setLoadingError] = useState(false);
  const [lastReportParams, setLastReportParams] = useState(null);
  const [range, setRange] = useState({ from: null, to: null });
  const [selectedItem, setSelectedItem] = useState(null);
  const [route, setRoute] = useState(null);

  const createMarkers = () => ([
    {
      latitude: selectedItem.startLat,
      longitude: selectedItem.startLon,
      image: 'start-success',
    },
    {
      latitude: selectedItem.endLat,
      longitude: selectedItem.endLon,
      image: 'finish-error',
    },
  ]);

  useEffectAsync(async () => {
    if (selectedItem) {
      const query = new URLSearchParams({
        deviceId: selectedItem.deviceId,
        from: selectedItem.startTime,
        to: selectedItem.endTime,
      });
      const response = await fetchOrThrow(`/api/reports/route?${query.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      setRoute(await response.json());
    } else {
      setRoute(null);
    }
  }, [selectedItem]);

  const loadReport = useCallback(async ({ deviceIds, groupIds, from, to }) => {
    const query = new URLSearchParams({ from, to });
    deviceIds.forEach((deviceId) => query.append('deviceId', deviceId));
    groupIds.forEach((groupId) => query.append('groupId', groupId));
    setLastReportParams({ deviceIds, groupIds, from, to });
    setRange({ from, to });
    setLoadingError(false);
    setLoading(true);
    try {
      const response = await fetchOrThrow(`/api/reports/trips?${query.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      setItems(await response.json());
    } catch {
      setItems([]);
      setLoadingError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const onShow = useCatch(loadReport);

  const onRetry = useCatch(async () => {
    if (lastReportParams) {
      await loadReport(lastReportParams);
    }
  });

  const onExport = useCatch(async () => {
    const sheets = new Map();
    items.forEach((item) => {
      const deviceName = getDeviceDisplayName(devices[item.deviceId]) || devices[item.deviceId].name;
      if (!sheets.has(deviceName)) {
        sheets.set(deviceName, []);
      }
      const row = {};
      displayColumns.forEach((key) => {
        const header = t(columnsMap.get(key));
        if (key === 'startAddress') {
          row[header] = item.startAddress || '';
        } else if (key === 'endAddress') {
          row[header] = item.endAddress || '';
        } else {
          row[header] = formatValue(item, key);
        }
      });
      sheets.get(deviceName).push(row);
    });
    await exportExcel(t('reportTrips'), 'trips.xlsx', sheets, theme);
  });

  const onSchedule = useCatch(async (deviceIds, groupIds, report) => {
    report.type = 'trips';
    await scheduleReport(deviceIds, groupIds, report);
    navigate('/reports/scheduled');
  });

  const navigateToReplay = (item) => {
    navigate({
      pathname: '/replay',
      search: new URLSearchParams({
        from: item.startTime,
        to: item.endTime,
        deviceId: item.deviceId,
      }).toString(),
    });
  };

  const formatValue = (item, key) => {
    const value = item[key];
    switch (key) {
      case 'deviceId':
        return getDeviceDisplayName(devices[value]) || devices[value].name;
      case 'startTime':
      case 'endTime':
        return formatTime(value, 'minutes');
      case 'startOdometer':
      case 'endOdometer':
      case 'distance':
        return formatDistance(value, distanceUnit, t);
      case 'averageSpeed':
      case 'maxSpeed':
        return value > 0 ? formatSpeed(value, speedUnit, t) : null;
      case 'duration':
        return formatNumericHours(value, t);
      case 'spentFuel':
        return value > 0 ? formatVolume(value, volumeUnit, t) : null;
      case 'startAddress':
        return (<AddressValue latitude={item.startLat} longitude={item.startLon} originalAddress={value} />);
      case 'endAddress':
        return (<AddressValue latitude={item.endLat} longitude={item.endLon} originalAddress={value} />);
      default:
        return value;
    }
  };

  const showDateInCards = useMemo(() => (
    Boolean(range.from && range.to)
    && formatTime(range.from, 'date') !== formatTime(range.to, 'date')
  ), [range.from, range.to]);

  const showDeviceNameInCards = useMemo(
    () => new Set(items.map((item) => item.deviceId)).size > 1,
    [items],
  );

  const cardItems = useMemo(() => items.map((item) => ({
    ...item,
    deviceName: getDeviceDisplayName(devices[item.deviceId]) || devices[item.deviceId]?.name,
  })), [devices, items]);

  const getDistanceLabel = useCallback((item) => formatDistance(item.distance, distanceUnit, t), [distanceUnit, t]);
  const getDurationLabel = useCallback((item) => formatNumericHours(item.duration, t), [t]);
  const getAverageSpeedLabel = useCallback((item) => (
    item.averageSpeed > 0 ? formatSpeed(item.averageSpeed, speedUnit, t) : '--'
  ), [speedUnit, t]);
  const getMaxSpeedLabel = useCallback((item) => (
    item.maxSpeed > 0 ? formatSpeed(item.maxSpeed, speedUnit, t) : '--'
  ), [speedUnit, t]);

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'reportTrips']}>
      <div className={classes.container}>
        {selectedItem && (
          <div className={classes.containerMap}>
            <MapView>
              <MapGeofence />
              {route && (
                <>
                  <MapRoutePath positions={route} />
                  <MapMarkers markers={createMarkers()} />
                  <MapCamera positions={route} />
                </>
              )}
            </MapView>
            <MapScale />
          </div>
        )}
        <div className={classes.containerMain}>
          <div className={classes.header}>
            <ReportFilter onShow={onShow} onExport={onExport} onSchedule={onSchedule} deviceType="multiple" loading={loading}>
              {administrator && (
                <ColumnSelect columns={columns} setColumns={setColumns} columnsArray={columnsArray} />
              )}
            </ReportFilter>
          </div>
          {isMobile ? (
            <TripCardList
              items={cardItems}
              loading={loading}
              error={loadingError}
              onRetry={lastReportParams ? onRetry : undefined}
              onFocusMap={(item) => setSelectedItem(item)}
              onReplay={navigateToReplay}
              showDate={showDateInCards}
              showDeviceName={showDeviceNameInCards}
              getDistanceLabel={getDistanceLabel}
              getDurationLabel={getDurationLabel}
              getAverageSpeedLabel={getAverageSpeedLabel}
              getMaxSpeedLabel={getMaxSpeedLabel}
            />
          ) : (
            <>
              {loadingError && (
                <Alert
                  severity="error"
                  action={lastReportParams ? <Button color="inherit" size="small" onClick={onRetry}>{t('reportRetry')}</Button> : null}
                  sx={{ mx: 2, mt: 1 }}
                >
                  {t('reportEventsLoadError')}
                </Alert>
              )}
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell className={classes.columnAction} />
                    <TableCell>{t('sharedDevice')}</TableCell>
                    {displayColumns.map((key) => (<TableCell key={key}>{t(columnsMap.get(key))}</TableCell>))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!loading ? items.map((item) => (
                    <TableRow key={item.startPositionId}>
                      <TableCell className={classes.columnAction} padding="none">
                        <div className={classes.columnActionContainer}>
                          {selectedItem === item ? (
                            <IconButton size="small" onClick={() => setSelectedItem(null)}>
                              <GpsFixedIcon fontSize="small" />
                            </IconButton>
                          ) : (
                            <IconButton size="small" onClick={() => setSelectedItem(item)}>
                              <LocationSearchingIcon fontSize="small" />
                            </IconButton>
                          )}
                          <IconButton size="small" onClick={() => navigateToReplay(item)}>
                            <RouteIcon fontSize="small" />
                          </IconButton>
                        </div>
                      </TableCell>
                      <TableCell>{getDeviceDisplayName(devices[item.deviceId]) || devices[item.deviceId].name}</TableCell>
                      {displayColumns.map((key) => (
                        <TableCell key={key}>
                          {formatValue(item, key)}
                        </TableCell>
                      ))}
                    </TableRow>
                  )) : (<TableShimmer columns={displayColumns.length + 2} startAction />)}
                </TableBody>
              </Table>
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
};

export default TripReportPage;
