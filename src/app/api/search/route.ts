import { NextRequest, NextResponse } from "next/server";
import { SYMBOL_MAP } from "@/lib/symbolMap";

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

// Japanese company name → { ticker, english name } for Yahoo Finance search
const JP_NAME_MAP: Record<string, { ticker: string; eng: string; name: string }> = {
  トヨタ: { ticker: "7203.T", eng: "toyota", name: "トヨタ自動車" },
  ソニー: { ticker: "6758.T", eng: "sony", name: "ソニーG" },
  任天堂: { ticker: "7974.T", eng: "nintendo", name: "任天堂" },
  ソフトバンク: { ticker: "9984.T", eng: "softbank", name: "ソフトバンクG" },
  キーエンス: { ticker: "6861.T", eng: "keyence", name: "キーエンス" },
  ファーストリテイリング: { ticker: "9983.T", eng: "fast retailing", name: "ファストリ" },
  三菱UFJ: { ticker: "8306.T", eng: "mitsubishi ufj", name: "三菱UFJ" },
  三菱: { ticker: "8058.T", eng: "mitsubishi", name: "三菱商事" },
  三井: { ticker: "8031.T", eng: "mitsui", name: "三井物産" },
  住友: { ticker: "8053.T", eng: "sumitomo", name: "住友商事" },
  パナソニック: { ticker: "6752.T", eng: "panasonic", name: "パナソニック" },
  ホンダ: { ticker: "7267.T", eng: "honda", name: "ホンダ" },
  日産: { ticker: "7201.T", eng: "nissan", name: "日産自動車" },
  キヤノン: { ticker: "7751.T", eng: "canon", name: "キヤノン" },
  富士通: { ticker: "6702.T", eng: "fujitsu", name: "富士通" },
  日立: { ticker: "6501.T", eng: "hitachi", name: "日立製作所" },
  東芝: { ticker: "6502.T", eng: "toshiba", name: "東芝" },
  みずほ: { ticker: "8411.T", eng: "mizuho", name: "みずほFG" },
  サンバイオ: { ticker: "4592.T", eng: "sanbio", name: "サンバイオ" },
  楽天: { ticker: "4755.T", eng: "rakuten", name: "楽天G" },
  メルカリ: { ticker: "4385.T", eng: "mercari", name: "メルカリ" },
  リクルート: { ticker: "6098.T", eng: "recruit", name: "リクルート" },
  村田: { ticker: "6981.T", eng: "murata", name: "村田製作所" },
  デンソー: { ticker: "6902.T", eng: "denso", name: "デンソー" },
  ダイキン: { ticker: "6367.T", eng: "daikin", name: "ダイキン工業" },
  信越: { ticker: "4063.T", eng: "shin-etsu", name: "信越化学" },
  東京エレクトロン: { ticker: "8035.T", eng: "tokyo electron", name: "東京エレクトロン" },
  アドバンテスト: { ticker: "6857.T", eng: "advantest", name: "アドバンテスト" },
  ディスコ: { ticker: "6146.T", eng: "disco", name: "ディスコ" },
  レーザーテック: { ticker: "6920.T", eng: "lasertec", name: "レーザーテック" },
  JESCO: { ticker: "1662.T", eng: "jesco", name: "JESCOホールディングス" },
  jesco: { ticker: "1662.T", eng: "jesco", name: "JESCOホールディングス" },
};

// Build local results from JP_NAME_MAP and SYMBOL_MAP
function getLocalResults(query: string): SearchResult[] {
  const q = query.trim();
  const results: SearchResult[] = [];

  // Check JP_NAME_MAP (partial match)
  for (const [jpName, info] of Object.entries(JP_NAME_MAP)) {
    if (jpName.includes(q) || q.includes(jpName)) {
      results.push({
        symbol: info.ticker,
        name: info.name,
        exchange: "東京証券取引所",
        type: "EQUITY",
      });
    }
  }

  // Check SYMBOL_MAP
  const upper = q.toUpperCase();
  if (SYMBOL_MAP[upper] || SYMBOL_MAP[q]) {
    const sym = SYMBOL_MAP[upper] || SYMBOL_MAP[q];
    results.push({
      symbol: sym,
      name: q,
      exchange: "",
      type: "LOCAL",
    });
  }

  return results.slice(0, 5);
}

