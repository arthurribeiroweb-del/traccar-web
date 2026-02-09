import { useState } from 'react';
import {
  Button,
  Container,
  Stack,
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
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const loadItems = useCatch(async () => {
    setLoading(true);
    try {
      const response = await fetchOrThrow('/api/admin/community/reports?status=pending_private');
      setItems(await response.json());
    } finally {
      setLoading(false);
    }
  });

  useEffectAsync(async () => {
    await loadItems();
  }, []);

  const handleApprove = useCatch(async (id) => {
    setSavingId(`approve-${id}`);
    try {
      await fetchOrThrow(`/api/admin/community/reports/${id}/approve`, { method: 'POST' });
      setItems((values) => values.filter((item) => item.id !== id));
    } finally {
      setSavingId(null);
    }
  });

  const handleReject = useCatch(async (id) => {
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
                    <TableCell>{Number(item.latitude).toFixed(6)}</TableCell>
                    <TableCell>{Number(item.longitude).toFixed(6)}</TableCell>
                    <TableCell>{formatDate(item.createdAt)}</TableCell>
                    <TableCell>{item.authorName || `#${item.createdByUserId}`}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          variant="contained"
                          size="small"
                          disabled={savingId !== null}
                          onClick={() => handleApprove(item.id)}
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
