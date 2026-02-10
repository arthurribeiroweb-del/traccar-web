import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Box,
  Grid,
} from '@mui/material';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAttributePreference } from '../common/util/preferences';
import { useReportsAccess } from '../common/util/permissions';
import PageLayout from '../common/components/PageLayout';
import ReportsMenu from './components/ReportsMenu';
import DashboardHeader from './components/dashboard/DashboardHeader';
import KpiHeroCard from './components/dashboard/KpiHeroCard';
import TimelineCard from './components/dashboard/TimelineCard';
import ActivityCard from './components/dashboard/ActivityCard';
import SafetyCard from './components/dashboard/SafetyCard';
import FavoritePlacesCard from './components/dashboard/FavoritePlacesCard';
import DashboardSkeleton from './components/dashboard/DashboardSkeleton';
import InlineError from '../common/components/InlineError';
import EmptyState from '../common/components/EmptyState';
import useReportsDashboard from '../hooks/useReportsDashboard';

const getRangeForPeriod = (period) => {
  switch (period) {
    case 'today':
      return { from: dayjs().startOf('day'), to: dayjs().endOf('day') };
    case 'yesterday':
      return { from: dayjs().subtract(1, 'day').startOf('day'), to: dayjs().subtract(1, 'day').endOf('day') };
    case 'last7':
      return { from: dayjs().subtract(6, 'day').startOf('day'), to: dayjs().endOf('day') };
    case 'last30':
      return { from: dayjs().subtract(29, 'day').startOf('day'), to: dayjs().endOf('day') };
    default:
      return null;
  }
};

const ReportsDashboardPage = () => {
  const t = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const devices = useSelector((state) => state.devices.items);
  const selectedId = useSelector((state) => state.devices.selectedId);

  const distanceUnit = useAttributePreference('distanceUnit');
  const speedUnit = useAttributePreference('speedUnit');
  const reportsAccess = useReportsAccess();

  const deviceParam = searchParams.getAll('deviceId')[0];
  const normalizedParamId = deviceParam ? Number(deviceParam) : null;

  const fallbackId = useMemo(() => {
    if (selectedId != null) return selectedId;
    const deviceIds = Object.keys(devices);
    return deviceIds.length === 1 ? Number(deviceIds[0]) : null;
  }, [devices, selectedId]);

  const deviceId = normalizedParamId || fallbackId;

  const [period, setPeriod] = useState(searchParams.get('period') || 'today');
  const [customFrom, setCustomFrom] = useState(
    searchParams.get('from')
      ? dayjs(searchParams.get('from')).format('YYYY-MM-DDTHH:mm')
      : dayjs().subtract(1, 'day').startOf('day').format('YYYY-MM-DDTHH:mm'),
  );
  const [customTo, setCustomTo] = useState(
    searchParams.get('to')
      ? dayjs(searchParams.get('to')).format('YYYY-MM-DDTHH:mm')
      : dayjs().endOf('day').format('YYYY-MM-DDTHH:mm'),
  );

  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const updateSearchParams = useCallback((nextPeriod, range) => {
    const params = new URLSearchParams(searchParams);
    if (deviceId) {
      params.set('deviceId', deviceId);
    }
    params.set('period', nextPeriod);
    if (range) {
      params.set('from', range.from.toISOString());
      params.set('to', range.to.toISOString());
    }
    setSearchParams(params, { replace: true });
  }, [deviceId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!from || !to) {
      const range = getRangeForPeriod(period);
      if (range) {
        updateSearchParams(period, range);
      }
    }
  }, [from, to, period, updateSearchParams]);

  useEffect(() => {
    if (!deviceId) return;
    if (!deviceParam || searchParams.getAll('deviceId').length > 1) {
      const params = new URLSearchParams(searchParams);
      params.set('deviceId', deviceId);
      setSearchParams(params, { replace: true });
    }
  }, [deviceId, deviceParam, searchParams, setSearchParams]);

  const onPeriodChange = useCallback((nextPeriod) => {
    setPeriod(nextPeriod);
    const range = getRangeForPeriod(nextPeriod);
    if (range) {
      updateSearchParams(nextPeriod, range);
    }
  }, [updateSearchParams]);

  const onApplyCustom = () => {
    const range = {
      from: dayjs(customFrom, 'YYYY-MM-DDTHH:mm'),
      to: dayjs(customTo, 'YYYY-MM-DDTHH:mm'),
    };
    updateSearchParams('custom', range);
  };

  const {
    status,
    refetch,
    header,
    kpis,
    timelineItems,
    activitySeries,
    safetyEvents,
    favoritePlaces,
    movementTotals,
    stopsDerived,
  } = useReportsDashboard({ deviceId, from, to });

  const navigateToReport = (path) => {
    const params = new URLSearchParams();
    if (deviceId) params.set('deviceId', deviceId);
    if (from && to) {
      params.set('from', from);
      params.set('to', to);
    }
    navigate({ pathname: path, search: params.toString() });
  };

  const emptyState = useMemo(() => {
    if (!deviceId) {
      return {
        title: 'Selecione um veículo para ver o dashboard.',
        actionLabel: null,
        onAction: null,
      };
    }
    return {
      title: 'Sem atividade no período.',
      actionLabel: 'Trocar período',
      onAction: () => onPeriodChange('last7'),
    };
  }, [deviceId, onPeriodChange]);

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'reportDashboard']}>
      <DashboardHeader
        header={header}
        from={from}
        to={to}
        period={period}
        onPeriodChange={onPeriodChange}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        onApplyCustom={onApplyCustom}
        onOpenFullReport={reportsAccess ? () => navigateToReport('/reports/combined') : null}
      />
      <Box sx={{ p: 2 }}>
        {status === 'loading' && <DashboardSkeleton />}
        {status === 'error' && (
          <InlineError
            message="Não foi possível carregar o dashboard."
            actionLabel={t('reportRetry') || 'Tentar novamente'}
            onAction={refetch}
          />
        )}
        {status === 'empty' && (
          <EmptyState
            title={emptyState.title}
            actionLabel={emptyState.actionLabel}
            onAction={emptyState.onAction}
          />
        )}
        {status === 'success' && (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <KpiHeroCard
                kpis={kpis}
                distanceUnit={distanceUnit}
                speedUnit={speedUnit}
                t={t}
              />
            </Grid>
            <Grid item xs={12} md={8}>
              <TimelineCard
                items={timelineItems}
                period={period}
                to={to}
                distanceUnit={distanceUnit}
                t={t}
                onOpenTrips={() => navigateToReport('/reports/trips')}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <ActivityCard
                series={activitySeries}
                movementTotals={movementTotals}
                distanceUnit={distanceUnit}
                t={t}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <SafetyCard
                events={safetyEvents}
                t={t}
                onOpenEvents={() => navigateToReport('/reports/events')}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FavoritePlacesCard
                places={favoritePlaces}
                stopsDerived={stopsDerived}
                t={t}
              />
            </Grid>
          </Grid>
        )}
      </Box>
    </PageLayout>
  );
};

export default ReportsDashboardPage;
