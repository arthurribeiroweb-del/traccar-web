import {
  useCallback,
  useMemo,
  useState,
} from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  formatDistance, formatSpeed, formatVolume, formatTime, formatNumericHours,
} from '../common/util/formatter';
import { getDeviceDisplayName } from '../common/util/deviceUtils';
import ReportFilter, { updateReportParams } from './components/ReportFilter';
import { useAttributePreference } from '../common/util/preferences';
import { useTranslation } from '../common/components/LocalizationProvider';
import PageLayout from '../common/components/PageLayout';
import ReportsMenu from './components/ReportsMenu';
import usePersistedState from '../common/util/usePersistedState';
import ColumnSelect from './components/ColumnSelect';
import { useCatch } from '../reactHelper';
import useReportStyles from './common/useReportStyles';
import TableShimmer from '../common/components/TableShimmer';
import scheduleReport from './common/scheduleReport';
import fetchOrThrow from '../common/util/fetchOrThrow';
import exportExcel from '../common/util/exportExcel';
import SummaryCardList from './components/SummaryCardList';

const columnsArray = [
  ['startTime', 'reportStartDate'],
  ['distance', 'sharedDistance'],
  ['startOdometer', 'reportStartOdometer'],
  ['endOdometer', 'reportEndOdometer'],
  ['averageSpeed', 'reportAverageSpeed'],
  ['maxSpeed', 'reportMaximumSpeed'],
  ['engineHours', 'reportEngineHours'],
  ['startHours', 'reportStartEngineHours'],
  ['endHours', 'reportEndEngineHours'],
  ['spentFuel', 'reportSpentFuel'],
];
const columnsMap = new Map(columnsArray);

