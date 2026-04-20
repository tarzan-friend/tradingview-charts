import { toYahooSymbol } from "@/lib/symbolMap";

interface YahooResult {
  meta: {
    previousClose?: number;
    chartPreviousClose?: number;
    regularMarketPrice?: number;
    regularMarketChangePercent?: number;
    currency?: string;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{ close?: Array<number | null> }>;
  };
}

// rangeとintervalのマッピング
const rangeMap: Record<string, { interval: string; range: string }> = {
  "1d": { interval: "5m", range: "1d" },
  "5d": { interval: "30m", range: "5d" },
  "1mo": { interval: "1d", range: "1mo" },
  "3mo": { interval: "1d", range: "3mo" },
  "1y": { interval: "1wk", range: "1y" },
};

async function fetchYahoo(
  symbol: string,
  interval: string,
  range: string
): Promise<YahooResult | null> {
  const host1 = "https://query1.finance.yahoo.com";
  const host2 = "https://query2.finance.yahoo.com";
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;

  for (const host of [host1, host2]) {
    try {
      const res = await fetch(`${host}${path}`, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
        },
        cache: "no-store",
      });
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (result) return result;
    } catch {
      // try next host
    }
  }
  return null;
}

// 1Dの場合のフォールバック付きデータ取得
async function fetchWithFallback(symbol: string): Promise<YahooResult | null> {
  const attempts = [
    { interval: "5m", range: "1d" },
    { interval: "5m", range: "5d" },
    { interval: "1d", range: "1mo" },
  ];

  let lastResult: YahooResult | null = null;
  for (const attempt of attempts) {
    const result = await fetchYahoo(symbol, attempt.interval, attempt.range);
    if (result) {
      lastResult = result;
      if ((result.timestamp?.length ?? 0) >= 3) {
        return result;
      }
    }
  }
  return lastResult;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "";
  const range = searchParams.get("range") || "1d";

  if (!symbol) {
    return Response.json({ error: "symbol required" }, { status: 400 });
  }

  const ticker = toYahooSymbol(symbol);

  try {
    let result: YahooResult | null;

    if (range === "1d") {
      // 1Dはフォールバック付きで取得
      result = await fetchWithFallback(ticker);
    } else {
      // それ以外は既存のrangeMapで取得
      const params = rangeMap[range] || rangeMap["1d"];
      result = await fetchYahoo(ticker, params.interval, params.range);
    }

    if (!result) {
      return Response.json({
        chartData: [],
        prevClose: null,
        currentPrice: null,
        changePercent: null,
        currency: null,
      });
    }

    return processResult(result);
  } catch (error) {
    console.error("Chart API error:", error);
    return Response.json({
      chartData: [],
      prevClose: null,
      currentPrice: null,
      changePercent: null,
      currency: null,
    });
  }
}

function processResult(result: YahooResult) {
  const meta = result.meta;
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];

  const chartData = timestamps
    .map((t: number, i: number) => ({
      time: t + 9 * 60 * 60, // UTC→JST
      value: closes[i],
    }))
    .filter(
      (d): d is { time: number; value: number } =>
        d.value !== null && d.value !== undefined && !isNaN(d.value)
    );

  return Response.json({
    chartData,
    prevClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
    currentPrice: meta.regularMarketPrice ?? null,
    changePercent: meta.regularMarketChangePercent ?? null,
    currency: meta.currency ?? null,
  });
}
