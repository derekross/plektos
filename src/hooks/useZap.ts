import { useCallback } from "react";
import { webln } from "@getalby/sdk";
import { toast } from "sonner";
import { bech32 } from "bech32";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostr } from "@nostrify/react";

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
      try {
        if (!user?.signer) {
          throw new Error("Please log in to send zaps");
        }

        if (!user.pubkey) {
          throw new Error("Could not get user information");
        }

        // Convert lightning address to LNURL
        const lnurl = lightningAddressToLnurl(options.lightningAddress);
        const [username, domain] = options.lightningAddress.split("@");

        // Validate lightning address format
        if (!username || !domain) {
          throw new Error("Invalid lightning address format");
        }

        // Fetch LNURL data from the user's server
        console.log("Fetching LNURL data for:", options.lightningAddress);
        
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
        } catch (fetchError) {
          console.error("Failed to fetch LNURL data:", fetchError);
          throw new Error("Unable to connect to lightning service. Please check your internet connection.");
        }
        
        if (!lnurlResponse.ok) {
          console.error("LNURL fetch failed:", lnurlResponse.status, lnurlResponse.statusText);
          throw new Error("Lightning address not found or invalid");
        }

        const lnurlData = await lnurlResponse.json();
        console.log("LNURL data:", lnurlData);
        
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
          ["relays", "wss://relay.damus.io", "wss://nostr-relay.wlvs.space"],
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
        console.log("Signing zap request:", zapRequestUnsigned);
        const zapRequest = await user.signer.signEvent(zapRequestUnsigned);
        console.log("Signed zap request:", zapRequest);

        // Create the invoice using the LNURL callback
        // Try different URL encoding approaches for better compatibility
        const zapRequestJson = JSON.stringify(zapRequest);
        
        // First attempt: Simple GET request without extra headers to avoid CORS preflight
        const callbackUrl = `${lnurlData.callback}?amount=${amountMsats}&nostr=${encodeURIComponent(zapRequestJson)}`;
        
        console.log("Calling LNURL callback (attempt 1):", callbackUrl);

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
        } catch (corsError) {
          console.log("GET request failed with CORS/fetch error:", corsError);
          zapSuccessful = false;
          
          // Skip to fallback immediately if we get a CORS or network error
          console.log("Skipping POST attempt, trying fallback without nostr parameter");
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
                console.log("Fallback successful, but this won't generate a zap receipt");
                toast.warning("Payment will be sent but may not appear as a zap on Nostr");
                zapSuccessful = false; // Not a real zap, just a payment
              }
            }
          } catch (fallbackError) {
            console.error("Fallback also failed:", fallbackError);
            throw new Error("Unable to connect to lightning service. This may be due to CORS restrictions or service unavailability.");
          }
        }

        // If the first attempt failed but didn't error, try POST
        if (zapSuccessful && callbackResponse && !callbackResponse.ok) {
          console.log("GET request failed, trying POST method");
          
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
          } catch (postError) {
            console.log("POST request also failed:", postError);
            zapSuccessful = false;
          }
        }

        // Final fallback if everything fails
        if (zapSuccessful && (!callbackResponse || !callbackResponse.ok)) {
          const errorText = await callbackResponse?.text().catch(() => "Unknown error");
          console.error("LNURL callback failed:", callbackResponse?.status, errorText);
          
          // Try final fallback without the nostr parameter
          console.log("Trying final fallback without nostr parameter");
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
                console.log("Final fallback successful, but this won't generate a zap receipt");
                toast.warning("Payment will be sent but may not appear as a zap on Nostr");
                callbackResponse = fallbackResponse;
                zapSuccessful = false;
              }
            } else {
              throw new Error("Failed to create lightning invoice. The lightning service may be temporarily unavailable.");
            }
          } catch (fallbackError) {
            console.error("Final fallback also failed:", fallbackError);
            throw new Error("Failed to create lightning invoice. The lightning service may be temporarily unavailable.");
          }
        }

        const invoiceData = await callbackResponse.json();
        console.log("LNURL callback response:", invoiceData);

        if (invoiceData.status === "ERROR") {
          throw new Error(invoiceData.reason || "Failed to create lightning invoice");
        }

        if (!invoiceData.pr) {
          throw new Error("No lightning invoice received");
        }

        // Check for WebLN support
        if (!window.webln) {
          // Fallback to manual payment mode
          console.log("WebLN not available, switching to manual payment mode");
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
          console.log("useZap: Returning manual payment data:", manualPaymentResult);
          return manualPaymentResult;
        }

        // Enable WebLN
        try {
          await window.webln.enable();
        } catch (error) {
          console.error("Failed to enable WebLN:", error);
          // Fallback to manual payment mode
          console.log("WebLN enable failed, switching to manual payment mode");
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
        console.log("Sending lightning payment:", invoiceData.pr);
        const paymentResult = await window.webln.sendPayment(invoiceData.pr);
        console.log("Payment result:", paymentResult);

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
      } catch (error) {
        console.error("Error sending zap:", error);
        throw error;
      }
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
      try {
        if (!user?.signer) {
          throw new Error("Please log in to confirm payment");
        }

        if (!user.pubkey) {
          throw new Error("Could not get user information");
        }

        // Create zap request event
        const zapRequest = {
          kind: 9734,
          content: manualPaymentData.comment,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["p", manualPaymentData.eventPubkey],
            ["e", manualPaymentData.eventId],
            ["amount", (manualPaymentData.amount * 1000).toString()], // Convert to millisats
            ["relays", "wss://relay.primal.net", "wss://relay.nostr.band", "wss://relay.damus.io"],
          ],
        };

                // Sign and publish the zap request
                const signedZapRequest = await user.signer.signEvent(zapRequest);
                await nostr.event(signedZapRequest);

        // Create zap receipt event
        const zapReceipt = {
          kind: 9735,
          content: "",
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["p", manualPaymentData.eventPubkey],
            ["e", manualPaymentData.eventId],
            ["description", JSON.stringify(zapRequest)],
            ["bolt11", manualPaymentData.invoice],
            ["preimage", "manual_payment_confirmed"], // Placeholder for manual payments
          ],
        };

        // Sign and publish the zap receipt
        const signedZapReceipt = await user.signer.signEvent(zapReceipt);
        const zapReceiptEvent = await nostr.event(signedZapReceipt);

        console.log("Manual payment confirmed, zap receipt published:", zapReceiptEvent);
        toast.success(`Ticket purchased successfully for ${manualPaymentData.amount} sats!`);
        
        return zapReceiptEvent;
      } catch (error) {
        console.error("Error confirming manual payment:", error);
        throw error;
      }
    },
    [user, nostr]
  );

  return { zap, confirmManualPayment };
}
