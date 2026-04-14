import { memo } from "react";
import { useAuthor } from "@/hooks/useAuthor";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { X } from "lucide-react";
import { genUserName } from "@/lib/genUserName";
import { getAvatarShape } from "@/lib/avatarShapes";
import type { Participant } from "./ParticipantSearch";

interface ParticipantItemProps {
  participant: Participant;
  onRoleChange: (role: string) => void;
  onRemove: () => void;
}

// Role options as per NIP-52 spec and common event roles
const ROLE_OPTIONS = [
  { value: "speaker", label: "Speaker" },
  { value: "moderator", label: "Moderator" },
  { value: "host", label: "Host" },
  { value: "organizer", label: "Organizer" },
  { value: "panelist", label: "Panelist" },
  { value: "attendee", label: "Attendee" },
  { value: "performer", label: "Performer" },
  { value: "facilitator", label: "Facilitator" },
];

export const ParticipantItem = memo(function ParticipantItem({ participant, onRoleChange, onRemove }: ParticipantItemProps) {
  // Automatically load metadata if not present
  const { data: authorData } = useAuthor(participant.pubkey);

  // Use loaded metadata if available, otherwise fall back to participant metadata
  const metadata = authorData?.metadata || participant.metadata;
  const displayName = metadata?.name || metadata?.display_name || genUserName(participant.pubkey);
  const shape = getAvatarShape(metadata);

  return (
    <Card className="p-0">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10" shape={shape}>
            <AvatarImage src={metadata?.picture} />
            <AvatarFallback className="text-sm">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate" title={displayName}>
              {displayName}
            </div>
            {metadata?.about && (
              <div className="text-xs text-muted-foreground truncate" title={metadata.about}>
                {metadata.about}
              </div>
            )}
            <div className="text-xs text-muted-foreground font-mono truncate" title={participant.npub}>
              {participant.npub.slice(0, 20)}...
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={participant.role}
              onValueChange={onRoleChange}
            >
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="text-xs"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});