import {
  useCallback,
  useMemo,
  useState,
} from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Fade,
  Skeleton,
  Typography,
  useTheme,
  alpha,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Grid } from '@mui/material';
import dayjs from 'dayjs';
import RouteIcon from '@mui/icons-material/Route';
import SpeedIcon from '@mui/icons-material/Speed';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CloseIcon from '@mui/icons-material/Close';
import ReportFilter from './components/ReportFilter';
import { useAttributePreference } from '../common/util/preferences';
import {
  formatDistance,
  formatSpeed,
  formatNumericHours,
  formatTime,
  formatVolume,
} from '../common/util/formatter';
import { useTranslation } from '../common/components/LocalizationProvider';
import PageLayout from '../common/components/PageLayout';
import ReportsMenu from './components/ReportsMenu';
import useReportStyles from './common/useReportStyles';
import { useCatch } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';

/** Dados de demonstração no mesmo formato da API /api/reports/summary */
const getDemoSummaryItems = () => {
  const now = dayjs();
  const devices = [
    { id: 1, name: 'Caminhão 01' },
    { id: 2, name: 'Van Logística' },
    { id: 3, name: 'Carro Executivo' },
  ];
  const items = [];
  devices.forEach((dev, di) => {
    for (let d = 6; d >= 0; d -= 1) {
      const day = now.subtract(d, 'day');
      const tripsPerDay = 1 + (di + d) % 3;
      for (let t = 0; t < tripsPerDay; t += 1) {
        const distM = 15000 + Math.round(Math.random() * 45000);
        const avgKnots = 12 + Math.round(Math.random() * 14);
        const maxKnots = avgKnots + 5 + Math.round(Math.random() * 8);
        const hoursMs = (1 + Math.random() * 3) * 3600000;
        const startOdo = 100000 + (d * 7 + t) * 5000 + di * 20000;
        const startTime = day.add(t * 4, 'hour').toISOString();
        const endTime = day.add(t * 4 + 2, 'hour').toISOString();
        items.push({
          deviceId: dev.id,
          startTime,
          endTime,
          distance: distM,
          averageSpeed: avgKnots,
          maxSpeed: maxKnots,
          engineHours: hoursMs,
          startHours: (d * 24 + t * 4) * 3600000,
          endHours: (d * 24 + t * 4 + 2) * 3600000,
          startOdometer: startOdo,
          endOdometer: startOdo + distM,
          spentFuel: Math.round((distM / 1000) * (5 + Math.random() * 3) * 10) / 10,
        });
      }
    }
  });
  return items.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
};

const useDashboardStyles = makeStyles()((theme) => ({
  root: {
    padding: theme.spacing(2, 2, 3),
    [theme.breakpoints.down('sm')]: {
      padding: theme.spacing(1.5),
    },
  },
  kpiCard: {
    height: '100%',
    borderRadius: theme.spacing(2),
    boxShadow: theme.shadows[2],
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: theme.shadows[4],
    },
    overflow: 'hidden',
    position: 'relative',
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 4,
      background: 'linear-gradient(90deg, transparent, var(--kpi-accent), transparent)',
      opacity: 0.8,
    },
  },
  kpiCardContent: {
    padding: theme.spacing(2, 2, 2.5),
    '&:last-child': { paddingBottom: theme.spacing(2.5) },
  },
  kpiIconWrap: {
    width: 48,
    height: 48,
    borderRadius: theme.spacing(1.5),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing(1.5),
  },
  kpiLabel: {
    color: theme.palette.text.secondary,
    fontSize: '0.875rem',
    fontWeight: 500,
    marginBottom: theme.spacing(0.5),
  },
  kpiValue: {
    fontSize: '1.75rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    [theme.breakpoints.down('sm')]: {
      fontSize: '1.5rem',
    },
  },
  chartCard: {
    borderRadius: theme.spacing(2),
    boxShadow: theme.shadows[2],
    overflow: 'hidden',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  chartCardContent: {
    flex: 1,
    minHeight: 280,
    padding: theme.spacing(2),
  },
  chartTitle: {
    marginBottom: theme.spacing(1.5),
    fontWeight: 600,
    fontSize: '1rem',
  },
  linkToReport: {
    marginTop: theme.spacing(2),
    alignSelf: 'flex-start',
  },
  emptyState: {
    padding: theme.spacing(4, 2),
    textAlign: 'center',
    color: theme.palette.text.secondary,
  },
  periodBadge: {
    marginBottom: theme.spacing(2),
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
  },
  peakDayChip: {
    marginTop: theme.spacing(1),
  },
  kpiSubtitle: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
    fontWeight: 400,
  },
}));

