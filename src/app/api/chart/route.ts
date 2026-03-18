import { NextRequest, NextResponse } from "next/server";
import { toYahooSymbol } from "@/lib/symbolMap";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const interval = request.nextUrl.searchParams.get("interval") || "5m";
  const range = request.nextUrl.searchParams.get("range") || "1d";

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const ticker = toYahooSymbol(symbol);

  // 1Dの場合は5d分取得して最新営業日のデータのみ抽出する
  const fetchRange = range === "1d" ? "5d" : range;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${fetchRange}`;
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
    let chartData = timestamps
      .map((t: number, i: number) => ({
        time: t + JST_OFFSET,
        value: quotes.close?.[i] ?? null,
      }))
      .filter((d: { time: number; value: number | null }) => d.value !== null);

    // 1Dの場合、最新営業日のデータのみにフィルタリング
    if (range === "1d" && chartData.length > 0) {
      const latestTimestamp = timestamps[timestamps.length - 1];
      const latestDate = new Date(latestTimestamp * 1000);
      const latestDay = latestDate.toDateString();
      const filteredData = chartData.filter(
        (d) => new Date((d.time - JST_OFFSET) * 1000).toDateString() === latestDay
      );
      // フィルタ後3件以上あればそれを使用、なければ全データを返す
      if (filteredData.length >= 3) {
        chartData = filteredData;
      }
    }

    // データが5件未満の場合、期間を延長して再取得
    if (chartData.length < 5 && range === "1d") {
      const fallbackUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1mo`;
      const fallbackRes = await fetch(fallbackUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        const fallbackResult = fallbackData?.chart?.result?.[0];
        if (fallbackResult) {
          const fbTimestamps: number[] = fallbackResult.timestamp || [];
          const fbQuotes = fallbackResult.indicators?.quote?.[0] || {};
          const fbChartData = fbTimestamps
            .map((t: number, i: number) => ({
              time: t + JST_OFFSET,
              value: fbQuotes.close?.[i] ?? null,
            }))
            .filter((d: { time: number; value: number | null }) => d.value !== null);
          if (fbChartData.length > chartData.length) {
            chartData = fbChartData;
          }
        }
      }
    }

    // previousCloseが前営業日の正確な終値（chartPreviousCloseはrange依存で不正確）
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
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
