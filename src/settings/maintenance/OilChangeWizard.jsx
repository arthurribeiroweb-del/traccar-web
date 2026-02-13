import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import {
  dateToInputValue,
  formatOdometer,
  getOilConfig,
  parseIntegerInput,
} from '../../common/util/maintenance';
import { useTranslation } from '../../common/components/LocalizationProvider';

const PRESET_OPTIONS = {
  basic: { intervalKm: 5000, intervalMonths: 6 },
  normal: { intervalKm: 10000, intervalMonths: 12 },
  severe: { intervalKm: 5000, intervalMonths: 4 },
  custom: { intervalKm: null, intervalMonths: null },
};

const resolvePresetKey = (intervalKm, intervalMonths) => {
  if (intervalKm === 5000 && intervalMonths === 6) return 'basic';
  if (intervalKm === 10000 && intervalMonths === 12) return 'normal';
  if (intervalKm === 5000 && intervalMonths === 4) return 'severe';
  return 'custom';
};

const OilChangeWizard = ({
  open,
  device,
  onClose,
  onSave,
}) => {
  const t = useTranslation();
  const [activeStep, setActiveStep] = useState(0);
  const [odometerCurrent, setOdometerCurrent] = useState(null);

  // 'none' (not selected), 'current' (just changed), 'previous' (changed before)
  const [changeMode, setChangeMode] = useState('none');

  const [lastServiceOdometer, setLastServiceOdometer] = useState(null);
  const [lastServiceDate, setLastServiceDate] = useState('');

  const [planPreset, setPlanPreset] = useState('basic');
  const [intervalKm, setIntervalKm] = useState(5000);
  const [intervalMonths, setIntervalMonths] = useState(6);

  const [stepError, setStepError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [retryPayload, setRetryPayload] = useState(null);

  const existingOil = useMemo(() => getOilConfig(device), [device]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextCurrent = existingOil?.odometerCurrent != null ? Number(existingOil.odometerCurrent) : null;
    const nextLastKm = existingOil?.lastServiceOdometer != null ? Number(existingOil.lastServiceOdometer) : null;
    const nextLastDate = dateToInputValue(existingOil?.lastServiceDate);
    const nextIntervalKm = existingOil?.intervalKm != null ? Number(existingOil.intervalKm) : PRESET_OPTIONS.basic.intervalKm;
    const nextIntervalMonths = existingOil?.intervalMonths != null ? Number(existingOil.intervalMonths) : PRESET_OPTIONS.basic.intervalMonths;

    // Determine initial mode based on existing data
    let initialMode = 'none';
    if (nextLastKm != null && nextLastDate) {
      // If we have data, we assume it was a previous change or current if they match
      // But for simplicity in wizard, if reopening, we might default to 'previous' to show the data
      initialMode = 'previous';
    }

    setActiveStep(0);
    setOdometerCurrent(Number.isFinite(nextCurrent) ? nextCurrent : null);
    setChangeMode(initialMode);

    setLastServiceOdometer(Number.isFinite(nextLastKm) ? nextLastKm : null);
    setLastServiceDate(nextLastDate || dateToInputValue(new Date())); // Default to today if empty

    setPlanPreset(resolvePresetKey(nextIntervalKm, nextIntervalMonths));
    setIntervalKm(Number.isFinite(nextIntervalKm) ? nextIntervalKm : null);
    setIntervalMonths(Number.isFinite(nextIntervalMonths) ? nextIntervalMonths : null);

    setStepError('');
    setSaveError('');
    setSaving(false);
    setRetryPayload(null);
  }, [open, existingOil]);

  const steps = [t('maintenanceWizardStepCurrentKm'), t('maintenanceWizardStepBasePlan')];
  const canContinueStepOne = Number.isFinite(odometerCurrent) && odometerCurrent >= 0;

  const validateStepTwo = () => {
    if (changeMode === 'none') {
      return t('maintenanceBaseNotInformed'); // Or a strictly better error
    }

    if (changeMode === 'previous') {
      if (!Number.isFinite(lastServiceOdometer)) {
        return t('maintenanceLastKmRequired');
      }
      if (lastServiceOdometer > odometerCurrent) {
        return t('maintenanceLastKmGreaterError');
      }
      if (!lastServiceDate) {
        return t('maintenanceLastDateRequired');
      }
    }

    if (planPreset === 'custom') {
      const hasKmRule = Number.isFinite(intervalKm) && intervalKm > 0;
      const hasDateRule = Number.isFinite(intervalMonths) && intervalMonths > 0;
      if (!hasKmRule && !hasDateRule) {
        return t('maintenanceCustomRuleRequired');
      }
    }

    return '';
  };

  const buildPayload = () => {
    const baseDateToday = new Date().toISOString();

    let nextLastKm = null;
    let nextLastDate = null;

    if (changeMode === 'current') {
      nextLastKm = odometerCurrent;
      nextLastDate = baseDateToday;
    } else if (changeMode === 'previous') {
      nextLastKm = lastServiceOdometer;
      nextLastDate = lastServiceDate ? new Date(lastServiceDate).toISOString() : null;
    }

    const nextIntervalKm = planPreset === 'custom'
      ? (Number.isFinite(intervalKm) && intervalKm > 0 ? intervalKm : null)
      : PRESET_OPTIONS[planPreset].intervalKm;
    const nextIntervalMonths = planPreset === 'custom'
      ? (Number.isFinite(intervalMonths) && intervalMonths > 0 ? intervalMonths : null)
      : PRESET_OPTIONS[planPreset].intervalMonths;

    return {
      enabled: existingOil?.enabled !== false,
      odometerCurrent,
      lastServiceOdometer: nextLastKm,
      lastServiceDate: nextLastDate,
      intervalKm: nextIntervalKm,
      intervalMonths: nextIntervalMonths,
      updatedAt: new Date().toISOString(),
    };
  };

  const handleAdvance = () => {
    if (!canContinueStepOne) {
      setStepError(t('maintenanceCurrentKmRequired'));
      return;
    }
    setStepError('');
    setActiveStep(1);
  };

  const doSave = async (payload) => {
    setSaving(true);
    setStepError('');
    setSaveError('');
    try {
      await onSave(payload);
      onClose();
    } catch (error) {
      setSaveError(error.message || t('maintenanceSaveError'));
      setRetryPayload(payload);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const validationError = validateStepTwo();
    if (validationError) {
      setStepError(validationError);
      return;
    }
    const payload = buildPayload();
    await doSave(payload);
  };

  const handleRetry = async () => {
    if (!retryPayload) {
      return;
    }
    await doSave(retryPayload);
  };

  const onPlanPresetChange = (event, value) => {
    if (!value) {
      return;
    }
    setPlanPreset(value);
    if (value !== 'custom') {
      setIntervalKm(PRESET_OPTIONS[value].intervalKm);
      setIntervalMonths(PRESET_OPTIONS[value].intervalMonths);
    }
  };

  const handleChangeMode = (event) => {
    const mode = event.target.value;
    setChangeMode(mode);
    setStepError('');
    if (mode === 'current') {
      // Reset manual inputs to sensible defaults in case they switch back
      setLastServiceOdometer(odometerCurrent);
      setLastServiceDate(dateToInputValue(new Date()));
    }
  };

  const renderStepOne = () => (
    <Stack spacing={2}>
      <TextField
        fullWidth
        label={t('maintenanceCurrentKmLabel')}
        value={odometerCurrent == null ? '' : formatOdometer(odometerCurrent)}
        onChange={(event) => {
          setOdometerCurrent(parseIntegerInput(event.target.value));
          setStepError('');
        }}
        inputProps={{
          inputMode: 'numeric',
          min: 0,
        }}
        helperText={t('maintenanceCurrentKmHelper')}
      />
    </Stack>
  );

  const renderStepTwo = () => (
    <Stack spacing={2}>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('maintenanceWhenLastChange')}</Typography>
        <RadioGroup value={changeMode} onChange={handleChangeMode}>
          <FormControlLabel
            value="current"
            control={<Radio />}
            label={t('maintenanceWizardOptionJustChanged') || "Troquei agora (resetar)"}
          />
          <FormControlLabel
            value="previous"
            control={<Radio />}
            label={t('maintenanceWizardOptionChangedBefore') || "Já troquei antes (informar manualmente)"}
          />
        </RadioGroup>

        {changeMode === 'previous' && (
          <Stack spacing={2} sx={{ mt: 2, ml: 4, borderLeft: '2px solid #eee', pl: 2 }}>
            <TextField
              label={t('maintenanceLastKmLabel')}
              value={lastServiceOdometer == null ? '' : formatOdometer(lastServiceOdometer)}
              onChange={(event) => {
                setLastServiceOdometer(parseIntegerInput(event.target.value));
                setStepError('');
              }}
              inputProps={{ inputMode: 'numeric', min: 0 }}
              fullWidth
            />
            <TextField
              type="date"
              label={t('maintenanceLastDateLabel')}
              value={lastServiceDate}
              onChange={(event) => {
                setLastServiceDate(event.target.value);
                setStepError('');
              }}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>
        )}
      </Box>

      <FormControl fullWidth sx={{ mt: 2 }}>
        <Typography variant="subtitle2">{t('maintenancePlan')}</Typography>
        <ToggleButtonGroup
          exclusive
          value={planPreset}
          onChange={onPlanPresetChange}
          orientation="vertical"
          sx={{ mt: 1 }}
        >
          <ToggleButton value="basic">{t('maintenancePlanBasic')}</ToggleButton>
          <ToggleButton value="normal">{t('maintenancePlanNormal')}</ToggleButton>
          <ToggleButton value="severe">{t('maintenancePlanSevere')}</ToggleButton>
          <ToggleButton value="custom">{t('reportCustom')}</ToggleButton>
        </ToggleButtonGroup>
      </FormControl>

      {planPreset === 'custom' && (
        <Stack spacing={2}>
          <TextField
            label={t('maintenanceEveryKm')}
            value={intervalKm == null ? '' : formatOdometer(intervalKm)}
            onChange={(event) => {
              setIntervalKm(parseIntegerInput(event.target.value));
              setStepError('');
            }}
            inputProps={{ inputMode: 'numeric', min: 1 }}
          />
          <TextField
            label={t('maintenanceEveryMonths')}
            value={intervalMonths == null ? '' : String(intervalMonths)}
            onChange={(event) => {
              setIntervalMonths(parseIntegerInput(event.target.value));
              setStepError('');
            }}
            inputProps={{ inputMode: 'numeric', min: 1 }}
          />
        </Stack>
      )}
    </Stack>
  );

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && activeStep === 0) {
          event.preventDefault();
          handleAdvance();
        }
        if (event.key === 'Escape' && !saving) {
          onClose();
        }
      }}
    >
      <DialogTitle>{t('maintenanceWizardTitle')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {device?.name || ''}
        </Typography>
        <Stepper activeStep={activeStep} sx={{ mb: 2 }}>
          {steps.map((stepLabel) => (
            <Step key={stepLabel}>
              <StepLabel>{stepLabel}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {activeStep === 0 ? renderStepOne() : renderStepTwo()}

        {stepError && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {stepError}
          </Alert>
        )}
        {saveError && (
          <Alert
            severity="error"
            sx={{ mt: 2 }}
            action={(
              <Button color="inherit" size="small" onClick={handleRetry} disabled={saving || !retryPayload}>
                {t('notificationRetry')}
              </Button>
            )}
          >
            {saveError}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        {activeStep === 0 ? (
          <>
            <Button onClick={onClose} disabled={saving}>{t('sharedCancel')}</Button>
            <Button variant="contained" onClick={handleAdvance} disabled={saving || !canContinueStepOne}>
              {t('maintenanceContinue')}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setActiveStep(0)} disabled={saving}>{t('sharedBack')}</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving || changeMode === 'none'}>
              {t('sharedSave')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default OilChangeWizard;
