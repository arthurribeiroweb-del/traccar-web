import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import {
  computeOilStatus,
  formatDateLabel,
  formatDaysLabel,
  formatOdometer,
  getPlanLabel,
} from '../../common/util/maintenance';
import { useTranslation } from '../../common/components/LocalizationProvider';

const statusMeta = (state, t) => {
  switch (state) {
    case 'ok':
      return { color: 'success', label: t('maintenanceStatusOk') };
    case 'near':
      return { color: 'warning', label: t('maintenanceStatusNear') };
    case 'overdue':
      return { color: 'error', label: t('maintenanceStatusOverdue') };
    case 'disabled':
      return { color: 'default', label: t('sharedDisabled') };
    default:
      return { color: 'default', label: t('maintenanceStatusIncomplete') };
  }
};

const OilChangeCard = ({
  oilConfig,
  onConfigure,
  onEdit,
  onMarkDone,
  onToggleEnabled,
  loading,
}) => {
  const t = useTranslation();
  const status = computeOilStatus(oilConfig);
  const statusInfo = statusMeta(status.state, t);
  const isConfigured = Boolean(oilConfig);
  const isEnabled = oilConfig?.enabled !== false;
  const remainingKmValue = status.remainingKm != null ? Math.max(status.remainingKm, 0) : null;

  const mainActionLabel = (() => {
    if (!isConfigured || !isEnabled) {
      return t('reportConfigure');
    }
    if (status.state === 'incomplete') {
      return t('maintenanceCompleteConfig');
    }
    return t('maintenanceMarkDone');
  })();

  const handleMainAction = () => {
    if (!isConfigured || !isEnabled || status.state === 'incomplete') {
      onConfigure();
      return;
    }
    onMarkDone();
  };

  const nextByKmLabel = status.nextKm != null
    ? `${formatOdometer(status.nextKm)} km (${t('maintenanceKmRemaining').replace('{{value}}', formatOdometer(remainingKmValue))})`
    : '-';
  const nextByDateLabel = status.nextDate
    ? `${formatDateLabel(status.nextDate)} (${t('maintenanceDaysRemaining').replace('{{value}}', formatDaysLabel(status.remainingDays))})`
    : '-';

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
          <Typography variant="h6">{t('maintenanceOilTitle')}</Typography>
          <Chip
            label={statusInfo.label}
            color={statusInfo.color}
            size="small"
          />
        </Stack>

        <Stack spacing={0.75} sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {`${t('maintenanceCurrentKm')}: ${formatOdometer(oilConfig?.odometerCurrent)}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {`${t('maintenanceLastChange')}: ${formatOdometer(oilConfig?.lastServiceOdometer)} km • ${formatDateLabel(oilConfig?.lastServiceDate)}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {`${t('maintenancePlan')}: ${getPlanLabel(oilConfig)}`}
          </Typography>
        </Stack>

        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2">{t('maintenanceNextByKm')}</Typography>
          <Typography variant="body2" color="text.secondary">{nextByKmLabel}</Typography>
        </Box>
        <Box sx={{ mt: 1 }}>
          <Typography variant="subtitle2">{t('maintenanceNextByDate')}</Typography>
          <Typography variant="body2" color="text.secondary">{nextByDateLabel}</Typography>
        </Box>
      </CardContent>

      <CardActions sx={{ px: 2, pb: 2, display: 'block' }}>
        <Button
          fullWidth
          variant="contained"
          onClick={handleMainAction}
          disabled={loading}
          aria-label={t('maintenanceAriaMainAction')}
          sx={{ minHeight: 44 }}
        >
          {mainActionLabel}
        </Button>
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button
            size="small"
            onClick={onEdit}
            disabled={loading}
            aria-label={t('maintenanceAriaEdit')}
          >
            {t('sharedEdit')}
          </Button>
          <Button
            size="small"
            onClick={onToggleEnabled}
            disabled={loading || !isConfigured}
          >
            {isEnabled ? t('maintenanceDisableReminders') : t('maintenanceEnableReminders')}
          </Button>
        </Stack>
      </CardActions>
    </Card>
  );
};

export default OilChangeCard;
