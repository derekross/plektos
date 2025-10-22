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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarIcon, Repeat, Calendar as CalendarViewIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export interface EventbriteRecurringConfig {
  enabled: boolean;
  // Date range
  startDate: string;
  endDate: string;
  // Repeat settings
  repeatEvery: number;
  repeatUnit: 'day' | 'week' | 'month';
  // Weekly settings
  repeatOnDays: number[]; // 0=Sunday, 1=Monday, etc.
  // Monthly settings
  monthlyPattern?: 'day' | 'weekday';
  monthlyWeek?: number; // 1, 2, 3, 4, or -1 for last
  monthlyWeekday?: number; // 0=Sunday, 1=Monday, etc.
  // Time settings
  timeMode: 'single' | 'multiple';
  timeSlots: {
    id: string;
    startTime: string;
    endTime: string;
  }[];
  // End settings
  endType: 'date' | 'occurrences';
  endDateForRecurring?: string;
  maxOccurrences?: number;
}

interface EventbriteStyleRecurringFormProps {
  config: EventbriteRecurringConfig;
  onChange: (config: EventbriteRecurringConfig) => void;
  className?: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Su', fullLabel: 'Sunday' },
  { value: 1, label: 'Mo', fullLabel: 'Monday' },
  { value: 2, label: 'Tu', fullLabel: 'Tuesday' },
  { value: 3, label: 'We', fullLabel: 'Wednesday' },
  { value: 4, label: 'Th', fullLabel: 'Thursday' },
  { value: 5, label: 'Fr', fullLabel: 'Friday' },
  { value: 6, label: 'Sa', fullLabel: 'Saturday' },
];

