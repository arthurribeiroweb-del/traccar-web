import { createSlice } from '@reduxjs/toolkit';

const MAX_EVENTS = 50;
const DISMISSED_IDS_KEY = 'traccarpro.dismissedEventIds.v1';
const DISMISSED_BEFORE_KEY = 'traccarpro.dismissedBefore.v1';

const buildKey = (key, userId) => `${key}.${userId ?? 'default'}`;

const loadDismissedIds = (userId) => {
  try {
    const raw = localStorage.getItem(buildKey(DISMISSED_IDS_KEY, userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    return new Set();
  }
};

const saveDismissedIds = (userId, dismissedIds) => {
  try {
    localStorage.setItem(
      buildKey(DISMISSED_IDS_KEY, userId),
      JSON.stringify(Array.from(dismissedIds)),
    );
  } catch (error) {
    // ignore storage errors
  }
};

const clearDismissedIds = (userId) => {
  try {
    localStorage.removeItem(buildKey(DISMISSED_IDS_KEY, userId));
  } catch (error) {
    // ignore storage errors
  }
};

const loadDismissedBefore = (userId) => {
  try {
    const raw = localStorage.getItem(buildKey(DISMISSED_BEFORE_KEY, userId));
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch (error) {
    return 0;
  }
};

const saveDismissedBefore = (userId, timestamp) => {
  try {
    localStorage.setItem(buildKey(DISMISSED_BEFORE_KEY, userId), String(timestamp));
  } catch (error) {
    // ignore storage errors
  }
};

const getEventTime = (event) => {
  const time = event?.eventTime || event?.serverTime || event?.deviceTime || event?.fixTime;
  const parsed = new Date(time || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeAddPayload = (payload) => {
  if (Array.isArray(payload)) {
    return { events: payload, userId: null };
  }
  if (payload?.events) {
    return payload;
  }
  return { events: [], userId: payload?.userId ?? null };
};

const filterDismissed = (events, userId) => {
  if (!events?.length) {
    return [];
  }
  const dismissedIds = loadDismissedIds(userId);
  const dismissedBefore = loadDismissedBefore(userId);
  return events.filter((event) => {
    if (!event?.id) {
      return true;
    }
    if (dismissedIds.has(event.id)) {
      return false;
    }
    const eventTime = getEventTime(event);
    if (dismissedBefore && eventTime && eventTime <= dismissedBefore) {
      return false;
    }
    return true;
  });
};

const { reducer, actions } = createSlice({
  name: 'events',
  initialState: {
    items: [],
  },
  reducers: {
    add(state, action) {
      const { events, userId } = normalizeAddPayload(action.payload);
      const filtered = filterDismissed(events, userId);
      state.items.unshift(...filtered);
      state.items.splice(MAX_EVENTS);
    },
    dismiss(state, action) {
      const { event, userId } = action.payload || {};
      if (event?.id != null) {
        const dismissedIds = loadDismissedIds(userId);
        dismissedIds.add(event.id);
        saveDismissedIds(userId, dismissedIds);
        state.items = state.items.filter((item) => item.id !== event.id);
      }
    },
    dismissAll(state, action) {
      const userId = action.payload?.userId ?? null;
      const dismissedBefore = action.payload?.dismissedBefore ?? Date.now();
      saveDismissedBefore(userId, dismissedBefore);
      clearDismissedIds(userId);
      state.items = [];
    },
    reset(state) {
      state.items = [];
    },
  },
});

export { actions as eventsActions };
export { reducer as eventsReducer };
