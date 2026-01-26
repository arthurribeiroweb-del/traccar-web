import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useMediaQuery, useTheme } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import BottomMenu from './common/components/BottomMenu';
import SocketController from './SocketController';
import CachingController from './CachingController';
import { useCatch, useEffectAsync } from './reactHelper';
import { devicesActions, sessionActions } from './store';
import UpdateController from './UpdateController';
import TermsDialog from './common/components/TermsDialog';
import Loader from './common/components/Loader';
import fetchOrThrow from './common/util/fetchOrThrow';
import usePersistedState from './common/util/usePersistedState';

const useStyles = makeStyles()(() => ({
  page: {
    flexGrow: 1,
    overflow: 'auto',
  },
  menu: {
    zIndex: 4,
    '@media print': {
      display: 'none',
    },
  },
}));

const App = () => {
  const { classes } = useStyles();
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  const desktop = useMediaQuery(theme.breakpoints.up('md'));

  const newServer = useSelector((state) => state.session.server.newServer);
  const termsUrl = useSelector((state) => state.session.server.attributes.termsUrl);
  const user = useSelector((state) => state.session.user);
  const devices = useSelector((state) => state.devices.items);
  const selectedDeviceId = useSelector((state) => state.devices.selectedId);
  const [lastSelectedDeviceId, setLastSelectedDeviceId] = usePersistedState('lastSelectedDeviceId', null);

  const acceptTerms = useCatch(async () => {
    const response = await fetchOrThrow(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...user, attributes: { ...user.attributes, termsAccepted: true } }),
    });
    dispatch(sessionActions.updateUser(await response.json()));
  });

  useEffectAsync(async () => {
    if (!user) {
      const response = await fetch('/api/session');
      if (response.ok) {
        dispatch(sessionActions.updateUser(await response.json()));
      } else {
        window.sessionStorage.setItem('postLogin', pathname + search);
        navigate(newServer ? '/register' : '/login', { replace: true });
      }
    }
    return null;
  }, []);

  useEffect(() => {
    if (selectedDeviceId != null) {
      setLastSelectedDeviceId(selectedDeviceId);
    }
  }, [selectedDeviceId, setLastSelectedDeviceId]);

  useEffect(() => {
    const deviceIds = Object.keys(devices);
    if (!deviceIds.length) {
      return;
    }

    const selectedIdString = selectedDeviceId != null ? String(selectedDeviceId) : null;
    if (selectedIdString && deviceIds.includes(selectedIdString)) {
      return;
    }

    if (selectedIdString && !deviceIds.includes(selectedIdString)) {
      dispatch(devicesActions.selectId(null));
      return;
    }

    const lastIdString = lastSelectedDeviceId != null ? String(lastSelectedDeviceId) : null;
    let nextId = null;
    if (lastIdString && deviceIds.includes(lastIdString)) {
      nextId = Number(lastSelectedDeviceId);
    } else if (deviceIds.length === 1) {
      nextId = Number(deviceIds[0]);
    }

    if (nextId != null) {
      dispatch(devicesActions.selectId(nextId));
    }
  }, [devices, selectedDeviceId, lastSelectedDeviceId, dispatch]);

  if (user == null) {
    return (<Loader />);
  }
  if (termsUrl && !user.attributes.termsAccepted) {
    return (
      <TermsDialog
        open
        onCancel={() => navigate('/login')}
        onAccept={() => acceptTerms()}
      />
    );
  }
  return (
    <>
      <SocketController />
      <CachingController />
      <UpdateController />
      <div className={classes.page}>
        <Outlet />
      </div>
      {!desktop && (
        <div className={classes.menu}>
          <BottomMenu />
        </div>
      )}
    </>
  );
};

export default App;
