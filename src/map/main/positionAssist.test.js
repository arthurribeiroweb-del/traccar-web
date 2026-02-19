import { describe, test, expect } from 'vitest';
import {
    isIgnitionOff,
    isDeviceOffline,
    shouldEnablePhoneAssistForDevice,
} from '../../common/util/deviceUtils';
import { calculateAssistedPosition } from './positionAssist';

// ── Utility function tests ──────────────────────────────────────────

describe('isIgnitionOff', () => {
    test('returns false when no position', () => {
        expect(isIgnitionOff(null)).toBe(false);
        expect(isIgnitionOff(undefined)).toBe(false);
    });

    test('returns false when no ignition/acc attributes', () => {
        expect(isIgnitionOff({ attributes: {} })).toBe(false);
        expect(isIgnitionOff({ attributes: { speed: 10 } })).toBe(false);
    });

    test('returns false when ignition is true', () => {
        expect(isIgnitionOff({ attributes: { ignition: true } })).toBe(false);
    });

    test('returns true when ignition is false', () => {
        expect(isIgnitionOff({ attributes: { ignition: false } })).toBe(true);
    });

    test('falls back to acc when ignition is absent', () => {
        expect(isIgnitionOff({ attributes: { acc: true } })).toBe(false);
        expect(isIgnitionOff({ attributes: { acc: false } })).toBe(true);
    });

    test('ignition takes precedence over acc', () => {
        expect(isIgnitionOff({ attributes: { ignition: true, acc: false } })).toBe(false);
        expect(isIgnitionOff({ attributes: { ignition: false, acc: true } })).toBe(true);
    });
});

describe('isDeviceOffline', () => {
    test('returns true for null/undefined', () => {
        expect(isDeviceOffline(null)).toBe(true);
        expect(isDeviceOffline(undefined)).toBe(true);
    });

    test('returns true for offline', () => {
        expect(isDeviceOffline({ status: 'offline' })).toBe(true);
    });

    test('returns true for unknown', () => {
        expect(isDeviceOffline({ status: 'unknown' })).toBe(true);
    });

    test('returns false for online', () => {
        expect(isDeviceOffline({ status: 'online' })).toBe(false);
    });
});

describe('shouldEnablePhoneAssistForDevice', () => {
    const onlineDevice = { id: 1, status: 'online' };
    const offlineDevice = { id: 1, status: 'offline' };

    test('returns false when device is offline', () => {
        const pos = { attributes: { ignition: true } };
        expect(shouldEnablePhoneAssistForDevice(offlineDevice, pos)).toBe(false);
    });

    test('returns false when ignition is off (online device)', () => {
        const pos = { attributes: { ignition: false } };
        expect(shouldEnablePhoneAssistForDevice(onlineDevice, pos)).toBe(false);
    });

    test('returns false when acc is off (online device)', () => {
        const pos = { attributes: { acc: false } };
        expect(shouldEnablePhoneAssistForDevice(onlineDevice, pos)).toBe(false);
    });

    test('returns true when online + ignition on', () => {
        const pos = { attributes: { ignition: true } };
        expect(shouldEnablePhoneAssistForDevice(onlineDevice, pos)).toBe(true);
    });

    test('returns true when online + acc on', () => {
        const pos = { attributes: { acc: true } };
        expect(shouldEnablePhoneAssistForDevice(onlineDevice, pos)).toBe(true);
    });

    test('returns true when online + no ignition/acc data (unknown)', () => {
        const pos = { attributes: {} };
        expect(shouldEnablePhoneAssistForDevice(onlineDevice, pos)).toBe(true);
    });

    test('returns false when both offline and ignition off', () => {
        const pos = { attributes: { ignition: false } };
        expect(shouldEnablePhoneAssistForDevice(offlineDevice, pos)).toBe(false);
    });
});

// ── calculateAssistedPosition integration tests ─────────────────────

describe('calculateAssistedPosition', () => {
    const trackerPos = {
        latitude: 10, longitude: 10, speed: 5, course: 0, accuracy: 3,
        fixTime: '2023-01-01T00:00:00Z',
        attributes: { ignition: true },
    };
    const phonePos = {
        latitude: 20, longitude: 20, speedKnots: 15, course: 180, accuracy: 5,
        fixTime: '2023-01-01T00:00:05Z',
    };
    const onlineDevice = { id: 1, status: 'online' };
    const offlineDevice = { id: 1, status: 'offline' };

    test('uses phone when online + ignition on + assist active', () => {
        const result = calculateAssistedPosition(onlineDevice, trackerPos, phonePos, true);
        expect(result.latitude).toBe(20);
        expect(result.attributes.phoneAssist).toBe(true);
    });

    test('uses tracker when assist inactive', () => {
        const result = calculateAssistedPosition(onlineDevice, trackerPos, phonePos, false);
        expect(result).toBe(trackerPos);
    });

    test('uses tracker when device offline despite assist active', () => {
        const result = calculateAssistedPosition(offlineDevice, trackerPos, phonePos, true);
        expect(result).toBe(trackerPos);
    });

    test('uses tracker when ignition off despite assist active', () => {
        const posOff = { ...trackerPos, attributes: { ignition: false } };
        const result = calculateAssistedPosition(onlineDevice, posOff, phonePos, true);
        expect(result).toBe(posOff);
    });

    test('uses tracker when acc off despite assist active', () => {
        const posAccOff = { ...trackerPos, attributes: { acc: false } };
        const result = calculateAssistedPosition(onlineDevice, posAccOff, phonePos, true);
        expect(result).toBe(posAccOff);
    });

    test('uses tracker when phone position is null', () => {
        const result = calculateAssistedPosition(onlineDevice, trackerPos, null, true);
        expect(result).toBe(trackerPos);
    });

    test('returns null/undefined when tracker position is null', () => {
        const result = calculateAssistedPosition(onlineDevice, null, phonePos, true);
        expect(result).toBeFalsy();
    });
});
