import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseWindowMinutes, isTimedOut } from '../src/index';

describe('parseWindowMinutes', () => {
    it('returns the default when the value is undefined', () => {
        expect(parseWindowMinutes(undefined)).toBe(10);
    });

    it('returns the default when the value is an empty string', () => {
        expect(parseWindowMinutes('')).toBe(10);
    });

    it('returns the default when the value is not a number', () => {
        expect(parseWindowMinutes('not-a-number')).toBe(10);
    });

    it('parses a valid numeric string', () => {
        expect(parseWindowMinutes('15')).toBe(15);
    });

    it('floors a decimal value', () => {
        expect(parseWindowMinutes('7.9')).toBe(7);
    });

    it('clamps values below the minimum', () => {
        expect(parseWindowMinutes('0')).toBe(1);
        expect(parseWindowMinutes('-5')).toBe(1);
    });

    it('clamps values above the maximum', () => {
        expect(parseWindowMinutes('999')).toBe(120);
    });
});

describe('isTimedOut', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns false when last_seen is within the window', () => {
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        expect(isTimedOut(10, fiveMinutesAgo)).toBe(false);
    });

    it('returns true when last_seen is older than the window', () => {
        const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
        expect(isTimedOut(10, fifteenMinutesAgo)).toBe(true);
    });

    it('returns false exactly at the boundary (not strictly greater)', () => {
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
        expect(isTimedOut(10, tenMinutesAgo)).toBe(false);
    });
});