import { useMuteList } from "@/hooks/useMuteList";
import { useAuthor } from "@/hooks/useAuthor";
import { getAvatarShape } from "@/lib/avatarShapes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

function MutedUserItem({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const { unmutePubkey, getMuteReason } = useMuteList();
  const [isUnmuting, setIsUnmuting] = useState(false);
  
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || metadata?.display_name || pubkey.slice(0, 8);
  const profileImage = metadata?.picture;
  const shape = getAvatarShape(metadata);
  const muteReason = getMuteReason(pubkey);

  const handleUnmute = async () => {
    setIsUnmuting(true);
    try {
      await unmutePubkey(pubkey);
      toast.success(`Unmuted ${displayName}`);
    } catch (error) {
      console.error("Error unmuting user:", error);
      toast.error("Failed to unmute user");
    } finally {
      setIsUnmuting(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10" shape={shape}>
          <AvatarImage src={profileImage} alt={displayName} />
          <AvatarFallback>{displayName.slice(0, 2)}</AvatarFallback>
        </Avatar>
        <div>
          <div className="font-medium">{displayName}</div>
          <div className="text-sm text-muted-foreground">
            {pubkey.slice(0, 16)}...
          </div>
          {muteReason && (
            <div className="text-xs text-muted-foreground mt-1">
              Reason: {muteReason}
            </div>
          )}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleUnmute}
        disabled={isUnmuting}
        className="flex items-center gap-2"
      >
        <Volume2 className="h-4 w-4" />
        {isUnmuting ? "Unmuting..." : "Unmute"}
      </Button>
    </div>
  );
}

export function MutedUsers() {
  const { mutedPubkeys, isLoading } = useMuteList();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Muted Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">
            Loading muted users...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (mutedPubkeys.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Muted Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            <Volume2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No muted users</p>
            <p className="text-sm">
              Users you mute won't show up in your event feed
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Muted Users ({mutedPubkeys.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {mutedPubkeys.map((pubkey) => (
            <MutedUserItem key={pubkey} pubkey={pubkey} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}