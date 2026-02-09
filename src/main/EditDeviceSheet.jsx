import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SwipeableDrawer,
  Box,
  Typography,
  TextField,
  Button,
  ButtonBase,
  CircularProgress,
  Snackbar,
  Alert,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { makeStyles } from 'tss-react/mui';
import { useDispatch } from 'react-redux';
import { useTranslation } from '../common/components/LocalizationProvider';
import deviceCategories from '../common/util/deviceCategories';
import { mapIcons } from '../map/core/preloadImages';
import { devicesActions, errorsActions } from '../store';
import { useDeviceReadonly, useRestriction } from '../common/util/permissions';
import { getDeviceDisplayName } from '../common/util/deviceUtils';

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
  helper: {
    marginBottom: theme.spacing(1.5),
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
    minHeight: 72,
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
  const [toast, setToast] = useState({
    open: false,
    message: '',
    severity: 'success',
    retry: false,
  });

  useEffect(() => {
    if (device && open) {
      setName(getDeviceDisplayName(device) || device.name || '');
      setCategory(device.category || 'default');
    }
  }, [device, open]);

  const trimmedName = name.trim();
  const namePlaceholder = t('deviceNamePlaceholder') || 'Ex.: AMAROK 2';
  const iconLabel = t('deviceMapIcon') || t('deviceCategory');
  const titleLabel = t('deviceEditTitle') || t('sharedEdit');
  const helperLabel = t('deviceEditHelper') || 'Voce pode personalizar o nome e o icone do seu veiculo.';

  const canEditName = !readonly && !deviceReadonly;
  const canEditCategory = !readonly && !deviceReadonly;

  const { hasChanges, nameChanged, categoryChanged } = useMemo(() => {
    if (!device) return { hasChanges: false, nameChanged: false, categoryChanged: false };
    const currentDisplay = getDeviceDisplayName(device) || device.name || '';
    const nameChanged = trimmedName !== currentDisplay;
    const categoryChanged = category !== (device.category || 'default');
    return { hasChanges: nameChanged || categoryChanged, nameChanged, categoryChanged };
  }, [device, trimmedName, category]);

  const canSave = Boolean(
    trimmedName.length > 0 && hasChanges && !saving
    && (!nameChanged || canEditName)
    && (!categoryChanged || canEditCategory),
  );

  const closeToast = useCallback(() => {
    setToast((current) => ({ ...current, open: false, retry: false }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!device || !canSave) return;
    setSaving(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const payload = { id: device.id, name: trimmedName, category };
      const response = await fetch(`/api/devices/${device.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new Error(await response.text());
        error.status = response.status;
        throw error;
      }

      const saved = await response.json();
      dispatch(devicesActions.update([saved]));
      setToast({
        open: true,
        message: t('deviceEditSaveSuccess') || 'Alteracoes salvas.',
        severity: 'success',
        retry: false,
      });
      onClose?.();
    } catch (error) {
      let message;
      let retry = true;

      if (error.name === 'AbortError') {
        message = t('deviceEditSaveFailed') || 'Nao foi possivel salvar. Verifique a conexao e tente novamente.';
      } else if (error.status === 403) {
        message = t('deviceEditPermissionError') || 'Voce nao tem permissao para editar este veiculo.';
        retry = false;
      } else if (error.status === 409 || error.status === 400) {
        message = t('deviceEditInvalidName') || 'Nome invalido.';
      } else {
        message = t('deviceEditSaveFailed') || 'Nao foi possivel salvar. Verifique a conexao e tente novamente.';
      }

      setToast({
        open: true,
        message,
        severity: 'error',
        retry,
      });
      dispatch(errorsActions.push(message));
    } finally {
      clearTimeout(timeoutId);
      setSaving(false);
    }
  }, [canSave, category, device, dispatch, onClose, t, trimmedName]);

  const handleRetry = useCallback(() => {
    closeToast();
    handleSave();
  }, [closeToast, handleSave]);

  return (
    <>
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
            helperText={Boolean(name) && trimmedName.length === 0 ? t('sharedRequired') : helperLabel}
            fullWidth
            inputProps={{ maxLength: 100 }}
            disabled={!canEditName || saving}
          />
          <Typography variant="body2" color="textSecondary" className={classes.helper}>
            {iconLabel}
          </Typography>
          <div className={classes.grid}>
            {deviceCategories.map((item) => {
              const label = t(`category${item.replace(/^\w/, (c) => c.toUpperCase())}`) || item;
              return (
                <ButtonBase
                  key={item}
                  onClick={() => setCategory(item)}
                  disabled={!canEditCategory || saving}
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
            <Button variant="outlined" fullWidth onClick={onClose} disabled={saving}>
              {t('sharedCancel')}
            </Button>
            <Button
              variant="contained"
              fullWidth
              onClick={handleSave}
              disabled={!canSave}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {saving ? (t('deviceEditSaving') || 'Salvando...') : t('sharedSave')}
            </Button>
          </div>
        </Box>
      </SwipeableDrawer>
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={closeToast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          aria-live={toast.severity === 'error' ? 'assertive' : 'polite'}
          onClose={closeToast}
          action={toast.retry ? (
            <Button color="inherit" size="small" onClick={handleRetry} disabled={saving}>
              {t('deviceEditRetry') || 'Tentar novamente'}
            </Button>
          ) : null}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default EditDeviceSheet;