const SummaryReportPage = () => {
  const navigate = useNavigate();
  const { classes } = useReportStyles();
  const t = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery('(max-width:768px)');

  const [searchParams, setSearchParams] = useSearchParams();

  const devices = useSelector((state) => state.devices.items);

  const distanceUnit = useAttributePreference('distanceUnit');
  const speedUnit = useAttributePreference('speedUnit');
  const volumeUnit = useAttributePreference('volumeUnit');

  const [columns, setColumns] = usePersistedState('summaryColumns', ['startTime', 'distance', 'averageSpeed']);
  const daily = searchParams.get('daily') === 'true';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingError, setLoadingError] = useState(false);
  const [lastReportParams, setLastReportParams] = useState(null);

  const loadReport = useCallback(async ({ deviceIds, groupIds, from, to }) => {
    const query = new URLSearchParams({ from, to, daily });
    deviceIds.forEach((deviceId) => query.append('deviceId', deviceId));
    groupIds.forEach((groupId) => query.append('groupId', groupId));
    setLastReportParams({ deviceIds, groupIds, from, to });
    setLoadingError(false);
    setLoading(true);
    try {
      const response = await fetchOrThrow(`/api/reports/summary?${query.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      setItems(await response.json());
    } catch {
      setItems([]);
      setLoadingError(true);
    } finally {
      setLoading(false);
    }
  }, [daily]);

  const onShow = useCatch(loadReport);

  const onRetry = useCatch(async () => {
    if (lastReportParams) {
      await loadReport(lastReportParams);
    }
  });

  const onExport = useCatch(async () => {
    const rows = [];
    const deviceHeader = t('sharedDevice');
    items.forEach((item) => {
      const row = { [deviceHeader]: getDeviceDisplayName(devices[item.deviceId]) || devices[item.deviceId].name };
      columns.forEach((key) => {
        const header = t(columnsMap.get(key));
        row[header] = formatValue(item, key);
      });
      rows.push(row);
    });
    if (rows.length === 0) {
      return;
    }
    const titleKey = daily ? 'reportDaily' : 'reportSummary';
    const title = t(titleKey);
    const sheets = new Map([[title, rows]]);
    await exportExcel(title, 'summary.xlsx', sheets, theme);
  });

  const onSchedule = useCatch(async (deviceIds, groupIds, report) => {
    report.type = 'summary';
    report.attributes.daily = daily;
    await scheduleReport(deviceIds, groupIds, report);
    navigate('/reports/scheduled');
  });

  const formatValue = (item, key) => {
    const value = item[key];
    switch (key) {
      case 'deviceId':
        return getDeviceDisplayName(devices[value]) || devices[value].name;
      case 'startTime':
        return formatTime(value, 'date');
      case 'startOdometer':
      case 'endOdometer':
      case 'distance':
        return formatDistance(value, distanceUnit, t);
      case 'averageSpeed':
      case 'maxSpeed':
        return value > 0 ? formatSpeed(value, speedUnit, t) : null;
      case 'engineHours':
      case 'startHours':
      case 'endHours':
        return value > 0 ? formatNumericHours(value, t) : null;
      case 'spentFuel':
        return value > 0 ? formatVolume(value, volumeUnit, t) : null;
      default:
        return value;
    }
  };

  const showDeviceNameInCards = useMemo(
    () => new Set(items.map((item) => item.deviceId)).size > 1,
    [items],
  );

  const cardItems = useMemo(() => items.map((item) => ({
    ...item,
    deviceName: getDeviceDisplayName(devices[item.deviceId]) || devices[item.deviceId]?.name,
  })), [devices, items]);

  const getDateLabel = useCallback((item) => formatTime(item.startTime, 'date'), []);
  const getPrimaryLabel = useCallback((item) => {
    const distance = formatDistance(item.distance, distanceUnit, t);
    const avgSpeed = item.averageSpeed > 0 ? formatSpeed(item.averageSpeed, speedUnit, t) : '--';
    return `${distance} • ${avgSpeed}`;
  }, [distanceUnit, speedUnit, t]);

  const getSecondaryLabel = useCallback((item) => {
    const maxSpeed = item.maxSpeed > 0 ? formatSpeed(item.maxSpeed, speedUnit, t) : '--';
    const engineHours = item.engineHours > 0 ? formatNumericHours(item.engineHours, t) : '--';
    return `${t('reportMaximumSpeed')}: ${maxSpeed} • ${t('reportEngineHours')}: ${engineHours}`;
  }, [speedUnit, t]);

  const getTertiaryLabel = useCallback((item) => {
    const startOdometer = formatDistance(item.startOdometer, distanceUnit, t);
    const endOdometer = formatDistance(item.endOdometer, distanceUnit, t);
    const spentFuel = item.spentFuel > 0 ? formatVolume(item.spentFuel, volumeUnit, t) : '--';
    return `${t('reportStartOdometer')}: ${startOdometer} • ${t('reportEndOdometer')}: ${endOdometer} • ${t('reportSpentFuel')}: ${spentFuel}`;
  }, [distanceUnit, volumeUnit, t]);

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'reportSummary']}>
      <div className={classes.header}>
        <ReportFilter onShow={onShow} onExport={onExport} onSchedule={onSchedule} deviceType="multiple" loading={loading}>
          <div className={classes.filterItem}>
            <FormControl fullWidth>
              <InputLabel>{t('sharedType')}</InputLabel>
              <Select
                label={t('sharedType')}
                value={daily}
                onChange={(e) => updateReportParams(searchParams, setSearchParams, 'daily', [String(e.target.value)])}
              >
                <MenuItem value={false}>{t('reportSummary')}</MenuItem>
                <MenuItem value>{t('reportDaily')}</MenuItem>
              </Select>
            </FormControl>
          </div>
          <ColumnSelect columns={columns} setColumns={setColumns} columnsArray={columnsArray} />
        </ReportFilter>
      </div>
      {isMobile ? (
        <SummaryCardList
          items={cardItems}
          loading={loading}
          error={loadingError}
          onRetry={lastReportParams ? onRetry : undefined}
          showDeviceName={showDeviceNameInCards}
          getDateLabel={getDateLabel}
          getPrimaryLabel={getPrimaryLabel}
          getSecondaryLabel={getSecondaryLabel}
          getTertiaryLabel={getTertiaryLabel}
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
                <TableCell>{t('sharedDevice')}</TableCell>
                {columns.map((key) => (<TableCell key={key}>{t(columnsMap.get(key))}</TableCell>))}
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading ? items.map((item) => (
                <TableRow key={(`${item.deviceId}_${Date.parse(item.startTime)}`)}>
                  <TableCell>{getDeviceDisplayName(devices[item.deviceId]) || devices[item.deviceId].name}</TableCell>
                  {columns.map((key) => (
                    <TableCell key={key}>
                      {formatValue(item, key)}
                    </TableCell>
                  ))}
                </TableRow>
              )) : (<TableShimmer columns={columns.length + 1} />)}
            </TableBody>
          </Table>
        </>
      )}
    </PageLayout>
  );
};

export default SummaryReportPage;
