import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Autocomplete,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { prefixString } from '../common/util/stringUtils';
import EditItemView from './components/EditItemView';
import { useAttributePreference } from '../common/util/preferences';
import {
  speedFromKnots, speedToKnots, distanceFromMeters, distanceToMeters,
} from '../common/util/converter';
import { useTranslation } from '../common/components/LocalizationProvider';
import usePositionAttributes from '../common/attributes/usePositionAttributes';
import SettingsMenu from './components/SettingsMenu';
import useSettingsStyles from './common/useSettingsStyles';
import { useAdministrator } from '../common/util/permissions';
import { useCatch, useEffectAsync } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { getDeviceDisplayName } from '../common/util/deviceUtils';

const COMMON_USER_MAINTENANCE_TYPES = new Set(['totalDistance', 'odometer', 'hours', 'fixTime', 'batteryLevel']);

async function fetchDevices() {
  const res = await fetchOrThrow('/api/devices');
  return res.json();
}

async function fetchLinkedDeviceIds(maintenanceId) {
  const devices = await fetchDevices();
  const results = await Promise.all(
    devices.map(async (device) => {
      const res = await fetchOrThrow(`/api/maintenance?deviceId=${device.id}`);
      const maintenances = await res.json();
      const linked = maintenances.some((m) => m.id === maintenanceId);
      return linked ? device.id : null;
    }),
  );
  return results.filter(Boolean);
}

async function applyDeviceMaintenanceLinks(maintenanceId, deviceIdsToLink) {
  const allDevices = await fetchDevices();
  const allIds = allDevices.map((d) => d.id);
  const toAdd = deviceIdsToLink;
  const toRemove = allIds.filter((did) => !deviceIdsToLink.includes(did));

  await Promise.all([
    ...toAdd.map((deviceId) => fetchOrThrow('/api/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, maintenanceId }),
    })),
    ...toRemove.map((deviceId) => fetchOrThrow('/api/permissions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, maintenanceId }),
    })),
  ]);
}

