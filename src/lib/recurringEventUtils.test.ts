import { describe, it, expect } from 'vitest';
import { generateRecurringEventDates, validateRecurringConfig } from './recurringEventUtils';
import type { RecurringEventConfig } from '@/components/RecurringEventForm';

describe('RecurringEventUtils', () => {
  describe('generateRecurringEventDates', () => {
    it('should return single event when recurring is disabled', () => {
      const config: RecurringEventConfig = {
        enabled: false,
        pattern: 'daily',
        interval: 1,
        maxOccurrences: 1,
        timeMode: 'single',
      };

      const result = generateRecurringEventDates(
        '2024-01-01',
        '2024-01-02',
        config
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        startDate: '2024-01-01',
        endDate: '2024-01-02',
        startTime: undefined,
        endTime: undefined,
      });
    });

    it('should generate daily recurring events', () => {
      const config: RecurringEventConfig = {
        enabled: true,
        pattern: 'daily',
        interval: 1,
        maxOccurrences: 3,
        timeMode: 'single',
      };

      const result = generateRecurringEventDates(
        '2024-01-01',
        '2024-01-02',
        config
      );

      expect(result).toHaveLength(3);
      expect(result[0].startDate).toBe('2024-01-01');
      expect(result[1].startDate).toBe('2024-01-02');
      expect(result[2].startDate).toBe('2024-01-03');
    });

    it('should generate weekly recurring events', () => {
      const config: RecurringEventConfig = {
        enabled: true,
        pattern: 'weekly',
        interval: 1,
        maxOccurrences: 2,
        weeklyDays: [1], // Monday
        timeMode: 'single',
      };

      const result = generateRecurringEventDates(
        '2024-01-02', // This is a Monday
        '2024-01-03',
        config
      );

      expect(result).toHaveLength(2);
      expect(result[0].startDate).toBe('2024-01-02');
      expect(result[1].startDate).toBe('2024-01-09'); // Next Monday (7 days later)
    });

    it('should handle invalid dates gracefully', () => {
      const config: RecurringEventConfig = {
        enabled: true,
        pattern: 'daily',
        interval: 1,
        maxOccurrences: 2,
        timeMode: 'single',
      };

      expect(() => {
        generateRecurringEventDates(
          'invalid-date',
          '2024-01-02',
          config
        );
      }).toThrow('Invalid start date: invalid-date');
    });
  });

  describe('validateRecurringConfig', () => {
    it('should return no errors for valid config', () => {
      const config: RecurringEventConfig = {
        enabled: true,
        pattern: 'daily',
        interval: 1,
        maxOccurrences: 3,
        timeMode: 'single',
      };

      const errors = validateRecurringConfig(config);
      expect(errors).toHaveLength(0);
    });

    it('should return errors for invalid interval', () => {
      const config: RecurringEventConfig = {
        enabled: true,
        pattern: 'daily',
        interval: 0,
        maxOccurrences: 3,
        timeMode: 'single',
      };

      const errors = validateRecurringConfig(config);
      expect(errors).toContain('Interval must be at least 1');
    });

    it('should return errors for invalid maxOccurrences', () => {
      const config: RecurringEventConfig = {
        enabled: true,
        pattern: 'daily',
        interval: 1,
        maxOccurrences: 0,
        timeMode: 'single',
      };

      const errors = validateRecurringConfig(config);
      expect(errors).toContain('Number of events must be between 1 and 6');
    });

    it('should return errors for weekly pattern without days', () => {
      const config: RecurringEventConfig = {
        enabled: true,
        pattern: 'weekly',
        interval: 1,
        maxOccurrences: 3,
        weeklyDays: [],
        timeMode: 'single',
      };

      const errors = validateRecurringConfig(config);
      expect(errors).toContain('Please select at least one day of the week');
    });

    it('should return errors for monthly pattern without configuration', () => {
      const config: RecurringEventConfig = {
        enabled: true,
        pattern: 'monthly',
        interval: 1,
        maxOccurrences: 3,
        timeMode: 'single',
      };

      const errors = validateRecurringConfig(config);
      expect(errors).toContain('Please specify a monthly pattern');
    });
  });
});
