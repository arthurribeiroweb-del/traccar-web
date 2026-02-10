import { Alert, Button } from '@mui/material';
import { useTranslation } from './LocalizationProvider';

const InlineError = ({ message, actionLabel, onAction }) => {
  const t = useTranslation();
  return (
    <Alert
      severity="error"
      role="alert"
      action={onAction ? (
        <Button color="inherit" size="small" onClick={onAction}>
          {actionLabel || t('reportRetry') || 'Tentar novamente'}
        </Button>
      ) : null}
      sx={{ borderRadius: 3 }}
    >
      {message}
    </Alert>
  );
};

export default InlineError;
