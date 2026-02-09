import { useState } from 'react';
import {
  Button,
  Container,
  Stack,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useCatch, useEffectAsync } from '../reactHelper';
import PageLayout from '../common/components/PageLayout';
import SettingsMenu from './components/SettingsMenu';
import useSettingsStyles from './common/useSettingsStyles';
import { useAdministrator } from '../common/util/permissions';
import fetchOrThrow from '../common/util/fetchOrThrow';
import MapIcon from '@mui/icons-material/Map';

const STATUS_PENDING = 'pending_private';
const STATUS_ACTIVE = 'approved_public';

const formatDate = (value) => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString('pt-BR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const typeLabel = (type) => {
  switch (type) {
    case 'RADAR':
      return 'Radar';
    case 'BURACO':
      return 'Buraco';
    case 'QUEBRA_MOLAS':
      return 'Lombada';
    default:
      return type || '-';
  }
};

const formatCoordinate = (value) => Number(value || 0).toFixed(6);
const formatRadarSpeedLimit = (value) => (value == null ? '' : String(value));

const isValidCoordinate = (latitude, longitude) => Number.isFinite(latitude)
  && Number.isFinite(longitude)
  && latitude >= -90
  && latitude <= 90
  && longitude >= -180
  && longitude <= 180;

const isValidRadarSpeedLimit = (value) => Number.isInteger(value)
  && value >= 20
  && value <= 120;

