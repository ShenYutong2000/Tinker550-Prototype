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
  INITIAL_EDGES,
  INITIAL_NODES,
  NODE_CATALOG,
  composeNoteFromPromptInput,
  createDefaultPromptInput,
  formatBehaviorSummary,
  formatOutcomeRuleSummary,
  getDefaultKeyForMechanic,
  getNodeAssetIds,
  inferCardFieldsFromText,
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
import {
  detectUnlockedVisualEffectsFromText,
  type VisualEffectType,
} from './asset-library/effects/visualEffectsModel';
import { AssetEditorDrawer } from './asset-library/AssetEditorDrawer';
import { AssetsPanel, type AiPlacedNotice } from './asset-library/AssetsPanel';
import { DesignBoard } from './design-board/DesignBoard';
import { FloatingGuidance } from './guidance/FloatingGuidance';
import { RightStudioColumn } from './playtest/RightStudioColumn';

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
    stageLink?: boolean;
  } | null>(null);

  const scopedVariables = useMemo(
    () => collectAllScopedVariables(globalVariables, assetItems, playValues),
    [globalVariables, assetItems, playValues],
  );

  // Design Board State — starts completely blank (from 0)
  const [nodes, setNodes] = useState<BoardNode[]>(() => [...INITIAL_NODES]);
  const [edges, setEdges] = useState<BoardEdge[]>(() => [...INITIAL_EDGES]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [appearanceReset, setAppearanceReset] = useState<{ target: string } | null>(null);
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
  const [stageEditingCardIds, setStageEditingCardIds] = useState<string[]>([]);
  const [returnToStage, setReturnToStage] = useState(false);
  const [activePlayNodeIds, setActivePlayNodeIds] = useState<string[]>([]);
  const [activePlayEdgeId, setActivePlayEdgeId] = useState<string | null>(null);

  const handleActivePlayChange = useCallback(
    (nodeIds: string[], edgeId: string | null) => {
      setActivePlayNodeIds(nodeIds);
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

    if (activeSplitter === 'left') {
      const next = Math.round(event.clientX - rect.left);
      setLeftWidth(Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, next)));
    } else if (activeSplitter === 'right') {
      const maxRight = Math.max(460, Math.round(rect.width * 0.56));
      const next = Math.round(rect.right - event.clientX);
      setRightWidth(Math.max(MIN_RIGHT_WIDTH, Math.min(maxRight, next)));
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
    (kind: NodeKind, x: number, y: number) => {
      const meta = NODE_CATALOG[kind];
      const id = `n-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      const newNode: BoardNode = {
        id,
        kind,
        parentId: null,
        title: '',
        note: '',
        assetId: undefined,
        assetIds: [],
        promptInput: createDefaultPromptInput(kind),
        fields: {},
        manualFields: [],
        x,
        y,
      };
      setNodes((prev) => [...prev, newNode]);
      setSelectedNodeId(id);
      setAutoFocusNodeId(id);
      if (meta.isPlayable) {
        markCardAdded();
      }
    },
    [markCardAdded],
  );

  const handleDragNode = useCallback((id: string, dx: number, dy: number) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
    );
  }, []);

  const handleUpdateNode = useCallback(
    (
      id: string,
      patch: Partial<Pick<BoardNode, 'title' | 'note' | 'assetId' | 'assetIds' | 'promptInput' | 'challengeAssetId'>>,
    ) => {
      if ('challengeAssetId' in patch) {
        setAppearanceReset({ target: 'challenge:' + id });
      } else if (patch.assetIds?.includes(patch.promptInput?.actorAssetId ?? '')) {
        setAppearanceReset({ target: 'hero' });
      }
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

          const stageAsset = 'challengeAssetId' in patch ? patch.challengeAssetId : n.challengeAssetId;
          return {
            ...n,
            ...patch,
            title: nextTitle,
            note: nextNote,
            promptInput: nextPrompt,
            assetId: nextAssetIds[0],
            assetIds: nextAssetIds,
            challengeAssetId: stageAsset && nextAssetIds.includes(stageAsset) ? stageAsset : undefined,
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
    setNodes((prev) =>
      prev
        .filter((n) => n.id !== id)
        .map((n) => (n.parentId === id ? { ...n, parentId: null } : n)),
    );
    setEdges((prev) => prev.filter((e) => e.fromId !== id && e.toId !== id));
    setSelectedNodeId((prev) => (prev === id ? null : prev));
  }, []);

  const handleConnectNodes = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      setEdges((prev) => {
        const exists = prev.some((e) => e.fromId === fromId && e.toId === toId);
        if (exists) return prev;
        return [...prev, { id: `e-${Date.now().toString(36)}`, fromId, toId }];
      });
      markCardsConnected();
    },
    [markCardsConnected],
  );

  const handleUpdateEdgeCondition = useCallback(
    (edgeId: string, condition: string) => {
      setEdges((prev) =>
        prev.map((e) =>
          e.id === edgeId
            ? { ...e, condition: condition ? condition : undefined }
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
      className={`h-screen w-screen overflow-hidden flex flex-col bg-[#F8FAFC] ${
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
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* LEFT + CENTER SPOTLIGHT ZONE */}
        <div
          className={`relative flex-1 min-w-0 flex min-h-0 overflow-hidden transition-shadow duration-300 ${
            spotlightStage === 'focus-build'
              ? 'z-30 ring-2 ring-inset ring-[#FBC53D]/80'
              : ''
          }`}
        >
          {/* Prominent Top Floating Guidance Card */}
          <FloatingGuidance
            lang={lang}
            stage={spotlightStage}
            checklist={checklist}
            nodes={nodes}
            onSkipSpotlight={() => setSpotlightStage('free')}
          />

          {/* ① Left Column: Game Asset Library */}
          <AssetsPanel
            lang={lang}
            isOpen={leftOpen}
            width={leftWidth}
            folders={assetFolders}
            items={assetItems}
            unlockedCategories={unlockedCategories}
            selectedAssetId={selectedAssetId}
            aiNotice={aiNotice}
            onToggle={() => setLeftOpen((v) => !v)}
            onSelectAsset={(id) => {
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
          <div className="flex-1 min-w-[260px] flex flex-col min-h-0 overflow-hidden">
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
              stageEditingCardIds={stageEditingCardIds}
              activePlayNodeIds={activePlayNodeIds}
              activePlayEdgeId={activePlayEdgeId}
              onSelectNode={setSelectedNodeId}
              onConsumeAutoFocus={() => setAutoFocusNodeId(null)}
              onDragNode={handleDragNode}
              onUpdateNode={handleUpdateNode}
              onUpdateNodeField={handleUpdateNodeField}
              onResetNodeAutoFields={handleResetNodeAutoFields}
              onDeleteNode={handleDeleteNode}
              onAddNodeAt={addNodeAt}
              onConnectNodes={handleConnectNodes}
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

        {returnToStage && <button type="button" className="absolute bottom-4 right-14 z-30 rounded-lg border border-teal-300 bg-white px-3 py-2 text-xs font-semibold text-teal-900 shadow"
          onClick={() => { setReturnToStage(false); setRightOpen(true); }}>
          {lang === 'zh' ? '返回舞台编辑' : 'Back to stage editing'}
        </button>}
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
        <RightStudioColumn
          lang={lang}
          isOpen={rightOpen}
          width={rightWidth}
          spotlightStage={spotlightStage}
          nodes={nodes}
          edges={edges}
          assetItems={assetItems}
          scopedVariables={scopedVariables}
          selectedNodeId={selectedNodeId}
          onToggle={() => {
            if (rightOpen) setStageEditingCardIds([]);
            setReturnToStage(false);
            setRightOpen(!rightOpen);
          }}
          onLocateCard={id => {
            if (window.matchMedia('(max-width: 767px)').matches) {
              setReturnToStage(true);
              setRightOpen(false);
              requestAnimationFrame(() => setBoardFocusTarget({ nodeId: id, nonce: Date.now(), stageLink: true }));
            } else {
              setBoardFocusTarget({ nodeId: id, nonce: Date.now(), stageLink: true });
            }
          }}
          onStageCardsChange={setStageEditingCardIds}
          appearanceReset={appearanceReset}
          onOpenAsset={id => {
            setLeftOpen(true);
            setStateManagerOpen(false);
            setSelectedAssetId(id);
            setAssetEditorTab('looks');
          }}
          onActivePlayChange={handleActivePlayChange}
          onUserTestedInPlay={handleUserTestedInPlay}
          onUpdatePlayValue={handleUpdatePlayValue}
          onResetPlayValues={handleResetAllPlayValues}
        />
      </div>
    </div>
  );
}
