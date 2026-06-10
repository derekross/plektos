import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap, Coins } from "lucide-react";
import { useZap } from "@/hooks/useZap";
import { useNostr } from "@nostrify/react";
import { toast } from "sonner";
import { formatAmount } from "@/lib/lightning";

interface ZapButtonProps {
  pubkey: string;
  displayName: string;
  lightningAddress: string;
  eventId?: string;
  eventKind?: number;
  eventIdentifier?: string;
  disabled?: boolean;
  className?: string;
  // For ticket purchases - if provided, shows only this amount
  fixedAmount?: number;
  // Custom button text for tickets
  buttonText?: string;
}

const QUICK_AMOUNTS = [21, 100, 500, 1000, 5000];

export function ZapButton({
  pubkey,
  displayName,
  lightningAddress,
  eventId = "",
  eventKind = 0,
  eventIdentifier = "",
  disabled = false,
  className = "",
  fixedAmount,
  buttonText,
}: ZapButtonProps) {
  const { zap, confirmManualPayment } = useZap();
  const { nostr } = useNostr();
  const { user: _user } = useCurrentUser();
  const [isZapping, setIsZapping] = useState(false);
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [customAmount, setCustomAmount] = useState("21");
  const [showManualPayment, setShowManualPayment] = useState(false);
  const [manualPaymentData, setManualPaymentData] = useState<{
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
    startTime?: number;
  } | null>(null);
  // Manual payment check - look for a zap receipt that matches THIS purchase:
  // right event, right buyer, right amount, created after the invoice was issued.
  const checkPaymentOnce = useCallback(async () => {
    if (!manualPaymentData || !nostr || !_user?.pubkey) {
      return;
    }

    try {
      // Zap receipts where the HOST is the recipient
      const zapReceipts = await nostr.query([
        {
          kinds: [9735],
          "#p": [manualPaymentData.eventPubkey],
          "#e": [manualPaymentData.eventId],
          limit: 20,
        }
      ], { signal: AbortSignal.timeout(5000) });

      const expectedAmountMsats = (manualPaymentData.amount * 1000).toString();
      const invoiceIssuedAt = Math.floor((manualPaymentData.startTime ?? Date.now()) / 1000);

      const ourZapReceipt = zapReceipts.find((receipt) => {
        const eventId = receipt.tags.find((tag) => tag[0] === "e")?.[1];
        if (eventId !== manualPaymentData.eventId) return false;

        // Ignore receipts from before this invoice was created (60s clock slack)
        if (receipt.created_at < invoiceIssuedAt - 60) return false;

        // The receipt's description embeds the buyer's zap request — match
        // both the buyer pubkey and the amount so someone else's purchase
        // of the same event can't confirm our ticket.
        const description = receipt.tags.find((tag) => tag[0] === "description")?.[1];
        if (!description) return false;
        try {
          const zapRequest = JSON.parse(description) as {
            pubkey?: string;
            tags?: string[][];
          };
          if (zapRequest.pubkey !== _user.pubkey) return false;
          const amount = zapRequest.tags?.find((tag) => tag[0] === "amount")?.[1];
          return amount === expectedAmountMsats;
        } catch {
          return false;
        }
      });

      if (ourZapReceipt) {
        try {
          await confirmManualPayment(manualPaymentData);
          setShowManualPayment(false);
          setManualPaymentData(null);
          toast.success("Payment confirmed! Ticket created successfully!");
        } catch (error) {
          console.error('Error creating ticket:', error);
          toast.error("Payment detected but failed to create ticket. Please contact support.");
        }
      }
    } catch (error) {
      console.error("Error checking payment:", error);
    }
  }, [manualPaymentData, nostr, _user, confirmManualPayment]);

  // Automatic payment detection - check every 10 seconds while the manual
  // payment panel is open
  useEffect(() => {
    if (!showManualPayment || !manualPaymentData) return;

    checkPaymentOnce();
    const interval = setInterval(checkPaymentOnce, 10000);
    return () => clearInterval(interval);
  }, [showManualPayment, manualPaymentData, checkPaymentOnce]);

  const handleZap = async (amount: number) => {
    if (!lightningAddress) {
      toast.error("Lightning address not available");
      return;
    }

    setIsZapping(true);
    try {
      const zapComment = fixedAmount 
        ? `Ticket for ${displayName}` 
        : `Zapped ${displayName}`;
      
      const result = await zap({
        amount,
        eventId,
        eventPubkey: pubkey,
        eventKind,
        eventIdentifier,
        eventName: fixedAmount ? `Ticket for ${displayName}` : `Zap to ${displayName}`,
        comment: zapComment,
        lightningAddress,
        skipSuccessToast: !!fixedAmount, // Skip generic toast for ticket purchases
      });
      
      // Check if manual payment is required
      if (result && result.manualPayment) {
        // Record when the invoice was issued so payment polling only
        // accepts receipts created after this point
        setManualPaymentData({
          ...result,
          startTime: Date.now()
        });
        setShowManualPayment(true);
        return;
      }
      
      // For fixed amounts (ticket purchases), show a custom success message
      if (fixedAmount) {
        toast.success("Ticket purchased successfully!");
      }
      // For regular zaps, success toast is handled by useZap hook
    } catch (error) {
      console.error("Error zapping:", error);
      const errorMessage = fixedAmount 
        ? (error instanceof Error ? error.message : "Failed to purchase ticket")
        : (error instanceof Error ? error.message : "Failed to zap");
      toast.error(errorMessage);
    } finally {
      setIsZapping(false);
    }
  };

  const handleCustomZap = async () => {
    const amount = parseInt(customAmount);
    if (isNaN(amount) || amount < 1) {
      toast.error("Please enter a valid amount");
      return;
    }

    await handleZap(amount);
    setShowCustomDialog(false);
    setCustomAmount("21");
  };

  if (disabled || !lightningAddress) {
    return null;
  }

  // Fixed amount mode (for ticket purchases)
  if (fixedAmount) {
    return (
      <div style={{ position: 'relative' }}>
        <Button
          variant="outline"
          size="sm"
          disabled={isZapping}
          onClick={() => handleZap(fixedAmount)}
          className={`flex items-center gap-2 ${className}`}
        >
          <Zap className="h-4 w-4" />
          {isZapping ? "Processing..." : (buttonText || `Purchase Ticket - ${formatAmount(fixedAmount)}`)}
        </Button>

        {/* Manual Payment Dropdown */}
        {showManualPayment && manualPaymentData && (
          <div 
            className="absolute top-full left-0 right-0 bg-background border border-border rounded-lg p-4 mt-2 shadow-lg z-[1000] max-w-md"
          >
            <div className="mb-3">
              <h3 className="text-lg font-bold text-foreground mb-2">
                💰 Manual Payment Required
              </h3>
              <p className="text-sm text-muted-foreground mb-1">
                <strong>Event:</strong> {manualPaymentData.eventName}
              </p>
              <p className="text-sm text-muted-foreground mb-1">
                <strong>Amount:</strong> {manualPaymentData.amount} sats
              </p>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-bold text-foreground mb-1">
                Lightning Invoice:
              </label>
              <textarea
                value={manualPaymentData.invoice}
                readOnly
                className="w-full h-20 p-2 border border-input rounded text-xs font-mono resize-none bg-muted text-foreground"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(manualPaymentData.invoice);
                  toast.success('Invoice copied to clipboard!');
                }}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs rounded cursor-pointer"
              >
                📋 Copy Invoice
              </button>
              
              <button
                onClick={() => {
                  setShowManualPayment(false);
                  setManualPaymentData(null);
                }}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* Automatic Payment Detection Status */}
            <div className="mt-3 space-y-2">
              <div className="bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="text-sm text-blue-800 dark:text-blue-200 font-medium">
                    Waiting for payment confirmation...
                  </span>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                  Please complete the payment in your Lightning wallet. We're monitoring for the payment to the host.
                </p>
              </div>

              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs">
                <strong className="text-yellow-800 dark:text-yellow-200">How to pay:</strong>
                <span className="text-yellow-700 dark:text-yellow-300"> Copy the invoice above and paste it into your Lightning wallet (Coinos, Alby, Zeus, etc.). We'll automatically detect your payment and create your ticket.</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Variable amount mode (for regular zaps)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isZapping}
            className={`flex items-center gap-2 ${className}`}
          >
            <Zap className="h-4 w-4" />
            {isZapping ? "Zapping..." : "Zap"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-2 py-1.5 text-sm font-medium text-muted-foreground">
            Quick Amounts
          </div>
          {QUICK_AMOUNTS.map((amount) => (
            <DropdownMenuItem
              key={amount}
              onClick={() => handleZap(amount)}
              disabled={isZapping}
              className="flex items-center justify-between"
            >
              <span>{formatAmount(amount)}</span>
              <Zap className="h-3 w-3" />
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowCustomDialog(true)}
            disabled={isZapping}
            className="flex items-center gap-2"
          >
            <Coins className="h-4 w-4" />
            Custom Amount
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCustomDialog} onOpenChange={setShowCustomDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zap {displayName}</DialogTitle>
            <DialogDescription>
              Send a custom zap amount to {displayName} via Lightning.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="amount">Amount (sats)</Label>
              <Input
                id="amount"
                type="number"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="21"
                min="1"
              />
            </div>
            
            <div className="text-sm text-muted-foreground">
              Lightning Address: {lightningAddress}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCustomDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCustomZap}
              disabled={isZapping}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              <Zap className="h-4 w-4 mr-2" />
              {isZapping ? "Zapping..." : `Zap ${formatAmount(parseInt(customAmount) || 0)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
