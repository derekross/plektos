import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// Note: Using radio buttons instead of checkboxes for better UX
import { Clock, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RecurringEventConfig {
  enabled: boolean;
  pattern: 'daily' | 'weekly' | 'monthly' | 'custom';
  interval: number; // Every N days/weeks/months
  maxOccurrences: number; // Maximum 6 as per requirement
  weeklyDays?: number[]; // For weekly: 0=Sunday, 1=Monday, etc.
  monthlyDay?: number; // For monthly: day of month (1-31)
  monthlyWeekday?: { week: number; day: number }; // For monthly: "first Monday", "last Friday", etc.
  endDate?: string; // Alternative to maxOccurrences
  // Enhanced options for Eventbrite-style interface
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  timeSlots?: {
    startTime: string;
    endTime: string;
  }[];
  timeMode: 'single' | 'multiple'; // Single time vs multiple time slots
}

interface RecurringEventFormProps {
  config: RecurringEventConfig;
  onChange: (config: RecurringEventConfig) => void;
  className?: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];

const WEEK_OPTIONS = [
  { value: 1, label: 'First' },
  { value: 2, label: 'Second' },
  { value: 3, label: 'Third' },
  { value: 4, label: 'Fourth' },
  { value: -1, label: 'Last' },
];

export function RecurringEventForm({ config, onChange, className }: RecurringEventFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateConfig = (updates: Partial<RecurringEventConfig>) => {
    onChange({ ...config, ...updates });
  };

  const handlePatternChange = (pattern: RecurringEventConfig['pattern']) => {
    const updates: Partial<RecurringEventConfig> = { pattern };
    
    // Reset pattern-specific settings when changing patterns
    if (pattern !== 'weekly') {
      updates.weeklyDays = undefined;
    }
    if (pattern !== 'monthly') {
      updates.monthlyDay = undefined;
      updates.monthlyWeekday = undefined;
    }
    
    updateConfig(updates);
  };

  const toggleWeeklyDay = (day: number) => {
    const currentDays = config.weeklyDays || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day];
    
    updateConfig({ weeklyDays: newDays.length > 0 ? newDays : undefined });
  };

  const getPreviewText = () => {
    if (!config.enabled) return "No recurrence";
    
    const { pattern, interval, maxOccurrences, weeklyDays, monthlyDay, monthlyWeekday } = config;
    
    switch (pattern) {
      case 'daily':
        return `Every ${interval === 1 ? 'day' : `${interval} days`} (${maxOccurrences} events)`;
      
      case 'weekly':
        if (weeklyDays && weeklyDays.length > 0) {
          const dayNames = weeklyDays.map(day => DAYS_OF_WEEK[day].short).join(', ');
          return `Every ${interval === 1 ? 'week' : `${interval} weeks`} on ${dayNames} (${maxOccurrences} events)`;
        }
        return `Every ${interval === 1 ? 'week' : `${interval} weeks`} (${maxOccurrences} events)`;
      
      case 'monthly':
        if (monthlyWeekday) {
          const weekLabel = WEEK_OPTIONS.find(w => w.value === monthlyWeekday.week)?.label || '';
          const dayLabel = DAYS_OF_WEEK[monthlyWeekday.day].label;
          return `Every ${interval === 1 ? 'month' : `${interval} months`} on the ${weekLabel.toLowerCase()} ${dayLabel.toLowerCase()} (${maxOccurrences} events)`;
        }
        if (monthlyDay) {
          return `Every ${interval === 1 ? 'month' : `${interval} months`} on the ${monthlyDay}${getOrdinalSuffix(monthlyDay)} (${maxOccurrences} events)`;
        }
        return `Every ${interval === 1 ? 'month' : `${interval} months`} (${maxOccurrences} events)`;
      
      case 'custom':
        return `Custom pattern (${maxOccurrences} events)`;
      
      default:
        return "No recurrence";
    }
  };

  const getOrdinalSuffix = (num: number) => {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
  };

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Repeat className="h-5 w-5" />
            Recurring Event
          </CardTitle>
          <div className="flex items-center gap-2">
            <Switch
              checked={config.enabled}
              onCheckedChange={(enabled) => updateConfig({ enabled })}
            />
            <Label className="text-sm">Enable recurrence</Label>
          </div>
        </div>
      </CardHeader>

      {config.enabled && (
        <CardContent className="space-y-6">
          {/* Pattern Selection */}
          <div className="space-y-3">
            <Label>Repeat pattern</Label>
            <Select value={config.pattern} onValueChange={handlePatternChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Interval */}
          <div className="space-y-3">
            <Label>Repeat every</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max="12"
                value={config.interval}
                onChange={(e) => updateConfig({ interval: parseInt(e.target.value) || 1 })}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">
                {config.pattern === 'daily' && 'day(s)'}
                {config.pattern === 'weekly' && 'week(s)'}
                {config.pattern === 'monthly' && 'month(s)'}
                {config.pattern === 'custom' && 'interval(s)'}
              </span>
            </div>
          </div>

          {/* Weekly Options */}
          {config.pattern === 'weekly' && (
            <div className="space-y-3">
              <Label>Days of the week</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => (
                  <Button
                    key={day.value}
                    variant={config.weeklyDays?.includes(day.value) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleWeeklyDay(day.value)}
                    className="h-8"
                  >
                    {day.short}
                  </Button>
                ))}
              </div>
              {config.weeklyDays && config.weeklyDays.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Select at least one day of the week
                </p>
              )}
            </div>
          )}

          {/* Monthly Options */}
          {config.pattern === 'monthly' && (
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>Monthly pattern</Label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="monthly-day"
                      name="monthly-pattern"
                      checked={!config.monthlyWeekday}
                      onChange={() => updateConfig({ monthlyWeekday: undefined })}
                    />
                    <Label htmlFor="monthly-day" className="text-sm">
                      On a specific day of the month
                    </Label>
                  </div>
                  {!config.monthlyWeekday && (
                    <div className="ml-6 flex items-center gap-2">
                      <span className="text-sm">Day</span>
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        value={config.monthlyDay || ''}
                        onChange={(e) => updateConfig({ monthlyDay: parseInt(e.target.value) || undefined })}
                        className="w-20"
                      />
                    </div>
                  )}

                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="monthly-weekday"
                      name="monthly-pattern"
                      checked={!!config.monthlyWeekday}
                      onChange={() => updateConfig({ monthlyWeekday: { week: 1, day: 1 } })}
                    />
                    <Label htmlFor="monthly-weekday" className="text-sm">
                      On a specific weekday of the month
                    </Label>
                  </div>
                  {config.monthlyWeekday && (
                    <div className="ml-6 flex items-center gap-2">
                      <Select
                        value={config.monthlyWeekday.week.toString()}
                        onValueChange={(value) => 
                          updateConfig({ 
                            monthlyWeekday: { 
                              ...config.monthlyWeekday!, 
                              week: parseInt(value) 
                            } 
                          })
                        }
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEK_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value.toString()}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={config.monthlyWeekday.day.toString()}
                        onValueChange={(value) => 
                          updateConfig({ 
                            monthlyWeekday: { 
                              ...config.monthlyWeekday!, 
                              day: parseInt(value) 
                            } 
                          })
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAYS_OF_WEEK.map((day) => (
                            <SelectItem key={day.value} value={day.value.toString()}>
                              {day.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Max Occurrences */}
          <div className="space-y-3">
            <Label>Number of events to create</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max="6"
                value={config.maxOccurrences}
                onChange={(e) => updateConfig({ maxOccurrences: parseInt(e.target.value) || 1 })}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">
                (maximum 6 events)
              </span>
            </div>
          </div>

          {/* Preview */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4" />
              <span className="font-medium">Preview:</span>
              <span className="text-muted-foreground">{getPreviewText()}</span>
            </div>
          </div>

          {/* Advanced Options */}
          <div className="space-y-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="p-0 h-auto"
            >
              {showAdvanced ? 'Hide' : 'Show'} advanced options
            </Button>
            
            {showAdvanced && (
              <div className="space-y-3 pl-4 border-l-2 border-muted">
                <div className="space-y-2">
                  <Label className="text-sm">End date (optional)</Label>
                  <Input
                    type="date"
                    value={config.endDate || ''}
                    onChange={(e) => updateConfig({ endDate: e.target.value || undefined })}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use number of events instead
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
