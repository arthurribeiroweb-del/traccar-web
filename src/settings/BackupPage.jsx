import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Container,
  Divider,
  FormControlLabel,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { MuiFileInput } from 'mui-file-input';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAdministrator } from '../common/util/permissions';
import PageLayout from '../common/components/PageLayout';
import SettingsMenu from './components/SettingsMenu';
import useSettingsStyles from './common/useSettingsStyles';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { useCatch } from '../reactHelper';

const pollInterval = 2000;

const BackupPage = () => {
  const { classes } = useSettingsStyles();
  const t = useTranslation();
  const admin = useAdministrator();

  const [exportStatus, setExportStatus] = useState(null);
  const [importStatus, setImportStatus] = useState(null);

  const [restoreFile, setRestoreFile] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [replaceAll, setReplaceAll] = useState(true);

  const pollExport = useCatch(async () => {
    if (!exportStatus?.id) {
      return;
    }
    const response = await fetchOrThrow(`/api/admin/backup/status?id=${exportStatus.id}`);
    const data = await response.json();
    setExportStatus(data);
  });

  const pollImport = useCatch(async () => {
    if (!importStatus?.id) {
      return;
    }
    const response = await fetchOrThrow(`/api/admin/backup/status?id=${importStatus.id}`);
    const data = await response.json();
    setImportStatus(data);
  });

  useEffect(() => {
    if (!exportStatus?.id || ['SUCCESS', 'ERROR'].includes(exportStatus.state)) {
      return undefined;
    }
    const interval = setInterval(pollExport, pollInterval);
    return () => clearInterval(interval);
  }, [exportStatus?.id, exportStatus?.state, pollExport]);

  useEffect(() => {
    if (!importStatus?.id || ['SUCCESS', 'ERROR'].includes(importStatus.state)) {
      return undefined;
    }
    const interval = setInterval(pollImport, pollInterval);
    return () => clearInterval(interval);
  }, [importStatus?.id, importStatus?.state, pollImport]);

  const handleExport = useCatch(async () => {
    const response = await fetchOrThrow('/api/admin/backup/export', { method: 'POST' });
    const data = await response.json();
    setExportStatus({ id: data.backupId, fileName: data.filename });
  });

  const handleDownload = useCatch(async () => {
    if (!exportStatus?.id) {
      return;
    }
    const response = await fetchOrThrow(`/api/admin/backup/download?backupId=${exportStatus.id}`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportStatus.fileName || 'backup.zip';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  });

  const handleImport = useCatch(async () => {
    if (!restoreFile) {
      throw new Error(t('sharedSelectFile'));
    }
    const headers = {
      'X-Backup-Confirm': confirmText,
      'X-Backup-Password': password,
      'X-Backup-Mode': replaceAll ? 'replace' : 'merge',
    };
    if (totp) {
      headers['X-Backup-Totp'] = totp;
    }
    const response = await fetchOrThrow('/api/admin/backup/import', {
      method: 'POST',
      headers,
      body: restoreFile,
    });
    setImportStatus(await response.json());
  });

  const renderStatus = (status) => (
    status && (
      <Box sx={{ mt: 2 }}>
        <Typography variant="body2">
          {t('backupStatus')}: {status.state} {status.message ? `- ${status.message}` : ''}
        </Typography>
        {status.metadata?.serverVersion && (
          <Typography variant="caption" color="textSecondary">
            {status.metadata.serverVersion} | {status.metadata.databaseType}
          </Typography>
        )}
        {status.log?.length > 0 && (
          <Paper variant="outlined" sx={{ mt: 1, p: 1 }}>
            <Typography variant="caption" component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap' }}>
              {status.log.join('\n')}
            </Typography>
          </Paper>
        )}
      </Box>
    )
  );

  return (
    <PageLayout menu={<SettingsMenu />} breadcrumbs={['settingsTitle', 'settingsBackup']}>
      <Container maxWidth="sm" className={classes.container}>
        {!admin ? (
          <Typography variant="body1">
            {t('backupAdminOnly')}
          </Typography>
        ) : (
          <>
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6">{t('backupExport')}</Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                {t('backupExportHint')}
              </Typography>
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                {t('backupChecksumHint')}
              </Typography>
              <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleExport}
                  disabled={exportStatus && !['SUCCESS', 'ERROR'].includes(exportStatus.state)}
                >
                  {t('backupExportButton')}
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleDownload}
                  disabled={!exportStatus || exportStatus.state !== 'SUCCESS'}
                >
                  {t('backupDownload')}
                </Button>
              </Box>
              {renderStatus(exportStatus)}
            </Paper>

            <Divider sx={{ my: 2 }} />

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6">{t('backupImport')}</Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                {t('backupImportHint')}
              </Typography>
              <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                {t('backupImportWarning')}
              </Typography>
              <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <MuiFileInput
                  placeholder={t('sharedSelectFile')}
                  value={restoreFile}
                  onChange={setRestoreFile}
                />
                <TextField
                  label={t('backupConfirmLabel')}
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  helperText={t('backupConfirmHelp')}
                />
                <TextField
                  label={t('userPassword')}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <TextField
                  label={t('loginTotpCode')}
                  value={totp}
                  onChange={(event) => setTotp(event.target.value)}
                />
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={replaceAll}
                      onChange={(event) => setReplaceAll(event.target.checked)}
                    />
                  )}
                  label={t('backupReplaceAll')}
                />
                <Button
                  variant="contained"
                  color="error"
                  onClick={handleImport}
                  disabled={!restoreFile || !confirmText || !password || (importStatus && !['SUCCESS', 'ERROR'].includes(importStatus.state))}
                >
                  {t('backupImportButton')}
                </Button>
              </Box>
              {renderStatus(importStatus)}
            </Paper>
          </>
        )}
      </Container>
    </PageLayout>
  );
};

export default BackupPage;
