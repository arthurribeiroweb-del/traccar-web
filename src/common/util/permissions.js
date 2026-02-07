import { useSelector } from 'react-redux';

export const USER_ROLES = {
  USER: 'ROLE_USER',
  MASTER: 'ROLE_MASTER',
  ADMIN: 'ROLE_ADMIN',
};

export const getUserRole = (user) => {
  const explicitRole = typeof user?.role === 'string' ? user.role.toUpperCase() : null;
  if (explicitRole === USER_ROLES.ADMIN || explicitRole === 'ADMIN') {
    return USER_ROLES.ADMIN;
  }
  if (explicitRole === USER_ROLES.MASTER || explicitRole === 'MASTER') {
    return USER_ROLES.MASTER;
  }
  if (explicitRole === USER_ROLES.USER || explicitRole === 'USER') {
    return USER_ROLES.USER;
  }
  if (user?.administrator) {
    return USER_ROLES.ADMIN;
  }
  if ((user?.userLimit || 0) !== 0) {
    return USER_ROLES.MASTER;
  }
  return USER_ROLES.USER;
};

export const canAddDevice = (role) => role === USER_ROLES.ADMIN || role === USER_ROLES.MASTER;

export const useAdministrator = () => useSelector((state) => {
  const admin = state.session.user.administrator;
  return admin;
});

export const useManager = () => useSelector((state) => {
  const admin = state.session.user.administrator;
  const manager = (state.session.user.userLimit || 0) !== 0;
  return admin || manager;
});

export const useDeviceReadonly = () => useSelector((state) => {
  const admin = state.session.user.administrator;
  const serverReadonly = state.session.server.readonly;
  const userReadonly = state.session.user.readonly;
  const serverDeviceReadonly = state.session.server.deviceReadonly;
  const userDeviceReadonly = state.session.user.deviceReadonly;
  return !admin && (serverReadonly || userReadonly || serverDeviceReadonly || userDeviceReadonly);
});

export const useRestriction = (key) => useSelector((state) => {
  const admin = state.session.user.administrator;
  const serverValue = state.session.server[key];
  const userValue = state.session.user[key];
  return !admin && (serverValue || userValue);
});

export const useReportsAccess = () => useSelector((state) => {
  const admin = state.session.user.administrator;
  const manager = (state.session.user.userLimit || 0) !== 0;
  return admin || manager;
});

export const useSettingsAccess = () => useSelector((state) => {
  const admin = state.session.user.administrator;
  const manager = (state.session.user.userLimit || 0) !== 0;
  return admin || manager;
});

export const isCommonUser = (user) => !user?.administrator;

export const canSeeDeviceAction = (user, action) => {
  if (user?.administrator) {
    return true;
  }
  const allowed = new Set([
    'OPEN_GOOGLE_MAPS',
    'OPEN_APPLE_MAPS',
    'OPEN_STREET_VIEW',
  ]);
  return allowed.has(action);
};
