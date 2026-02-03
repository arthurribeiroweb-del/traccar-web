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
    gap: theme.spacing(1),
    padding: theme.spacing(2),
    [theme.breakpoints.down('md')]: {
      padding: theme.spacing(1.5),
    },
  },
  card: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing(1.25),
    padding: theme.spacing(1.25, 1.5),
    borderRadius: theme.spacing(1),
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    minWidth: 0,
    flex: 1,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    color: theme.palette.text.secondary,
    fontSize: '0.75rem',
  },
  date: {
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  title: {
    fontWeight: 600,
  },
  subtitle: {
    color: theme.palette.text.secondary,
    fontSize: '0.8rem',
    lineHeight: 1.35,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
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
  getSecondaryLabel,
  getTertiaryLabel,
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
        const secondary = getSecondaryLabel(item);
        const tertiary = getTertiaryLabel(item);
        return (
          <div key={`${item.deviceId}-${item.startTime}`} className={classes.card}>
            <div className={classes.info}>
              <div className={classes.meta}>
                <span className={classes.date}>{getDateLabel(item)}</span>
                {showDeviceName && (
                  <span className={classes.subtitle} title={item.deviceName}>{item.deviceName}</span>
                )}
              </div>
              <Typography variant="body2" className={classes.title}>
                {getPrimaryLabel(item)}
              </Typography>
              {secondary && (
                <Typography className={classes.subtitle} title={secondary}>
                  {secondary}
                </Typography>
              )}
              {tertiary && (
                <Typography className={classes.subtitle} title={tertiary}>
                  {tertiary}
                </Typography>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SummaryCardList;

