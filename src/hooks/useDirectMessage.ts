import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostr } from "@nostrify/react";
import { generateSecretKey, getPublicKey, finalizeEvent, getEventHash, nip44 } from "nostr-tools";
import { toast } from "sonner";

export function useDirectMessage() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();

  const sendDirectMessage = async (recipientPubkey: string, message: string) => {
    if (!user?.signer.nip44) {
      throw new Error("Your signer does not support NIP-44 encryption");
    }

    try {
      // Correct NIP-17 implementation following the specification:
      // 1. Create rumor (unsigned kind 14)
      // 2. Seal the rumor (kind 13) with user's NIP-44 encryption to recipient
      // 3. Gift wrap the seal (kind 1059) with ephemeral key's NIP-44 encryption to recipient

      // Step 1: Create the rumor (unsigned DM event, kind 14)
      const rumor = {
        kind: 14,
        content: message,
        tags: [["p", recipientPubkey]],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: user.pubkey,
      };

      // Add the ID to make it a complete unsigned rumor
      const rumorWithId = {
        ...rumor,
        id: getEventHash(rumor),
      };

      // Step 2: Create the seal (kind 13) - encrypt the rumor using user's NIP-44 to recipient
      const sealContent = await user.signer.nip44.encrypt(
        recipientPubkey, 
        JSON.stringify(rumorWithId)
      );
      
      const sealEvent = {
        kind: 13,
        content: sealContent,
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: user.pubkey,
      };

      // Sign the seal with user's key
      const signedSeal = await user.signer.signEvent(sealEvent);

      // Step 3: Create gift wrap (kind 1059) using ephemeral key
      const ephemeralSk = generateSecretKey();
      const ephemeralPk = getPublicKey(ephemeralSk);
      
      // Randomize timestamp for privacy (as per NIP-17)
      const randomizedTimestamp = Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 86400);

      // CRITICAL FIX: Encrypt the seal for gift wrapping using EPHEMERAL key, not user key
      // Create conversation key between ephemeral key and recipient
      const conversationKey = nip44.v2.utils.getConversationKey(ephemeralSk, recipientPubkey);
      const giftWrapContent = nip44.v2.encrypt(JSON.stringify(signedSeal), conversationKey);

      const giftWrapEvent = {
        kind: 1059,
        content: giftWrapContent,
        tags: [["p", recipientPubkey]],
        created_at: randomizedTimestamp,
        pubkey: ephemeralPk,
      };

      // Add ID to the gift wrap event
      const giftWrapWithId = {
        ...giftWrapEvent,
        id: getEventHash(giftWrapEvent),
      };

      // Sign the gift wrap with the ephemeral key
      const signedGiftWrap = finalizeEvent(giftWrapWithId, ephemeralSk);

      // Step 4: Publish the gift wrapped event
      await nostr.event(signedGiftWrap, { signal: AbortSignal.timeout(5000) });

      toast.success("Message sent successfully!");
    } catch (error) {
      console.error("Error sending direct message:", error);
      toast.error("Failed to send message. Please try again.");
      throw error;
    }
  };

  return {
    sendDirectMessage,
  };
}