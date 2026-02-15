export const DEFAULT_INTERVAL_KM = 8000;
export const ALT_INTERVAL_KM = 10000;
export const DEFAULT_REMINDER_KM = 1000;

export const computeTireRotationSchedule = (config, currentOdometerKm) => {
  const interval = Number(config?.intervalKm) > 0 ? Number(config.intervalKm) : DEFAULT_INTERVAL_KM;
  const reminder = Number(config?.reminderThresholdKm) > 0
    ? Number(config.reminderThresholdKm)
    : DEFAULT_REMINDER_KM;
  const lastKm = Number(config?.lastRotationOdometerKm);
  if (!Number.isFinite(lastKm) || lastKm <= 0 || !Number.isFinite(currentOdometerKm)) {
    return null;
  }
  const nextDueOdometerKm = lastKm + interval;
  const kmRemaining = nextDueOdometerKm - currentOdometerKm;
  let status = 'OK';
  if (kmRemaining <= 0) {
    status = 'OVERDUE';
  } else if (kmRemaining <= reminder) {
    status = 'DUE_SOON';
  }
  return { nextDueOdometerKm, kmRemaining, status, intervalKm: interval, reminderThresholdKm: reminder };
};

export const formatTireRotationStatusLabel = (t, status) => {
  if (status === 'OVERDUE') return t('sharedOverdue') || 'Atrasado';
  if (status === 'DUE_SOON') return t('sharedNear') || 'Em breve';
  return t('maintenanceStatusOk') || 'OK';
};