// Detect if query contains Japanese characters
function isJapanese(text: string): boolean {
  return /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]/.test(text);
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  const trimmed = q.trim();

  // Step 1: Check JP_NAME_MAP for direct match first
  const jpResults: SearchResult[] = [];
  let matchedJp = false;
  for (const [jpName, info] of Object.entries(JP_NAME_MAP)) {
    if (jpName.includes(trimmed) || trimmed.includes(jpName)) {
      jpResults.push({
        symbol: info.ticker,
        name: info.name,
        exchange: "東京証券取引所",
        type: "EQUITY",
      });
      matchedJp = true;
    }
  }

  // Step 2: Query Yahoo Finance API with enhanced headers
  // Use query2 endpoint with Japanese locale headers for better JP support
  let searchQuery = trimmed;
  if (matchedJp && jpResults.length > 0) {
    const firstMatch = Object.entries(JP_NAME_MAP).find(
      ([jpName]) => jpName.includes(trimmed) || trimmed.includes(jpName)
    );
    if (firstMatch) {
      searchQuery = firstMatch[1].eng;
    }
  }

  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(searchQuery)}&lang=ja&region=JP&quotesCount=8&newsCount=0&listsCount=0&enableFuzzyQuery=true&quotesQueryId=tss_match_phrase_query`;
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

    let apiResults: SearchResult[] = [];
    if (res.ok) {
      const data = await res.json();
      const quotes = data?.quotes || [];
      apiResults = quotes
        .filter(
          (item: Record<string, string>) =>
            item.quoteType === "EQUITY" ||
            item.quoteType === "ETF" ||
            item.quoteType === "INDEX" ||
            item.quoteType === "CRYPTOCURRENCY" ||
            item.quoteType === "FUTURE" ||
            item.quoteType === "MUTUALFUND"
        )
        .slice(0, 5)
        .map((item: Record<string, string>) => ({
          symbol: item.symbol || "",
          name: item.shortname || item.longname || item.symbol || "",
          exchange: item.exchDisp || item.exchange || "",
          type: item.quoteType || "",
        }));
    }

    // If Japanese query returned no API results, try query1 as fallback
    if (apiResults.length === 0 && isJapanese(trimmed) && !matchedJp) {
      try {
        const fallbackUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(trimmed)}&lang=ja&region=JP&quotesCount=8&newsCount=0&listsCount=0`;
        const fallbackRes = await fetch(fallbackUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "ja,en;q=0.9",
            Accept: "application/json",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          const fallbackQuotes = fallbackData?.quotes || [];
          apiResults = fallbackQuotes
            .filter(
              (item: Record<string, string>) =>
                item.quoteType === "EQUITY" ||
                item.quoteType === "ETF" ||
                item.quoteType === "INDEX" ||
                item.quoteType === "CRYPTOCURRENCY" ||
                item.quoteType === "FUTURE" ||
                item.quoteType === "MUTUALFUND"
            )
            .slice(0, 5)
            .map((item: Record<string, string>) => ({
              symbol: item.symbol || "",
              name: item.shortname || item.longname || item.symbol || "",
              exchange: item.exchDisp || item.exchange || "",
              type: item.quoteType || "",
            }));
        }
      } catch {
        // Ignore fallback errors
      }
    }

    // Merge: JP results first, then API results (deduplicated)
    const seenSymbols = new Set(jpResults.map((r) => r.symbol));
    for (const r of apiResults) {
      if (!seenSymbols.has(r.symbol)) {
        jpResults.push(r);
        seenSymbols.add(r.symbol);
      }
    }

    // If still empty, try local SYMBOL_MAP
    if (jpResults.length === 0) {
      const localResults = getLocalResults(trimmed);
      return NextResponse.json({ results: localResults });
    }

    return NextResponse.json(
      { results: jpResults.slice(0, 5) },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch {
    // Fallback to local results
    if (jpResults.length > 0) {
      return NextResponse.json({ results: jpResults.slice(0, 5) });
    }
    const localResults = getLocalResults(trimmed);
    return NextResponse.json({ results: localResults });
  }
}
