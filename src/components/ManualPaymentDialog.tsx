import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { QrCode, Copy, Check, Zap } from "lucide-react";
import { useZap } from "@/hooks/useZap";
import QRCodeLib from "qrcode";
import { formatAmount } from "@/lib/lightning";

interface ManualPaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  manualPaymentData: {
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
  } | null;
}

export function ManualPaymentDialog({ isOpen, onClose, manualPaymentData }: ManualPaymentDialogProps) {
  console.log('🚀 ManualPaymentDialog: Component called with isOpen =', isOpen, 'manualPaymentData =', !!manualPaymentData);
  
  const { confirmManualPayment } = useZap();
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  console.log('ManualPaymentDialog: isOpen =', isOpen, 'manualPaymentData =', manualPaymentData);

  // Generate QR code for the Lightning invoice
  useEffect(() => {
    if (manualPaymentData?.invoice) {
      const generateQRCode = async () => {
        try {
          const qrDataUrl = await QRCodeLib.toDataURL(manualPaymentData.invoice, {
            width: 256,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          });
          setQrCodeDataUrl(qrDataUrl);
        } catch (error) {
          console.error('Error generating QR code:', error);
        }
      };

      generateQRCode();
    }
  }, [manualPaymentData?.invoice]);

  const handleCopyInvoice = async () => {
    if (manualPaymentData?.invoice) {
      try {
        await navigator.clipboard.writeText(manualPaymentData.invoice);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error("Failed to copy invoice:", error);
      }
    }
  };

  const handleConfirmPayment = async () => {
    if (!manualPaymentData) return;

    setIsConfirming(true);
    try {
      await confirmManualPayment(manualPaymentData);
      onClose();
    } catch (error) {
      console.error("Error confirming payment:", error);
    } finally {
      setIsConfirming(false);
    }
  };

  console.log('ManualPaymentDialog: Rendering check - isOpen:', isOpen, 'manualPaymentData:', !!manualPaymentData);
  
  if (!isOpen || !manualPaymentData) {
    console.log('ManualPaymentDialog: Not rendering - isOpen:', isOpen, 'manualPaymentData:', !!manualPaymentData);
    return null;
  }

  console.log('ManualPaymentDialog: Rendering dialog with data:', manualPaymentData);

  return (
    <div className="fixed inset-0 bg-red-500/80 flex items-center justify-center z-[9999] p-4" style={{zIndex: 9999}}>
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Manual Payment Required
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Payment Info */}
          <div className="space-y-2">
            <h3 className="font-semibold">{manualPaymentData.eventName}</h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-amber-500/10 text-amber-500">
                💰 {formatAmount(manualPaymentData.amount)}
              </Badge>
              <Badge variant="outline" className="bg-blue-500/10 text-blue-500">
                🎟️ Ticket Purchase
              </Badge>
            </div>
          </div>

          {/* Lightning Invoice */}
          <div className="space-y-3">
            <Label htmlFor="invoice">Lightning Invoice</Label>
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs font-mono break-all text-gray-700">
                {manualPaymentData.invoice}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyInvoice}
              className="w-full"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Invoice
                </>
              )}
            </Button>
          </div>

          {/* QR Code */}
          <div className="space-y-3">
            <Label>Scan with Lightning Wallet</Label>
            <div className="bg-white p-4 rounded-lg border-2 border-dashed border-gray-300 text-center">
              <div className="text-xs text-gray-500 mb-2">Scan QR Code with Lightning Wallet</div>
              <div className="w-48 h-48 bg-gray-100 rounded flex items-center justify-center mx-auto">
                {qrCodeDataUrl ? (
                  <img 
                    src={qrCodeDataUrl} 
                    alt="Lightning Invoice QR Code" 
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <QrCode className="h-16 w-16 text-gray-400" />
                )}
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-800 mb-2">Payment Instructions:</h4>
            <ol className="text-sm text-blue-700 space-y-1">
              <li>1. Copy the Lightning invoice above</li>
              <li>2. Open your Lightning wallet (Alby, Phoenix, etc.)</li>
              <li>3. Paste the invoice or scan the QR code</li>
              <li>4. Complete the payment</li>
              <li>5. Click "I've Paid" below to confirm</li>
            </ol>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmPayment}
              disabled={isConfirming}
              className="flex-1"
            >
              {isConfirming ? "Confirming..." : "I've Paid"}
            </Button>
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800">
              ⚠️ Only click "I've Paid" after you have actually sent the Lightning payment. 
              This will create your ticket in the system.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
