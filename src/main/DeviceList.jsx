import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import { List } from 'react-window';
import { Typography } from '@mui/material';
import { devicesActions } from '../store';
import { useEffectAsync } from '../reactHelper';
import DeviceRow from './DeviceRow';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { useTranslation } from '../common/components/LocalizationProvider';

const useStyles = makeStyles()((theme) => ({
  list: {
    height: '100%',
    direction: theme.direction,
  },
  listInner: {
    position: 'relative',
    margin: theme.spacing(1.5, 0),
  },
  empty: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(2),
    textAlign: 'center',
  },
}));

const DeviceList = ({ devices, totalDevices }) => {
  const { classes } = useStyles();
  const dispatch = useDispatch();
  const t = useTranslation();

  const [loading, setLoading] = useState(true);
  const [, setTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setTime(Date.now()), 60000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffectAsync(async () => {
    setLoading(true);
    try {
      const response = await fetchOrThrow('/api/devices');
      dispatch(devicesActions.refresh(await response.json()));
    } finally {
      setLoading(false);
    }
  }, []);

  if (!totalDevices) {
    const message = t('deviceNoDevices') || t('sharedNoData') || 'Nenhum dispositivo cadastrado';
    return (
      <div className={classes.empty}>
        {!loading && (
          <Typography variant="body2" color="textSecondary">
            {message}
          </Typography>
        )}
      </div>
    );
  }

  return (
    <List
      className={classes.list}
      rowComponent={DeviceRow}
      rowCount={devices.length}
      rowHeight={72}
      rowProps={{ devices }}
      overscanCount={5}
    />
  );
};

export default DeviceList;
