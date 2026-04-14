import { useState } from "react";
import { BlossomUploader } from "@nostrify/nostrify/uploaders";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostr } from "@nostrify/react";
import { toast } from "sonner";
import { sanitizeHttpsUrl } from "@/lib/utils";

export interface UploadResult {
  url: string;
  previewUrl: string;
}

// Default fallback servers
const DEFAULT_SERVERS = ["https://blossom.primal.net/", "https://blossom.band"];

export function useBlossomUpload() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const [isUploading, setIsUploading] = useState(false);

  const getUserBlossomServers = async (): Promise<string[]> => {
    if (!user) {
      return DEFAULT_SERVERS;
    }

    try {
      // Query for the user's blossom server list (kind 10063)
      const events = await nostr.query(
        [{ kinds: [10063], authors: [user.pubkey] }],
        { signal: AbortSignal.timeout(5000) }
      );

      // If no events found, return default servers
      if (events.length === 0) {
        return DEFAULT_SERVERS;
      }

      // Get the most recent event
      const event = events[0];

      // Extract servers from tags
      const serverTags = event.tags.filter((tag) => tag[0] === "server");

      if (serverTags.length === 0) {
        return DEFAULT_SERVERS;
      }

      // Extract and validate server URLs (only allow HTTPS)
      const validServers = serverTags
        .map((tag) => tag[1])
        .filter((url) => typeof url === "string" && url.trim() !== "")
        .filter((url) => sanitizeHttpsUrl(url.trim()) !== undefined)
        .map((url) => {
          const trimmed = url.trim();
          return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
        });

      if (validServers.length === 0) {
        return DEFAULT_SERVERS;
      }

      return validServers;
    } catch {
      return DEFAULT_SERVERS;
    }
  };

  const uploadFile = async (file: File): Promise<UploadResult> => {
    if (!user?.signer) {
      throw new Error("User must be logged in to upload files");
    }

    setIsUploading(true);

    try {
      // Get user's blossom servers or fall back to defaults
      const servers = await getUserBlossomServers();

      // Create the BlossomUploader with the user's signer
      const uploader = new BlossomUploader({
        servers,
        signer: user.signer,
        expiresIn: 120_000, // 2 minutes expiry
      });

      // Upload the file and get the NIP-94 compatible tags
      const tags = await uploader.upload(file);

      // The first tag should contain the URL
      const urlTag = tags.find((tag) => tag[0] === "url");
      if (!urlTag || !urlTag[1]) {
        throw new Error("No URL returned from upload");
      }

      const url = urlTag[1];

      toast.success("Image uploaded successfully!");

      return {
        url,
        previewUrl: url,
      };
    } catch (error) {
      toast.error("Failed to upload image. Please try again.");
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    uploadFile,
    isUploading,
  };
}
