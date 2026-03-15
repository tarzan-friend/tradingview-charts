import { NextRequest, NextResponse } from "next/server";
import { toYahooSymbol } from "@/lib/symbolMap";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ valid: false, error: "symbol required" });
  }

  const ticker = toYahooSymbol(symbol);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json({ valid: false });
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];

    if (!result?.meta) {
      return NextResponse.json({ valid: false });
    }

    const meta = result.meta;
    return NextResponse.json({
      valid: true,
      name: meta.shortName || meta.symbol || ticker,
      symbol: meta.symbol || ticker,
    });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