const KPI_ACCENTS = {
  distance: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)',
  trips: 'linear-gradient(135deg, #2e7d32 0%, #66bb6a 100%)',
  speed: 'linear-gradient(135deg, #ed6c02 0%, #ff9800 100%)',
  engine: 'linear-gradient(135deg, #7b1fa2 0%, #ba68c8 100%)',
  fuel: 'linear-gradient(135deg, #0288d1 0%, #03a9f4 100%)',
};

const MetricCard = ({
  label,
  value,
  subtitle,
  icon: Icon,
  accentKey,
  classes,
}) => (
  <Card
    className={classes.kpiCard}
    sx={{
      '--kpi-accent': accentKey ? undefined : 'transparent',
      '&::before': accentKey
        ? { background: KPI_ACCENTS[accentKey] || KPI_ACCENTS.distance }
        : {},
    }}
  >
    <CardContent className={classes.kpiCardContent}>
      {Icon && (
        <Box
          className={classes.kpiIconWrap}
          sx={{
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
            color: 'primary.main',
          }}
        >
          <Icon fontSize="medium" />
        </Box>
      )}
      <Typography className={classes.kpiLabel}>{label}</Typography>
      <Typography className={classes.kpiValue} component="div">
        {value}
      </Typography>
      {subtitle && (
        <Typography className={classes.kpiSubtitle}>{subtitle}</Typography>
      )}
    </CardContent>
  </Card>
);

const ReportsDashboardPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { classes: reportClasses } = useReportStyles();
  const { classes } = useDashboardStyles();
  const t = useTranslation();
  const theme = useTheme();

  const devices = useSelector((state) => state.devices.items);
  const administrator = useSelector((state) => state.session.user?.administrator);

  const distanceUnit = useAttributePreference('distanceUnit');
  const speedUnit = useAttributePreference('speedUnit');
  const volumeUnit = useAttributePreference('volumeUnit');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingError, setLoadingError] = useState(false);
  const [lastReportParams, setLastReportParams] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const loadReport = useCallback(async ({ deviceIds, groupIds, from, to }) => {
    const query = new URLSearchParams({ from, to, daily: 'false' });
    deviceIds.forEach((id) => query.append('deviceId', id));
    groupIds.forEach((id) => query.append('groupId', id));
    setLastReportParams({ deviceIds, groupIds, from, to });
    setLoadingError(false);
    setIsDemoMode(false);
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
  }, []);

  const onShow = useCatch(loadReport);

  const onRetry = useCatch(async () => {
    if (lastReportParams) await loadReport(lastReportParams);
  });

  const onLoadDemo = useCallback(() => {
    setLoadingError(false);
    setIsDemoMode(true);
    setItems(getDemoSummaryItems());
  }, []);

  const onClearDemo = useCallback(() => {
    setIsDemoMode(false);
    setItems([]);
  }, []);

  const kpis = useMemo(() => {
    if (!items.length) return null;
    const totalDistance = items.reduce((sum, i) => sum + (i.distance || 0), 0);
    const tripCount = items.length;
    const speeds = items.filter((i) => i.averageSpeed > 0).map((i) => i.averageSpeed);
    const avgSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const maxSpeed = Math.max(0, ...items.map((i) => i.maxSpeed || 0));
    const totalEngineHours = items.reduce((sum, i) => sum + (i.engineHours || 0), 0);
    const totalFuel = items.reduce((sum, i) => sum + (i.spentFuel || 0), 0);
    const firstDate = dayjs(items[0].startTime);
    const lastDate = dayjs(items[items.length - 1].startTime);
    const dayCount = Math.max(1, lastDate.diff(firstDate, 'day') + 1);
    const tripsPerDay = (tripCount / dayCount).toFixed(1);
    const avgDistancePerTrip = tripCount > 0 ? totalDistance / tripCount : 0;

    return {
      totalDistance,
      tripCount,
      avgSpeed,
      maxSpeed,
      totalEngineHours,
      totalFuel,
      dayCount,
      tripsPerDay,
      avgDistancePerTrip,
      periodFrom: firstDate,
      periodTo: lastDate,
    };
  }, [items]);

  const chartDataByDay = useMemo(() => {
    if (!items.length) return [];
    const byDay = {};
    items.forEach((item) => {
      const day = dayjs(item.startTime).format('YYYY-MM-DD');
      if (!byDay[day]) byDay[day] = { day, distance: 0, trips: 0 };
      byDay[day].distance += item.distance || 0;
      byDay[day].trips += 1;
    });
    return Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));
  }, [items]);

  const peakDay = useMemo(() => {
    if (!chartDataByDay.length) return null;
    const peak = chartDataByDay.reduce((best, d) => (d.distance > (best?.distance ?? 0) ? d : best), null);
    return peak;
  }, [chartDataByDay]);

  const periodLabel = useMemo(() => {
    if (lastReportParams?.from && lastReportParams?.to && !isDemoMode) {
      return `${dayjs(lastReportParams.from).format('DD/MM/YYYY')} – ${dayjs(lastReportParams.to).format('DD/MM/YYYY')}`;
    }
    if (kpis?.periodFrom && kpis?.periodTo) {
      return `${kpis.periodFrom.format('DD/MM/YYYY')} – ${kpis.periodTo.format('DD/MM/YYYY')}`;
    }
    return null;
  }, [lastReportParams, isDemoMode, kpis]);

  const demoDeviceNames = useMemo(() => ({
    1: 'Caminhão 01',
    2: 'Van Logística',
    3: 'Carro Executivo',
  }), []);

  const chartDataByDevice = useMemo(() => {
    if (!items.length) return [];
    const byDevice = {};
    items.forEach((item) => {
      const name = devices[item.deviceId]?.name ?? demoDeviceNames[item.deviceId] ?? `#${item.deviceId}`;
      if (!byDevice[name]) byDevice[name] = { name, distance: 0, trips: 0 };
      byDevice[name].distance += item.distance || 0;
      byDevice[name].trips += 1;
    });
    return Object.values(byDevice).sort((a, b) => b.distance - a.distance).slice(0, 8);
  }, [items, devices, demoDeviceNames]);

  const goToSummary = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    if (lastReportParams) {
      params.set('from', lastReportParams.from);
      params.set('to', lastReportParams.to);
      lastReportParams.deviceIds.forEach((id) => params.append('deviceId', id));
      lastReportParams.groupIds.forEach((id) => params.append('groupId', id));
    }
    navigate(`/reports/summary?${params.toString()}`);
  }, [navigate, searchParams, lastReportParams]);

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'reportDashboard']}>
      <div className={reportClasses.header}>
        <ReportFilter
          onShow={onShow}
          deviceType="multiple"
          loading={loading}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 2, pb: 1 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={onLoadDemo}
            disabled={loading}
          >
            {t('reportDashboardViewDemo')}
          </Button>
        </Box>
      </div>

      <div className={classes.root}>
        {isDemoMode && items.length > 0 && (
          <Alert
            severity="info"
            sx={{ mb: 2 }}
            action={
              <Button color="inherit" size="small" startIcon={<CloseIcon />} onClick={onClearDemo}>
                {t('reportDashboardClearDemo')}
              </Button>
            }
          >
            {t('reportDashboardDemoBanner')}
          </Alert>
        )}

        {loadingError && (
          <Alert
            severity="error"
            action={
              lastReportParams ? (
                <Button color="inherit" size="small" onClick={onRetry}>
                  {t('reportRetry')}
                </Button>
              ) : null
            }
            sx={{ mb: 2 }}
          >
            {t('reportEventsLoadError')}
          </Alert>
        )}

        {loading && (
          <Grid container spacing={2} sx={{ mb: 2 }}>
            {[1, 2, 3, 4].map((i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
                <Skeleton variant="rounded" height={120} />
              </Grid>
            ))}
          </Grid>
        )}

        {!loading && kpis && (
          <Fade in>
            <Box>
              {periodLabel && (
                <Box className={classes.periodBadge}>
                  <Chip
                    size="small"
                    label={t('reportDashboardPeriod')}
                    sx={{ fontWeight: 500 }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {periodLabel}
                  </Typography>
                </Box>
              )}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <MetricCard
                    label={t('sharedDistance')}
                    value={formatDistance(kpis.totalDistance, distanceUnit, t)}
                    subtitle={kpis.tripCount > 0 ? `${t('reportDashboardAvgPerTrip')} ${formatDistance(kpis.avgDistancePerTrip, distanceUnit, t)}` : undefined}
                    icon={RouteIcon}
                    accentKey="distance"
                    classes={classes}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <MetricCard
                    label={t('reportTrips')}
                    value={kpis.tripCount}
                    subtitle={kpis.dayCount > 0 ? `~${kpis.tripsPerDay} ${t('reportDashboardTripsPerDay')}` : undefined}
                    icon={CalendarTodayIcon}
                    accentKey="trips"
                    classes={classes}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <MetricCard
                    label={t('reportAverageSpeed')}
                    value={kpis.avgSpeed > 0 ? formatSpeed(kpis.avgSpeed, speedUnit, t) : '--'}
                    icon={SpeedIcon}
                    accentKey="speed"
                    classes={classes}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <MetricCard
                    label={t('reportEngineHours')}
                    value={kpis.totalEngineHours > 0 ? formatNumericHours(kpis.totalEngineHours, t) : '--'}
                    icon={AccessTimeIcon}
                    accentKey="engine"
                    classes={classes}
                  />
                </Grid>
                {administrator && kpis.totalFuel > 0 && (
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <MetricCard
                      label={t('reportSpentFuel')}
                      value={formatVolume(kpis.totalFuel, volumeUnit, t)}
                      icon={LocalGasStationIcon}
                      accentKey="fuel"
                      classes={classes}
                    />
                  </Grid>
                )}
              </Grid>
            </Box>
          </Fade>
        )}

        {!loading && items.length > 0 && (
          <Grid container spacing={2}>
            {chartDataByDay.length > 0 && (
              <Grid size={{ xs: 12, lg: 8 }}>
                <Card className={classes.chartCard}>
                  <CardContent className={classes.chartCardContent}>
                    <Typography className={classes.chartTitle}>
                      <TrendingUpIcon sx={{ verticalAlign: 'middle', mr: 0.5, fontSize: 20 }} />
                      {t('reportDashboardTrend')}
                    </Typography>
                    {peakDay && (
                      <Chip
                        size="small"
                        icon={<EmojiEventsIcon sx={{ fontSize: 16 }} />}
                        label={`${t('reportDashboardPeakDay')} ${dayjs(peakDay.day).format('DD/MM')} (${formatDistance(peakDay.distance, distanceUnit, t)})`}
                        className={classes.peakDayChip}
                        sx={{ alignSelf: 'flex-start' }}
                      />
                    )}
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart
                        data={chartDataByDay}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="dashboardArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={theme.palette.primary.main} stopOpacity={0.4} />
                            <stop offset="100%" stopColor={theme.palette.primary.main} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 12 }}
                          tickFormatter={(v) => dayjs(v).format('DD/MM')}
                        />
                        <YAxis
                          tick={{ fontSize: 12 }}
                          tickFormatter={(v) => (v / 1000).toFixed(0)}
                          label={{ value: t('sharedDistance'), angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
                        />
                        <Tooltip
                          content={({ active, payload, label: dayLabel }) => (active && payload?.length ? (
                            <Box sx={{ bgcolor: 'background.paper', p: 1.5, borderRadius: 1, boxShadow: 2, border: '1px solid', borderColor: 'divider' }}>
                              <Typography variant="caption" fontWeight={600}>{formatTime(dayLabel, 'date')}</Typography>
                              <Typography variant="body2">{formatDistance(payload[0].value, distanceUnit, t)}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {payload[0].payload.trips} {t('reportTrips').toLowerCase()}
                              </Typography>
                            </Box>
                          ) : null)}
                        />
                        <Area
                          type="monotone"
                          dataKey="distance"
                          stroke={theme.palette.primary.main}
                          strokeWidth={2}
                          fill="url(#dashboardArea)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                    <Button
                      className={classes.linkToReport}
                      size="small"
                      startIcon={<RouteIcon />}
                      onClick={goToSummary}
                    >
                      {t('reportDashboardViewSummary')}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            )}
            {chartDataByDevice.length > 0 && (
              <Grid size={{ xs: 12, lg: chartDataByDay.length > 0 ? 4 : 12 }}>
                <Card className={classes.chartCard}>
                  <CardContent className={classes.chartCardContent}>
                    <Typography className={classes.chartTitle}>
                      {t('reportDashboardByDevice')}
                    </Typography>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={chartDataByDevice}
                        layout="vertical"
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                        <XAxis type="number" tick={{ fontSize: 12 }} hide />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={90}
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip
                          content={({ active, payload }) => (active && payload?.length ? (
                            <Box sx={{ bgcolor: 'background.paper', p: 1.5, borderRadius: 1, boxShadow: 2, border: '1px solid', borderColor: 'divider' }}>
                              <Typography variant="body2" fontWeight={600}>{payload[0].payload.name}</Typography>
                              <Typography variant="body2">{formatDistance(payload[0].value, distanceUnit, t)}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {payload[0].payload.trips} {t('reportTrips').toLowerCase()}
                              </Typography>
                            </Box>
                          ) : null)}
                        />
                        <Bar
                          dataKey="distance"
                          fill={theme.palette.primary.main}
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                    <Button
                      className={classes.linkToReport}
                      size="small"
                      startIcon={<RouteIcon />}
                      onClick={goToSummary}
                    >
                      {t('reportDashboardViewSummary')}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>
        )}

        {!loading && !loadingError && items.length === 0 && lastReportParams && (
          <Box className={classes.emptyState}>
            <Typography variant="body1">{t('sharedNoData')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t('reportNoEventsHint')}
            </Typography>
          </Box>
        )}

        {!loading && !lastReportParams && !loadingError && items.length === 0 && (
          <Fade in>
            <Box className={classes.emptyState}>
              <DashboardIcon sx={{ fontSize: 56, color: 'action.disabled', mb: 1 }} />
              <Typography variant="body1">{t('reportDashboardSelectPeriod')}</Typography>
              <Button variant="contained" sx={{ mt: 2 }} onClick={onLoadDemo} startIcon={<TrendingUpIcon />}>
                {t('reportDashboardViewDemo')}
              </Button>
            </Box>
          </Fade>
        )}
      </div>
    </PageLayout>
  );
};

export default ReportsDashboardPage;
