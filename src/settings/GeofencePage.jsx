import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  TextField,
  FormControlLabel,
  Checkbox,
  FormControl,
  FormLabel,
  RadioGroup,
  Radio,
  Snackbar,
  Alert,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditItemView from './components/EditItemView';
import EditAttributesAccordion from './components/EditAttributesAccordion';
import { useTranslation } from '../common/components/LocalizationProvider';
import useGeofenceAttributes from '../common/attributes/useGeofenceAttributes';
import SettingsMenu from './components/SettingsMenu';
import SelectField from '../common/components/SelectField';
import { geofencesActions } from '../store';
import useSettingsStyles from './common/useSettingsStyles';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { useAdministrator, useManager } from '../common/util/permissions';
import {
  buildCircleArea,
  parseCircleArea,
  RADAR_DEFAULT_RADIUS_METERS,
  RADAR_MAX_RADIUS_METERS,
  RADAR_MIN_RADIUS_METERS,
} from '../common/util/radar';

const KNOTS_PER_KPH = 0.539956803;

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return Number.NaN;
  }
  return Number(value);
};

const clampRadius = (value, fallback = RADAR_DEFAULT_RADIUS_METERS) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(RADAR_MAX_RADIUS_METERS, Math.max(RADAR_MIN_RADIUS_METERS, Math.round(value)));
};

