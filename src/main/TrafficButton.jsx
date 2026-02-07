import { Tooltip, IconButton } from '@mui/material';
import TrafficIcon from '@mui/icons-material/Traffic';
import { makeStyles } from 'tss-react/mui';
import { alpha } from '@mui/material/styles';
import { useTranslation } from '../common/components/LocalizationProvider';

const useStyles = makeStyles()((theme, { active }) => ({
  button: {
    width: 44,
    height: 44,
    color: active ? theme.palette.primary.main : theme.palette.text.primary,
    backgroundColor: active ? alpha(theme.palette.primary.main, 0.16) : 'transparent',
    '&:hover': {
      backgroundColor: active
        ? alpha(theme.palette.primary.main, 0.24)
        : alpha(theme.palette.action.active, 0.08),
    },
  },
}));

const TrafficButton = ({ active, onClick }) => {
  const t = useTranslation();
  const { classes } = useStyles({ active: Boolean(active) });

  return (
    <Tooltip title={t('trafficLiveWaze')}>
      <IconButton
        className={classes.button}
        onClick={onClick}
        aria-label={t('trafficLiveWaze')}
      >
        <TrafficIcon />
      </IconButton>
    </Tooltip>
  );
};

export default TrafficButton;