const openInGoogleMaps = (latitude, longitude) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const url = `https://www.google.com/maps?q=${lat},${lng}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

const CommunityReportsPendingPage = () => {
  const { classes } = useSettingsStyles();
  const admin = useAdministrator();
  const [items, setItems] = useState([]);
  const [draftById, setDraftById] = useState({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [inlineError, setInlineError] = useState('');
  const [statusFilter, setStatusFilter] = useState(STATUS_PENDING);

  const pendingMode = statusFilter === STATUS_PENDING;
  const activeMode = statusFilter === STATUS_ACTIVE;

  const displayItems = items.filter((item) => item.type === 'BURACO' || item.type === 'QUEBRA_MOLAS');

  const loadItems = useCatch(async () => {
    setLoading(true);
    try {
      const response = await fetchOrThrow(`/api/admin/community/reports?status=${statusFilter}`);
      const loadedItems = await response.json();
      setItems(loadedItems);
      setDraftById((previous) => {
        const next = {};
        loadedItems.forEach((item) => {
          next[item.id] = {
            latitude: previous[item.id]?.latitude ?? formatCoordinate(item.latitude),
            longitude: previous[item.id]?.longitude ?? formatCoordinate(item.longitude),
            radarSpeedLimit: previous[item.id]?.radarSpeedLimit ?? formatRadarSpeedLimit(item.radarSpeedLimit),
          };
        });
        return next;
      });
    } finally {
      setLoading(false);
    }
  });

  useEffectAsync(async () => {
    await loadItems();
  }, [statusFilter]);

  const handleDraftChange = (id, field, value) => {
    setDraftById((previous) => ({
      ...previous,
      [id]: {
        latitude: previous[id]?.latitude ?? '',
        longitude: previous[id]?.longitude ?? '',
        radarSpeedLimit: previous[id]?.radarSpeedLimit ?? '',
        [field]: value,
      },
    }));
  };

  const resetDraft = (item) => {
    setDraftById((previous) => ({
      ...previous,
      [item.id]: {
        latitude: formatCoordinate(item.latitude),
        longitude: formatCoordinate(item.longitude),
        radarSpeedLimit: formatRadarSpeedLimit(item.radarSpeedLimit),
      },
    }));
  };

  const handleApprove = useCatch(async (item) => {
    const draft = draftById[item.id] || {
      latitude: formatCoordinate(item.latitude),
      longitude: formatCoordinate(item.longitude),
      radarSpeedLimit: formatRadarSpeedLimit(item.radarSpeedLimit),
    };
    const latitude = Number(draft.latitude);
    const longitude = Number(draft.longitude);
    const radarSpeedLimit = Number(draft.radarSpeedLimit);

    if (!isValidCoordinate(latitude, longitude)) {
      setInlineError('Latitude/longitude invalidas. Ajuste antes de aprovar.');
      return;
    }
    if (item.type === 'RADAR' && !isValidRadarSpeedLimit(radarSpeedLimit)) {
      setInlineError('Velocidade do radar invalida. Use 20 a 120 km/h.');
      return;
    }

    setInlineError('');
    setSavingId(`approve-${item.id}`);
    try {
      const payload = {
        latitude,
        longitude,
      };
      if (item.type === 'RADAR') {
        payload.radarSpeedLimit = radarSpeedLimit;
      }
      await fetchOrThrow(`/api/admin/community/reports/${item.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setItems((values) => values.filter((value) => value.id !== item.id));
    } finally {
      setSavingId(null);
    }
  });

  const handleReject = useCatch(async (id) => {
    setInlineError('');
    setSavingId(`reject-${id}`);
    try {
      await fetchOrThrow(`/api/admin/community/reports/${id}/reject`, { method: 'POST' });
      setItems((values) => values.filter((item) => item.id !== id));
    } finally {
      setSavingId(null);
    }
  });

  const handleDeactivate = useCatch(async (id) => {
    setInlineError('');
    setSavingId(`deactivate-${id}`);
    try {
      await fetchOrThrow(`/api/admin/community/reports/${id}/deactivate`, { method: 'POST' });
      setItems((values) => values.filter((item) => item.id !== id));
    } finally {
      setSavingId(null);
    }
  });

  return (
    <PageLayout menu={<SettingsMenu />} breadcrumbs={['settingsTitle', 'communityReportsPendingMenu']}>
      <Container maxWidth="lg" className={classes.container}>
        {!admin ? (
          <Typography variant="body1">
            Acesso restrito para administrador.
          </Typography>
        ) : (
          <>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Button
                variant={pendingMode ? 'contained' : 'outlined'}
                onClick={() => {
                  setInlineError('');
                  setStatusFilter(STATUS_PENDING);
                }}
                disabled={savingId !== null}
              >
                Pendentes
              </Button>
              <Button
                variant={activeMode ? 'contained' : 'outlined'}
                onClick={() => {
                  setInlineError('');
                  setStatusFilter(STATUS_ACTIVE);
                }}
                disabled={savingId !== null}
              >
                Ativos
              </Button>
            </Stack>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {pendingMode ? 'Buracos pendentes para aprovacao' : 'Buracos ativos no mapa'}
            </Typography>
            {inlineError && (
              <Typography variant="body2" color="error" sx={{ mb: 2 }}>
                {inlineError}
              </Typography>
            )}
            <Table className={classes.table}>
              <TableHead>
                <TableRow>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Latitude</TableCell>
                  <TableCell>Longitude</TableCell>
                  <TableCell>{pendingMode ? 'Criado em' : 'Aprovado em'}</TableCell>
                  <TableCell>Autor</TableCell>
                  <TableCell align="right">Acoes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!loading && displayItems.map((item) => {
                  const lat = draftById[item.id] ? Number(draftById[item.id].latitude) : item.latitude;
                  const lng = draftById[item.id] ? Number(draftById[item.id].longitude) : item.longitude;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{typeLabel(item.type)}</TableCell>
                      <TableCell>
                        {pendingMode ? (
                          <TextField
                            size="small"
                            type="number"
                            value={draftById[item.id]?.latitude ?? formatCoordinate(item.latitude)}
                            onChange={(event) => handleDraftChange(item.id, 'latitude', event.target.value)}
                            inputProps={{ step: 'any' }}
                          />
                        ) : (
                          formatCoordinate(item.latitude)
                        )}
                      </TableCell>
                      <TableCell>
                        {pendingMode ? (
                          <TextField
                            size="small"
                            type="number"
                            value={draftById[item.id]?.longitude ?? formatCoordinate(item.longitude)}
                            onChange={(event) => handleDraftChange(item.id, 'longitude', event.target.value)}
                            inputProps={{ step: 'any' }}
                          />
                        ) : (
                          formatCoordinate(item.longitude)
                        )}
                      </TableCell>
                      <TableCell>{formatDate(pendingMode ? item.createdAt : item.approvedAt)}</TableCell>
                      <TableCell>{item.authorName || `#${item.createdByUserId}`}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap">
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<MapIcon />}
                            onClick={() => openInGoogleMaps(lat, lng)}
                            title="Abrir local no Google Maps"
                          >
                            Ver no mapa
                          </Button>
                          {pendingMode ? (
                            <>
                              <Button
                                variant="text"
                                size="small"
                                disabled={savingId !== null}
                                onClick={() => resetDraft(item)}
                              >
                                Original
                              </Button>
                              <Button
                                variant="contained"
                                size="small"
                                disabled={savingId !== null}
                                onClick={() => handleApprove(item)}
                              >
                                Aprovar
                              </Button>
                              <Button
                                variant="outlined"
                                color="error"
                                size="small"
                                disabled={savingId !== null}
                                onClick={() => handleReject(item.id)}
                              >
                                Rejeitar
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              disabled={savingId !== null}
                              onClick={() => handleDeactivate(item.id)}
                            >
                              Remover do mapa
                            </Button>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && displayItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      {pendingMode ? 'Nenhum buraco pendente.' : 'Nenhum buraco ativo.'}
                    </TableCell>
                  </TableRow>
                )}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      Carregando...
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </>
        )}
      </Container>
    </PageLayout>
  );
};

export default CommunityReportsPendingPage;
