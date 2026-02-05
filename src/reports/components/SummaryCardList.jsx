import {
  Alert,
  Box,
  Button,
  Skeleton,
  Typography,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import { useTranslation } from '../../common/components/LocalizationProvider';

const useStyles = makeStyles()((theme) => ({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
    padding: theme.spacing(2),
    [theme.breakpoints.down('md')]: {
      padding: theme.spacing(1.5),
    },
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    padding: theme.spacing(1.5, 1.75),
    borderRadius: theme.spacing(1.25),
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    boxShadow: theme.shadows[1],
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    minWidth: 0,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    color: theme.palette.text.secondary,
    fontSize: '0.75rem',
  },
  date: {
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  primary: {
    fontWeight: 600,
    fontSize: '1rem',
    color: theme.palette.text.primary,
  },
  metricsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
  },
  metricRow: {
    display: 'flex',
    flexWrap: 'wrap',
    color: theme.palette.text.secondary,
    fontSize: '0.8rem',
    lineHeight: 1.5,
    wordBreak: 'break-word',
  },
  metricLabel: {
    color: theme.palette.text.secondary,
    marginRight: theme.spacing(0.5),
  },
  metricValue: {
    color: theme.palette.text.primary,
    fontWeight: 500,
  },
  stateCard: {
    padding: theme.spacing(2),
  },
  stateHint: {
    marginTop: theme.spacing(0.5),
    color: theme.palette.text.secondary,
  },
}));

const SummaryCardList = ({
  items,
  loading = false,
  error = false,
  onRetry,
  showDeviceName = false,
  getDateLabel,
  getPrimaryLabel,
  getDetailRows,
}) => {
  const { classes } = useStyles();
  const t = useTranslation();

  if (loading) {
    return (
      <div className={classes.list}>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} variant="rounded" height={118} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={classes.list}>
        <Alert
          severity="error"
          action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>{t('reportRetry')}</Button> : null}
        >
          {t('reportEventsLoadError')}
        </Alert>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className={classes.list}>
        <Box className={classes.stateCard}>
          <Typography variant="body2">{t('sharedNoData')}</Typography>
          <Typography variant="caption" className={classes.stateHint}>
            {t('reportNoEventsHint')}
          </Typography>
        </Box>
      </div>
    );
  }

  return (
    <div className={classes.list}>
      {items.map((item) => {
        const detailRows = getDetailRows ? getDetailRows(item) : [];
        return (
          <div key={`${item.deviceId}-${item.startTime}`} className={classes.card}>
            <div className={classes.info}>
              <div className={classes.meta}>
                <span className={classes.date}>{getDateLabel(item)}</span>
                {showDeviceName && (
                  <span>{item.deviceName}</span>
                )}
              </div>
              <Typography variant="body2" className={classes.primary}>
                {getPrimaryLabel(item)}
              </Typography>
              {detailRows.length > 0 && (
                <div className={classes.metricsGrid}>
                  {detailRows.map((row, idx) => (
                    <div key={row.key || idx} className={classes.metricRow}>
                      <span className={classes.metricLabel}>{row.label}:</span>
                      <span className={classes.metricValue}>{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SummaryCardList;

