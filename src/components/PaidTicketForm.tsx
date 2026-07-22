import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { validateLightningAddress, formatAmount } from "@/lib/lightning";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthor } from "@/hooks/useAuthor";

interface TicketInfo {
  enabled: boolean;
  price: number;
  lightningAddress: string;
}

interface PaidTicketFormProps {
  onTicketInfoChange: (ticketInfo: TicketInfo) => void;
  initialTicketInfo?: TicketInfo;
}

export function PaidTicketForm({ onTicketInfoChange, initialTicketInfo }: PaidTicketFormProps) {
  const { user } = useCurrentUser();
  const author = useAuthor(user?.pubkey);
  const [ticketInfo, setTicketInfo] = useState<TicketInfo>(
    initialTicketInfo || {
      enabled: false,
      price: 0,
      lightningAddress: "",
    }
  );
  const [useDefaultAddress, setUseDefaultAddress] = useState(() => {
    // If we have initial ticket info with a lightning address, check if it matches the default
    if (initialTicketInfo?.lightningAddress) {
      return false; // Start with false and let the effect handle it
    }
    return true;
  });
  const [error, setError] = useState("");

  // Get the user's default lightning address from their profile
  const defaultLightningAddress =
    author.data?.metadata?.lud16 || author.data?.metadata?.lud06 || "";

  // Handle initial state for editing existing events
  useEffect(() => {
    if (initialTicketInfo?.lightningAddress && defaultLightningAddress) {
      setUseDefaultAddress(initialTicketInfo.lightningAddress === defaultLightningAddress);
    }
  }, [initialTicketInfo?.lightningAddress, defaultLightningAddress]);

  useEffect(() => {
    if (useDefaultAddress && defaultLightningAddress) {
      setTicketInfo((prev) => ({
        ...prev,
        lightningAddress: defaultLightningAddress,
      }));
    }
  }, [useDefaultAddress, defaultLightningAddress]);

  // Notify the parent only when the data changes. Depending on the callback
  // identity loops forever when a parent passes an inline arrow (every
  // notify -> parent setState -> new arrow -> effect refires).
  const onTicketInfoChangeRef = useRef(onTicketInfoChange);
  useEffect(() => {
    onTicketInfoChangeRef.current = onTicketInfoChange;
  });
  useEffect(() => {
    onTicketInfoChangeRef.current(ticketInfo);
  }, [ticketInfo]);

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setTicketInfo({
      ...ticketInfo,
      price: isNaN(value) ? 0 : value,
    });
  };

  const handleLightningAddressChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const address = e.target.value;
    setTicketInfo({
      ...ticketInfo,
      lightningAddress: address,
    });

    if (address && !validateLightningAddress(address)) {
      setError("Invalid Lightning address format");
    } else {
      setError("");
    }
  };

  const handleSwitchChange = (checked: boolean) => {
    setTicketInfo({
      ...ticketInfo,
      enabled: checked,
      // Reset price and address when disabling
      ...(checked ? {} : { price: 0, lightningAddress: "" }),
    });
  };

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Switch
          id="paid-ticket"
          checked={ticketInfo.enabled}
          onCheckedChange={handleSwitchChange}
        />
        <Label htmlFor="paid-ticket">Enable Paid Tickets</Label>
      </div>

      {ticketInfo.enabled && (
        <div className="space-y-4 pl-6">
          <div>
            <Label htmlFor="price">Price (sats)</Label>
            <Input
              id="price"
              type="number"
              min="0"
              value={ticketInfo.price}
              onChange={handlePriceChange}
              required
            />
            {ticketInfo.price > 0 && (
              <p className="text-sm text-muted-foreground">
                {formatAmount(ticketInfo.price)} per ticket
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Switch
                id="use-default-address"
                checked={useDefaultAddress}
                onCheckedChange={setUseDefaultAddress}
                disabled={!defaultLightningAddress}
              />
              <Label htmlFor="use-default-address">
                Use my default lightning address
                {!defaultLightningAddress && " (not found in profile)"}
              </Label>
            </div>

            {(!useDefaultAddress || !defaultLightningAddress) && (
              <div>
                <Label htmlFor="lightning-address">Lightning Address</Label>
                <Input
                  id="lightning-address"
                  type="text"
                  placeholder="your@lightning.address"
                  value={ticketInfo.lightningAddress}
                  onChange={handleLightningAddressChange}
                  required
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
