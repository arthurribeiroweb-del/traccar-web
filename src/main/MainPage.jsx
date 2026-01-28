import {
  useState, useCallback, useEffect, useRef,
} from 'react';
import { Paper } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useSelector } from 'react-redux';
import DeviceList from './DeviceList';
import BottomMenu from '../common/components/BottomMenu';
import StatusCard from '../common/components/StatusCard';
import { usePrevious } from '../reactHelper';
import usePersistedState from '../common/util/usePersistedState';
import EventsDrawer from './EventsDrawer';
import useFilter from './useFilter';
import MainToolbar from './MainToolbar';
import MainMap from './MainMap';
import BottomPeekCard from './BottomPeekCard';
import EditDeviceSheet from './EditDeviceSheet';
import { useAttributePreference } from '../common/util/preferences';

const useStyles = makeStyles()((theme) => ({
  root: {
    height: '100%',
  },
  sidebar: {
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    [theme.breakpoints.up('md')]: {
      position: 'fixed',
      left: 0,
      top: 0,
      height: `calc(100% - ${theme.spacing(3)})`,
      width: theme.dimensions.drawerWidthDesktop,
      margin: theme.spacing(1.5),
      zIndex: 3,
    },
    [theme.breakpoints.down('md')]: {
      height: '100%',
      width: '100%',
    },
  },
  header: {
    pointerEvents: 'auto',
    zIndex: 6,
  },
  footer: {
    pointerEvents: 'auto',
    zIndex: 5,
  },
  middle: {
    flex: 1,
    display: 'grid',
    minHeight: 0,
  },
  contentMap: {
    pointerEvents: 'auto',
    gridArea: '1 / 1',
  },
  contentList: {
    pointerEvents: 'auto',
    gridArea: '1 / 1',
    zIndex: 4,
    display: 'flex',
    minHeight: 0,
  },
  expandedWrapper: {
    animation: '$fadeIn 160ms ease',
  },
  '@keyframes fadeIn': {
    from: { opacity: 0 },
    to: { opacity: 1 },
  },
}));

