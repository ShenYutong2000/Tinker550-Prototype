import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ArrowLeft, Compass } from 'lucide-react';
import { COPY, type Language } from '../../shared/i18n';
import {
  createAssetStateSlot,
  createDefaultTypography,
  createInitialAssetLibrary,
  type AssetCategoryId,
  type AssetItem,
  type AssetSubFolder,
} from './asset-library/assetLibraryModel';
import {
  collectAllScopedVariables,
  coerceVariableValue,
  type ScopedStateVariable,
  type StateVariable,
  type StateVariableValue,
} from './properties/stateModel';
import {
  GROUP_DEFAULT_HEIGHT,
  GROUP_DEFAULT_WIDTH,
  GROUP_MIN_HEIGHT,
  GROUP_MIN_WIDTH,
  INITIAL_EDGES,
  INITIAL_NODES,
  NODE_CATALOG,
  composeNoteFromPromptInput,
  createDefaultPromptInput,
  formatBehaviorSummary,
  formatOutcomeRuleSummary,
  getAncestorGroupIds,
  getDefaultKeyForMechanic,
  getDescendantNodeIds,
  getNextGroupCode,
  getNodeAssetIds,
  getNodeDepth,
  getNodeDimensions,
  inferCardFieldsFromText,
  isDescendantOf,
  mergeAutoFields,
  type ActionMechanic,
  type BoardEdge,
  type BoardNode,
  type CardFieldConfig,
  type ChallengeBehaviorConfig,
  type NodeKind,
  type OnboardingChecklist,
  type OutcomePropertyRule,
  type SpotlightStage,
} from './design-board/studioModel';
import type { EdgeConditionGroup } from './design-board/arrowConditionModel';
import {
  detectUnlockedVisualEffectsFromText,
  type VisualEffectType,
} from './asset-library/effects/visualEffectsModel';
import { AssetEditorDrawer } from './asset-library/AssetEditorDrawer';
import { AssetsPanel, type AiPlacedNotice } from './asset-library/AssetsPanel';
import { DesignBoard } from './design-board/DesignBoard';
import { FloatingGuidance } from './guidance/FloatingGuidance';
import { StageEditor } from './playtest/StageEditor';

interface StudioWorkspaceProps {
  lang: Language;
  onChangeLang: (lang: Language) => void;
  onGoHome: () => void;
  onBackToChoose: () => void;
}

const DEFAULT_LEFT_WIDTH = 252;
const MIN_LEFT_WIDTH = 200;
const MAX_LEFT_WIDTH = 380;

const DEFAULT_RIGHT_WIDTH = 360;
const MIN_RIGHT_WIDTH = 276;

