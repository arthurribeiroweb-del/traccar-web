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
  Grid,
  Box,
  Paper,
} from '@mui/material';
import { useCatch, useEffectAsync } from '../reactHelper';
import PageLayout from '../common/components/PageLayout';
import SettingsMenu from './components/SettingsMenu';
import useSettingsStyles from './common/useSettingsStyles';
import { useAdministrator } from '../common/util/permissions';
import fetchOrThrow from '../common/util/fetchOrThrow';
import MapView from '../map/core/MapView';
import MapPendingReports from './MapPendingReports';
import MapCamera from '../map/MapCamera';
import { makeStyles } from 'tss-react/mui';

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
      return 'Quebra-molas';
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

const useStyles = makeStyles()(() => ({
  tableContainer: {
    maxHeight: '600px',
    overflow: 'auto',
  },
}));

const CommunityReportsPendingPage = () => {
  const { classes: mapClasses } = useStyles();
  const { classes } = useSettingsStyles();
  const admin = useAdministrator();
  const [items, setItems] = useState([]);
  const [draftById, setDraftById] = useState({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [inlineError, setInlineError] = useState('');
  const [statusFilter, setStatusFilter] = useState(STATUS_PENDING);
  const [selectedItemId, setSelectedItemId] = useState(null);

  const pendingMode = statusFilter === STATUS_PENDING;
  const activeMode = statusFilter === STATUS_ACTIVE;

  // MVP: somente BURACO na tela Admin
  const displayItems = items.filter((item) => item.type === 'BURACO');

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
            {pendingMode && (
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={6}>
                  <Paper sx={{ height: '600px', overflow: 'hidden', border: 1, borderColor: 'divider' }}>
                    <Box sx={{ width: '100%', height: '100%' }}>
                      <MapView>
                        <MapPendingReports
                          items={displayItems}
                          draftById={draftById}
                          onItemClick={(item) => setSelectedItemId(item.id)}
                          onApprove={handleApprove}
                          onReject={handleReject}
                          savingId={savingId}
                        />
                        <MapCamera
                          coordinates={displayItems
                            .filter((item) => {
                              const draft = draftById[item.id];
                              const lat = draft ? Number(draft.latitude) : item.latitude;
                              const lon = draft ? Number(draft.longitude) : item.longitude;
                              return Number.isFinite(lat) && Number.isFinite(lon);
                            })
                            .map((item) => {
                              const draft = draftById[item.id];
                              return [
                                draft ? Number(draft.longitude) : item.longitude,
                                draft ? Number(draft.latitude) : item.latitude,
                              ];
                            })}
                        />
                      </MapView>
                    </Box>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Box className={mapClasses.tableContainer}>
                    <Table className={classes.table} size="small">
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
                {!loading && displayItems.map((item) => (
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
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
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
                ))}
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
                  </Box>
                </Grid>
              </Grid>
            )}
            {!pendingMode && (
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
                  {!loading && displayItems.map((item) => (
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
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
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
                  ))}
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
            )}
          </>
        )}
      </Container>
    </PageLayout>
  );
};

export default CommunityReportsPendingPage;
