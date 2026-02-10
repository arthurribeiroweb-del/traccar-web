import dayjs from 'dayjs';
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { getEventTitle } from '../../common/eventLabels';
import AddressText from './AddressText';

const severityMeta = {
  high: { label: 'Excesso de velocidade', colorKey: 'error' },
  medium: { label: 'Entrada/saída de cerca', colorKey: 'warning' },
  low: { label: 'Ignição', colorKey: 'neutral' },
};

const SafetyCard = ({
  events,
  t,
  onOpenEvents,
}) => {
  const theme = useTheme();

  return (
    <Card
      sx={{
        borderRadius: 18,
        height: '100%',
        boxShadow: '0 10px 24px rgba(0,0,0,0.06)',
      }}
    >
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle2" color="text.secondary">
            Segurança
          </Typography>
          <Button size="small" onClick={onOpenEvents}>
            Ver todos os eventos
          </Button>
        </Stack>
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {(events || []).length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Nenhum evento relevante no período.
            </Typography>
          )}
          {(events || []).map((item, index) => {
            const meta = severityMeta[item.severity] || severityMeta.low;
            const color = theme.palette[meta.colorKey]?.main || theme.palette.text.secondary;
            const prev = events[index - 1];
            const showDivider = index > 0 && prev?.severity !== item.severity;

            return (
              <Box key={item.event.id || `${item.event.type}-${item.time}`}>
                {showDivider && <Divider sx={{ my: 1 }} />}
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <FiberManualRecordIcon sx={{ fontSize: 14, color, mt: 0.4 }} />
                  <Stack spacing={0.4} sx={{ flex: 1 }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {getEventTitle(item.event, t) || meta.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {dayjs(item.time).format('HH:mm')}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {meta.label}
                    </Typography>
                    <AddressText value={item.address} variant="caption" />
                  </Stack>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
};

export default SafetyCard;