export function StudioWorkspace({
  lang,
  onChangeLang,
  onGoHome,
  onBackToChoose,
}: StudioWorkspaceProps) {
  const t = COPY[lang].studio;
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  const [logoError, setLogoError] = useState(false);
  const [projectName, setProjectName] = useState<string>(t.defaultProject);
  const [hasRenamedProject, setHasRenamedProject] = useState(false);

  useEffect(() => {
    if (!hasRenamedProject) {
      setProjectName(COPY[lang].studio.defaultProject);
    }
  }, [lang, hasRenamedProject]);

  // Collapsible & drag-resizable Left (Assets) and Right (Play) columns
  const [leftOpen, setLeftOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);

  const [rightOpen, setRightOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  );
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const [placementCounts, setPlacementCounts] = useState<Record<string, number>>({});
  const [stageFocus, setStageFocus] = useState<{ nodeId: string; nonce: number } | null>(null);
  const [activeSplitter, setActiveSplitter] = useState<'left' | 'right' | null>(null);

  // Asset Library State
  const initialLibraryRef = useRef<ReturnType<typeof createInitialAssetLibrary> | null>(
    null,
  );
  if (!initialLibraryRef.current) {
    initialLibraryRef.current = createInitialAssetLibrary(lang);
  }
  const [assetFolders, setAssetFolders] = useState<AssetSubFolder[]>(
    () => initialLibraryRef.current!.folders,
  );
  const [assetItems, setAssetItems] = useState<AssetItem[]>(
    () => initialLibraryRef.current!.items,
  );
  const [unlockedCategories] = useState<Record<AssetCategoryId, boolean>>(
    () => initialLibraryRef.current!.unlockedCategories,
  );
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [stageAssetPick, setStageAssetPick] = useState<'picking' | { assetId: string } | null>(null);
  const [assetEditorTab, setAssetEditorTab] = useState<'looks' | 'properties'>('looks');
  const [highlightPropertyId, setHighlightPropertyId] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<AiPlacedNotice | null>(null);

  // Progressive unlock flags: Properties tab follows the same gating architecture as Audio
  // (hidden when false; defaulted to true in this test build so it is immediately inspectable).
  const [propertiesUnlocked] = useState<boolean>(true);
  // Visual Effects starts overall locked (empty) and unlocks specific effects progressively by board intent.
  const [unlockedVisualEffects, setUnlockedVisualEffects] = useState<VisualEffectType[]>([]);

  // Test preview preset: unlock a representative subset on the starter Cat card so both
  // unlocked effects, locked items in the picker, and overall-locked cards can be tested side by side.
  const testCatUnlockedEffects = useMemo<VisualEffectType[]>(
    () => [
      'opacity',
      'brightness',
      'saturation',
      'blur',
      'pixelate',
      'glow',
      'shadow',
      'fade',
      'shake',
    ],
    [],
  );

  // Unified Global State Variables & Live Play Mode Sandbox Override Map
  const [globalVariables, setGlobalVariables] = useState<StateVariable[]>([]);
  const [playValues, setPlayValues] = useState<Record<string, StateVariableValue>>({});
  const [stateManagerOpen, setStateManagerOpen] = useState(false);
  const [boardFocusTarget, setBoardFocusTarget] = useState<{
    nodeId?: string;
    edgeId?: string;
    nonce: number;
  } | null>(null);

  const scopedVariables = useMemo(
    () => collectAllScopedVariables(globalVariables, assetItems, playValues),
    [globalVariables, assetItems, playValues],
  );

  // Design Board State — starts completely blank (from 0)
  const [nodes, setNodes] = useState<BoardNode[]>(() => [...INITIAL_NODES]);
  const [edges, setEdges] = useState<BoardEdge[]>(() => [...INITIAL_EDGES]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [autoFocusNodeId, setAutoFocusNodeId] = useState<string | null>(null);

  // Cumulatively unlock specific Visual Effects when student cards or edges express that visual intent
  useEffect(() => {
    const texts: string[] = [];
    for (const node of nodes) {
      if (node.note) texts.push(node.note);
    }
    for (const edge of edges) {
      if (edge.condition) texts.push(edge.condition);
    }
    const detected = detectUnlockedVisualEffectsFromText(texts);
    if (detected.length === 0) return;
    setUnlockedVisualEffects((prev) => {
      const existing = new Set(prev);
      const added = detected.filter((type) => !existing.has(type));
      return added.length > 0 ? [...prev, ...added] : prev;
    });
  }, [nodes, edges]);

  // Two-stage Spotlight Onboarding + Built-in Floating Guidance Checklist
  const [spotlightStage, setSpotlightStage] = useState<SpotlightStage>('focus-build');
  const [checklist, setChecklist] = useState<OnboardingChecklist>({
    addedFirstCard: false,
    connectedCards: false,
    testedInPlay: false,
  });

  // Live Play -> Design Board synchronized highlighting
  const [activePlayNodeIds, setActivePlayNodeIds] = useState<string[]>([]);
  const [activePlayEdgeId, setActivePlayEdgeId] = useState<string | null>(null);

  const handleActivePlayChange = useCallback(
    (nodeIds: string[], edgeId: string | null) => {
      setActivePlayNodeIds(previous => previous.length === nodeIds.length && previous.every((id, index) => id === nodeIds[index]) ? previous : nodeIds);
      setActivePlayEdgeId(edgeId);
    },
    [],
  );

  const markCardAdded = useCallback(() => {
    setChecklist((prev) => ({ ...prev, addedFirstCard: true }));
    setSpotlightStage((prev) => (prev === 'focus-build' ? 'focus-play' : prev));
    setRightOpen(true);
  }, []);

  const markCardsConnected = useCallback(() => {
    setChecklist((prev) => ({ ...prev, connectedCards: true }));
    setSpotlightStage((prev) => (prev === 'focus-build' ? 'focus-play' : prev));
    setRightOpen(true);
  }, []);

  const handleUserTestedInPlay = useCallback(() => {
    setChecklist((prev) => ({ ...prev, testedInPlay: true }));
    setSpotlightStage('free');
  }, []);

  // Splitter Drag Handlers
  const startResizeLeft = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveSplitter('left');
  };

  const startResizeRight = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveSplitter('right');
  };

  const handleWorkspacePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeSplitter) return;
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const minCenterWidth = 280;

    if (activeSplitter === 'left') {
      const occupiedRight = rightOpen ? rightWidth + 6 : 44;
      const availableMaxLeft = Math.max(
        MIN_LEFT_WIDTH,
        rect.width - occupiedRight - 6 - minCenterWidth,
      );
      const next = Math.round(event.clientX - rect.left);
      setLeftWidth(
        Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, availableMaxLeft, next)),
      );
    } else if (activeSplitter === 'right') {
      const occupiedLeft = leftOpen ? leftWidth + 6 : 44;
      const maxRight = Math.max(360, Math.round(rect.width * 0.56));
      const availableMaxRight = Math.max(
        MIN_RIGHT_WIDTH,
        rect.width - occupiedLeft - 6 - minCenterWidth,
      );
      const next = Math.round(rect.right - event.clientX);
      setRightWidth(
        Math.max(MIN_RIGHT_WIDTH, Math.min(maxRight, availableMaxRight, next)),
      );
    }
  };

  const handleWorkspacePointerUp = () => {
    if (activeSplitter) {
      setActiveSplitter(null);
    }
  };

  // Asset Library Handlers
  const handleCreateSubFolder = useCallback(
    (categoryId: AssetCategoryId, name: string) => {
      const id = `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      setAssetFolders((prev) => [...prev, { id, categoryId, name }]);
      return id;
    },
    [],
  );

  const handleRenameSubFolder = useCallback((folderId: string, nextName: string) => {
    setAssetFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, name: nextName } : f)),
    );
  }, []);

  const handleDeleteSubFolder = useCallback((folderId: string) => {
    setAssetFolders((prev) => prev.filter((f) => f.id !== folderId));
    setAssetItems((prev) =>
      prev.map((item) => (item.folderId === folderId ? { ...item, folderId: null } : item)),
    );
  }, []);

  const handleCreateAsset = useCallback(
    (categoryId: AssetCategoryId, folderId: string | null) => {
      const isZh = lang === 'zh';
      const defaultName = isZh ? '新素材' : 'New Asset';
      const state = createAssetStateSlot(
        isZh ? '默认' : 'Default',
        defaultName,
        categoryId,
        assetItems.length,
      );
      const id = `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      const created: AssetItem = {
        id,
        categoryId,
        folderId,
        name: defaultName,
        states: [state],
        activeStateId: state.id,
        interfaceMode: categoryId === 'interface' ? 'text' : undefined,
        typography:
          categoryId === 'interface'
            ? createDefaultTypography(defaultName, lang)
            : undefined,
      };
      setAssetItems((prev) => [...prev, created]);
      setSelectedAssetId(id);
    },
    [assetItems.length, lang],
  );

  const handleUpdateAsset = useCallback(
    (assetId: string, updater: (prev: AssetItem) => AssetItem) => {
      setAssetItems((prev) => prev.map((item) => (item.id === assetId ? updater(item) : item)));
    },
    [],
  );

  const handleDeleteAsset = useCallback((assetId: string) => {
    setAssetItems((prev) => {
      const target = prev.find((item) => item.id === assetId);
      if (target?.properties?.length) {
        const doomedIds = new Set(target.properties.map((p) => p.id));
        setPlayValues((pv) => {
          const next = { ...pv };
          doomedIds.forEach((vid) => delete next[vid]);
          return next;
        });
      }
      return prev.filter((item) => item.id !== assetId);
    });
    setSelectedAssetId((prev) => (prev === assetId ? null : prev));
  }, []);

  // Unified Global & Asset State Property Handlers
  const handleAddGlobalVariable = useCallback((variable: StateVariable) => {
    setGlobalVariables((prev) => [...prev, variable]);
  }, []);

  const handleAddAssetProperty = useCallback(
    (assetId: string, variable: StateVariable) => {
      setAssetItems((prev) =>
        prev.map((item) =>
          item.id === assetId
            ? { ...item, properties: [...(item.properties ?? []), variable] }
            : item,
        ),
      );
    },
    [],
  );

  const handleUpdateScopedVariable = useCallback(
    (
      scope: 'global' | 'asset',
      assetId: string | undefined,
      variable: StateVariable,
    ) => {
      if (scope === 'global') {
        setGlobalVariables((prev) =>
          prev.map((v) => (v.id === variable.id ? variable : v)),
        );
      } else if (assetId) {
        setAssetItems((prev) =>
          prev.map((item) =>
            item.id === assetId
              ? {
                  ...item,
                  properties: (item.properties ?? []).map((p) =>
                    p.id === variable.id ? variable : p,
                  ),
                }
              : item,
          ),
        );
      }
      // Re-clamp existing play override if type or bounds changed
      setPlayValues((prev) => {
        if (!(variable.id in prev)) return prev;
        return {
          ...prev,
          [variable.id]: coerceVariableValue(variable, prev[variable.id]),
        };
      });
    },
    [],
  );

  const handleMoveVariableScope = useCallback(
    (
      fromScope: 'global' | 'asset',
      fromAssetId: string | undefined,
      toScope: 'global' | 'asset',
      toAssetId: string | undefined,
      variable: StateVariable,
    ) => {
      if (fromScope === 'global') {
        setGlobalVariables((prev) => prev.filter((v) => v.id !== variable.id));
      } else if (fromAssetId) {
        setAssetItems((prev) =>
          prev.map((item) =>
            item.id === fromAssetId
              ? {
                  ...item,
                  properties: (item.properties ?? []).filter((p) => p.id !== variable.id),
                }
              : item,
          ),
        );
      }

      if (toScope === 'global') {
        setGlobalVariables((prev) => [...prev, variable]);
      } else if (toAssetId) {
        setAssetItems((prev) =>
          prev.map((item) =>
            item.id === toAssetId
              ? {
                  ...item,
                  properties: [...(item.properties ?? []), variable],
                }
              : item,
          ),
        );
      }

      setPlayValues((prev) => {
        if (!(variable.id in prev)) return prev;
        return {
          ...prev,
          [variable.id]: coerceVariableValue(variable, prev[variable.id]),
        };
      });
    },
    [],
  );

  const handleDeleteScopedVariable = useCallback(
    (
      scope: 'global' | 'asset',
      assetId: string | undefined,
      variableId: string,
    ) => {
      if (scope === 'global') {
        setGlobalVariables((prev) => prev.filter((v) => v.id !== variableId));
      } else if (assetId) {
        setAssetItems((prev) =>
          prev.map((item) =>
            item.id === assetId
              ? {
                  ...item,
                  properties: (item.properties ?? []).filter((p) => p.id !== variableId),
                }
              : item,
          ),
        );
      }
      setPlayValues((prev) => {
        if (!(variableId in prev)) return prev;
        const next = { ...prev };
        delete next[variableId];
        return next;
      });
    },
    [],
  );

  const handleUpdatePlayValue = useCallback(
    (variableId: string, value: StateVariableValue) => {
      setPlayValues((prev) => ({ ...prev, [variableId]: value }));
    },
    [],
  );

  const handleApplyPlayToInitial = useCallback(
    (entry: ScopedStateVariable) => {
      const updated: StateVariable = {
        ...entry.variable,
        initialValue: coerceVariableValue(entry.variable, entry.playValue),
      };
      handleUpdateScopedVariable(entry.scope, entry.assetId, updated);
      setPlayValues((prev) => {
        const next = { ...prev };
        delete next[entry.variable.id];
        return next;
      });
    },
    [handleUpdateScopedVariable],
  );

  const handleResetPlayValue = useCallback((variableId: string) => {
    setPlayValues((prev) => {
      if (!(variableId in prev)) return prev;
      const next = { ...prev };
      delete next[variableId];
      return next;
    });
  }, []);

  const handleResetAllPlayValues = useCallback(() => {
    setPlayValues({});
  }, []);

  const handleJumpToAssetProperty = useCallback(
    (assetId: string, variableId: string) => {
      setLeftOpen(true);
      setStateManagerOpen(false);
      setSelectedAssetId(assetId);
      setAssetEditorTab('properties');
      setHighlightPropertyId(variableId);
      window.setTimeout(() => {
        setHighlightPropertyId((curr) => (curr === variableId ? null : curr));
      }, 2200);
    },
    [],
  );

  const handleLocateBoardReference = useCallback(
    (target: { nodeId?: string; edgeId?: string }) => {
      setStateManagerOpen(false);
      if (target.nodeId) {
        setNodes((prev) => {
          const map = new Map(prev.map((n) => [n.id, n]));
          const ancestorIds = new Set(getAncestorGroupIds(target.nodeId!, map));
          if (ancestorIds.size === 0) return prev;
          const hasCollapsed = prev.some(
            (n) => ancestorIds.has(n.id) && n.kind === 'group' && n.collapsed,
          );
          if (!hasCollapsed) return prev;
          return prev.map((n) =>
            ancestorIds.has(n.id) && n.kind === 'group' && n.collapsed
              ? { ...n, collapsed: false }
              : n,
          );
        });
      }
      setBoardFocusTarget({ ...target, nonce: Date.now() });
    },
    [],
  );

  const handleMoveAsset = useCallback(
    (
      assetId: string,
      targetCategoryId: AssetCategoryId,
      targetFolderId: string | null,
    ) => {
      setAssetItems((prev) =>
        prev.map((item) => {
          if (item.id !== assetId) return item;
          return {
            ...item,
            categoryId: targetCategoryId,
            folderId: targetFolderId,
            interfaceMode:
              targetCategoryId === 'interface'
                ? (item.interfaceMode ?? 'text')
                : item.interfaceMode,
            typography:
              targetCategoryId === 'interface' && !item.typography
                ? createDefaultTypography(item.name, lang)
                : item.typography,
          };
        }),
      );
    },
    [lang],
  );

  // Design Board Handlers — every newly added card starts truly blank & ready to type
  const addNodeAt = useCallback(
    (kind: NodeKind, x: number, y: number, explicitParentId?: string | null) => {
      const meta = NODE_CATALOG[kind];
      const id = `n-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      setNodes((prev) => {
        const nodeMap = new Map(prev.map((n) => [n.id, n]));
        const tempNode: BoardNode = {
          id,
          kind,
          parentId: null,
          title: '',
          note: '',
          assetIds: [],
          promptInput: createDefaultPromptInput(kind),
          fields: {},
          manualFields: [],
          x,
          y,
          ...(kind === 'group'
            ? {
                width: GROUP_DEFAULT_WIDTH,
                height: GROUP_DEFAULT_HEIGHT,
                collapsed: false,
              }
            : {}),
        };
        const dim = getNodeDimensions(tempNode);
        const cx = x + dim.width / 2;
        const cy = y + dim.height / 2;

        let resolvedParentId: string | null = explicitParentId ?? null;
        if (explicitParentId === undefined) {
          let bestDepth = -1;
          let bestArea = Infinity;
          for (const g of prev) {
            if (g.kind !== 'group' || g.collapsed) continue;
            const gDim = getNodeDimensions(g);
            if (
              cx >= g.x &&
              cx <= g.x + gDim.width &&
              cy >= g.y &&
              cy <= g.y + gDim.height
            ) {
              const depth = getNodeDepth(g.id, nodeMap);
              const area = gDim.width * gDim.height;
              if (depth > bestDepth || (depth === bestDepth && area < bestArea)) {
                bestDepth = depth;
                bestArea = area;
                resolvedParentId = g.id;
              }
            }
          }
        }

        const nextGroupCode = kind === 'group' ? getNextGroupCode(prev) : undefined;
        const groupNumSuffix = nextGroupCode ? nextGroupCode.slice(1) : '';
        const defaultGroupTitle =
          kind === 'group'
            ? lang === 'zh'
              ? `机制组 ${groupNumSuffix}`
              : `Group ${groupNumSuffix}`
            : '';

        const newNode: BoardNode = {
          ...tempNode,
          parentId: resolvedParentId,
          title: defaultGroupTitle,
          ...(nextGroupCode ? { groupCode: nextGroupCode } : {}),
        };
        return [...prev, newNode];
      });
      setSelectedNodeId(id);
      setAutoFocusNodeId(id);
      if (meta.isPlayable) {
        markCardAdded();
      }
      return id;
    },
    [lang, markCardAdded],
  );

  const handleDragNode = useCallback((id: string, dx: number, dy: number) => {
    setNodes((prev) => {
      const target = prev.find((n) => n.id === id);
      if (!target) return prev;
      const moveIds = new Set<string>([id]);
      if (target.kind === 'group') {
        for (const descId of getDescendantNodeIds(id, prev)) {
          moveIds.add(descId);
        }
      }
      return prev.map((n) =>
        moveIds.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n,
      );
    });
  }, []);

  const handleCommitNodeDrop = useCallback((id: string) => {
    setNodes((prev) => {
      const dragged = prev.find((n) => n.id === id);
      if (!dragged) return prev;
      const nodeMap = new Map(prev.map((n) => [n.id, n]));
      const dim = getNodeDimensions(dragged);
      const cx = dragged.x + dim.width / 2;
      const cy = dragged.y + dim.height / 2;

      let bestGroupId: string | null = null;
      let bestDepth = -1;
      let bestArea = Infinity;

      for (const candidate of prev) {
        if (candidate.kind !== 'group' || candidate.collapsed) continue;
        if (candidate.id === dragged.id) continue;
        if (
          dragged.kind === 'group' &&
          isDescendantOf(candidate.id, dragged.id, nodeMap)
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
            bestGroupId = candidate.id;
          }
        }
      }

      if (bestGroupId) {
        const targetGroup = prev.find((n) => n.id === bestGroupId);
        if (targetGroup) {
          const gDim = getNodeDimensions(targetGroup);
          const neededW = Math.max(gDim.width, Math.round(dragged.x + dim.width + 20 - targetGroup.x));
          const neededH = Math.max(gDim.height, Math.round(dragged.y + dim.height + 20 - targetGroup.y));
          const groupNeedsExpand = neededW > gDim.width || neededH > gDim.height;
          if (dragged.parentId === bestGroupId && !groupNeedsExpand) return prev;
          return prev.map((n) => {
            if (n.id === dragged.id) return { ...n, parentId: bestGroupId };
            if (n.id === bestGroupId && groupNeedsExpand) {
              return { ...n, width: neededW, height: neededH };
            }
            return n;
          });
        }
      }

      if (dragged.parentId === bestGroupId) return prev;
      return prev.map((n) =>
        n.id === dragged.id ? { ...n, parentId: bestGroupId } : n,
      );
    });
  }, []);

  const handleResizeGroup = useCallback(
    (
      id: string,
      rect: { x?: number; y?: number; width: number; height: number },
    ) => {
      const nextW = Math.round(Math.max(GROUP_MIN_WIDTH, rect.width));
      const nextH = Math.round(Math.max(GROUP_MIN_HEIGHT, rect.height));
      setNodes((prev) =>
        prev.map((n) =>
          n.id === id && n.kind === 'group'
            ? {
                ...n,
                x: rect.x !== undefined ? Math.round(rect.x) : n.x,
                y: rect.y !== undefined ? Math.round(rect.y) : n.y,
                width: nextW,
                height: nextH,
              }
            : n,
        ),
      );
    },
    [],
  );

  const handleCommitGroupResize = useCallback((groupId: string) => {
    setNodes((prev) => {
      const grp = prev.find(
        (n) => n.id === groupId && n.kind === 'group' && !n.collapsed,
      );
      if (!grp) return prev;
      const nodeMap = new Map(prev.map((n) => [n.id, n]));
      const gDim = getNodeDimensions(grp);
      const gx1 = grp.x;
      const gy1 = grp.y;
      const gx2 = grp.x + gDim.width;
      const gy2 = grp.y + gDim.height;

      let changed = false;
      const next = prev.map((n) => {
        if (n.id === grp.id) return n;
        if (n.kind === 'group' && isDescendantOf(grp.id, n.id, nodeMap)) return n;

        const dim = getNodeDimensions(n);
        const cx = n.x + dim.width / 2;
        const cy = n.y + dim.height / 2;
        const isInside = cx >= gx1 && cx <= gx2 && cy >= gy1 && cy <= gy2;

        if (isInside && n.parentId === grp.parentId) {
          changed = true;
          return { ...n, parentId: grp.id };
        }
        if (!isInside && n.parentId === grp.id) {
          changed = true;
          return { ...n, parentId: grp.parentId };
        }
        return n;
      });
      return changed ? next : prev;
    });
  }, []);

  const handleToggleGroupCollapse = useCallback((id: string) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id && n.kind === 'group' ? { ...n, collapsed: !n.collapsed } : n,
      ),
    );
  }, []);

  const handleDuplicateNode = useCallback(
    (id: string) => {
      const root = nodes.find((n) => n.id === id);
      if (!root) return null;

      const subtreeIds =
        root.kind === 'group'
          ? [root.id, ...getDescendantNodeIds(root.id, nodes)]
          : [root.id];
      const subtreeSet = new Set(subtreeIds);
      const idMap = new Map<string, string>();
      const ts = Date.now().toString(36);

      for (const origId of subtreeIds) {
        const orig = nodes.find((n) => n.id === origId);
        if (!orig) continue;
        const rand = Math.random().toString(36).slice(2, 6);
        idMap.set(origId, `n-${orig.kind}-${ts}-${rand}`);
      }

      const clonedRootId = idMap.get(root.id) ?? null;
      const clones: BoardNode[] = [];
      for (const origId of subtreeIds) {
        const orig = nodes.find((n) => n.id === origId);
        const nextId = idMap.get(origId);
        if (!orig || !nextId) continue;
        const nextParentId =
          origId === root.id
            ? orig.parentId
            : orig.parentId && idMap.has(orig.parentId)
              ? idMap.get(orig.parentId)!
              : orig.parentId;
        const clonedGroupCode =
          orig.kind === 'group' ? getNextGroupCode([...nodes, ...clones]) : orig.groupCode;
        clones.push({
          ...orig,
          id: nextId,
          parentId: nextParentId,
          ...(orig.kind === 'group' ? { groupCode: clonedGroupCode } : {}),
          title:
            origId === root.id && orig.kind === 'group' && orig.title.trim()
              ? `${orig.title.trim()} (${lang === 'zh' ? '副本' : 'Copy'})`
              : orig.title,
          assetIds: orig.assetIds ? [...orig.assetIds] : undefined,
          promptInput: orig.promptInput ? { ...orig.promptInput } : undefined,
          fields: {
            ...orig.fields,
            relatedParameters: orig.fields.relatedParameters
              ? orig.fields.relatedParameters.map((p) => ({ ...p }))
              : undefined,
            relatedProperties: orig.fields.relatedProperties
              ? orig.fields.relatedProperties.map((r) => ({ ...r }))
              : undefined,
          },
          manualFields: [...orig.manualFields],
          availableWhenGroup: orig.availableWhenGroup
            ? {
                combinator: orig.availableWhenGroup.combinator,
                clauses: orig.availableWhenGroup.clauses.map((c) => ({ ...c })),
              }
            : undefined,
          x: orig.x + 48,
          y: orig.y + 48,
        });
      }

      const internalClonedEdges: BoardEdge[] = [];
      for (const e of edges) {
        if (e.fromId === null && subtreeSet.has(e.toId)) {
          const rand = Math.random().toString(36).slice(2, 6);
          internalClonedEdges.push({
            ...e,
            id: `e-${ts}-${rand}`,
            fromId: null,
            toId: idMap.get(e.toId)!,
            entryOffset: e.entryOffset ? { ...e.entryOffset } : undefined,
            conditionGroup: e.conditionGroup
              ? {
                  combinator: e.conditionGroup.combinator,
                  clauses: e.conditionGroup.clauses.map((c) => ({ ...c })),
                }
              : undefined,
          });
        } else if (e.fromId && subtreeSet.has(e.fromId) && subtreeSet.has(e.toId)) {
          const rand = Math.random().toString(36).slice(2, 6);
          internalClonedEdges.push({
            ...e,
            id: `e-${ts}-${rand}`,
            fromId: idMap.get(e.fromId)!,
            toId: idMap.get(e.toId)!,
            conditionGroup: e.conditionGroup
              ? {
                  combinator: e.conditionGroup.combinator,
                  clauses: e.conditionGroup.clauses.map((c) => ({ ...c })),
                }
              : undefined,
          });
        }
      }

      setNodes((prev) => [...prev, ...clones]);
      if (internalClonedEdges.length > 0) {
        setEdges((prev) => [...prev, ...internalClonedEdges]);
      }
      if (clonedRootId) {
        setSelectedNodeId(clonedRootId);
      }
      return clonedRootId;
    },
    [edges, lang, nodes],
  );

  const handleUngroup = useCallback((id: string) => {
    setNodes((prev) => {
      const target = prev.find((n) => n.id === id);
      if (!target || target.kind !== 'group') return prev;
      const fallbackParent = target.parentId ?? null;
      return prev
        .filter((n) => n.id !== id)
        .map((n) => (n.parentId === id ? { ...n, parentId: fallbackParent } : n));
    });
    setEdges((prev) => prev.filter((e) => e.fromId !== id && e.toId !== id));
    setSelectedNodeId((prev) => (prev === id ? null : prev));
  }, []);

  const handleUpdateNode = useCallback(
    (
      id: string,
      patch: Partial<Pick<BoardNode, 'title' | 'note' | 'assetId' | 'assetIds' | 'promptInput'>>,
    ) => {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;

          let nextTitle = patch.title !== undefined ? patch.title : n.title;
          let nextPrompt = patch.promptInput !== undefined ? patch.promptInput : n.promptInput;
          let nextNote = patch.note !== undefined ? patch.note : n.note;

          // Keep note synced whenever structured fill-in prompt changes in template mode
          if (patch.promptInput !== undefined && patch.note === undefined) {
            if (patch.promptInput.mode !== 'custom') {
              nextNote = composeNoteFromPromptInput(n.kind, patch.promptInput, lang);
            }
          }

          // Keep assetId and assetIds bidirectionally synced
          let nextAssetIds = getNodeAssetIds(n);
          const isDirectAssetBindingEdit =
            (patch.assetIds !== undefined || patch.assetId !== undefined) &&
            patch.promptInput === undefined &&
            patch.title === undefined &&
            patch.note === undefined;

          if (patch.assetIds !== undefined) {
            nextAssetIds = patch.assetIds;
          } else if (patch.assetId !== undefined) {
            nextAssetIds = patch.assetId ? [patch.assetId] : [];
          }

          // Top-down: when front text/prompt changes, auto-bind any existing asset explicitly mentioned by name
          const textOrPromptChanged =
            nextNote !== n.note || patch.promptInput !== undefined || patch.title !== undefined;
          if (textOrPromptChanged && !isDirectAssetBindingEdit) {
            const combined = `${nextTitle} ${nextNote}`.trim().toLowerCase();
            if (combined) {
              const prevCombined = `${n.title} ${n.note}`.trim().toLowerCase();
              const addedIds: string[] = [];
              for (const asset of assetItems) {
                const nm = asset.name.trim().toLowerCase();
                if (!nm || nm.length < 2) continue;
                const nowMentions = combined.includes(nm);
                const prevMentioned = prevCombined.includes(nm);
                if (nowMentions && !prevMentioned && !nextAssetIds.includes(asset.id)) {
                  addedIds.push(asset.id);
                }
              }
              if (addedIds.length > 0) {
                nextAssetIds = [...nextAssetIds, ...addedIds];
              }
            }
          }

          // Bottom-up: when Asset Binding is edited in the expanded panel, sync cleanly back to front card
          if (isDirectAssetBindingEdit) {
            const boundSet = new Set(nextAssetIds);
            const boundAssets = nextAssetIds
              .map((aid) => assetItems.find((a) => a.id === aid))
              .filter((a): a is AssetItem => Boolean(a));

            if (n.kind === 'dialogue') {
              const firstChar = boundAssets.find((a) => a.categoryId === 'characters');
              if (!nextTitle.trim() && firstChar) {
                nextTitle = firstChar.name;
              }
            } else if (n.kind === 'challenge') {
              const p = nextPrompt ?? createDefaultPromptInput('challenge');
              if (p && p.mode !== 'custom') {
                const updatedPrompt = { ...p };
                let changed = false;
                if (updatedPrompt.obstacleAssetId && !boundSet.has(updatedPrompt.obstacleAssetId)) {
                  updatedPrompt.obstacleAssetId = undefined;
                  changed = true;
                }
                if (updatedPrompt.sceneAssetId && !boundSet.has(updatedPrompt.sceneAssetId)) {
                  updatedPrompt.sceneAssetId = undefined;
                  changed = true;
                }
                if (updatedPrompt.challengeTemplate === 'scene-limit') {
                  const firstScene = boundAssets.find((a) => a.categoryId === 'backgrounds');
                  if (!updatedPrompt.sceneName?.trim() && firstScene) {
                    updatedPrompt.sceneName = firstScene.name;
                    updatedPrompt.sceneAssetId = firstScene.id;
                    changed = true;
                  }
                } else {
                  const firstObs = boundAssets.find(
                    (a) =>
                      a.categoryId === 'objects' ||
                      a.categoryId === 'characters' ||
                      a.categoryId === 'effects',
                  );
                  if (!updatedPrompt.obstacle?.trim() && firstObs) {
                    updatedPrompt.obstacle = firstObs.name;
                    updatedPrompt.obstacleAssetId = firstObs.id;
                    changed = true;
                  }
                }
                if (changed) {
                  nextPrompt = updatedPrompt;
                  nextNote = composeNoteFromPromptInput(n.kind, updatedPrompt, lang);
                }
              }
            } else if (n.kind === 'action') {
              const p = nextPrompt ?? createDefaultPromptInput('action');
              if (p && p.mode !== 'custom') {
                const updatedPrompt = { ...p };
                let changed = false;
                if (updatedPrompt.actorAssetId && !boundSet.has(updatedPrompt.actorAssetId)) {
                  updatedPrompt.actorAssetId = undefined;
                  changed = true;
                }
                const firstChar = boundAssets.find((a) => a.categoryId === 'characters');
                if (!updatedPrompt.actorName?.trim() && firstChar) {
                  updatedPrompt.actorName = firstChar.name;
                  updatedPrompt.actorAssetId = firstChar.id;
                  changed = true;
                }
                if (changed) {
                  nextPrompt = updatedPrompt;
                  nextNote = composeNoteFromPromptInput(n.kind, updatedPrompt, lang);
                }
              }
            } else if (n.kind === 'outcome') {
              const p = nextPrompt ?? createDefaultPromptInput('outcome');
              if (p && p.mode !== 'custom') {
                const updatedPrompt = { ...p };
                let changed = false;
                if (
                  updatedPrompt.outcomeTargetKind === 'asset' &&
                  updatedPrompt.outcomeTargetRef &&
                  !boundSet.has(updatedPrompt.outcomeTargetRef)
                ) {
                  updatedPrompt.outcomeTargetRef = undefined;
                  updatedPrompt.outcomeTargetKind = 'custom';
                  changed = true;
                }
                if (!updatedPrompt.outcomeTargetLabel?.trim() && boundAssets[0]) {
                  updatedPrompt.outcomeTargetLabel = boundAssets[0].name;
                  updatedPrompt.outcomeTargetKind = 'asset';
                  updatedPrompt.outcomeTargetRef = boundAssets[0].id;
                  changed = true;
                }
                if (changed) {
                  nextPrompt = updatedPrompt;
                  nextNote = composeNoteFromPromptInput(n.kind, updatedPrompt, lang);
                }
              }
            }
          }

          let effectiveManualFields = n.manualFields;
          if (!isDirectAssetBindingEdit) {
            if (n.kind === 'challenge') {
              const templateChanged =
                patch.promptInput !== undefined &&
                patch.promptInput.challengeTemplate !== n.promptInput?.challengeTemplate;
              const behaviorClauseChanged =
                (patch.promptInput !== undefined &&
                  (patch.promptInput.obstacleAction !== n.promptInput?.obstacleAction ||
                    patch.promptInput.sceneLimit !== n.promptInput?.sceneLimit ||
                    patch.promptInput.mode !== n.promptInput?.mode)) ||
                (patch.note !== undefined && patch.note !== n.note);

              if (templateChanged) {
                effectiveManualFields = effectiveManualFields.filter(
                  (k) =>
                    k !== 'relatedBehavior' &&
                    k !== 'relatedParameters' &&
                    k !== 'challengePattern' &&
                    k !== 'challengeSpeed' &&
                    k !== 'challengeVisual',
                );
              } else if (behaviorClauseChanged) {
                effectiveManualFields = effectiveManualFields.filter(
                  (k) =>
                    k !== 'relatedBehavior' &&
                    k !== 'challengePattern' &&
                    k !== 'challengeSpeed' &&
                    k !== 'challengeVisual',
                );
              }
            }
            if (
              n.kind === 'outcome' &&
              patch.promptInput !== undefined &&
              patch.promptInput.outcomeTargetRef !== n.promptInput?.outcomeTargetRef
            ) {
              effectiveManualFields = effectiveManualFields.filter(
                (k) => k !== 'relatedProperties',
              );
            }
          }

          const shouldReinfer = nextNote !== n.note || patch.promptInput !== undefined;
          const nextFields = shouldReinfer
            ? mergeAutoFields(n.kind, nextNote, n.fields, effectiveManualFields, lang, {
                promptInput: nextPrompt,
                scopedVariables,
              })
            : n.fields;

          return {
            ...n,
            ...patch,
            title: nextTitle,
            note: nextNote,
            promptInput: nextPrompt,
            assetId: nextAssetIds[0],
            assetIds: nextAssetIds,
            fields: nextFields,
            manualFields: effectiveManualFields,
          };
        }),
      );
    },
    [assetItems, lang, scopedVariables],
  );

  const handleUpdateNodeField = useCallback(
    <K extends keyof CardFieldConfig>(
      id: string,
      key: K,
      value: CardFieldConfig[K],
    ) => {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const manualFields = n.manualFields.includes(key)
            ? n.manualFields
            : [...n.manualFields, key];
          const nextFields: CardFieldConfig = {
            ...n.fields,
            [key]: value,
          };
          if (
            key === 'actionMechanic' &&
            typeof value === 'string' &&
            !n.manualFields.includes('keyBinding')
          ) {
            nextFields.keyBinding = getDefaultKeyForMechanic(value as ActionMechanic);
          }

          let nextPrompt = n.promptInput;
          let nextNote = n.note;
          let nextAssetIds = getNodeAssetIds(n);

          // Bottom-up sync: Challenge Related Behavior -> front card [Doing] & note
          if (n.kind === 'challenge' && key === 'relatedBehavior') {
            const behaviorVal = value as ChallengeBehaviorConfig | null | undefined;
            const summary = formatBehaviorSummary(behaviorVal, lang);
            const p = nextPrompt ?? createDefaultPromptInput('challenge');
            if (p && p.mode !== 'custom' && behaviorVal) {
              const updatedPrompt = {
                ...p,
                challengeTemplate: 'obstacle-action' as const,
                obstacleAction: summary,
              };
              nextPrompt = updatedPrompt;
              nextNote = composeNoteFromPromptInput('challenge', updatedPrompt, lang);
            }
          }

          // Bottom-up sync: Outcome Related Properties -> front card [Target] + [Change] + asset binding
          if (n.kind === 'outcome' && key === 'relatedProperties') {
            const rules = (value as OutcomePropertyRule[] | undefined) ?? [];
            const primaryRule = rules[0];
            if (primaryRule) {
              const entry = scopedVariables.find(
                (v) => v.variable.id === primaryRule.variableId,
              );
              if (entry) {
                const changeSummary = formatOutcomeRuleSummary(primaryRule, entry, lang);
                const p = nextPrompt ?? createDefaultPromptInput('outcome');
                if (p && p.mode !== 'custom') {
                  const updatedPrompt = {
                    ...p,
                    outcomeTargetLabel: entry.fullKey,
                    outcomeTargetKind: 'variable' as const,
                    outcomeTargetRef: entry.variable.id,
                    outcomeChange: changeSummary,
                  };
                  nextPrompt = updatedPrompt;
                  nextNote = composeNoteFromPromptInput('outcome', updatedPrompt, lang);
                }
                if (entry.assetId && !nextAssetIds.includes(entry.assetId)) {
                  nextAssetIds = [...nextAssetIds, entry.assetId];
                }
              }
            }
          }

          return {
            ...n,
            note: nextNote,
            promptInput: nextPrompt,
            assetId: nextAssetIds[0],
            assetIds: nextAssetIds,
            fields: nextFields,
            manualFields,
          };
        }),
      );
    },
    [lang, scopedVariables],
  );

  const handleResetNodeAutoFields = useCallback(
    (id: string) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === id
            ? {
                ...n,
                fields: inferCardFieldsFromText(n.kind, n.note, lang, {
                  promptInput: n.promptInput,
                  scopedVariables,
                }),
                manualFields: [],
              }
            : n,
        ),
      );
    },
    [lang, scopedVariables],
  );

  const handleDeleteNode = useCallback((id: string) => {
    setNodes((prev) => {
      const deleted = prev.find((n) => n.id === id);
      const fallbackParent = deleted?.parentId ?? null;
      return prev
        .filter((n) => n.id !== id)
        .map((n) => (n.parentId === id ? { ...n, parentId: fallbackParent } : n));
    });
    setEdges((prev) => prev.filter((e) => e.fromId !== id && e.toId !== id));
    setSelectedNodeId((prev) => (prev === id ? null : prev));
  }, []);

  const handleConnectNodes = useCallback(
    (
      fromId: string | null,
      toId: string,
      entryOffset?: { dx: number; dy: number },
    ): string | null => {
      if (fromId !== null && fromId === toId) return null;
      const newEdgeId = `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      let created = false;
      setEdges((prev) => {
        if (fromId !== null) {
          const exists = prev.some((e) => e.fromId === fromId && e.toId === toId);
          if (exists) return prev;
        }
        created = true;
        return [
          ...prev,
          {
            id: newEdgeId,
            fromId,
            toId,
            ...(fromId === null && entryOffset ? { entryOffset } : {}),
          },
        ];
      });
      markCardsConnected();
      return created || fromId === null ? newEdgeId : null;
    },
    [markCardsConnected],
  );

  const handleUpdateEntryEdgeOffset = useCallback(
    (edgeId: string, entryOffset: { dx: number; dy: number }) => {
      setEdges((prev) =>
        prev.map((e) =>
          e.id === edgeId && e.fromId === null
            ? {
                ...e,
                entryOffset: {
                  dx: Math.round(entryOffset.dx),
                  dy: Math.round(entryOffset.dy),
                },
              }
            : e,
        ),
      );
    },
    [],
  );

  const handleUpdateEdgeCondition = useCallback(
    (
      edgeId: string,
      condition: string,
      conditionGroup?: EdgeConditionGroup,
    ) => {
      setEdges((prev) =>
        prev.map((e) =>
          e.id === edgeId
            ? {
                ...e,
                condition: condition ? condition : undefined,
                conditionGroup:
                  condition && conditionGroup && conditionGroup.clauses.length > 0
                    ? conditionGroup
                    : undefined,
              }
            : e,
        ),
      );
      markCardsConnected();
    },
    [markCardsConnected],
  );

  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
  }, []);

  const handleReplayGuide = () => {
    setChecklist({
      addedFirstCard: false,
      connectedCards: false,
      testedInPlay: false,
    });
    setSpotlightStage('focus-build');
  };

  const isTopBarDimmed = spotlightStage !== 'free';

  return (
    <div
      ref={workspaceRef}
      onPointerMove={handleWorkspacePointerMove}
      onPointerUp={handleWorkspacePointerUp}
      onScroll={(e) => {
        if (e.currentTarget.scrollTop !== 0 || e.currentTarget.scrollLeft !== 0) {
          e.currentTarget.scrollTo(0, 0);
        }
      }}
      className={`h-screen w-screen overflow-clip flex flex-col bg-[#F8FAFC] ${
        activeSplitter ? 'select-none cursor-col-resize' : ''
      }`}
    >
      {/* Compact Studio Top Bar */}
      <header className="relative h-14 px-4 sm:px-5 bg-white border-b border-[#E2E8F0] flex items-center justify-between gap-4 shrink-0 z-30">
        {isTopBarDimmed && (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[#0F172A]/18 pointer-events-none transition-opacity duration-300"
          />
        )}

        <div className="relative flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onGoHome}
            aria-label="Tinker 550 Home"
            className="flex items-center shrink-0 rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B]"
          >
            {!logoError ? (
              <img
                src="/assets/aistudio/image_8e7dab7b.png"
                alt={COPY[lang].brandAlt}
                referrerPolicy="no-referrer"
                onError={() => setLogoError(true)}
                className="h-8 w-auto object-contain mix-blend-multiply select-none"
              />
            ) : (
              <span className="font-display text-lg font-bold text-[#14244B] whitespace-nowrap">
                Tinker 550
              </span>
            )}
          </button>

          <span aria-hidden="true" className="text-[#CBD5E1] hidden sm:inline">
            /
          </span>

          <button
            type="button"
            onClick={onBackToChoose}
            className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-[#64748B] hover:text-[#14244B] transition-colors whitespace-nowrap shrink-0 cursor-pointer rounded px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B]"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.backToChoose}</span>
          </button>

          <span aria-hidden="true" className="text-[#CBD5E1]">
            /
          </span>

          <input
            type="text"
            aria-label={t.projectAria}
            value={projectName}
            onChange={(e) => {
              setProjectName(e.target.value);
              setHasRenamedProject(true);
            }}
            className="text-sm font-semibold text-[#14244B] bg-transparent hover:bg-[#F8FAFC] focus:bg-[#F8FAFC] border border-transparent focus:border-[#CBD5E1] rounded-lg px-2 py-1 min-w-[110px] max-w-[220px] truncate focus:outline-none transition-colors"
          />
        </div>

        <div className="relative flex items-center gap-2.5 shrink-0">
          {spotlightStage === 'free' && (
            <button
              type="button"
              onClick={handleReplayGuide}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#475569] hover:text-[#14244B] hover:bg-[#F1F5F9] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B]"
            >
              <Compass className="w-3.5 h-3.5 text-[#4E9AE3]" aria-hidden="true" />
              <span>{t.replayGuide}</span>
            </button>
          )}

          <div
            role="group"
            aria-label="Language switcher"
            className="inline-flex items-center p-0.5 bg-[#F1F5F9] rounded-lg border border-[#E2E8F0] shrink-0"
          >
            <button
              type="button"
              onClick={() => onChangeLang('en')}
              aria-pressed={lang === 'en'}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                lang === 'en'
                  ? 'bg-white text-[#14244B] shadow-xs'
                  : 'text-[#475569] hover:text-[#14244B]'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => onChangeLang('zh')}
              aria-pressed={lang === 'zh'}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                lang === 'zh'
                  ? 'bg-white text-[#14244B] shadow-xs'
                  : 'text-[#475569] hover:text-[#14244B]'
              }`}
            >
              中文
            </button>
          </div>
        </div>
      </header>

      {/* Main 3-Panel Studio Body */}
      <div className="flex-1 flex min-h-0 overflow-clip">
        {/* LEFT + CENTER SPOTLIGHT ZONE */}
        <div
          className={`relative flex-1 min-w-0 flex min-h-0 overflow-clip transition-shadow duration-300 ${
            spotlightStage === 'focus-build'
              ? 'z-30 ring-2 ring-inset ring-[#FBC53D]/80'
              : ''
          }`}
        >
          {/* ① Left Column: Game Asset Library */}
          <AssetsPanel
            lang={lang}
            isOpen={leftOpen}
            width={leftWidth}
            folders={assetFolders}
            items={assetItems}
            unlockedCategories={unlockedCategories}
            selectedAssetId={selectedAssetId}
            pickingForStage={stageAssetPick === 'picking'}
            aiNotice={aiNotice}
            onToggle={() => {
              setStageAssetPick(null);
              setLeftOpen((v) => !v);
            }}
            onSelectAsset={(id) => {
              if (stageAssetPick === 'picking') {
                setStageAssetPick({ assetId: id });
                return;
              }
              setSelectedAssetId((prev) => {
                const next = prev === id ? null : id;
                if (next) {
                  setAssetEditorTab('looks');
                  setStateManagerOpen(false);
                }
                return next;
              });
            }}
            onCreateSubFolder={handleCreateSubFolder}
            onRenameSubFolder={handleRenameSubFolder}
            onDeleteSubFolder={handleDeleteSubFolder}
            onCreateAsset={handleCreateAsset}
            onMoveAsset={handleMoveAsset}
            onDismissAiNotice={() => setAiNotice(null)}
          />

          {/* Side Floating Asset Card Editor */}
          {(() => {
            const activeAsset =
              assetItems.find((item) => item.id === selectedAssetId) ?? null;
            if (!activeAsset) return null;
            return (
              <AssetEditorDrawer
                lang={lang}
                asset={activeAsset}
                audioUnlocked={false}
                propertiesUnlocked={propertiesUnlocked}
                unlockedVisualEffects={
                  activeAsset.id === 'asset-cat' || activeAsset.id === 'asset-score-hud'
                    ? Array.from(
                        new Set([...testCatUnlockedEffects, ...unlockedVisualEffects]),
                      )
                    : unlockedVisualEffects
                }
                activeTab={assetEditorTab}
                highlightPropertyId={highlightPropertyId}
                playValues={playValues}
                leftOffsetPx={leftOpen ? leftWidth + 14 : 56}
                onChangeTab={setAssetEditorTab}
                onClose={() => setSelectedAssetId(null)}
                onUpdateAsset={handleUpdateAsset}
                onDeleteAsset={handleDeleteAsset}
                onAddProperty={handleAddAssetProperty}
                onUpdateProperty={(aid, variable) =>
                  handleUpdateScopedVariable('asset', aid, variable)
                }
                onDeleteProperty={(aid, vid) =>
                  handleDeleteScopedVariable('asset', aid, vid)
                }
                onOpenStateManager={() => {
                  setSelectedAssetId(null);
                  setStateManagerOpen(true);
                }}
              />
            );
          })()}

          {/* Left Vertical Drag Splitter */}
          {leftOpen && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t.assets.resizeAria}
              onPointerDown={startResizeLeft}
              onDoubleClick={() => setLeftWidth(DEFAULT_LEFT_WIDTH)}
              className={`w-1.5 shrink-0 cursor-col-resize flex items-center justify-center group transition-colors ${
                activeSplitter === 'left'
                  ? 'bg-[#4E9AE3]/45'
                  : 'bg-transparent hover:bg-[#4E9AE3]/25'
              }`}
            >
              <div className="w-[2px] h-8 rounded-full bg-[#CBD5E1] group-hover:bg-[#4E9AE3] transition-colors" />
            </div>
          )}

          {/* ② Center Column: Design Board */}
          <div className="relative flex-1 min-w-[280px] flex flex-col min-h-0 overflow-clip">
            {/* Prominent Top Floating Guidance Card (always centered over DesignBoard) */}
            <FloatingGuidance
              lang={lang}
              stage={spotlightStage}
              checklist={checklist}
              nodes={nodes}
              onSkipSpotlight={() => setSpotlightStage('free')}
            />
            <DesignBoard
              lang={lang}
              nodes={nodes}
              edges={edges}
              assetItems={assetItems}
              scopedVariables={scopedVariables}
              stateManagerOpen={stateManagerOpen}
              focusTarget={boardFocusTarget}
              selectedNodeId={selectedNodeId}
              autoFocusNodeId={autoFocusNodeId}
              activePlayNodeIds={activePlayNodeIds}
              activePlayEdgeId={activePlayEdgeId}
              placementCounts={placementCounts}
              onLocateStage={(nodeId) => {
                setRightOpen(true);
                setStageFocus({ nodeId, nonce: Date.now() });
              }}
              onToggleStageTemplate={id => setNodes(items => items.map(item => item.id === id ? { ...item, stageTemplate: !item.stageTemplate } : item))}
              onToggleStageReset={id => setNodes(items => items.map(item => item.id === id ? { ...item, stageResetOnEntry: !item.stageResetOnEntry } : item))}
              onSelectNode={setSelectedNodeId}
              onConsumeAutoFocus={() => setAutoFocusNodeId(null)}
              onDragNode={handleDragNode}
              onCommitNodeDrop={handleCommitNodeDrop}
              onResizeGroup={handleResizeGroup}
              onCommitGroupResize={handleCommitGroupResize}
              onToggleGroupCollapse={handleToggleGroupCollapse}
              onDuplicateNode={handleDuplicateNode}
              onUngroup={handleUngroup}
              onUpdateNode={handleUpdateNode}
              onUpdateNodeField={handleUpdateNodeField}
              onResetNodeAutoFields={handleResetNodeAutoFields}
              onDeleteNode={handleDeleteNode}
              onAddNodeAt={addNodeAt}
              onConnectNodes={handleConnectNodes}
              onUpdateEntryEdgeOffset={handleUpdateEntryEdgeOffset}
              onUpdateEdgeCondition={handleUpdateEdgeCondition}
              onDeleteEdge={handleDeleteEdge}
              onToggleStateManager={(open) =>
                setStateManagerOpen((prev) => {
                  const next = open !== undefined ? open : !prev;
                  if (next) setSelectedAssetId(null);
                  return next;
                })
              }
              onAddGlobalVariable={handleAddGlobalVariable}
              onAddAssetProperty={handleAddAssetProperty}
              onUpdateVariable={handleUpdateScopedVariable}
              onMoveVariableScope={handleMoveVariableScope}
              onDeleteVariable={handleDeleteScopedVariable}
              onUpdatePlayValue={handleUpdatePlayValue}
              onApplyPlayToInitial={handleApplyPlayToInitial}
              onResetPlayValue={handleResetPlayValue}
              onResetAllPlayValues={handleResetAllPlayValues}
              onJumpToAssetProperty={handleJumpToAssetProperty}
              onLocateBoardReference={handleLocateBoardReference}
            />
          </div>
        </div>

        {/* Right Vertical Drag Splitter */}
        {rightOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t.play.resizeAria}
            onPointerDown={startResizeRight}
            onDoubleClick={() => setRightWidth(DEFAULT_RIGHT_WIDTH)}
            className={`w-1.5 shrink-0 cursor-col-resize flex items-center justify-center group transition-colors ${
              activeSplitter === 'right'
                ? 'bg-[#4E9AE3]/45'
                : 'bg-transparent hover:bg-[#4E9AE3]/25'
            }`}
          >
            <div className="w-[2px] h-8 rounded-full bg-[#CBD5E1] group-hover:bg-[#4E9AE3] transition-colors" />
          </div>
        )}

        {/* ③ Right Column: Live Build Preview + Explicit Play Viewport */}
        <StageEditor
            lang={lang}
            isOpen={rightOpen}
            width={rightWidth}
            nodes={nodes}
            edges={edges}
            assets={assetItems}
            variables={scopedVariables}
            selectedNodeId={selectedNodeId}
            stageFocus={stageFocus}
            assetPick={stageAssetPick}
            onAssetPickChange={setStageAssetPick}
            onOpenLibrary={() => { setSelectedAssetId(null); setLeftOpen(true); }}
            onPlacementCounts={setPlacementCounts}
            onToggle={() => { setStageAssetPick(null); setRightOpen((v) => !v); }}
            onLocate={handleLocateBoardReference}
            onActive={handleActivePlayChange}
            onPlay={handleUserTestedInPlay}
        />
      </div>
    </div>
  );
}
