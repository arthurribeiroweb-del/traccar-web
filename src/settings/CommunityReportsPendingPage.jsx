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

const CommunityReportsPendingPage = () => {
  const { classes } = useSettingsStyles();
  const admin = useAdministrator();
  const [items, setItems] = useState([]);
  const [draftById, setDraftById] = useState({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [inlineError, setInlineError] = useState('');

  const formatCoordinate = (value) => Number(value || 0).toFixed(6);

  const isValidCoordinate = (latitude, longitude) => Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;

  const loadItems = useCatch(async () => {
    setLoading(true);
    try {
      const response = await fetchOrThrow('/api/admin/community/reports?status=pending_private');
      const loadedItems = await response.json();
      setItems(loadedItems);
      setDraftById((previous) => {
        const next = {};
        loadedItems.forEach((item) => {
          next[item.id] = {
            latitude: previous[item.id]?.latitude ?? formatCoordinate(item.latitude),
            longitude: previous[item.id]?.longitude ?? formatCoordinate(item.longitude),
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
  }, []);

  const handleCoordinateChange = (id, field, value) => {
    setDraftById((previous) => ({
      ...previous,
      [id]: {
        latitude: previous[id]?.latitude ?? '',
        longitude: previous[id]?.longitude ?? '',
        [field]: value,
      },
    }));
  };

  const resetCoordinates = (item) => {
    setDraftById((previous) => ({
      ...previous,
      [item.id]: {
        latitude: formatCoordinate(item.latitude),
        longitude: formatCoordinate(item.longitude),
      },
    }));
  };

  const handleApprove = useCatch(async (item) => {
    const draft = draftById[item.id] || {
      latitude: formatCoordinate(item.latitude),
      longitude: formatCoordinate(item.longitude),
    };
    const latitude = Number(draft.latitude);
    const longitude = Number(draft.longitude);

    if (!isValidCoordinate(latitude, longitude)) {
      setInlineError('Latitude/longitude invalidas. Ajuste antes de aprovar.');
      return;
    }

    setInlineError('');
    setSavingId(`approve-${item.id}`);
    try {
      await fetchOrThrow(`/api/admin/community/reports/${item.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude }),
      });
      setItems((values) => values.filter((value) => value.id !== item.id));
      setDraftById((values) => {
        const next = { ...values };
        delete next[item.id];
        return next;
      });
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

  return (
    <PageLayout menu={<SettingsMenu />} breadcrumbs={['settingsTitle', 'communityReportsPendingMenu']}>
      <Container maxWidth="lg" className={classes.container}>
        {!admin ? (
          <Typography variant="body1">
            Acesso restrito para administrador.
          </Typography>
        ) : (
          <>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Pendentes
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
                  <TableCell>Criado em</TableCell>
                  <TableCell>Autor</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!loading && items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{typeLabel(item.type)}</TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={draftById[item.id]?.latitude ?? formatCoordinate(item.latitude)}
                        onChange={(event) => handleCoordinateChange(item.id, 'latitude', event.target.value)}
                        inputProps={{ step: 'any' }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={draftById[item.id]?.longitude ?? formatCoordinate(item.longitude)}
                        onChange={(event) => handleCoordinateChange(item.id, 'longitude', event.target.value)}
                        inputProps={{ step: 'any' }}
                      />
                    </TableCell>
                    <TableCell>{formatDate(item.createdAt)}</TableCell>
                    <TableCell>{item.authorName || `#${item.createdByUserId}`}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          variant="text"
                          size="small"
                          disabled={savingId !== null}
                          onClick={() => resetCoordinates(item)}
                        >
                          Original
                        </Button>
                        <Button
                          variant="contained"
                          size="small"
                          disabled={savingId !== null}
                          onClick={() => handleApprove(item)}
                        >
                          Aprovar c/ local
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
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      Nenhum aviso pendente.
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
