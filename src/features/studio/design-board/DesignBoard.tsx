import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  FileText,
  GitCommitHorizontal,
  Layers,
  Link2,
  ListOrdered,
  Maximize2,
  MessageSquareQuote,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  Unlink,
  X,
  Zap,
} from 'lucide-react';
import type { AssetItem } from '../asset-library/assetLibraryModel';
import {
  collectNumericBoardParameters,
  computeLoopEdgeIds,
  resolveActionControl,
  resolvePlaybackSettings,
} from '../playtest/boardPlayEngine';
import { COPY, type Language } from '../../../shared/i18n';
import {
  type ScopedStateVariable,
  type StateVariable,
  type StateVariableValue,
} from '../properties/stateModel';
import {
  CARD_EXPANDED_WIDTH,
  COMBO_FRAME_DEFAULT_HEIGHT,
  COMBO_FRAME_DEFAULT_WIDTH,
  COMBO_FRAME_MIN_HEIGHT,
  COMBO_FRAME_MIN_WIDTH,
  GROUP_HEADER_HEIGHT,
  GROUP_MIN_HEIGHT,
  GROUP_MIN_WIDTH,
  NODE_CATALOG,
  formatActionControlKey,
  getCollapsedAncestorGroup,
  getDescendantNodeIds,
  getGroupDefId,
  getNodeAssetIds,
  getNodeDepth,
  getNodeDimensions,
  isActionInsideComboFrame,
  isDescendantOf,
  resolveEdgeType,
  resolveGroupCode,
  type BoardComboFrame,
  type BoardEdge,
  type BoardNode,
  type CardFieldConfig,
  type EdgeType,
  type NodeKind,
} from './studioModel';
import type { EdgeConditionGroup } from './arrowConditionModel';
import { StateManagerPanel } from '../properties/StateManagerPanel';
import { ArrowConditionBuilder } from './ArrowConditionBuilder';
import { GroupInfoModal } from './GroupInfoModal';
import { GroupDirectoryPanel } from './GroupDirectoryPanel';
import { CardExpandedPanel } from './cards/CardExpandedPanel';
import { CardPromptFront } from './cards/CardPromptFront';

interface DesignBoardProps {
  lang: Language;
  nodes: BoardNode[];
  edges: BoardEdge[];
  comboFrames: BoardComboFrame[];
  assetItems: AssetItem[];
  scopedVariables: ScopedStateVariable[];
  stateManagerOpen: boolean;
  focusTarget: { nodeId?: string; edgeId?: string; nonce: number } | null;
  selectedNodeId: string | null;
  autoFocusNodeId: string | null;
  activePlayNodeIds: string[];
  activePlayEdgeId: string | null;
  placementCounts: Record<string, number>;
  onLocateStage: (nodeId: string) => void;
  onToggleStageTemplate: (nodeId: string) => void;
  onToggleStageReset: (nodeId: string) => void;
  activePlayEdgeIds?: string[];
  onSelectNode: (id: string | null) => void;
  onConsumeAutoFocus: () => void;
  onDragNode: (id: string, dx: number, dy: number) => void;
  onCommitNodeDrop: (id: string) => void;
  onResizeGroup: (
    id: string,
    rect: { x?: number; y?: number; width: number; height: number },
  ) => void;
  onCommitGroupResize: (id: string) => void;
  onToggleGroupCollapse: (id: string) => void;
  onDuplicateNode: (id: string, mode?: 'duplicate' | 'reuse') => void;
  onDetachGroupInstance: (id: string) => void;
  onRemoveReusedPlacement: (id: string) => void;
  onUngroupDefinition: (defId: string) => void;
  onDeleteGroupDefinition: (defId: string) => void;
  onUpdateNode: (
    id: string,
    patch: Partial<
      Pick<BoardNode, 'groupCode' | 'title' | 'note' | 'assetId' | 'assetIds' | 'promptInput'>
    >,
  ) => void;
  onUpdateNodeField: <K extends keyof CardFieldConfig>(
    id: string,
    key: K,
    value: CardFieldConfig[K],
  ) => void;
  onResetNodeAutoFields: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onAddNodeAt: (kind: NodeKind, worldX: number, worldY: number, outcomeMode?: 'property'|'visual') => void;
  onAddComboFrame: (x: number, y: number, width?: number, height?: number) => string;
  onUpdateComboFrame: (id: string, patch: Partial<BoardComboFrame>) => void;
  onDeleteComboFrame: (id: string) => void;
  onConnectNodes: (
    fromId: string | null,
    toId: string,
    entryOffset?: { dx: number; dy: number },
  ) => string | null;
  onUpdateEntryEdgeOffset: (
    edgeId: string,
    entryOffset: { dx: number; dy: number },
  ) => void;
  onUpdateEdgeCondition: (
    edgeId: string,
    condition: string,
    conditionGroup?: EdgeConditionGroup,
    options?: { scope?: 'single' | 'shared' },
  ) => void;
  onBranchFromSharedCondition: (sourceEdgeId: string, targetId: string) => string | null;
  onLinkEdgeToSharedCondition: (edgeId: string, donorEdgeId: string) => void;
  onDetachSharedCondition: (edgeId: string, clearDetachedEdge?: boolean) => void;
  onUpdateEdgeType: (edgeId: string, edgeType: EdgeType) => void;
  onDeleteEdge: (edgeId: string) => void;
  onToggleStateManager: (open?: boolean) => void;
  onAddGlobalVariable: (variable: StateVariable) => void;
  onAddAssetProperty: (assetId: string, variable: StateVariable) => void;
  onUpdateVariable: (
    scope: 'global' | 'asset',
    assetId: string | undefined,
    variable: StateVariable,
  ) => void;
  onMoveVariableScope: (
    fromScope: 'global' | 'asset',
    fromAssetId: string | undefined,
    toScope: 'global' | 'asset',
    toAssetId: string | undefined,
    variable: StateVariable,
  ) => void;
  onDeleteVariable: (
    scope: 'global' | 'asset',
    assetId: string | undefined,
    variableId: string,
  ) => void;
  onUpdatePlayValue: (variableId: string, value: StateVariableValue) => void;
  onApplyPlayToInitial: (entry: ScopedStateVariable) => void;
  onResetPlayValue: (variableId: string) => void;
  onResetAllPlayValues: () => void;
  onJumpToAssetProperty: (assetId: string, variableId: string) => void;
  onLocateBoardReference: (target: { nodeId?: string; edgeId?: string }) => void;
}

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.8;

function clampZoom(z: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(z * 100) / 100));
}

function renderKindIcon(kind: NodeKind, color: string) {
  const props = {
    className: 'w-3.5 h-3.5 shrink-0',
    style: { color },
    'aria-hidden': true as const,
  };
  switch (kind) {
    case 'narration':
      return <BookOpen {...props} />;
    case 'dialogue':
      return <MessageSquareQuote {...props} />;
    case 'challenge':
      return <AlertTriangle {...props} />;
    case 'action':
      return <Zap {...props} />;
    case 'outcome':
      return <Award {...props} />;
    case 'group':
      return <Layers {...props} />;
    case 'draft':
      return <StickyNote {...props} />;
  }
}

interface EdgePathResult {
  path: string;
  midX: number;
  midY: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

function getEntryEdgeGeometry(
  edge: BoardEdge,
  to: BoardNode,
  expandedNodeId: string | null = null,
): EdgePathResult {
  const toBase = getNodeDimensions(to);
  const toDim = {
    width:
      expandedNodeId === to.id && NODE_CATALOG[to.kind].isPlayable
        ? CARD_EXPANDED_WIDTH
        : toBase.width,
    height: toBase.height,
  };
  const offset = edge.entryOffset ?? { dx: -136, dy: Math.round(toDim.height / 2) };
  const startX = to.x + offset.dx;
  const startY = to.y + offset.dy;
  const toCx = to.x + toDim.width / 2;
  const toCy = to.y + toDim.height / 2;
  const dx = toCx - startX;
  const dy = toCy - startY;

  if (Math.abs(dx) >= Math.abs(dy) * 0.55) {
    const endX = dx >= 0 ? to.x : to.x + toDim.width;
    const endY = toCy;
    const curveOffset = Math.max(36, Math.abs(endX - startX) * 0.42);
    const c1x = dx >= 0 ? startX + curveOffset : startX - curveOffset;
    const c2x = dx >= 0 ? endX - curveOffset : endX + curveOffset;
    const midX = 0.125 * startX + 0.375 * c1x + 0.375 * c2x + 0.125 * endX;
    const midY = 0.125 * startY + 0.375 * startY + 0.375 * endY + 0.125 * endY;
    return {
      path: `M ${startX} ${startY} C ${c1x} ${startY}, ${c2x} ${endY}, ${endX} ${endY}`,
      midX,
      midY,
      startX,
      startY,
      endX,
      endY,
    };
  }

  const endX = toCx;
  const endY = dy >= 0 ? to.y : to.y + toDim.height;
  const curveOffset = Math.max(32, Math.abs(endY - startY) * 0.42);
  const c1y = dy >= 0 ? startY + curveOffset : startY - curveOffset;
  const c2y = dy >= 0 ? endY - curveOffset : endY + curveOffset;
  const midX = 0.125 * startX + 0.375 * startX + 0.375 * endX + 0.125 * endX;
  const midY = 0.125 * startY + 0.375 * c1y + 0.375 * c2y + 0.125 * endY;
  return {
    path: `M ${startX} ${startY} C ${startX} ${c1y}, ${endX} ${c2y}, ${endX} ${endY}`,
    midX,
    midY,
    startX,
    startY,
    endX,
    endY,
  };
}

function getEdgeGeometry(
  from: BoardNode,
  to: BoardNode,
  isLoop: boolean,
  expandedNodeId: string | null = null,
): EdgePathResult {
  const fromBase = getNodeDimensions(from);
  const toBase = getNodeDimensions(to);
  const fromDim = {
    width:
      expandedNodeId === from.id && NODE_CATALOG[from.kind].isPlayable
        ? CARD_EXPANDED_WIDTH
        : fromBase.width,
    height: fromBase.height,
  };
  const toDim = {
    width:
      expandedNodeId === to.id && NODE_CATALOG[to.kind].isPlayable
        ? CARD_EXPANDED_WIDTH
        : toBase.width,
    height: toBase.height,
  };

  const fromCx = from.x + fromDim.width / 2;
  const fromCy = from.y + fromDim.height / 2;
  const toCx = to.x + toDim.width / 2;
  const toCy = to.y + toDim.height / 2;

  if (isLoop) {
    const goAbove = fromCy < 175;
    const startX = fromCx;
    const startY = goAbove ? from.y : from.y + fromDim.height;
    const endX = toCx;
    const endY = goAbove ? to.y : to.y + toDim.height;

    const span = Math.abs(startX - endX);
    const arcLift = Math.min(180, Math.max(88, span * 0.24));
    const ctrlY = goAbove
      ? Math.min(startY, endY) - arcLift
      : Math.max(startY, endY) + arcLift;

    const c1x = startX;
    const c1y = ctrlY;
    const c2x = endX;
    const c2y = ctrlY;

    const midX = 0.125 * startX + 0.375 * c1x + 0.375 * c2x + 0.125 * endX;
    const midY = 0.125 * startY + 0.375 * c1y + 0.375 * c2y + 0.125 * endY;

    return {
      path: `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`,
      midX,
      midY,
      startX,
      startY,
      endX,
      endY,
    };
  }

  const dx = toCx - fromCx;
  const dy = toCy - fromCy;

  if (Math.abs(dx) >= Math.abs(dy) * 0.65) {
    const startX = dx >= 0 ? from.x + fromDim.width : from.x;
    const startY = fromCy;
    const endX = dx >= 0 ? to.x : to.x + toDim.width;
    const endY = toCy;
    const offset = Math.max(46, Math.abs(endX - startX) * 0.42);
    const c1x = dx >= 0 ? startX + offset : startX - offset;
    const c2x = dx >= 0 ? endX - offset : endX + offset;

    const midX = 0.125 * startX + 0.375 * c1x + 0.375 * c2x + 0.125 * endX;
    const midY = 0.125 * startY + 0.375 * startY + 0.375 * endY + 0.125 * endY;

    return {
      path: `M ${startX} ${startY} C ${c1x} ${startY}, ${c2x} ${endY}, ${endX} ${endY}`,
      midX,
      midY,
      startX,
      startY,
      endX,
      endY,
    };
  }

  const startX = fromCx;
  const startY = dy >= 0 ? from.y + fromDim.height : from.y;
  const endX = toCx;
  const endY = dy >= 0 ? to.y : to.y + toDim.height;
  const offset = Math.max(40, Math.abs(endY - startY) * 0.42);
  const c1y = dy >= 0 ? startY + offset : startY - offset;
  const c2y = dy >= 0 ? endY - offset : endY + offset;

  const midX = 0.125 * startX + 0.375 * startX + 0.375 * endX + 0.125 * endX;
  const midY = 0.125 * startY + 0.375 * c1y + 0.375 * c2y + 0.125 * endY;

  return {
    path: `M ${startX} ${startY} C ${startX} ${c1y}, ${endX} ${c2y}, ${endX} ${endY}`,
    midX,
    midY,
    startX,
    startY,
    endX,
    endY,
  };
}

function buildSmoothCubicPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): EdgePathResult {
  const dx = endX - startX;
  const dy = endY - startY;
  if (Math.abs(dx) >= Math.abs(dy) * 0.55) {
    const offset = Math.max(32, Math.abs(dx) * 0.42);
    const c1x = dx >= 0 ? startX + offset : startX - offset;
    const c2x = dx >= 0 ? endX - offset : endX + offset;
    const midX = 0.125 * startX + 0.375 * c1x + 0.375 * c2x + 0.125 * endX;
    const midY = 0.125 * startY + 0.375 * startY + 0.375 * endY + 0.125 * endY;
    return {
      path: `M ${startX} ${startY} C ${c1x} ${startY}, ${c2x} ${endY}, ${endX} ${endY}`,
      midX,
      midY,
      startX,
      startY,
      endX,
      endY,
    };
  }
  const offset = Math.max(28, Math.abs(dy) * 0.42);
  const c1y = dy >= 0 ? startY + offset : startY - offset;
  const c2y = dy >= 0 ? endY - offset : endY + offset;
  const midX = 0.125 * startX + 0.375 * startX + 0.375 * endX + 0.125 * endX;
  const midY = 0.125 * startY + 0.375 * c1y + 0.375 * c2y + 0.125 * endY;
  return {
    path: `M ${startX} ${startY} C ${startX} ${c1y}, ${endX} ${c2y}, ${endX} ${endY}`,
    midX,
    midY,
    startX,
    startY,
    endX,
    endY,
  };
}

function getAnchorPointToward(
  node: BoardNode,
  towardX: number,
  towardY: number,
  expandedNodeId: string | null = null,
): { x: number; y: number } {
  const base = getNodeDimensions(node);
  const w =
    expandedNodeId === node.id && NODE_CATALOG[node.kind].isPlayable
      ? CARD_EXPANDED_WIDTH
      : base.width;
  const h = base.height;
  const cx = node.x + w / 2;
  const cy = node.y + h / 2;
  const dx = towardX - cx;
  const dy = towardY - cy;
  if (Math.abs(dx) >= Math.abs(dy) * 0.55) {
    return { x: dx >= 0 ? node.x + w : node.x, y: cy };
  }
  return { x: cx, y: dy >= 0 ? node.y + h : node.y };
}

const NARRATIVE_KINDS: NodeKind[] = ['narration', 'dialogue'];
const GAMEPLAY_KINDS: NodeKind[] = ['challenge', 'action'];

