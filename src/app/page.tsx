"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import TradingViewChart, { TIME_RANGES } from "@/components/TradingViewChart";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// --- Types & Constants ---

interface WatchlistItem {
  symbol: string;
  name: string;
  displayName: string;
}

interface WatchlistGroup {
  id: string;
  name: string;
  items: WatchlistItem[];
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

const DEFAULT_GROUPS: WatchlistGroup[] = [
  {
    id: "us-stocks",
    name: "米国株",
    items: [
      { symbol: "NASDAQ:AAPL", name: "Apple", displayName: "" },
      { symbol: "NASDAQ:NVDA", name: "NVIDIA", displayName: "" },
      { symbol: "NASDAQ:MSFT", name: "Microsoft", displayName: "" },
      { symbol: "NASDAQ:GOOGL", name: "Alphabet", displayName: "" },
      { symbol: "NASDAQ:AMZN", name: "Amazon", displayName: "" },
      { symbol: "NASDAQ:META", name: "Meta", displayName: "" },
    ],
  },
  {
    id: "jp-stocks",
    name: "日本株・指数",
    items: [
      { symbol: "NYSE:TM", name: "トヨタ (ADR)", displayName: "" },
      { symbol: "NYSE:SONY", name: "ソニー (ADR)", displayName: "" },
      { symbol: "NYSE:TSM", name: "TSMC", displayName: "" },
      { symbol: "日経平均", name: "日経225", displayName: "日経225" },
    ],
  },
  {
    id: "others",
    name: "その他",
    items: [],
  },
];

const STORAGE_KEY = "tradingview-charts-state";
const STORAGE_VERSION_KEY = "tradingview-charts-version";
const STORAGE_VERSION = "v11";

const QUICK_ADD_ITEMS: WatchlistItem[] = [
  { symbol: "日経平均", name: "日経225", displayName: "日経225" },
  { symbol: "S&P500", name: "S&P 500", displayName: "S&P 500" },
  { symbol: "BTC", name: "ビットコイン", displayName: "ビットコイン" },
  { symbol: "GOLD", name: "ゴールド", displayName: "ゴールド" },
  { symbol: "VIX", name: "恐怖指数", displayName: "恐怖指数" },
];

interface AppState {
  symbols: string[];
  layoutIndex: number;
  groups: WatchlistGroup[];
  collapsedGroups: string[]; // group ids that are collapsed
  displayNames: Record<string, string>;
}

// Resolve symbol to display name via API
async function resolveDisplayName(symbol: string): Promise<string> {
  try {
    const res = await fetch(
      `/api/resolve?symbol=${encodeURIComponent(symbol)}`
    );
    const data = await res.json();
    return data.shortName || symbol;
  } catch {
    return symbol;
  }
}

// Check if input is a Japanese stock code (4-5 digit number)
function isJapaneseStockCode(input: string): boolean {
  return /^\d{4,5}$/.test(input.trim());
}

// Convert input to proper symbol (4-5 digit → append .T)
function normalizeSymbolInput(input: string): string {
  const trimmed = input.trim();
  if (isJapaneseStockCode(trimmed)) {
    return `${trimmed}.T`;
  }
  return trimmed;
}

function generateGroupId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

// --- Search result type ---
interface SearchSuggestion {
  symbol: string;
  name: string;
  exchange: string;
}

// --- Context Menu Component ---
interface ContextMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  separator?: boolean;
}

function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-[180px] rounded border border-zinc-700 bg-zinc-800 py-1 shadow-xl"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.separator && (
            <div className="mx-2 my-1 border-t border-zinc-700" />
          )}
          <button
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            disabled={item.disabled}
            className={`flex w-full px-3 py-1.5 text-left text-xs ${
              item.disabled
                ? "cursor-default text-zinc-600"
                : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
            }`}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}