const MaintenancePage = () => {
  const { classes } = useSettingsStyles();
  const t = useTranslation();
  const navigate = useNavigate();
  const isAdmin = useAdministrator();
  const { id } = useParams();

  const positionAttributes = usePositionAttributes(t);

  const [item, setItem] = useState();
  const [labels, setLabels] = useState({ start: '', period: '' });
  const [devices, setDevices] = useState([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState([]);

  const speedUnit = useAttributePreference('speedUnit', 'kn');
  const distanceUnit = useAttributePreference('distanceUnit', 'km');

  useEffectAsync(async () => {
    const list = await fetchDevices();
    setDevices(list);
  }, []);

  useEffectAsync(async () => {
    if (id && devices.length > 0) {
      const linked = await fetchLinkedDeviceIds(parseInt(id, 10));
      setSelectedDeviceIds(linked);
    } else if (!id) {
      setSelectedDeviceIds([]);
    }
  }, [id, devices.length]);

  const convertToList = (attributes) => {
    const otherList = [];
    Object.keys(attributes).forEach((key) => {
      const value = attributes[key];
      if (!isAdmin && !COMMON_USER_MAINTENANCE_TYPES.has(key)) {
        return;
      }
      if (value.type === 'number' || key.endsWith('Time')) {
        const name = !isAdmin && key === 'batteryLevel'
          ? `${t('positionBatteryLevel')} (${t('sharedDevice')})`
          : value.name;
        otherList.push({ key, name, type: value.type });
      }
    });
    return otherList;
  };

  useEffect(() => {
    const attribute = positionAttributes[item?.type];
    if (item?.type?.endsWith('Time')) {
      setLabels({ ...labels, start: null, period: t('sharedDays') });
    } else if (attribute && attribute.dataType) {
      switch (attribute.dataType) {
        case 'speed':
          setLabels({ ...labels, start: t(prefixString('shared', speedUnit)), period: t(prefixString('shared', speedUnit)) });
          break;
        case 'distance':
          setLabels({ ...labels, start: t(prefixString('shared', distanceUnit)), period: t(prefixString('shared', distanceUnit)) });
          break;
        case 'hours':
          setLabels({ ...labels, start: t('sharedHours'), period: t('sharedHours') });
          break;
        default:
          setLabels({ ...labels, start: null, period: null });
          break;
      }
    } else {
      setLabels({ ...labels, start: null, period: null });
    }
  }, [item?.type]);

  const rawToValue = (start, value) => {
    const attribute = positionAttributes[item.type];
    if (item.type?.endsWith('Time')) {
      if (start) {
        return dayjs(value).locale('en').format('YYYY-MM-DD');
      }
      return value / 86400000;
    }
    if (attribute && attribute.dataType) {
      switch (attribute.dataType) {
        case 'speed':
          return speedFromKnots(value, speedUnit);
        case 'distance':
          return distanceFromMeters(value, distanceUnit);
        case 'hours':
          return value / 3600000;
        default:
          return value;
      }
    }
    return value;
  };

  const valueToRaw = (start, value) => {
    const attribute = positionAttributes[item.type];
    if (item.type?.endsWith('Time')) {
      if (start) {
        return dayjs(value, 'YYYY-MM-DD').valueOf();
      }
      return value * 86400000;
    } if (attribute && attribute.dataType) {
      switch (attribute.dataType) {
        case 'speed':
          return speedToKnots(value, speedUnit);
        case 'distance':
          return distanceToMeters(value, distanceUnit);
        case 'hours':
          return value * 3600000;
        default:
          return value;
      }
    }
    return value;
  };

  const validate = () => item && item.name && item.type && item.start && item.period;

  const customSave = useCatch(async (payload) => {
    const url = id ? `/api/maintenance/${id}` : '/api/maintenance';
    const method = id ? 'PUT' : 'POST';
    const res = await fetchOrThrow(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const saved = await res.json();
    const deviceIds = Array.isArray(selectedDeviceIds) ? selectedDeviceIds : [];
    await applyDeviceMaintenanceLinks(saved.id, deviceIds);
    navigate(-1);
  });

  const selectedDevices = devices.filter((d) => selectedDeviceIds.includes(d.id));

  return (
    <EditItemView
      endpoint="maintenance"
      item={item}
      setItem={setItem}
      validate={validate}
      customSave={customSave}
      menu={<SettingsMenu />}
      breadcrumbs={['settingsTitle', 'sharedMaintenance']}
    >
      {item && (
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">
              {t('sharedRequired')}
            </Typography>
          </AccordionSummary>
          <AccordionDetails className={classes.details}>
            <TextField
              value={item.name || ''}
              onChange={(e) => setItem({ ...item, name: e.target.value })}
              label={t('sharedName')}
            />
            <FormControl fullWidth>
              <InputLabel>{t('sharedType')}</InputLabel>
              <Select
                label={t('sharedType')}
                value={item.type || ''}
                onChange={(e) => setItem({ ...item, type: e.target.value, start: 0, period: 0 })}
              >
                {convertToList(positionAttributes).map(({ key, name }) => (
                  <MenuItem key={key} value={key}>{name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              fullWidth
              type={item.type?.endsWith('Time') ? 'date' : 'number'}
              value={rawToValue(true, item.start) || ''}
              onChange={(e) => setItem({ ...item, start: valueToRaw(true, e.target.value) })}
              label={labels.start ? `${t('maintenanceStart')} (${labels.start})` : t('maintenanceStart')}
            />
            <TextField
              fullWidth
              type="number"
              value={rawToValue(false, item.period) || ''}
              onChange={(e) => setItem({ ...item, period: valueToRaw(false, e.target.value) })}
              label={labels.period ? `${t('maintenancePeriod')} (${labels.period})` : t('maintenancePeriod')}
            />
            <Autocomplete
              multiple
              options={devices}
              getOptionLabel={(device) => getDeviceDisplayName(device) || device.name}
              value={selectedDevices}
              onChange={(_, value) => setSelectedDeviceIds(value.map((d) => d.id))}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('sharedDevice')}
                  placeholder={t('reportShow')}
                />
              )}
            />
          </AccordionDetails>
        </Accordion>
      )}
    </EditItemView>
  );
};

export default MaintenancePage;
