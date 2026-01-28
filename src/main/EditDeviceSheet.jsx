import { useEffect, useMemo, useState } from 'react';
import {
  SwipeableDrawer,
  Box,
  Typography,
  TextField,
  Button,
  ButtonBase,
  CircularProgress,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { makeStyles } from 'tss-react/mui';
import { useDispatch } from 'react-redux';
import { useTranslation } from '../common/components/LocalizationProvider';
import deviceCategories from '../common/util/deviceCategories';
import { mapIcons } from '../map/core/preloadImages';
import { devicesActions, errorsActions } from '../store';
import { useDeviceReadonly, useRestriction } from '../common/util/permissions';
import fetchOrThrow from '../common/util/fetchOrThrow';

const iOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

const useStyles = makeStyles()((theme) => ({
  sheet: {
    padding: theme.spacing(2, 2, 3),
    borderTopLeftRadius: theme.shape.borderRadius * 2,
    borderTopRightRadius: theme.shape.borderRadius * 2,
    background: theme.palette.background.paper,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 999,
    background: alpha(theme.palette.text.primary, 0.2),
    margin: '0 auto',
    marginBottom: theme.spacing(1.5),
  },
  title: {
    fontWeight: 600,
    marginBottom: theme.spacing(2),
  },
  grid: {
    marginTop: theme.spacing(1),
    display: 'grid',
    gap: theme.spacing(1),
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    [theme.breakpoints.up('md')]: {
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    },
  },
  option: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(1),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
    background: alpha(theme.palette.background.default, 0.5),
  },
  optionSelected: {
    borderColor: theme.palette.primary.main,
    background: alpha(theme.palette.primary.main, 0.08),
  },
  optionIcon: {
    width: 26,
    height: 26,
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1.5),
    marginTop: theme.spacing(2),
  },
}));

const EditDeviceSheet = ({
  open,
  device,
  onClose,
}) => {
  const { classes, cx } = useStyles();
  const t = useTranslation();
  const dispatch = useDispatch();

  const deviceReadonly = useDeviceReadonly();
  const readonly = useRestriction('readonly');

  const [name, setName] = useState('');
  const [category, setCategory] = useState('default');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (device && open) {
      setName(device.name || '');
      setCategory(device.category || 'default');
    }
  }, [device, open]);

  const trimmedName = name.trim();
  const namePlaceholder = t('deviceNamePlaceholder') || 'E.g. Amarok, John Bike';
  const iconLabel = t('deviceMapIcon') || t('deviceCategory');
  const titleLabel = t('deviceEditTitle') || t('sharedEdit');

  const hasChanges = useMemo(() => {
    if (!device) {
      return false;
    }
    return trimmedName !== (device.name || '') || category !== (device.category || 'default');
  }, [device, trimmedName, category]);

  const canEdit = !deviceReadonly && !readonly;
  const canSave = canEdit && trimmedName.length > 0 && hasChanges && !saving;

  const handleSave = async () => {
    if (!device || !canSave) {
      return;
    }
    setSaving(true);
    try {
      const attributes = { ...(device.attributes || {}) };
      if (category !== (device.category || 'default')) {
        delete attributes.deviceIcon;
      }

      const updatedDevice = {
        ...device,
        name: trimmedName,
        category,
        attributes,
      };

      const response = await fetchOrThrow(`/api/devices/${device.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedDevice),
      });
      const saved = await response.json();
      dispatch(devicesActions.update([saved]));
      onClose?.();
    } catch (error) {
      const message = t('deviceEditFailed') || 'Unable to save. Check permissions.';
      dispatch(errorsActions.push(message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      disableBackdropTransition={!iOS}
      disableDiscovery={iOS}
    >
      <Box className={classes.sheet}>
        <div className={classes.handle} />
        <Typography variant="subtitle1" className={classes.title}>
          {titleLabel}
        </Typography>
        <TextField
          label={t('sharedName')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={namePlaceholder}
          error={Boolean(name) && trimmedName.length === 0}
          helperText={trimmedName.length === 0 ? t('sharedRequired') : ' '}
          fullWidth
          inputProps={{ maxLength: 100 }}
          disabled={!canEdit}
        />
        <Typography variant="body2" color="textSecondary">
          {iconLabel}
        </Typography>
        <div className={classes.grid}>
          {deviceCategories.map((item) => {
            const label = t(`category${item.replace(/^\w/, (c) => c.toUpperCase())}`) || item;
            return (
              <ButtonBase
                key={item}
                onClick={() => setCategory(item)}
                disabled={!canEdit}
                className={cx(classes.option, category === item && classes.optionSelected)}
              >
                <img src={mapIcons[item] || mapIcons.default} alt="" className={classes.optionIcon} />
                <Typography variant="caption" color="textSecondary">
                  {label}
                </Typography>
              </ButtonBase>
            );
          })}
        </div>
        <div className={classes.actions}>
          <Button variant="outlined" fullWidth onClick={onClose}>
            {t('sharedCancel')}
          </Button>
          <Button
            variant="contained"
            fullWidth
            onClick={handleSave}
            disabled={!canSave}
            startIcon={saving ? <CircularProgress size={16} /> : null}
          >
            {t('sharedSave')}
          </Button>
        </div>
      </Box>
    </SwipeableDrawer>
  );
};

export default EditDeviceSheet;
