// Map of common aliases → Yahoo Finance symbols
export const SYMBOL_MAP: Record<string, string> = {
  N225: "^N225",
  NIKKEI: "^N225",
  日経: "^N225",
  日経平均: "^N225",
  SPX: "^GSPC",
  SP500: "^GSPC",
  "S&P500": "^GSPC",
  DOW: "^DJI",
  ダウ: "^DJI",
  NASDAQ: "^IXIC",
  VIX: "^VIX",
  GOLD: "GC=F",
  ゴールド: "GC=F",
  金: "GC=F",
  OIL: "CL=F",
  原油: "CL=F",
  BTC: "BTC-USD",
  ビットコイン: "BTC-USD",
  ETH: "ETH-USD",
};

/**
 * Convert a display symbol to a Yahoo Finance ticker.
 * 1. Check SYMBOL_MAP for aliases (case-insensitive)
 * 2. Strip exchange prefix: "NASDAQ:AAPL" → "AAPL"
 * 3. Return as-is if no match
 */
export function toYahooSymbol(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  const trimmed = symbol.trim();

  // Check map (case-insensitive for latin, exact for Japanese)
  if (SYMBOL_MAP[upper]) return SYMBOL_MAP[upper];
  if (SYMBOL_MAP[trimmed]) return SYMBOL_MAP[trimmed];

  // Strip exchange prefix
  const parts = trimmed.split(":");
  return parts.length > 1 ? parts[1] : parts[0];
}
