import type { RecurringEventConfig } from "@/components/RecurringEventForm";

export interface RecurringEventDate {
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
}

export function generateRecurringEventDates(
  baseStartDate: string,
  baseEndDate: string,
  config: RecurringEventConfig,
  baseStartTime?: string,
  baseEndTime?: string
): RecurringEventDate[] {
  if (!config.enabled) {
    return [{
      startDate: baseStartDate,
      endDate: baseEndDate,
      startTime: baseStartTime,
      endTime: baseEndTime,
    }];
  }

  const events: RecurringEventDate[] = [];
  const baseStart = new Date(baseStartDate);
  const baseEnd = new Date(baseEndDate);
  
  // Validate base dates
  if (isNaN(baseStart.getTime())) {
    throw new Error(`Invalid start date: ${baseStartDate}`);
  }
  if (isNaN(baseEnd.getTime())) {
    throw new Error(`Invalid end date: ${baseEndDate}`);
  }
  
  const duration = baseEnd.getTime() - baseStart.getTime();

  let currentDate = new Date(baseStart);
  let occurrenceCount = 0;
  const maxOccurrences = Math.min(config.maxOccurrences, 6);

  while (occurrenceCount < maxOccurrences) {
    // Check if we've hit the end date limit
    if (config.endDate && new Date(config.endDate) < currentDate) {
      break;
    }

    const eventEndDate = new Date(currentDate.getTime() + duration);
    
    // Validate dates before adding to events
    if (isNaN(currentDate.getTime()) || isNaN(eventEndDate.getTime())) {
      console.error('Invalid date generated:', { currentDate, eventEndDate });
      break;
    }
    
    events.push({
      startDate: formatDate(currentDate),
      endDate: formatDate(eventEndDate),
      startTime: baseStartTime,
      endTime: baseEndTime,
    });

    occurrenceCount++;
    if (occurrenceCount >= maxOccurrences) break;

    // Calculate next occurrence
    const nextDate = getNextOccurrence(currentDate, config);
    
    // Validate next date
    if (isNaN(nextDate.getTime())) {
      console.error('Invalid next date generated:', nextDate);
      break;
    }
    
    currentDate = nextDate;
    
    // Safety check to prevent infinite loops
    if (currentDate.getTime() > baseStart.getTime() + (365 * 24 * 60 * 60 * 1000)) {
      break;
    }
  }

  return events;
}

function getNextOccurrence(currentDate: Date, config: RecurringEventConfig): Date {
  let nextDate = new Date(currentDate);

  switch (config.pattern) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + config.interval);
      break;

    case 'weekly':
      if (config.weeklyDays && config.weeklyDays.length > 0) {
        // Find the next occurrence of any of the selected days
        const currentDay = nextDate.getDay();
        const nextDays = config.weeklyDays
          .filter(day => day > currentDay)
          .sort((a, b) => a - b);
        
        if (nextDays.length > 0) {
          // Next occurrence is this week
          nextDate.setDate(nextDate.getDate() + (nextDays[0] - currentDay));
        } else {
          // Next occurrence is next week
          const firstDay = Math.min(...config.weeklyDays);
          nextDate.setDate(nextDate.getDate() + (7 - currentDay + firstDay));
        }
        
        // Apply interval (every N weeks)
        if (config.interval > 1) {
          nextDate.setDate(nextDate.getDate() + (config.interval - 1) * 7);
        }
      } else {
        // Default to same day of week
        nextDate.setDate(nextDate.getDate() + (7 * config.interval));
      }
      break;

    case 'monthly':
      if (config.monthlyWeekday) {
        // Handle "first Monday", "last Friday", etc.
        nextDate = getNextMonthlyWeekday(nextDate, config.monthlyWeekday, config.interval);
      } else if (config.monthlyDay) {
        // Handle specific day of month
        nextDate = getNextMonthlyDay(nextDate, config.monthlyDay, config.interval);
      } else {
        // Default to same day of month
        nextDate.setMonth(nextDate.getMonth() + config.interval);
      }
      break;

    case 'custom':
      // For custom patterns, default to daily interval
      nextDate.setDate(nextDate.getDate() + config.interval);
      break;

    default:
      nextDate.setDate(nextDate.getDate() + 1);
  }

  return nextDate;
}

function getNextMonthlyWeekday(
  currentDate: Date, 
  monthlyWeekday: { week: number; day: number }, 
  interval: number
): Date {
  const nextDate = new Date(currentDate);
  
  // Move to next month
  nextDate.setMonth(nextDate.getMonth() + interval);
  nextDate.setDate(1); // Start from first day of month
  
  const targetWeek = monthlyWeekday.week;
  const targetDay = monthlyWeekday.day;
  
  if (targetWeek === -1) {
    // Last occurrence of the day in the month
    const lastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0);
    const lastDayOfWeek = lastDay.getDay();
    const daysToSubtract = (lastDayOfWeek - targetDay + 7) % 7;
    nextDate.setDate(lastDay.getDate() - daysToSubtract);
  } else {
    // Find the Nth occurrence of the day
    let occurrenceCount = 0;
    const currentDay = new Date(nextDate);
    
    while (currentDay.getMonth() === nextDate.getMonth()) {
      if (currentDay.getDay() === targetDay) {
        occurrenceCount++;
        if (occurrenceCount === targetWeek) {
          nextDate.setTime(currentDay.getTime());
          break;
        }
      }
      currentDay.setDate(currentDay.getDate() + 1);
    }
  }
  
  return nextDate;
}

function getNextMonthlyDay(
  currentDate: Date, 
  monthlyDay: number, 
  interval: number
): Date {
  const nextDate = new Date(currentDate);
  nextDate.setMonth(nextDate.getMonth() + interval);
  
  // Handle months with fewer days
  const daysInMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
  const targetDay = Math.min(monthlyDay, daysInMonth);
  
  nextDate.setDate(targetDay);
  return nextDate;
}

function formatDate(date: Date): string {
  // Validate the date before formatting
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  return date.toISOString().split('T')[0];
}

export function validateRecurringConfig(config: RecurringEventConfig): string[] {
  const errors: string[] = [];

  if (!config.enabled) return errors;

  if (config.interval < 1) {
    errors.push("Interval must be at least 1");
  }

  if (config.maxOccurrences < 1 || config.maxOccurrences > 6) {
    errors.push("Number of events must be between 1 and 6");
  }

  if (config.pattern === 'weekly' && (!config.weeklyDays || config.weeklyDays.length === 0)) {
    errors.push("Please select at least one day of the week");
  }

  if (config.pattern === 'monthly') {
    if (!config.monthlyDay && !config.monthlyWeekday) {
      errors.push("Please specify a monthly pattern");
    }
    
    if (config.monthlyDay && (config.monthlyDay < 1 || config.monthlyDay > 31)) {
      errors.push("Day of month must be between 1 and 31");
    }
  }

  if (config.endDate && config.maxOccurrences < 6) {
    // If end date is set, we should use it instead of max occurrences
    // This is just a warning, not an error
  }

  return errors;
}
