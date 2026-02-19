import { shouldEnablePhoneAssistForDevice } from '../../common/util/deviceUtils';

export const calculateAssistedPosition = (
    device,
    trackerPosition,
    phonePosition,
    phoneAssistActive,
    isDev = false,
) => {
    const shouldEnable = shouldEnablePhoneAssistForDevice(device, trackerPosition);
    const shouldUsePhone = phoneAssistActive && trackerPosition && phonePosition && shouldEnable;

    if (isDev && trackerPosition) {
        // eslint-disable-next-line no-console
        console.debug('[GPS Fix] Position Source Check:', {
            deviceId: device?.id,
            status: device?.status,
            ignition: trackerPosition?.attributes?.ignition,
            acc: trackerPosition?.attributes?.acc,
            shouldEnablePhoneAssist: shouldEnable,
            phoneAssistActive,
            chosenSource: shouldUsePhone ? 'phone' : 'tracker',
            trackerPos: { lat: trackerPosition.latitude, lng: trackerPosition.longitude },
            phonePos: phonePosition ? { lat: phonePosition.latitude, lng: phonePosition.longitude } : null,
        });
    }

    if (!shouldUsePhone) {
        return trackerPosition;
    }

    return {
        ...trackerPosition,
        latitude: phonePosition.latitude,
        longitude: phonePosition.longitude,
        speed: Number.isFinite(phonePosition.speedKnots) ? phonePosition.speedKnots : trackerPosition.speed,
        course: Number.isFinite(phonePosition.course) ? phonePosition.course : trackerPosition.course,
        accuracy: Number.isFinite(phonePosition.accuracy) ? phonePosition.accuracy : trackerPosition.accuracy,
        fixTime: phonePosition.fixTime || trackerPosition.fixTime,
        attributes: {
            ...(trackerPosition.attributes || {}),
            phoneAssist: true,
        },
    };
};