const MainPage = () => {
  const { classes } = useStyles();
  const theme = useTheme();
  const swipeRef = useRef(null);

  const desktop = useMediaQuery(theme.breakpoints.up('md'));

  const mapOnSelect = useAttributePreference('mapOnSelect', true);

  const selectedDeviceId = useSelector((state) => state.devices.selectedId);
  const selectTime = useSelector((state) => state.devices.selectTime);
  const positions = useSelector((state) => state.session.positions);
  const devices = useSelector((state) => state.devices.items);
  const [filteredPositions, setFilteredPositions] = useState([]);
  const selectedPosition = filteredPositions.find((position) => selectedDeviceId && position.deviceId === selectedDeviceId);

  const [filteredDevices, setFilteredDevices] = useState([]);
  const totalDevices = Object.keys(devices).length;
  const hasDevices = totalDevices > 0;

  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = usePersistedState('filter', {
    statuses: [],
    groups: [],
  });
  const [filterSort, setFilterSort] = usePersistedState('filterSort', '');
  const [filterMap, setFilterMap] = usePersistedState('filterMap', false);

  const [devicesOpen, setDevicesOpen] = useState(desktop);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [panelState, setPanelState] = useState('closed');
  const [editOpen, setEditOpen] = useState(false);

  const previousSelectedId = usePrevious(selectedDeviceId);
  const previousSelectTime = usePrevious(selectTime);

  const onEventsClick = useCallback(() => setEventsOpen(true), [setEventsOpen]);

  useEffect(() => {
    if (!desktop && mapOnSelect && selectedDeviceId) {
      setDevicesOpen(false);
    }
  }, [desktop, mapOnSelect, selectedDeviceId]);

  useEffect(() => {
    if (!selectedDeviceId) {
      setPanelState('closed');
      setEditOpen(false);
      return;
    }
    const selectionChanged = selectedDeviceId !== previousSelectedId || selectTime !== previousSelectTime;
    if (selectionChanged) {
      setPanelState('peek');
      setEditOpen(false);
    }
  }, [previousSelectedId, previousSelectTime, selectTime, selectedDeviceId]);

  useFilter(keyword, filter, filterSort, filterMap, positions, setFilteredDevices, setFilteredPositions);

  const handleExpandPanel = useCallback(() => setPanelState('expanded'), []);
  const handlePeekPanel = useCallback(() => setPanelState('peek'), []);
  const handleClosePanel = useCallback(() => setPanelState('closed'), []);
  const handleEditOpen = useCallback(() => setEditOpen(true), []);
  const handleEditClose = useCallback(() => setEditOpen(false), []);

  const handleExpandedPointerDown = useCallback((event) => {
    if (desktop) {
      return;
    }
    if (!(event.target instanceof Element) || !event.target.closest('.draggable-header')) {
      return;
    }
    swipeRef.current = { y: event.clientY };
  }, [desktop]);

  const handleExpandedPointerMove = useCallback((event) => {
    if (desktop || !swipeRef.current) {
      return;
    }
    const delta = event.clientY - swipeRef.current.y;
    if (delta > 24) {
      swipeRef.current = null;
      setPanelState('peek');
    }
  }, [desktop]);

  const clearExpandedSwipe = useCallback(() => {
    swipeRef.current = null;
  }, []);

  return (
    <div className={classes.root}>
      {desktop && (
        <MainMap
          filteredPositions={filteredPositions}
          selectedPosition={selectedPosition}
          onEventsClick={onEventsClick}
        />
      )}
      <div className={classes.sidebar}>
        <Paper square elevation={3} className={classes.header}>
          <MainToolbar
            filteredDevices={filteredDevices}
            devicesOpen={devicesOpen}
            setDevicesOpen={setDevicesOpen}
            keyword={keyword}
            setKeyword={setKeyword}
            filter={filter}
            setFilter={setFilter}
            filterSort={filterSort}
            setFilterSort={setFilterSort}
            filterMap={filterMap}
            setFilterMap={setFilterMap}
          />
        </Paper>
        <div className={classes.middle}>
          {!desktop && (
            <div className={classes.contentMap}>
              <MainMap
                filteredPositions={filteredPositions}
                selectedPosition={selectedPosition}
                onEventsClick={onEventsClick}
              />
            </div>
          )}
          <Paper square className={classes.contentList} style={devicesOpen || !hasDevices ? {} : { visibility: 'hidden' }}>
            <DeviceList devices={filteredDevices} totalDevices={totalDevices} />
          </Paper>
        </div>
        {desktop && (
          <div className={classes.footer}>
            <BottomMenu />
          </div>
        )}
      </div>
      <EventsDrawer open={eventsOpen} onClose={() => setEventsOpen(false)} />
      {selectedDeviceId && panelState === 'peek' && (
        <BottomPeekCard
          device={devices[selectedDeviceId]}
          position={selectedPosition}
          desktopPadding={theme.dimensions.drawerWidthDesktop}
          onExpand={handleExpandPanel}
          onClose={handleClosePanel}
          enableSwipe={!desktop}
        />
      )}
      {selectedDeviceId && panelState === 'expanded' && (
        <div
          className={classes.expandedWrapper}
          onPointerDown={handleExpandedPointerDown}
          onPointerMove={handleExpandedPointerMove}
          onPointerUp={clearExpandedSwipe}
          onPointerCancel={clearExpandedSwipe}
          onPointerLeave={clearExpandedSwipe}
        >
          <StatusCard
            deviceId={selectedDeviceId}
            position={selectedPosition}
            onClose={handlePeekPanel}
            onEditDevice={handleEditOpen}
            desktopPadding={theme.dimensions.drawerWidthDesktop}
          />
        </div>
      )}
      <EditDeviceSheet
        open={Boolean(selectedDeviceId) && editOpen}
        device={selectedDeviceId ? devices[selectedDeviceId] : null}
        onClose={handleEditClose}
      />
    </div>
  );
};

export default MainPage;
