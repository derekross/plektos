import { useState } from "react";
import { useAuthor } from "@/hooks/useAuthor";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { genUserName } from "@/lib/genUserName";
import { getAvatarShape } from "@/lib/avatarShapes";
import { nip19 } from "nostr-tools";
import { ChevronDown, ChevronRight } from "lucide-react";

interface EventParticipant {
  pubkey: string;
  role: string;
  relay?: string;
}

interface ParticipantDisplayProps {
  participants: EventParticipant[];
  className?: string;
}

function ParticipantCard({ participant }: { participant: EventParticipant }) {
  const { data: authorData } = useAuthor(participant.pubkey);
  const metadata = authorData?.metadata;
  const displayName = metadata?.name || metadata?.display_name || genUserName(participant.pubkey);
  const shape = getAvatarShape(metadata);
  const npub = nip19.npubEncode(participant.pubkey);

  return (
    <Card className="p-0">
      <CardContent className="p-2 sm:p-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <Avatar className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0" shape={shape}>
            <AvatarImage src={metadata?.picture} />
            <AvatarFallback className="text-xs sm:text-sm">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <a
              href={`https://njump.me/${npub}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-xs sm:text-sm truncate hover:underline block"
              title={`View ${displayName} on njump.me`}
            >
              {displayName}
            </a>
          </div>

          <Badge variant="outline" className="text-xs flex-shrink-0">
            {participant.role}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function ParticipantDisplay({ participants, className }: ParticipantDisplayProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (participants.length === 0) {
    return null;
  }

  // Group participants by role
  const participantsByRole = participants.reduce((acc, participant) => {
    const role = participant.role || 'participant';
    if (!acc[role]) {
      acc[role] = [];
    }
    acc[role].push(participant);
    return acc;
  }, {} as Record<string, EventParticipant[]>);

  // Sort roles by importance
  const roleOrder = ['host', 'organizer', 'speaker', 'moderator', 'panelist', 'performer', 'facilitator', 'attendee'];
  const sortedRoles = Object.keys(participantsByRole).sort((a, b) => {
    const aIndex = roleOrder.indexOf(a);
    const bIndex = roleOrder.indexOf(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  const totalParticipants = participants.length;

  return (
    <div className={className}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
            <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
              <span className="hidden sm:inline">👥</span>
              <span className="sm:hidden">👥</span>
              <span className="truncate">Participants ({totalParticipants})</span>
            </h3>
            {isOpen ? (
              <ChevronDown className="h-4 w-4 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 flex-shrink-0" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 sm:mt-3">
          <div className="space-y-3 sm:space-y-4">
            {sortedRoles.map(role => (
              <div key={role}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs">
                    {role.charAt(0).toUpperCase() + role.slice(1)}s
                  </Badge>
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    {participantsByRole[role].length} {participantsByRole[role].length === 1 ? 'person' : 'people'}
                  </span>
                </div>
                <div className="space-y-2">
                  {participantsByRole[role].map(participant => (
                    <ParticipantCard key={participant.pubkey} participant={participant} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}