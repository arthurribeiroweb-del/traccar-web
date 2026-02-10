import { useMemo } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Box,
  Button,
  Chip,
  Collapse,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useTranslation } from '../../../common/components/LocalizationProvider';

dayjs.extend(relativeTime);

const DashboardHeader = ({
  header,
  from,
  to,
  period,
  onPeriodChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  onApplyCustom,
  onOpenFullReport,
}) => {
  const t = useTranslation();
  const theme = useTheme();

  const statusConfig = useMemo(() => ({
    online: { label: t('deviceStatusOnline') || 'Online', color: theme.palette.success.main },
    offline: { label: t('deviceStatusOffline') || 'Offline', color: theme.palette.grey[500] },
    unknown: { label: 'Sem sinal recente', color: theme.palette.warning.main },
  }), [t, theme]);

  const status = statusConfig[header?.status] || statusConfig.unknown;

  const lastUpdate = header?.lastUpdate
    ? dayjs(header.lastUpdate).fromNow()
    : '--';

  const periodLabel = (from && to)
    ? `${dayjs(from).format('DD/MM')}–${dayjs(to).format('DD/MM')}`
    : '--';

  const batteryLabel = header?.batteryLevel != null
    ? `Bateria ${Math.round(header.batteryLevel)}%`
    : null;

  const gpsLabel = header?.gpsSat != null
    ? `GPS ${header.gpsSat} sat`
    : (header?.gpsValid != null ? (header.gpsValid ? 'GPS ok' : 'GPS sem fix') : null);

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        backdropFilter: 'blur(10px)',
        backgroundColor: (theme) => alpha(theme.palette.background.default, 0.92),
        borderBottom: (theme) => `1px solid ${alpha(theme.palette.divider, 0.4)}`,
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems={{ xs: 'flex-start', md: 'center' }}
        justifyContent="space-between"
        sx={{ px: 2, py: 1.5 }}
      >
        <Stack spacing={0.6}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="h5" fontWeight={700}>
              {header?.deviceName || '--'}
            </Typography>
            {header?.plate && (
              <Chip
                label={header.plate}
                size="small"
                sx={{ borderRadius: 2, fontWeight: 600 }}
              />
            )}
            <Chip
              label={status.label}
              size="small"
              sx={{
                borderRadius: 2,
                fontWeight: 600,
                backgroundColor: status.color,
                color: theme.palette.getContrastText(status.color),
              }}
            />
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="caption" color="text.secondary">
              {`${t('deviceLastUpdate') || 'Última atualização'}: ${lastUpdate}`}
            </Typography>
            {batteryLabel && (
              <Chip
                label={batteryLabel}
                size="small"
                variant="outlined"
                sx={{ borderRadius: 2 }}
              />
            )}
            {gpsLabel && (
              <Chip
                label={gpsLabel}
                size="small"
                variant="outlined"
                sx={{ borderRadius: 2 }}
              />
            )}
          </Stack>
        </Stack>
        <Stack spacing={1} alignItems={{ xs: 'flex-start', md: 'flex-end' }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel>{t('reportPeriod') || 'Período'}</InputLabel>
              <Select
                label={t('reportPeriod') || 'Período'}
                value={period}
                onChange={(event) => onPeriodChange(event.target.value)}
              >
                <MenuItem value="today">{t('reportToday') || 'Hoje'}</MenuItem>
                <MenuItem value="yesterday">{t('reportYesterday') || 'Ontem'}</MenuItem>
                <MenuItem value="last7">7 dias</MenuItem>
                <MenuItem value="last30">30 dias</MenuItem>
                <MenuItem value="custom">{t('reportCustom') || 'Personalizado'}</MenuItem>
              </Select>
            </FormControl>
            {onOpenFullReport && (
              <Button variant="text" color="secondary" onClick={onOpenFullReport}>
                Ver relatório completo
              </Button>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {`${t('replaySummary') || 'Resumo do período'} ${periodLabel}`}
          </Typography>
        </Stack>
      </Stack>
      <Collapse in={period === 'custom'}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          sx={{ px: 2, pb: 1.5 }}
        >
          <TextField
            label={t('reportFrom') || 'De'}
            type="datetime-local"
            size="small"
            value={customFrom}
            onChange={(event) => onCustomFromChange(event.target.value)}
            fullWidth
          />
          <TextField
            label={t('reportTo') || 'Até'}
            type="datetime-local"
            size="small"
            value={customTo}
            onChange={(event) => onCustomToChange(event.target.value)}
            fullWidth
          />
          <Button variant="contained" color="secondary" onClick={onApplyCustom} sx={{ minWidth: 140 }}>
            Aplicar
          </Button>
        </Stack>
      </Collapse>
    </Box>
  );
};

export default DashboardHeader;
