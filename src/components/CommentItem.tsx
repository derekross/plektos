import { formatDistanceToNow } from "date-fns";
import { Heart } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuthor } from "@/hooks/useAuthor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";
import { UserActionsMenu } from "@/components/UserActionsMenu";
import type { NostrEvent } from "@nostrify/nostrify";

interface CommentItemProps {
  comment: NostrEvent;
  likeCount: number;
  hasUserLiked: boolean;
  onLike: () => void;
}

export function CommentItem({ 
  comment, 
  likeCount, 
  hasUserLiked, 
  onLike 
}: CommentItemProps) {
  const { user } = useCurrentUser();
  const author = useAuthor(comment.pubkey);
  
  const authorMetadata = author.data?.metadata;
  const displayName = authorMetadata?.name || 
                      authorMetadata?.display_name || 
                      comment.pubkey.slice(0, 8);
  const profileImage = authorMetadata?.picture;
  
  const timeAgo = formatDistanceToNow(new Date(comment.created_at * 1000), {
    addSuffix: true,
  });

  return (
    <div className="flex gap-3 p-4 border rounded-lg bg-card">
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarImage src={profileImage} alt={displayName} />
        <AvatarFallback className="text-xs">
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{displayName}</span>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
          </div>
          <UserActionsMenu 
            pubkey={comment.pubkey} 
            authorName={displayName}
          />
        </div>
        
        <p className="text-sm text-foreground whitespace-pre-wrap break-words">
          {comment.content}
        </p>
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 px-2 gap-1",
              hasUserLiked && "text-red-500 hover:text-red-600"
            )}
            onClick={onLike}
            disabled={!user}
          >
            <Heart 
              className={cn(
                "h-3 w-3",
                hasUserLiked && "fill-current"
              )} 
            />
            {likeCount > 0 && (
              <span className="text-xs font-medium">{likeCount}</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}