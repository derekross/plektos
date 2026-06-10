export function formatAmount(amount: number): string {
  return `${amount.toLocaleString()} sats`;
}

export function validateLightningAddress(address: string): boolean {
  // Basic validation for Lightning addresses (user@domain.tld)
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(address);
}
