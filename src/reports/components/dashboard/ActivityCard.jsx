import { useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
  Bar, BarChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from 'recharts';
import { formatDistance, formatNumericHours } from '../../../common/util/formatter';

const ActivityCard = ({
  series,
  movementTotals,
  distanceUnit,
  t,
}) => {
  const theme = useTheme();
  const [mode, setMode] = useState('distance');
  const barColor = alpha(
    theme.palette.primary.main,
    theme.palette.mode === 'dark' ? 0.55 : 0.8,
  );

  const totals = useMemo(() => {
    const moving = movementTotals?.moving || 0;
    const stopped = movementTotals?.stopped || 0;
    const total = moving + stopped;
    return {
      moving,
      stopped,
      total,
      movingPct: total ? Math.round((moving / total) * 100) : 0,
      stoppedPct: total ? Math.round((stopped / total) * 100) : 0,
    };
  }, [movementTotals]);

  return (
    <Card
      sx={{
        borderRadius: 18,
        height: '100%',
        boxShadow: '0 10px 24px rgba(0,0,0,0.06)',
      }}
    >
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography variant="subtitle2" color="text.secondary">
            Atividade
          </Typography>
          <ToggleButtonGroup
            size="small"
            value={mode}
            exclusive
            onChange={(_, value) => value && setMode(value)}
            aria-label="Alternar atividade"
          >
            <ToggleButton value="distance" aria-label="Distância">Distância</ToggleButton>
            <ToggleButton value="movement" aria-label="Movimento">Movimento</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Box sx={{ height: 180, mt: 2 }}>
          {mode === 'distance' ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series || []} margin={{ top: 8, right: 8, bottom: 8, left: -10 }}>
                <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={11} />
                <YAxis hide />
                <RechartsTooltip
                  formatter={(value) => formatDistance(value, distanceUnit, t)}
                  labelFormatter={(label) => `Dia ${label}`}
                />
                <Bar dataKey="distance" fill={barColor} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Stack spacing={2} sx={{ mt: 2 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Movimento</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {formatNumericHours(totals.moving, t)}
                </Typography>
              </Stack>
              <Box
                sx={{
                  display: 'flex',
                  height: 12,
                  borderRadius: 20,
                  overflow: 'hidden',
                  backgroundColor: (theme) => alpha(theme.palette.divider, 0.4),
                }}
              >
                <Box
                  sx={{
                    width: `${totals.movingPct}%`,
                    backgroundColor: (theme) => theme.palette.primary.main,
                  }}
                />
                <Box
                  sx={{
                    width: `${totals.stoppedPct}%`,
                    backgroundColor: (theme) => alpha(theme.palette.text.primary, 0.4),
                  }}
                />
              </Box>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Parado</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {formatNumericHours(totals.stopped, t)}
                </Typography>
              </Stack>
            </Stack>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default ActivityCard;