export function EventbriteStyleRecurringForm({ config, onChange, className }: EventbriteStyleRecurringFormProps) {

  const updateConfig = (updates: Partial<EventbriteRecurringConfig>) => {
    onChange({ ...config, ...updates });
  };

  const toggleDay = (day: number) => {
    const currentDays = config.repeatOnDays || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day];
    
    updateConfig({ repeatOnDays: newDays });
  };


  const getPreviewText = () => {
    if (!config.enabled) return "No recurrence";
    
    const { repeatEvery, repeatUnit, repeatOnDays, monthlyPattern, monthlyWeek, monthlyWeekday } = config;
    
    if (repeatUnit === 'week' && repeatOnDays.length > 0) {
      const dayNames = repeatOnDays.map(day => DAYS_OF_WEEK[day].label).join(', ');
      return `Every ${repeatEvery === 1 ? '' : repeatEvery + ' '}week${repeatEvery === 1 ? '' : 's'} on ${dayNames}`;
    }
    
    if (repeatUnit === 'month') {
      if (monthlyPattern === 'weekday' && monthlyWeek && monthlyWeekday !== undefined) {
        const weekText = monthlyWeek === -1 ? 'last' : 
                        monthlyWeek === 1 ? '1st' :
                        monthlyWeek === 2 ? '2nd' :
                        monthlyWeek === 3 ? '3rd' : `${monthlyWeek}th`;
        const dayName = DAYS_OF_WEEK[monthlyWeekday].fullLabel;
        return `Every ${repeatEvery === 1 ? '' : repeatEvery + ' '}month${repeatEvery === 1 ? '' : 's'} on the ${weekText} ${dayName}`;
      }
      return `Every ${repeatEvery === 1 ? '' : repeatEvery + ' '}month${repeatEvery === 1 ? '' : 's'} on the same day`;
    }
    
    return `Every ${repeatEvery === 1 ? '' : repeatEvery + ' '}${repeatUnit}${repeatEvery === 1 ? '' : 's'}`;
  };

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Repeat className="h-5 w-5" />
            Recurring Event Setup
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
          {/* Date Range - Only show if not using main form dates */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Recurring Series Date Range</Label>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                The recurring series will use the main event's start and end dates as the base dates.
                Each occurrence will be calculated based on the repeat pattern below.
              </p>
            </div>
          </div>

          {/* Repeat Settings */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Repeat Settings</Label>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label>Repeat every</Label>
                <Input
                  type="number"
                  min="1"
                  max="12"
                  value={config.repeatEvery}
                  onChange={(e) => updateConfig({ repeatEvery: parseInt(e.target.value) || 1 })}
                  className="w-16"
                />
              </div>
              
              <Select
                value={config.repeatUnit}
                onValueChange={(value: 'day' | 'week' | 'month') => updateConfig({ repeatUnit: value })}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day(s)</SelectItem>
                  <SelectItem value="week">Week(s)</SelectItem>
                  <SelectItem value="month">Month(s)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Weekly Day Selection */}
            {config.repeatUnit === 'week' && (
              <div className="space-y-3">
                <Label>Repeat on</Label>
                <div className="flex gap-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <Button
                      key={day.value}
                      variant={config.repeatOnDays?.includes(day.value) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleDay(day.value)}
                      className="h-8 w-8 p-0"
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
                {config.repeatOnDays && config.repeatOnDays.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Select at least one day of the week
                  </p>
                )}
              </div>
            )}

            {/* Monthly Pattern Selection */}
            {config.repeatUnit === 'month' && (
              <div className="space-y-3">
                <Label>Monthly Pattern</Label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="monthly-day"
                      name="monthly-pattern"
                      checked={config.monthlyPattern === 'day'}
                      onChange={() => updateConfig({ monthlyPattern: 'day' })}
                    />
                    <Label htmlFor="monthly-day">Same day of month (e.g., 15th of every month)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="monthly-weekday"
                      name="monthly-pattern"
                      checked={config.monthlyPattern === 'weekday'}
                      onChange={() => updateConfig({ monthlyPattern: 'weekday' })}
                    />
                    <Label htmlFor="monthly-weekday">Same weekday of month (e.g., 3rd Thursday)</Label>
                  </div>
                  
                  {config.monthlyPattern === 'weekday' && (
                    <div className="ml-6 space-y-3">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Label>Which week:</Label>
                          <Select
                            value={config.monthlyWeek?.toString() || '1'}
                            onValueChange={(value) => updateConfig({ monthlyWeek: parseInt(value) })}
                          >
                            <SelectTrigger className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1st</SelectItem>
                              <SelectItem value="2">2nd</SelectItem>
                              <SelectItem value="3">3rd</SelectItem>
                              <SelectItem value="4">4th</SelectItem>
                              <SelectItem value="-1">Last</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Label>Day of week:</Label>
                          <Select
                            value={config.monthlyWeekday?.toString() || '1'}
                            onValueChange={(value) => updateConfig({ monthlyWeekday: parseInt(value) })}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DAYS_OF_WEEK.map((day) => (
                                <SelectItem key={day.value} value={day.value.toString()}>
                                  {day.fullLabel}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Time Settings - Use main form times */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Time</Label>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                The recurring series will use the main event's start and end times.
                Each occurrence will have the same time as the base event.
              </p>
            </div>
          </div>

          {/* End Settings */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">End</Label>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="end-date"
                  name="end-type"
                  checked={config.endType === 'date'}
                  onChange={() => updateConfig({ endType: 'date' })}
                />
                <Label htmlFor="end-date">End date</Label>
              </div>
              {config.endType === 'date' && (
                <div className="ml-6">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !config.endDateForRecurring && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {config.endDateForRecurring ? format(new Date(config.endDateForRecurring), "PPP") : "Pick end date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={config.endDateForRecurring ? new Date(config.endDateForRecurring) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            updateConfig({ endDateForRecurring: date.toISOString().split('T')[0] });
                          }
                        }}
                        disabled={(date) => {
                          const startDate = config.startDate ? new Date(config.startDate) : new Date();
                          return date < startDate;
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="end-occurrences"
                  name="end-type"
                  checked={config.endType === 'occurrences'}
                  onChange={() => updateConfig({ endType: 'occurrences' })}
                />
                <Label htmlFor="end-occurrences">After</Label>
              </div>
              {config.endType === 'occurrences' && (
                <div className="ml-6 flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    max="6"
                    value={config.maxOccurrences || 1}
                    onChange={(e) => updateConfig({ maxOccurrences: parseInt(e.target.value) || 1 })}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">occurrences</span>
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <CalendarViewIcon className="h-4 w-4" />
              <span className="font-medium">Preview:</span>
              <span className="text-muted-foreground">{getPreviewText()}</span>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
