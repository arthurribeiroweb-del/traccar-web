import {
  Card,
  CardContent,
  Stack,
  Typography,
  Tooltip,
  IconButton,
  Divider,
  Box,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { alpha } from '@mui/material/styles';
import {
  formatDistance,
  formatNumericHours,
  formatSpeed,
} from '../../../common/util/formatter';

const KpiHeroCard = ({
  kpis,
  distanceUnit,
  speedUnit,
  t,
}) => {
  const distance = kpis ? formatDistance(kpis.distance || 0, distanceUnit, t) : '--';
  const moving = kpis ? formatNumericHours(kpis.moving || 0, t) : '--';
  const stopped = kpis ? formatNumericHours(kpis.stopped || 0, t) : '--';
  const maxSpeed = kpis?.maxSpeed > 0 ? formatSpeed(kpis.maxSpeed, speedUnit, t) : '--';
  const avgSpeed = kpis?.avgSpeed > 0 ? formatSpeed(kpis.avgSpeed, speedUnit, t) : '--';

  return (
    <Card
      sx={{
        borderRadius: 18,
        position: 'relative',
        overflow: 'hidden',
        background: (theme) => `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)}, ${alpha(theme.palette.background.paper, 0.9)})`,
        boxShadow: '0 12px 30px rgba(0,0,0,0.08)',
      }}
    >
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ letterSpacing: 0.5 }}>
            Resumo premium
          </Typography>
          <Tooltip title="Pode variar conforme GPS/odômetro">
            <IconButton size="small" aria-label="Mais informações">
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <Typography variant="h3" fontWeight={700}>
            {distance}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Baseado nas viagens detectadas
          </Typography>
        </Stack>
        <Divider sx={{ my: 2 }} />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 1.5,
          }}
        >
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Movimento
            </Typography>
            <Typography variant="subtitle1" fontWeight={600}>{moving}</Typography>
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Parado
            </Typography>
            <Typography variant="subtitle1" fontWeight={600}>{stopped}</Typography>
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Vel. máx
            </Typography>
            <Typography variant="subtitle1" fontWeight={600}>{maxSpeed}</Typography>
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Vel. média
            </Typography>
            <Typography variant="subtitle1" fontWeight={600}>{avgSpeed}</Typography>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
};

export default KpiHeroCard;
