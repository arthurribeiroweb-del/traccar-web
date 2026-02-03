import { useMemo, useState } from 'react';
import {
  Box,
  Skeleton,
  Table,
  TableRow,
  TableCell,
  TableHead,
  TableBody,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import { useEffectAsync } from '../reactHelper';
import { prefixString } from '../common/util/stringUtils';
import { formatBoolean } from '../common/util/formatter';
import { useTranslation } from '../common/components/LocalizationProvider';
import PageLayout from '../common/components/PageLayout';
import SettingsMenu from './components/SettingsMenu';
import CollectionFab from './components/CollectionFab';
import CollectionActions from './components/CollectionActions';
import TableShimmer from '../common/components/TableShimmer';
import SearchHeader, { filterByKeyword } from './components/SearchHeader';
import useSettingsStyles from './common/useSettingsStyles';
import fetchOrThrow from '../common/util/fetchOrThrow';

const useStyles = makeStyles()((theme) => ({
  cards: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    padding: theme.spacing(1.5),
    marginBottom: theme.spacing(10),
  },
  card: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
    padding: theme.spacing(1.25, 1.25, 1.25, 1.5),
    borderRadius: theme.spacing(1),
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
  },
  cardInfo: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.4),
    flex: 1,
  },
  cardTitle: {
    fontWeight: 600,
    lineHeight: 1.25,
  },
  line: {
    color: theme.palette.text.secondary,
    fontSize: '0.8rem',
    lineHeight: 1.35,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  actionWrap: {
    flexShrink: 0,
    marginTop: theme.spacing(0.25),
  },
  empty: {
    padding: theme.spacing(2),
    color: theme.palette.text.secondary,
  },
}));

const NotificationsPage = () => {
  const isMobile = useMediaQuery('(max-width:768px)');
  const { classes } = useSettingsStyles();
  const { classes: localClasses } = useStyles();
  const t = useTranslation();

  const [timestamp, setTimestamp] = useState(Date.now());
  const [items, setItems] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffectAsync(async () => {
    setLoading(true);
    try {
      const response = await fetchOrThrow('/api/notifications');
      setItems(await response.json());
    } finally {
      setLoading(false);
    }
  }, [timestamp]);

  const formatList = (prefix, value) => {
    if (value) {
      return value
        .split(/[, ]+/)
        .filter(Boolean)
        .map((it) => t(prefixString(prefix, it)))
        .join(', ');
    }
    return '';
  };

  const filteredItems = useMemo(
    () => items.filter(filterByKeyword(searchKeyword)),
    [items, searchKeyword],
  );

  return (
    <PageLayout menu={<SettingsMenu />} breadcrumbs={['settingsTitle', 'sharedNotifications']}>
      <SearchHeader keyword={searchKeyword} setKeyword={setSearchKeyword} />
      {isMobile ? (
        <div className={localClasses.cards}>
          {loading ? (
            Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} variant="rounded" height={120} />
            ))
          ) : filteredItems.length ? filteredItems.map((item) => (
            <div key={item.id} className={localClasses.card}>
              <div className={localClasses.cardInfo}>
                <Typography variant="body2" className={localClasses.cardTitle}>
                  {item.description || t(prefixString('event', item.type))}
                </Typography>
                <div className={localClasses.line}>
                  {`${t('notificationType')}: ${t(prefixString('event', item.type))}`}
                </div>
                <div className={localClasses.line}>
                  {`${t('notificationAlways')}: ${formatBoolean(item.always, t)}`}
                </div>
                {item.attributes?.alarms && (
                  <div className={localClasses.line} title={formatList('alarm', item.attributes.alarms)}>
                    {`${t('sharedAlarms')}: ${formatList('alarm', item.attributes.alarms)}`}
                  </div>
                )}
                <div className={localClasses.line} title={formatList('notificator', item.notificators)}>
                  {`${t('notificationNotificators')}: ${formatList('notificator', item.notificators)}`}
                </div>
              </div>
              <Box className={localClasses.actionWrap}>
                <CollectionActions itemId={item.id} editPath="/settings/notification" endpoint="notifications" setTimestamp={setTimestamp} />
              </Box>
            </div>
          )) : (
            <Box className={localClasses.empty}>
              <Typography variant="body2">{t('sharedNoData')}</Typography>
            </Box>
          )}
        </div>
      ) : (
        <Table className={classes.table}>
          <TableHead>
            <TableRow>
              <TableCell>{t('sharedDescription')}</TableCell>
              <TableCell>{t('notificationType')}</TableCell>
              <TableCell>{t('notificationAlways')}</TableCell>
              <TableCell>{t('sharedAlarms')}</TableCell>
              <TableCell>{t('notificationNotificators')}</TableCell>
              <TableCell className={classes.columnAction} />
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading ? filteredItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.description}</TableCell>
                <TableCell>{t(prefixString('event', item.type))}</TableCell>
                <TableCell>{formatBoolean(item.always, t)}</TableCell>
                <TableCell>{formatList('alarm', item.attributes.alarms)}</TableCell>
                <TableCell>{formatList('notificator', item.notificators)}</TableCell>
                <TableCell className={classes.columnAction} padding="none">
                  <CollectionActions itemId={item.id} editPath="/settings/notification" endpoint="notifications" setTimestamp={setTimestamp} />
                </TableCell>
              </TableRow>
            )) : (<TableShimmer columns={5} endAction />)}
          </TableBody>
        </Table>
      )}
      <CollectionFab editPath="/settings/notification" />
    </PageLayout>
  );
};

export default NotificationsPage;
