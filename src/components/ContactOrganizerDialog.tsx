import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useDirectMessage } from "@/hooks/useDirectMessage";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthor } from "@/hooks/useAuthor";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageCircle, Lock, MessageSquare } from "lucide-react";
import { getAvatarShape } from "@/lib/avatarShapes";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ContactOrganizerDialogProps {
  organizerPubkey: string;
  eventTitle: string;
}

export function ContactOrganizerDialog({
  organizerPubkey,
  eventTitle,
}: ContactOrganizerDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const { user } = useCurrentUser();
  const { sendDirectMessage } = useDirectMessage();
  const organizer = useAuthor(organizerPubkey);

  const organizerMetadata = organizer.data?.metadata;
  const organizerName =
    organizerMetadata?.name ||
    organizerMetadata?.display_name ||
    organizerPubkey.slice(0, 8);
  const organizerImage = organizerMetadata?.picture;
  const shape = getAvatarShape(organizerMetadata);

  const handleSendMessage = async () => {
    if (!message.trim() || !user) return;

    setIsSending(true);
    try {
      // Add context about the event to the message
      const fullMessage = `Regarding "${eventTitle}":\n\n${message}`;
      await sendDirectMessage(organizerPubkey, fullMessage);
      setMessage("");
      setIsOpen(false);
    } catch (error) {
      // Error handling is done in the hook
      console.error("Failed to send message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !isSending) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!user) {
    return (
      <Button
        disabled
        size="sm"
        variant="outline"
        className="flex items-center gap-2"
      >
        <MessageCircle className="h-4 w-4" />
        Contact Organizer
      </Button>
    );
  }

  // Don't show the button if user is the organizer
  if (user.pubkey === organizerPubkey) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Contact
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-green-600" />
            Send Private Message
          </DialogTitle>
          <DialogDescription>
            Send a secure, encrypted direct message to the event organizer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Organizer info */}
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <Avatar className="h-8 w-8" shape={shape}>
              <AvatarImage src={organizerImage} alt={organizerName} />
              <AvatarFallback>{organizerName.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-sm">{organizerName}</p>
              <p className="text-xs text-muted-foreground">Event Organizer</p>
            </div>
          </div>

          {/* Security notice */}
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              This message will be encrypted using NIP-17 and only visible to
              you and the organizer.
            </AlertDescription>
          </Alert>

          {/* Message input */}
          <div className="space-y-2">
            <Label htmlFor="message">Your Message</Label>
            <Textarea
              id="message"
              placeholder={`Send a message to ${organizerName} about "${eventTitle}"...`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[120px] resize-none"
              disabled={isSending}
            />
            <p className="text-xs text-muted-foreground">
              Press Ctrl+Enter to send • Your message will automatically include
              the event title for context
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSendMessage}
            disabled={!message.trim() || isSending}
          >
            {isSending ? (
              <>Sending...</>
            ) : (
              <>
                <MessageCircle className="h-4 w-4 mr-2" />
                Send Message
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
