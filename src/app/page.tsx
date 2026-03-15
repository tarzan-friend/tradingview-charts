"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import TradingViewChart, { TIME_RANGES } from "@/components/TradingViewChart";

// --- Types & Constants ---

interface WatchlistItem {
  symbol: string;
  name: string;
}

interface LayoutOption {
  count: number;
  cols: number;
  rows: number;
  label: string;
}

const LAYOUTS: LayoutOption[] = [
  { count: 1, cols: 1, rows: 1, label: "1" },
  { count: 2, cols: 2, rows: 1, label: "2" },
  { count: 4, cols: 2, rows: 2, label: "4" },
  { count: 6, cols: 3, rows: 2, label: "6" },
  { count: 9, cols: 3, rows: 3, label: "9" },
  { count: 16, cols: 4, rows: 4, label: "16" },
  { count: 24, cols: 6, rows: 4, label: "24" },
];

const DEFAULT_SYMBOLS = [
  "NASDAQ:AAPL",
  "NASDAQ:NVDA",
  "NASDAQ:MSFT",
  "NASDAQ:GOOGL",
  "NYSE:TM",
  "NYSE:SONY",
  "NYSE:TSM",
  "NASDAQ:AMZN",
  "NASDAQ:META",
  "NASDAQ:TSLA",
  "NYSE:JPM",
  "NYSE:V",
  "NYSE:WMT",
  "NYSE:UNH",
  "NYSE:JNJ",
  "NYSE:PG",
  "NYSE:MA",
  "NYSE:HD",
  "NYSE:KO",
  "NYSE:PEP",
  "NYSE:BAC",
  "NYSE:DIS",
  "NASDAQ:NFLX",
  "NASDAQ:INTC",
];

const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { symbol: "NASDAQ:AAPL", name: "Apple" },
  { symbol: "NASDAQ:NVDA", name: "NVIDIA" },
  { symbol: "NASDAQ:MSFT", name: "Microsoft" },
  { symbol: "NASDAQ:GOOGL", name: "Alphabet" },
  { symbol: "NYSE:TM", name: "トヨタ (ADR)" },
  { symbol: "NYSE:SONY", name: "ソニー (ADR)" },
  { symbol: "NYSE:TSM", name: "TSMC" },
];

const STORAGE_KEY = "tradingview-charts-state";
const STORAGE_VERSION_KEY = "tradingview-charts-version";
const STORAGE_VERSION = "v5";

interface AppState {
  symbols: string[];
  layoutIndex: number;
  watchlist: WatchlistItem[];
}

