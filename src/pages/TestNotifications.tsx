import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNotifications } from "@/contexts/NotificationContext";
import type { Notification } from "@/lib/notificationTypes";

export function TestNotifications() {
  const { addNotification, notifications, markAsRead, markAllAsRead } = useNotifications();

  const addTestRSVP = () => {
    const notification: Notification = {
      id: `rsvp-test-${Date.now()}`,
      type: 'rsvp',
      timestamp: Date.now(),
      read: false,
      eventId: 'test-event-123',
      eventTitle: 'Test Event RSVP',
      fromPubkey: 'npub1test123456789',
      status: 'accepted',
    };
    addNotification(notification);
  };

  const addTestRSVPDeclined = () => {
    const notification: Notification = {
      id: `rsvp-declined-test-${Date.now()}`,
      type: 'rsvp',
      timestamp: Date.now(),
      read: false,
      eventId: 'test-event-declined',
      eventTitle: 'Test Event RSVP Declined',
      fromPubkey: 'npub1testdecliner',
      status: 'declined',
    };
    addNotification(notification);
  };

  const addTestRSVPTentative = () => {
    const notification: Notification = {
      id: `rsvp-tentative-test-${Date.now()}`,
      type: 'rsvp',
      timestamp: Date.now(),
      read: false,
      eventId: 'test-event-tentative',
      eventTitle: 'Test Event RSVP Tentative',
      fromPubkey: 'npub1testmaybe',
      status: 'tentative',
    };
    addNotification(notification);
  };

  const addTestComment = () => {
    const notification: Notification = {
      id: `comment-test-${Date.now()}`,
      type: 'comment',
      timestamp: Date.now(),
      read: false,
      eventId: 'test-event-456',
      eventTitle: 'Test Event Comment',
      fromPubkey: 'npub1test987654321',
      commentContent: 'This is a test comment on your awesome event!',
      commentId: `comment-${Date.now()}`,
    };
    addNotification(notification);
  };

  const addTestZap = () => {
    const notification: Notification = {
      id: `zap-test-${Date.now()}`,
      type: 'zap',
      timestamp: Date.now(),
      read: false,
      eventId: 'test-event-789',
      eventTitle: 'Test Event Zap',
      fromPubkey: 'npub1test111222333',
      amount: 1000,
      comment: 'Great event! ⚡',
    };
    addNotification(notification);
  };

  const addMultipleNotifications = () => {
    // Add 10 test notifications for scrolling test
    for (let i = 1; i <= 10; i++) {
      const notification: Notification = {
        id: `test-${Date.now()}-${i}`,
        type: i % 3 === 0 ? 'zap' : i % 2 === 0 ? 'comment' : 'rsvp',
        timestamp: Date.now() + (i * 1000), // Slightly different timestamps
        read: false,
        eventId: `test-event-${100 + i}`,
        eventTitle: `Test Event ${i}`,
        fromPubkey: `npub1test${i.toString().padStart(3, '0')}`,
        ...(i % 3 === 0 ? {
          amount: 1000 * i,
          comment: `Great event ${i}! ⚡`
        } : i % 2 === 0 ? {
          commentContent: `This is test comment number ${i} on your awesome event!`,
          commentId: `comment-${Date.now()}-${i}`,
        } : {
          status: i % 4 === 1 ? 'accepted' : i % 4 === 2 ? 'declined' : 'tentative' as 'accepted' | 'declined' | 'tentative'
        })
      };
      addNotification(notification);
    }
  };

  const testMarkAsRead = () => {
    if (notifications.length > 0) {
      const firstNotification = notifications[0];
      markAsRead(firstNotification.id);
    }
  };

  const testMarkAllAsRead = () => {
    markAllAsRead();
  };

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Notification Debug Panel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button onClick={addTestRSVP} className="w-full" variant="default">
              ✅ Add RSVP: Going
            </Button>
            
            <Button onClick={addTestRSVPDeclined} className="w-full" variant="destructive">
              ❌ Add RSVP: Can't Go
            </Button>
            
            <Button onClick={addTestRSVPTentative} className="w-full" variant="secondary">
              💖 Add RSVP: Maybe
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button onClick={addTestComment} className="w-full">
              💬 Add Comment
            </Button>
            
            <Button onClick={addTestZap} className="w-full">
              ⚡ Add Zap
            </Button>
            
            <Button onClick={addMultipleNotifications} variant="outline" className="w-full">
              Add 10 for Scroll Test
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button onClick={testMarkAsRead} variant="outline" className="w-full">
              Mark First as Read
            </Button>
            
            <Button onClick={testMarkAllAsRead} variant="outline" className="w-full">
              Mark All as Read
            </Button>
          </div>
          
          <div className="mt-6">
            <h3 className="font-semibold mb-3">Current Notifications ({notifications.length}):</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {notifications.map((notification, index) => (
                <div key={notification.id} className="p-3 border rounded bg-muted/10">
                  <div className="text-sm font-mono">
                    <div className="mb-1">
                      <strong>#{index + 1}:</strong> {notification.type} | 
                      <span className={notification.read ? "text-green-600" : "text-red-600"}>
                        {notification.read ? " READ" : " UNREAD"}
                      </span>
                    </div>
                    <div>ID: {notification.id}</div>
                    <div>Event: {notification.eventTitle}</div>
                    <div>Event ID: {notification.eventId}</div>
                    <div>From: {notification.fromPubkey.slice(0, 20)}...</div>
                    {notification.status && <div>Status: {notification.status}</div>}
                    {notification.commentContent && <div>Comment: {notification.commentContent}</div>}
                    {notification.amount && <div>Amount: {notification.amount} sats</div>}
                  </div>
                </div>
              ))}
              {notifications.length === 0 && (
                <p className="text-muted-foreground text-center py-4">
                  No notifications. Add some test notifications above!
                </p>
              )}
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-muted/20 rounded">
            <p className="text-sm text-muted-foreground">
              <strong>Instructions:</strong> 
              <br />1. Add test notifications using the buttons above
              <br />   • Use "RSVP: Going" to see green checkmark ✅
              <br />   • Use "RSVP: Can't Go" to see red X ❌  
              <br />   • Use "RSVP: Maybe" to see pink heart 💖
              <br />   • Use "Add 10 for Scroll Test" to test scrolling behavior
              <br />2. Check the notification bell in the header (should show count)
              <br />3. Click on notifications to test navigation and mark as read
              <br />4. Test scrolling in the notification dropdown when you have many notifications
              <br />5. Open browser dev tools to see console logs for debugging
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}