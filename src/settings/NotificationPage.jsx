import { useState, useCallback } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  FormControlLabel,
  Checkbox,
  FormGroup,
  Button,
  TextField,
  Alert,
  Box,
  Chip,
  Snackbar,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation, useTranslationKeys } from '../common/components/LocalizationProvider';
import EditItemView from './components/EditItemView';
import { prefixString, unprefixString } from '../common/util/stringUtils';
import SelectField from '../common/components/SelectField';
import SettingsMenu from './components/SettingsMenu';
import { useCatch, useEffectAsync } from '../reactHelper';
import useSettingsStyles from './common/useSettingsStyles';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { useAdministrator } from '../common/util/permissions';

const SPEED_LIMIT_PRESETS = [80, 100, 120];

async function fetchDevices() {
  const res = await fetchOrThrow('/api/devices');
  return res.json();
}

async function applySpeedLimit(deviceIds, limit) {
  const limitNum = Number(limit);
  if (!Number.isFinite(limitNum) || limitNum <= 0) {
    return { success: [], fail: deviceIds };
  }
  const results = await Promise.allSettled(
    deviceIds.map(async (deviceId) => {
      const getRes = await fetchOrThrow(`/api/devices/${deviceId}`);
      const device = await getRes.json();
      const attributes = { ...(device.attributes || {}), speedLimit: limitNum };
      await fetchOrThrow(`/api/devices/${deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...device, attributes }),
      });
      return deviceId;
    }),
  );
  const success = [];
  const fail = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') success.push(deviceIds[i]);
    else fail.push(deviceIds[i]);
  });
  return { success, fail };
}

const NotificationPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { classes } = useSettingsStyles();
  const t = useTranslation();
  const admin = useAdministrator();

  const [item, setItem] = useState();
  const [notificators, setNotificators] = useState();
  const [speedLimit, setSpeedLimit] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState('');
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success', retry: null });
  const [failedDeviceIds, setFailedDeviceIds] = useState([]);

  useEffectAsync(async () => {
    const response = await fetchOrThrow('/api/notifications/notificators');
    setNotificators(await response.json());
  }, []);

  const alarms = useTranslationKeys((it) => it.startsWith('alarm')).map((it) => ({
    key: unprefixString('alarm', it),
    name: t(it),
  }));

  const isOverspeed = ['overspeed', 'deviceOverspeed'].includes(item?.type);
  const limitNum = speedLimit.trim() === '' ? NaN : Number(speedLimit);
  const limitValid = Number.isFinite(limitNum) && limitNum > 0;

  const validate = useCallback(() => {
    if (!item || !item.type || !item.notificators) return false;
    if (item.notificators?.includes('command') && !item.commandId) return false;
    if (isOverspeed) {
      if (!limitValid) return false;
      if (item.always) return true;
      return Array.isArray(selectedDeviceIds) && selectedDeviceIds.length > 0;
    }
    return true;
  }, [item, isOverspeed, limitValid, selectedDeviceIds]);

  const testNotificators = useCatch(async () => {
    await Promise.all(item.notificators.split(/[, ]+/).map(async (notificator) => {
      await fetchOrThrow(`/api/notifications/test/${notificator}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
    }));
  });

  const doApplyAndHandleResult = useCallback(async (deviceIds, limit) => {
    const { success, fail } = await applySpeedLimit(deviceIds, limit);
    return { success, fail };
  }, []);

  const customSave = useCatch(async (payload) => {
    if (!isOverspeed || !limitValid) return;

    setSaving(true);
    setSaveLabel(t('notificationSavingAlert'));

    try {
      const url = id ? `/api/notifications/${id}` : '/api/notifications';
      const method = id ? 'PUT' : 'POST';
      const res = await fetchOrThrow(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await res.json();

      setSaveLabel(t('notificationApplyingLimit'));

      let deviceIds;
      if (payload.always) {
        const list = await fetchDevices();
        deviceIds = list.map((d) => d.id);
      } else {
        deviceIds = Array.isArray(selectedDeviceIds) ? [...selectedDeviceIds] : [];
      }

      if (deviceIds.length === 0) {
        setToast({ open: true, message: t('notificationOverspeedSuccess').replace('{{n}}', '0'), severity: 'success', retry: null });
        setSaving(false);
        setSaveLabel('');
        navigate(-1);
        return;
      }

      const { success, fail } = await doApplyAndHandleResult(deviceIds, limitNum);

      setSaving(false);
      setSaveLabel('');

      if (fail.length === 0) {
        setToast({ open: true, message: t('notificationOverspeedSuccess').replace('{{n}}', String(success.length)), severity: 'success', retry: null });
        navigate(-1);
        return;
      }

      setFailedDeviceIds(fail);
      const msg = t('notificationOverspeedPartialFailure').replace('{{n}}', String(fail.length));
      setToast({ open: true, message: msg, severity: 'warning', retry: true });
    } catch (e) {
      setSaving(false);
      setSaveLabel('');
      throw e;
    }
  });

  const handleRetry = useCatch(async () => {
    if (failedDeviceIds.length === 0 || !limitValid) return;
    setToast((prev) => ({ ...prev, open: false }));
    setSaving(true);
    setSaveLabel(t('notificationApplyingLimit'));
    try {
      const { success, fail } = await doApplyAndHandleResult(failedDeviceIds, limitNum);
      setSaving(false);
      setSaveLabel('');
      setFailedDeviceIds(fail);
      if (fail.length === 0) {
        setToast({ open: true, message: t('notificationOverspeedSuccess').replace('{{n}}', String(success.length)), severity: 'success', retry: null });
        navigate(-1);
        return;
      }
      setToast({
        open: true,
        message: t('notificationOverspeedPartialFailure').replace('{{n}}', String(fail.length)),
        severity: 'warning',
        retry: true,
      });
    } catch (e) {
      setSaving(false);
      setSaveLabel('');
      throw e;
    }
  });

  const hasPushNotificator = notificators?.some((n) => ['traccar', 'firebase'].includes(n.type));
  const missingTraccarMessage = t('notificationTraccarMissing');
  const missingTraccarUserMessage = t('notificationTraccarMissingUser');

  return (
    <>
      <EditItemView
        endpoint="notifications"
        item={item}
        setItem={setItem}
        validate={validate}
        menu={<SettingsMenu />}
        breadcrumbs={['settingsTitle', 'sharedNotification']}
        customSave={isOverspeed ? customSave : undefined}
        saving={saving}
        saveLabel={saveLabel}
      >
        {item && (
          <>
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1">
                  {t('sharedRequired')}
                </Typography>
              </AccordionSummary>
              <AccordionDetails className={classes.details}>
                <SelectField
                  value={item.type}
                  onChange={(e) => setItem({ ...item, type: e.target.value })}
                  endpoint="/api/notifications/types"
                  keyGetter={(it) => it.type}
                  titleGetter={(it) => t(prefixString('event', it.type))}
                  label={t('sharedType')}
                  helperText={['geofenceEnter', 'geofenceExit'].includes(item.type) ? t('notificationGeofenceLabel') : null}
                />
                {item.type === 'alarm' && (
                  <SelectField
                    multiple
                    value={item.attributes?.alarms ? item.attributes.alarms.split(/[, ]+/) : []}
                    onChange={(e) => setItem({ ...item, attributes: { ...item.attributes, alarms: e.target.value.join() } })}
                    data={alarms}
                    keyGetter={(it) => it.key}
                    label={t('sharedAlarms')}
                  />
                )}
                {isOverspeed && (
                  <>
                    <TextField
                      label={t('notificationSpeedLimitLabel')}
                      type="number"
                      required
                      fullWidth
                      value={speedLimit}
                      onChange={(e) => setSpeedLimit(e.target.value)}
                      error={speedLimit.length > 0 && !limitValid}
                      helperText={t('notificationSpeedLimitHelper')}
                      inputProps={{
                        min: 1,
                        step: 1,
                        inputMode: 'numeric',
                        'aria-label': t('notificationSpeedLimitLabel'),
                      }}
                      sx={{ '& .MuiInputBase-root': { minHeight: 44 } }}
                    />
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {SPEED_LIMIT_PRESETS.map((preset) => (
                        <Chip
                          key={preset}
                          label={`${preset} km/h`}
                          onClick={() => setSpeedLimit(String(preset))}
                          variant={limitNum === preset ? 'filled' : 'outlined'}
                          color="primary"
                          sx={{ minHeight: 44, minWidth: 44 }}
                        />
                      ))}
                    </Box>
                  </>
                )}
                <SelectField
                  multiple
                  value={item.notificators ? item.notificators.split(/[, ]+/) : []}
                  onChange={(e) => setItem({ ...item, notificators: e.target.value.join() })}
                  endpoint="/api/notifications/notificators"
                  keyGetter={(it) => it.type}
                  titleGetter={(it) => t(prefixString('notificator', it.type))}
                  label={t('notificationNotificators')}
                />
                {notificators && !hasPushNotificator && (
                  <Alert severity="info">
                    {admin ? (missingTraccarMessage || (
                      <>
                        To enable push notifications in Traccar Manager, add <code>traccar</code> to
                        {' '}
                        <code>notificator.types</code> and set <code>notificator.traccar.key</code> in the server config,
                        then restart the service.
                      </>
                    )) : (missingTraccarUserMessage || missingTraccarMessage)}
                  </Alert>
                )}
                {item.notificators?.includes('command') && (
                  <SelectField
                    value={item.commandId}
                    onChange={(e) => setItem({ ...item, commandId: Number(e.target.value) })}
                    endpoint="/api/commands"
                    titleGetter={(it) => it.description}
                    label={t('sharedSavedCommand')}
                  />
                )}
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={testNotificators}
                  disabled={!item.notificators}
                >
                  {t('sharedTestNotificators')}
                </Button>
                <FormGroup>
                  <FormControlLabel
                    control={(
                      <Checkbox
                        checked={item.always}
                        onChange={(e) => setItem({ ...item, always: e.target.checked })}
                      />
                    )}
                    label={t('notificationAlways')}
                  />
                </FormGroup>
                {isOverspeed && !item.always && (
                  <SelectField
                    multiple
                    fullWidth
                    value={selectedDeviceIds}
                    onChange={(e) => setSelectedDeviceIds(Array.isArray(e.target.value) ? e.target.value : [])}
                    endpoint="/api/devices"
                    keyGetter={(it) => it.id}
                    titleGetter={(it) => it.name}
                    label={t('notificationDevices')}
                    helperText={t('sharedRequired')}
                  />
                )}
              </AccordionDetails>
            </Accordion>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1">
                  {t('sharedExtra')}
                </Typography>
              </AccordionSummary>
              <AccordionDetails className={classes.details}>
                <TextField
                  value={item.description || ''}
                  onChange={(e) => setItem({ ...item, description: e.target.value })}
                  label={t('sharedDescription')}
                />
                <SelectField
                  value={item.calendarId}
                  onChange={(e) => setItem({ ...item, calendarId: Number(e.target.value) })}
                  endpoint="/api/calendars"
                  label={t('sharedCalendar')}
                />
                <FormGroup>
                  <FormControlLabel
                    control={(
                      <Checkbox
                        checked={item.attributes?.priority}
                        onChange={(e) => setItem({ ...item, attributes: { ...item.attributes, priority: e.target.checked } })}
                      />
                    )}
                    label={t('sharedPriority')}
                  />
                </FormGroup>
              </AccordionDetails>
            </Accordion>
          </>
        )}
      </EditItemView>
      <Snackbar
        open={toast.open}
        autoHideDuration={toast.retry ? null : 4000}
        onClose={() => setToast((p) => ({ ...p, open: false }))}
        action={toast.retry ? (
          <Button color="inherit" size="small" onClick={handleRetry}>
            {t('notificationRetry')}
          </Button>
        ) : null}
      >
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast((p) => ({ ...p, open: false }))}>
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default NotificationPage;
