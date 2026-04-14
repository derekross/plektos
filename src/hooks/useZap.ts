import { useCallback } from "react";
import { webln } from "@getalby/sdk";
import { toast } from "sonner";
import { bech32 } from "bech32";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostr } from "@nostrify/react";
import { isValidHostname } from "@/lib/utils";

// Default relay URLs used for zap requests
const RELAY_URLS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://relay.ditto.pub",
];

// Add WebLN to window type
declare global {
  interface Window {
    webln?: webln.NostrWebLNProvider;
  }
}

interface ZapOptions {
  amount: number;
  eventId: string;
  eventPubkey: string;
  eventKind: number;
  eventIdentifier?: string;
  eventName?: string;
  comment?: string;
  lightningAddress: string;
  // If true, caller will handle success toast - prevents duplicate toasts
  skipSuccessToast?: boolean;
}

function lightningAddressToLnurl(lightningAddress: string): string {
  const [username, domain] = lightningAddress.split("@");
  const url = `https://${domain}/.well-known/lnurlp/${username}`;
  const encoder = new TextEncoder();
  const words = bech32.toWords(encoder.encode(url));
  return bech32.encode("lnurl", words, 1023).toUpperCase();
}

export function useZap() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();

  const zap = useCallback(
    async (options: ZapOptions) => {
        if (!user?.signer) {
          throw new Error("Please log in to send zaps");
        }

        if (!user.pubkey) {
          throw new Error("Could not get user information");
        }

        // Convert lightning address to LNURL
        const lnurl = lightningAddressToLnurl(options.lightningAddress);
        const [username, domain] = options.lightningAddress.split("@");

        // Validate lightning address format and hostname
        if (!username || !domain) {
          throw new Error("Invalid lightning address format");
        }
        if (!isValidHostname(domain)) {
          throw new Error("Invalid lightning address domain");
        }

        // Fetch LNURL data from the user's server
        let lnurlResponse;
        try {
          lnurlResponse = await fetch(
            `https://${domain}/.well-known/lnurlp/${username}`,
            {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
              },
            }
          );
        } catch {
          throw new Error("Unable to connect to lightning service. Please check your internet connection.");
        }

        if (!lnurlResponse.ok) {
          throw new Error("Lightning address not found or invalid");
        }

        const lnurlData = await lnurlResponse.json();
        
        if (lnurlData.status === "ERROR") {
          throw new Error(lnurlData.reason || "Lightning service error");
        }

        if (!lnurlData.allowsNostr) {
          throw new Error("This lightning address doesn't support Nostr zaps");
        }

        // Validate amount is within bounds from the lightning service
        const amountMsats = options.amount * 1000;
        if (lnurlData.minSendable && amountMsats < lnurlData.minSendable) {
          throw new Error(`Minimum zap amount is ${Math.ceil(lnurlData.minSendable / 1000)} sats`);
        }
        if (lnurlData.maxSendable && amountMsats > lnurlData.maxSendable) {
          throw new Error(`Maximum zap amount is ${Math.floor(lnurlData.maxSendable / 1000)} sats`);
        }

        // Create zap request event following NIP-57 requirements
        const zapRequestTags: string[][] = [
          // Required: relays tag for zap receipt
          ["relays", ...RELAY_URLS],
          // Required: amount tag matching the amount parameter
          ["amount", amountMsats.toString()],
          // Required: lnurl tag
          ["lnurl", lnurl],
          // Required: exactly one p tag
          ["p", options.eventPubkey],
        ];

        // Optional: add e tag only if we have a valid event ID
        if (options.eventId && options.eventId.trim() !== "") {
          zapRequestTags.push(["e", options.eventId]);
        }

        const zapRequestUnsigned = {
          kind: 9734,
          content: options.comment || "",
          tags: zapRequestTags,
          created_at: Math.floor(Date.now() / 1000),
          pubkey: user.pubkey,
        };

        // Sign the zap request
        const zapRequest = await user.signer.signEvent(zapRequestUnsigned);

        // Create the invoice using the LNURL callback
        const zapRequestJson = JSON.stringify(zapRequest);
        const callbackUrl = `${lnurlData.callback}?amount=${amountMsats}&nostr=${encodeURIComponent(zapRequestJson)}`;

        let callbackResponse;
        let zapSuccessful = true;

        try {
          callbackResponse = await fetch(callbackUrl, {
            method: 'GET',
            // Don't include Content-Type in GET requests to avoid CORS preflight
            headers: {
              'Accept': 'application/json',
            },
          });
        } catch {
          zapSuccessful = false;

          // Skip to fallback immediately if we get a CORS or network error
          const fallbackUrl = `${lnurlData.callback}?amount=${amountMsats}`;
          
          try {
            callbackResponse = await fetch(fallbackUrl, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
              },
            });
            
            if (callbackResponse.ok) {
              const fallbackData = await callbackResponse.json();
              if (fallbackData.pr && !fallbackData.status) {
                toast.warning("Payment will be sent but may not appear as a zap on Nostr");
                zapSuccessful = false; // Not a real zap, just a payment
              }
            }
          } catch {
            throw new Error("Unable to connect to lightning service. This may be due to CORS restrictions or service unavailability.");
          }
        }

        // If the first attempt failed but didn't error, try POST
        if (zapSuccessful && callbackResponse && !callbackResponse.ok) {
          
          const postUrl = `${lnurlData.callback}`;
          const formData = new URLSearchParams({
            amount: amountMsats.toString(),
            nostr: zapRequestJson
          });

          try {
            callbackResponse = await fetch(postUrl, {
              method: 'POST',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: formData
            });
          } catch {
            zapSuccessful = false;
          }
        }

        // Final fallback if everything fails
        if (zapSuccessful && (!callbackResponse || !callbackResponse.ok)) {
          // Try final fallback without the nostr parameter
          const fallbackUrl = `${lnurlData.callback}?amount=${amountMsats}`;
          
          try {
            const fallbackResponse = await fetch(fallbackUrl, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
              },
            });

            if (fallbackResponse.ok) {
              const fallbackData = await fallbackResponse.json();
              if (fallbackData.pr && !fallbackData.status) {
                toast.warning("Payment will be sent but may not appear as a zap on Nostr");
                callbackResponse = fallbackResponse;
                zapSuccessful = false;
              }
            } else {
              throw new Error("Failed to create lightning invoice. The lightning service may be temporarily unavailable.");
            }
          } catch {
            throw new Error("Failed to create lightning invoice. The lightning service may be temporarily unavailable.");
          }
        }

        const invoiceData = await callbackResponse.json();

        if (invoiceData.status === "ERROR") {
          throw new Error(invoiceData.reason || "Failed to create lightning invoice");
        }

        if (!invoiceData.pr) {
          throw new Error("No lightning invoice received");
        }

        // Check for WebLN support
        if (!window.webln) {
          // Fallback to manual payment mode
          const manualPaymentResult = {
            manualPayment: true,
            invoice: invoiceData.pr,
            amount: options.amount,
            lightningAddress: options.lightningAddress,
            eventId: options.eventId,
            eventPubkey: options.eventPubkey,
            eventKind: options.eventKind,
            eventIdentifier: options.eventIdentifier,
            eventName: options.eventName,
            comment: options.comment,
          };
          return manualPaymentResult;
        }

        // Enable WebLN
        try {
          await window.webln.enable();
        } catch {
          // Fallback to manual payment mode
          return {
            manualPayment: true,
            invoice: invoiceData.pr,
            amount: options.amount,
            lightningAddress: options.lightningAddress,
            eventId: options.eventId,
            eventPubkey: options.eventPubkey,
            eventKind: options.eventKind,
            eventIdentifier: options.eventIdentifier,
            eventName: options.eventName,
            comment: options.comment,
          };
        }

        // Send payment
        const paymentResult = await window.webln.sendPayment(invoiceData.pr);

        // Success - show success toast only if caller didn't opt to handle it themselves
        if (!options.skipSuccessToast) {
          if (zapSuccessful) {
            toast.success(`Successfully zapped ${options.amount} sats!`);
          } else {
            // Payment sent but not a proper zap
            toast.success(`Payment of ${options.amount} sats sent!`);
          }
        }
        
        return paymentResult;
    },
    [user]
  );

  const confirmManualPayment = useCallback(
    async (manualPaymentData: {
      manualPayment: boolean;
      invoice: string;
      amount: number;
      lightningAddress: string;
      eventId: string;
      eventPubkey: string;
      eventKind: number;
      eventIdentifier: string;
      eventName: string;
      comment: string;
    }) => {
      if (!user?.signer) {
        throw new Error("Please log in to confirm payment");
      }

      if (!user.pubkey) {
        throw new Error("Could not get user information");
      }

      // Publish a zap request (kind 9734) so the network knows we intend to pay.
      // Per NIP-57, only the recipient's LNURL provider may create zap receipts
      // (kind 9735). We do NOT create one here — that would be a protocol violation.
      const zapRequest = {
        kind: 9734,
        content: manualPaymentData.comment,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["p", manualPaymentData.eventPubkey],
          ["e", manualPaymentData.eventId],
          ["amount", (manualPaymentData.amount * 1000).toString()],
          ["relays", ...RELAY_URLS],
        ],
      };

      const signedZapRequest = await user.signer.signEvent(zapRequest);
      await nostr.event(signedZapRequest);

      toast.success(`Ticket purchased successfully for ${manualPaymentData.amount} sats!`);

      return signedZapRequest;
    },
    [user, nostr]
  );

  return { zap, confirmManualPayment };
}
