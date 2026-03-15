"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  AreaSeries,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";

export interface TimeRange {
  label: string;
  interval: string;
  range: string;
}

export const TIME_RANGES: TimeRange[] = [
  { label: "1D", interval: "5m", range: "1d" },
  { label: "1W", interval: "30m", range: "5d" },
  { label: "1M", interval: "1d", range: "1mo" },
  { label: "3M", interval: "1d", range: "3mo" },
  { label: "1Y", interval: "1wk", range: "1y" },
];

interface TradingViewChartProps {
  symbol: string;
  displayName: string;
  index: number;
  timeRange: TimeRange;
  refreshKey: number;
  isFocused: boolean;
  onFocus: () => void;
  onSymbolChange: (symbol: string) => void;
}

interface ChartDataPoint {
  time: Time;
  value: number;
}

function getBorderColor(changePercent: number | null): string {
  if (changePercent === null) return "#00C805";
  if (changePercent > 0) return "#00C805";
  if (changePercent < 0) return "#FF3B30";
  return "#888888";
}

function ChangeBadge({ changePercent }: { changePercent: number | null }) {
  if (changePercent === null) return null;
  const isPositive = changePercent >= 0;
  const color = isPositive ? "#00C805" : "#FF3B30";
  const bg = isPositive ? "#00C80520" : "#FF3B3020";
  const border = isPositive ? "#00C80540" : "#FF3B3040";
  const sign = isPositive ? "+" : "";
  return (
    <span
      className="ml-1 rounded px-1 py-px text-[10px] font-medium"
      style={{ color, backgroundColor: bg, border: `1px solid ${border}` }}
    >
      {sign}
      {changePercent.toFixed(2)}%
    </span>
  );
}

export default function TradingViewChart({
  symbol,
  displayName,
  index,
  timeRange,
  refreshKey,
  isFocused,
  onFocus,
  onSymbolChange,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceLineRef = useRef<any>(null);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(symbol);
  const [changePercent, setChangePercent] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch chart data from our API proxy
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/chart?symbol=${encodeURIComponent(symbol)}&interval=${timeRange.interval}&range=${timeRange.range}`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      const chartData: ChartDataPoint[] = data.chartData || [];
      const prevClose: number | null = data.prevClose ?? null;

      setChangePercent(data.changePercent ?? null);

      if (seriesRef.current && chartRef.current) {
        seriesRef.current.setData(chartData);

        // Remove existing price line before adding new one
        if (priceLineRef.current && seriesRef.current) {
          seriesRef.current.removePriceLine(priceLineRef.current);
          priceLineRef.current = null;
        }
        if (prevClose !== null) {
          priceLineRef.current = seriesRef.current.createPriceLine({
            price: prevClose,
            color: "#FF6B8A",
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: "",
          });
        } else {
          priceLineRef.current = null;
        }

        chartRef.current.timeScale().fitContent();
      }
    } catch {
      setError("データ取得エラー");
    } finally {
      setLoading(false);
    }
  }, [symbol, timeRange]);

  // Create chart
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor: "#9B9EA3",
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1e222d" },
        horzLines: { color: "#1e222d" },
      },
      crosshair: {
        vertLine: { color: "#758696", labelBackgroundColor: "#2a2e39" },
        horzLine: { color: "#758696", labelBackgroundColor: "#2a2e39" },
      },
      rightPriceScale: {
        borderColor: "#1e222d",
      },
      timeScale: {
        borderColor: "#1e222d",
        timeVisible: true,
        secondsVisible: false,
      },
      width: container.clientWidth,
      height: container.clientHeight,
    });

    chartRef.current = chart;

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: "#2962FF",
      topColor: "rgba(41, 98, 255, 0.28)",
      bottomColor: "rgba(41, 98, 255, 0.0)",
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: "#2962FF",
      crosshairMarkerBackgroundColor: "#131722",
    });

    seriesRef.current = areaSeries;

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []); // chart created once

  // Fetch data when symbol, timeRange, or refreshKey changes
  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const handleSubmit = () => {
    const trimmed = input.trim().toUpperCase();
    if (trimmed && trimmed !== symbol) {
      onSymbolChange(trimmed);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") {
      setInput(symbol);
      setEditing(false);
    }
  };

  // Sync input when symbol changes externally
  useEffect(() => {
    setInput(symbol);
  }, [symbol]);

  const borderColor = getBorderColor(changePercent);

  return (
    <div
      className={`relative flex h-full w-full flex-col ${
        isFocused ? "ring-1 ring-blue-500" : ""
      }`}
      style={{ borderTop: `2px solid ${borderColor}` }}
      onClick={onFocus}
    >
      {/* Symbol header */}
      <div className="flex h-7 shrink-0 items-center gap-1 bg-[#1e222d] px-2">
        {editing ? (
          <div className="flex flex-1 items-center gap-1">
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSubmit}
              placeholder="NASDAQ:AAPL"
              className="h-5 flex-1 rounded border border-zinc-600 bg-[#131722] px-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500"
            />
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
              className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] text-white hover:bg-blue-500"
            >
              OK
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setInput(symbol);
                setEditing(true);
              }}
              className="truncate text-xs font-medium text-zinc-300 hover:text-white"
              title={`${symbol} — クリックして銘柄を変更`}
            >
              {displayName || symbol}
            </button>
            <ChangeBadge changePercent={changePercent} />
          </div>
        )}
      </div>

      {/* Chart area */}
      <div className="relative min-h-0 flex-1">
        <div ref={chartContainerRef} className="absolute inset-0" />

        {/* Loading overlay */}
        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-xs text-zinc-500">読み込み中...</div>
          </div>
        )}

        {/* Error overlay */}
        {error && !loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-xs text-red-400">{error}</div>
          </div>
        )}
      </div>
    </div>
  );
}
