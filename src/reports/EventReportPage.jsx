import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Link,
  IconButton,
  Button,
  Alert,
  useMediaQuery,
} from '@mui/material';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import LocationSearchingIcon from '@mui/icons-material/LocationSearching';
import { useSelector } from 'react-redux';
import { useTheme } from '@mui/material/styles';
import { formatSpeed, formatTime } from '../common/util/formatter';
import { getDeviceDisplayName } from '../common/util/deviceUtils';
import ReportFilter, { updateReportParams } from './components/ReportFilter';
import { prefixString, unprefixString } from '../common/util/stringUtils';
import { useTranslation, useTranslationKeys } from '../common/components/LocalizationProvider';
import PageLayout from '../common/components/PageLayout';
import ReportsMenu from './components/ReportsMenu';
import usePersistedState from '../common/util/usePersistedState';
import ColumnSelect from './components/ColumnSelect';
import { useCatch, useEffectAsync } from '../reactHelper';
import useReportStyles from './common/useReportStyles';
import TableShimmer from '../common/components/TableShimmer';
import { useAttributePreference } from '../common/util/preferences';
import MapView from '../map/core/MapView';
import MapGeofence from '../map/MapGeofence';
import MapPositions from '../map/MapPositions';
import MapCamera from '../map/MapCamera';
import scheduleReport from './common/scheduleReport';
import MapScale from '../map/MapScale';
import SelectField from '../common/components/SelectField';
import fetchOrThrow from '../common/util/fetchOrThrow';
import exportExcel from '../common/util/exportExcel';
import AddressValue from '../common/components/AddressValue';
import EventCardList from './components/EventCardList';
import { getEventTitle, getRadarOverspeedSubtitle } from './common/eventLabels';

const columnsArray = [
  ['eventTime', 'positionFixTime'],
  ['type', 'sharedType'],
  ['geofenceId', 'sharedGeofence'],
  ['maintenanceId', 'sharedMaintenance'],
  ['address', 'positionAddress'],
  ['attributes', 'commandData'],
];
const columnsMap = new Map(columnsArray);

