import { NextRequest, NextResponse } from "next/server";
import { toYahooSymbol } from "@/lib/symbolMap";

async function fetchQuote(fullSymbol: string): Promise<{ price: number | null; changePercent: number | null }> {
  const ticker = toYahooSymbol(fullSymbol);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { price: null, changePercent: null };
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return { price: null, changePercent: null };

    const prev = meta.chartPreviousClose ?? meta.previousClose;
    const current = meta.regularMarketPrice;
    const changePercent = prev && current ? ((current - prev) / prev) * 100 : null;
    return { price: current ?? null, changePercent };
  } catch {
    return { price: null, changePercent: null };
  }
}

export async function GET(request: NextRequest) {
  const singleSymbol = request.nextUrl.searchParams.get("symbol");
  const symbols = request.nextUrl.searchParams.get("symbols");

  // Single symbol mode: returns { price, changePercent }
  if (singleSymbol) {
    const result = await fetchQuote(singleSymbol);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  }

  // Multi symbol mode: returns { [symbol]: changePercent }
  if (!symbols) {
    return NextResponse.json({ error: "symbol or symbols required" }, { status: 400 });
  }

  const symbolList = symbols.split(",").map((s) => s.trim());
  const results: Record<string, number | null> = {};

  await Promise.all(
    symbolList.map(async (fullSymbol) => {
      const { changePercent } = await fetchQuote(fullSymbol);
      results[fullSymbol] = changePercent;
    })
  );

  return NextResponse.json(results, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}
