import { createSlice } from '@reduxjs/toolkit';

const { reducer, actions } = createSlice({
  name: 'devices',
  initialState: {
    items: {},
    selectedId: null,
    followDeviceId: null,
    headingByDeviceId: {},
  },
  reducers: {
    refresh(state, action) {
      state.items = {};
      action.payload.forEach((item) => state.items[item.id] = item);

      const activeDeviceIds = new Set(action.payload.map((item) => String(item.id)));
      Object.keys(state.headingByDeviceId).forEach((deviceId) => {
        if (!activeDeviceIds.has(String(deviceId))) {
          delete state.headingByDeviceId[deviceId];
        }
      });
      if (state.followDeviceId != null && !activeDeviceIds.has(String(state.followDeviceId))) {
        state.followDeviceId = null;
      }
    },
    update(state, action) {
      action.payload.forEach((item) => state.items[item.id] = item);
    },
    selectId(state, action) {
      state.selectTime = Date.now();
      state.selectedId = action.payload;
    },
    remove(state, action) {
      delete state.items[action.payload];
      delete state.headingByDeviceId[action.payload];
      if (String(state.followDeviceId) === String(action.payload)) {
        state.followDeviceId = null;
      }
    },
    setFollowDeviceId(state, action) {
      state.followDeviceId = action.payload;
    },
    updateHeadings(state, action) {
      Object.entries(action.payload).forEach(([deviceId, heading]) => {
        if (heading == null || Number.isNaN(heading)) {
          delete state.headingByDeviceId[deviceId];
        } else {
          state.headingByDeviceId[deviceId] = heading;
        }
      });
    },
  },
});

export { actions as devicesActions };
export { reducer as devicesReducer };