const EventReportPage = () => {
  const navigate = useNavigate();
  const { classes } = useReportStyles();
  const t = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery('(max-width:768px)');

  const [searchParams, setSearchParams] = useSearchParams();

  const devices = useSelector((state) => state.devices.items);
  const geofences = useSelector((state) => state.geofences.items);

  const speedUnit = useAttributePreference('speedUnit');

  const [allEventTypes, setAllEventTypes] = useState([['allEvents', 'eventAll']]);

  const alarms = useTranslationKeys((it) => it.startsWith('alarm')).map((it) => ({
    key: unprefixString('alarm', it),
    name: t(it),
  }));

  const [columns, setColumns] = usePersistedState('eventColumns', ['eventTime', 'type', 'address', 'attributes']);
  const eventTypes = useMemo(() => searchParams.getAll('eventType'), [searchParams]);
  const alarmTypes = useMemo(() => searchParams.getAll('alarmType'), [searchParams]);
  const [items, setItems] = useState([]);
  const [positions, setPositions] = useState({});
  const [commandsById, setCommandsById] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingError, setLoadingError] = useState(false);
  const [lastReportParams, setLastReportParams] = useState(null);
  const [range, setRange] = useState({ from: null, to: null });
  const [selectedItem, setSelectedItem] = useState(null);
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (!eventTypes.length) {
      updateReportParams(searchParams, setSearchParams, 'eventType', ['allEvents']);
    }
  }, [searchParams, setSearchParams, eventTypes])

  useEffect(() => {
    if (selectedItem?.positionId) {
      setPosition(positions[selectedItem.positionId] || null);
    } else {
      setPosition(null);
    }
  }, [selectedItem, positions]);

  useEffectAsync(async () => {
    const response = await fetchOrThrow('/api/notifications/types');
    const types = await response.json();
    setAllEventTypes([...allEventTypes, ...types.map((it) => [it.type, prefixString('event', it.type)])]);
  }, []);

  const loadCommandsMap = useCallback(async (events) => {
    const hasCommandEvents = events.some((event) => event.type === 'commandResult' || event.type === 'commandFailure');
    if (!hasCommandEvents) {
      setCommandsById({});
      return;
    }
    try {
      const response = await fetchOrThrow('/api/commands');
      const commands = await response.json();
      const map = {};
      commands.forEach((command) => {
        map[command.id] = command;
      });
      setCommandsById(map);
    } catch {
      setCommandsById({});
    }
  }, []);

  const loadReport = useCallback(async ({ deviceIds, groupIds, from, to }) => {
    const query = new URLSearchParams({ from, to });
    deviceIds.forEach((deviceId) => query.append('deviceId', deviceId));
    groupIds.forEach((groupId) => query.append('groupId', groupId));
    eventTypes.forEach((it) => query.append('type', it));
    if (eventTypes[0] !== 'allEvents' && eventTypes.includes('alarm')) {
      alarmTypes.forEach((it) => query.append('alarm', it));
    }
    setLastReportParams({ deviceIds, groupIds, from, to });
    setRange({ from, to });
    setSelectedItem(null);
    setPosition(null);
    setLoadingError(false);
    setLoading(true);
    try {
      const response = await fetchOrThrow(`/api/reports/events?${query.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      const events = await response.json();
      setItems(events);
      await loadCommandsMap(events);
      const positionIds = Array.from(new Set(events
        .map((event) => event.positionId)
        .filter((id) => id)));
      const positionsMap = {};
      if (positionIds.length > 0) {
        const positionsQuery = new URLSearchParams();
        positionIds.slice(0, 128).forEach((id) => positionsQuery.append('id', id));
        const positionsResponse = await fetchOrThrow(`/api/positions?${positionsQuery.toString()}`);
        const positionsArray = await positionsResponse.json();
        positionsArray.forEach((p) => positionsMap[p.id] = p);
      }
      setPositions(positionsMap);
    } catch {
      setItems([]);
      setPositions({});
      setCommandsById({});
      setLoadingError(true);
    } finally {
      setLoading(false);
    }
  }, [alarmTypes, eventTypes, loadCommandsMap]);

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
      columns.forEach((key) => {
        const header = t(columnsMap.get(key));
        if (key === 'attributes' && item.type === 'media') {
          row[header] = item.attributes.file;
        } else if (key === 'address') {
          row[header] = positions[item.positionId]?.address || '';
        } else {
          row[header] = formatValue(item, key);
        }
      });
      sheets.get(deviceName).push(row);
    });
    await exportExcel(t('reportEvents'), 'events.xlsx', sheets, theme);
  });

  const onSchedule = useCatch(async (deviceIds, groupIds, report) => {
    report.type = 'events';
    if (eventTypes[0] !== 'allEvents') {
      report.attributes.types = eventTypes.join(',');
    }
    await scheduleReport(deviceIds, groupIds, report);
    navigate('/reports/scheduled');
  });

  const formatValue = (item, key) => {
    const value = item[key];
    switch (key) {
      case 'deviceId':
        return getDeviceDisplayName(devices[value]) || devices[value].name;
      case 'eventTime':
        return formatTime(value, 'seconds');
      case 'type':
        return getEventTitle(item, t);
      case 'geofenceId':
        if (value > 0) {
          const geofence = geofences[value];
          return geofence && geofence.name;
        }
        return null;
      case 'maintenanceId':
        return value > 0 ? value : null;
      case 'address': {
        const position = positions[item.positionId];
        if (position) {
          return (
            <AddressValue
              latitude={position.latitude}
              longitude={position.longitude}
              originalAddress={position.address}
            />
          );
        }
        return '';
      }
      case 'attributes':
        switch (item.type) {
          case 'alarm':
            return t(prefixString('alarm', item.attributes.alarm));
          case 'deviceOverspeed': {
            const radarSubtitle = getRadarOverspeedSubtitle({
              event: item,
              geofenceName: geofences[item.geofenceId]?.name,
              deviceName: getDeviceDisplayName(devices[item.deviceId]) || devices[item.deviceId]?.name,
              t,
              includeDeviceName: false,
            });
            if (radarSubtitle) {
              return radarSubtitle;
            }
            return formatSpeed(item.attributes.speed, speedUnit, t);
          }
          case 'driverChanged':
            return item.attributes.driverUniqueId;
          case 'media':
            return (<Link href={`/api/media/${devices[item.deviceId]?.uniqueId}/${item.attributes.file}`} target="_blank">{item.attributes.file}</Link>);
          case 'commandResult':
            return item.attributes.result;
          default:
            return '';
        }
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

  const cardItems = useMemo(() => items.map((event) => {
    const geofenceId = event.geofenceId || event.attributes?.geofenceId;
    return {
      event,
      position: positions[event.positionId] || null,
      geofenceName: geofenceId ? geofences[geofenceId]?.name : null,
      deviceName: getDeviceDisplayName(devices[event.deviceId]) || devices[event.deviceId]?.name,
      showDeviceName: showDeviceNameInCards,
    };
  }), [devices, geofences, items, positions, showDeviceNameInCards]);

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'reportEvents']}>
      <div className={classes.container}>
        {selectedItem && (
          <div className={classes.containerMap}>
            <MapView>
              <MapGeofence />
              {position && <MapPositions positions={[position]} titleField="fixTime" />}
            </MapView>
            <MapScale />
            {position && <MapCamera latitude={position.latitude} longitude={position.longitude} />}
          </div>
        )}
        <div className={classes.containerMain}>
          <div className={classes.header}>
            <ReportFilter onShow={onShow} onExport={onExport} onSchedule={onSchedule} deviceType="multiple" loading={loading}>
              <div className={classes.filterItem}>
                <FormControl fullWidth>
                  <InputLabel>{t('reportEventTypes')}</InputLabel>
                  <Select
                    label={t('reportEventTypes')}
                    value={eventTypes}
                    onChange={(e, child) => {
                      let values = e.target.value;
                      const clicked = child.props.value;
                      if (values.includes('allEvents') && values.length > 1) {
                        values = [clicked];
                      }
                      updateReportParams(searchParams, setSearchParams, 'eventType', values)
                    }}
                    multiple
                  >
                    {allEventTypes.map(([key, string]) => (
                      <MenuItem key={key} value={key}>{t(string)}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </div>
              {eventTypes[0] !== 'allEvents' && eventTypes.includes('alarm') && (
                <div className={classes.filterItem}>
                  <SelectField
                    multiple
                    value={alarmTypes}
                    onChange={(e) => updateReportParams(searchParams, setSearchParams, 'alarmType', e.target.value)}
                    data={alarms}
                    keyGetter={(it) => it.key}
                    label={t('sharedAlarms')}
                    fullWidth
                  />
                </div>
              )}
              <ColumnSelect columns={columns} setColumns={setColumns} columnsArray={columnsArray} />
            </ReportFilter>
          </div>
          {isMobile ? (
            <EventCardList
              events={cardItems}
              loading={loading}
              error={loadingError}
              onRetry={lastReportParams ? onRetry : undefined}
              onFocusMap={(item) => setSelectedItem(item.event)}
              showDate={showDateInCards}
              commandsById={commandsById}
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
                    {columns.map((key) => (<TableCell key={key}>{t(columnsMap.get(key))}</TableCell>))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!loading ? items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className={classes.columnAction} padding="none">
                        {(item.positionId && (selectedItem === item ? (
                          <IconButton size="small" onClick={() => setSelectedItem(null)}>
                            <GpsFixedIcon fontSize="small" />
                          </IconButton>
                        ) : (
                          <IconButton size="small" onClick={() => setSelectedItem(item)}>
                            <LocationSearchingIcon fontSize="small" />
                          </IconButton>
                        ))) || ''}
                      </TableCell>
                      <TableCell>{getDeviceDisplayName(devices[item.deviceId]) || devices[item.deviceId].name}</TableCell>
                      {columns.map((key) => (
                        <TableCell key={key}>
                          {formatValue(item, key)}
                        </TableCell>
                      ))}
                    </TableRow>
                  )) : (<TableShimmer columns={columns.length + 2} />)}
                </TableBody>
              </Table>
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
};

export default EventReportPage;
