import { NextRequest, NextResponse } from "next/server";
import { toYahooSymbol } from "@/lib/symbolMap";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const interval = request.nextUrl.searchParams.get("interval") || "5m";
  const range = request.nextUrl.searchParams.get("range") || "2d";

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const ticker = toYahooSymbol(symbol);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Yahoo API returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      return NextResponse.json({ error: "No data" }, { status: 404 });
    }

    const timestamps: number[] = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};
    const meta = result.meta || {};

    // Convert UTC timestamps to JST (UTC+9) for lightweight-charts display
    const JST_OFFSET = 9 * 60 * 60; // +9 hours in seconds
    const chartData = timestamps
      .map((t: number, i: number) => ({
        time: t + JST_OFFSET,
        value: quotes.close?.[i] ?? null,
      }))
      .filter((d: { time: number; value: number | null }) => d.value !== null);

    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const currentPrice = meta.regularMarketPrice ?? null;
    const currency: string = meta.currency ?? "USD";

    let changePercent: number | null = null;
    if (prevClose && currentPrice) {
      changePercent = ((currentPrice - prevClose) / prevClose) * 100;
    }

    return NextResponse.json(
      { chartData, prevClose, currentPrice, changePercent, currency },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
