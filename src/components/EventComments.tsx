import { useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEventComments } from "@/hooks/useEventComments";
import { useAuthorsMetadata } from "@/hooks/useAuthorsMetadata";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { CommentItem } from "@/components/CommentItem";
import { toast } from "sonner";
import { useRef } from "react";
import { useBlossomUpload } from "@/hooks/useBlossomUpload";
import { Image as ImageIcon, X } from "lucide-react";

interface EventCommentsProps {
  eventId: string;
  eventTitle: string;
  eventKind?: number;
  eventPubkey?: string;
  eventIdentifier?: string; // the "d" tag value for replaceable events
}

export function EventComments({ 
  eventId, 
  eventTitle, 
  eventKind, 
  eventPubkey, 
  eventIdentifier 
}: EventCommentsProps) {
  const [newComment, setNewComment] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [newCommentImage, setNewCommentImage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useBlossomUpload();
  
  const { user } = useCurrentUser();
  const {
    comments,
    isLoading,
    postComment,
    likeComment,
    getLikeCount,
    hasUserLiked,
  } = useEventComments(eventId, eventKind, eventPubkey, eventIdentifier);

  // Single batched metadata query for all comment authors
  const commentPubkeys = useMemo(
    () => [...new Set(comments.map((c) => c.pubkey))],
    [comments]
  );
  const { data: authorsMetadata = {} } = useAuthorsMetadata(commentPubkeys);

  const handleImageUpload = async (file: File) => {
    try {
      const result = await uploadFile(file);
      setNewCommentImage(result.url);
    } catch {
      toast.error("Failed to upload image");
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
  };

  const handlePostComment = async () => {
    if ((!newComment.trim() && !newCommentImage) || !user) return;

    setIsPosting(true);
    try {
      let content = newComment.trim();
      if (newCommentImage) {
        // Add image URL on a new line (could use markdown in future)
        content = content ? `${content}\n${newCommentImage}` : newCommentImage;
      }
      await postComment(content);
      setNewComment("");
      setNewCommentImage("");
      toast.success("Comment posted!");
    } catch (error) {
      console.error("Error posting comment:", error);
      toast.error("Failed to post comment");
    } finally {
      setIsPosting(false);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!user) {
      toast.error("Please log in to like comments");
      return;
    }
    
    try {
      await likeComment(commentId);
    } catch (error) {
      console.error("Error liking comment:", error);
      toast.error("Failed to like comment");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !isPosting) {
      e.preventDefault();
      handlePostComment();
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          <h3 className="font-semibold">Discussion</h3>
        </div>
        <div className="text-sm text-muted-foreground">Loading comments...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5" />
        <h3 className="font-semibold">Discussion</h3>
        <span className="text-sm text-muted-foreground">
          ({comments.length} {comments.length === 1 ? "comment" : "comments"})
        </span>
      </div>

      {/* New Comment Form */}
      {user ? (
        <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Share your thoughts about ${eventTitle}...`}
            className="min-h-[80px] resize-none"
            disabled={isPosting}
          />
          <div className="flex items-center gap-2 justify-end mt-2">
            <span className="text-xs text-muted-foreground mr-auto">
              Press Ctrl+Enter to post
            </span>
            {/* Inline image upload button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept="image/*"
              className="hidden"
              disabled={isUploading}
            />
            {newCommentImage ? (
              <div className="relative flex items-center">
                <img
                  src={newCommentImage}
                  alt="Preview"
                  className="h-8 w-8 object-cover rounded mr-1 border"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute -top-2 -right-2 h-5 w-5 p-0"
                  onClick={() => setNewCommentImage("")}
                  tabIndex={-1}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 flex items-center justify-center"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                tabIndex={-1}
                aria-label="Upload image"
              >
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              </Button>
            )}
            <Button
              onClick={handlePostComment}
              disabled={(!newComment.trim() && !newCommentImage) || isPosting}
              className="px-6 py-2 text-base font-semibold rounded-2xl bg-party-gradient hover:opacity-90 transition-all duration-200 hover:scale-105 shadow-lg gap-2 flex items-center"
            >
              {isPosting ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Posting...
                </div>
              ) : (
                <>
                  <MessageSquare className="h-5 w-5 text-primary" />
                  Post Comment
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-4 border rounded-lg bg-muted/50 text-center">
          <p className="text-sm text-muted-foreground">
            Please log in to join the discussion
          </p>
        </div>
      )}

      {/* Comments List */}
      <div className="space-y-3">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No comments yet.</p>
            <p className="text-xs">Be the first to share your thoughts!</p>
          </div>
        ) : (
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              authorMetadata={authorsMetadata[comment.pubkey]}
              likeCount={getLikeCount(comment.id)}
              hasUserLiked={hasUserLiked(comment.id)}
              onLike={() => handleLikeComment(comment.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}