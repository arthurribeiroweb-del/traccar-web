import { isVehicleOff } from '../../common/util/deviceUtils';

export const calculateAssistedPosition = (
    device,
    trackerPosition,
    phonePosition,
    phoneAssistActive,
    isDev = false
) => {
    const off = isVehicleOff(device, trackerPosition);
    const shouldUsePhone = phoneAssistActive && trackerPosition && phonePosition && !off;

    if (isDev && trackerPosition) {
        // eslint-disable-next-line no-console
        console.debug('[GPS Fix] Position Source Check:', {
            deviceId: device?.id,
            status: device?.status,
            ignition: trackerPosition?.attributes?.ignition,
            isVehicleOff: off,
            phoneAssistActive,
            chosenSource: shouldUsePhone ? 'phone' : 'tracker',
            trackerPosition: { lat: trackerPosition.latitude, lng: trackerPosition.longitude },
            phonePosition: phonePosition ? { lat: phonePosition.latitude, lng: phonePosition.longitude } : null,
            phoneAccuracy: phonePosition?.accuracy,
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
