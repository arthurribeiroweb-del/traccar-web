import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Alert,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useTranslation } from '../common/components/LocalizationProvider';
import PageLayout from '../common/components/PageLayout';
import SettingsMenu from './components/SettingsMenu';
import useSettingsStyles from './common/useSettingsStyles';
import {
  computeOilStatus,
  deriveCurrentOdometerKm,
  formatDateLabel,
  formatOdometer,
  getPositionDistanceKm,
  getOilConfig,
  OIL_SAVE_MAX_ATTEMPTS,
  OIL_SAVE_RETRY_DELAY_MS,
  OIL_SAVE_TIMEOUT_MS,
} from '../common/util/maintenance';
import { getDeviceDisplayName } from '../common/util/deviceUtils';
import OilChangeCard from './maintenance/OilChangeCard';
import OilChangeWizard from './maintenance/OilChangeWizard';
import { devicesActions } from '../store';

const wait = (ms) => new Promise((resolve) => { window.setTimeout(resolve, ms); });

const shouldRetry = (error) => {
  if (error?.retryable === false) {
    return false;
  }
  const message = `${error?.message || ''}`;
  return error?.name === 'AbortError'
    || message.includes('Failed to fetch')
    || message.includes('NetworkError')
    || message.includes('Load failed');
};

const putDeviceWithTimeout = async (device) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), OIL_SAVE_TIMEOUT_MS);

  try {
    const response = await fetch(`/api/devices/${device.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(device),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(errorText || 'HTTP error');
      error.retryable = false;
      throw error;
    }

    try {
      return await response.json();
    } catch {
      return device;
    }
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const putDeviceWithRetry = async (device) => {
  let lastError;
  for (let attempt = 1; attempt <= OIL_SAVE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await putDeviceWithTimeout(device);
    } catch (error) {
      lastError = error;
      if (attempt >= OIL_SAVE_MAX_ATTEMPTS || !shouldRetry(error)) {
        throw error;
      }
      await wait(OIL_SAVE_RETRY_DELAY_MS);
    }
  }
  throw lastError;
};

const VehicleMaintenancePage = () => {
  const { classes } = useSettingsStyles();
  const t = useTranslation();
  const dispatch = useDispatch();
  const devicesMap = useSelector((state) => state.devices.items || {});
  const livePositions = useSelector((state) => state.session.positions || {});

  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [deviceOverrides, setDeviceOverrides] = useState({});
  const [wizardOpen, setWizardOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({
    open: false,
    severity: 'success',
    message: '',
    retry: false,
  });
  const retryActionRef = useRef(null);

  const baseDevices = useMemo(
    () => Object.values(devicesMap).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [devicesMap],
  );

  const devices = useMemo(
    () => baseDevices.map((device) => deviceOverrides[device.id] || device),
    [baseDevices, deviceOverrides],
  );

  useEffect(() => {
    if (!devices.length) {
      setSelectedDeviceId(null);
      return;
    }

    const exists = devices.some((device) => String(device.id) === String(selectedDeviceId));
    if (exists) {
      return;
    }

    if (devices.length === 1) {
      setSelectedDeviceId(devices[0].id);
      return;
    }

    setSelectedDeviceId(null);
  }, [devices, selectedDeviceId]);

  const selectedDevice = useMemo(
    () => devices.find((device) => String(device.id) === String(selectedDeviceId)) || null,
    [devices, selectedDeviceId],
  );

  const oilConfig = useMemo(() => getOilConfig(selectedDevice), [selectedDevice]);
  const selectedLivePosition = useMemo(
    () => (selectedDevice ? livePositions[selectedDevice.id] || null : null),
    [livePositions, selectedDevice],
  );
  const effectiveCurrentKm = useMemo(
    () => deriveCurrentOdometerKm(oilConfig, selectedLivePosition),
    [oilConfig, selectedLivePosition],
  );
  const effectiveOilConfig = useMemo(() => {
    if (!oilConfig) {
      return oilConfig;
    }
    return {
      ...oilConfig,
      odometerCurrent: effectiveCurrentKm ?? oilConfig.odometerCurrent,
    };
  }, [effectiveCurrentKm, oilConfig]);
  const oilStatus = useMemo(() => computeOilStatus(effectiveOilConfig), [effectiveOilConfig]);

  const showError = useCallback((message, retryHandler = null) => {
    retryActionRef.current = retryHandler;
    setToast({
      open: true,
      severity: 'error',
      message,
      retry: Boolean(retryHandler),
    });
  }, []);

  const showSuccess = useCallback((message) => {
    retryActionRef.current = null;
    setToast({
      open: true,
      severity: 'success',
      message,
      retry: false,
    });
  }, []);

  const saveOilConfig = useCallback(async (nextOilConfig, successMessage) => {
    if (!selectedDevice) {
      throw new Error(t('maintenanceVehicleRequired'));
    }

    const previousDevice = selectedDevice;

    // Build the device with the intended oil config
    const buildDeviceWithOil = (base, oilData) => ({
      ...base,
      attributes: {
        ...(base.attributes || {}),
        maintenance: {
          ...(base.attributes?.maintenance || {}),
          oil: oilData,
        },
      },
    });

    const attachBaseline = (oilData) => {
      const distanceKm = getPositionDistanceKm(selectedLivePosition);
      const currentKm = deriveCurrentOdometerKm(oilData, selectedLivePosition);
      if (distanceKm == null || currentKm == null) {
        return oilData;
      }
      return {
        ...oilData,
        odometerCurrent: currentKm,
        baselineDistanceKm: distanceKm,
        baselineOdometerKm: currentKm,
      };
    };

    const normalizedOilConfig = attachBaseline(nextOilConfig);
    const nextDevice = buildDeviceWithOil(selectedDevice, normalizedOilConfig);

    setLoading(true);
    setDeviceOverrides((prev) => ({ ...prev, [selectedDevice.id]: nextDevice }));

    try {
      const persisted = await putDeviceWithRetry(nextDevice);
      // CRITICAL: Always merge our oil config into the resolved device.
      // The API response may not preserve nested attributes, or may return
      // stale data from before the save propagated.
      const resolvedDevice = buildDeviceWithOil(persisted || nextDevice, normalizedOilConfig);
      setDeviceOverrides((prev) => ({ ...prev, [selectedDevice.id]: resolvedDevice }));
      dispatch(devicesActions.update([resolvedDevice]));
      showSuccess(successMessage);
      return resolvedDevice;
    } catch (error) {
      setDeviceOverrides((prev) => ({ ...prev, [selectedDevice.id]: previousDevice }));
      throw error;
    } finally {
      setLoading(false);
    }
  }, [selectedDevice, dispatch, selectedLivePosition, showSuccess, t]);

  const handleWizardSave = useCallback(async (nextOilConfig) => {
    try {
      console.debug('[OilChange] save', {
        selectedVehicleId: selectedDevice?.id ?? null,
        payload: nextOilConfig,
      });
      await saveOilConfig(nextOilConfig, t('maintenanceSaved'));
    } catch {
      throw new Error(t('maintenanceSaveError'));
    }
  }, [saveOilConfig, selectedDevice, t]);

  const handleToggleEnabled = useCallback(async () => {
    if (!effectiveOilConfig) {
      return;
    }

    const nextEnabled = !(effectiveOilConfig?.enabled !== false);
    const nextOilConfig = {
      ...effectiveOilConfig,
      enabled: nextEnabled,
      updatedAt: new Date().toISOString(),
    };

    try {
      await saveOilConfig(
        nextOilConfig,
        nextEnabled ? t('maintenanceRemindersEnabled') : t('maintenanceRemindersDisabled'),
      );
    } catch {
      showError(t('maintenanceSaveError'), handleToggleEnabled);
    }
  }, [effectiveOilConfig, saveOilConfig, showError, t]);

  const handleConfirmMarkDone = useCallback(async () => {
    if (!effectiveOilConfig) {
      return;
    }

    const odometerCurrent = Number(effectiveOilConfig.odometerCurrent);
    if (!Number.isFinite(odometerCurrent)) {
      showError(t('maintenanceCurrentKmRequired'));
      return;
    }

    const now = new Date();
    const nextOilConfig = {
      ...effectiveOilConfig,
      enabled: true,
      lastServiceOdometer: odometerCurrent,
      lastServiceDate: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const statusAfterDone = computeOilStatus(nextOilConfig, now);
    const successMessage = statusAfterDone.nextKm != null
      ? t('maintenanceMarkedDoneWithKm').replace('{{km}}', formatOdometer(statusAfterDone.nextKm))
      : t('maintenanceMarkedDone');

    try {
      await saveOilConfig(nextOilConfig, successMessage);
      setConfirmOpen(false);
    } catch {
      showError(t('maintenanceSaveError'), handleConfirmMarkDone);
    }
  }, [effectiveOilConfig, saveOilConfig, showError, t]);

  return (
    <PageLayout menu={<SettingsMenu />} breadcrumbs={['settingsTitle', 'maintenanceMenuTitle']}>
      <Container maxWidth="md" className={classes.container}>
        <Stack spacing={2}>
          {!devices.length && (
            <Alert severity="info">{t('maintenanceNoVehicles')}</Alert>
          )}

          {devices.length > 0 && (
            <TextField
              select
              label={`${t('maintenanceVehicleLabel')} *`}
              value={selectedDeviceId || ''}
              onChange={(event) => setSelectedDeviceId(event.target.value)}
            >
              {devices.length > 1 && (
                <MenuItem value="">
                  {t('maintenanceVehicleRequired')}
                </MenuItem>
              )}
              {devices.map((device) => (
                <MenuItem key={device.id} value={device.id}>
                  {getDeviceDisplayName(device) || device.name || `${device.id}`}
                </MenuItem>
              ))}
            </TextField>
          )}

          {!selectedDevice && devices.length > 1 && (
            <Alert severity="info">{t('maintenanceVehicleRequired')}</Alert>
          )}

          {selectedDevice && (
            <>
              <OilChangeCard
                oilConfig={effectiveOilConfig}
                onConfigure={() => setWizardOpen(true)}
                onEdit={() => setWizardOpen(true)}
                onMarkDone={() => setConfirmOpen(true)}
                onToggleEnabled={handleToggleEnabled}
                loading={loading}
              />

              {oilStatus.state === 'incomplete' && (
                <Alert severity="warning">
                  {t('maintenanceIncompleteHint')}
                </Alert>
              )}
            </>
          )}
        </Stack>
      </Container>

      <OilChangeWizard
        open={wizardOpen}
        device={selectedDevice}
        onClose={() => setWizardOpen(false)}
        onSave={handleWizardSave}
      />

      <Dialog open={confirmOpen} onClose={loading ? undefined : () => setConfirmOpen(false)}>
        <DialogTitle>{t('maintenanceConfirmTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t('maintenanceConfirmText')
              .replace('{{km}}', formatOdometer(effectiveOilConfig?.odometerCurrent))
              .replace('{{date}}', formatDateLabel(new Date()))}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={loading}>{t('sharedCancel')}</Button>
          <Button variant="contained" onClick={handleConfirmMarkDone} disabled={loading}>
            {t('sharedAccept')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={toast.retry ? null : 4000}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        action={toast.retry ? (
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              const handler = retryActionRef.current;
              if (typeof handler === 'function') {
                handler();
              }
            }}
          >
            {t('notificationRetry')}
          </Button>
        ) : null}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </PageLayout>
  );
};

export default VehicleMaintenancePage;
