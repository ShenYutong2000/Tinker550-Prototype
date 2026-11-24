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
  Database,
  GitCommitHorizontal,
  Maximize2,
  MessageSquareQuote,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  StickyNote,
  Trash2,
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
  defaultConditionForVariable,
  type ScopedStateVariable,
  type StateVariable,
  type StateVariableValue,
} from '../properties/stateModel';
import {
  CARD_EXPANDED_WIDTH,
  NODE_CATALOG,
  formatActionControlKey,
  getNodeAssetIds,
  getNodeDimensions,
  type BoardEdge,
  type BoardNode,
  type CardFieldConfig,
  type NodeKind,
} from './studioModel';
import { StateManagerPanel } from '../properties/StateManagerPanel';
import { CardExpandedPanel } from './cards/CardExpandedPanel';
import { CardPromptFront } from './cards/CardPromptFront';

interface DesignBoardProps {
  lang: Language;
  nodes: BoardNode[];
  edges: BoardEdge[];
  assetItems: AssetItem[];
  scopedVariables: ScopedStateVariable[];
  stateManagerOpen: boolean;
  focusTarget: { nodeId?: string; edgeId?: string; nonce: number } | null;
  selectedNodeId: string | null;
  autoFocusNodeId: string | null;
  activePlayNodeIds: string[];
  activePlayEdgeId: string | null;
  onSelectNode: (id: string | null) => void;
  onConsumeAutoFocus: () => void;
  onDragNode: (id: string, dx: number, dy: number) => void;
  onUpdateNode: (
    id: string,
    patch: Partial<Pick<BoardNode, 'title' | 'note' | 'assetId' | 'assetIds' | 'promptInput' | 'challengeAssetId'>>,
  ) => void;
  onUpdateNodeField: <K extends keyof CardFieldConfig>(
    id: string,
    key: K,
    value: CardFieldConfig[K],
  ) => void;
  onResetNodeAutoFields: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onAddNodeAt: (kind: NodeKind, worldX: number, worldY: number) => void;
  onConnectNodes: (fromId: string, toId: string) => void;
  onUpdateEdgeCondition: (edgeId: string, condition: string) => void;
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
    case 'draft':
      return <StickyNote {...props} />;
  }
}

interface EdgePathResult {
  path: string;
  midX: number;
  midY: number;
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
  };
}

const NARRATIVE_KINDS: NodeKind[] = ['narration', 'dialogue'];
const GAMEPLAY_KINDS: NodeKind[] = ['challenge', 'action', 'outcome'];