function loadState(): AppState | null {
  if (typeof window === "undefined") return null;
  try {
    const savedVersion = localStorage.getItem(STORAGE_VERSION_KEY);
    if (savedVersion !== STORAGE_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
      return null;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

// --- Watchlist Sidebar ---

function WatchlistSidebar({
  watchlist,
  onSelect,
  onAdd,
  onRemove,
  open,
  onToggle,
}: {
  watchlist: WatchlistItem[];
  onSelect: (symbol: string) => void;
  onAdd: (item: WatchlistItem) => void;
  onRemove: (index: number) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [symbolInput, setSymbolInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const handleAdd = () => {
    const sym = symbolInput.trim().toUpperCase();
    if (sym) {
      onAdd({ symbol: sym, name: nameInput.trim() || sym });
      setSymbolInput("");
      setNameInput("");
      setAdding(false);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      const sym = searchQuery.trim().toUpperCase();
      onAdd({ symbol: sym, name: sym });
      setSearchQuery("");
    }
  };

  const filteredWatchlist = searchQuery.trim()
    ? watchlist.filter(
        (item) =>
          item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : watchlist;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute left-0 top-1/2 z-20 -translate-y-1/2 rounded-r bg-[#2a2e39] px-1 py-3 text-zinc-400 hover:bg-[#363a45] hover:text-white"
        style={{ left: open ? "240px" : "0px", transition: "left 0.2s" }}
        title={open ? "サイドバーを閉じる" : "ウォッチリスト"}
      >
        {open ? "◀" : "▶"}
      </button>

      {/* Sidebar */}
      <aside
        className="z-10 flex shrink-0 flex-col border-r border-zinc-700 bg-[#1e222d]"
        style={{
          width: open ? "240px" : "0px",
          overflow: "hidden",
          transition: "width 0.2s",
        }}
      >
        <div className="flex h-8 items-center justify-between px-3">
          <span className="text-xs font-semibold text-zinc-300">
            ウォッチリスト
          </span>
          <button
            onClick={() => setAdding(!adding)}
            className="text-lg leading-none text-zinc-400 hover:text-white"
            title="銘柄を追加"
          >
            +
          </button>
        </div>

        {/* Search box */}
        <div className="px-3 pb-1">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="銘柄を検索..."
            className="h-6 w-full rounded border border-zinc-600 bg-[#131722] px-2 text-xs text-zinc-200 outline-none focus:border-blue-500"
          />
        </div>

        {adding && (
          <div className="flex flex-col gap-1 border-b border-zinc-700 px-3 pb-2">
            <input
              autoFocus
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="NASDAQ:AAPL"
              className="h-6 rounded border border-zinc-600 bg-[#131722] px-2 text-xs text-zinc-200 outline-none focus:border-blue-500"
            />
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="メモ名（任意）"
              className="h-6 rounded border border-zinc-600 bg-[#131722] px-2 text-xs text-zinc-200 outline-none focus:border-blue-500"
            />
            <button
              onClick={handleAdd}
              className="h-6 rounded bg-blue-600 text-xs text-white hover:bg-blue-500"
            >
              追加
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {filteredWatchlist.map((item, i) => {
            // Find original index for removal
            const originalIndex = watchlist.indexOf(item);
            return (
              <div
                key={`${item.symbol}-${originalIndex}`}
                className="group flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-[#2a2e39]"
                onClick={() => onSelect(item.symbol)}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-zinc-200">
                    {item.symbol}
                  </div>
                  {item.name && item.name !== item.symbol && (
                    <div className="truncate text-[10px] text-zinc-500">
                      {item.name}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(originalIndex);
                  }}
                  className="hidden text-xs text-zinc-500 hover:text-red-400 group-hover:block"
                  title="削除"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}

// --- Main Page ---

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS.slice(0, 4));
  const [layoutIndex, setLayoutIndex] = useState(2); // default 4 charts
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(DEFAULT_WATCHLIST);
  const [focusedChart, setFocusedChart] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [timeRangeIndex, setTimeRangeIndex] = useState(0); // default 1D
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState("");
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = loadState();
    if (saved) {
      setSymbols(saved.symbols);
      setLayoutIndex(saved.layoutIndex);
      setWatchlist(saved.watchlist);
    }
    setMounted(true);
  }, []);

  // Save to localStorage on state change
  useEffect(() => {
    if (!mounted) return;
    saveState({ symbols, layoutIndex, watchlist });
  }, [symbols, layoutIndex, watchlist, mounted]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!mounted) return;
    setLastUpdated(new Date().toLocaleTimeString("ja-JP"));

    refreshIntervalRef.current = setInterval(() => {
      setRefreshKey((k) => k + 1);
      setLastUpdated(new Date().toLocaleTimeString("ja-JP"));
    }, 30000);

    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [mounted]);

  const layout = LAYOUTS[layoutIndex];

  const handleLayoutChange = useCallback(
    (newIndex: number) => {
      const newLayout = LAYOUTS[newIndex];
      setLayoutIndex(newIndex);
      setSymbols((prev) => {
        if (prev.length >= newLayout.count) return prev.slice(0, newLayout.count);
        const extra = [];
        for (let i = prev.length; i < newLayout.count; i++) {
          extra.push(DEFAULT_SYMBOLS[i % DEFAULT_SYMBOLS.length]);
        }
        return [...prev, ...extra];
      });
      setFocusedChart((prev) =>
        prev >= newLayout.count ? 0 : prev
      );
    },
    []
  );

  const handleSymbolChange = useCallback((index: number, newSymbol: string) => {
    setSymbols((prev) => {
      const next = [...prev];
      next[index] = newSymbol;
      return next;
    });
  }, []);

  const handleWatchlistSelect = useCallback(
    (symbol: string) => {
      // Apply to focused chart, or chart 0 if none focused
      const target = focusedChart >= 0 ? focusedChart : 0;
      handleSymbolChange(target, symbol);
    },
    [focusedChart, handleSymbolChange]
  );

  const handleWatchlistAdd = useCallback((item: WatchlistItem) => {
    setWatchlist((prev) => [...prev, item]);
  }, []);

  const handleWatchlistRemove = useCallback((index: number) => {
    setWatchlist((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Don't render charts until client-side hydration is complete
  if (!mounted) {
    return <div className="flex h-screen items-center justify-center bg-[#131722] text-zinc-500">読み込み中...</div>;
  }

  const visibleSymbols = symbols.slice(0, layout.count);

  return (
    <div className="flex h-screen flex-col bg-[#131722]">
      {/* Header */}
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-zinc-700 px-3">
        <h1 className="text-xs font-semibold text-zinc-400">Multi Charts</h1>
        <div className="h-4 w-px bg-zinc-700" />
        {/* Layout buttons */}
        <div className="flex items-center gap-1">
          <span className="mr-1 text-[10px] text-zinc-500">レイアウト:</span>
          {LAYOUTS.map((l, i) => (
            <button
              key={l.count}
              onClick={() => handleLayoutChange(i)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                i === layoutIndex
                  ? "bg-blue-600 text-white"
                  : "bg-[#2a2e39] text-zinc-400 hover:bg-[#363a45] hover:text-zinc-200"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-zinc-700" />
        {/* Time range buttons */}
        <div className="flex items-center gap-1">
          <span className="mr-1 text-[10px] text-zinc-500">期間:</span>
          {TIME_RANGES.map((tr, i) => (
            <button
              key={tr.label}
              onClick={() => setTimeRangeIndex(i)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                i === timeRangeIndex
                  ? "bg-blue-600 text-white"
                  : "bg-[#2a2e39] text-zinc-400 hover:bg-[#363a45] hover:text-zinc-200"
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>
        {/* Last updated */}
        {lastUpdated && (
          <div className="ml-auto flex items-center gap-1 text-[10px] text-zinc-500">
            <span>最終更新: {lastUpdated}</span>
            <span>⟳</span>
          </div>
        )}
      </header>

      {/* Body */}
      <div className="relative flex min-h-0 flex-1">
        {/* Watchlist Sidebar */}
        <WatchlistSidebar
          watchlist={watchlist}
          onSelect={handleWatchlistSelect}
          onAdd={handleWatchlistAdd}
          onRemove={handleWatchlistRemove}
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((p) => !p)}
        />

        {/* Charts Grid */}
        <main
          className="min-h-0 min-w-0 flex-1 gap-px bg-zinc-800"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
            gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
          }}
        >
          {visibleSymbols.map((symbol, i) => (
            <div key={`${i}-${symbol}`} className="min-h-0 min-w-0 bg-[#131722]">
              <TradingViewChart
                symbol={symbol}
                index={i}
                timeRange={TIME_RANGES[timeRangeIndex]}
                refreshKey={refreshKey}
                isFocused={i === focusedChart}
                onFocus={() => setFocusedChart(i)}
                onSymbolChange={(s) => handleSymbolChange(i, s)}
              />
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
