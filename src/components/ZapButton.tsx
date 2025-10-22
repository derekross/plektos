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
  const [_isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [_isPollingPayment, _setIsPollingPayment] = useState(false);

  // Debug state changes
  useEffect(() => {
    console.log('ZapButton: State changed - showManualPayment:', showManualPayment, 'manualPaymentData:', !!manualPaymentData);
  }, [showManualPayment, manualPaymentData]);

  // Force dialog to show when manual payment is required
  useEffect(() => {
    if (showManualPayment && manualPaymentData) {
      console.log('ZapButton: Forcing manual payment dialog to show');
      // Force a re-render by updating a dummy state
      setTimeout(() => {
        console.log('ZapButton: Timeout reached, checking state again');
      }, 100);
    }
  }, [showManualPayment, manualPaymentData]);

  // Manual payment check - use same logic as notification system
  const checkPaymentOnce = useCallback(async () => {
    if (!manualPaymentData || !nostr || !_user?.pubkey) {
      console.log('❌ Missing required data for payment check');
      return;
    }

    console.log('🔍 Payment check - searching for zap receipts...');
    
    try {
      console.log('🔍 Executing zap receipt queries...');
      
      // Look for zap receipts where the HOST is the recipient, then filter by event ID and amount
      const [zapReceipts, allZapReceipts] = await Promise.all([
        nostr.query([
          {
            kinds: [9735], // Zap receipts
            "#p": [manualPaymentData.eventPubkey], // Where HOST is the recipient
            limit: 10
          }
        ], { signal: AbortSignal.timeout(5000) }), // 5 second timeout
        nostr.query([
          {
            kinds: [9735], // ALL zap receipts (for debugging)
            limit: 20
          }
        ], { signal: AbortSignal.timeout(5000) }) // 5 second timeout
      ]);
      
      console.log('🔍 Queries completed, processing results...');

      console.log('🎫 Found zap receipts for host:', zapReceipts.length);
      console.log('🎫 Found ALL zap receipts in system:', allZapReceipts.length);
      console.log('🔍 Query details:', {
        buyerPubkey: _user.pubkey,
        eventId: manualPaymentData.eventId,
        amount: manualPaymentData.amount
      });
      
      // Debug: Log all zap receipts to see their structure
      if (zapReceipts.length > 0) {
        console.log('🔍 Zap receipts for host:');
        zapReceipts.forEach((receipt: { id: string; pubkey: string; created_at: number; tags: string[][]; content: string }, index: number) => {
          console.log(`  Receipt ${index + 1}:`, {
            id: receipt.id,
            pubkey: receipt.pubkey,
            created_at: new Date(receipt.created_at * 1000).toISOString(),
            tags: receipt.tags,
            content: receipt.content
          });
        });
      }
      
      // Debug: Log ALL zap receipts to see what exists
      if (allZapReceipts.length > 0) {
        console.log('🔍 ALL zap receipts in system:');
        allZapReceipts.forEach((receipt: { id: string; pubkey: string; created_at: number; tags: string[][]; content: string }, index: number) => {
          console.log(`  All Receipt ${index + 1}:`, {
            id: receipt.id,
            pubkey: receipt.pubkey,
            created_at: new Date(receipt.created_at * 1000).toISOString(),
            tags: receipt.tags,
            content: receipt.content
          });
        });
      }
      
            // Check if any zap receipt is for our specific event and is recent (within last 1 minutes)
            const fiveMinutesAgo = Math.floor(Date.now() / 1000) - (1 * 60); // 1 minutes ago in seconds
            const ourZapReceipt = zapReceipts.find((receipt: { id: string; tags: string[][]; created_at: number }) => {
              const eventId = receipt.tags.find((tag: string[]) => tag[0] === "e")?.[1];
              const isRecent = receipt.created_at > fiveMinutesAgo;
              
              console.log('🔍 Checking receipt:', { 
                eventId, 
                ourEventId: manualPaymentData.eventId,
                receiptId: receipt.id,
                created_at: new Date(receipt.created_at * 1000).toISOString(),
                isRecent,
                fiveMinutesAgo: new Date(fiveMinutesAgo * 1000).toISOString()
              });
              
              return eventId === manualPaymentData.eventId && isRecent;
            });

      if (ourZapReceipt) {
        console.log('✅ Found matching zap receipt!', ourZapReceipt.id);
        
        // Create the ticket using the same logic as successful zap
        try {
          await confirmManualPayment(manualPaymentData);
          setShowManualPayment(false);
          setManualPaymentData(null);
          _setIsPollingPayment(false);
          toast.success("Payment confirmed! Ticket created successfully!");
        } catch (error) {
          console.error('❌ Error creating ticket:', error);
          toast.error("Payment detected but failed to create ticket. Please contact support.");
        }
      } else {
        console.log('⏳ No matching zap receipt found yet, will check again in 10 seconds...');
        _setIsPollingPayment(false);
      }
    } catch (error) {
      console.error("Error checking payment:", error);
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      toast.error("Error checking payment. Please try again.");
      _setIsPollingPayment(false);
    }
  }, [manualPaymentData, nostr, _user, confirmManualPayment, setShowManualPayment, setManualPaymentData, _setIsPollingPayment]);

  // Automatic payment detection - check every 10 seconds when manual payment dialog is open
  useEffect(() => {
    if (showManualPayment && manualPaymentData && !_isPollingPayment) {
      console.log('ZapButton: Starting automatic payment detection every 10 seconds');
      
      // Check immediately
      checkPaymentOnce();
      
      // Then check every 10 seconds
      const interval = setInterval(() => {
        if (showManualPayment && manualPaymentData) {
          console.log('ZapButton: Automatic payment check (every 10 seconds)');
          checkPaymentOnce();
        } else {
          clearInterval(interval);
        }
      }, 10000); // 10 seconds
      
      // Cleanup interval when component unmounts or dialog closes
      return () => {
        clearInterval(interval);
      };
    }
  }, [showManualPayment, manualPaymentData, _isPollingPayment, checkPaymentOnce]);

  const _handleConfirmPayment = async () => {
    if (!manualPaymentData) return;
    
    setIsConfirmingPayment(true);
    try {
      await confirmManualPayment(manualPaymentData);
      setShowManualPayment(false);
      setManualPaymentData(null);
      toast.success("Payment confirmed! Ticket purchased successfully.");
    } catch (error) {
      console.error("Error confirming payment:", error);
      toast.error("Failed to confirm payment. Please try again.");
    } finally {
      setIsConfirmingPayment(false);
    }
  };

  // Payment detection - monitor host's Lightning address for incoming payments (automatic polling)
  const _startPaymentDetection = () => {
    if (!manualPaymentData) return;
    
    _setIsPollingPayment(true);
    toast.info("Waiting for payment confirmation...");
    
    // Poll every 3 seconds for up to 5 minutes
    const pollInterval = setInterval(async () => {
      try {
        console.log('🔍 Checking for payment confirmation...');
        
        // Check if payment was made by looking for zap receipts where HOST is the recipient
        // This means someone paid the host for this specific event
        if (!nostr || !manualPaymentData.eventPubkey) return;
        
        const zapReceipts = await nostr.query([
          {
            kinds: [9735], // Zap receipts
            "#p": [manualPaymentData.eventPubkey], // Where HOST is the recipient
            limit: 10
          }
        ]);

        console.log('🎫 Found zap receipts for host:', zapReceipts.length);
        
        // Check if any zap receipt is for our specific event and amount
        const ourZapReceipt = zapReceipts.find((receipt: { tags: string[][] }) => {
          const eventId = receipt.tags.find((tag: string[]) => tag[0] === "e")?.[1];
          const amount = receipt.tags.find((tag: string[]) => tag[0] === "amount")?.[1];
          const expectedAmount = (manualPaymentData.amount * 1000).toString(); // Convert to millisats
          
          return eventId === manualPaymentData.eventId && amount === expectedAmount;
        });

        if (ourZapReceipt) {
          console.log('✅ Payment confirmed! Host received payment:', ourZapReceipt);
          clearInterval(pollInterval);
          
          // Now create the ticket for the buyer
          try {
            await confirmManualPayment(manualPaymentData);
            setShowManualPayment(false);
            setManualPaymentData(null);
            _setIsPollingPayment(false);
            toast.success("Payment confirmed! Ticket created successfully!");
          } catch (error) {
            console.error('Error creating ticket after payment:', error);
            toast.error("Payment detected but failed to create ticket. Please contact support.");
          }
        } else {
          console.log('⏳ No payment found yet, continuing to poll...');
        }
      } catch (error) {
        console.error("Error polling payment:", error);
      }
    }, 3000);

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      _setIsPollingPayment(false);
      if (showManualPayment) {
        toast.warning("Payment timeout. Please try again or contact support.");
      }
    }, 300000); // 5 minutes
  };

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
      
      console.log('ZapButton: Zap result:', result);
      
      // Check if manual payment is required
      if (result && result.manualPayment) {
        console.log('ZapButton: Manual payment required, showing dialog');
        console.log('ZapButton: Setting manualPaymentData to:', result);
        console.log('ZapButton: Setting showManualPayment to true');
        
        // Show manual payment in a dropdown instead of popup
        console.log('ZapButton: Showing manual payment dropdown');
        
        // Add start time for polling
        const paymentDataWithTime = {
          ...result,
          startTime: Date.now()
        };
        
        // Use a callback to ensure state is set before continuing
        setManualPaymentData(paymentDataWithTime);
        setShowManualPayment(true);
        
        // For manual payments, show the interface and let user trigger payment check
        // No automatic polling - user will click "Check Payment" button
        
        // Force a re-render by using setTimeout
        setTimeout(() => {
          console.log('ZapButton: Forced re-render after state update');
        }, 0);
        
        console.log('ZapButton: State updated, showManualPayment should be true now');
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

            {/* Payment Status */}
            {_isPollingPayment && (
              <div className="mt-3 p-3 bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="text-blue-800 dark:text-blue-200 text-sm font-medium">
                    Waiting for payment confirmation...
                  </span>
                </div>
                <p className="text-blue-700 dark:text-blue-300 text-xs mt-1">
                  Please complete the payment in your Lightning wallet. We're monitoring for the payment to the host.
                </p>
              </div>
            )}

            {/* Automatic Payment Detection Status */}
            <div className="mt-3 space-y-2">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="text-sm text-blue-800 font-medium">
                    Waiting for payment confirmation...
                  </span>
                </div>
                <p className="text-xs text-blue-600 mt-1">
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