export function DesignBoard({
  lang,
  nodes,
  edges,
  assetItems,
  scopedVariables,
  stateManagerOpen,
  focusTarget,
  selectedNodeId,
  autoFocusNodeId,
  activePlayNodeIds,
  activePlayEdgeId,
  onSelectNode,
  onConsumeAutoFocus,
  onDragNode,
  onUpdateNode,
  onUpdateNodeField,
  onResetNodeAutoFields,
  onDeleteNode,
  onAddNodeAt,
  onConnectNodes,
  onUpdateEdgeCondition,
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
  const [edgeConditionDraft, setEdgeConditionDraft] = useState('');
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [edgeContextMenu, setEdgeContextMenu] = useState<{
    edgeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{
    nodeId: string;
    side: 'left' | 'right';
  } | null>(null);
  const connectingFromId = connectingFrom?.nodeId ?? null;
  const [connectPointerWorld, setConnectPointerWorld] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
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
  } | null>(null);

  const portDragRef = useRef<{
    fromNodeId: string;
    startClientX: number;
    startClientY: number;
    moved: boolean;
  } | null>(null);

  // Immediately focus newly added blank card for instant typing
  useEffect(() => {
    if (!autoFocusNodeId) return;
    setEditingNodeId(autoFocusNodeId);
    setFreshFocusNodeId(autoFocusNodeId);
    setExpandedNodeId(null);
    onConsumeAutoFocus();
  }, [autoFocusNodeId, onConsumeAutoFocus]);

  const activePlaySet = useMemo(() => new Set(activePlayNodeIds), [activePlayNodeIds]);
  const loopEdgeIds = useMemo(() => computeLoopEdgeIds(nodes, edges), [nodes, edges]);
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const edgeMap = useMemo(() => new Map(edges.map((e) => [e.id, e])), [edges]);
  const numericBoardParameters = useMemo(
    () => collectNumericBoardParameters(nodes),
    [nodes],
  );
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
        const from = nodeMap.get(targetEdge.fromId);
        const to = nodeMap.get(targetEdge.toId);
        if (from && to) {
          const geom = getEdgeGeometry(from, to, loopEdgeIds.has(targetEdge.id));
          worldCx = geom.midX;
          worldCy = geom.midY;
          setHighlightedEdgeId(targetEdge.id);
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
        setConnectingFrom(null);
        setConnectPointerWorld(null);
        portDragRef.current = null;
        setEditingNodeId(null);
        setExpandedNodeId(null);
        setEditingEdgeId(null);
        setEdgeContextMenu(null);
        setAddMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
  }, [nodes]);

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    setEdgeContextMenu(null);
    if (event.target !== event.currentTarget) return;
    if (event.button !== 0) return;

    onSelectNode(null);
    setEditingNodeId(null);
    setExpandedNodeId(null);
    setEditingEdgeId(null);
    setAddMenuOpen(false);

    if (connectingFrom) {
      setConnectingFrom(null);
      setConnectPointerWorld(null);
      portDragRef.current = null;
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

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (portDragRef.current) {
      const dx = event.clientX - portDragRef.current.startClientX;
      const dy = event.clientY - portDragRef.current.startClientY;
      if (Math.hypot(dx, dy) > 6) {
        portDragRef.current.moved = true;
      }
    }

    if (connectingFrom) {
      setConnectPointerWorld(clientToWorld(event.clientX, event.clientY));
    }

    if (nodeDragRef.current) {
      const drag = nodeDragRef.current;
      const dx = (event.clientX - drag.lastClientX) / zoom;
      const dy = (event.clientY - drag.lastClientY) / zoom;
      drag.lastClientX = event.clientX;
      drag.lastClientY = event.clientY;
      onDragNode(drag.id, dx, dy);
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

  const handleCanvasPointerUp = () => {
    panDragRef.current = null;
    nodeDragRef.current = null;
    if (portDragRef.current?.moved) {
      // Released a dragged connection onto empty canvas -> cancel cleanly
      setConnectingFrom(null);
      setConnectPointerWorld(null);
    }
    portDragRef.current = null;
    setDraggingNodeId(null);
    setIsPanning(false);
  };

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
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('[data-card-popover="true"]')
    ) {
      return;
    }
    event.stopPropagation();
    setAddMenuOpen(false);
    setEditingEdgeId(null);
    setEdgeContextMenu(null);

    if (connectingFromId) {
      if (connectingFromId !== node.id && NODE_CATALOG[node.kind].isPlayable) {
        onConnectNodes(connectingFromId, node.id);
      }
      setConnectingFrom(null);
      setConnectPointerWorld(null);
      portDragRef.current = null;
      return;
    }

    onSelectNode(node.id);
    setDraggingNodeId(node.id);
    nodeDragRef.current = {
      id: node.id,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
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
    setEdgeContextMenu(null);

    if (connectingFrom && connectingFrom.nodeId !== node.id) {
      onConnectNodes(connectingFrom.nodeId, node.id);
      setConnectingFrom(null);
      setConnectPointerWorld(null);
      portDragRef.current = null;
      return;
    }

    if (connectingFrom && connectingFrom.nodeId === node.id && connectingFrom.side === side) {
      setConnectingFrom(null);
      setConnectPointerWorld(null);
      portDragRef.current = null;
      return;
    }

    setConnectingFrom({ nodeId: node.id, side });
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
      portDragRef.current?.moved &&
      connectingFrom &&
      connectingFrom.nodeId !== node.id &&
      NODE_CATALOG[node.kind].isPlayable
    ) {
      event.stopPropagation();
      onConnectNodes(connectingFrom.nodeId, node.id);
      setConnectingFrom(null);
      setConnectPointerWorld(null);
      portDragRef.current = null;
    }
  };

  const handleAddKindInViewport = (kind: NodeKind) => {
    setAddMenuOpen(false);
    const selected = selectedNodeId ? nodeMap.get(selectedNodeId) : null;
    if (selected) {
      onAddNodeAt(kind, Math.round(selected.x + 280), Math.round(selected.y));
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      onAddNodeAt(kind, 180, 180);
      return;
    }
    const cx = (rect.width / 2 - pan.x) / zoom - 122;
    const cy = ((rect.height + 80) / 2 - pan.y) / zoom - 64;
    const offset = nodes.length === 0 ? 0 : ((nodes.length % 4) - 1.5) * 32;
    onAddNodeAt(kind, Math.round(cx + offset), Math.round(cy + offset * 0.6));
  };

  const openEdgeConditionEditor = (edge: BoardEdge) => {
    setEdgeContextMenu(null);
    setEditingNodeId(null);
    setExpandedNodeId(null);
    setEditingEdgeId(edge.id);
    setEdgeConditionDraft(edge.condition ?? '');
  };

  const handleEdgeContextMenu = (
    edge: BoardEdge,
    event: ReactMouseEvent<SVGElement | HTMLDivElement>,
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
    setEdgeContextMenu({ edgeId: edge.id, x, y });
  };

  const commitEdgeCondition = (edgeId: string) => {
    onUpdateEdgeCondition(edgeId, edgeConditionDraft.trim());
    setEditingEdgeId(null);
  };

  const connectingSourceNode = connectingFrom ? nodeMap.get(connectingFrom.nodeId) : null;
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

  const computedEdges = useMemo(() => {
    return edges
      .map((edge) => {
        const from = nodeMap.get(edge.fromId);
        const to = nodeMap.get(edge.toId);
        if (!from || !to) return null;
        const isLoop = loopEdgeIds.has(edge.id);
        const geom = getEdgeGeometry(from, to, isLoop, expandedNodeId);
        return { edge, from, to, isLoop, ...geom };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [edges, expandedNodeId, loopEdgeIds, nodeMap]);

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
    const kindLabel = lang === 'zh' ? meta.labelZh : meta.labelEn;
    const placeholderText = lang === 'zh' ? meta.placeholderZh : meta.placeholderEn;
    const isDraft = !meta.isPlayable;
    const isSelected = selectedNodeId === node.id;
    const isPlaying = activePlaySet.has(node.id);
    const isEditingDraft = isDraft && editingNodeId === node.id;
    const isExpanded = meta.isPlayable && expandedNodeId === node.id;
    const isDragging = draggingNodeId === node.id;
    const isConnectSource = connectingFromId === node.id;
    const isConnectCandidate = Boolean(
      connectingFromId && connectingFromId !== node.id && meta.isPlayable,
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
        onPointerDown={(e) => handleNodePointerDown(node, e)}
        onPointerUp={(e) => handleTargetCardPointerUp(node, e)}
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
          borderColor: activeBorderColor,
        }}
        className={`pointer-events-auto absolute ${meta.shapeClass} ${
          isDraft ? 'border border-dashed' : 'border-2'
        } transition-shadow duration-150 flex flex-col ${zIndexClass} ${
          highlightedNodeId === node.id
            ? 'ring-4 ring-[#4E9AE3]/80 shadow-[0_14px_34px_rgba(78,154,227,0.3)]'
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
              <span className="text-[10.5px] text-[#64748B] truncate">
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
                isConnectSource && connectingFrom?.side === 'left'
                  ? 'bg-[#14244B] border-white scale-115 shadow-xs'
                  : isConnectCandidate
                    ? 'bg-white border-[#2563EB] ring-2 ring-[#4E9AE3]/35 hover:scale-115'
                    : 'bg-white border-[#64748B] hover:border-[#14244B] hover:scale-115'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnectSource && connectingFrom?.side === 'left'
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
                isConnectSource && connectingFrom?.side === 'right'
                  ? 'bg-[#14244B] border-white scale-115 shadow-xs'
                  : isConnectCandidate
                    ? 'bg-white border-[#2563EB] ring-2 ring-[#4E9AE3]/35 hover:scale-115'
                    : 'bg-white border-[#64748B] hover:border-[#14244B] hover:scale-115'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnectSource && connectingFrom?.side === 'right'
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

  return (
    <div
      ref={containerRef}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onPointerLeave={handleCanvasPointerUp}
      onContextMenu={(e) => {
        if (e.target === e.currentTarget) {
          setEdgeContextMenu(null);
        }
      }}
      style={{
        backgroundColor: '#F8FAFC',
        backgroundImage: `radial-gradient(#CBD5E1 ${Math.max(1, 1.2 * zoom)}px, transparent ${Math.max(1, 1.2 * zoom)}px)`,
        backgroundSize: `${gridSpacing}px ${gridSpacing}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
      className={`relative flex-1 min-h-0 overflow-hidden select-none ${
        connectingFromId
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
      {connectingFromId && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 bg-[#14244B] text-white text-xs font-medium px-4 py-2 rounded-xl shadow-md flex items-center gap-2.5 whitespace-nowrap">
          <span>{t.connectingHint}</span>
          <button
            type="button"
            onClick={() => {
              setConnectingFrom(null);
              setConnectPointerWorld(null);
              portDragRef.current = null;
            }}
            aria-label={t.cancelConnect}
            className="text-white/75 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* World Transform Layer */}
      <div
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
        className="absolute top-0 left-0 w-0 h-0 pointer-events-none"
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

          {computedEdges.map(({ edge, path, isLoop }) => {
            const isActive = activePlayEdgeId === edge.id;
            const isLocated = highlightedEdgeId === edge.id;
            const isHovered =
              hoveredEdgeId === edge.id ||
              editingEdgeId === edge.id ||
              edgeContextMenu?.edgeId === edge.id;

            const strokeColor = isActive
              ? '#F59E0B'
              : isLocated
                ? '#2563EB'
                : isHovered
                  ? '#14244B'
                  : isLoop
                    ? '#0D9488'
                    : '#64748B';

            const marker = isActive
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
                onContextMenu={(e) => handleEdgeContextMenu(edge, e)}
                className="pointer-events-auto cursor-context-menu"
              >
                <path d={path} fill="none" stroke="transparent" strokeWidth="20" />
                <path
                  d={path}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isActive || isLocated ? '3.4' : isHovered ? '2.8' : '2.1'}
                  strokeDasharray={isLoop ? '6 4' : undefined}
                  markerEnd={marker}
                />
              </g>
            );
          })}

          {connectingSourceNode && connectingSourceDim && connectingFrom && connectPointerWorld && (
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
        </svg>

        {/* Render Experience Cards & Draft Stickies */}
        {nodes.map(renderCard)}

        {/* Condition Mini-Cards ONLY when attached or currently being edited */}
        {computedEdges.map(({ edge, midX, midY, isLoop }) => {
          const isEditing = editingEdgeId === edge.id;
          const isActive = activePlayEdgeId === edge.id;
          const hasCondition = Boolean(edge.condition?.trim());

          if (!isEditing && !hasCondition) return null;

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
              onContextMenu={(e) => handleEdgeContextMenu(edge, e)}
              className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 ${
                isEditing ? 'z-50' : 'z-35'
              }`}
            >
              {isEditing ? (
                <div className="bg-white rounded-xl border-2 border-[#14244B] shadow-[0_12px_28px_rgba(20,36,75,0.22)] p-2 space-y-1.5">
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <span className="text-[10px] font-mono font-bold text-[#0369A1] pl-1">
                      if
                    </span>
                    <input
                      type="text"
                      autoFocus
                      value={edgeConditionDraft}
                      placeholder={t.editConditionPlaceholder}
                      onChange={(e) => setEdgeConditionDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          commitEdgeCondition(edge.id);
                        } else if (e.key === 'Escape') {
                          setEditingEdgeId(null);
                        }
                      }}
                      className="w-40 text-xs text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] rounded-md px-2 py-1 focus:outline-none focus:border-[#14244B]"
                    />
                    <button
                      type="button"
                      onClick={() => commitEdgeCondition(edge.id)}
                      title={t.saveCondition}
                      aria-label={t.saveCondition}
                      className="w-6 h-6 rounded-md bg-[#14244B] hover:bg-[#1E3468] text-white flex items-center justify-center cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    {hasCondition && (
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateEdgeCondition(edge.id, '');
                          setEditingEdgeId(null);
                        }}
                        title={t.clearCondition}
                        aria-label={t.clearCondition}
                        className="w-6 h-6 rounded-md text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {scopedVariables.length > 0 && (
                    <div className="pt-1 border-t border-[#F1F5F9] space-y-1 max-w-[260px]">
                      <div className="text-[10px] font-semibold text-[#64748B]">
                        {st.pickVarHint}
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {scopedVariables.slice(0, 6).map((entry) => {
                          const expr = defaultConditionForVariable(entry);
                          return (
                            <button
                              key={entry.variable.id}
                              type="button"
                              onClick={() => setEdgeConditionDraft(expr)}
                              className="px-1.5 py-0.5 rounded bg-[#F0F9FF] hover:bg-[#E0F2FE] border border-[#BAE6FD] text-[10px] font-mono font-semibold text-[#0369A1] transition-colors cursor-pointer whitespace-nowrap"
                            >
                              {expr}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1 flex-wrap">
                    {(lang === 'zh'
                      ? ['当血量 > 2', '分数 >= 2', '拿到钥匙时']
                      : ['HP > 2', 'Score >= 2', 'Has key']
                    ).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          onUpdateEdgeCondition(edge.id, preset);
                          setEditingEdgeId(null);
                        }}
                        className="px-1.5 py-0.5 rounded bg-[#F1F5F9] hover:bg-[#E0F2FE] text-[10px] font-medium text-[#334155] hover:text-[#0369A1] transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openEdgeConditionEditor(edge)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border text-[11px] font-semibold shadow-xs transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'border-[#F59E0B] ring-2 ring-[#FBC53D]/60 text-[#14244B]'
                      : highlightedEdgeId === edge.id
                        ? 'border-[#2563EB] ring-2 ring-[#4E9AE3]/60 text-[#14244B]'
                        : isLoop
                          ? 'border-[#0D9488]/60 text-[#14244B] hover:border-[#14244B]'
                          : 'border-[#CBD5E1] text-[#14244B] hover:border-[#14244B]'
                  }`}
                >
                  {isLoop && (
                    <RotateCcw
                      className="w-3 h-3 text-[#0D9488] shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <span className="font-mono text-[10px] font-bold text-[#0369A1]">
                    if
                  </span>
                  <span className="max-w-[140px] truncate">{edge.condition}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Screen-Space Right-Click Arrow Context Menu */}
      {edgeContextMenu && contextMenuEdge && (
        <div
          style={{ left: `${edgeContextMenu.x}px`, top: `${edgeContextMenu.y}px` }}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          className="absolute z-50 w-48 bg-white rounded-xl border border-[#CBD5E1] shadow-[0_14px_34px_rgba(20,36,75,0.2)] p-1.5 space-y-0.5"
        >
          <button
            type="button"
            onClick={() => openEdgeConditionEditor(contextMenuEdge)}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#14244B] hover:bg-[#F0F9FF] hover:text-[#0369A1] transition-colors cursor-pointer"
          >
            {contextMenuEdge.condition?.trim()
              ? t.menuEditCondition
              : t.menuAddCondition}
          </button>

          {contextMenuEdge.condition?.trim() && (
            <button
              type="button"
              onClick={() => {
                onUpdateEdgeCondition(contextMenuEdge.id, '');
                setEdgeContextMenu(null);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#475569] hover:bg-[#F1F5F9] hover:text-[#14244B] transition-colors cursor-pointer"
            >
              {t.menuRemoveCondition}
            </button>
          )}

          <div className="my-1 border-t border-[#F1F5F9]" />

          <button
            type="button"
            onClick={() => {
              onDeleteEdge(contextMenuEdge.id);
              setEdgeContextMenu(null);
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#DC2626] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
          >
            {t.menuDeleteEdge}
          </button>
        </div>
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
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 flex flex-wrap items-end justify-between gap-2">
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
              disabled={nodes.filter((n) => NODE_CATALOG[n.kind].isPlayable).length < 2}
              onClick={() => {
                setAddMenuOpen(false);
                if (connectingFrom) {
                  setConnectingFrom(null);
                  setConnectPointerWorld(null);
                  portDragRef.current = null;
                } else {
                  const selected = selectedNodeId ? nodeMap.get(selectedNodeId) : null;
                  if (selected && NODE_CATALOG[selected.kind].isPlayable) {
                    setConnectingFrom({ nodeId: selected.id, side: 'right' });
                  } else {
                    const firstPlayable = nodes.find(
                      (n) => NODE_CATALOG[n.kind].isPlayable,
                    );
                    if (firstPlayable) {
                      setConnectingFrom({ nodeId: firstPlayable.id, side: 'right' });
                    }
                  }
                }
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B] ${
                connectingFromId
                  ? 'bg-[#2563EB] text-white cursor-pointer'
                  : nodes.filter((n) => NODE_CATALOG[n.kind].isPlayable).length < 2
                    ? 'text-[#94A3B8] cursor-not-allowed'
                    : 'text-[#475569] hover:text-[#14244B] hover:bg-[#F1F5F9] cursor-pointer'
              }`}
            >
              <GitCommitHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{connectingFromId ? t.cancelConnect : t.connectMode}</span>
            </button>

            <div aria-hidden="true" className="w-px h-4 bg-[#E2E8F0] mx-0.5" />

            <button
              type="button"
              onClick={() => {
                setAddMenuOpen(false);
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
