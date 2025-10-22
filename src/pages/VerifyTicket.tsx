import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, XCircle, AlertCircle, Camera, QrCode, Clipboard, X } from "lucide-react";
import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthor } from "@/hooks/useAuthor";
import QrScanner from "qr-scanner";

interface TicketData {
  eventId: string;
  receiptId: string;
  amount: number;
  buyerPubkey: string;
  eventTitle: string;
  purchaseTime: number;
}

interface AttendeeItemProps {
  buyerPubkey: string;
  amount: number;
  purchaseTime: number;
  receiptId: string;
  isCheckedIn: boolean;
  checkInTimestamp?: string;
  index: number;
  eventId: string;
  eventTitle: string;
}

function AttendeeItem({ 
  buyerPubkey, 
  amount, 
  purchaseTime, 
  receiptId, 
  isCheckedIn, 
  checkInTimestamp, 
  index,
  eventId,
  eventTitle
}: AttendeeItemProps) {
  const author = useAuthor(buyerPubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || metadata?.display_name || `User ${index + 1}`;
  const profileImage = metadata?.picture;

  return (
    <div className={`bg-white border-2 rounded-xl p-4 shadow-sm transition-all ${
      isCheckedIn 
        ? 'border-green-300 bg-green-50/30' 
        : 'border-gray-200 bg-gray-50/30'
    }`}>
      <div className="flex items-center gap-3">
        {/* User Avatar */}
        <div className="flex-shrink-0">
          {profileImage ? (
            <img 
              src={profileImage} 
              alt={displayName}
              className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-gray-900 truncate">
              {displayName}
            </h4>
            {isCheckedIn && (
              <Badge className="bg-green-500 text-white font-medium text-xs">
                ✅ Checked In
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className="font-medium">{amount} sats</span>
            <span>•</span>
            <span>{new Date(purchaseTime * 1000).toLocaleDateString()}</span>
            {isCheckedIn && checkInTimestamp && (
              <>
                <span>•</span>
                <span className="text-green-600 font-medium">
                  Checked in: {new Date(parseInt(checkInTimestamp) * 1000).toLocaleDateString()}
                </span>
              </>
            )}
          </div>
          
          <p className="text-xs text-gray-500 mt-1">
            Receipt: <button 
              onClick={() => {
                // Create ticket data for verification
                const ticketData = {
                  eventId: eventId,
                  receiptId: receiptId,
                  amount: amount,
                  buyerPubkey: buyerPubkey,
                  eventTitle: eventTitle,
                  purchaseTime: purchaseTime,
                };
                
                // Navigate to verification page with ticket data
                const ticketUrl = `${window.location.origin}/verify-ticket?data=${encodeURIComponent(JSON.stringify(ticketData))}`;
                window.open(ticketUrl, '_blank');
              }}
              className="text-blue-600 hover:text-blue-800 underline font-mono"
            >
              {receiptId.slice(0, 8)}...
            </button>
          </p>
        </div>

        {/* Status Icon */}
        <div className="flex-shrink-0">
          {isCheckedIn ? (
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-gray-400" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function VerifyTicket() {
  const [searchParams] = useSearchParams();
  const { nostr } = useNostr();
  const { mutate: publishEvent } = useNostrPublish();

  // Removed manual check-in functionality - focusing on ticket verification only
  const { user } = useCurrentUser();
  
  // Add stable user state to prevent Event Host Dashboard from disappearing during auth failures
  const [stableUser, setStableUser] = useState(user);
  
  React.useEffect(() => {
    if (user) {
      setStableUser(user);
    }
    // Don't clear stableUser when user becomes null - keep the last known user state
  }, [user]);

  // Use the current user if available, otherwise fall back to stable user
  const effectiveUser = user || stableUser;
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<'loading' | 'valid' | 'invalid' | 'error'>('loading');
  const [manualInput, setManualInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isMarkingAsEntered, setIsMarkingAsEntered] = useState(false);
  const [entryStatus, setEntryStatus] = useState<'not_checked' | 'checked_in' | 'already_entered'>('not_checked');
  const [isEventHost, setIsEventHost] = useState<boolean | null>(null);
  const [isCheckingEventHost, setIsCheckingEventHost] = useState(true);
  const [myEvents, setMyEvents] = useState<unknown[]>([]);
  const [_checkedInAttendees, setCheckedInAttendees] = useState<unknown[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventTicketSales, setEventTicketSales] = useState<unknown[]>([]);
  const [eventCheckIns, setEventCheckIns] = useState<unknown[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const qrScannerRef = useRef<QrScanner | null>(null);

  useEffect(() => {
    const dataParam = searchParams.get('data');
    if (dataParam) {
      try {
        const decoded = JSON.parse(decodeURIComponent(dataParam));
        setTicketData(decoded);
      } catch (error) {
        console.error('Error parsing ticket data:', error);
        setVerificationStatus('error');
      }
    }
  }, [searchParams]);

  // Check if current user is an event host and load their events
  useEffect(() => {
    const checkEventHostStatus = async () => {
      try {
        setIsCheckingEventHost(true);
        
        // Check if user is available
        if (!effectiveUser?.pubkey) {
          console.log('❌ No user pubkey available - authentication may have failed');
          setIsEventHost(false);
          setIsCheckingEventHost(false);
          return;
        }
        
        // Get current user's events with timeout (same query as Profile page)
        const userEvents = await nostr.query([
          { 
            kinds: [31922, 31923], // Date and time-based events only
            authors: [effectiveUser.pubkey] // Filter by current user
          }
        ], { 
          signal: AbortSignal.timeout(3000) // 3 second timeout like Profile page
        }) as unknown[];

        console.log(`🔍 Found ${userEvents.length} events for user ${effectiveUser.pubkey.slice(0, 8)}...`);

        if (userEvents.length > 0) {
          setIsEventHost(true);
          setMyEvents(userEvents);
          
          // Load checked-in attendees for all events (with shorter timeout)
          const allEntryEvents: unknown[] = [];
          for (const event of userEvents) {
            try {
              const eventWithId = event as { id: string; tags: string[][] };
              const entryEvents = await nostr.query([
                {
                  kinds: [31926], // Entry tracking events
                  "#e": [eventWithId.id],
                  limit: 100
                }
              ], { 
                signal: AbortSignal.timeout(2000) // 2 second timeout for entry events
              }) as unknown[];
              
              allEntryEvents.push(...entryEvents.map((entry: unknown) => ({
                ...(entry as Record<string, unknown>),
                eventTitle: eventWithId.tags.find((tag: string[]) => tag[0] === "title")?.[1] || "Untitled Event",
                eventId: eventWithId.id
              })));
            } catch (error) {
              const eventWithId = event as { id: string };
              console.warn('Error loading entry events for event:', eventWithId.id, error);
            }
          }
          
                  setCheckedInAttendees(allEntryEvents);
                } else {
                  setIsEventHost(false);
                }
      } catch (error) {
        console.error('Error checking event host status:', error);
        // Don't set isEventHost to false on timeout - let user try again
        if (error instanceof Error && error.message.includes('timeout')) {
          console.log('⏰ Query timed out - will retry on next visit');
        } else {
          setIsEventHost(false);
        }
      } finally {
        setIsCheckingEventHost(false);
      }
    };

    checkEventHostStatus();
  }, [nostr, effectiveUser]);

  // Load ticket sales and check-ins for selected event
  const loadEventData = useCallback(async () => {
      if (!selectedEventId || !nostr || !effectiveUser?.pubkey) return;

      try {
    // Load ticket sales (zap receipts where current user is the recipient)
        
        let ticketSales;
        try {
          ticketSales = await nostr.query([
            {
              kinds: [9735], // Zap receipts
              "#p": [effectiveUser.pubkey], // Where current user is the recipient
              limit: 100
            }
          ], { signal: AbortSignal.timeout(5000) }); // 5 second timeout
        } catch (error) {
          console.error('Error querying ticket sales:', error);
          ticketSales = []; // Fallback to empty array
        }

        // Load check-ins (entry events for this event)
        const checkIns = await nostr.query([
          {
            kinds: [31926], // Entry tracking events
            "#e": [selectedEventId],
            limit: 100
          }
        ]);
        
        console.log(`📊 Host Dashboard Data for event ${selectedEventId}:`, {
          ticketSales: ticketSales.length,
          checkIns: checkIns.length,
          userPubkey: effectiveUser.pubkey.slice(0, 8) + '...'
        });


        // Filter ticket sales to only those for the selected event
        // AND exclude our system-created zap receipts (they have "manual_payment_confirmed" preimage)
        const eventTicketSales = ticketSales.filter((sale: { tags: string[][] }) => {
          // Check if this zap receipt is for the selected event
          const eventId = sale.tags.find((tag: string[]) => tag[0] === "e")?.[1];
          if (eventId !== selectedEventId) return false;
          
          // Exclude our system-created zap receipts (they have "manual_payment_confirmed" preimage)
          const preimage = sale.tags.find((tag: string[]) => tag[0] === "preimage")?.[1];
          if (preimage === "manual_payment_confirmed") return false;
          
          return true;
        });


        setEventTicketSales(eventTicketSales);
        setEventCheckIns(checkIns);
      } catch (error) {
        console.error('Error loading event data:', error);
      }
    }, [selectedEventId, nostr, effectiveUser]);

  // Load event data when selectedEventId changes
  useEffect(() => {
    loadEventData();
  }, [loadEventData]);

  const handleManualInput = () => {
    if (!manualInput.trim()) return;
    
    try {
      // Try to parse as JSON first (full ticket data)
      const decoded = JSON.parse(manualInput);
      setTicketData(decoded);
    } catch {
      // If not JSON, try to parse as URL with data parameter
      try {
        const url = new URL(manualInput);
        const dataParam = url.searchParams.get('data');
        if (dataParam) {
          const decoded = JSON.parse(decodeURIComponent(dataParam));
          setTicketData(decoded);
        } else {
          setVerificationStatus('error');
        }
      } catch {
        setVerificationStatus('error');
      }
    }
  };

  const handleQRScan = async () => {
    try {
      setIsScanning(true);
      setScannerError(null);
      
      if (!videoRef.current) return;
      
      // Check if camera is available
      const hasCamera = await QrScanner.hasCamera();
      if (!hasCamera) {
        setScannerError('No camera found. Please use manual input instead.');
        setIsScanning(false);
        return;
      }
      
      // Create QR scanner
      qrScannerRef.current = new QrScanner(
        videoRef.current,
        (result) => {
          // QR code detected
          try {
            const decoded = JSON.parse(result.data);
            setTicketData(decoded);
            stopScanner();
          } catch {
            // Try to parse as URL with data parameter
            try {
              const url = new URL(result.data);
              const dataParam = url.searchParams.get('data');
              if (dataParam) {
                const decoded = JSON.parse(decodeURIComponent(dataParam));
                setTicketData(decoded);
                stopScanner();
              } else {
                setScannerError('Invalid QR code format. Please try again.');
              }
            } catch {
              setScannerError('Invalid QR code format. Please try again.');
            }
          }
        },
        {
          highlightScanRegion: true,
          highlightCodeOutline: true,
        }
      );
      
      await qrScannerRef.current.start();
    } catch (error) {
      console.error('QR Scanner error:', error);
      setScannerError('Failed to start camera. Please check permissions and try again.');
      setIsScanning(false);
    }
  };

  const stopScanner = () => {
    if (qrScannerRef.current) {
      qrScannerRef.current.stop();
      qrScannerRef.current.destroy();
      qrScannerRef.current = null;
    }
    setIsScanning(false);
  };

  // Check if attendee has already entered
  const checkEntryStatus = useCallback(async () => {
    if (!ticketData) return;
    
    try {
      // Look for existing entry events for this specific ticket
      const entryEvents = await nostr.query([
        {
          kinds: [31926], // Custom kind for entry tracking
          "#e": [ticketData.eventId],
          "#p": [ticketData.buyerPubkey],
          "#t": ["entry"]
        }
      ]);
      
      // Check if any entry event matches this specific receipt ID
      const matchingEntry = entryEvents.find((event: { tags: string[][] }) => {
        const receiptTag = event.tags.find((tag) => tag[0] === "receipt");
        return receiptTag && receiptTag[1] === ticketData.receiptId;
      });
      
      if (matchingEntry) {
        setEntryStatus('already_entered');
      } else {
        setEntryStatus('not_checked');
      }
    } catch (error) {
      console.error('Error checking entry status:', error);
    }
  }, [ticketData, nostr]);

  // Mark attendee as entered
  const markAsEntered = async () => {
    if (!ticketData) return;
    
    setIsMarkingAsEntered(true);
    try {
      // Create entry tracking event
      const entryEvent = {
        kind: 31926,
        content: `Attendee checked in for ${ticketData.eventTitle}`,
        tags: [
          ["e", ticketData.eventId],
          ["p", ticketData.buyerPubkey],
          ["receipt", ticketData.receiptId], // Include receipt ID for specific ticket matching
          ["t", "entry"],
          ["status", "entered"],
          ["timestamp", Math.floor(Date.now() / 1000).toString()]
        ]
      };
      
      // Publish entry event
      publishEvent(entryEvent, {
        onSuccess: () => {
          console.log('✅ Check-in event published successfully');
          console.log('🎫 Check-in details:', {
            eventId: ticketData.eventId,
            buyerPubkey: ticketData.buyerPubkey,
            receiptId: ticketData.receiptId
          });
          setEntryStatus('checked_in');
          // Re-check entry status to ensure UI updates
          setTimeout(() => {
            checkEntryStatus();
            // Also refresh host dashboard data if we're on the same event
            if (selectedEventId === ticketData.eventId) {
              console.log('🔄 Refreshing host dashboard data...');
              // Force reload the event data
              loadEventData();
            }
          }, 1000);
          alert('Attendee successfully checked in!');
        },
        onError: (error) => {
          console.error('Error marking as entered:', error);
          alert('Failed to check in attendee. Please try again.');
        }
      });
    } catch (error) {
      console.error('Error marking as entered:', error);
      alert('Failed to check in attendee. Please try again.');
    } finally {
      setIsMarkingAsEntered(false);
    }
  };

  // Check entry status when ticket data changes
  useEffect(() => {
    if (ticketData) {
      checkEntryStatus();
    }
  }, [ticketData, checkEntryStatus]);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  // Verify the ticket by checking the zap receipt
  const { data: zapReceipt, isLoading, error } = useQuery({
    queryKey: ["verifyTicket", ticketData?.receiptId],
    queryFn: async () => {
      if (!ticketData?.receiptId) return null;

      console.log('🔍 Verifying ticket with receipt ID:', ticketData.receiptId);
      console.log('🔍 Ticket data:', {
        eventId: ticketData.eventId,
        receiptId: ticketData.receiptId,
        amount: ticketData.amount,
        buyerPubkey: ticketData.buyerPubkey,
        eventTitle: ticketData.eventTitle
      });
      
      // Retry mechanism for relay propagation delay
      const maxRetries = 3;
      const retryDelay = 2000; // 2 seconds
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`🔄 Verification attempt ${attempt}/${maxRetries}`);
        
        try {
          // First try to find by receipt ID only (should be unique)
          let events = await nostr.query([
            {
              kinds: [9735], // Zap receipt
              ids: [ticketData.receiptId],
            },
          ], { signal: AbortSignal.timeout(10000) }); // 10 second timeout
          
          console.log(`📋 Found events by ID only (attempt ${attempt}):`, events.length);
          
          // If not found, try with event ID filter as well
          if (events.length === 0) {
            console.log('🔍 Trying with event ID filter...');
            try {
              events = await nostr.query([
                {
                  kinds: [9735], // Zap receipt
                  ids: [ticketData.receiptId],
                  "#e": [ticketData.eventId],
                },
              ], { signal: AbortSignal.timeout(10000) }); // 10 second timeout
              console.log(`📋 Found events with event ID filter (attempt ${attempt}):`, events.length);
            } catch (error) {
              console.log('❌ Error with event ID filter, trying without event ID:', error);
              // If event ID is malformed, try without it
              events = await nostr.query([
                {
                  kinds: [9735], // Zap receipt
                  ids: [ticketData.receiptId],
                },
              ], { signal: AbortSignal.timeout(10000) }); // 10 second timeout
              console.log(`📋 Found events without event ID filter (attempt ${attempt}):`, events.length);
            }
          }
          
          const result = events[0] || null;
          if (result) {
            console.log('✅ Found zap receipt:', result.id);
            return result;
          } else {
            console.log(`❌ No zap receipt found for ID (attempt ${attempt}):`, ticketData.receiptId);
            
            // If this is not the last attempt, wait before retrying
            if (attempt < maxRetries) {
              console.log(`⏳ Waiting ${retryDelay}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
          }
        } catch (error) {
          console.error(`❌ Error in verification attempt ${attempt}:`, error);
          if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
            console.log(`⏰ Query timed out on attempt ${attempt}`);
          }
          if (attempt < maxRetries) {
            console.log(`⏳ Waiting ${retryDelay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      }
      
      console.log('❌ All verification attempts failed');
      return null;
    },
    enabled: !!ticketData?.receiptId,
    retry: 2, // Additional retries at the query level
    retryDelay: 3000, // 3 seconds between retries
  });

  // Handle verification status changes based on query state
  useEffect(() => {
    if (ticketData) {
      // Check if user is logged in
      if (!user?.pubkey) {
        console.log('❌ No user pubkey available - authentication may have failed');
        setVerificationStatus('error');
        return;
      }
      
      if (isLoading) {
        setVerificationStatus('loading');
      } else if (error) {
        console.log('❌ Verification error:', error);
        setVerificationStatus('error');
      } else if (zapReceipt) {
        console.log('✅ Ticket verified successfully');
        console.log('🎫 Ticket data:', {
          eventId: ticketData.eventId,
          buyerPubkey: ticketData.buyerPubkey,
          receiptId: ticketData.receiptId,
          eventTitle: ticketData.eventTitle
        });
        setVerificationStatus('valid');
      } else {
        console.log('❌ Ticket verification failed - no zap receipt found');
        console.log('🔍 Looking for receipt ID:', ticketData.receiptId);
        setVerificationStatus('invalid');
      }
    }
  }, [ticketData, user, isLoading, error, zapReceipt]);

  // Always show the ticket verification interface
  if (!ticketData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Ticket Verification Section - Always Visible */}
          <Card className="mb-6 border-2 border-primary/20 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10">
              <CardTitle className="text-center flex items-center justify-center gap-2 text-xl">
                <QrCode className="h-7 w-7 text-primary" />
                Ticket Verification
              </CardTitle>
              <p className="text-center text-gray-600 text-sm">
                Scan QR code or enter ticket data to verify attendance
              </p>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="scan" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="scan" className="flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    Scan QR Code
                  </TabsTrigger>
                  <TabsTrigger value="manual" className="flex items-center gap-2">
                    <Clipboard className="h-4 w-4" />
                    Manual Input
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="scan" className="space-y-4">
                  <div className="text-center">
                    <p className="text-gray-600 mb-4 font-medium">
                      📱 Scan the QR code from the attendee's ticket
                    </p>
                    
                    {/* Video element for QR scanning */}
                    <div className="relative mb-4">
                      <video
                        ref={videoRef}
                        className="w-full max-w-lg mx-auto rounded-xl border-2 border-dashed border-primary/30 shadow-lg"
                        style={{ display: isScanning ? 'block' : 'none' }}
                      />
                      {!isScanning && (
                        <div className="w-full max-w-lg mx-auto h-64 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border-2 border-dashed border-primary/30 flex items-center justify-center shadow-lg">
                          <div className="text-center text-primary/60">
                            <Camera className="h-16 w-16 mx-auto mb-3" />
                            <p className="text-lg font-medium">Camera will appear here</p>
                            <p className="text-sm mt-1">Click "Start QR Scanner" to begin</p>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Scanner controls */}
                    <div className="space-y-3">
                      <Button 
                        onClick={handleQRScan} 
                        disabled={isScanning}
                        className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3"
                        size="lg"
                      >
                        {isScanning ? (
                          <>
                            <AlertCircle className="h-5 w-5 mr-2 animate-spin" />
                            Scanning for QR Code...
                          </>
                        ) : (
                          <>
                            <Camera className="h-5 w-5 mr-2" />
                            Start QR Scanner
                          </>
                        )}
                      </Button>
                      
                      {isScanning && (
                        <Button 
                          onClick={stopScanner}
                          variant="outline"
                          className="w-full border-2 border-red-200 text-red-600 hover:bg-red-50"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Stop Scanner
                        </Button>
                      )}
                    </div>
                    
                    {/* Error message */}
                    {scannerError && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4">
                        <p className="text-red-800 text-sm text-center">
                          {scannerError}
                        </p>
                      </div>
                    )}
                    
                    <p className="text-xs text-gray-500 mt-2">
                      Note: QR scanner requires camera permission
                    </p>
                  </div>
                </TabsContent>
                
                <TabsContent value="manual" className="space-y-4">
                  <div className="space-y-3">
                    <Label htmlFor="ticket-input" className="text-base font-medium">
                      📝 Ticket Data or URL
                    </Label>
                    <Input
                      id="ticket-input"
                      placeholder="Paste ticket data or verification URL here..."
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      className="font-mono text-sm border-2 border-primary/20 focus:border-primary/50 h-12"
                    />
                    <p className="text-sm text-gray-600">
                      Paste either the full ticket JSON data or the verification URL from the attendee's ticket
                    </p>
                  </div>
                  <Button 
                    onClick={handleManualInput}
                    disabled={!manualInput.trim()}
                    className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3"
                    size="lg"
                  >
                    <Clipboard className="h-5 w-5 mr-2" />
                    Verify Ticket
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Event Host Dashboard - Separate Section */}
          {isEventHost && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-center flex items-center justify-center gap-2">
                  <QrCode className="h-6 w-6" />
                  Event Host Dashboard
                  {isCheckingEventHost && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary ml-2"></div>
                  )}
                </CardTitle>
                <p className="text-center text-gray-600 text-sm">
                  Select an event to manage ticket sales and check-ins
                  {isCheckingEventHost && (
                    <span className="block text-xs text-blue-600 mt-1">
                      Loading your events...
                    </span>
                  )}
                </p>
              </CardHeader>
              <CardContent>
                {/* Event Selection Dropdown */}
                <div className="space-y-4 mb-6">
                  <div className="space-y-2">
                    <Label htmlFor="event-select">Select Event to Manage</Label>
                            <select
                              id="event-select"
                              value={selectedEventId || ''}
                              onChange={(e) => setSelectedEventId(e.target.value || null)}
                              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            >
                      <option value="">Choose an event...</option>
                      {myEvents.map((event, index) => {
                        const eventData = event as { id: string; tags: string[][] };
                        const title = eventData.tags.find((tag: string[]) => tag[0] === "title")?.[1] || "Untitled Event";
                        return (
                          <option key={index} value={eventData.id}>
                            {title}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                {/* Event-Specific Data */}
                {selectedEventId && (
                  <div className="space-y-6">
                    {/* Attendees List */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <h3 className="text-lg font-semibold text-amber-800 mb-3">
                        👥 Attendees ({eventTicketSales.length})
                      </h3>
                      {eventTicketSales.length > 0 ? (
                        <div className="space-y-3">
                          {eventTicketSales
                            .sort((a, b) => {
                              const aData = a as { created_at: number };
                              const bData = b as { created_at: number };
                              return aData.created_at - bData.created_at; // Oldest first
                            })
                            .map((sale, index) => {
                            const saleData = sale as { 
                              id: string; 
                              pubkey: string; 
                              created_at: number; 
                              tags: string[][];
                            };
                            
                            // Parse zap request to get amount and buyer pubkey
                            const descriptionTag = saleData.tags.find((tag: string[]) => tag[0] === "description")?.[1];
                            let amount = 0;
                            let buyerPubkey = saleData.pubkey; // Default to zap receipt author
                            
                            if (descriptionTag) {
                              try {
                                const zapRequest = JSON.parse(descriptionTag);
                                const amountTag = zapRequest.tags?.find((tag: string[]) => tag[0] === "amount");
                                if (amountTag) {
                                  amount = Math.floor(parseInt(amountTag[1]) / 1000); // Convert from millisats to sats
                                }
                                // Get buyer pubkey from zap request author
                                if (zapRequest.pubkey) {
                                  buyerPubkey = zapRequest.pubkey;
                                }
                              } catch (error) {
                                console.error("Error parsing zap request:", error);
                              }
                            }

                            // Check if this specific ticket has been checked in
                            const checkInInfo = eventCheckIns.find((checkIn: { tags: string[][] }) => {
                              const checkInBuyer = checkIn.tags.find((tag) => tag[0] === "p")?.[1];
                              const checkInEvent = checkIn.tags.find((tag) => tag[0] === "e")?.[1];
                              const checkInReceipt = checkIn.tags.find((tag) => tag[0] === "receipt")?.[1];
                              
                              // Match by buyer, event, AND specific receipt ID to ensure we're checking the right ticket
                              return checkInBuyer === buyerPubkey && 
                                     checkInEvent === selectedEventId && 
                                     checkInReceipt === saleData.id;
                            }) as { tags: string[][] } | undefined;
                            
                            const isCheckedIn = !!checkInInfo;
                            const checkInTimestamp = checkInInfo?.tags?.find((tag: string[]) => tag[0] === "timestamp")?.[1];

                            // Get event title for the selected event
                            const selectedEvent = myEvents.find((event: { id: string }) => event.id === selectedEventId);
                            const eventTitle = selectedEvent ? 
                              (selectedEvent as { tags: string[][] }).tags.find((tag: string[]) => tag[0] === "title")?.[1] || "Untitled Event" 
                              : "Unknown Event";

                            return (
                              <AttendeeItem 
                                key={index}
                                buyerPubkey={buyerPubkey}
                                amount={amount}
                                purchaseTime={saleData.created_at}
                                receiptId={saleData.id}
                                isCheckedIn={isCheckedIn}
                                checkInTimestamp={checkInTimestamp}
                                index={index}
                                eventId={selectedEventId || ''}
                                eventTitle={eventTitle}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-amber-600">No attendees yet</p>
                      )}
                    </div>

                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }


  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-center text-2xl flex items-center justify-center gap-2">
            {verificationStatus === 'loading' && <AlertCircle className="h-6 w-6 animate-pulse text-blue-500" />}
            {verificationStatus === 'valid' && <CheckCircle className="h-6 w-6 text-green-500" />}
            {verificationStatus === 'invalid' && <XCircle className="h-6 w-6 text-red-500" />}
            {verificationStatus === 'error' && <AlertCircle className="h-6 w-6 text-yellow-500" />}
            Ticket Verification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && (
            <div className="text-center text-gray-500">
              <AlertCircle className="h-6 w-6 mx-auto mb-2 animate-spin" />
              <p>Verifying ticket on Nostr network...</p>
              <p className="text-xs mt-1">This may take a few moments as we check multiple relays</p>
            </div>
          )}

          {ticketData && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Event:</span>
                <span className="font-medium text-right">{ticketData.eventTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Buyer:</span>
                <span className="font-mono text-xs text-right">{ticketData.buyerPubkey.slice(0, 8)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount:</span>
                <Badge variant="secondary" className="text-xs">
                  {ticketData.amount} sats
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Purchased:</span>
                <span className="text-right">{new Date(ticketData.purchaseTime * 1000).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Event ID:</span>
                <span className="font-mono text-xs">{ticketData.eventId.slice(0, 8)}...</span>
              </div>
            </div>
          )}

          {/* Status Message */}
          {verificationStatus === 'valid' && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-green-800 text-sm text-center">
                  ✅ This ticket is valid and has been verified on the Nostr network.
                </p>
              </div>
              
              {/* Entry Status */}
              {entryStatus === 'already_entered' && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <p className="text-orange-800 text-sm text-center">
                    ⚠️ This attendee has already been checked in for this event.
                  </p>
                </div>
              )}
              
              {entryStatus === 'checked_in' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-blue-800 text-sm text-center">
                    ✅ Attendee has been successfully checked in!
                  </p>
                </div>
              )}
              
              {entryStatus === 'not_checked' && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-gray-800 text-sm text-center">
                    📋 This attendee has not been checked in yet.
                  </p>
                </div>
              )}
            </div>
          )}

          {verificationStatus === 'invalid' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-800 text-sm text-center">
                ❌ This ticket could not be verified. It may be fake or expired.
              </p>
            </div>
          )}

          {verificationStatus === 'error' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-yellow-800 text-sm text-center">
                ⚠️ There was an error verifying this ticket. Please try again.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {verificationStatus === 'valid' && entryStatus === 'not_checked' && (
              <Button 
                onClick={markAsEntered}
                disabled={isMarkingAsEntered}
                className="w-full"
                size="lg"
              >
                {isMarkingAsEntered ? (
                  <>
                    <AlertCircle className="h-4 w-4 mr-2 animate-spin" />
                    Checking In...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Check In Attendee
                  </>
                )}
              </Button>
            )}
            
            {verificationStatus === 'valid' && entryStatus === 'already_entered' && (
              <div className="bg-orange-100 border border-orange-300 rounded-lg p-3">
                <p className="text-orange-800 text-sm text-center font-medium">
                  This attendee has already been checked in
                </p>
              </div>
            )}
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => {
                  setTicketData(null);
                  setVerificationStatus('loading');
                  setManualInput('');
                  setEntryStatus('not_checked');
                }}
              >
                Verify Another
              </Button>
              
              {verificationStatus === 'valid' && entryStatus === 'checked_in' && (
                <Button 
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setTicketData(null);
                    setVerificationStatus('loading');
                    setManualInput('');
                    setEntryStatus('not_checked');
                  }}
                >
                  Done
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