const GeofencePage = () => {
  const { classes } = useSettingsStyles();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { id } = useParams();
  const t = useTranslation();
  const isAdmin = useAdministrator();
  const canManageUsers = useManager();
  const userId = useSelector((state) => state.session.user.id);

  const geofenceAttributes = useGeofenceAttributes(t);

  const [item, setItem] = useState();
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ open: false, severity: 'success', message: '' });

  useEffect(() => {
    if (item && !item.attributes) {
      setItem({ ...item, attributes: {} });
    }
  }, [item]);

  const onItemSaved = (result) => {
    dispatch(geofencesActions.update([result]));
  };

  const isRadar = Boolean(item?.attributes?.radar);
  const readOnlyRadar = isRadar && !isAdmin;
  const circleArea = useMemo(() => parseCircleArea(item?.area), [item?.area]);

  const radarSpeedLimitValue = item?.attributes?.radarSpeedLimitKph ?? '';
  const radarRadiusValue = item?.attributes?.radarRadiusMeters ?? (circleArea?.radius ?? RADAR_DEFAULT_RADIUS_METERS);

  const radarSpeedLimit = toNumber(radarSpeedLimitValue);
  const radarRadius = toNumber(radarRadiusValue);

  const nameValid = Boolean(item?.name && item.name.trim());
  const radarSpeedValid = !isRadar || !isAdmin || (Number.isFinite(radarSpeedLimit) && radarSpeedLimit > 0);
  const radarRadiusValid = !isRadar || !isAdmin || (
    Number.isFinite(radarRadius)
    && radarRadius >= RADAR_MIN_RADIUS_METERS
    && radarRadius <= RADAR_MAX_RADIUS_METERS
  );
  const radarAreaValid = !isRadar || !isAdmin || Boolean(item?.area);

  const validate = () => (!readOnlyRadar && nameValid && radarSpeedValid && radarRadiusValid && radarAreaValid);
  const fieldDisabled = saving || readOnlyRadar;

  const handleRadarTypeChange = (event) => {
    if (!item) {
      return;
    }
    const enableRadar = event.target.value === 'radar';
    const attributes = { ...(item.attributes || {}) };
    if (enableRadar) {
      const nextRadius = clampRadius(
        toNumber(attributes.radarRadiusMeters),
        circleArea?.radius ?? RADAR_DEFAULT_RADIUS_METERS,
      );
      const nextAttributes = {
        ...attributes,
        radar: true,
        radarSpeedLimitKph: attributes.radarSpeedLimitKph ?? '',
        radarRadiusMeters: nextRadius,
        radarActive: attributes.radarActive !== false,
      };
      const nextArea = circleArea
        ? buildCircleArea({ ...circleArea, radius: nextRadius })
        : item.area;
      setItem({ ...item, area: nextArea, attributes: nextAttributes });
    } else {
      const nextAttributes = { ...attributes };
      delete nextAttributes.radar;
      delete nextAttributes.radarSpeedLimitKph;
      delete nextAttributes.radarRadiusMeters;
      delete nextAttributes.radarActive;
      setItem({ ...item, attributes: nextAttributes });
    }
  };

  const handleRadarSpeedChange = (event) => {
    setItem({
      ...item,
      attributes: {
        ...(item.attributes || {}),
        radarSpeedLimitKph: event.target.value,
      },
    });
  };

  const handleRadarRadiusChange = (event) => {
    const radiusInput = event.target.value;
    const parsedRadius = toNumber(radiusInput);
    const nextArea = circleArea && Number.isFinite(parsedRadius)
      ? buildCircleArea({ ...circleArea, radius: parsedRadius })
      : item.area;
    setItem({
      ...item,
      area: nextArea,
      attributes: {
        ...(item.attributes || {}),
        radarRadiusMeters: radiusInput,
      },
    });
  };

  const handleSave = async (payload) => {
    setSaving(true);
    try {
      const attributes = { ...(payload.attributes || {}) };
      let area = payload.area;

      if (attributes.radar) {
        const parsedSpeed = toNumber(attributes.radarSpeedLimitKph);
        const parsedRadius = clampRadius(
          toNumber(attributes.radarRadiusMeters),
          parseCircleArea(payload.area)?.radius ?? RADAR_DEFAULT_RADIUS_METERS,
        );

        attributes.radar = true;
        attributes.radarActive = attributes.radarActive !== false;
        attributes.radarSpeedLimitKph = parsedSpeed;
        attributes.radarRadiusMeters = parsedRadius;
        attributes.speedLimit = Number((parsedSpeed * KNOTS_PER_KPH).toFixed(6));

        const parsedCircle = parseCircleArea(payload.area);
        if (parsedCircle) {
          area = buildCircleArea({ ...parsedCircle, radius: parsedRadius });
        }
      }

      const normalizedPayload = {
        ...payload,
        area,
        attributes,
      };

      const response = await fetchOrThrow(id ? `/api/geofences/${id}` : '/api/geofences', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedPayload),
      });

      const saved = await response.json();
      if (attributes.radar && canManageUsers && Number.isFinite(saved?.id) && Number.isFinite(userId)) {
        const visited = new Set([userId]);
        const queue = [userId];
        const managedUsers = [];

        while (queue.length) {
          const currentUserId = queue.shift();
          const managedResponse = await fetchOrThrow(`/api/users?userId=${currentUserId}&excludeAttributes=true`);
          const managedItems = await managedResponse.json();
          managedItems.forEach((managedUser) => {
            if (!visited.has(managedUser.id)) {
              visited.add(managedUser.id);
              managedUsers.push(managedUser);
              queue.push(managedUser.id);
            }
          });
        }

        if (managedUsers.length) {
          const linkedResponse = await fetchOrThrow(`/api/users?geofenceId=${saved.id}&excludeAttributes=true`);
          const linkedUsers = await linkedResponse.json();
          const linkedIds = new Set(linkedUsers.map((linkedUser) => linkedUser.id));
          const toLink = managedUsers.filter((managedUser) => !linkedIds.has(managedUser.id));

          await Promise.allSettled(toLink.map((managedUser) => fetchOrThrow('/api/permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: managedUser.id,
              geofenceId: saved.id,
            }),
          })));
        }
      }
      onItemSaved(saved);
      setToast({
        open: true,
        severity: 'success',
        message: isRadar ? t('radarSaved') : t('sharedSaved'),
      });
      setTimeout(() => navigate(-1), 350);
    } catch {
      setToast({
        open: true,
        severity: 'error',
        message: t('radarSaveError'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <EditItemView
        endpoint="geofences"
        item={item}
        setItem={setItem}
        validate={validate}
        onItemSaved={onItemSaved}
        customSave={handleSave}
        saving={saving}
        saveLabel={t('sharedSaving')}
        menu={<SettingsMenu />}
        breadcrumbs={['settingsTitle', 'sharedGeofence']}
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
                <TextField
                  value={item.name || ''}
                  onChange={(event) => setItem({ ...item, name: event.target.value })}
                  label={t('sharedName')}
                  placeholder={isRadar ? t('radarNamePlaceholder') : ''}
                  error={!nameValid}
                  helperText={!nameValid ? t('radarNameRequired') : null}
                  disabled={fieldDisabled}
                />
                <FormControl>
                  <FormLabel>{t('sharedType')}</FormLabel>
                  <RadioGroup
                    row
                    value={isRadar ? 'radar' : 'normal'}
                    onChange={handleRadarTypeChange}
                  >
                    <FormControlLabel value="normal" control={<Radio />} label={t('geofenceTypeNormal')} disabled={fieldDisabled} />
                    {isAdmin && <FormControlLabel value="radar" control={<Radio />} label={t('geofenceTypeRadar')} disabled={fieldDisabled} />}
                  </RadioGroup>
                </FormControl>
                {isAdmin && isRadar && (
                  <>
                    <TextField
                      value={radarSpeedLimitValue}
                      onChange={handleRadarSpeedChange}
                      label={t('radarSpeedLimitLabel')}
                      placeholder={t('radarSpeedLimitPlaceholder')}
                      type="number"
                      error={!radarSpeedValid}
                      helperText={!radarSpeedValid ? t('radarSpeedLimitRequired') : null}
                      inputProps={{ min: 1, step: 1, inputMode: 'numeric' }}
                      disabled={fieldDisabled}
                    />
                    <TextField
                      value={radarRadiusValue}
                      onChange={handleRadarRadiusChange}
                      label={t('radarRadiusLabel')}
                      type="number"
                      error={!radarRadiusValid}
                      helperText={!radarRadiusValid ? t('radarRadiusRange') : t('radarRadiusHelper')}
                      inputProps={{ min: RADAR_MIN_RADIUS_METERS, max: RADAR_MAX_RADIUS_METERS, step: 1, inputMode: 'numeric' }}
                      disabled={fieldDisabled}
                    />
                    <FormControlLabel
                      control={(
                        <Checkbox
                          checked={item.attributes?.radarActive !== false}
                          onChange={(event) => setItem({
                            ...item,
                            attributes: {
                              ...(item.attributes || {}),
                              radarActive: event.target.checked,
                            },
                          })}
                          disabled={fieldDisabled}
                        />
                      )}
                      label={t('radarActive')}
                    />
                  </>
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
                  onChange={(event) => setItem({ ...item, description: event.target.value })}
                  label={t('sharedDescription')}
                  disabled={fieldDisabled}
                />
                <SelectField
                  value={item.calendarId}
                  onChange={(event) => setItem({ ...item, calendarId: Number(event.target.value) })}
                  endpoint="/api/calendars"
                  label={t('sharedCalendar')}
                  disabled={fieldDisabled}
                />
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={Boolean(item.attributes?.hide)}
                      onChange={(event) => setItem({
                        ...item,
                        attributes: {
                          ...(item.attributes || {}),
                          hide: event.target.checked,
                        },
                      })}
                      disabled={fieldDisabled}
                    />
                  )}
                  label={t('sharedFilterMap')}
                />
              </AccordionDetails>
            </Accordion>
            {!readOnlyRadar && (
              <EditAttributesAccordion
                attributes={item.attributes || {}}
                setAttributes={(attributes) => setItem({ ...item, attributes })}
                definitions={geofenceAttributes}
              />
            )}
          </>
        )}
      </EditItemView>
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((previous) => ({ ...previous, open: false }))}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((previous) => ({ ...previous, open: false }))}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default GeofencePage;
