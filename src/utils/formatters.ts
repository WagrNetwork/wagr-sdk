export function formatAddress(addr: string): string {
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}