export function DesignBoard({
  lang,
  nodes,
  edges,
  comboFrames,
  assetItems,
  scopedVariables,
  stateManagerOpen,
  focusTarget,
  selectedNodeId,
  autoFocusNodeId,
  activePlayNodeIds,
  activePlayEdgeId,
  placementCounts,
  onLocateStage,
  onToggleStageTemplate,
  onToggleStageReset,
  activePlayEdgeIds,
  onSelectNode,
  onConsumeAutoFocus,
  onDragNode,
  onCommitNodeDrop,
  onResizeGroup,
  onCommitGroupResize,
  onToggleGroupCollapse,
  onDuplicateNode,
  onDetachGroupInstance,
  onRemoveReusedPlacement,
  onUngroupDefinition,
  onDeleteGroupDefinition,
  onUpdateNode,
  onUpdateNodeField,
  onResetNodeAutoFields,
  onDeleteNode,
  onAddNodeAt,
  onAddComboFrame,
  onUpdateComboFrame,
  onDeleteComboFrame,
  onConnectNodes,
  onUpdateEntryEdgeOffset,
  onUpdateEdgeCondition,
  onBranchFromSharedCondition,
  onLinkEdgeToSharedCondition,
  onDetachSharedCondition,
  onUpdateEdgeType,
  onDeleteEdge,
  onToggleStateManager,
  onAddGlobalVariable,
  onAddAssetProperty,
  onUpdateVariable,
  onMoveVariableScope,
  onDeleteVariable,
  onUpdatePlayValue,
  onApplyPlayToInitial,
  onResetPlayValue,
  onResetAllPlayValues,
  onJumpToAssetProperty,
  onLocateBoardReference,
}: DesignBoardProps) {
  const t = COPY[lang].studio.board;
  const st = COPY[lang].studio.states;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [highlightedEdgeId, setHighlightedEdgeId] = useState<string | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

  const [pan, setPan] = useState({ x: 48, y: 150 });
  const [zoom, setZoom] = useState(0.92);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const [freshFocusNodeId, setFreshFocusNodeId] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [editingGroupInfo, setEditingGroupInfo] = useState<{
    id: string;
    focusField: 'code' | 'title' | 'note';
  } | null>(null);
  const [groupDirectoryOpen, setGroupDirectoryOpen] = useState(false);
  const [groupCopyMenuId, setGroupCopyMenuId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const actionCardElements = useRef(new Map<string, HTMLDivElement>());
  const [multiSelectedActionIds, setMultiSelectedActionIds] = useState<string[]>([]);
  const [nodeContextMenu, setNodeContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [edgeContextMenu, setEdgeContextMenu] = useState<{
    edgeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [isConnectMode, setIsConnectMode] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState<
    | { kind: 'node'; nodeId: string; side: 'left' | 'right' }
    | { kind: 'air'; worldX: number; worldY: number }
    | { kind: 'shared-condition'; sourceEdgeId: string; hubX: number; hubY: number }
    | null
  >(null);
  const connectingFromId = connectingFrom?.kind === 'node' ? connectingFrom.nodeId : null;
  const isConnectingActive = isConnectMode || Boolean(connectingFrom);
  const [connectPointerWorld, setConnectPointerWorld] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [boardSize, setBoardSize] = useState({ width: 720, height: 560 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const syncSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const nextW = Math.round(rect.width);
        const nextH = Math.round(rect.height);
        setBoardSize((prev) =>
          prev.width === nextW && prev.height === nextH
            ? prev
            : { width: nextW, height: nextH },
        );
      }
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const exitConnectMode = useCallback(() => {
    setIsConnectMode(false);
    setConnectingFrom(null);
    setConnectPointerWorld(null);
    portDragRef.current = null;
    airDragRef.current = null;
  }, []);

  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
  const [resizingGroupId, setResizingGroupId] = useState<string | null>(null);
  const [draggingComboId, setDraggingComboId] = useState<string | null>(null);
  const [resizingComboId, setResizingComboId] = useState<string | null>(null);
  const [draggingEntryEdgeId, setDraggingEntryEdgeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const panDragRef = useRef<{
    startClientX: number;
    startClientY: number;
    origPanX: number;
    origPanY: number;
  } | null>(null);

  const nodeDragRef = useRef<{
    id: string;
    lastClientX: number;
    lastClientY: number;
    moved: boolean;
  } | null>(null);

  const groupResizeRef = useRef<{
    id: string;
    dir: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const comboDragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const comboResizeRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const portDragRef = useRef<{
    fromNodeId: string;
    startClientX: number;
    startClientY: number;
    moved: boolean;
  } | null>(null);

  const airDragRef = useRef<{
    worldX: number;
    worldY: number;
    startClientX: number;
    startClientY: number;
    moved: boolean;
    wasAlreadyAir: boolean;
  } | null>(null);

  const entryTailDragRef = useRef<{
    edgeId: string;
    toX: number;
    toY: number;
  } | null>(null);

  const activePlaySet = useMemo(() => new Set(activePlayNodeIds), [activePlayNodeIds]);
  const activePlayEdgeSet = useMemo(() => {
    const set = new Set<string>(activePlayEdgeIds ?? []);
    if (activePlayEdgeId) set.add(activePlayEdgeId);
    return set;
  }, [activePlayEdgeId, activePlayEdgeIds]);
  const loopEdgeIds = useMemo(() => computeLoopEdgeIds(nodes, edges), [nodes, edges]);
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const edgeMap = useMemo(() => new Map(edges.map((e) => [e.id, e])), [edges]);

  // Immediately focus newly added blank card (or open Group Design Notes modal for a new Group) & keep it visible
  useEffect(() => {
    if (!autoFocusNodeId) return;
    const target = nodeMap.get(autoFocusNodeId);
    if (target?.kind === 'group') {
      setEditingNodeId(null);
      setFreshFocusNodeId(null);
      setExpandedNodeId(null);
      setEditingGroupInfo({ id: target.id, focusField: 'note' });
    } else {
      setEditingNodeId(autoFocusNodeId);
      setFreshFocusNodeId(autoFocusNodeId);
      setExpandedNodeId(null);
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (target && rect && rect.width > 0 && rect.height > 0) {
      const dim = getNodeDimensions(target);
      const left = target.x * zoom + pan.x;
      const right = (target.x + dim.width) * zoom + pan.x;
      const top = target.y * zoom + pan.y;
      const bottom = (target.y + dim.height) * zoom + pan.y;

      const padLeft = 28;
      const padRight = 28;
      const padTop = 104;
      const padBottom = 76;

      let dx = 0;
      let dy = 0;
      if (right > rect.width - padRight) {
        dx = rect.width - padRight - right;
      }
      if (left + dx < padLeft) {
        dx = padLeft - left;
      }
      if (bottom > rect.height - padBottom) {
        dy = rect.height - padBottom - bottom;
      }
      if (top + dy < padTop) {
        dy = padTop - top;
      }

      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        setPan((prev) => ({
          x: Math.round(prev.x + dx),
          y: Math.round(prev.y + dy),
        }));
      }
    }

    onConsumeAutoFocus();
  }, [autoFocusNodeId, nodeMap, onConsumeAutoFocus, pan.x, pan.y, zoom]);
  const numericBoardParameters = useMemo(
    () => collectNumericBoardParameters(nodes),
    [nodes],
  );
  const groupDefCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of nodes) {
      if (n.kind !== 'group') continue;
      const defId = getGroupDefId(n);
      counts.set(defId, (counts.get(defId) ?? 0) + 1);
    }
    return counts;
  }, [nodes]);
  const groupCountTotal = groupDefCounts.size;
  const dirtyVarCount = useMemo(
    () => scopedVariables.filter((v) => v.isDirty).length,
    [scopedVariables],
  );

  // Smoothly pan & highlight a target card or arrow when located from State Manager
  useEffect(() => {
    if (!focusTarget) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    let worldCx: number | null = null;
    let worldCy: number | null = null;

    if (focusTarget.nodeId) {
      const targetNode = nodeMap.get(focusTarget.nodeId);
      if (targetNode) {
        const dim = getNodeDimensions(targetNode);
        worldCx = targetNode.x + dim.width / 2;
        worldCy = targetNode.y + dim.height / 2;
        onSelectNode(targetNode.id);
        setHighlightedNodeId(targetNode.id);
      }
    } else if (focusTarget.edgeId) {
      const targetEdge = edgeMap.get(focusTarget.edgeId);
      if (targetEdge) {
        const to = nodeMap.get(targetEdge.toId);
        if (targetEdge.fromId === null && to) {
          const geom = getEntryEdgeGeometry(targetEdge, to);
          worldCx = geom.midX;
          worldCy = geom.midY;
          setHighlightedEdgeId(targetEdge.id);
        } else if (targetEdge.fromId) {
          const from = nodeMap.get(targetEdge.fromId);
          if (from && to) {
            const geom = getEdgeGeometry(from, to, loopEdgeIds.has(targetEdge.id));
            worldCx = geom.midX;
            worldCy = geom.midY;
            setHighlightedEdgeId(targetEdge.id);
          }
        }
      }
    }

    if (worldCx !== null && worldCy !== null) {
      const targetZoom = Math.max(0.88, zoom);
      setZoom(targetZoom);
      setPan({
        x: Math.round(rect.width / 2 - worldCx * targetZoom),
        y: Math.round(rect.height / 2 - worldCy * targetZoom),
      });
    }

    const timer = window.setTimeout(() => {
      setHighlightedNodeId(null);
      setHighlightedEdgeId(null);
    }, 1800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget]);

  const clientToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan.x, pan.y, zoom],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        if (target.closest('[data-board-overlay="true"], [data-card-popover="true"]')) {
          return;
        }
        let cursor: HTMLElement | null = target;
        while (cursor && cursor !== el) {
          const style = window.getComputedStyle(cursor);
          const overflowY = style.overflowY;
          if (
            (overflowY === 'auto' || overflowY === 'scroll') &&
            cursor.scrollHeight > cursor.clientHeight + 2
          ) {
            return;
          }
          cursor = cursor.parentElement;
        }
      }
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 1.09 : 0.92;

      setZoom((prevZoom) => {
        const nextZoom = clampZoom(prevZoom * factor);
        if (nextZoom === prevZoom) return prevZoom;

        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        setPan((prevPan) => {
          const worldX = (mouseX - prevPan.x) / prevZoom;
          const worldY = (mouseY - prevPan.y) / prevZoom;
          return {
            x: Math.round(mouseX - worldX * nextZoom),
            y: Math.round(mouseY - worldY * nextZoom),
          };
        });

        return nextZoom;
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        exitConnectMode();
        setEditingNodeId(null);
        setExpandedNodeId(null);
        setEditingEdgeId(null);
        setEditingGroupInfo(null);
        setGroupDirectoryOpen(false);
        setGroupCopyMenuId(null);
        setEdgeContextMenu(null);
        setNodeContextMenu(null);
        setMultiSelectedActionIds([]);
        setAddMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exitConnectMode]);

  useEffect(() => {
    setMultiSelectedActionIds((prev) => {
      if (prev.length === 0) return prev;
      const validIds = prev.filter((id) => {
        const n = nodeMap.get(id);
        return Boolean(n && n.kind === 'action' && !getCollapsedAncestorGroup(id, nodeMap));
      });
      return validIds.length === prev.length ? prev : validIds;
    });
  }, [nodeMap]);

  const handleFitView = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || nodes.length === 0) {
      setPan({ x: 48, y: 150 });
      setZoom(0.92);
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach((n) => {
      if (getCollapsedAncestorGroup(n.id, nodeMap)) return;
      const dim = getNodeDimensions(n);
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y - 50);
      maxX = Math.max(maxX, n.x + dim.width);
      maxY = Math.max(maxY, n.y + dim.height + 54);
    });

    const contentW = Math.max(320, maxX - minX);
    const contentH = Math.max(240, maxY - minY);
    const padX = 56;
    const padTop = 148;
    const padBottom = 72;

    const fitZoom = clampZoom(
      Math.min(
        1.0,
        (rect.width - padX * 2) / contentW,
        (rect.height - padTop - padBottom) / contentH,
      ),
    );

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setZoom(fitZoom);
    setPan({
      x: Math.round(rect.width / 2 - centerX * fitZoom),
      y: Math.round((rect.height + padTop - padBottom) / 2 - centerY * fitZoom),
    });
  }, [nodeMap, nodes]);

  const completeAirTriggerToNode = useCallback(
    (node: BoardNode, originWorldX: number, originWorldY: number, wasDragged: boolean) => {
      const dim = getNodeDimensions(node);
      const cardWidth = expandedNodeId === node.id ? CARD_EXPANDED_WIDTH : dim.width;
      const dxRaw = originWorldX - node.x;
      const dyRaw = originWorldY - node.y;
      const tooClose = !wasDragged && Math.hypot(dxRaw, dyRaw) < 48;
      const entryOffset = tooClose
        ? { dx: -136, dy: Math.round(dim.height / 2) }
        : {
            dx:
              dxRaw >= 0 && dxRaw <= cardWidth && dyRaw >= 0 && dyRaw <= dim.height
                ? -136
                : Math.round(dxRaw),
            dy: Math.round(dyRaw),
          };
      const createdId = onConnectNodes(null, node.id, entryOffset);
      exitConnectMode();
      if (createdId) {
        setEditingEdgeId(createdId);
      }
    },
    [exitConnectMode, expandedNodeId, onConnectNodes],
  );

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    setEdgeContextMenu(null);
    setNodeContextMenu(null);
    if (event.target !== event.currentTarget) return;
    if (event.button !== 0) return;

    onSelectNode(null);
    setMultiSelectedActionIds([]);
    setEditingNodeId(null);
    setExpandedNodeId(null);
    setEditingEdgeId(null);
    setEditingGroupInfo(null);
    setGroupDirectoryOpen(false);
    setGroupCopyMenuId(null);
    setAddMenuOpen(false);

    if (isConnectMode && (!connectingFrom || connectingFrom.kind === 'air')) {
      const worldPt = clientToWorld(event.clientX, event.clientY);
      const wasAlreadyAir = connectingFrom?.kind === 'air';
      setConnectingFrom({ kind: 'air', worldX: worldPt.x, worldY: worldPt.y });
      setConnectPointerWorld(worldPt);
      airDragRef.current = {
        worldX: worldPt.x,
        worldY: worldPt.y,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
        wasAlreadyAir,
      };
      return;
    }

    if (isConnectingActive) {
      exitConnectMode();
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    panDragRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
    };
    setIsPanning(true);
  };

  const applyGroupResizeMove = useCallback(
    (clientX: number, clientY: number) => {
      const r = groupResizeRef.current;
      if (!r) return;
      const dx = (clientX - r.startClientX) / zoom;
      const dy = (clientY - r.startClientY) / zoom;

      let nextX = r.startX;
      let nextY = r.startY;
      let nextW = r.startW;
      let nextH = r.startH;

      if (r.dir.includes('e')) {
        nextW = Math.max(GROUP_MIN_WIDTH, r.startW + dx);
      }
      if (r.dir.includes('s')) {
        nextH = Math.max(GROUP_MIN_HEIGHT, r.startH + dy);
      }
      if (r.dir.includes('w')) {
        const clampedW = Math.max(GROUP_MIN_WIDTH, r.startW - dx);
        nextX = r.startX + (r.startW - clampedW);
        nextW = clampedW;
      }
      if (r.dir.includes('n')) {
        const clampedH = Math.max(GROUP_MIN_HEIGHT, r.startH - dy);
        nextY = r.startY + (r.startH - clampedH);
        nextH = clampedH;
      }

      onResizeGroup(r.id, { x: nextX, y: nextY, width: nextW, height: nextH });
    },
    [onResizeGroup, zoom],
  );

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (portDragRef.current) {
      const dx = event.clientX - portDragRef.current.startClientX;
      const dy = event.clientY - portDragRef.current.startClientY;
      if (Math.hypot(dx, dy) > 6) {
        portDragRef.current.moved = true;
      }
    }

    if (airDragRef.current) {
      const dx = event.clientX - airDragRef.current.startClientX;
      const dy = event.clientY - airDragRef.current.startClientY;
      if (Math.hypot(dx, dy) > 8) {
        airDragRef.current.moved = true;
      }
    }

    if (entryTailDragRef.current) {
      const worldPt = clientToWorld(event.clientX, event.clientY);
      const tDrag = entryTailDragRef.current;
      onUpdateEntryEdgeOffset(tDrag.edgeId, {
        dx: worldPt.x - tDrag.toX,
        dy: worldPt.y - tDrag.toY,
      });
      return;
    }

    if (connectingFrom) {
      setConnectPointerWorld(clientToWorld(event.clientX, event.clientY));
    }

    if (comboResizeRef.current) {
      const cr = comboResizeRef.current;
      const dx = (event.clientX - cr.startClientX) / zoom;
      const dy = (event.clientY - cr.startClientY) / zoom;
      onUpdateComboFrame(cr.id, {
        width: Math.max(COMBO_FRAME_MIN_WIDTH, cr.startW + dx),
        height: Math.max(COMBO_FRAME_MIN_HEIGHT, cr.startH + dy),
      });
      return;
    }

    if (comboDragRef.current) {
      const cd = comboDragRef.current;
      const dx = (event.clientX - cd.startClientX) / zoom;
      const dy = (event.clientY - cd.startClientY) / zoom;
      onUpdateComboFrame(cd.id, {
        x: Math.round(cd.origX + dx),
        y: Math.round(cd.origY + dy),
      });
      return;
    }

    if (groupResizeRef.current) {
      applyGroupResizeMove(event.clientX, event.clientY);
      return;
    }

    if (nodeDragRef.current) {
      const drag = nodeDragRef.current;
      const dx = (event.clientX - drag.lastClientX) / zoom;
      const dy = (event.clientY - drag.lastClientY) / zoom;
      drag.lastClientX = event.clientX;
      drag.lastClientY = event.clientY;
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        drag.moved = true;
      }
      onDragNode(drag.id, dx, dy);

      const draggedNode = nodeMap.get(drag.id);
      if (draggedNode) {
        const dim = getNodeDimensions(draggedNode);
        const cx = draggedNode.x + dx + dim.width / 2;
        const cy = draggedNode.y + dy + dim.height / 2;
        let bestId: string | null = null;
        let bestDepth = -1;
        let bestArea = Infinity;
        for (const candidate of nodes) {
          if (candidate.kind !== 'group' || candidate.collapsed) continue;
          if (candidate.id === draggedNode.id) continue;
          if (
            draggedNode.kind === 'group' &&
            isDescendantOf(candidate.id, draggedNode.id, nodeMap)
          ) {
            continue;
          }
          const gDim = getNodeDimensions(candidate);
          if (
            cx >= candidate.x &&
            cx <= candidate.x + gDim.width &&
            cy >= candidate.y &&
            cy <= candidate.y + gDim.height
          ) {
            const depth = getNodeDepth(candidate.id, nodeMap);
            const area = gDim.width * gDim.height;
            if (depth > bestDepth || (depth === bestDepth && area < bestArea)) {
              bestDepth = depth;
              bestArea = area;
              bestId = candidate.id;
            }
          }
        }
        setDropTargetGroupId(bestId);
      }
      return;
    }

    if (panDragRef.current) {
      const drag = panDragRef.current;
      setPan({
        x: Math.round(drag.origPanX + (event.clientX - drag.startClientX)),
        y: Math.round(drag.origPanY + (event.clientY - drag.startClientY)),
      });
    }
  };

  const handleCanvasPointerUp = useCallback(() => {
    panDragRef.current = null;
    if (nodeDragRef.current?.moved) {
      onCommitNodeDrop(nodeDragRef.current.id);
    }
    nodeDragRef.current = null;
    if (groupResizeRef.current) {
      onCommitGroupResize(groupResizeRef.current.id);
    }
    groupResizeRef.current = null;
    comboDragRef.current = null;
    comboResizeRef.current = null;
    entryTailDragRef.current = null;
    setDraggingEntryEdgeId(null);

    if (airDragRef.current) {
      const air = airDragRef.current;
      airDragRef.current = null;
      if (air.moved) {
        // Dragged from air onto empty space -> reset air origin cleanly while staying in Connect mode
        setConnectingFrom(null);
        setConnectPointerWorld(null);
      } else if (air.wasAlreadyAir) {
        // Clicked empty space a second time -> exit Connect mode
        exitConnectMode();
      }
    }

    if (portDragRef.current?.moved) {
      // Released a dragged connection onto empty canvas -> cancel cleanly
      exitConnectMode();
    }
    portDragRef.current = null;
    setDraggingNodeId(null);
    setDropTargetGroupId(null);
    setResizingGroupId(null);
    setDraggingComboId(null);
    setResizingComboId(null);
    setIsPanning(false);
  }, [exitConnectMode, onCommitGroupResize, onCommitNodeDrop]);

  // Keep Group & Combo Frame dragging/resizing and entry-dot dragging responsive even outside the board
  useEffect(() => {
    if (
      !resizingGroupId &&
      !draggingEntryEdgeId &&
      !draggingComboId &&
      !resizingComboId
    ) {
      return;
    }
    const onWindowPointerMove = (e: PointerEvent) => {
      if (comboResizeRef.current) {
        const cr = comboResizeRef.current;
        const dx = (e.clientX - cr.startClientX) / zoom;
        const dy = (e.clientY - cr.startClientY) / zoom;
        onUpdateComboFrame(cr.id, {
          width: Math.max(COMBO_FRAME_MIN_WIDTH, cr.startW + dx),
          height: Math.max(COMBO_FRAME_MIN_HEIGHT, cr.startH + dy),
        });
      } else if (comboDragRef.current) {
        const cd = comboDragRef.current;
        const dx = (e.clientX - cd.startClientX) / zoom;
        const dy = (e.clientY - cd.startClientY) / zoom;
        onUpdateComboFrame(cd.id, {
          x: Math.round(cd.origX + dx),
          y: Math.round(cd.origY + dy),
        });
      } else if (groupResizeRef.current) {
        applyGroupResizeMove(e.clientX, e.clientY);
      } else if (entryTailDragRef.current) {
        const worldPt = clientToWorld(e.clientX, e.clientY);
        const tDrag = entryTailDragRef.current;
        onUpdateEntryEdgeOffset(tDrag.edgeId, {
          dx: worldPt.x - tDrag.toX,
          dy: worldPt.y - tDrag.toY,
        });
      }
    };
    const onWindowPointerUp = () => {
      handleCanvasPointerUp();
    };
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
    };
  }, [
    applyGroupResizeMove,
    clientToWorld,
    draggingComboId,
    draggingEntryEdgeId,
    handleCanvasPointerUp,
    onUpdateComboFrame,
    onUpdateEntryEdgeOffset,
    resizingComboId,
    resizingGroupId,
    zoom,
  ]);

  const handleZoomStep = (delta: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const nextZoom = clampZoom(zoom + delta);
    if (!rect || nextZoom === zoom) {
      setZoom(nextZoom);
      return;
    }
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const worldX = (cx - pan.x) / zoom;
    const worldY = (cy - pan.y) / zoom;
    setZoom(nextZoom);
    setPan({
      x: Math.round(cx - worldX * nextZoom),
      y: Math.round(cy - worldY * nextZoom),
    });
  };

  const handleNodePointerDown = (
    node: BoardNode,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('[data-card-popover="true"]') ||
      target.closest('[data-resize-handle="true"]')
    ) {
      return;
    }

    // Shift / Cmd (Mac) / Ctrl + Left-Click anywhere on an Action card toggles multi-selection for Combo creation
    if (
      !isConnectingActive &&
      event.button === 0 &&
      node.kind === 'action' &&
      (event.shiftKey || event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault();
      event.stopPropagation();
      setAddMenuOpen(false);
      setEditingEdgeId(null);
      setEdgeContextMenu(null);
      setNodeContextMenu(null);
      setGroupCopyMenuId(null);
      const prevSelectedNode =
        selectedNodeId && selectedNodeId !== node.id ? nodeMap.get(selectedNodeId) : undefined;
      const seed =
        multiSelectedActionIds.length > 0
          ? multiSelectedActionIds
          : prevSelectedNode?.kind === 'action'
            ? [prevSelectedNode.id]
            : [];
      const exists = seed.includes(node.id);
      const next = exists ? seed.filter((id) => id !== node.id) : [...seed, node.id];
      setMultiSelectedActionIds(next);
      onSelectNode(exists ? (next[next.length - 1] ?? null) : node.id);
      return;
    }

    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea')
    ) {
      return;
    }
    event.stopPropagation();
    setAddMenuOpen(false);
    setEditingEdgeId(null);
    setEdgeContextMenu(null);
    setNodeContextMenu(null);
    setGroupCopyMenuId(null);

    // Dragging from open air inside an expanded Group in Connect mode -> start a standalone trigger arrow!
    if (
      node.kind === 'group' &&
      !node.collapsed &&
      isConnectMode &&
      (!connectingFrom || connectingFrom.kind === 'air')
    ) {
      const worldPt = clientToWorld(event.clientX, event.clientY);
      const wasAlreadyAir = connectingFrom?.kind === 'air';
      setConnectingFrom({ kind: 'air', worldX: worldPt.x, worldY: worldPt.y });
      setConnectPointerWorld(worldPt);
      airDragRef.current = {
        worldX: worldPt.x,
        worldY: worldPt.y,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
        wasAlreadyAir,
      };
      return;
    }

    if (connectingFrom?.kind === 'shared-condition') {
      const srcEdge = edgeMap.get(connectingFrom.sourceEdgeId);
      if (
        NODE_CATALOG[node.kind].isPlayable &&
        srcEdge &&
        srcEdge.fromId !== node.id
      ) {
        onBranchFromSharedCondition(connectingFrom.sourceEdgeId, node.id);
      }
      exitConnectMode();
      return;
    }

    if (connectingFrom?.kind === 'air') {
      if (NODE_CATALOG[node.kind].isPlayable) {
        completeAirTriggerToNode(
          node,
          connectingFrom.worldX,
          connectingFrom.worldY,
          Boolean(airDragRef.current?.moved),
        );
      } else {
        exitConnectMode();
      }
      return;
    }

    if (connectingFromId) {
      if (connectingFromId !== node.id && NODE_CATALOG[node.kind].isPlayable) {
        onConnectNodes(connectingFromId, node.id);
      }
      exitConnectMode();
      return;
    }

    if (isConnectMode && NODE_CATALOG[node.kind].isPlayable) {
      const dim = getNodeDimensions(node);
      const cardWidth = expandedNodeId === node.id ? CARD_EXPANDED_WIDTH : dim.width;
      const worldPt = clientToWorld(event.clientX, event.clientY);
      const side: 'left' | 'right' = worldPt.x < node.x + cardWidth / 2 ? 'left' : 'right';
      setConnectingFrom({ kind: 'node', nodeId: node.id, side });
      setConnectPointerWorld(worldPt);
      return;
    }

    if (event.button !== 0) {
      return;
    }

    setMultiSelectedActionIds([]);
    onSelectNode(node.id);
    setDraggingNodeId(node.id);
    nodeDragRef.current = {
      id: node.id,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      moved: false,
    };
  };

  const handlePortPointerDown = (
    node: BoardNode,
    side: 'left' | 'right',
    cardWidth: number,
    cardHeight: number,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    setAddMenuOpen(false);
    setEditingEdgeId(null);
    setEditingGroupInfo(null);
    setEdgeContextMenu(null);

    if (connectingFrom?.kind === 'shared-condition') {
      const srcEdge = edgeMap.get(connectingFrom.sourceEdgeId);
      if (
        NODE_CATALOG[node.kind].isPlayable &&
        srcEdge &&
        srcEdge.fromId !== node.id
      ) {
        onBranchFromSharedCondition(connectingFrom.sourceEdgeId, node.id);
      }
      exitConnectMode();
      return;
    }

    if (connectingFrom?.kind === 'air') {
      if (NODE_CATALOG[node.kind].isPlayable) {
        completeAirTriggerToNode(
          node,
          connectingFrom.worldX,
          connectingFrom.worldY,
          Boolean(airDragRef.current?.moved),
        );
      } else {
        exitConnectMode();
      }
      return;
    }

    if (connectingFrom?.kind === 'node' && connectingFrom.nodeId !== node.id) {
      onConnectNodes(connectingFrom.nodeId, node.id);
      exitConnectMode();
      return;
    }

    if (
      connectingFrom?.kind === 'node' &&
      connectingFrom.nodeId === node.id &&
      connectingFrom.side === side
    ) {
      setConnectingFrom(null);
      setConnectPointerWorld(null);
      portDragRef.current = null;
      return;
    }

    setConnectingFrom({ kind: 'node', nodeId: node.id, side });
    setConnectPointerWorld({
      x: side === 'left' ? node.x - 28 : node.x + cardWidth + 28,
      y: node.y + cardHeight / 2,
    });
    portDragRef.current = {
      fromNodeId: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    };
  };

  const handleTargetCardPointerUp = (
    node: BoardNode,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (
      airDragRef.current?.moved &&
      connectingFrom?.kind === 'air' &&
      NODE_CATALOG[node.kind].isPlayable &&
      !(node.kind === 'group' && !node.collapsed)
    ) {
      event.stopPropagation();
      completeAirTriggerToNode(node, connectingFrom.worldX, connectingFrom.worldY, true);
      return;
    }

    if (
      portDragRef.current?.moved &&
      connectingFrom?.kind === 'node' &&
      connectingFrom.nodeId !== node.id &&
      NODE_CATALOG[node.kind].isPlayable
    ) {
      event.stopPropagation();
      onConnectNodes(connectingFrom.nodeId, node.id);
      exitConnectMode();
    }
  };

  const handleAddKindInViewport = (kind: NodeKind, outcomeMode: 'property'|'visual' = 'property') => {
    const add = (kind:NodeKind,x:number,y:number) => onAddNodeAt(kind,x,y,outcomeMode);
    setAddMenuOpen(false);
    const selected = selectedNodeId ? nodeMap.get(selectedNodeId) : null;
    if (selected) {
      if (selected.kind === 'group' && !selected.collapsed && kind !== 'group') {
        const siblingCount = nodes.filter((n) => n.parentId === selected.id).length;
        add(
          kind,
          Math.round(selected.x + 24 + (siblingCount % 2) * 284),
          Math.round(selected.y + GROUP_HEADER_HEIGHT + 24 + Math.floor(siblingCount / 2) * 156),
        );
        return;
      }
      const sDim = getNodeDimensions(selected);
      add(kind, Math.round(selected.x + sDim.width + 48), Math.round(selected.y));
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      add(kind, 180, 180);
      return;
    }
    const cx = (rect.width / 2 - pan.x) / zoom - (kind === 'group' ? 240 : 122);
    const cy = ((rect.height + 80) / 2 - pan.y) / zoom - (kind === 'group' ? 140 : 64);
    const offset = nodes.length === 0 ? 0 : ((nodes.length % 4) - 1.5) * 32;
    add(kind, Math.round(cx + offset), Math.round(cy + offset * 0.6));
  };

  const createComboBoxAroundActions = useCallback(
    (actionIds: string[]) => {
      const actionNodes = actionIds
        .map((id) => nodeMap.get(id))
        .filter((n): n is BoardNode => Boolean(n && n.kind === 'action'));
      if (actionNodes.length === 0) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const n of actionNodes) {
        const dim = getNodeDimensions(n);
        const element = actionCardElements.current.get(n.id);
        const w = element?.offsetWidth ?? (expandedNodeId === n.id ? CARD_EXPANDED_WIDTH : dim.width);
        const h = element?.offsetHeight ?? dim.height;
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + w);
        maxY = Math.max(maxY, n.y + h);
      }
      const padX = 20;
      const padY = 20;
      onAddComboFrame(
        Math.round(minX - padX),
        Math.round(minY - padY),
        Math.round(maxX - minX + padX * 2),
        Math.round(maxY - minY + padY * 2),
      );
      setMultiSelectedActionIds(actionIds);
    },
    [expandedNodeId, nodeMap, onAddComboFrame],
  );

  const handleAddComboFrameInViewport = () => {
    setAddMenuOpen(false);
    setNodeContextMenu(null);
    if (multiSelectedActionIds.length >= 2) {
      createComboBoxAroundActions(multiSelectedActionIds);
      return;
    }
    const selected = selectedNodeId ? nodeMap.get(selectedNodeId) : null;
    if (selected && selected.kind === 'action') {
      createComboBoxAroundActions([selected.id]);
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      onAddComboFrame(220, 180);
      return;
    }
    const offset = comboFrames.length * 24;
    const cx = (rect.width / 2 - pan.x) / zoom - COMBO_FRAME_DEFAULT_WIDTH / 2 + offset;
    const cy = ((rect.height + 40) / 2 - pan.y) / zoom - COMBO_FRAME_DEFAULT_HEIGHT / 2 + offset;
    onAddComboFrame(Math.round(cx), Math.round(cy));
  };

  const openEdgeConditionEditor = (edge: BoardEdge) => {
    setEdgeContextMenu(null);
    setNodeContextMenu(null);
    setEditingNodeId(null);
    setExpandedNodeId(null);
    setEditingGroupInfo(null);
    setEditingEdgeId(edge.id);
  };

  const handleActionContextMenu = (
    node: BoardNode,
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    if (node.kind !== 'action') return;
    const target = event.target as HTMLElement;
    if (target.closest('input') || target.closest('textarea')) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    const x = Math.max(12, Math.min(rect.width - 252, rawX));
    const y = Math.max(12, Math.min(rect.height - 148, rawY));
    if (
      (event.shiftKey || event.metaKey || event.ctrlKey) &&
      !multiSelectedActionIds.includes(node.id)
    ) {
      const prevSelectedNode =
        selectedNodeId && selectedNodeId !== node.id ? nodeMap.get(selectedNodeId) : undefined;
      const base =
        multiSelectedActionIds.length > 0
          ? multiSelectedActionIds
          : prevSelectedNode?.kind === 'action'
            ? [prevSelectedNode.id]
            : [];
      setMultiSelectedActionIds([...base, node.id]);
    }
    setAddMenuOpen(false);
    setEditingEdgeId(null);
    setEdgeContextMenu(null);
    setGroupCopyMenuId(null);
    setNodeContextMenu({ nodeId: node.id, x, y });
  };

  const handleEdgeConditionContextMenu = (
    edge: BoardEdge,
    event: ReactMouseEvent<SVGElement | HTMLDivElement | HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    openEdgeConditionEditor(edge);
  };

  const handleEdgeContextMenu = (
    edge: BoardEdge,
    event: ReactMouseEvent<SVGElement | HTMLDivElement | HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    const x = Math.max(12, Math.min(rect.width - 208, rawX));
    const y = Math.max(12, Math.min(rect.height - 132, rawY));
    setAddMenuOpen(false);
    setEditingEdgeId(null);
    setNodeContextMenu(null);
    setEdgeContextMenu({ edgeId: edge.id, x, y });
  };

  const connectingSourceNode =
    connectingFrom?.kind === 'node' ? nodeMap.get(connectingFrom.nodeId) : null;
  const connectingSourceDim = connectingSourceNode
    ? getNodeDimensions(connectingSourceNode)
    : null;
  const connectingSourceWidth =
    connectingSourceNode && connectingSourceDim
      ? expandedNodeId === connectingSourceNode.id &&
        NODE_CATALOG[connectingSourceNode.kind].isPlayable
        ? CARD_EXPANDED_WIDTH
        : connectingSourceDim.width
      : 0;

  const visibleNodesSorted = useMemo(() => {
    const visible = nodes.filter((n) => !getCollapsedAncestorGroup(n.id, nodeMap));
    return [...visible].sort((a, b) => {
      const aIsGroup = a.kind === 'group' ? 0 : 1;
      const bIsGroup = b.kind === 'group' ? 0 : 1;
      if (aIsGroup !== bIsGroup) return aIsGroup - bIsGroup;
      return getNodeDepth(a.id, nodeMap) - getNodeDepth(b.id, nodeMap);
    });
  }, [nodeMap, nodes]);

  const computedEdges = useMemo(() => {
    return edges
      .map((edge) => {
        const rawTo = nodeMap.get(edge.toId);
        if (!rawTo) return null;
        const edgeType = resolveEdgeType(edge, nodeMap);

        if (edge.fromId === null) {
          // Hide internal standalone trigger arrow while owning Group is collapsed
          if (getCollapsedAncestorGroup(rawTo.id, nodeMap)) return null;
          const geom = getEntryEdgeGeometry(edge, rawTo, expandedNodeId);
          return {
            edge,
            edgeType: 'flow' as EdgeType,
            from: undefined as BoardNode | undefined,
            to: rawTo,
            isLoop: false,
            isEntry: true,
            ...geom,
          };
        }

        const rawFrom = nodeMap.get(edge.fromId);
        if (!rawFrom) return null;
        const from = getCollapsedAncestorGroup(rawFrom.id, nodeMap) ?? rawFrom;
        const to = getCollapsedAncestorGroup(rawTo.id, nodeMap) ?? rawTo;
        if (from.id === to.id) return null;
        const isLoop = edgeType === 'flow' && loopEdgeIds.has(edge.id);
        const geom = getEdgeGeometry(from, to, isLoop, expandedNodeId);
        return {
          edge,
          edgeType,
          from: from as BoardNode | undefined,
          to,
          isLoop,
          isEntry: false,
          ...geom,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [edges, expandedNodeId, loopEdgeIds, nodeMap]);

  const { sharedConditionGroups, groupedEdgeIdSet } = useMemo(() => {
    const byKey = new Map<string, (typeof computedEdges)[number][]>();
    for (const item of computedEdges) {
      if (item.edgeType !== 'flow' || !item.edge.sharedConditionId) continue;
      const srcKey = item.from ? item.from.id : '__entry__';
      const bucketKey = `${item.edge.sharedConditionId}::${srcKey}`;
      const list = byKey.get(bucketKey) ?? [];
      list.push(item);
      byKey.set(bucketKey, list);
    }

    const groups: {
      key: string;
      sharedId: string;
      primaryItem: (typeof computedEdges)[number];
      items: (typeof computedEdges)[number][];
      isEntry: boolean;
      srcX: number;
      srcY: number;
      hubX: number;
      hubY: number;
      trunkPath: string;
      branches: {
        item: (typeof computedEdges)[number];
        path: string;
        endX: number;
        endY: number;
      }[];
    }[] = [];
    const idSet = new Set<string>();

    for (const [key, items] of byKey.entries()) {
      if (items.length < 2) continue;
      items.forEach((i) => idSet.add(i.edge.id));
      const primaryItem = items[0];
      const isEntry = primaryItem.isEntry;

      const targetCenters = items.map((i) => {
        const dim = getNodeDimensions(i.to);
        const w =
          expandedNodeId === i.to.id && NODE_CATALOG[i.to.kind].isPlayable
            ? CARD_EXPANDED_WIDTH
            : dim.width;
        return { x: i.to.x + w / 2, y: i.to.y + dim.height / 2 };
      });
      const avgTargetCx =
        targetCenters.reduce((acc, p) => acc + p.x, 0) / targetCenters.length;
      const avgTargetCy =
        targetCenters.reduce((acc, p) => acc + p.y, 0) / targetCenters.length;

      const srcPt =
        isEntry || !primaryItem.from
          ? { x: primaryItem.startX, y: primaryItem.startY }
          : getAnchorPointToward(
              primaryItem.from,
              avgTargetCx,
              avgTargetCy,
              expandedNodeId,
            );

      const initialEnds = items.map((i) =>
        getAnchorPointToward(i.to, srcPt.x, srcPt.y, expandedNodeId),
      );
      const avgEndX =
        initialEnds.reduce((acc, p) => acc + p.x, 0) / initialEnds.length;
      const avgEndY =
        initialEnds.reduce((acc, p) => acc + p.y, 0) / initialEnds.length;

      const hubX = Math.round(srcPt.x + (avgEndX - srcPt.x) * 0.44);
      const hubY = Math.round(srcPt.y + (avgEndY - srcPt.y) * 0.44);
      const trunkPath = buildSmoothCubicPath(srcPt.x, srcPt.y, hubX, hubY).path;

      const branches = items.map((item) => {
        const endPt = getAnchorPointToward(item.to, hubX, hubY, expandedNodeId);
        const branchGeom = buildSmoothCubicPath(hubX, hubY, endPt.x, endPt.y);
        return {
          item,
          path: branchGeom.path,
          endX: endPt.x,
          endY: endPt.y,
        };
      });

      groups.push({
        key,
        sharedId: primaryItem.edge.sharedConditionId!,
        primaryItem,
        items,
        isEntry,
        srcX: srcPt.x,
        srcY: srcPt.y,
        hubX,
        hubY,
        trunkPath,
        branches,
      });
    }

    return { sharedConditionGroups: groups, groupedEdgeIdSet: idSet };
  }, [computedEdges, expandedNodeId]);

  const getCompactCardSummary = (node: BoardNode): string[] => {
    const parts: string[] = [];
    const boundCount = getNodeAssetIds(node).length;
    if (boundCount > 0) {
      parts.push(
        lang === 'zh' ? `${boundCount} 个素材` : `${boundCount} asset${boundCount > 1 ? 's' : ''}`,
      );
    }

    if (node.kind === 'narration' || node.kind === 'dialogue') {
      const pb = resolvePlaybackSettings(node);
      if (pb.mode === 'auto') {
        parts.push(`${t.playAuto} ${pb.durationSec ?? 3}${t.playSecUnit}`);
      } else if (pb.mode === 'key') {
        parts.push(`${t.playKey}: ${pb.key || 'Space'}`);
      } else {
        parts.push(t.playClick);
      }
    } else if (node.kind === 'challenge') {
      const paramCount = node.fields.relatedParameters?.length ?? 0;
      if (node.fields.relatedBehavior) {
        parts.push(lang === 'zh' ? '含行为' : 'Behavior');
      }
      if (paramCount > 0) {
        parts.push(
          lang === 'zh' ? `${paramCount} 项参数` : `${paramCount} param${paramCount > 1 ? 's' : ''}`,
        );
      }
    } else if (node.kind === 'action') {
      const ctrl = resolveActionControl(node);
      parts.push(formatActionControlKey(ctrl));
      const paramCount = node.fields.relatedParameters?.length ?? 0;
      if (paramCount > 0) {
        parts.push(
          lang === 'zh' ? `${paramCount} 项参数` : `${paramCount} param${paramCount > 1 ? 's' : ''}`,
        );
      }
    } else if (node.kind === 'outcome') {
      const ruleCount = node.fields.relatedProperties?.length ?? 0;
      if (ruleCount > 0) {
        parts.push(
          lang === 'zh' ? `${ruleCount} 项属性变化` : `${ruleCount} prop${ruleCount > 1 ? 's' : ''}`,
        );
      }
      const paramCount = node.fields.relatedParameters?.length ?? 0;
      if (paramCount > 0) {
        parts.push(
          lang === 'zh' ? `${paramCount} 项参数` : `${paramCount} param${paramCount > 1 ? 's' : ''}`,
        );
      }
    }

    return parts;
  };

  const gridSpacing = Math.max(12, 24 * zoom);

  const renderCard = (node: BoardNode) => {
    const meta = NODE_CATALOG[node.kind];
    const dim = getNodeDimensions(node);
    const kindLabel = node.kind==='outcome' ? (node.promptInput?.outcomeMode==='visual' ? (lang==='zh'?'视觉变化':'Visual outcome') : (lang==='zh'?'属性变化':'Property outcome')) : lang === 'zh' ? meta.labelZh : meta.labelEn;
    const placeholderText = lang === 'zh' ? meta.placeholderZh : meta.placeholderEn;
    const isGroup = node.kind === 'group';
    const isDraft = node.kind === 'draft';
    const isSelected = selectedNodeId === node.id;
    const isComboMember = comboFrames.some((frame) => isActionInsideComboFrame(node, frame));
    const isMultiSelected = node.kind === 'action' && multiSelectedActionIds.includes(node.id);
    const isPlaying = activePlaySet.has(node.id);
    const depth = getNodeDepth(node.id, nodeMap);

    if (isGroup) {
      const descendants = getDescendantNodeIds(node.id, nodes);
      const directChildren = nodes.filter((n) => n.parentId === node.id);
      const subGroupCount = directChildren.filter((n) => n.kind === 'group').length;
      const cardCount = directChildren.length - subGroupCount;
      const hasPlayingChild =
        isPlaying || descendants.some((dId) => activePlaySet.has(dId));
      const hasSelectedChild =
        Boolean(node.collapsed) &&
        Boolean(selectedNodeId && descendants.includes(selectedNodeId));
      const isEditingGroupTitle = editingNodeId === node.id;
      const isDragging = draggingNodeId === node.id;
      const isResizing = resizingGroupId === node.id;
      const isDropTarget = dropTargetGroupId === node.id;
      const isConnectSource = connectingFromId === node.id;
      const isConnectCandidate = Boolean(
        (isConnectMode && !connectingFrom) ||
          (connectingFrom?.kind === 'node' && connectingFrom.nodeId !== node.id) ||
          connectingFrom?.kind === 'air' ||
          (connectingFrom?.kind === 'shared-condition' &&
            edgeMap.get(connectingFrom.sourceEdgeId)?.fromId !== node.id),
      );
      const groupCode = resolveGroupCode(node, nodes);
      const groupDefId = getGroupDefId(node);
      const reusedCount = groupDefCounts.get(groupDefId) ?? 1;
      const isReusedInstance = reusedCount > 1;
      const isCopyMenuOpen = groupCopyMenuId === node.id;
      const hasGroupNote = Boolean(node.note.trim());
      const summaryParts: string[] = [];
      if (cardCount > 0) {
        summaryParts.push(
          lang === 'zh' ? `${cardCount} 张卡` : `${cardCount} card${cardCount > 1 ? 's' : ''}`,
        );
      }
      if (subGroupCount > 0) {
        summaryParts.push(
          lang === 'zh'
            ? `${subGroupCount} ${t.groupSubgroupsUnit}`
            : `${subGroupCount} ${t.groupSubgroupsUnit}`,
        );
      }
      if (summaryParts.length === 0) {
        summaryParts.push(lang === 'zh' ? '0 项内容' : '0 items');
      }

      const groupBorder = isDropTarget
        ? '#2563EB'
        : hasPlayingChild
          ? '#F59E0B'
          : isSelected || hasSelectedChild
            ? '#14244B'
            : isReusedInstance
              ? '#0284C7'
              : '#94A3B8';

      return (
        <div
          key={node.id}
          onPointerDown={(e) => handleNodePointerDown(node, e)}
          onPointerUp={(e) => handleTargetCardPointerUp(node, e)}
          style={{
            left: `${Math.round(node.x)}px`,
            top: `${Math.round(node.y)}px`,
            width: `${dim.width}px`,
            height: `${dim.height}px`,
            borderColor: groupBorder,
            zIndex: isCopyMenuOpen
              ? 42
              : node.collapsed
                ? isDragging
                  ? 36
                  : 18 + depth
                : isDragging || isResizing
                  ? 16
                  : 4 + depth,
          }}
          className={`pointer-events-auto absolute rounded-2xl border transition-shadow duration-150 flex flex-col ${
            node.collapsed
              ? 'bg-white border-2 shadow-[0_8px_22px_rgba(20,36,75,0.09)]'
              : 'bg-[#F1F5F9]/75 backdrop-blur-[1px] border-[1.5px] shadow-[0_6px_22px_rgba(15,23,42,0.05)]'
          } ${
            isDropTarget
              ? 'ring-4 ring-[#4E9AE3]/35 bg-[#EFF6FF]/75'
              : highlightedNodeId === node.id
                ? 'ring-4 ring-[#4E9AE3]/80'
                : hasPlayingChild
                  ? 'ring-3 ring-[#FBC53D]/65'
                  : isConnectCandidate
                    ? 'hover:ring-2 hover:ring-[#4E9AE3] cursor-crosshair'
                    : isDragging
                      ? 'cursor-grabbing shadow-[0_20px_40px_rgba(20,36,75,0.16)]'
                      : 'cursor-grab'
          }`}
        >
          {/* Group Header Bar */}
          <div className="px-3 h-10 border-b border-[#CBD5E1]/80 bg-white/95 flex items-center justify-between gap-2 shrink-0 rounded-t-[14px]">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {isReusedInstance ? (
                <Link2 className="w-3.5 h-3.5 text-[#0284C7] shrink-0" aria-hidden="true" />
              ) : (
                <Layers className="w-3.5 h-3.5 text-[#475569] shrink-0" aria-hidden="true" />
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setGroupCopyMenuId(null);
                  setEditingEdgeId(null);
                  setEdgeContextMenu(null);
                  setEditingGroupInfo({ id: node.id, focusField: 'code' });
                  onSelectNode(node.id);
                }}
                title={t.groupIdEditTitle}
                aria-label={`${t.groupIdEditTitle}: ${groupCode}`}
                className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold tracking-tight shrink-0 transition-opacity hover:opacity-90 cursor-pointer ${
                  isReusedInstance
                    ? 'bg-[#0284C7] text-white'
                    : 'bg-[#14244B] text-white'
                }`}
              >
                {groupCode}
              </button>
              {isReusedInstance && (
                <span
                  title={t.groupReuseSameIdHint}
                  className="px-1 py-0.5 rounded bg-[#E0F2FE] text-[#0369A1] font-mono text-[9.5px] font-bold shrink-0"
                >
                  ×{reusedCount}
                </span>
              )}
              {isEditingGroupTitle ? (
                <input
                  type="text"
                  autoFocus
                  value={node.title}
                  placeholder={t.groupNamePlaceholder}
                  onChange={(e) => onUpdateNode(node.id, { title: e.target.value })}
                  onBlur={() => setEditingNodeId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      setEditingNodeId(null);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="min-w-0 flex-1 text-xs font-bold text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] rounded px-1.5 py-0.5 focus:outline-none focus:border-[#14244B]"
                />
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setGroupCopyMenuId(null);
                    onSelectNode(node.id);
                    setEditingNodeId(node.id);
                  }}
                  className="min-w-0 flex items-center gap-1.5 text-left group/title cursor-text"
                >
                  <span className="font-display text-xs font-bold text-[#14244B] truncate">
                    {node.title.trim() || t.groupUntitled}
                  </span>
                  <Pencil
                    className="w-2.5 h-2.5 text-[#94A3B8] opacity-0 group-hover/title:opacity-100 shrink-0 transition-opacity"
                    aria-hidden="true"
                  />
                </button>
              )}

              {!node.collapsed && (
                <span className="text-[10.5px] text-[#64748B] font-mono tabular-nums whitespace-nowrap shrink-0">
                  · {summaryParts.join(' · ')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <button title={lang==='zh'?'移除这个分组，保留内部卡片':'Remove this group; keep its cards'} aria-label={lang==='zh'?'移除分组':'Remove group'} onClick={e=>{e.stopPropagation();onDeleteNode(node.id);}} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5"/></button>
              {hasPlayingChild && (
                <span className="text-[10px] font-bold text-[#B45309] mr-1 whitespace-nowrap">
                  · {t.playingNow}
                </span>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setGroupCopyMenuId(null);
                  setEditingEdgeId(null);
                  setEdgeContextMenu(null);
                  setEditingGroupInfo({ id: node.id, focusField: 'note' });
                  onSelectNode(node.id);
                }}
                title={t.groupDescEditTitle}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  hasGroupNote
                    ? 'bg-[#EFF6FF] text-[#0369A1] hover:bg-[#DBEAFE]'
                    : 'text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9]'
                }`}
              >
                <FileText className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>{t.groupDescLabel}</span>
              </button>

              <button type="button" aria-pressed={Boolean(node.stageTemplate)}
                title={lang === 'zh' ? '可复用舞台玩法' : 'Reusable stage mechanism'}
                onPointerDown={event => event.stopPropagation()}
                onClick={event => { event.stopPropagation(); onToggleStageTemplate(node.id); }}
                className="px-1.5 py-0.5 rounded border border-slate-300 text-[10px] aria-pressed:bg-slate-200">
                {lang === 'zh' ? '舞台模板' : 'Stage template'}
              </button>
              <button type="button" aria-pressed={Boolean(node.stageResetOnEntry)}
                title={lang === 'zh' ? '进入场景时重置分数、生命和属性' : 'Reset score, HP, and properties on scene entry'}
                onPointerDown={event => event.stopPropagation()}
                onClick={event => { event.stopPropagation(); onToggleStageReset(node.id); }}
                className="px-1.5 py-0.5 rounded border border-slate-300 text-[10px] aria-pressed:bg-slate-200">
                {lang === 'zh' ? '入场重置' : 'Reset on entry'}
              </button>

              {/* Copy as New vs Linked Reuse Popover */}
              <div className="relative" data-card-popover="true">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingEdgeId(null);
                    setEdgeContextMenu(null);
                    setGroupCopyMenuId((prev) => (prev === node.id ? null : node.id));
                    onSelectNode(node.id);
                  }}
                  title={t.groupDuplicate}
                  aria-label={t.groupDuplicate}
                  aria-expanded={isCopyMenuOpen}
                  className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                    isCopyMenuOpen
                      ? 'bg-[#14244B] text-white'
                      : 'text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9]'
                  }`}
                >
                  <Copy className="w-3 h-3" aria-hidden="true" />
                </button>

                {isCopyMenuOpen && (
                  <div
                    data-card-popover="true"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-1.5 w-60 bg-white rounded-xl border border-[#CBD5E1] shadow-[0_14px_34px_rgba(20,36,75,0.2)] p-1.5 space-y-0.5 z-50"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setGroupCopyMenuId(null);
                        onDuplicateNode(node.id, 'duplicate');
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#F8FAFC] flex items-start gap-2 transition-colors cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-[#14244B] mt-0.5 shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#14244B]">
                          {t.groupDuplicateAsNew}
                        </div>
                        <div className="text-[10.5px] text-[#64748B] leading-snug">
                          {t.groupDuplicateAsNewHint}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setGroupCopyMenuId(null);
                        onDuplicateNode(node.id, 'reuse');
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#F0F9FF] flex items-start gap-2 transition-colors cursor-pointer"
                    >
                      <Link2 className="w-3.5 h-3.5 text-[#0284C7] mt-0.5 shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#0369A1]">
                          {t.groupReuseSameId}
                        </div>
                        <div className="text-[10.5px] text-[#64748B] leading-snug">
                          {t.groupReuseSameIdHint}
                        </div>
                      </div>
                    </button>

                    {isReusedInstance && (
                      <>
                        <div className="my-1 border-t border-[#F1F5F9]" />
                        <button
                          type="button"
                          onClick={() => {
                            setGroupCopyMenuId(null);
                            onDetachGroupInstance(node.id);
                          }}
                          className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#FFFBEB] flex items-start gap-2 transition-colors cursor-pointer"
                        >
                          <Unlink className="w-3.5 h-3.5 text-[#B45309] mt-0.5 shrink-0" aria-hidden="true" />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#B45309]">
                              {t.groupDetachInstance}
                            </div>
                            <div className="text-[10.5px] text-[#64748B] leading-snug">
                              {t.groupDetachInstanceHint}
                            </div>
                          </div>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setGroupCopyMenuId(null);
                  onToggleGroupCollapse(node.id);
                  onSelectNode(node.id);
                }}
                title={node.collapsed ? t.groupExpand : t.groupCollapse}
                aria-label={node.collapsed ? t.groupExpand : t.groupCollapse}
                className="w-6 h-6 rounded-md text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-pointer"
              >
                {node.collapsed ? (
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>

              {isReusedInstance && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setGroupCopyMenuId(null);
                    if (editingGroupInfo?.id === node.id) setEditingGroupInfo(null);
                    onRemoveReusedPlacement(node.id);
                  }}
                  title={t.groupRemovePlacement}
                  aria-label={t.groupRemovePlacement}
                  className="w-6 h-6 rounded-md text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEF2F2] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Core Idea Strip (when expanded & documented) */}
          {!node.collapsed && hasGroupNote && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditingEdgeId(null);
                setEditingGroupInfo({ id: node.id, focusField: 'note' });
              }}
              title={t.groupDescEditTitle}
              className="px-3 py-1.5 border-b border-[#E2E8F0]/80 bg-[#F8FAFC]/90 text-left flex items-center gap-1.5 text-[11px] text-[#334155] hover:bg-[#EFF6FF] transition-colors cursor-pointer shrink-0"
            >
              <FileText className="w-3 h-3 shrink-0 text-[#0369A1]" aria-hidden="true" />
              <span className="truncate">{node.note}</span>
            </button>
          )}

          {/* Collapsed Body OR Expanded Container Drop Zone */}
          {node.collapsed ? (
            <div className="px-3 flex-1 flex flex-col justify-center gap-0.5 text-[11px] text-[#64748B] rounded-b-[14px]">
              {hasGroupNote && (
                <div className="text-[10.5px] text-[#475569] truncate">
                  {node.note}
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono tabular-nums truncate">
                  {summaryParts.join(' · ')}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleGroupCollapse(node.id);
                  }}
                  className="text-[11px] font-semibold text-[#14244B] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {t.groupExpand}
                </button>
              </div>
            </div>
          ) : (
            <div className="relative flex-1 min-h-0">
              {directChildren.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center px-6 pointer-events-none">
                  <span className="text-xs text-[#94A3B8] text-center">
                    {t.groupEmptyDropHint}
                  </span>
                </div>
              )}

              {isResizing && (
                <div className="absolute bottom-2.5 right-8 px-1.5 py-0.5 rounded bg-[#14244B]/85 text-white font-mono text-[10px] tabular-nums pointer-events-none">
                  {dim.width} × {dim.height}
                </div>
              )}
            </div>
          )}

          {/* 8-Direction Resize Handles on Expanded Group Container */}
          {!node.collapsed && (() => {
            const startResize = (
              dir: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw',
              e: ReactPointerEvent<HTMLElement>,
            ) => {
              e.stopPropagation();
              e.preventDefault();
              setAddMenuOpen(false);
              setEditingEdgeId(null);
              setEdgeContextMenu(null);
              onSelectNode(node.id);
              setResizingGroupId(node.id);
              groupResizeRef.current = {
                id: node.id,
                dir,
                startClientX: e.clientX,
                startClientY: e.clientY,
                startX: node.x,
                startY: node.y,
                startW: dim.width,
                startH: dim.height,
              };
            };

            return (
              <>
                <div
                  data-resize-handle="true"
                  role="separator"
                  aria-label={`${t.groupResizeAria} (top)`}
                  onPointerDown={(e) => startResize('n', e)}
                  className="absolute -top-1 inset-x-4 h-2.5 cursor-ns-resize z-20"
                />
                <div
                  data-resize-handle="true"
                  role="separator"
                  aria-label={`${t.groupResizeAria} (bottom)`}
                  onPointerDown={(e) => startResize('s', e)}
                  className="absolute -bottom-1 inset-x-4 h-2.5 cursor-ns-resize z-20"
                />
                <div
                  data-resize-handle="true"
                  role="separator"
                  aria-label={`${t.groupResizeAria} (left)`}
                  onPointerDown={(e) => startResize('w', e)}
                  className="absolute -left-1 inset-y-4 w-2.5 cursor-ew-resize z-20"
                />
                <div
                  data-resize-handle="true"
                  role="separator"
                  aria-label={`${t.groupResizeAria} (right)`}
                  onPointerDown={(e) => startResize('e', e)}
                  className="absolute -right-1 inset-y-4 w-2.5 cursor-ew-resize z-20"
                />
                <div
                  data-resize-handle="true"
                  onPointerDown={(e) => startResize('nw', e)}
                  className="absolute -top-1.5 -left-1.5 w-4 h-4 cursor-nwse-resize z-25"
                />
                <div
                  data-resize-handle="true"
                  onPointerDown={(e) => startResize('ne', e)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 cursor-nesw-resize z-25"
                />
                <div
                  data-resize-handle="true"
                  onPointerDown={(e) => startResize('sw', e)}
                  className="absolute -bottom-1.5 -left-1.5 w-4 h-4 cursor-nesw-resize z-25"
                />
                <div
                  data-resize-handle="true"
                  role="separator"
                  title={t.groupResizeAria}
                  aria-label={t.groupResizeAria}
                  onPointerDown={(e) => startResize('se', e)}
                  className={`absolute -bottom-1 -right-1 w-7 h-7 cursor-nwse-resize z-30 flex items-end justify-end p-1.5 rounded-br-2xl transition-colors ${
                    isResizing
                      ? 'text-[#14244B] bg-[#E2E8F0]/80'
                      : 'text-[#64748B] hover:text-[#14244B] hover:bg-[#E2E8F0]/55'
                  }`}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
                    <path
                      d="M10 1L1 10M10 5.5L5.5 10"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </>
            );
          })()}

          {/* Left & Right Connector Ports on Group Container */}
          <>
            <button
              type="button"
              title={t.connectPort}
              aria-label={`${t.connectPort} (Left)`}
              onPointerDown={(e) =>
                handlePortPointerDown(node, 'left', dim.width, dim.height, e)
              }
              onPointerUp={(e) => handleTargetCardPointerUp(node, e)}
              onClick={(e) => e.stopPropagation()}
              className={`absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 z-30 rounded-full border-2 flex items-center justify-center transition-transform cursor-pointer ${
                isConnectSource && connectingFrom?.kind === 'node' && connectingFrom.side === 'left'
                  ? 'bg-[#14244B] border-white scale-115 shadow-xs'
                  : isConnectCandidate
                    ? 'bg-white border-[#2563EB] ring-2 ring-[#4E9AE3]/35 hover:scale-115'
                    : 'bg-white border-[#64748B] hover:border-[#14244B] hover:scale-115'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnectSource && connectingFrom?.kind === 'node' && connectingFrom.side === 'left'
                    ? 'bg-white'
                    : isConnectCandidate
                      ? 'bg-[#2563EB]'
                      : 'bg-[#64748B]'
                }`}
              />
            </button>

            <button
              type="button"
              title={t.connectPort}
              aria-label={`${t.connectPort} (Right)`}
              onPointerDown={(e) =>
                handlePortPointerDown(node, 'right', dim.width, dim.height, e)
              }
              onPointerUp={(e) => handleTargetCardPointerUp(node, e)}
              onClick={(e) => e.stopPropagation()}
              className={`absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-transform cursor-pointer ${
                isConnectSource && connectingFrom?.kind === 'node' && connectingFrom.side === 'right'
                  ? 'bg-[#14244B] border-white scale-115 shadow-xs'
                  : isConnectCandidate
                    ? 'bg-white border-[#2563EB] ring-2 ring-[#4E9AE3]/35 hover:scale-115'
                    : 'bg-white border-[#64748B] hover:border-[#14244B] hover:scale-115'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnectSource && connectingFrom?.kind === 'node' && connectingFrom.side === 'right'
                    ? 'bg-white'
                    : isConnectCandidate
                      ? 'bg-[#2563EB]'
                      : 'bg-[#64748B]'
                }`}
              />
            </button>
          </>
        </div>
      );
    }

    const isEditingDraft = isDraft && editingNodeId === node.id;
    const isExpanded = meta.isPlayable && expandedNodeId === node.id;
    const isDragging = draggingNodeId === node.id;
    const isConnectSource = connectingFromId === node.id;
    const isConnectCandidate = Boolean(
      meta.isPlayable &&
        ((isConnectMode && !connectingFrom) ||
          (connectingFrom?.kind === 'node' && connectingFrom.nodeId !== node.id) ||
          connectingFrom?.kind === 'air' ||
          (connectingFrom?.kind === 'shared-condition' &&
            edgeMap.get(connectingFrom.sourceEdgeId)?.fromId !== node.id)),
    );

    const cardWidth = isExpanded ? CARD_EXPANDED_WIDTH : dim.width;
    const isSpeechBubble = node.kind === 'narration' || node.kind === 'dialogue';
    const activeBorderColor = isPlaying
      ? '#F59E0B'
      : isSelected || isExpanded
        ? '#14244B'
        : meta.borderColor;
    const speechTailFill = isExpanded
      ? '#FFFFFF'
      : node.kind === 'narration'
        ? '#FFFDF5'
        : '#FFF7F8';

    const zIndexClass = isExpanded
      ? 'z-45'
      : isDragging
        ? 'z-40'
        : isPlaying
          ? 'z-30'
          : isSelected
            ? 'z-25'
            : 'z-20';

    const bulletLines = isDraft
      ? node.note
          .split('\n')
          .map((line) => line.replace(/^[•\-*]\s*/, '').trim())
          .filter(Boolean)
      : [];

    const summaryParts = meta.isPlayable ? getCompactCardSummary(node) : [];

    return (
      <div
        key={node.id}
        ref={(element) => {
          if (element) actionCardElements.current.set(node.id, element);
          else actionCardElements.current.delete(node.id);
        }}
        onPointerDown={(e) => handleNodePointerDown(node, e)}
        onPointerUp={(e) => handleTargetCardPointerUp(node, e)}
        onContextMenu={(e) => handleActionContextMenu(node, e)}
        onDoubleClick={(e) => {
          if (!isDraft) return;
          e.stopPropagation();
          setEditingEdgeId(null);
          setEditingNodeId(node.id);
        }}
        style={{
          left: `${Math.round(node.x)}px`,
          top: `${Math.round(node.y)}px`,
          width: `${cardWidth}px`,
          minHeight: `${dim.height}px`,
          backgroundColor: meta.surfaceBg,
          borderColor: isMultiSelected ? '#0EA5E9' : activeBorderColor,
        }}
        className={`pointer-events-auto absolute ${meta.shapeClass} ${
          isDraft ? 'border border-dashed' : 'border-2'
        } transition-shadow duration-150 flex flex-col ${zIndexClass} ${
          highlightedNodeId === node.id
            ? 'ring-4 ring-[#4E9AE3]/80 shadow-[0_14px_34px_rgba(78,154,227,0.3)]'
            : isMultiSelected
              ? 'ring-4 ring-[#0EA5E9]/75 shadow-[0_14px_30px_rgba(14,165,233,0.24)]'
              : isExpanded
                ? 'shadow-[0_22px_50px_rgba(15,23,42,0.22)]'
                : isDragging
                  ? 'shadow-[0_20px_42px_rgba(20,36,75,0.2)] cursor-grabbing'
                  : isPlaying
                    ? 'ring-4 ring-[#FBC53D]/70 shadow-[0_14px_34px_rgba(245,158,11,0.28)]'
                    : isConnectCandidate
                      ? 'hover:ring-2 hover:ring-[#4E9AE3] cursor-crosshair'
                      : isDraft
                        ? 'shadow-[0_4px_12px_rgba(15,23,42,0.06)] hover:shadow-[0_8px_18px_rgba(15,23,42,0.1)] cursor-grab'
                        : 'shadow-[0_6px_18px_rgba(20,36,75,0.07)] hover:shadow-[0_10px_24px_rgba(20,36,75,0.12)] cursor-grab'
        }`}
      >
        {/* Header Bar (Drag Handle) */}
        <div
          style={{
            backgroundColor: meta.headerBg,
            borderBottomColor: isDraft ? '#CBD5E1' : meta.borderColor,
          }}
          className={`px-3 py-1.5 border-b flex items-center justify-between gap-2 ${meta.headerShapeClass}`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {renderKindIcon(node.kind, meta.accentColor)}
            <span
              className="text-[11px] font-bold tracking-tight truncate"
              style={{ color: meta.accentColor }}
            >
              {isDraft ? t.draftBadge : kindLabel}
            </span>
            {(isMultiSelected || isComboMember) && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.25 rounded-full bg-[#0284C7] text-white text-[9.5px] font-bold shrink-0">
                <Check className="w-2.5 h-2.5" aria-hidden="true" />
                {isComboMember && <span>Combo</span>}
              </span>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {isPlaying && (
              <span className="text-[10px] font-bold text-[#B45309] mr-1 whitespace-nowrap">
                · {t.playingNow}
              </span>
            )}
            {meta.isPlayable && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingEdgeId(null);
                  setExpandedNodeId(isExpanded ? null : node.id);
                  onSelectNode(node.id);
                }}
                aria-label={isExpanded ? t.collapseCard : t.expandCard}
                title={isExpanded ? t.collapseCard : t.expandCard}
                className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                  isExpanded
                    ? 'bg-[#14244B] text-white'
                    : node.manualFields.length > 0
                      ? 'text-[#0369A1] bg-white/75 hover:bg-white'
                      : 'text-[#475569] hover:text-[#14244B] hover:bg-white/60'
                }`}
              >
                <SlidersHorizontal className="w-3 h-3" aria-hidden="true" />
              </button>
            )}
            {isDraft && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingEdgeId(null);
                  setEditingNodeId(isEditingDraft ? null : node.id);
                  onSelectNode(node.id);
                }}
                aria-label="Edit card"
                className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                  isEditingDraft
                    ? 'bg-[#14244B] text-white'
                    : 'text-[#475569] hover:text-[#14244B] hover:bg-white/60'
                }`}
              >
                <Pencil className="w-3 h-3" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (expandedNodeId === node.id) setExpandedNodeId(null);
                onDeleteNode(node.id);
              }}
              aria-label={t.deleteCard}
              title={t.deleteCard}
              className="w-5 h-5 rounded-md text-[#475569] hover:text-[#DC2626] hover:bg-white/60 flex items-center justify-center transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Front Face: Structured 5-Card Authoring OR Draft Sticky */}
        {meta.isPlayable ? (
          <>
            <CardPromptFront
              lang={lang}
              node={node}
              assetItems={assetItems}
              scopedVariables={scopedVariables}
              autoFocus={freshFocusNodeId === node.id}
              onUpdateNode={onUpdateNode}
              onUpdateNodeField={onUpdateNodeField}
            />

            {/* Compact Unboxed Summary & Expand Strip */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingEdgeId(null);
                  setExpandedNodeId(isExpanded ? null : node.id);
                  onSelectNode(node.id);
                }}
                style={
                  !isExpanded && isSpeechBubble
                    ? { backgroundColor: speechTailFill }
                    : undefined
                }
                className={`w-full px-3 py-1.5 border-t border-black/8 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                  isExpanded
                    ? 'bg-white/95 text-[#14244B]'
                    : isSpeechBubble
                      ? 'text-[#475569] hover:brightness-[0.98]'
                      : 'bg-white/45 hover:bg-white/80 text-[#475569]'
                } ${!isExpanded ? 'rounded-b-[inherit]' : ''}`}
              >
                <span className={`text-[10.5px] text-[#64748B] truncate ${placementCounts[node.id] ? 'max-w-[35%]' : ''}`}>
                  {summaryParts.length > 0 ? summaryParts.join(' · ') : t.autoMappedTag}
                </span>
                <span className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-[#14244B] whitespace-nowrap shrink-0">
                  <span>{isExpanded ? t.collapseCard : t.expandCard}</span>
                  {isExpanded ? (
                    <ChevronUp className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-3 h-3" aria-hidden="true" />
                  )}
                </span>
              </button>
              {!!placementCounts[node.id] && <button type="button"
                className="absolute right-[5rem] top-1/2 -translate-y-1/2 text-[10.5px] text-[#2563EB] underline whitespace-nowrap"
                onPointerDown={event => event.stopPropagation()}
                onClick={event => { event.stopPropagation(); onLocateStage(node.id); }}>
                {placementCounts[node.id]} {lang === 'zh' ? '个实例' : placementCounts[node.id] === 1 ? 'instance' : 'instances'}
              </button>}
            </div>

            {/* In-Place Widened Floating Expanded Attributes Panel */}
            {isExpanded && (
              <div className="rounded-b-[inherit] overflow-visible">
                <CardExpandedPanel
                  lang={lang}
                  node={node}
                  assetItems={assetItems}
                  scopedVariables={scopedVariables}
                  numericParameters={numericBoardParameters}
                  onUpdateNode={onUpdateNode}
                  onUpdateNodeField={onUpdateNodeField}
                  onResetAutoFields={onResetNodeAutoFields}
                  onEnableChoiceOrdering={(entry) => {
                    onUpdateVariable(entry.scope, entry.assetId, {
                      ...entry.variable,
                      ordered: true,
                    });
                  }}
                  onCollapse={() => setExpandedNodeId(null)}
                />
              </div>
            )}
          </>
        ) : (
          <div
            className="px-3.5 py-2.5 flex-1 flex flex-col justify-center"
            onClick={(e) => {
              if (!isEditingDraft && !node.note.trim() && !connectingFromId) {
                e.stopPropagation();
                setEditingNodeId(node.id);
                onSelectNode(node.id);
              }
            }}
          >
            {isEditingDraft ? (
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={node.title}
                  placeholder={t.editTitlePlaceholder}
                  onChange={(e) => onUpdateNode(node.id, { title: e.target.value })}
                  className="w-full text-xs font-bold text-[#14244B] bg-white/90 border border-[#14244B]/25 rounded-md px-2 py-1 focus:outline-none focus:border-[#14244B]"
                />
                <textarea
                  rows={4}
                  autoFocus
                  value={node.note}
                  placeholder={placeholderText}
                  onChange={(e) => onUpdateNode(node.id, { note: e.target.value })}
                  className="w-full text-xs text-[#1E293B] bg-white/95 border border-[#14244B]/30 rounded-md px-2 py-1.5 resize-none leading-snug focus:outline-none focus:border-[#14244B]"
                />
              </div>
            ) : (
              <div className="space-y-1">
                {node.title && (
                  <div className="text-xs font-bold text-[#475569] truncate">
                    {node.title}
                  </div>
                )}
                {bulletLines.length > 0 ? (
                  <ul className="space-y-1 text-[11.5px] text-[#475569] leading-snug">
                    {bulletLines.map((line, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-[#94A3B8] select-none shrink-0">•</span>
                        <span className="break-words">{line}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-[#94A3B8] italic cursor-text">
                    {placeholderText}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Folded Dog-Ear Corner on Grey Draft Sticky */}
        {isDraft && (
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 18 18"
            className="absolute -bottom-[1px] -right-[1px] pointer-events-none"
          >
            <polygon points="0,18 18,0 18,18" fill="#F8FAFC" />
            <polygon points="0,18 18,0 0,0" fill="#CBD5E1" />
          </svg>
        )}

        {/* Speech-Bubble Tail on Narration & Dialogue Cards */}
        {isSpeechBubble && (
          <svg
            aria-hidden="true"
            width="24"
            height="14"
            viewBox="0 0 24 14"
            className="absolute -bottom-[11px] left-6 pointer-events-none overflow-visible"
          >
            <path
              d="M 4 0 L 20 0 L 19.5 2.4 L 3 12.2 L 4 2.4 Z"
              fill={speechTailFill}
            />
            <path
              d="M 4 2 L 3 12.2 L 19.5 2"
              fill="none"
              stroke={activeBorderColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}

        {/* Left & Right Connector Ports (Playable Cards Only) */}
        {meta.isPlayable && (
          <>
            <button
              type="button"
              title={t.connectPort}
              aria-label={`${t.connectPort} (Left)`}
              onPointerDown={(e) =>
                handlePortPointerDown(node, 'left', cardWidth, dim.height, e)
              }
              onPointerUp={(e) => handleTargetCardPointerUp(node, e)}
              onClick={(e) => e.stopPropagation()}
              className={`absolute -left-2.5 top-[68px] -translate-y-1/2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-transform cursor-pointer ${
                isConnectSource && connectingFrom?.kind === 'node' && connectingFrom.side === 'left'
                  ? 'bg-[#14244B] border-white scale-115 shadow-xs'
                  : isConnectCandidate
                    ? 'bg-white border-[#2563EB] ring-2 ring-[#4E9AE3]/35 hover:scale-115'
                    : 'bg-white border-[#64748B] hover:border-[#14244B] hover:scale-115'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnectSource && connectingFrom?.kind === 'node' && connectingFrom.side === 'left'
                    ? 'bg-white'
                    : isConnectCandidate
                      ? 'bg-[#2563EB]'
                      : 'bg-[#64748B]'
                }`}
              />
            </button>

            <button
              type="button"
              title={t.connectPort}
              aria-label={`${t.connectPort} (Right)`}
              onPointerDown={(e) =>
                handlePortPointerDown(node, 'right', cardWidth, dim.height, e)
              }
              onPointerUp={(e) => handleTargetCardPointerUp(node, e)}
              onClick={(e) => e.stopPropagation()}
              className={`absolute -right-2.5 top-[68px] -translate-y-1/2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-transform cursor-pointer ${
                isConnectSource && connectingFrom?.kind === 'node' && connectingFrom.side === 'right'
                  ? 'bg-[#14244B] border-white scale-115 shadow-xs'
                  : isConnectCandidate
                    ? 'bg-white border-[#2563EB] ring-2 ring-[#4E9AE3]/35 hover:scale-115'
                    : 'bg-white border-[#64748B] hover:border-[#14244B] hover:scale-115'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnectSource && connectingFrom?.kind === 'node' && connectingFrom.side === 'right'
                    ? 'bg-white'
                    : isConnectCandidate
                      ? 'bg-[#2563EB]'
                      : 'bg-[#64748B]'
                }`}
              />
            </button>
          </>
        )}
      </div>
    );
  };

  const contextMenuEdge = edgeContextMenu
    ? edgeMap.get(edgeContextMenu.edgeId) ?? null
    : null;
  const contextMenuNode = nodeContextMenu
    ? nodeMap.get(nodeContextMenu.nodeId) ?? null
    : null;

  return (
    <div
      ref={containerRef}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onPointerLeave={() => {
        if (!groupResizeRef.current && !nodeDragRef.current && !entryTailDragRef.current) {
          handleCanvasPointerUp();
        }
      }}
      onContextMenu={(e) => {
        if (e.target === e.currentTarget) {
          setEdgeContextMenu(null);
          setNodeContextMenu(null);
        }
      }}
      onScroll={(e) => {
        if (e.currentTarget.scrollTop !== 0 || e.currentTarget.scrollLeft !== 0) {
          e.currentTarget.scrollTo(0, 0);
        }
      }}
      style={{
        backgroundColor: '#F8FAFC',
        backgroundImage: `radial-gradient(#CBD5E1 ${Math.max(1, 1.2 * zoom)}px, transparent ${Math.max(1, 1.2 * zoom)}px)`,
        backgroundSize: `${gridSpacing}px ${gridSpacing}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
      className={`relative flex-1 min-h-0 overflow-clip select-none ${
        isConnectingActive
          ? 'cursor-crosshair'
          : isPanning
            ? 'cursor-grabbing'
            : 'cursor-grab'
      }`}
    >
      {/* Blank Canvas Centered Zero-State */}
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 pt-16">
          <div className="pointer-events-auto max-w-xs text-center space-y-2.5">
            <h2 className="font-display text-lg font-bold text-[#14244B]">
              {t.emptyBoardTitle}
            </h2>
            <p className="text-xs text-[#64748B] leading-relaxed">
              {t.emptyBoardHint}
            </p>
            <button
              type="button"
              onClick={() => setAddMenuOpen(true)}
              className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#14244B] hover:bg-[#1E3468] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.addMenu}</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Connect Mode Banner */}
      {isConnectingActive && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-40 bg-[#14244B] text-white text-xs font-medium px-4 py-2 rounded-xl shadow-md flex items-center gap-2.5 whitespace-nowrap">
          <span>
            {connectingFrom?.kind === 'shared-condition'
              ? t.menuShareHint
              : connectingFrom
                ? t.connectingHint
                : t.connectPickSourceHint}
          </span>
          <button
            type="button"
            onClick={exitConnectMode}
            aria-label={t.cancelConnect}
            className="text-white/75 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* World Transform Layer (isolated z-10 stacking context so stickers never cover fixed toolbars) */}
      <div
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
        className="absolute top-0 left-0 w-0 h-0 z-10 pointer-events-none"
      >
        {/* SVG Relationship Arrows Layer */}
        <svg
          width="5000"
          height="5000"
          viewBox="-1000 -1000 5000 5000"
          className="absolute -left-[1000px] -top-[1000px] overflow-visible pointer-events-none z-15"
        >
          <defs>
            <marker
              id="board-arrow"
              viewBox="0 0 10 10"
              refX="8.2"
              refY="5"
              markerWidth="6.5"
              markerHeight="6.5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.2 L 8.5 5 L 0 8.8 z" fill="#64748B" />
            </marker>
            <marker
              id="board-arrow-loop"
              viewBox="0 0 10 10"
              refX="8.2"
              refY="5"
              markerWidth="6.5"
              markerHeight="6.5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.2 L 8.5 5 L 0 8.8 z" fill="#0D9488" />
            </marker>
            <marker
              id="board-arrow-active"
              viewBox="0 0 10 10"
              refX="8.2"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.2 L 8.5 5 L 0 8.8 z" fill="#F59E0B" />
            </marker>
          </defs>

          {computedEdges.map(
            ({ edge, edgeType, to, path, isLoop, isEntry, startX, startY, endX, endY }) => {
              if (groupedEdgeIdSet.has(edge.id)) return null;
              const isAssoc = edgeType === 'association';
              const isActive = activePlayEdgeSet.has(edge.id);
              const isLocated = highlightedEdgeId === edge.id;
              const isHovered =
                hoveredEdgeId === edge.id ||
                editingEdgeId === edge.id ||
                edgeContextMenu?.edgeId === edge.id;
              const hasCond = Boolean(
                edge.condition?.trim() || edge.conditionGroup?.clauses.length,
              );

              const strokeColor = isActive
                ? '#F59E0B'
                : isLocated
                  ? '#2563EB'
                  : isAssoc
                    ? isHovered
                      ? '#312E81'
                      : '#6366F1'
                    : isHovered
                      ? '#14244B'
                      : isLoop
                        ? '#0D9488'
                        : isEntry && hasCond
                          ? '#0284C7'
                          : '#64748B';

              const marker = isAssoc
                ? undefined
                : isActive
                  ? 'url(#board-arrow-active)'
                  : isLoop
                    ? 'url(#board-arrow-loop)'
                    : 'url(#board-arrow)';

              return (
                <g
                  key={edge.id}
                  onMouseEnter={() => setHoveredEdgeId(edge.id)}
                  onMouseLeave={() =>
                    setHoveredEdgeId((prev) => (prev === edge.id ? null : prev))
                  }
                  onPointerDown={(e) => {
                    if (!isConnectingActive && e.button === 0) {
                      e.stopPropagation();
                    }
                  }}
                  onClick={(e) => {
                    if (isConnectingActive) return;
                    e.stopPropagation();
                    handleEdgeContextMenu(edge, e);
                  }}
                  onContextMenu={(e) => handleEdgeConditionContextMenu(edge, e)}
                  className={`pointer-events-auto ${isConnectingActive ? '' : 'cursor-pointer'}`}
                >
                  <path d={path} fill="none" stroke="transparent" strokeWidth="20" />
                  <path
                    d={path}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={isActive || isLocated ? '3.4' : isHovered ? '2.8' : '2.1'}
                    strokeDasharray={
                      isAssoc ? '4 4' : isLoop ? '6 4' : undefined
                    }
                    markerEnd={marker}
                  />
                  {isAssoc && (
                    <>
                      <circle
                        cx={startX}
                        cy={startY}
                        r="3.4"
                        fill="#FFFFFF"
                        stroke={strokeColor}
                        strokeWidth="2"
                      />
                      <circle
                        cx={endX}
                        cy={endY}
                        r="3.4"
                        fill="#FFFFFF"
                        stroke={strokeColor}
                        strokeWidth="2"
                      />
                    </>
                  )}
                  {isEntry && (
                    <g
                      role="button"
                      aria-label={t.entryArrowOriginAria}
                      onPointerDown={(e) => {
                        if (isConnectingActive || e.button !== 0) return;
                        e.stopPropagation();
                        setDraggingEntryEdgeId(edge.id);
                        entryTailDragRef.current = {
                          edgeId: edge.id,
                          toX: to.x,
                          toY: to.y,
                        };
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <circle cx={startX} cy={startY} r="12" fill="transparent" />
                      <circle
                        cx={startX}
                        cy={startY}
                        r="7.5"
                        fill="#FFFFFF"
                        stroke={strokeColor}
                        strokeWidth="2.2"
                      />
                      <circle
                        cx={startX}
                        cy={startY}
                        r="3.5"
                        fill={
                          isActive
                            ? '#F59E0B'
                            : isLocated
                              ? '#2563EB'
                              : hasCond
                                ? '#0284C7'
                                : '#64748B'
                        }
                      />
                    </g>
                  )}
                </g>
              );
            },
          )}

          {/* Shared Condition Hub Trunks & Forked Branches */}
          {sharedConditionGroups.map((group) => {
            const { key, primaryItem, items, isEntry, srcX, srcY, trunkPath, branches } =
              group;
            const anyActive = items.some((i) => activePlayEdgeSet.has(i.edge.id));
            const anyLocated = items.some((i) => highlightedEdgeId === i.edge.id);
            const anyHovered = items.some(
              (i) =>
                hoveredEdgeId === i.edge.id ||
                editingEdgeId === i.edge.id ||
                edgeContextMenu?.edgeId === i.edge.id,
            );
            const trunkStroke = anyActive
              ? '#F59E0B'
              : anyLocated
                ? '#2563EB'
                : anyHovered
                  ? '#14244B'
                  : '#0284C7';

            return (
              <g key={`shared-svg-${key}`}>
                <g
                  onMouseEnter={() => setHoveredEdgeId(primaryItem.edge.id)}
                  onMouseLeave={() =>
                    setHoveredEdgeId((prev) =>
                      prev === primaryItem.edge.id ? null : prev,
                    )
                  }
                  onPointerDown={(e) => {
                    if (!isConnectingActive && e.button === 0) e.stopPropagation();
                  }}
                  onClick={(e) => {
                    if (isConnectingActive) return;
                    e.stopPropagation();
                    handleEdgeContextMenu(primaryItem.edge, e);
                  }}
                  onContextMenu={(e) => handleEdgeConditionContextMenu(primaryItem.edge, e)}
                  className={`pointer-events-auto ${isConnectingActive ? '' : 'cursor-pointer'}`}
                >
                  <path d={trunkPath} fill="none" stroke="transparent" strokeWidth="20" />
                  <path
                    d={trunkPath}
                    fill="none"
                    stroke={trunkStroke}
                    strokeWidth={anyActive || anyLocated ? '3.4' : anyHovered ? '2.8' : '2.3'}
                  />
                  {isEntry && (
                    <g
                      role="button"
                      aria-label={t.entryArrowOriginAria}
                      onPointerDown={(e) => {
                        if (isConnectingActive || e.button !== 0) return;
                        e.stopPropagation();
                        setDraggingEntryEdgeId(primaryItem.edge.id);
                        entryTailDragRef.current = {
                          edgeId: primaryItem.edge.id,
                          toX: primaryItem.to.x,
                          toY: primaryItem.to.y,
                        };
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <circle cx={srcX} cy={srcY} r="12" fill="transparent" />
                      <circle
                        cx={srcX}
                        cy={srcY}
                        r="7.5"
                        fill="#FFFFFF"
                        stroke={trunkStroke}
                        strokeWidth="2.2"
                      />
                      <circle cx={srcX} cy={srcY} r="3.5" fill={trunkStroke} />
                    </g>
                  )}
                </g>

                {branches.map(({ item, path }) => {
                  const isBranchActive = activePlayEdgeSet.has(item.edge.id);
                  const isBranchLocated = highlightedEdgeId === item.edge.id;
                  const isBranchHovered =
                    hoveredEdgeId === item.edge.id ||
                    editingEdgeId === item.edge.id ||
                    edgeContextMenu?.edgeId === item.edge.id;
                  const branchStroke = isBranchActive
                    ? '#F59E0B'
                    : isBranchLocated
                      ? '#2563EB'
                      : isBranchHovered
                        ? '#14244B'
                        : item.isLoop
                          ? '#0D9488'
                          : '#0284C7';
                  const marker = isBranchActive
                    ? 'url(#board-arrow-active)'
                    : item.isLoop
                      ? 'url(#board-arrow-loop)'
                      : 'url(#board-arrow)';

                  return (
                    <g
                      key={`branch-${item.edge.id}`}
                      onMouseEnter={() => setHoveredEdgeId(item.edge.id)}
                      onMouseLeave={() =>
                        setHoveredEdgeId((prev) =>
                          prev === item.edge.id ? null : prev,
                        )
                      }
                      onPointerDown={(e) => {
                        if (!isConnectingActive && e.button === 0) e.stopPropagation();
                      }}
                      onClick={(e) => {
                        if (isConnectingActive) return;
                        e.stopPropagation();
                        handleEdgeContextMenu(item.edge, e);
                      }}
                      onContextMenu={(e) => handleEdgeConditionContextMenu(item.edge, e)}
                      className={`pointer-events-auto ${isConnectingActive ? '' : 'cursor-pointer'}`}
                    >
                      <path d={path} fill="none" stroke="transparent" strokeWidth="20" />
                      <path
                        d={path}
                        fill="none"
                        stroke={branchStroke}
                        strokeWidth={
                          isBranchActive || isBranchLocated
                            ? '3.4'
                            : isBranchHovered
                              ? '2.8'
                              : '2.1'
                        }
                        strokeDasharray={item.isLoop ? '6 4' : undefined}
                        markerEnd={marker}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {connectingFrom?.kind === 'node' &&
            connectingSourceNode &&
            connectingSourceDim &&
            connectPointerWorld && (
              <path
                d={`M ${
                  connectingFrom.side === 'left'
                    ? connectingSourceNode.x
                    : connectingSourceNode.x + connectingSourceWidth
                } ${connectingSourceNode.y + connectingSourceDim.height / 2} L ${connectPointerWorld.x} ${connectPointerWorld.y}`}
                fill="none"
                stroke="#2563EB"
                strokeWidth="2.2"
                strokeDasharray="6 5"
                markerEnd="url(#board-arrow)"
              />
            )}

          {connectingFrom?.kind === 'shared-condition' && connectPointerWorld && (
            <path
              d={`M ${connectingFrom.hubX} ${connectingFrom.hubY} L ${connectPointerWorld.x} ${connectPointerWorld.y}`}
              fill="none"
              stroke="#0284C7"
              strokeWidth="2.3"
              strokeDasharray="6 4"
              markerEnd="url(#board-arrow)"
            />
          )}

          {connectingFrom?.kind === 'air' && connectPointerWorld && (
            <g>
              <path
                d={`M ${connectingFrom.worldX} ${connectingFrom.worldY} L ${connectPointerWorld.x} ${connectPointerWorld.y}`}
                fill="none"
                stroke="#2563EB"
                strokeWidth="2.2"
                strokeDasharray="6 5"
                markerEnd="url(#board-arrow)"
              />
              <circle
                cx={connectingFrom.worldX}
                cy={connectingFrom.worldY}
                r="7.5"
                fill="#FFFFFF"
                stroke="#2563EB"
                strokeWidth="2.2"
              />
              <circle
                cx={connectingFrom.worldX}
                cy={connectingFrom.worldY}
                r="3.5"
                fill="#2563EB"
              />
            </g>
          )}
        </svg>

        {/* Unfilled Action Combo Frames (Combinable vs Default Exclusive) */}
        {comboFrames.map((frame) => {
          const enclosedActions = nodes.filter(
            (n) =>
              !getCollapsedAncestorGroup(n.id, nodeMap) &&
              isActionInsideComboFrame(n, frame),
          );
          const isAnyActive = enclosedActions.some((a) => activePlaySet.has(a.id));
          const isDraggingCombo = draggingComboId === frame.id;
          const isResizingCombo = resizingComboId === frame.id;

          const startComboDrag = (e: ReactPointerEvent<HTMLElement>) => {
            if (isConnectingActive || e.button !== 0) return;
            e.stopPropagation();
            setAddMenuOpen(false);
            setEditingEdgeId(null);
            setEdgeContextMenu(null);
            setDraggingComboId(frame.id);
            comboDragRef.current = {
              id: frame.id,
              startClientX: e.clientX,
              startClientY: e.clientY,
              origX: frame.x,
              origY: frame.y,
            };
          };

          const startComboResize = (e: ReactPointerEvent<HTMLElement>) => {
            if (isConnectingActive || e.button !== 0) return;
            e.stopPropagation();
            e.preventDefault();
            setAddMenuOpen(false);
            setEditingEdgeId(null);
            setEdgeContextMenu(null);
            setResizingComboId(frame.id);
            comboResizeRef.current = {
              id: frame.id,
              startClientX: e.clientX,
              startClientY: e.clientY,
              startW: frame.width,
              startH: frame.height,
            };
          };

          return (
            <div
              key={frame.id}
              style={{
                left: `${Math.round(frame.x)}px`,
                top: `${Math.round(frame.y)}px`,
                width: `${Math.round(frame.width)}px`,
                height: `${Math.round(frame.height)}px`,
                zIndex: isDraggingCombo || isResizingCombo ? 38 : 12,
              }}
              className={`pointer-events-none absolute rounded-2xl border-2 border-dashed transition-colors ${
                isAnyActive
                  ? 'border-[#F59E0B] shadow-[0_0_0_4px_rgba(251,197,61,0.22)]'
                  : isDraggingCombo || isResizingCombo
                    ? 'border-[#0284C7] shadow-[0_0_0_3px_rgba(56,189,248,0.2)]'
                    : 'border-[#0EA5E9]/80'
              }`}
            >
              {/* Compact Top-Left Drag Handle (no cluttered text) */}
              <div
                onPointerDown={startComboDrag}
                className={`pointer-events-auto absolute -top-6 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10.5px] font-bold shadow-xs select-none cursor-grab active:cursor-grabbing whitespace-nowrap ${
                  isAnyActive
                    ? 'bg-[#FFFBEB] border-[#F59E0B] text-[#B45309]'
                    : 'bg-[#F0F9FF]/95 border-[#38BDF8] text-[#0369A1]'
                }`}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                  className="shrink-0"
                >
                  <rect
                    x="1.5"
                    y="1.5"
                    width="9"
                    height="9"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeDasharray="2.5 1.8"
                  />
                </svg>
                <span>{t.comboFrameTag}</span>
                {enclosedActions.length >= 2 && (
                  <span className="font-mono text-[10px] opacity-80">
                    ×{enclosedActions.length}
                  </span>
                )}
              </div>

              {/* Prominent Top-Right Delete Button */}
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteComboFrame(frame.id);
                }}
                title={t.comboFrameDeleteAria}
                aria-label={t.comboFrameDeleteAria}
                className="pointer-events-auto absolute -top-3 -right-3 w-6 h-6 rounded-full bg-white border border-[#FCA5A5] text-[#DC2626] hover:bg-[#DC2626] hover:text-white hover:border-[#DC2626] shadow-sm flex items-center justify-center transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" aria-hidden="true" />
              </button>

              {/* Thin Border Hit-Strips (keep interior 100% click-through to cards!) */}
              <div
                onPointerDown={startComboDrag}
                className="pointer-events-auto absolute -top-1.5 inset-x-3 h-3 cursor-grab active:cursor-grabbing"
              />
              <div
                onPointerDown={startComboDrag}
                className="pointer-events-auto absolute -bottom-1.5 inset-x-6 h-3 cursor-grab active:cursor-grabbing"
              />
              <div
                onPointerDown={startComboDrag}
                className="pointer-events-auto absolute inset-y-3 -left-1.5 w-3 cursor-grab active:cursor-grabbing"
              />
              <div
                onPointerDown={startComboDrag}
                className="pointer-events-auto absolute inset-y-6 -right-1.5 w-3 cursor-grab active:cursor-grabbing"
              />

              {/* Bottom-right Resize Handle */}
              <div
                data-resize-handle="true"
                role="separator"
                title={t.comboFrameResizeAria}
                aria-label={t.comboFrameResizeAria}
                onPointerDown={startComboResize}
                className={`pointer-events-auto absolute -bottom-1 -right-1 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-1 rounded-br-xl transition-colors ${
                  isAnyActive
                    ? 'text-[#B45309] hover:bg-[#FEF3C7]/80'
                    : 'text-[#0284C7] hover:bg-[#E0F2FE]/80'
                }`}
              >
                <svg width="10" height="10" viewBox="0 0 11 11" aria-hidden="true">
                  <path
                    d="M10 1L1 10M10 5.5L5.5 10"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          );
        })}

        {/* Render Groups, Experience Cards & Draft Stickies */}
        {visibleNodesSorted.map(renderCard)}

        {/* Condition & Hover Relationship Chips on Connections */}
        {computedEdges.map(({ edge, edgeType, from, to, midX, midY, isLoop, isEntry }) => {
          if (groupedEdgeIdSet.has(edge.id)) return null;
          const isAssoc = edgeType === 'association';
          const isEditing = editingEdgeId === edge.id;
          const isActive = activePlayEdgeSet.has(edge.id);
          const isHovered = hoveredEdgeId === edge.id || edgeContextMenu?.edgeId === edge.id;
          const hasCondition = Boolean(
            edge.condition?.trim() || edge.conditionGroup?.clauses.length,
          );

          if (!hasCondition && !isHovered) return null;

          const relationLabel = isAssoc
            ? t.edgeAssocHoverTag
            : isEntry
              ? t.edgeFlowEntryTag
              : isLoop
                ? t.edgeFlowLoopTag
                : from?.kind === 'action' && to.kind === 'outcome'
                  ? t.edgeFlowActionOutcomeTag
                  : from?.kind === 'group' || to.kind === 'group'
                    ? t.edgeFlowGroupTag
                    : t.edgeFlowHoverTag;

          const firstKind = edge.conditionGroup?.clauses[0]?.kind;

          return (
            <div
              key={`cond-${edge.id}`}
              style={{
                left: `${Math.round(midX)}px`,
                top: `${Math.round(midY)}px`,
              }}
              onMouseEnter={() => setHoveredEdgeId(edge.id)}
              onMouseLeave={() =>
                setHoveredEdgeId((prev) => (prev === edge.id ? null : prev))
              }
              onPointerDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => handleEdgeConditionContextMenu(edge, e)}
              className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 ${
                isEditing ? 'z-40' : 'z-35'
              }`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdgeContextMenu(edge, e);
                }}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border text-[11px] font-semibold shadow-xs transition-all whitespace-nowrap cursor-pointer ${
                  isEditing
                    ? 'border-[#0284C7] ring-2 ring-[#7DD3FC]/80 text-[#14244B]'
                    : isActive
                      ? 'border-[#F59E0B] ring-2 ring-[#FBC53D]/60 text-[#14244B]'
                      : highlightedEdgeId === edge.id
                        ? 'border-[#2563EB] ring-2 ring-[#4E9AE3]/60 text-[#14244B]'
                        : isAssoc && !hasCondition
                          ? 'border-[#C7D2FE] text-[#4338CA] hover:border-[#6366F1]'
                          : !hasCondition && isLoop
                            ? 'border-[#99F6E4] text-[#0F766E] hover:border-[#0D9488]'
                            : !hasCondition && isEntry
                              ? 'border-[#BAE6FD] text-[#0369A1] hover:border-[#0284C7]'
                              : !hasCondition
                                ? 'border-[#CBD5E1] text-[#334155] hover:border-[#14244B]'
                                : isLoop
                                  ? 'border-[#0D9488]/60 text-[#14244B] hover:border-[#14244B]'
                                  : isAssoc
                                    ? 'border-[#C7D2FE] text-[#14244B] hover:border-[#6366F1]'
                                    : 'border-[#CBD5E1] text-[#14244B] hover:border-[#14244B]'
                }`}
              >
                {isLoop && (
                  <RotateCcw
                    className="w-3 h-3 text-[#0D9488] shrink-0"
                    aria-hidden="true"
                  />
                )}
                {!hasCondition ? (
                  <span
                    className={`text-[10.5px] font-semibold ${
                      isAssoc
                        ? 'text-[#4338CA]'
                        : isLoop
                          ? 'text-[#0F766E]'
                          : isEntry
                            ? 'text-[#0369A1]'
                            : 'text-[#334155]'
                    }`}
                  >
                    {relationLabel}
                  </span>
                ) : (
                  <>
                    {isHovered && (
                      <span
                        className={`text-[10px] font-semibold shrink-0 ${
                          isAssoc ? 'text-[#4338CA]' : 'text-[#64748B]'
                        }`}
                      >
                        {relationLabel} ·
                      </span>
                    )}
                    {firstKind === 'event' ? (
                      <Zap className="w-3 h-3 text-[#0284C7] shrink-0" aria-hidden="true" />
                    ) : firstKind === 'property' ? (
                      <SlidersHorizontal
                        className="w-3 h-3 text-[#047857] shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="font-mono text-[10px] font-bold text-[#0369A1]">
                        if
                      </span>
                    )}
                    <span className="max-w-[190px] truncate">{edge.condition}</span>
                  </>
                )}
              </button>

              {!isAssoc && hasCondition && isHovered && (
                <button
                  type="button"
                  title={t.menuShareBranchBtn}
                  aria-label={t.menuShareBranchBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEdgeContextMenu(null);
                    setEditingEdgeId(null);
                    setConnectingFrom({
                      kind: 'shared-condition',
                      sourceEdgeId: edge.id,
                      hubX: midX,
                      hubY: midY,
                    });
                    setConnectPointerWorld({ x: midX, y: midY });
                  }}
                  className="w-5 h-5 rounded-md bg-white border border-[#38BDF8] hover:bg-[#0284C7] hover:text-white text-[#0369A1] shadow-xs flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}

        {/* Shared Condition Hubs (1 Condition -> Multiple Targets) */}
        {sharedConditionGroups.map((group) => {
          const { key, primaryItem, items, hubX, hubY } = group;
          const primaryEdge = primaryItem.edge;
          const isEditing = items.some((i) => editingEdgeId === i.edge.id);
          const isActive = items.some((i) => activePlayEdgeSet.has(i.edge.id));
          const isLocated = items.some((i) => highlightedEdgeId === i.edge.id);
          const isHovered = items.some(
            (i) => hoveredEdgeId === i.edge.id || edgeContextMenu?.edgeId === i.edge.id,
          );
          const firstKind = primaryEdge.conditionGroup?.clauses[0]?.kind;
          const hasCond = Boolean(
            primaryEdge.condition?.trim() || primaryEdge.conditionGroup?.clauses.length,
          );

          return (
            <div
              key={`shared-hub-${key}`}
              style={{
                left: `${hubX}px`,
                top: `${hubY}px`,
              }}
              onMouseEnter={() => setHoveredEdgeId(primaryEdge.id)}
              onMouseLeave={() =>
                setHoveredEdgeId((prev) => (prev === primaryEdge.id ? null : prev))
              }
              onPointerDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => handleEdgeConditionContextMenu(primaryEdge, e)}
              className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 ${
                isEditing ? 'z-40' : 'z-35'
              }`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdgeContextMenu(primaryEdge, e);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border text-[11px] font-semibold shadow-sm transition-all whitespace-nowrap cursor-pointer ${
                  isEditing
                    ? 'border-[#0284C7] ring-2 ring-[#7DD3FC]/80 text-[#14244B]'
                    : isActive
                      ? 'border-[#F59E0B] ring-2 ring-[#FBC53D]/70 text-[#14244B]'
                      : isLocated
                        ? 'border-[#2563EB] ring-2 ring-[#4E9AE3]/60 text-[#14244B]'
                        : isHovered
                          ? 'border-[#14244B] text-[#14244B]'
                          : 'border-[#38BDF8] text-[#14244B]'
                }`}
              >
                {firstKind === 'event' ? (
                  <Zap className="w-3 h-3 text-[#0284C7] shrink-0" aria-hidden="true" />
                ) : firstKind === 'property' ? (
                  <SlidersHorizontal
                    className="w-3 h-3 text-[#047857] shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <span className="font-mono text-[10px] font-bold text-[#0369A1]">if</span>
                )}
                <span className="max-w-[180px] truncate">
                  {hasCond ? primaryEdge.condition : t.menuAddCondition}
                </span>
                <span className="px-1 py-0.25 rounded bg-[#E0F2FE] text-[#0369A1] font-mono text-[10px] font-bold shrink-0">
                  ×{items.length}
                </span>
              </button>

              <button
                type="button"
                title={t.menuShareBranchBtn}
                aria-label={t.menuShareBranchBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setEdgeContextMenu(null);
                  setEditingEdgeId(null);
                  setConnectingFrom({
                    kind: 'shared-condition',
                    sourceEdgeId: primaryEdge.id,
                    hubX,
                    hubY,
                  });
                  setConnectPointerWorld({ x: hubX, y: hubY });
                }}
                className="w-6 h-6 rounded-lg bg-white border border-[#38BDF8] hover:bg-[#0284C7] hover:text-white text-[#0369A1] shadow-sm flex items-center justify-center transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Screen-Space Structured Arrow Condition Builder Popover (Edge OR Group Available When) */}
      {(() => {
        if (editingEdgeId) {
          const targetComputed = computedEdges.find((item) => item.edge.id === editingEdgeId);
          if (!targetComputed) return null;
          const sharedGroup = targetComputed.edge.sharedConditionId
            ? sharedConditionGroups.find((g) =>
                g.items.some((i) => i.edge.id === targetComputed.edge.id),
              )
            : undefined;
          const rawWorldX = sharedGroup ? sharedGroup.hubX : targetComputed.midX;
          const rawWorldY = sharedGroup ? sharedGroup.hubY : targetComputed.midY;
          const anchorX = rawWorldX * zoom + pan.x;
          const anchorY = rawWorldY * zoom + pan.y;

          const seenDonorKeys = new Set<string>();
          const siblingDonorEdges =
            targetComputed.edgeType === 'flow'
              ? edges.filter((e) => {
                  if (e.id === targetComputed.edge.id) return false;
                  if (e.fromId !== targetComputed.edge.fromId) return false;
                  if (resolveEdgeType(e, nodeMap) !== 'flow') return false;
                  const condText = (e.condition ?? '').trim();
                  if (!condText && !e.conditionGroup?.clauses.length) return false;
                  const key = e.sharedConditionId ?? condText;
                  if (seenDonorKeys.has(key)) return false;
                  seenDonorKeys.add(key);
                  return true;
                })
              : [];

          return (
            <ArrowConditionBuilder
              key={targetComputed.edge.id}
              lang={lang}
              edge={targetComputed.edge}
              edgeType={targetComputed.edgeType}
              fromNode={targetComputed.from ?? targetComputed.to}
              nodes={nodes}
              assetItems={assetItems}
              scopedVariables={scopedVariables}
              numericParameters={numericBoardParameters}
              siblingDonorEdges={siblingDonorEdges}
              anchorX={anchorX}
              anchorY={anchorY}
              containerWidth={boardSize.width}
              containerHeight={boardSize.height}
              titleOverride={
                targetComputed.edgeType === 'association'
                  ? t.edgeCond.headerTitleAssoc
                  : t.edgeCond.headerTitleFlow
              }
              onSave={(summary, conditionGroup, options) => {
                onUpdateEdgeCondition(targetComputed.edge.id, summary, conditionGroup, options);
                setEditingEdgeId(null);
              }}
              onLinkSibling={(donorEdgeId) => {
                onLinkEdgeToSharedCondition(targetComputed.edge.id, donorEdgeId);
                setEditingEdgeId(null);
              }}
              onClear={() => {
                onUpdateEdgeCondition(targetComputed.edge.id, '', undefined);
                setEditingEdgeId(null);
              }}
              onClose={() => setEditingEdgeId(null)}
            />
          );
        }

        return null;
      })()}

      {/* Group Design Notes & ID Window (shown after Add Group or when editing Group ID/notes) */}
      {editingGroupInfo && (() => {
        const groupNode = nodeMap.get(editingGroupInfo.id);
        if (!groupNode || groupNode.kind !== 'group') return null;
        const defId = getGroupDefId(groupNode);
        const reusedCount = groupDefCounts.get(defId) ?? 1;
        return (
          <GroupInfoModal
            key={groupNode.id}
            lang={lang}
            groupNode={groupNode}
            nodes={nodes}
            initialCode={resolveGroupCode(groupNode, nodes)}
            initialTitle={groupNode.title}
            initialNote={groupNode.note}
            isReusedInstance={reusedCount > 1}
            reusedCount={reusedCount}
            focusField={editingGroupInfo.focusField}
            onSave={(groupCode, title, note) => {
              onUpdateNode(groupNode.id, { groupCode, title, note });
              setEditingGroupInfo(null);
            }}
            onClose={() => setEditingGroupInfo(null)}
          />
        );
      })()}

      {/* Screen-Space Edge Context Menu: 1) Line Format vs 2) Optional Condition */}
      {edgeContextMenu && contextMenuEdge && (() => {
        const ctxEdgeType = resolveEdgeType(contextMenuEdge, nodeMap);
        const isAssocEdge = ctxEdgeType === 'association';
        const isEntryEdge = contextMenuEdge.fromId === null;
        const hasCtxCondition = Boolean(
          contextMenuEdge.condition?.trim() ||
            contextMenuEdge.conditionGroup?.clauses.length,
        );
        return (
          <div
            data-board-overlay="true"
            style={{
              left: `${Math.max(12, Math.min(Math.max(12, boardSize.width - 284), edgeContextMenu.x))}px`,
              top: `${Math.max(12, Math.min(Math.max(12, boardSize.height - 320), edgeContextMenu.y))}px`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            className="absolute z-50 w-[272px] bg-white rounded-xl border border-[#CBD5E1] shadow-[0_14px_34px_rgba(20,36,75,0.2)] p-2 space-y-2"
          >
            {/* Section 1: Line Format */}
            <div className="space-y-1">
              <div className="px-1 text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
                {t.menuSectionFormat}
              </div>

              {!isEntryEdge ? (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isAssocEdge) {
                        onUpdateEdgeType(contextMenuEdge.id, 'association');
                      }
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors flex items-center gap-2.5 cursor-pointer ${
                      isAssocEdge
                        ? 'bg-[#EEF2FF] border-[#818CF8] text-[#312E81]'
                        : 'bg-white border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#334155]'
                    }`}
                  >
                    <svg
                      width="26"
                      height="12"
                      viewBox="0 0 26 12"
                      className="shrink-0"
                      aria-hidden="true"
                    >
                      <line
                        x1="4"
                        y1="6"
                        x2="22"
                        y2="6"
                        stroke={isAssocEdge ? '#4F46E5' : '#64748B'}
                        strokeWidth="2"
                        strokeDasharray="3 3"
                      />
                      <circle
                        cx="4"
                        cy="6"
                        r="2.4"
                        fill="#FFFFFF"
                        stroke={isAssocEdge ? '#4F46E5' : '#64748B'}
                        strokeWidth="1.6"
                      />
                      <circle
                        cx="22"
                        cy="6"
                        r="2.4"
                        fill="#FFFFFF"
                        stroke={isAssocEdge ? '#4F46E5' : '#64748B'}
                        strokeWidth="1.6"
                      />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11.5px] font-bold leading-tight">
                        {t.menuFormatAssocTitle}
                      </div>
                      <div className="text-[10px] text-[#64748B] leading-snug">
                        {t.menuFormatAssocHint}
                      </div>
                    </div>
                    {isAssocEdge && (
                      <Check
                        className="w-3.5 h-3.5 text-[#4F46E5] shrink-0"
                        aria-hidden="true"
                      />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (isAssocEdge) {
                        onUpdateEdgeType(contextMenuEdge.id, 'flow');
                      }
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors flex items-center gap-2.5 cursor-pointer ${
                      !isAssocEdge
                        ? 'bg-[#F0F9FF] border-[#38BDF8] text-[#14244B]'
                        : 'bg-white border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#334155]'
                    }`}
                  >
                    <svg
                      width="26"
                      height="12"
                      viewBox="0 0 26 12"
                      className="shrink-0"
                      aria-hidden="true"
                    >
                      <line
                        x1="2"
                        y1="6"
                        x2="19"
                        y2="6"
                        stroke={!isAssocEdge ? '#0284C7' : '#64748B'}
                        strokeWidth="2"
                      />
                      <path
                        d="M 17 2.2 L 24 6 L 17 9.8 Z"
                        fill={!isAssocEdge ? '#0284C7' : '#64748B'}
                      />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11.5px] font-bold leading-tight">
                        {t.menuFormatFlowTitle}
                      </div>
                      <div className="text-[10px] text-[#64748B] leading-snug">
                        {t.menuFormatFlowHint}
                      </div>
                    </div>
                    {!isAssocEdge && (
                      <Check
                        className="w-3.5 h-3.5 text-[#0284C7] shrink-0"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </div>
              ) : (
                <div className="px-2.5 py-2 rounded-lg bg-[#F0F9FF] border border-[#BAE6FD] flex items-center gap-2.5">
                  <svg
                    width="26"
                    height="12"
                    viewBox="0 0 26 12"
                    className="shrink-0"
                    aria-hidden="true"
                  >
                    <circle cx="4" cy="6" r="2.6" fill="#0284C7" />
                    <line
                      x1="6.5"
                      y1="6"
                      x2="19"
                      y2="6"
                      stroke="#0284C7"
                      strokeWidth="2"
                    />
                    <path d="M 17 2.2 L 24 6 L 17 9.8 Z" fill="#0284C7" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11.5px] font-bold text-[#14244B] leading-tight">
                      {t.menuFormatFlowTitle}
                    </div>
                    <div className="text-[10px] text-[#0369A1] leading-snug">
                      {t.menuFormatEntryLockedHint}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[#E2E8F0]" />

            <button
              type="button"
              onClick={() => {
                onDeleteEdge(contextMenuEdge.id);
                setEdgeContextMenu(null);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#DC2626] hover:bg-[#FEF2F2] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t.menuDeleteEdge}</span>
            </button>
          </div>
        );
      })()}

      {/* Screen-Space Action Card Context Menu (Shift / Cmd+Click Multi-Select -> Combo) */}
      {nodeContextMenu && contextMenuNode && contextMenuNode.kind === 'action' && (() => {
        const comboTargetIds =
          multiSelectedActionIds.length >= 2 &&
          multiSelectedActionIds.includes(contextMenuNode.id)
            ? multiSelectedActionIds
            : multiSelectedActionIds.length >= 2
              ? multiSelectedActionIds
              : [contextMenuNode.id];
        const canCombineMulti = comboTargetIds.length >= 2;
        return (
          <div
            data-board-overlay="true"
            style={{
              left: `${Math.max(12, Math.min(Math.max(12, boardSize.width - 252), nodeContextMenu.x))}px`,
              top: `${Math.max(12, Math.min(Math.max(12, boardSize.height - 160), nodeContextMenu.y))}px`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            className="absolute z-50 w-[240px] bg-white rounded-xl border border-[#CBD5E1] shadow-[0_14px_34px_rgba(20,36,75,0.2)] p-2 space-y-1.5"
          >
            <div className="px-1 flex items-center justify-between text-[10.5px] font-bold text-[#64748B]">
              <span>Action</span>
              {canCombineMulti && (
                <span className="px-1.5 py-0.25 rounded-full bg-[#E0F2FE] text-[#0369A1] font-mono">
                  {comboTargetIds.length} {t.actionMenuSelectedSuffix}
                </span>
              )}
            </div>

            {canCombineMulti ? (
              <button
                type="button"
                onClick={() => {
                  createComboBoxAroundActions(comboTargetIds);
                  setNodeContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg bg-[#F0F9FF] hover:bg-[#E0F2FE] border border-[#38BDF8] text-xs font-bold text-[#0369A1] flex items-center gap-2 transition-colors cursor-pointer"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                  className="shrink-0"
                >
                  <rect
                    x="1.5"
                    y="1.5"
                    width="9"
                    height="9"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeDasharray="2.5 1.8"
                  />
                </svg>
                <span className="truncate">
                  {t.actionMenuComboCreate} ({comboTargetIds.length})
                </span>
              </button>
            ) : (
              <div className="space-y-1.5">
                <div className="px-2 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[10.5px] text-[#64748B] leading-snug">
                  {t.actionMenuComboNeedMore}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    createComboBoxAroundActions([contextMenuNode.id]);
                    setNodeContextMenu(null);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg border border-dashed border-[#38BDF8] hover:bg-[#F0F9FF] text-[11px] font-semibold text-[#0369A1] flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{t.addComboBtn}</span>
                </button>
              </div>
            )}

            <div className="border-t border-[#E2E8F0]" />

            <button
              type="button"
              onClick={() => {
                if (expandedNodeId === contextMenuNode.id) setExpandedNodeId(null);
                setMultiSelectedActionIds((prev) =>
                  prev.filter((id) => id !== contextMenuNode.id),
                );
                onDeleteNode(contextMenuNode.id);
                setNodeContextMenu(null);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#DC2626] hover:bg-[#FEF2F2] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t.deleteCard}</span>
            </button>
          </div>
        );
      })()}

      {/* Centralized Groups Directory Panel */}
      {groupDirectoryOpen && (
        <GroupDirectoryPanel
          lang={lang}
          nodes={nodes}
          edges={edges}
          onClose={() => setGroupDirectoryOpen(false)}
          onAddGroup={() => handleAddKindInViewport('group')}
          onUpdateGroupInfo={(id, groupCode, title, note) =>
            onUpdateNode(id, { groupCode, title, note })
          }
          onToggleGroupCollapse={onToggleGroupCollapse}
          onLocateGroup={(id) => onLocateBoardReference({ nodeId: id })}
          onUngroupDefinition={onUngroupDefinition}
          onDeleteGroupDefinition={onDeleteGroupDefinition}
        />
      )}

      {/* Floating Categorized Properties Panel (scoped strictly over Design Board so right Play stays visible!) */}
      {stateManagerOpen && (
        <StateManagerPanel
          lang={lang}
          assetItems={assetItems}
          scopedVariables={scopedVariables}
          nodes={nodes}
          edges={edges}
          onClose={() => onToggleStateManager(false)}
          onAddGlobalVariable={onAddGlobalVariable}
          onAddAssetProperty={onAddAssetProperty}
          onUpdateVariable={onUpdateVariable}
          onMoveVariableScope={onMoveVariableScope}
          onDeleteVariable={onDeleteVariable}
          onUpdatePlayValue={onUpdatePlayValue}
          onApplyPlayToInitial={onApplyPlayToInitial}
          onResetPlayValue={onResetPlayValue}
          onResetAllPlayValues={onResetAllPlayValues}
          onJumpToAssetProperty={onJumpToAssetProperty}
          onLocateBoardReference={onLocateBoardReference}
        />
      )}

      {/* Responsive Bottom Board Toolbars (never overlap or clip on narrower viewports) */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-40 flex flex-wrap items-end justify-between gap-2">
        {/* Left: Board Authoring Toolbelt */}
        <div className="relative pointer-events-auto max-w-full">
          {addMenuOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-64 max-w-[calc(100vw-2rem)] max-h-[min(430px,calc(100vh-170px))] overflow-y-auto bg-white rounded-xl border border-[#E2E8F0] shadow-[0_14px_34px_rgba(20,36,75,0.16)] p-2 space-y-2">
              <div>
                <div className="px-2 pb-1 text-[10px] font-bold text-[#B45309] tracking-wide">
                  {t.groupNarrative}
                </div>
                <div className="space-y-0.5">
                  {NARRATIVE_KINDS.map((kind) => {
                    const meta = NODE_CATALOG[kind];
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => handleAddKindInViewport(kind)}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#FFFBEB] flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <svg
                          aria-hidden="true"
                          width="20"
                          height="18"
                          viewBox="0 0 20 18"
                          className="shrink-0"
                        >
                          <path
                            d="M 4 1.5 H 16 A 2.5 2.5 0 0 1 18.5 4 V 11 A 2.5 2.5 0 0 1 16 13.5 H 9.5 L 5 16.5 L 5.5 13.5 H 4 A 2.5 2.5 0 0 1 1.5 11 V 4 A 2.5 2.5 0 0 1 4 1.5 Z"
                            fill={meta.surfaceBg}
                            stroke={meta.borderColor}
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#14244B] truncate">
                            {lang === 'zh' ? meta.labelZh : meta.labelEn}
                          </div>
                          <div className="text-[10.5px] text-[#64748B] truncate">
                            {lang === 'zh' ? meta.shortHintZh : meta.shortHintEn}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-1.5 border-t border-[#F1F5F9]">
                <div className="px-2 pb-1 text-[10px] font-bold text-[#0369A1] tracking-wide">
                  {t.groupGameplay}
                </div>
                <div className="space-y-0.5">
                  {GAMEPLAY_KINDS.map((kind) => {
                    const meta = NODE_CATALOG[kind];
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => handleAddKindInViewport(kind)}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#F0F9FF] flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <span
                          className="w-5 h-4 rounded-[3px] border-2 shrink-0"
                          style={{
                            backgroundColor: meta.surfaceBg,
                            borderColor: meta.borderColor,
                          }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#14244B] truncate">
                            {lang === 'zh' ? meta.labelZh : meta.labelEn}
                          </div>
                          <div className="text-[10.5px] text-[#64748B] truncate">
                            {lang === 'zh' ? meta.shortHintZh : meta.shortHintEn}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {(['property','visual'] as const).map(mode=><button key={mode} onClick={()=>handleAddKindInViewport('outcome',mode)} className="w-full text-left px-2 py-2 rounded-lg hover:bg-emerald-50"><div className="text-xs font-semibold text-emerald-800">{mode==='property'?(lang==='zh'?'属性变化':'Property outcome'):(lang==='zh'?'视觉变化':'Visual outcome')}</div><div className="text-[10.5px] text-slate-500">{mode==='property'?(lang==='zh'?'改变一个属性的值':'Change one property value'):(lang==='zh'?'对一个目标施加一种效果':'Apply one effect to one target')}</div></button>)}
                </div>
              </div>

              <div className="pt-1.5 border-t border-[#F1F5F9]">
                <div className="px-2 pb-1 text-[10px] font-bold text-[#64748B] tracking-wide">
                  {t.groupDraft}
                </div>
                <button
                  type="button"
                  onClick={() => handleAddKindInViewport('draft')}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#F8FAFC] flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <span
                    className="w-5 h-4 rounded-[2px] border border-dashed shrink-0"
                    style={{
                      backgroundColor: NODE_CATALOG.draft.surfaceBg,
                      borderColor: NODE_CATALOG.draft.borderColor,
                    }}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#475569] truncate">
                      {lang === 'zh'
                        ? NODE_CATALOG.draft.labelZh
                        : NODE_CATALOG.draft.labelEn}
                    </div>
                    <div className="text-[10.5px] text-[#94A3B8] truncate">
                      {lang === 'zh'
                        ? NODE_CATALOG.draft.shortHintZh
                        : NODE_CATALOG.draft.shortHintEn}
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1 bg-white/95 backdrop-blur-xs rounded-xl border border-[#E2E8F0] shadow-xs p-1">
            <button
              type="button"
              onClick={() => setAddMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#14244B] hover:bg-[#1E3468] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B]"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.addMenu}</span>
              <ChevronUp
                className={`w-3.5 h-3.5 transition-transform ${addMenuOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            <button
              type="button"
              onClick={() => handleAddKindInViewport('group')}
              title={lang === 'zh' ? NODE_CATALOG.group.shortHintZh : NODE_CATALOG.group.shortHintEn}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#14244B] border border-[#CBD5E1] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B]"
            >
              <Layers className="w-3.5 h-3.5 text-[#334155]" aria-hidden="true" />
              <span>{t.addGroupBtn}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAddMenuOpen(false);
                if (!groupDirectoryOpen && stateManagerOpen) {
                  onToggleStateManager(false);
                }
                setGroupDirectoryOpen((v) => !v);
              }}
              aria-pressed={groupDirectoryOpen}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B] ${
                groupDirectoryOpen
                  ? 'bg-[#14244B] text-white'
                  : 'text-[#475569] hover:text-[#14244B] hover:bg-[#F1F5F9]'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.groupsDirBtn}</span>
              {groupCountTotal > 0 && (
                <span className="font-mono text-[11px] tabular-nums opacity-75">
                  {groupCountTotal}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleAddComboFrameInViewport}
              title={t.addComboTitle}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F0F9FF] hover:bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
                className="shrink-0"
              >
                <rect
                  x="1.5"
                  y="1.5"
                  width="11"
                  height="11"
                  rx="2.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeDasharray="3 2"
                />
              </svg>
              <span>{t.addComboBtn}</span>
            </button>

            <button
              type="button"
              disabled={nodes.filter((n) => NODE_CATALOG[n.kind].isPlayable).length < 1}
              onClick={() => {
                setAddMenuOpen(false);
                if (isConnectingActive) {
                  exitConnectMode();
                } else {
                  setIsConnectMode(true);
                  setConnectingFrom(null);
                  setConnectPointerWorld(null);
                  portDragRef.current = null;
                  airDragRef.current = null;
                }
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B] ${
                isConnectingActive
                  ? 'bg-[#2563EB] text-white cursor-pointer'
                  : nodes.filter((n) => NODE_CATALOG[n.kind].isPlayable).length < 1
                    ? 'text-[#94A3B8] cursor-not-allowed'
                    : 'text-[#475569] hover:text-[#14244B] hover:bg-[#F1F5F9] cursor-pointer'
              }`}
            >
              <GitCommitHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isConnectingActive ? t.cancelConnect : t.connectMode}</span>
            </button>

            <div aria-hidden="true" className="w-px h-4 bg-[#E2E8F0] mx-0.5" />

            <button
              type="button"
              onClick={() => {
                setAddMenuOpen(false);
                setGroupDirectoryOpen(false);
                onToggleStateManager();
              }}
              aria-pressed={stateManagerOpen}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B] ${
                stateManagerOpen
                  ? 'bg-[#14244B] text-white'
                  : dirtyVarCount > 0
                    ? 'bg-[#FFFBEB] text-[#B45309] hover:bg-[#FEF3C7]'
                    : 'text-[#475569] hover:text-[#14244B] hover:bg-[#F1F5F9]'
              }`}
            >
              <Database className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{st.toolbarBtn}</span>
              {scopedVariables.length > 0 && (
                <span className="font-mono text-[11px] tabular-nums opacity-75">
                  {scopedVariables.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Right: Miro Zoom Toolbar */}
        <div className="pointer-events-auto flex items-center gap-0.5 bg-white/95 backdrop-blur-xs rounded-xl border border-[#E2E8F0] shadow-xs p-1 shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => handleZoomStep(-0.15)}
            title={t.zoomOut}
            aria-label={t.zoomOut}
            className="w-7 h-7 rounded-lg text-[#475569] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-pointer"
          >
            <Minus className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <span className="px-1.5 font-mono text-xs font-medium tabular-nums text-[#14244B] min-w-[44px] text-center">
            {Math.round(zoom * 100)}%
          </span>

          <button
            type="button"
            onClick={() => handleZoomStep(0.15)}
            title={t.zoomIn}
            aria-label={t.zoomIn}
            className="w-7 h-7 rounded-lg text-[#475569] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <div aria-hidden="true" className="w-px h-4 bg-[#E2E8F0] mx-0.5" />

          <button
            type="button"
            onClick={handleFitView}
            title={t.fitView}
            aria-label={t.fitView}
            className="w-7 h-7 rounded-lg text-[#475569] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
