export const OIL_NEAR_KM_THRESHOLD = 500;
export const OIL_NEAR_DAYS_THRESHOLD = 14;
export const OIL_SAVE_TIMEOUT_MS = 10000;
export const OIL_SAVE_RETRY_DELAY_MS = 500;
export const OIL_SAVE_MAX_ATTEMPTS = 2;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toInteger = (value) => {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.round(parsed);
};

export const parseIntegerInput = (value) => {
  const digits = `${value || ''}`.replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  return Number(digits);
};

export const formatOdometer = (value) => {
  const parsed = toInteger(value);
  if (parsed == null) {
    return '-';
  }
  return parsed.toLocaleString('pt-BR');
};

export const formatDaysLabel = (days) => {
  if (!Number.isFinite(days)) {
    return '-';
  }
  if (days <= 0) {
    return '0';
  }
  return String(days);
};

export const normalizeDate = (value) => {
  if (!value) {
    return null;
  }
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

export const formatDateLabel = (value) => {
  const normalized = normalizeDate(value);
  if (!normalized) {
    return '-';
  }
  return normalized.toLocaleDateString('pt-BR');
};

export const dateToInputValue = (value) => {
  const normalized = normalizeDate(value);
  if (!normalized) {
    return '';
  }
  const year = normalized.getFullYear();
  const month = `${normalized.getMonth() + 1}`.padStart(2, '0');
  const day = `${normalized.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const addMonths = (date, months) => {
  const normalized = normalizeDate(date);
  if (!normalized || !Number.isFinite(months)) {
    return null;
  }
  const result = new Date(normalized.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
};

export const diffInDays = (fromDate, toDate) => {
  const from = normalizeDate(fromDate);
  const to = normalizeDate(toDate);
  if (!from || !to) {
    return null;
  }
  return Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY);
};

export const getOilConfig = (device) => device?.attributes?.maintenance?.oil || null;

const toKmFromMeters = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed / 1000);
};

export const getPositionDistanceKm = (position) => {
  const odometerKm = toKmFromMeters(position?.attributes?.odometer);
  const totalDistanceKm = toKmFromMeters(position?.attributes?.totalDistance);
  if (odometerKm == null) {
    return totalDistanceKm;
  }
  if (totalDistanceKm == null) {
    return odometerKm;
  }
  return Math.max(odometerKm, totalDistanceKm);
};

export const deriveCurrentOdometerKm = (oilConfig, position) => {
  const configuredKm = toInteger(oilConfig?.odometerCurrent);
  const positionKm = getPositionDistanceKm(position);
  const baselineDistanceKm = toInteger(oilConfig?.baselineDistanceKm);
  const baselineOdometerKm = toInteger(oilConfig?.baselineOdometerKm);
  const baselineKm = (
    positionKm != null
    && baselineDistanceKm != null
    && baselineOdometerKm != null
  )
    ? baselineOdometerKm + Math.max(0, positionKm - baselineDistanceKm)
    : null;

  if (configuredKm == null) {
    if (baselineKm == null) {
      return positionKm;
    }
    return positionKm == null ? baselineKm : Math.max(positionKm, baselineKm);
  }

  let result = configuredKm;
  if (positionKm != null) {
    result = Math.max(result, positionKm);
  }
  if (baselineKm != null) {
    result = Math.max(result, baselineKm);
  }
  return result;
};

export const computeOilStatus = (oilConfig, todayInput = new Date()) => {
  const today = normalizeDate(todayInput) || new Date();
  const enabled = oilConfig?.enabled !== false;
  const odometerCurrent = toInteger(oilConfig?.odometerCurrent);
  const lastServiceOdometer = toInteger(oilConfig?.lastServiceOdometer);
  const intervalKm = toInteger(oilConfig?.intervalKm);
  const intervalMonths = toInteger(oilConfig?.intervalMonths);
  const lastServiceDate = normalizeDate(oilConfig?.lastServiceDate);

  const hasCurrentOdometer = odometerCurrent != null && odometerCurrent >= 0;
  const hasBaseKm = lastServiceOdometer != null && lastServiceOdometer >= 0;
  const hasBaseDate = Boolean(lastServiceDate);
  const hasKmRule = intervalKm != null && intervalKm > 0;
  const hasDateRule = intervalMonths != null && intervalMonths > 0;

  const nextKm = hasBaseKm && hasKmRule ? lastServiceOdometer + intervalKm : null;
  const nextDate = hasBaseDate && hasDateRule ? addMonths(lastServiceDate, intervalMonths) : null;
  const remainingKm = nextKm != null && hasCurrentOdometer ? nextKm - odometerCurrent : null;
  const remainingDays = nextDate ? diffInDays(today, nextDate) : null;

  if (!enabled) {
    return {
      state: 'disabled',
      nextKm,
      nextDate,
      remainingKm,
      remainingDays,
    };
  }

  if (!hasCurrentOdometer || (!hasBaseKm && !hasBaseDate) || (!nextKm && !nextDate)) {
    return {
      state: 'incomplete',
      nextKm,
      nextDate,
      remainingKm,
      remainingDays,
    };
  }

  const overdueByKm = remainingKm != null && remainingKm <= 0;
  const overdueByDate = remainingDays != null && remainingDays <= 0;

  if (overdueByKm || overdueByDate) {
    return {
      state: 'overdue',
      nextKm,
      nextDate,
      remainingKm,
      remainingDays,
    };
  }

  const nearByKm = remainingKm != null && remainingKm > 0 && remainingKm <= OIL_NEAR_KM_THRESHOLD;
  const nearByDate = remainingDays != null && remainingDays > 0 && remainingDays <= OIL_NEAR_DAYS_THRESHOLD;

  if (nearByKm || nearByDate) {
    return {
      state: 'near',
      nextKm,
      nextDate,
      remainingKm,
      remainingDays,
    };
  }

  return {
    state: 'ok',
    nextKm,
    nextDate,
    remainingKm,
    remainingDays,
  };
};

export const getPlanLabel = (oilConfig) => {
  const intervalKm = toInteger(oilConfig?.intervalKm);
  const intervalMonths = toInteger(oilConfig?.intervalMonths);
  if (intervalKm != null && intervalMonths != null) {
    return `${formatOdometer(intervalKm)} km ou ${intervalMonths} meses`;
  }
  if (intervalKm != null) {
    return `${formatOdometer(intervalKm)} km`;
  }
  if (intervalMonths != null) {
    return `${intervalMonths} meses`;
  }
  return '-';
};
