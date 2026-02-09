import { Tooltip, IconButton } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { makeStyles } from 'tss-react/mui';
import { alpha } from '@mui/material/styles';
import { useTranslation } from '../common/components/LocalizationProvider';

const useStyles = makeStyles()((theme, { active }) => ({
  button: {
    width: 44,
    height: 44,
    color: active ? theme.palette.warning.main : theme.palette.text.primary,
    backgroundColor: active ? alpha(theme.palette.warning.main, 0.16) : 'transparent',
    '&:hover': {
      backgroundColor: active
        ? alpha(theme.palette.warning.main, 0.24)
        : alpha(theme.palette.action.active, 0.08),
    },
  },
}));

const ReportButton = ({ active, onClick }) => {
  const t = useTranslation();
  const { classes } = useStyles({ active: Boolean(active) });
  const label = t('communityReportButton') || 'Reportar';

  return (
    <Tooltip title={label}>
      <IconButton
        className={classes.button}
        onClick={onClick}
        aria-label={label}
      >
        <WarningAmberIcon />
      </IconButton>
    </Tooltip>
  );
};

export default ReportButton;
