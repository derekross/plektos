import { Bell, CheckCheck, MessageCircle, Heart, Zap, Check, X, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/contexts/NotificationContext";
import { useAuthor } from "@/hooks/useAuthor";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getAvatarShape } from "@/lib/avatarShapes";
import { formatDistance } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import type { Notification } from "@/lib/notificationTypes";

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onClose: () => void;
}

function NotificationItem({
  notification,
  onMarkAsRead,
  onClose,
}: NotificationItemProps) {
  const navigate = useNavigate();
  const author = useAuthor(notification.fromPubkey);
  const metadata = author.data?.metadata;
  const authorName =
    metadata?.display_name ||
    metadata?.name ||
    `${notification.fromPubkey.slice(0, 8)}...`;
  const authorImage = metadata?.picture;
  const shape = getAvatarShape(metadata);

  const handleClick = () => {
    console.log(
      "Notification clicked:",
      notification.id,
      "read state:",
      notification.read
    );

    // Always mark as read when clicked
    onMarkAsRead(notification.id);

    // Navigate to the event page
    console.log("Navigating to event:", notification.eventId);
    navigate(`/event/${notification.eventId}`);

    // Close the dropdown
    onClose();
  };

  const getIcon = () => {
    switch (notification.type) {
      case "rsvp":
        switch (notification.status) {
          case "accepted":
            return <Check className="h-4 w-4 text-green-500" />;
          case "declined":
            return <X className="h-4 w-4 text-red-500" />;
          case "tentative":
            return <HelpCircle className="h-4 w-4 text-amber-500" />;
          default:
            return <Heart className="h-4 w-4 text-pink-500" />;
        }
      case "comment":
        return <MessageCircle className="h-4 w-4 text-blue-500" />;
      case "zap":
        return <Zap className="h-4 w-4 text-yellow-500" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getMessage = () => {
    switch (notification.type) {
      case "rsvp": {
        return `${notification.status} your event "${notification.eventTitle}"`;
      }
      case "comment": {
        const commentText = notification.commentContent || "";
        return `commented on "${notification.eventTitle}": "${commentText.slice(
          0,
          50
        )}${commentText.length > 50 ? "..." : ""}"`;
      }
      case "zap": {
        const zapAmount = notification.amount || 0;
        const zapComment = notification.comment;
        const zapMessage = `zapped ${zapAmount} sats to "${notification.eventTitle}"`;
        return zapComment
          ? `${zapMessage}: "${zapComment.slice(0, 30)}${
              zapComment.length > 30 ? "..." : ""
            }"`
          : zapMessage;
      }
      default:
        return "Unknown notification";
    }
  };

  const timeAgo = formatDistance(new Date(notification.timestamp), new Date(), {
    addSuffix: true,
  });

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors",
        !notification.read && "bg-muted/20"
      )}
      onClick={handleClick}
    >
      <Avatar className="h-8 w-8 flex-shrink-0" shape={shape}>
        <AvatarImage src={authorImage} alt={authorName} />
        <AvatarFallback className="text-xs">
          {authorName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {getIcon()}
            <span className="font-medium text-sm truncate">{authorName}</span>
          </div>
          {!notification.read && (
            <div className="h-2 w-2 bg-blue-500 rounded-full flex-shrink-0" />
          )}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {getMessage()}
        </p>
        <span className="text-xs text-muted-foreground">{timeAgo}</span>
      </div>
    </div>
  );
}

export function NotificationBell({ className }: { className?: string }) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } =
    useNotifications();
  const [open, setOpen] = useState(false);

  const handleMarkAllAsRead = () => {
    markAllAsRead();
  };

  const handleClearAll = () => {
    clearAll();
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className={cn("h-5 w-5", className)} />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
          <span className="sr-only">
            {unreadCount > 0
              ? `${unreadCount} unread notifications`
              : "Notifications"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0" forceMount>
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-semibold">Notifications</h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={handleMarkAllAsRead}
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground"
                onClick={handleClearAll}
              >
                Clear all
              </Button>
            )}
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No notifications yet</p>
            <p className="text-xs">You'll see RSVPs, comments, and zaps here</p>
          </div>
        ) : (
          <ScrollArea className="h-80">
            <div className="max-h-80 divide-y">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={markAsRead}
                  onClose={handleClose}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
