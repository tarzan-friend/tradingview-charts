import { NextRequest, NextResponse } from "next/server";
import { toYahooSymbol } from "@/lib/symbolMap";

// 日本語文字が含まれているか判定
const hasJapanese = (str: string) => /[\u3040-\u30FF\u4E00-\u9FFF]/.test(str);

// Well-known Japanese stock code → Japanese name mapping
const JP_CODE_MAP: Record<string, string> = {
  "7203.T": "トヨタ自動車",
  "6758.T": "ソニーグループ",
  "7974.T": "任天堂",
  "9984.T": "ソフトバンクグループ",
  "6861.T": "キーエンス",
  "9983.T": "ファーストリテイリング",
  "8306.T": "三菱UFJフィナンシャル・グループ",
  "8058.T": "三菱商事",
  "8031.T": "三井物産",
  "8053.T": "住友商事",
  "6752.T": "パナソニック ホールディングス",
  "7267.T": "本田技研工業",
  "7201.T": "日産自動車",
  "7751.T": "キヤノン",
  "6702.T": "富士通",
  "6501.T": "日立製作所",
  "6502.T": "東芝",
  "8411.T": "みずほフィナンシャルグループ",
  "4592.T": "サンバイオ",
  "4755.T": "楽天グループ",
  "4385.T": "メルカリ",
  "6098.T": "リクルートホールディングス",
  "6981.T": "村田製作所",
  "6902.T": "デンソー",
  "6367.T": "ダイキン工業",
  "4063.T": "信越化学工業",
  "8035.T": "東京エレクトロン",
  "6857.T": "アドバンテスト",
  "6146.T": "ディスコ",
  "6920.T": "レーザーテック",
  "1662.T": "石油資源開発",
  "7011.T": "三菱重工業",
  "8316.T": "三井住友フィナンシャルグループ",
  "9432.T": "日本電信電話",
  "9433.T": "KDDI",
  "9434.T": "ソフトバンク",
  "6301.T": "小松製作所",
  "6954.T": "ファナック",
  "4502.T": "武田薬品工業",
  "4503.T": "アステラス製薬",
  "6273.T": "SMC",
  "7741.T": "HOYA",
  "4568.T": "第一三共",
  "6594.T": "日本電産",
  "7735.T": "SCREENホールディングス",
  "6723.T": "ルネサスエレクトロニクス",
  "3382.T": "セブン＆アイ・ホールディングス",
  "8001.T": "伊藤忠商事",
  "8002.T": "丸紅",
  "9101.T": "日本郵船",
  "9104.T": "商船三井",
  "9107.T": "川崎汽船",
};

// Try Yahoo Finance search API with lang=ja to get Japanese name
async function resolveViaSearch(ticker: string): Promise<string | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&lang=ja&region=JP&quotesCount=1&newsCount=0&listsCount=0`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ja,en;q=0.9",
        Accept: "application/json",
        Referer: "https://finance.yahoo.com/",
        Origin: "https://finance.yahoo.com",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const quotes = data?.quotes || [];
    if (quotes.length === 0) return null;
    const match =
      quotes.find(
        (q: Record<string, string>) =>
          q.symbol?.toUpperCase() === ticker.toUpperCase()
      ) || quotes[0];
    if (match) {
      const sn = match.shortname || match.shortName || "";
      const ln = match.longname || match.longName || "";
      if (hasJapanese(ln)) return ln;
      if (hasJapanese(sn)) return sn;
      return ln || sn || null;
    }
    return null;
  } catch {
    return null;
  }
}

// Fallback: chart API for English name
async function resolveViaChart(ticker: string): Promise<string | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const shortName = meta.shortName || "";
    const longName = meta.longName || "";
    if (hasJapanese(longName)) return longName;
    if (hasJapanese(shortName)) return shortName;
    return longName || shortName || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") || "";
  if (!symbol) {
    return NextResponse.json({ symbol: "", shortName: "" });
  }

  const ticker = toYahooSymbol(symbol);

  // 1. Check local JP_CODE_MAP first (instant, no API call)
  if (JP_CODE_MAP[ticker]) {
    return NextResponse.json({
      symbol: symbol,
      shortName: JP_CODE_MAP[ticker],
      longName: JP_CODE_MAP[ticker],
    });
  }

  // 2. Try search API (returns Japanese names for JP stocks)
  const searchName = await resolveViaSearch(ticker);
  if (searchName) {
    return NextResponse.json({
      symbol: symbol,
      shortName: searchName,
      longName: searchName,
    });
  }

  // 3. Fallback to chart API
  const chartName = await resolveViaChart(ticker);
  return NextResponse.json({
    symbol: symbol,
    shortName: chartName || symbol,
    longName: chartName || symbol,
  });
}