// --- Add Menu (top-level + button) ---
function AddMenu({
  onAddSymbol,
  onAddGroup,
  onClose,
  anchorRef,
}: {
  onAddSymbol: () => void;
  onAddGroup: () => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={menuRef}
      className="absolute left-0 right-0 z-40 rounded border border-zinc-600 bg-[#1e222d] py-1 shadow-xl"
      style={{ top: "100%" }}
    >
      <button
        onClick={() => {
          onAddSymbol();
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-[#2a2e39] hover:text-white"
      >
        <span className="text-blue-400">+</span> 銘柄を追加
      </button>
      <button
        onClick={() => {
          onAddGroup();
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-[#2a2e39] hover:text-white"
      >
        <span className="text-green-400">+</span> グループを追加
      </button>
    </div>
  );
}

// --- Sortable Item Component ---
function SortableWatchlistItem({
  item,
  itemId,
  groupId,
  displayNames,
  editingId,
  setEditingId,
  onSelect,
  onUpdateDisplayName,
  onRemoveItem,
  onContextMenu,
  isDragOverlay,
}: {
  item: WatchlistItem;
  itemId: string;
  groupId: string;
  displayNames: Record<string, string>;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onSelect: (symbol: string) => void;
  onUpdateDisplayName: (groupId: string, itemIndex: number, newName: string) => void;
  onRemoveItem: (groupId: string, itemIndex: number) => void;
  onContextMenu: (e: React.MouseEvent, groupId: string, itemIndex: number) => void;
  isDragOverlay?: boolean;
}) {
  const itemIndex = parseInt(itemId.split(":")[1], 10);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const label =
    item.displayName ||
    displayNames[item.symbol] ||
    item.name ||
    item.symbol;
  const isEditing = editingId === item.symbol && !isDragOverlay;

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={isDragOverlay ? { opacity: 0.9 } : style}
      className={`group flex cursor-pointer items-center gap-1 py-1.5 pl-1 pr-3 hover:bg-[#2a2e39] ${
        isDragOverlay ? "rounded border border-blue-500/50 bg-[#1e222d] shadow-lg" : ""
      }`}
      onClick={() => {
        if (!isEditing && !isDragOverlay) onSelect(item.symbol);
      }}
      onContextMenu={(e) => {
        if (!isDragOverlay) onContextMenu(e, groupId, itemIndex);
      }}
    >
      {/* Drag handle */}
      <span
        className={`flex-shrink-0 cursor-grab text-[10px] text-zinc-600 active:cursor-grabbing ${
          isDragOverlay ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
        onClick={(e) => e.stopPropagation()}
      >
        ⠿
      </span>
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <input
            autoFocus
            defaultValue={label}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                const val = (e.target as HTMLInputElement).value.trim();
                if (val) onUpdateDisplayName(groupId, itemIndex, val);
                setEditingId(null);
              }
              if (e.key === "Escape") setEditingId(null);
            }}
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val && val !== label) onUpdateDisplayName(groupId, itemIndex, val);
              setEditingId(null);
            }}
            className="h-5 w-full rounded border border-blue-500 bg-[#131722] px-1 text-xs text-zinc-200 outline-none"
          />
        ) : (
          <>
            <div
              className="truncate text-xs font-medium text-zinc-200 hover:text-blue-400"
              onClick={(e) => {
                e.stopPropagation();
                if (!isDragOverlay) setEditingId(item.symbol);
              }}
              title="クリックして名前を編集 / 右クリックでメニュー"
              style={{ cursor: "text" }}
            >
              {label}
            </div>
            {label !== item.symbol && (
              <div className="truncate text-[10px] text-zinc-500">
                {item.symbol}
              </div>
            )}
          </>
        )}
      </div>
      {!isDragOverlay && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemoveItem(groupId, itemIndex);
          }}
          className="hidden text-xs text-zinc-500 hover:text-red-400 group-hover:block"
          title="削除"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// --- Sortable Group Header ---
function SortableGroupHeader({
  group,
  isCollapsed,
  isEditingGroup,
  setEditingGroupId,
  onToggleGroup,
  setAddingToGroupId,
  onRenameGroup,
  onContextMenu,
}: {
  group: WatchlistGroup;
  isCollapsed: boolean;
  isEditingGroup: boolean;
  setEditingGroupId: (id: string | null) => void;
  onToggleGroup: (id: string) => void;
  setAddingToGroupId: (id: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onContextMenu: (e: React.MouseEvent, groupId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `group:${group.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex cursor-pointer items-center gap-1 border-b border-zinc-700/50 bg-[#1a1e2e] px-2 py-1.5 hover:bg-[#252932]"
      onClick={() => onToggleGroup(group.id)}
      onContextMenu={(e) => onContextMenu(e, group.id)}
    >
      {/* Drag handle for group */}
      <span
        className="flex-shrink-0 cursor-grab text-[10px] text-zinc-600 opacity-0 active:cursor-grabbing group-hover:opacity-100"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        ⠿
      </span>
      <span className="text-[10px] text-zinc-500">
        {isCollapsed ? "▶" : "▼"}
      </span>
      {isEditingGroup ? (
        <input
          autoFocus
          defaultValue={group.name}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              const val = (e.target as HTMLInputElement).value.trim();
              if (val) onRenameGroup(group.id, val);
              setEditingGroupId(null);
            }
            if (e.key === "Escape") setEditingGroupId(null);
          }}
          onBlur={(e) => {
            const val = e.target.value.trim();
            if (val && val !== group.name) onRenameGroup(group.id, val);
            setEditingGroupId(null);
          }}
          className="h-5 min-w-0 flex-1 rounded border border-blue-500 bg-[#131722] px-1 text-xs text-zinc-200 outline-none"
        />
      ) : (
        <span
          className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-400"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditingGroupId(group.id);
          }}
          title="ダブルクリックで名前を編集 / 右クリックでメニュー"
        >
          {group.name}
          <span className="ml-1 text-[10px] text-zinc-600">
            ({group.items.length})
          </span>
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setAddingToGroupId(group.id);
        }}
        className="hidden rounded px-1 text-xs text-zinc-500 hover:bg-[#363a45] hover:text-white group-hover:block"
        title="このグループに銘柄を追加"
      >
        +
      </button>
    </div>
  );
}

// --- Watchlist Sidebar ---

function WatchlistSidebar({
  groups,
  collapsedGroups,
  onSelect,
  onAddToGroup,
  onRemoveItem,
  onUpdateDisplayName,
  onMoveItem,
  onReorderItem,
  onReorderGroups,
  onToggleGroup,
  onRenameGroup,
  onDeleteGroup,
  onAddGroup,
  displayNames,
  open,
  onToggle,
}: {
  groups: WatchlistGroup[];
  collapsedGroups: string[];
  onSelect: (symbol: string) => void;
  onAddToGroup: (groupId: string, item: WatchlistItem) => void;
  onRemoveItem: (groupId: string, itemIndex: number) => void;
  onUpdateDisplayName: (groupId: string, itemIndex: number, newName: string) => void;
  onMoveItem: (fromGroupId: string, itemIndex: number, toGroupId: string) => void;
  onReorderItem: (groupId: string, fromIndex: number, toIndex: number) => void;
  onReorderGroups: (fromIndex: number, toIndex: number) => void;
  onToggleGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, newName: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onAddGroup: (name: string) => void;
  displayNames: Record<string, string>;
  open: boolean;
  onToggle: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [addError, setAddError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [addingToGroupId, setAddingToGroupId] = useState<string | null>(null);
  const [showTopMenu, setShowTopMenu] = useState(false);
  const [addingNewGroup, setAddingNewGroup] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "item" | "group";
    groupId: string;
    itemIndex?: number;
  } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overGroupId, setOverGroupId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topMenuBtnRef = useRef<HTMLButtonElement | null>(null);

  // All items flattened for duplicate checking
  const allItems = groups.flatMap((g) => g.items);

  // dnd-kit sensors - require 5px move before starting drag
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Generate unique item IDs: "groupId:index"
  const getItemId = (groupId: string, index: number) => `${groupId}:${index}`;
  const parseItemId = (id: string) => {
    const parts = id.split(":");
    return { groupId: parts[0], index: parseInt(parts[1], 10) };
  };

  // All sortable IDs (groups + items)
  const groupIds = groups.map((g) => `group:${g.id}`);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) {
      setOverGroupId(null);
      return;
    }

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    // Only highlight group for item drags
    if (activeIdStr.startsWith("group:")) {
      setOverGroupId(null);
      return;
    }

    // Find what group the over target belongs to
    if (overIdStr.startsWith("group:")) {
      setOverGroupId(overIdStr.replace("group:", ""));
    } else {
      const { groupId } = parseItemId(overIdStr);
      setOverGroupId(groupId);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverGroupId(null);

    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    // --- Group reordering ---
    if (activeIdStr.startsWith("group:") && overIdStr.startsWith("group:")) {
      const fromGroupId = activeIdStr.replace("group:", "");
      const toGroupId = overIdStr.replace("group:", "");
      if (fromGroupId !== toGroupId) {
        const fromIdx = groups.findIndex((g) => g.id === fromGroupId);
        const toIdx = groups.findIndex((g) => g.id === toGroupId);
        if (fromIdx !== -1 && toIdx !== -1) {
          onReorderGroups(fromIdx, toIdx);
        }
      }
      return;
    }

    // --- Item drag ---
    if (activeIdStr.startsWith("group:")) return; // group dragged onto item, ignore

    const activeData = parseItemId(activeIdStr);

    // Dropped on a group header
    if (overIdStr.startsWith("group:")) {
      const targetGroupId = overIdStr.replace("group:", "");
      if (activeData.groupId !== targetGroupId) {
        onMoveItem(activeData.groupId, activeData.index, targetGroupId);
      }
      return;
    }

    // Dropped on another item
    const overData = parseItemId(overIdStr);

    if (activeData.groupId === overData.groupId) {
      // Same group: reorder
      if (activeData.index !== overData.index) {
        onReorderItem(activeData.groupId, activeData.index, overData.index);
      }
    } else {
      // Different group: move
      onMoveItem(activeData.groupId, activeData.index, overData.groupId);
    }
  };

  // Find active item for DragOverlay
  const getActiveItem = (): { item: WatchlistItem; groupId: string; itemId: string } | null => {
    if (!activeId || activeId.startsWith("group:")) return null;
    const { groupId, index } = parseItemId(activeId);
    const group = groups.find((g) => g.id === groupId);
    if (!group || !group.items[index]) return null;
    return { item: group.items[index], groupId, itemId: activeId };
  };

  // Debounced search
  const doSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(query.trim())}`
      );
      const data = await res.json();
      setSuggestions(data.results || []);
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setAddError("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length >= 2) {
      debounceRef.current = setTimeout(() => doSearch(value), 300);
    } else {
      setSuggestions([]);
    }
  };

  const addItemToGroup = (item: WatchlistItem) => {
    const targetGroupId = addingToGroupId || groups[0]?.id;
    if (targetGroupId) {
      onAddToGroup(targetGroupId, item);
    }
    setSearchQuery("");
    setSuggestions([]);
    setAddError("");
    setAddingToGroupId(null);
  };

  const handleSuggestionClick = (s: SearchSuggestion) => {
    const exists = allItems.some(
      (w) => w.symbol.toUpperCase() === s.symbol.toUpperCase()
    );
    if (exists) {
      setAddError("この銘柄は既に追加されています");
      return;
    }
    addItemToGroup({ symbol: s.symbol, name: s.name, displayName: s.name });
  };

  const handleSearchKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      if (suggestions.length > 0) {
        handleSuggestionClick(suggestions[0]);
        return;
      }

      const rawInput = searchQuery.trim();
      const normalized = normalizeSymbolInput(rawInput);

      const exists = allItems.some(
        (w) => w.symbol.toUpperCase() === normalized.toUpperCase()
      );
      if (exists) {
        setAddError("この銘柄は既に追加されています");
        return;
      }

      setSearching(true);
      setAddError("");
      try {
        const res = await fetch(
          `/api/validate?symbol=${encodeURIComponent(normalized)}`
        );
        const data = await res.json();
        if (data.valid) {
          const symbol = data.symbol || normalized;
          const apiName = await resolveDisplayName(symbol);
          addItemToGroup({
            symbol: symbol,
            name: apiName,
            displayName: apiName,
          });
        } else {
          setAddError("この銘柄は見つかりませんでした");
        }
      } catch {
        setAddError("検索中にエラーが発生しました");
      } finally {
        setSearching(false);
      }
    }
    if (e.key === "Escape") {
      setSuggestions([]);
      setSearchQuery("");
      setAddingToGroupId(null);
    }
  };

  const handleQuickAdd = (item: WatchlistItem) => {
    const exists = allItems.some(
      (w) => w.symbol.toUpperCase() === item.symbol.toUpperCase()
    );
    if (!exists) {
      const targetGroupId = groups[groups.length - 1]?.id || groups[0]?.id;
      if (targetGroupId) {
        onAddToGroup(targetGroupId, item);
      }
    }
  };

  const handleItemContextMenu = (
    e: React.MouseEvent,
    groupId: string,
    itemIndex: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type: "item", groupId, itemIndex });
  };

  const handleGroupContextMenu = (e: React.MouseEvent, groupId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type: "group", groupId });
  };

  const showSuggestions =
    suggestions.length > 0 && searchQuery.trim().length >= 2;

  // Build context menu items
  const getContextMenuItems = (): ContextMenuItem[] => {
    if (!contextMenu) return [];

    if (contextMenu.type === "group") {
      const group = groups.find((g) => g.id === contextMenu.groupId);
      const canDelete = group && group.items.length === 0;
      return [
        {
          label: "グループ名を編集",
          onClick: () => setEditingGroupId(contextMenu.groupId),
        },
        {
          label: "グループを削除",
          onClick: () => onDeleteGroup(contextMenu.groupId),
          disabled: !canDelete,
          separator: true,
        },
      ];
    }

    // Item context menu: flat list with move targets + separator + delete
    const menuItems: ContextMenuItem[] = [];

    groups.forEach((g) => {
      const isCurrent = g.id === contextMenu.groupId;
      menuItems.push({
        label: `移動: ${g.name}`,
        onClick: () => {
          if (contextMenu.itemIndex !== undefined) {
            onMoveItem(contextMenu.groupId, contextMenu.itemIndex, g.id);
          }
        },
        disabled: isCurrent,
      });
    });

    menuItems.push({
      label: "削除",
      separator: true,
      onClick: () => {
        if (contextMenu.itemIndex !== undefined) {
          onRemoveItem(contextMenu.groupId, contextMenu.itemIndex);
        }
      },
    });

    return menuItems;
  };

  const activeItemData = getActiveItem();

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
        {/* Header with add button */}
        <div className="relative flex h-8 items-center justify-between px-3">
          <span className="text-xs font-semibold text-zinc-300">
            ウォッチリスト
          </span>
          <button
            ref={topMenuBtnRef}
            onClick={() => setShowTopMenu((p) => !p)}
            className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-[#2a2e39] hover:text-white"
            title="追加"
          >
            +
          </button>
          {showTopMenu && (
            <AddMenu
              anchorRef={topMenuBtnRef}
              onAddSymbol={() => {
                setAddingToGroupId(groups[0]?.id || null);
              }}
              onAddGroup={() => setAddingNewGroup(true)}
              onClose={() => setShowTopMenu(false)}
            />
          )}
        </div>

        {/* Add new group input */}
        {addingNewGroup && (
          <div className="px-3 pb-1">
            <input
              autoFocus
              placeholder="グループ名"
              className="h-7 w-full rounded border border-green-500 bg-[#131722] px-2 text-xs text-zinc-200 outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val) onAddGroup(val);
                  setAddingNewGroup(false);
                }
                if (e.key === "Escape") setAddingNewGroup(false);
              }}
              onBlur={(e) => {
                const val = e.target.value.trim();
                if (val) onAddGroup(val);
                setAddingNewGroup(false);
              }}
            />
          </div>
        )}

        {/* Search box (shown when adding to a specific group) */}
        {addingToGroupId && (
          <div className="relative px-3 pb-1">
            <div className="mb-1 text-[10px] text-blue-400">
              「{groups.find((g) => g.id === addingToGroupId)?.name}」に追加
              <button
                onClick={() => setAddingToGroupId(null)}
                className="ml-1 text-zinc-500 hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="証券コード or ティッカー（例: 7011, AAPL, BTC）"
              className="h-7 w-full rounded border border-zinc-600 bg-[#131722] px-2 text-xs text-zinc-200 outline-none focus:border-blue-500"
            />

            {showSuggestions && (
              <div className="absolute left-3 right-3 z-30 rounded border border-zinc-600 bg-[#1a1e2e] shadow-lg" style={{ top: "calc(100% - 4px)" }}>
                {suggestions.map((s, i) => {
                  const exists = allItems.some(
                    (w) => w.symbol.toUpperCase() === s.symbol.toUpperCase()
                  );
                  return (
                    <button
                      key={`${s.symbol}-${i}`}
                      onClick={() => handleSuggestionClick(s)}
                      disabled={exists}
                      className={`flex w-full items-start gap-2 px-2 py-1.5 text-left ${
                        exists ? "cursor-default opacity-40" : "hover:bg-[#2a2e39]"
                      } ${i > 0 ? "border-t border-zinc-700/50" : ""}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] font-medium text-blue-400">{s.symbol}</span>
                          {exists && <span className="text-[9px] text-zinc-500">追加済</span>}
                        </div>
                        <div className="truncate text-[10px] text-zinc-400">{s.name}</div>
                      </div>
                      <span className="shrink-0 text-[9px] text-zinc-600">{s.exchange}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {searching && searchQuery.trim().length >= 2 && (
              <div className="absolute left-3 right-3 z-30 rounded border border-zinc-600 bg-[#1a1e2e] px-2 py-2 text-[10px] text-zinc-500 shadow-lg" style={{ top: "calc(100% - 4px)" }}>
                検索中...
              </div>
            )}
          </div>
        )}

        {/* Error message */}
        {addError && (
          <div className="px-3 pb-1">
            <div className="rounded bg-red-900/30 px-2 py-1 text-[10px] text-red-400">
              {addError}
            </div>
          </div>
        )}

        {/* Groups with DnD */}
        <div className="flex-1 overflow-y-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
              {groups.map((group) => {
                const isCollapsed = collapsedGroups.includes(group.id);
                const isEditingGrp = editingGroupId === group.id;
                const isHighlighted = overGroupId === group.id && activeId && !activeId.startsWith("group:");
                const itemIds = group.items.map((_, idx) => getItemId(group.id, idx));

                return (
                  <div
                    key={group.id}
                    className={isHighlighted ? "bg-blue-900/20 ring-1 ring-inset ring-blue-500/30" : ""}
                  >
                    <SortableGroupHeader
                      group={group}
                      isCollapsed={isCollapsed}
                      isEditingGroup={isEditingGrp}
                      setEditingGroupId={setEditingGroupId}
                      onToggleGroup={onToggleGroup}
                      setAddingToGroupId={setAddingToGroupId}
                      onRenameGroup={onRenameGroup}
                      onContextMenu={handleGroupContextMenu}
                    />

                    {!isCollapsed && (
                      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                        {group.items.map((item, itemIdx) => (
                          <SortableWatchlistItem
                            key={getItemId(group.id, itemIdx)}
                            item={item}
                            itemId={getItemId(group.id, itemIdx)}
                            groupId={group.id}
                            displayNames={displayNames}
                            editingId={editingId}
                            setEditingId={setEditingId}
                            onSelect={onSelect}
                            onUpdateDisplayName={onUpdateDisplayName}
                            onRemoveItem={onRemoveItem}
                            onContextMenu={handleItemContextMenu}
                          />
                        ))}
                        {group.items.length === 0 && (
                          <div className="py-2 pl-5 text-[10px] text-zinc-600">
                            銘柄がありません
                          </div>
                        )}
                      </SortableContext>
                    )}
                  </div>
                );
              })}
            </SortableContext>

            {/* Drag overlay */}
            <DragOverlay>
              {activeItemData ? (
                <SortableWatchlistItem
                  item={activeItemData.item}
                  itemId={activeItemData.itemId}
                  groupId={activeItemData.groupId}
                  displayNames={displayNames}
                  editingId={null}
                  setEditingId={() => {}}
                  onSelect={() => {}}
                  onUpdateDisplayName={() => {}}
                  onRemoveItem={() => {}}
                  onContextMenu={() => {}}
                  isDragOverlay
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Quick add section */}
        <div className="shrink-0 border-t border-zinc-700 px-3 py-2">
          <div className="mb-1 text-[10px] font-medium text-zinc-500">
            よく使う銘柄
          </div>
          <div className="flex flex-wrap gap-1">
            {QUICK_ADD_ITEMS.map((item) => {
              const exists = allItems.some(
                (w) => w.symbol.toUpperCase() === item.symbol.toUpperCase()
              );
              return (
                <button
                  key={item.symbol}
                  onClick={() => handleQuickAdd(item)}
                  disabled={exists}
                  className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                    exists
                      ? "cursor-default bg-zinc-700/50 text-zinc-600"
                      : "bg-[#2a2e39] text-zinc-400 hover:bg-[#363a45] hover:text-zinc-200"
                  }`}
                  title={item.name}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

// --- Main Page ---

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [symbols, setSymbols] = useState<string[]>(
    DEFAULT_SYMBOLS.slice(0, 4)
  );
  const [layoutIndex, setLayoutIndex] = useState(2); // default 4 charts
  const [groups, setGroups] = useState<WatchlistGroup[]>(DEFAULT_GROUPS);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
  const [focusedChart, setFocusedChart] = useState(0);
  const [fullscreenChart, setFullscreenChart] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [timeRangeIndex, setTimeRangeIndex] = useState(0); // default 1D
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState("");
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  // Load from localStorage on mount
  useEffect(() => {
    const saved = loadState();
    if (saved) {
      setSymbols(saved.symbols);
      setLayoutIndex(saved.layoutIndex);
      if (saved.groups) setGroups(saved.groups);
      if (saved.collapsedGroups) setCollapsedGroups(saved.collapsedGroups);
      if (saved.displayNames) setDisplayNames(saved.displayNames);
    }
    setMounted(true);
  }, []);

  // On mount, resolve missing displayNames for watchlist items and chart symbols
  useEffect(() => {
    if (!mounted) return;

    const symbolsToResolve = new Set<string>();

    // Check all group items
    for (const group of groups) {
      for (const item of group.items) {
        if (!item.displayName && !displayNames[item.symbol]) {
          symbolsToResolve.add(item.symbol);
        }
      }
    }

    // Check chart symbols
    for (const sym of symbols) {
      if (!displayNames[sym]) {
        symbolsToResolve.add(sym);
      }
    }

    if (symbolsToResolve.size === 0) return;

    const resolveAll = async () => {
      const newNames: Record<string, string> = {};
      const syms = Array.from(symbolsToResolve);
      for (let i = 0; i < syms.length; i++) {
        const sym = syms[i];
        const name = await resolveDisplayName(sym);
        newNames[sym] = name;
        if (i < syms.length - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      setDisplayNames((prev) => ({ ...prev, ...newNames }));

      // Update group items that are missing displayName
      setGroups((prev) =>
        prev.map((group) => ({
          ...group,
          items: group.items.map((item) => {
            if (!item.displayName && newNames[item.symbol]) {
              return { ...item, displayName: newNames[item.symbol] };
            }
            return item;
          }),
        }))
      );
    };

    resolveAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Save to localStorage on state change
  useEffect(() => {
    if (!mounted) return;
    saveState({ symbols, layoutIndex, groups, collapsedGroups, displayNames });
  }, [symbols, layoutIndex, groups, collapsedGroups, displayNames, mounted]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!mounted) return;
    setLastUpdated(new Date().toLocaleTimeString("ja-JP"));

    refreshIntervalRef.current = setInterval(() => {
      setRefreshKey((k) => k + 1);
      setLastUpdated(new Date().toLocaleTimeString("ja-JP"));
    }, 30000);

    return () => {
      if (refreshIntervalRef.current)
        clearInterval(refreshIntervalRef.current);
    };
  }, [mounted]);

  const layout = LAYOUTS[layoutIndex];

  const handleLayoutChange = useCallback((newIndex: number) => {
    const newLayout = LAYOUTS[newIndex];
    setLayoutIndex(newIndex);
    setSymbols((prev) => {
      if (prev.length >= newLayout.count)
        return prev.slice(0, newLayout.count);
      const extra = [];
      for (let i = prev.length; i < newLayout.count; i++) {
        extra.push(DEFAULT_SYMBOLS[i % DEFAULT_SYMBOLS.length]);
      }
      return [...prev, ...extra];
    });
    setFocusedChart((prev) => (prev >= newLayout.count ? 0 : prev));
  }, []);

  const handleSymbolChange = useCallback(
    (index: number, newSymbol: string) => {
      const normalized = normalizeSymbolInput(newSymbol);
      setSymbols((prev) => {
        const next = [...prev];
        next[index] = normalized;
        return next;
      });
      if (!displayNames[normalized]) {
        resolveDisplayName(normalized).then((name) => {
          setDisplayNames((prev) => ({ ...prev, [normalized]: name }));
        });
      }
    },
    [displayNames]
  );

  const handleWatchlistSelect = useCallback(
    (symbol: string) => {
      const target = focusedChart >= 0 ? focusedChart : 0;
      handleSymbolChange(target, symbol);
    },
    [focusedChart, handleSymbolChange]
  );

  const handleAddToGroup = useCallback(
    (groupId: string, item: WatchlistItem) => {
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId ? { ...g, items: [...g.items, item] } : g
        )
      );
      if (item.displayName) {
        setDisplayNames((prev) => ({
          ...prev,
          [item.symbol]: item.displayName,
        }));
      }
    },
    []
  );

  const handleRemoveItem = useCallback(
    (groupId: string, itemIndex: number) => {
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, items: g.items.filter((_, i) => i !== itemIndex) }
            : g
        )
      );
    },
    []
  );

  const handleUpdateDisplayName = useCallback(
    (groupId: string, itemIndex: number, newName: string) => {
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g;
          const newItems = g.items.map((item, i) =>
            i === itemIndex ? { ...item, displayName: newName } : item
          );
          const item = g.items[itemIndex];
          if (item) {
            setDisplayNames((dn) => ({ ...dn, [item.symbol]: newName }));
          }
          return { ...g, items: newItems };
        })
      );
    },
    []
  );

  const handleMoveItem = useCallback(
    (fromGroupId: string, itemIndex: number, toGroupId: string) => {
      setGroups((prev) => {
        const fromGroup = prev.find((g) => g.id === fromGroupId);
        if (!fromGroup) return prev;
        const item = fromGroup.items[itemIndex];
        if (!item) return prev;

        return prev.map((g) => {
          if (g.id === fromGroupId) {
            return { ...g, items: g.items.filter((_, i) => i !== itemIndex) };
          }
          if (g.id === toGroupId) {
            return { ...g, items: [...g.items, item] };
          }
          return g;
        });
      });
    },
    []
  );

  const handleToggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  }, []);

  const handleRenameGroup = useCallback(
    (groupId: string, newName: string) => {
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, name: newName } : g))
      );
    },
    []
  );

  const handleDeleteGroup = useCallback((groupId: string) => {
    setGroups((prev) => {
      const group = prev.find((g) => g.id === groupId);
      if (!group || group.items.length > 0) return prev;
      return prev.filter((g) => g.id !== groupId);
    });
    setCollapsedGroups((prev) => prev.filter((id) => id !== groupId));
  }, []);

  const handleAddGroup = useCallback((name: string) => {
    const newGroup: WatchlistGroup = {
      id: generateGroupId(),
      name,
      items: [],
    };
    setGroups((prev) => [...prev, newGroup]);
  }, []);

  const handleReorderItem = useCallback(
    (groupId: string, fromIndex: number, toIndex: number) => {
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g;
          return { ...g, items: arrayMove(g.items, fromIndex, toIndex) };
        })
      );
    },
    []
  );

  const handleReorderGroups = useCallback(
    (fromIndex: number, toIndex: number) => {
      setGroups((prev) => arrayMove(prev, fromIndex, toIndex));
    },
    []
  );

  // Close fullscreen on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreenChart !== null) {
        setFullscreenChart(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [fullscreenChart]);

  // Don't render charts until client-side hydration is complete
  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#131722] text-zinc-500">
        読み込み中...
      </div>
    );
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
          groups={groups}
          collapsedGroups={collapsedGroups}
          onSelect={handleWatchlistSelect}
          onAddToGroup={handleAddToGroup}
          onRemoveItem={handleRemoveItem}
          onUpdateDisplayName={handleUpdateDisplayName}
          onMoveItem={handleMoveItem}
          onReorderItem={handleReorderItem}
          onReorderGroups={handleReorderGroups}
          onToggleGroup={handleToggleGroup}
          onRenameGroup={handleRenameGroup}
          onDeleteGroup={handleDeleteGroup}
          onAddGroup={handleAddGroup}
          displayNames={displayNames}
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
            <div
              key={`${i}-${symbol}`}
              className="min-h-0 min-w-0 bg-[#131722]"
              onDoubleClick={() => setFullscreenChart(i)}
            >
              <TradingViewChart
                symbol={symbol}
                displayName={displayNames[symbol] || ""}
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

      {/* Fullscreen chart modal */}
      {fullscreenChart !== null && visibleSymbols[fullscreenChart] && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
          onClick={() => setFullscreenChart(null)}
        >
          <div
            className="relative"
            style={{ width: "90vw", height: "90vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setFullscreenChart(null)}
              className="absolute -right-2 -top-2 z-10 rounded-full bg-zinc-700 px-2 py-1 text-sm text-zinc-300 shadow-lg hover:bg-zinc-600 hover:text-white"
              title="閉じる (Esc)"
            >
              ✕
            </button>
            <TradingViewChart
              symbol={visibleSymbols[fullscreenChart]}
              displayName={displayNames[visibleSymbols[fullscreenChart]] || ""}
              index={fullscreenChart}
              timeRange={TIME_RANGES[timeRangeIndex]}
              refreshKey={refreshKey}
              isFocused={true}
              onFocus={() => {}}
              onSymbolChange={(s) => handleSymbolChange(fullscreenChart, s)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
