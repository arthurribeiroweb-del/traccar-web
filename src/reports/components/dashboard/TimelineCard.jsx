import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { formatDistance, formatNumericHours } from '../../../common/util/formatter';
import AddressText from './AddressText';

const TimelineCard = ({
  items,
  period,
  to,
  distanceUnit,
  t,
  onOpenTrips,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery('(max-width:768px)');

  const options = useMemo(() => {
    if (period === 'last7' || period === 'last30') {
      return [
        { key: 'last24', label: 'Últimas 24h' },
        { key: 'yesterday', label: 'Ontem' },
      ];
    }
    return [
      { key: 'today', label: 'Hoje' },
      { key: 'yesterday', label: 'Ontem' },
    ];
  }, [period]);

  const [selected, setSelected] = useState(options[0].key);

  useEffect(() => {
    setSelected(options[0].key);
  }, [options]);

  const anchor = useMemo(() => (to ? dayjs(to) : dayjs()), [to]);

  const range = useMemo(() => {
    switch (selected) {
      case 'yesterday': {
        const start = anchor.subtract(1, 'day').startOf('day');
        return { start, end: anchor.subtract(1, 'day').endOf('day') };
      }
      case 'last24': {
        const end = anchor;
        return { start: anchor.subtract(24, 'hour'), end };
      }
      case 'today':
      default: {
        return { start: anchor.startOf('day'), end: anchor.endOf('day') };
      }
    }
  }, [anchor, selected]);

  const filteredItems = useMemo(() => (
    (items || []).filter((item) => {
      const time = dayjs(item.startTime);
      return !time.isBefore(range.start) && !time.isAfter(range.end);
    })
  ), [items, range]);

  const visibleItems = isMobile ? filteredItems.slice(0, 4) : filteredItems;

  return (
    <Card
      sx={{
        borderRadius: 18,
        boxShadow: '0 10px 24px rgba(0,0,0,0.06)',
      }}
    >
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography variant="subtitle2" color="text.secondary">
            Linha do tempo
          </Typography>
          <Stack direction="row" spacing={1}>
            {options.map((option) => (
              <Chip
                key={option.key}
                label={option.label}
                size="small"
                color={selected === option.key ? 'secondary' : 'default'}
                onClick={() => setSelected(option.key)}
                aria-label={`Filtrar linha do tempo: ${option.label}`}
                sx={{ borderRadius: 2 }}
              />
            ))}
          </Stack>
        </Stack>
        <Stack spacing={2} sx={{ mt: 2 }}>
          {visibleItems.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Sem atividade no período.
            </Typography>
          )}
          {visibleItems.map((item, index) => {
            const isTrip = item.type === 'trip';
            const timeLabel = isTrip
              ? `Saiu ${dayjs(item.startTime).format('HH:mm')} - Chegou ${dayjs(item.endTime).format('HH:mm')}`
              : `Parado desde ${dayjs(item.startTime).format('HH:mm')}`;
            const distanceLabel = isTrip ? formatDistance(item.distance || 0, distanceUnit, t) : null;
            const durationLabel = formatNumericHours(item.duration || 0, t);
            const address = isTrip
              ? `${item.startAddress || '--'} -> ${item.endAddress || '--'}`
              : item.address || '--';

            return (
              <Box
                key={item.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '16px 1fr',
                  gap: 1.5,
                  alignItems: 'flex-start',
                }}
              >
                <Box
                  sx={{
                    position: 'relative',
                    minHeight: 36,
                    display: 'flex',
                    justifyContent: 'center',
                  }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: isTrip ? theme.palette.primary.main : alpha(theme.palette.text.primary, 0.4),
                      mt: 0.5,
                    }}
                  />
                  {index !== visibleItems.length - 1 && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 16,
                        bottom: -16,
                        width: 1,
                        backgroundColor: alpha(theme.palette.divider, 0.6),
                      }}
                    />
                  )}
                </Box>
                <Stack spacing={0.6}>
                  <Typography variant="subtitle2" fontWeight={600}>
                    {timeLabel}
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    {distanceLabel && (
                      <Typography variant="caption" color="text.secondary">
                        {distanceLabel}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      {durationLabel}
                    </Typography>
                  </Stack>
                  <AddressText value={address} variant="caption" />
                </Stack>
              </Box>
            );
          })}
        </Stack>
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
          <Button size="small" onClick={onOpenTrips}>
            {isMobile ? 'Ver mais' : 'Ver todas as viagens'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default TimelineCard;
