import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QrCode, Copy, Check } from "lucide-react";
import type { UserTicketWithEvent } from "@/hooks/useUserRSVPs";
import QRCodeLib from "qrcode";

interface TicketQRCodeProps {
  ticket: UserTicketWithEvent;
}

export function TicketQRCode({ ticket }: TicketQRCodeProps) {
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");

  // Create a ticket verification URL
  const ticketData = {
    eventId: ticket.event.id,
    receiptId: ticket.zapReceipt.id,
    amount: ticket.amount,
    buyerPubkey: ticket.zapReceipt.pubkey,
    eventTitle: ticket.eventTitle,
    purchaseTime: ticket.zapReceipt.created_at,
  };

  const ticketUrl = `${window.location.origin}/verify-ticket?data=${encodeURIComponent(JSON.stringify(ticketData))}`;

  // Generate QR code when component mounts or ticket changes
  useEffect(() => {
    const generateQRCode = async () => {
      try {
        const qrDataUrl = await QRCodeLib.toDataURL(ticketUrl, {
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
  }, [ticketUrl]);

  const handleCopyTicket = async () => {
    try {
      await navigator.clipboard.writeText(ticketUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy ticket:", error);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          Digital Ticket
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Event Info */}
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">{ticket.eventTitle}</h3>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-amber-500/10 text-amber-500">
              🎟️ Ticket Purchased
            </Badge>
            <Badge variant="outline" className="bg-green-500/10 text-green-500">
              💰 {ticket.amount} sats
            </Badge>
          </div>
        </div>

        {/* QR Code or Ticket URL */}
        {showQR ? (
          <div className="space-y-3">
            <div className="bg-white p-4 rounded-lg border-2 border-dashed border-gray-300 text-center">
              <div className="text-xs text-gray-500 mb-2">Scan QR Code at Event</div>
              <div className="w-32 h-32 bg-gray-100 rounded flex items-center justify-center mx-auto">
                {qrCodeDataUrl ? (
                  <img 
                    src={qrCodeDataUrl} 
                    alt="Ticket QR Code" 
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <QrCode className="h-16 w-16 text-gray-400" />
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowQR(false)}
              className="w-full"
            >
              Hide QR Code
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs text-gray-500 mb-1">Ticket Verification URL:</div>
              <div className="text-xs font-mono break-all text-gray-700">
                {ticketUrl}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowQR(true)}
                className="flex-1"
              >
                <QrCode className="h-4 w-4 mr-2" />
                Show QR Code
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyTicket}
                className="flex-1"
              >
                {copied ? (
                  <Check className="h-4 w-4 mr-2" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {copied ? "Copied!" : "Copy Link"}
              </Button>
            </div>
          </div>
        )}

        {/* Ticket Details */}
        <div className="text-xs text-gray-500 space-y-1">
          <div>Purchased: {new Date(ticket.zapReceipt.created_at * 1000).toLocaleString()}</div>
          <div>Event ID: {ticket.event.id.slice(0, 8)}...</div>
          <div>Receipt ID: {ticket.zapReceipt.id.slice(0, 8)}...</div>
        </div>
      </CardContent>
    </Card>
  );
}
