import { prefixString } from '../../common/util/stringUtils';

const TITLE_KEYS = {
  deviceOnline: 'reportEventDeviceOnline',
  deviceOffline: 'reportEventDeviceOffline',
  deviceMoving: 'reportEventDeviceMoving',
  deviceStopped: 'reportEventDeviceStopped',
  geofenceEnter: 'reportEventGeofenceEnter',
  geofenceExit: 'reportEventGeofenceExit',
  commandResult: 'reportEventCommandResult',
  commandFailure: 'reportEventCommandFailure',
};

const resolveCommandTypeLabel = (commandType) => {
  switch (commandType) {
    case 'engineStop':
      return 'Bloquear motor';
    case 'engineResume':
      return 'Desbloquear motor';
    default:
      return null;
  }
};

export const getEventTitle = (event, t) => {
  const titleKey = TITLE_KEYS[event.type];
  if (titleKey) {
    return t(titleKey);
  }
  return t(prefixString('event', event.type));
};

export const getCommandResultText = (event) => {
  const value = event.attributes?.result
    || event.attributes?.message
    || event.result
    || '';
  return typeof value === 'string' ? value.trim() : '';
};

export const getCommandName = (event, commandsById, t) => {
  const commandId = event.attributes?.commandId;
  const command = commandId != null ? commandsById?.[commandId] : null;

  if (command?.description) {
    return command.description;
  }

  const commandType = event.attributes?.commandType || command?.type;
  const knownType = resolveCommandTypeLabel(commandType);
  if (knownType) {
    return knownType;
  }

  if (command?.type) {
    return command.type;
  }

  return t('reportEventCommandResult');
};

export const getCommandBadge = (event, t) => {
  if (event.type === 'commandFailure') {
    return { label: t('reportCommandFailed'), tone: 'error' };
  }
  if (event.type !== 'commandResult') {
    return null;
  }

  const resultText = getCommandResultText(event);
  if (!resultText) {
    return { label: t('reportCommandUnknown'), tone: 'default' };
  }

  const lower = resultText.toLowerCase();
  if (
    lower.includes('ok')
    || lower.includes('success')
    || lower.includes('sucesso')
    || lower.includes('executad')
  ) {
    return { label: t('reportCommandOk'), tone: 'success' };
  }
  if (
    lower.includes('fail')
    || lower.includes('falh')
    || lower.includes('error')
    || lower.includes('erro')
    || lower.includes('denied')
  ) {
    return { label: t('reportCommandFailed'), tone: 'error' };
  }

  return { label: t('reportCommandUnknown'), tone: 'default' };
};

export const getEventSubtitle = ({
  event,
  geofenceName,
  deviceName,
  showDeviceName,
  commandsById,
  t,
}) => {
  if (event.type === 'geofenceEnter' || event.type === 'geofenceExit') {
    return geofenceName || (showDeviceName ? deviceName : '');
  }

  if (event.type === 'commandResult' || event.type === 'commandFailure') {
    const commandName = getCommandName(event, commandsById, t);
    const resultText = getCommandResultText(event);
    return resultText ? `${commandName} • ${resultText}` : commandName;
  }

  return showDeviceName ? deviceName : '';
};

