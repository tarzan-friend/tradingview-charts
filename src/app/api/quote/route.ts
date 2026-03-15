import { NextRequest, NextResponse } from "next/server";

// Convert "NASDAQ:AAPL" → "AAPL", "NYSE:TM" → "TM"
function toYahooSymbol(symbol: string): string {
  const parts = symbol.split(":");
  return parts.length > 1 ? parts[1] : parts[0];
}

export async function GET(request: NextRequest) {
  const symbols = request.nextUrl.searchParams.get("symbols");
  if (!symbols) {
    return NextResponse.json({ error: "symbols required" }, { status: 400 });
  }

  const symbolList = symbols.split(",").map((s) => s.trim());
  const results: Record<string, number | null> = {};

  await Promise.all(
    symbolList.map(async (fullSymbol) => {
      const ticker = toYahooSymbol(fullSymbol);
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          results[fullSymbol] = null;
          return;
        }
        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (meta) {
          const prev = meta.chartPreviousClose ?? meta.previousClose;
          const current = meta.regularMarketPrice;
          if (prev && current) {
            results[fullSymbol] = ((current - prev) / prev) * 100;
          } else {
            results[fullSymbol] = null;
          }
        } else {
          results[fullSymbol] = null;
        }
      } catch {
        results[fullSymbol] = null;
      }
    })
  );

  return NextResponse.json(results, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}
