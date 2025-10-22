import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar, Download, ExternalLink } from "lucide-react";
import { downloadICS, openInCalendar, getCalendarOptions } from "@/lib/icsExport";
import type { DateBasedEvent, TimeBasedEvent, LiveEvent, RoomMeeting } from "@/lib/eventTypes";

interface CalendarOptionsProps {
  event: DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting;
  className?: string;
}

export function CalendarOptions({ event, className }: CalendarOptionsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleQuickAdd = () => {
    try {
      openInCalendar(event);
      setIsOpen(false);
    } catch (error) {
      console.error("Error opening calendar:", error);
      // Fallback to download if opening fails
      downloadICS(event);
    }
  };

  const handleDownload = () => {
    downloadICS(event);
    setIsOpen(false);
  };

  const handleCalendarProvider = (provider: 'google' | 'outlook' | 'yahoo' | 'apple') => {
    try {
      const options = getCalendarOptions(event);
      window.open(options[provider], '_blank');
      setIsOpen(false);
    } catch (error) {
      console.error(`Error opening ${provider} calendar:`, error);
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 ${className}`}
        >
          <Calendar className="h-4 w-4" />
          <span className="hidden sm:inline">Add to Calendar</span>
          <span className="sm:hidden">Calendar</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={handleQuickAdd} className="cursor-pointer">
          <ExternalLink className="h-4 w-4 mr-2" />
          Quick Add (Auto-detect)
        </DropdownMenuItem>
        
        <div className="border-t my-1" />
        
        <DropdownMenuItem onClick={() => handleCalendarProvider('google')} className="cursor-pointer">
          <div className="flex items-center">
            <div className="w-4 h-4 mr-2 bg-blue-500 rounded-sm flex items-center justify-center">
              <span className="text-white text-xs font-bold">G</span>
            </div>
            Google Calendar
          </div>
        </DropdownMenuItem>
        
        <DropdownMenuItem onClick={() => handleCalendarProvider('outlook')} className="cursor-pointer">
          <div className="flex items-center">
            <div className="w-4 h-4 mr-2 bg-blue-600 rounded-sm flex items-center justify-center">
              <span className="text-white text-xs font-bold">O</span>
            </div>
            Outlook Calendar
          </div>
        </DropdownMenuItem>
        
        <DropdownMenuItem onClick={() => handleCalendarProvider('yahoo')} className="cursor-pointer">
          <div className="flex items-center">
            <div className="w-4 h-4 mr-2 bg-purple-600 rounded-sm flex items-center justify-center">
              <span className="text-white text-xs font-bold">Y</span>
            </div>
            Yahoo Calendar
          </div>
        </DropdownMenuItem>
        
        <DropdownMenuItem onClick={() => handleCalendarProvider('apple')} className="cursor-pointer">
          <div className="flex items-center">
            <div className="w-4 h-4 mr-2 bg-gray-800 rounded-sm flex items-center justify-center">
              <span className="text-white text-xs font-bold">🍎</span>
            </div>
            Apple Calendar
          </div>
        </DropdownMenuItem>
        
        <div className="border-t my-1" />
        
        <DropdownMenuItem onClick={handleDownload} className="cursor-pointer">
          <Download className="h-4 w-4 mr-2" />
          Download .ics file
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
