import { describe, test, expect } from 'vitest';
import { calculateAssistedPosition } from './positionAssist';

describe('calculateAssistedPosition', () => {
    const trackerPosition = {
        latitude: 10,
        longitude: 10,
        speed: 10,
        course: 0,
        accuracy: 0,
        attributes: { ignition: true },
        fixTime: '2023-01-01T12:00:00.000Z',
    };

    const phonePosition = {
        latitude: 20,
        longitude: 20,
        speedKnots: 20,
        course: 180,
        accuracy: 5,
        timestampMs: 1600000000000,
        fixTime: '2023-01-01T12:00:05.000Z',
    };

    const deviceOn = { id: 1, status: 'online' };
    const deviceOff = { id: 1, status: 'offline' };
    const deviceUnknown = { id: 1, status: 'unknown' };

    test('should use tracker position when device is offline', () => {
        const result = calculateAssistedPosition(
            deviceOff,
            trackerPosition,
            phonePosition,
            true // phoneAssistActive
        );
        expect(result).toBe(trackerPosition);
    });

    test('should use tracker position when device status is unknown', () => {
        const result = calculateAssistedPosition(
            deviceUnknown,
            trackerPosition,
            phonePosition,
            true
        );
        expect(result).toBe(trackerPosition);
    });

    test('should use tracker position when ignition is off (even if online)', () => {
        const trackerPosOff = { ...trackerPosition, attributes: { ignition: false } };
        const result = calculateAssistedPosition(
            deviceOn,
            trackerPosOff,
            phonePosition,
            true
        );
        expect(result).toBe(trackerPosOff);
    });

    test('should use phone position when device is online, ignition on, and phone assist active', () => {
        const result = calculateAssistedPosition(
            deviceOn,
            trackerPosition,
            phonePosition,
            true
        );
        expect(result).not.toBe(trackerPosition);
        expect(result.latitude).toBe(phonePosition.latitude);
        expect(result.attributes.phoneAssist).toBe(true);
    });

    test('should use tracker position when phone assist is inactive', () => {
        const result = calculateAssistedPosition(
            deviceOn,
            trackerPosition,
            phonePosition,
            false
        );
        expect(result).toBe(trackerPosition);
    });

    test('should use tracker position when phone position is missing', () => {
        const result = calculateAssistedPosition(
            deviceOn,
            trackerPosition,
            null,
            true
        );
        expect(result).toBe(trackerPosition);
    });
});
