import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  Heart,
  Layers,
  Lock,
  Maximize,
  MessageSquareQuote,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  RotateCcw,
  Shield,
  Sparkles,
  Square,
  Star,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import type { AssetCategoryId, AssetItem } from '../asset-library/assetLibraryModel';
import {
  extractSimulatedEventsFromEdges,
} from '../design-board/arrowConditionModel';
import {
  INITIAL_PLAY_STATS,
  collectNumericBoardParameters,
  computeLoopEdgeIds,
  detectUsedStats,
  evaluateEdgeCondition,
  evaluateGroupAvailability,
  extractCustomFlagConditions,
  findStartNodeId,
  getEvaluatedOutgoing,
  getGroupLocalRoots,
  getPlayableNodes,
  resolveActionConfig,
  resolveChallengeConfig,
  resolveChallengeTimeLimitSec,
  resolveDialogueContent,
  resolveOutcomeConfig,
  resolvePlaybackSettings,
  resolveSceneTheme,
  resolveSubtitlePosition,
  type ChallengeDirection,
  type ConditionEvaluation,
  type PlayRuntimeContext,
  type PlayStats,
  type RuntimeEventRecord,
} from './boardPlayEngine';
import { drawChallengeEntity, drawStageBackdrop } from './cardPreviewDrawing';
import { cardPreviewBounce, cardPreviewCycle, cardPreviewPatrol, cardPreviewTravelSpeed } from './cardPreviewMotion';
import { COPY, type Language } from '../../../shared/i18n';
import {
  applyOutcomePropertyRule,
  clampNumberValue,
  formatVariableValue,
  type ScopedStateVariable,
  type StateVariableValue,
} from '../properties/stateModel';
import {
  getDescendantNodeIds,
  getNodeAssetIds,
  isDescendantOf,
  resolveGroupCode,
  type ActionControlConfig,
  type ActionMechanic,
  type BoardEdge,
  type BoardNode,
  type ChallengePattern,
  type ChallengeSpeed,
  type ChallengeVisual,
  type OutcomeVisualKind,
  type SceneTheme,
  type SpotlightStage,
} from '../design-board/studioModel';
import {
  bakeStaticEffectsToCanvas,
  buildCssFilterString,
  drawSpriteWithEffects,
  getStaticEffectsFingerprint,
  getStaticOpacity,
  isHiddenByEffect,
  type VisualEffectItem,
} from '../asset-library/effects/visualEffectsModel';

interface RightStudioColumnProps {
  onEditScene: () => void;
  lang: Language;
  isOpen: boolean;
  width: number;
  spotlightStage: SpotlightStage;
  nodes: BoardNode[];
  edges: BoardEdge[];
  assetItems: AssetItem[];
  scopedVariables: ScopedStateVariable[];
  selectedNodeId: string | null;
  onToggle: () => void;
  onActivePlayChange: (nodeIds: string[], edgeId: string | null) => void;
  onUserTestedInPlay: () => void;
  onUpdatePlayValue: (variableId: string, value: StateVariableValue) => void;
}

interface FloatingPopup {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

interface EnergyWave {
  x: number;
  y: number;
  vx: number;
  actionControlId: string;
}

interface ActiveHazard {
  x: number;
  y: number;
  baseY: number;
  vx: number;
  vy: number;
  radius: number;
  kind: ChallengePattern;
  direction: ChallengeDirection;
  speed: ChallengeSpeed;
  speedMultiplier: number;
  visual: ChallengeVisual;
  bounces: boolean;
  rotates: boolean;
  age: number;
  resolved: boolean;
  wasJumpedOver: boolean;
}

interface LiveActionControl {
  id: string;
  edgeId: string | null;
  fromNodeId: string | null;
  ownerNodeId: string | null;
  ownerLabel?: string;
  target: BoardNode;
  mechanic: ActionMechanic;
  keyLabel: string;
  control: ActionControlConfig;
  evaluation: ConditionEvaluation;
}

type PlayMode = 'preview' | 'playing';
type StagePhase = 'overlay' | 'live' | 'resolving' | 'ended';

function renderActionIcon(mechanic: ActionMechanic) {
  const cls = 'w-3.5 h-3.5 shrink-0';
  if (mechanic === 'jump') return <ArrowUp className={cls} aria-hidden="true" />;
  if (mechanic === 'shield') return <Shield className={cls} aria-hidden="true" />;
  if (mechanic === 'dodge') return <Wind className={cls} aria-hidden="true" />;
  return <Zap className={cls} aria-hidden="true" />;
}

function matchesKeyEvent(keyBinding: string, e: KeyboardEvent): boolean {
  const k = keyBinding.trim().toLowerCase();
  if (!k) return false;
  if (k === 'space' || k === ' ') return e.code === 'Space';
  if (k === 'enter') return e.code === 'Enter';
  if (k === 'shift') return e.code === 'ShiftLeft' || e.code === 'ShiftRight';
  if (k === 'arrowup') return e.code === 'ArrowUp';
  if (k === 'arrowdown') return e.code === 'ArrowDown';
  if (k === 'arrowleft') return e.code === 'ArrowLeft';
  if (k === 'arrowright') return e.code === 'ArrowRight';
  return e.key.toLowerCase() === k || e.code.toLowerCase() === `key${k}`;
}

const PASSING_EVAL: ConditionEvaluation = {
  hasCondition: false,
  raw: '',
  kind: 'none',
  passed: true,
};

export function RightStudioColumn({
  lang,
  isOpen,
  width,
  spotlightStage,
  nodes,
  edges,
  assetItems,
  scopedVariables,
  selectedNodeId,
  onToggle,
  onActivePlayChange,
  onUserTestedInPlay,
  onUpdatePlayValue,
  onEditScene,
}: RightStudioColumnProps) {
  const t = COPY[lang].studio.play;
  const st = COPY[lang].studio.states;
  const isDimmed = spotlightStage === 'focus-build';
  const isSpotlighted = spotlightStage === 'focus-play';

  const playableNodes = useMemo(() => getPlayableNodes(nodes), [nodes]);
  const nodeMap = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes],
  );
  const playableMap = useMemo(
    () => new Map(playableNodes.map((n) => [n.id, n])),
    [playableNodes],
  );
  const playableIdSet = useMemo(
    () => new Set(playableNodes.map((n) => n.id)),
    [playableNodes],
  );
  const loopEdgeIds = useMemo(() => computeLoopEdgeIds(nodes, edges), [nodes, edges]);
  const startNodeId = useMemo(() => findStartNodeId(nodes, edges), [nodes, edges]);
  const customFlagNames = useMemo(
    () => extractCustomFlagConditions(nodes, edges, scopedVariables),
    [nodes, edges, scopedVariables],
  );
  const simulatedEventList = useMemo(
    () => extractSimulatedEventsFromEdges(nodes, edges, playableIdSet, lang),
    [edges, lang, nodes, playableIdSet],
  );
  const usedStats = useMemo(() => detectUsedStats(nodes, edges), [nodes, edges]);
  const assetMap = useMemo(
    () => new Map(assetItems.map((a) => [a.id, a])),
    [assetItems],
  );

  const getAssetVisualBinding = useCallback(
    (assetId?: string) => {
      if (!assetId) return null;
      const asset = assetMap.get(assetId);
      if (!asset) return null;
      const st =
        asset.states.find((s) => s.id === asset.activeStateId) ?? asset.states[0];
      if (st && st.mediaKind !== 'video' && st.mediaUrl) {
        return {
          assetId: asset.id,
          url: st.mediaUrl,
          effects: st.visualEffects,
          fingerprint: getStaticEffectsFingerprint(st.visualEffects),
        };
      }
      return null;
    },
    [assetMap],
  );

  // Play Mode: Live Build Preview (default) vs Explicit Play Run
  const [playMode, setPlayMode] = useState<PlayMode>('preview');
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!fullscreen) return;
    const leave = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', leave);
    return () => window.removeEventListener('keydown', leave);
  }, [fullscreen]);
  const [activeNodeIds, setActiveNodeIds] = useState<string[]>([]);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [focusedGroupId, setFocusedGroupId] = useState<string | null>(null);
  const [unlockedGroupIds, setUnlockedGroupIds] = useState<string[]>([]);
  const [completedGroupIds, setCompletedGroupIds] = useState<string[]>([]);
  const [pendingGroupIds, setPendingGroupIds] = useState<string[]>([]);
  const [completedNodeIds, setCompletedNodeIds] = useState<string[]>([]);
  const [lastEdgeId, setLastEdgeId] = useState<string | null>(null);
  const [stats, setStats] = useState<PlayStats>(INITIAL_PLAY_STATS);
  const [customFlags, setCustomFlags] = useState<Record<string, boolean>>({});
  const [simulatedEvents, setSimulatedEvents] = useState<Record<string, boolean>>({});
  const [simRevision, setSimRevision] = useState(0);
  const [waveNumber, setWaveNumber] = useState(1);
  const [challengeTimeLeft, setChallengeTimeLeft] = useState<number | null>(null);
  const [phase, setPhase] = useState<StagePhase>('overlay');
  const [hudToast, setHudToast] = useState<{
    text: string;
    tone: 'celebrate' | 'hurt' | 'victory' | 'defeat' | 'neutral';
  } | null>(null);
  const [endSummary, setEndSummary] = useState<{
    text: string;
    tone: 'victory' | 'defeat' | 'neutral';
  } | null>(null);

  // Build Preview assembled dynamically from student-authored playable cards ONLY
  const previewSnapshot = useMemo(() => {
    const selectedNode = selectedNodeId ? playableMap.get(selectedNodeId) ?? null : null;
    const selectedGroupDescendantIds =
      selectedNode?.kind === 'group'
        ? new Set(getDescendantNodeIds(selectedNode.id, nodes))
        : null;
    const scopedPool =
      selectedGroupDescendantIds && selectedGroupDescendantIds.size > 0
        ? playableNodes.filter((n) => selectedGroupDescendantIds.has(n.id))
        : playableNodes;
    const effectivePool = scopedPool.length > 0 ? scopedPool : playableNodes;

    const narrations = effectivePool.filter((n) => n.kind === 'narration');
    const dialogues = effectivePool.filter((n) => n.kind === 'dialogue');
    const challenges = effectivePool.filter((n) => n.kind === 'challenge');
    const actions = effectivePool.filter((n) => n.kind === 'action');
    const outcomes = effectivePool.filter((n) => n.kind === 'outcome');

    const narration =
      (selectedNode?.kind === 'narration' ? selectedNode : null) ??
      narrations[narrations.length - 1] ??
      null;
    const dialogue =
      (selectedNode?.kind === 'dialogue' ? selectedNode : null) ??
      dialogues[dialogues.length - 1] ??
      null;
    const challenge =
      (selectedNode?.kind === 'challenge' ? selectedNode : null) ??
      challenges[challenges.length - 1] ??
      null;
    const outcome =
      (selectedNode?.kind === 'outcome' ? selectedNode : null) ??
      outcomes[outcomes.length - 1] ??
      null;

    const narrationPos = narration ? resolveSubtitlePosition(narration) : 'bottom';
    const themeNode =
      selectedNode && (selectedNode.kind === 'narration' || selectedNode.kind === 'challenge')
        ? selectedNode
        : narration ?? challenge;
    const sceneTheme: SceneTheme = themeNode ? resolveSceneTheme(themeNode) : 'neutral';

    let showNarration = Boolean(narration);
    let showDialogue = Boolean(dialogue);
    if (showNarration && showDialogue && narrationPos === 'bottom') {
      if (selectedNode?.kind === 'narration') {
        showDialogue = false;
      } else {
        showNarration = false;
      }
    }

    const challengeCfg = challenge ? resolveChallengeConfig(challenge) : null;
    const outcomeCfg = outcome ? resolveOutcomeConfig(outcome) : null;
    const hasHeroCharacterAsset = effectivePool.some(
      (n) =>
        n.kind !== 'challenge' &&
        getNodeAssetIds(n).some((id) => assetMap.get(id)?.categoryId === 'characters'),
    );
    const showHero =
      actions.length > 0 || dialogues.length > 0 || challenges.length > 0 || hasHeroCharacterAsset;

    return {
      selectedNode,
      sceneTheme,
      narration: showNarration ? narration : null,
      narrationPos,
      dialogue: showDialogue ? dialogue : null,
      challenge,
      challengeCfg,
      actions,
      outcome,
      outcomeCfg,
      showHero,
    };
  }, [assetMap, nodes, playableMap, playableNodes, selectedNodeId]);

  const getNodeVisualBindingByCategories = useCallback(
    (
      node: BoardNode | null | undefined,
      preferredCategories: AssetCategoryId[],
      strictCategories = false,
    ) => {
      if (!node) return null;
      const ids = [...getNodeAssetIds(node)].reverse();
      for (const cat of preferredCategories) {
        const matchId = ids.find((id) => assetMap.get(id)?.categoryId === cat);
        if (matchId) {
          const binding = getAssetVisualBinding(matchId);
          if (binding) return binding;
        }
      }
      if (strictCategories) return null;
      for (const id of ids) {
        const binding = getAssetVisualBinding(id);
        if (binding) return binding;
      }
      return null;
    },
    [assetMap, getAssetVisualBinding],
  );

  // Separate Hero character binding cleanly from Challenge obstacle assets
  const characterBinding = useMemo(() => {
    const resolveCharacterFromNode = (node: BoardNode) => {
      if (node.kind === 'challenge') {
        const actorId = node.promptInput?.actorAssetId;
        if (actorId && actorId !== node.promptInput?.obstacleAssetId) {
          const binding = getAssetVisualBinding(actorId);
          if (binding) return binding;
        }
        return null;
      }

      const boundIds = [...getNodeAssetIds(node)].reverse();
      const boundCharId = boundIds.find(
        (id) => assetMap.get(id)?.categoryId === 'characters',
      );
      if (boundCharId) {
        const binding = getAssetVisualBinding(boundCharId);
        if (binding) return binding;
      }

      if (node.kind === 'action' && node.promptInput?.actorAssetId) {
        const actorBinding = getAssetVisualBinding(node.promptInput.actorAssetId);
        if (actorBinding) return actorBinding;
      }

      const namedChar =
        node.kind === 'dialogue'
          ? node.title.trim()
          : node.kind === 'action'
            ? node.promptInput?.actorName?.trim() ?? ''
            : '';
      if (namedChar) {
        const matched = assetItems.find(
          (a) =>
            a.categoryId === 'characters' &&
            a.name.trim().toLowerCase() === namedChar.toLowerCase(),
        );
        if (matched) {
          const binding = getAssetVisualBinding(matched.id);
          if (binding) return binding;
        }
      }
      return null;
    };

    const selectedGroupDescendantIds =
      previewSnapshot.selectedNode?.kind === 'group'
        ? new Set(getDescendantNodeIds(previewSnapshot.selectedNode.id, nodes))
        : null;

    const prioritized = playableNodes.filter((n) =>
      playMode === 'playing'
        ? n.id === focusedNodeId || activeNodeIds.includes(n.id)
        : n.id === selectedNodeId || Boolean(selectedGroupDescendantIds?.has(n.id)),
    );
    prioritized.sort((a, b) => {
      if (playMode === 'playing') {
        if (a.id === focusedNodeId) return -1;
        if (b.id === focusedNodeId) return 1;
      }
      return 0;
    });
    for (const node of prioritized) {
      const binding = resolveCharacterFromNode(node);
      if (binding) return binding;
    }
    const nonChallengeFallback = playableNodes.filter((n) => n.kind !== 'challenge');
    for (const node of nonChallengeFallback) {
      const binding = resolveCharacterFromNode(node);
      if (binding) return binding;
    }
    return null;
  }, [
    activeNodeIds,
    assetItems,
    assetMap,
    focusedNodeId,
    getAssetVisualBinding,
    nodes,
    playMode,
    playableNodes,
    previewSnapshot.selectedNode,
    selectedNodeId,
  ]);

  const backgroundBinding = useMemo(() => {
    const hasBgAsset = (n: BoardNode) =>
      getNodeAssetIds(n).some((id) => assetMap.get(id)?.categoryId === 'backgrounds');

    const selectedGroupDescendantIds =
      previewSnapshot.selectedNode?.kind === 'group'
        ? new Set(getDescendantNodeIds(previewSnapshot.selectedNode.id, nodes))
        : null;

    const activeMatch =
      (playMode === 'playing' && focusedNodeId
        ? playableNodes.find((n) => n.id === focusedNodeId && hasBgAsset(n))
        : undefined) ??
      playableNodes.find(
        (n) =>
          (playMode === 'playing'
            ? activeNodeIds.includes(n.id)
            : n.id === selectedNodeId || Boolean(selectedGroupDescendantIds?.has(n.id))) &&
          hasBgAsset(n),
      );
    if (activeMatch) {
      return getNodeVisualBindingByCategories(activeMatch, ['backgrounds'], true);
    }
    const narrationOrChallenge =
      [...playableNodes].reverse().find((n) => n.kind === 'narration' && hasBgAsset(n)) ??
      [...playableNodes].reverse().find((n) => n.kind === 'challenge' && hasBgAsset(n)) ??
      [...playableNodes].reverse().find((n) => hasBgAsset(n));
    return getNodeVisualBindingByCategories(narrationOrChallenge, ['backgrounds'], true);
  }, [
    activeNodeIds,
    assetMap,
    focusedNodeId,
    getNodeVisualBindingByCategories,
    nodes,
    playMode,
    playableNodes,
    previewSnapshot.selectedNode,
    selectedNodeId,
  ]);

  const challengeBinding = useMemo(() => {
    const focusedChallenge =
      playMode === 'playing' && focusedNodeId
        ? playableNodes.find((n) => n.id === focusedNodeId && n.kind === 'challenge')
        : undefined;
    const targetChallenge =
      playMode === 'playing'
        ? focusedChallenge ??
          playableNodes.find(
            (n) => n.kind === 'challenge' && activeNodeIds.includes(n.id),
          )
        : previewSnapshot.challenge;
    if (!targetChallenge) return null;
    return getNodeVisualBindingByCategories(
      targetChallenge,
      ['objects', 'characters', 'effects'],
      true,
    );
  }, [
    activeNodeIds,
    focusedNodeId,
    getNodeVisualBindingByCategories,
    playMode,
    playableNodes,
    previewSnapshot.challenge,
  ]);

  // Refs for smooth 60fps Canvas Loop
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heroImgRef = useRef<HTMLImageElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const hazardImgRef = useRef<HTMLImageElement | null>(null);
  const heroBakedRef = useRef<{ canvas: HTMLCanvasElement; padRatio: number } | null>(null);
  const bgBakedRef = useRef<{ canvas: HTMLCanvasElement; padRatio: number } | null>(null);
  const hazardBakedRef = useRef<{ canvas: HTMLCanvasElement; padRatio: number } | null>(null);
  const heroEffectsRef = useRef<VisualEffectItem[] | undefined>(undefined);
  heroEffectsRef.current = characterBinding?.effects;
  const bgEffectsRef = useRef<VisualEffectItem[] | undefined>(undefined);
  bgEffectsRef.current = backgroundBinding?.effects;
  const hazardEffectsRef = useRef<VisualEffectItem[] | undefined>(undefined);
  hazardEffectsRef.current = challengeBinding?.effects;
  const heroAssetIdRef = useRef<string | undefined>(undefined);
  heroAssetIdRef.current = characterBinding?.assetId;
  const backgroundAssetIdRef = useRef<string | undefined>(undefined);
  backgroundAssetIdRef.current = backgroundBinding?.assetId;
  const hazardAssetIdRef = useRef<string | undefined>(undefined);
  hazardAssetIdRef.current = challengeBinding?.assetId;
  const resolveTimerRef = useRef<number | null>(null);

  const playModeRef = useRef(playMode);
  playModeRef.current = playMode;
  const previewSnapshotRef = useRef(previewSnapshot);
  previewSnapshotRef.current = previewSnapshot;
  const statsRef = useRef(stats);
  statsRef.current = stats;
  const customFlagsRef = useRef(customFlags);
  customFlagsRef.current = customFlags;
  const simulatedEventsRef = useRef(simulatedEvents);
  simulatedEventsRef.current = simulatedEvents;
  const activeNodeIdsRef = useRef(activeNodeIds);
  activeNodeIdsRef.current = activeNodeIds;
  const focusedNodeIdRef = useRef(focusedNodeId);
  focusedNodeIdRef.current = focusedNodeId;
  const focusedGroupIdRef = useRef(focusedGroupId);
  focusedGroupIdRef.current = focusedGroupId;
  const unlockedGroupIdsRef = useRef(unlockedGroupIds);
  unlockedGroupIdsRef.current = unlockedGroupIds;
  const completedGroupIdsRef = useRef(completedGroupIds);
  completedGroupIdsRef.current = completedGroupIds;
  const pendingGroupIdsRef = useRef(pendingGroupIds);
  pendingGroupIdsRef.current = pendingGroupIds;
  const completedNodeIdsRef = useRef(completedNodeIds);
  completedNodeIdsRef.current = completedNodeIds;
  const actionOwnerMapRef = useRef<Map<string, string>>(new Map());
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const loopEdgeIdsRef = useRef(loopEdgeIds);
  loopEdgeIdsRef.current = loopEdgeIds;
  const scopedVariablesRef = useRef(scopedVariables);
  scopedVariablesRef.current = scopedVariables;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const playableCountRef = useRef(playableNodes.length);
  playableCountRef.current = playableNodes.length;
  const runtimeEventsRef = useRef<Set<string>>(new Set());
  const runtimeEventRecordsRef = useRef<RuntimeEventRecord[]>([]);
  const pendingActionIdsRef = useRef<Set<string>>(new Set());
  const firedTriggerEdgeIdsRef = useRef<Set<string>>(new Set());
  const challengeTimerRemainingRef = useRef<number | null>(null);
  const lastTimerShownRef = useRef<number | null>(null);
  const prevSpatialRef = useRef({
    wasAirborne: false,
    wasTouching: false,
    wasBlocking: false,
    wasDashing: false,
  });
  const reactiveTransitionLockRef = useRef(false);

  const WORLD_W = 360;
  const WORLD_H = 250;
  const GROUND_Y = 196;
  const HERO_BASE_X = 76;

  const simRef = useRef({
    time: 0,
    heroX: HERO_BASE_X,
    heroY: GROUND_Y,
    heroVx: 0,
    heroVy: 0,
    onGround: true,
    shieldTimer: 0,
    dodgeTimer: 0,
    hurtTimer: 0,
    lanternFlare: 0,
    victoryGlow: 0,
    lastActionControlId: null as string | null,
    lastActionMechanic: null as ActionMechanic | null,
    hazard: null as ActiveHazard | null,
    waves: [] as EnergyWave[],
    particles: [] as Particle[],
    popups: [] as FloatingPopup[],
    popupSeq: 1,
  });

  useEffect(() => {
    const url = characterBinding?.url;
    if (!url) {
      heroImgRef.current = null;
      heroBakedRef.current = null;
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      heroImgRef.current = img;
      heroBakedRef.current = bakeStaticEffectsToCanvas(img, heroEffectsRef.current);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [characterBinding?.url]);

  useEffect(() => {
    if (heroImgRef.current) {
      heroBakedRef.current = bakeStaticEffectsToCanvas(
        heroImgRef.current,
        heroEffectsRef.current,
      );
    }
  }, [characterBinding?.fingerprint]);

  useEffect(() => {
    const url = backgroundBinding?.url;
    if (!url) {
      bgImgRef.current = null;
      bgBakedRef.current = null;
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      bgImgRef.current = img;
      bgBakedRef.current = bakeStaticEffectsToCanvas(img, bgEffectsRef.current);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [backgroundBinding?.url]);

  useEffect(() => {
    if (bgImgRef.current) {
      bgBakedRef.current = bakeStaticEffectsToCanvas(
        bgImgRef.current,
        bgEffectsRef.current,
      );
    }
  }, [backgroundBinding?.fingerprint]);

  useEffect(() => {
    const url = challengeBinding?.url;
    if (!url) {
      hazardImgRef.current = null;
      hazardBakedRef.current = null;
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      hazardImgRef.current = img;
      hazardBakedRef.current = bakeStaticEffectsToCanvas(img, hazardEffectsRef.current);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [challengeBinding?.url]);

  useEffect(() => {
    if (hazardImgRef.current) {
      hazardBakedRef.current = bakeStaticEffectsToCanvas(
        hazardImgRef.current,
        hazardEffectsRef.current,
      );
    }
  }, [challengeBinding?.fingerprint]);

  useEffect(() => {
    return () => {
      if (resolveTimerRef.current !== null) {
        window.clearTimeout(resolveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (playableNodes.length === 0 && playMode === 'playing') {
      if (resolveTimerRef.current !== null) {
        window.clearTimeout(resolveTimerRef.current);
        resolveTimerRef.current = null;
      }
      setPlayMode('preview');
      setActiveNodeIds([]);
      setFocusedNodeId(null);
      setFocusedGroupId(null);
      setUnlockedGroupIds([]);
      setCompletedGroupIds([]);
      setPendingGroupIds([]);
      setCompletedNodeIds([]);
      setLastEdgeId(null);
      simRef.current.hazard = null;
    }
  }, [playMode, playableNodes.length]);

  useEffect(() => {
    if (playMode === 'playing') {
      onActivePlayChange(activeNodeIds, lastEdgeId);
    } else {
      onActivePlayChange([], null);
    }
  }, [activeNodeIds, lastEdgeId, onActivePlayChange, playMode]);

  const activeNodes = useMemo(
    () =>
      activeNodeIds
        .map((id) => playableMap.get(id))
        .filter((n): n is BoardNode => Boolean(n && n.kind !== 'group')),
    [activeNodeIds, playableMap],
  );
  const primaryNode = useMemo(
    () =>
      (focusedNodeId ? activeNodes.find((n) => n.id === focusedNodeId) : undefined) ??
      activeNodes[0] ??
      null,
    [activeNodes, focusedNodeId],
  );

  const activeSceneTheme = useMemo<SceneTheme>(() => {
    if (playMode === 'playing') {
      const themeNode =
        (primaryNode && (primaryNode.kind === 'narration' || primaryNode.kind === 'challenge')
          ? primaryNode
          : undefined) ??
        activeNodes.find((n) => n.kind === 'narration' || n.kind === 'challenge') ??
        playableNodes.find((n) => n.kind === 'narration' || n.kind === 'challenge');
      if (themeNode) return resolveSceneTheme(themeNode);
    }
    return previewSnapshot.sceneTheme;
  }, [activeNodes, playMode, playableNodes, previewSnapshot.sceneTheme, primaryNode]);
  const activeSceneThemeRef = useRef<SceneTheme>(activeSceneTheme);
  activeSceneThemeRef.current = activeSceneTheme;

  const buildRuntimeCtx = useCallback((): PlayRuntimeContext => {
    const sim = simRef.current;
    return {
      runtimeEvents: runtimeEventsRef.current,
      eventRecords: runtimeEventRecordsRef.current,
      heroAssetId: heroAssetIdRef.current,
      hazardAssetId: hazardAssetIdRef.current,
      simulatedEvents: simulatedEventsRef.current,
      numericParameters: collectNumericBoardParameters(nodesRef.current),
      spatial: {
        heroX: sim.heroX,
        heroY: sim.heroY,
        groundY: GROUND_Y,
        heroVx: sim.heroVx,
        heroVy: sim.heroVy,
        onGround: sim.onGround,
        shieldTimer: sim.shieldTimer,
        dodgeTimer: sim.dodgeTimer,
        hasHazard: Boolean(sim.hazard),
        hazardX: sim.hazard?.x ?? 0,
        hazardY: sim.hazard?.y ?? 0,
        hazardVx: sim.hazard?.vx ?? 0,
        hazardVy: sim.hazard?.vy ?? 0,
        hazardKind: sim.hazard?.kind,
        hazardResolved: sim.hazard?.resolved,
      },
    };
  }, []);

  const outgoing = useMemo(() => {
    void simRevision;
    return getEvaluatedOutgoing(
      activeNodeIds,
      nodes,
      edges,
      stats,
      customFlags,
      loopEdgeIds,
      scopedVariables,
      buildRuntimeCtx(),
    );
  }, [
    activeNodeIds,
    buildRuntimeCtx,
    customFlags,
    edges,
    loopEdgeIds,
    nodes,
    scopedVariables,
    simRevision,
    simulatedEvents,
    stats,
  ]);

  const liveActionControls = useMemo<LiveActionControl[]>(() => {
    if (playMode !== 'playing') return [];

    // Collect action controls for the focused mechanism AND any parallel mechanisms in the same chapter
    const relevantActive = activeNodes.filter((n) => {
      if (n.kind !== 'challenge' && n.kind !== 'action') return false;
      if (!focusedGroupId) return true;
      return n.parentId === focusedGroupId || isDescendantOf(n.id, focusedGroupId, nodeMap);
    });
    const mechanismPool =
      relevantActive.length > 0
        ? relevantActive
        : primaryNode && (primaryNode.kind === 'challenge' || primaryNode.kind === 'action')
          ? [primaryNode]
          : [];
    if (mechanismPool.length === 0) return [];

    // Order with focused primaryNode first
    const orderedPool = [...mechanismPool].sort((a, b) => {
      if (a.id === primaryNode?.id) return -1;
      if (b.id === primaryNode?.id) return 1;
      return 0;
    });

    const controls: LiveActionControl[] = [];
    const showMechLabel = orderedPool.length > 1;
    const runtimeCtx = buildRuntimeCtx();

    for (const mechNode of orderedPool) {
      const mechLabel = showMechLabel
        ? mechNode.note.trim() || mechNode.title.trim() || mechNode.kind
        : undefined;

      if (mechNode.kind === 'challenge') {
        const mechOut = getEvaluatedOutgoing(
          [mechNode.id],
          nodes,
          edges,
          stats,
          customFlags,
          loopEdgeIds,
          scopedVariables,
          runtimeCtx,
        );
        const wired = mechOut
          .filter((item) => item.target.kind === 'action')
          .map((item) => {
            const cfg = resolveActionConfig(item.target);
            return {
              id: `${mechNode.id}::${item.edge.id}`,
              edgeId: item.edge.id,
              fromNodeId: item.edge.fromId,
              ownerNodeId: mechNode.id,
              ownerLabel: mechLabel,
              target: item.target,
              mechanic: cfg.mechanic,
              keyLabel: cfg.keyBinding,
              control: cfg.control,
              evaluation: item.evaluation,
            };
          });
        if (wired.length > 0) {
          controls.push(...wired);
          continue;
        }

        // Fallback to sibling actions inside same group, or board actions
        const groupSiblingActions = playableNodes.filter(
          (n) => n.kind === 'action' && n.parentId && n.parentId === mechNode.parentId,
        );
        const fallbackActions =
          groupSiblingActions.length > 0
            ? groupSiblingActions
            : playableNodes.filter((n) => n.kind === 'action');
        for (const actionNode of fallbackActions) {
          const cfg = resolveActionConfig(actionNode);
          controls.push({
            id: `free-${mechNode.id}-${actionNode.id}`,
            edgeId: null,
            fromNodeId: mechNode.id,
            ownerNodeId: mechNode.id,
            ownerLabel: mechLabel,
            target: actionNode,
            mechanic: cfg.mechanic,
            keyLabel: cfg.keyBinding,
            control: cfg.control,
            evaluation: PASSING_EVAL,
          });
        }
      } else if (mechNode.kind === 'action') {
        const cfg = resolveActionConfig(mechNode);
        controls.push({
          id: `sandbox-${mechNode.id}`,
          edgeId: null,
          fromNodeId: null,
          ownerNodeId: mechNode.id,
          ownerLabel: mechLabel,
          target: mechNode,
          mechanic: cfg.mechanic,
          keyLabel: cfg.keyBinding,
          control: cfg.control,
          evaluation: PASSING_EVAL,
        });
      }
    }

    return controls;
  }, [
    activeNodes,
    buildRuntimeCtx,
    customFlags,
    edges,
    focusedGroupId,
    loopEdgeIds,
    nodeMap,
    nodes,
    playMode,
    playableNodes,
    primaryNode,
    scopedVariables,
    stats,
  ]);

  const liveActionControlsRef = useRef(liveActionControls);
  liveActionControlsRef.current = liveActionControls;

  const spawnParticles = useCallback(
    (x: number, y: number, color: string, count = 14) => {
      const sim = simRef.current;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const speed = 45 + Math.random() * 110;
        sim.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 35,
          size: 2.5 + Math.random() * 3.5,
          color,
          life: 0.55 + Math.random() * 0.35,
          maxLife: 0.9,
        });
      }
    },
    [],
  );

  const pushPopup = useCallback((x: number, y: number, text: string, color: string) => {
    const sim = simRef.current;
    sim.popups.push({
      id: sim.popupSeq++,
      x,
      y,
      text,
      color,
      life: 1.15,
    });
  }, []);

  const recordRuntimeEvent = useCallback(
    (
      eventId: string,
      opts?: Omit<RuntimeEventRecord, 'eventId'>,
    ): boolean => {
      let added = false;
      if (!runtimeEventsRef.current.has(eventId)) {
        runtimeEventsRef.current.add(eventId);
        added = true;
      }
      if (opts) {
        const dup = runtimeEventRecordsRef.current.some(
          (r) =>
            r.eventId === eventId &&
            r.subjectAssetId === opts.subjectAssetId &&
            r.subjectRole === opts.subjectRole &&
            r.targetAssetId === opts.targetAssetId &&
            r.targetRole === opts.targetRole,
        );
        if (!dup) {
          runtimeEventRecordsRef.current.push({ eventId, ...opts });
          added = true;
        }
      } else if (added) {
        runtimeEventRecordsRef.current.push({ eventId });
      }
      return added;
    },
    [],
  );

  const spawnChallengeHazard = useCallback(
    (challengeNode: BoardNode) => {
      const cfg = resolveChallengeConfig(challengeNode);
      const sim = simRef.current;
      sim.lastActionControlId = null;
      sim.lastActionMechanic = null;
      sim.waves = [];
      if (heroAssetIdRef.current) {
        recordRuntimeEvent('appears', {
          subjectAssetId: heroAssetIdRef.current,
          subjectRole: 'hero',
        });
      }

      if (cfg.isSceneOnly) {
        sim.hazard = null;
        return;
      }

      recordRuntimeEvent('appears', {
        subjectAssetId: hazardAssetIdRef.current,
        subjectRole: 'hazard',
      });

    const travelSpeed = cardPreviewTravelSpeed(cfg.direction, cfg.pattern, cfg.speedMultiplier);
    const baseY = cfg.pattern === 'collectible' ? GROUND_Y - 58 : GROUND_Y - 14;
    const radius = cfg.pattern === 'collectible' ? 14 : 13;

    if (cfg.direction === 'down') {
      sim.hazard = {
        x: HERO_BASE_X + 6,
        y: -18,
        baseY: -18,
        vx: 0,
        vy: travelSpeed,
        radius,
        kind: cfg.pattern,
        direction: cfg.direction,
        speed: cfg.speed,
        speedMultiplier: cfg.speedMultiplier,
        visual: cfg.visual,
        bounces: cfg.bounces,
        rotates: cfg.rotates,
        age: 0,
        resolved: false,
        wasJumpedOver: false,
      };
    } else if (cfg.direction === 'up') {
      sim.hazard = {
        x: HERO_BASE_X + 78,
        y: GROUND_Y + 12,
        baseY: GROUND_Y + 12,
        vx: 0,
        vy: -travelSpeed,
        radius,
        kind: cfg.pattern,
        direction: cfg.direction,
        speed: cfg.speed,
        speedMultiplier: cfg.speedMultiplier,
        visual: cfg.visual,
        bounces: cfg.bounces,
        rotates: cfg.rotates,
        age: 0,
        resolved: false,
        wasJumpedOver: false,
      };
    } else if (cfg.direction === 'right') {
      sim.hazard = {
        x: -24,
        y: baseY,
        baseY,
        vx: travelSpeed,
        vy: 0,
        radius,
        kind: cfg.pattern,
        direction: cfg.direction,
        speed: cfg.speed,
        speedMultiplier: cfg.speedMultiplier,
        visual: cfg.visual,
        bounces: cfg.bounces,
        rotates: cfg.rotates,
        age: 0,
        resolved: false,
        wasJumpedOver: false,
      };
    } else if (cfg.direction === 'patrol') {
      sim.hazard = {
        x: 248,
        y: baseY,
        baseY,
        vx: -travelSpeed,
        vy: 0,
        radius,
        kind: cfg.pattern,
        direction: cfg.direction,
        speed: cfg.speed,
        speedMultiplier: cfg.speedMultiplier,
        visual: cfg.visual,
        bounces: cfg.bounces,
        rotates: cfg.rotates,
        age: 0,
        resolved: false,
        wasJumpedOver: false,
      };
    } else if (cfg.direction === 'static') {
      sim.hazard = {
        x: 232,
        y: baseY,
        baseY,
        vx: 0,
        vy: 0,
        radius,
        kind: cfg.pattern,
        direction: cfg.direction,
        speed: cfg.speed,
        speedMultiplier: cfg.speedMultiplier,
        visual: cfg.visual,
        bounces: cfg.bounces,
        rotates: cfg.rotates,
        age: 0,
        resolved: false,
        wasJumpedOver: false,
      };
    } else {
      // Default: 'left' (approaching from right toward player)
      sim.hazard = {
        x: WORLD_W + 24,
        y: baseY,
        baseY,
        vx: -travelSpeed,
        vy: 0,
        radius,
        kind: cfg.pattern,
        direction: 'left',
        speed: cfg.speed,
        speedMultiplier: cfg.speedMultiplier,
        visual: cfg.visual,
        bounces: cfg.bounces,
        rotates: cfg.rotates,
        age: 0,
        resolved: false,
        wasJumpedOver: false,
      };
    }
    },
    [recordRuntimeEvent],
  );

  const findOwningChapterId = useCallback((nodeId: string | null): string | null => {
    if (!nodeId) return null;
    const nodeMap = new Map(nodesRef.current.map((n) => [n.id, n]));
    let curr = nodeMap.get(nodeId);
    let topGroupId: string | null = curr?.kind === 'group' ? curr.id : null;
    const seen = new Set<string>();
    while (curr?.parentId && !seen.has(curr.parentId)) {
      seen.add(curr.parentId);
      const parent = nodeMap.get(curr.parentId);
      if (!parent) break;
      if (parent.kind === 'group') topGroupId = parent.id;
      curr = parent;
    }
    return topGroupId;
  }, []);

  const resolveTargetsExpandingGroups = useCallback(
    (
      targets: BoardNode[],
      statsSnapshot: PlayStats,
      varsSnapshot: ScopedStateVariable[],
      runtimeCtx: PlayRuntimeContext,
    ) => {
      const leafEntries: BoardNode[] = [];
      const unlockedGroups: string[] = [];
      const pendingGroups: string[] = [];
      const visitedGroups = new Set<string>();

      const visit = (node: BoardNode) => {
        if (node.kind !== 'group') {
          if (!leafEntries.some((l) => l.id === node.id)) {
            leafEntries.push(node);
          }
          return;
        }
        if (visitedGroups.has(node.id)) return;
        visitedGroups.add(node.id);
        const avail = evaluateGroupAvailability(
          node,
          nodesRef.current,
          statsSnapshot,
          customFlagsRef.current,
          varsSnapshot,
          runtimeCtx,
        );
        if (!avail.passed) {
          if (!pendingGroups.includes(node.id)) pendingGroups.push(node.id);
          return;
        }
        if (!unlockedGroups.includes(node.id)) unlockedGroups.push(node.id);
        const localRoots = getGroupLocalRoots(node.id, nodesRef.current, edgesRef.current);
        for (const root of localRoots) {
          visit(root);
        }
      };

      for (const target of targets) {
        visit(target);
      }
      return { leafEntries, unlockedGroups, pendingGroups };
    },
    [],
  );

  const focusNodeVisuals = useCallback(
    (node: BoardNode | null, isLoopStep = false) => {
      focusedNodeIdRef.current = node?.id ?? null;
      setFocusedNodeId(node?.id ?? null);

      const chapterId = findOwningChapterId(node?.id ?? null);
      if (chapterId) {
        focusedGroupIdRef.current = chapterId;
        setFocusedGroupId(chapterId);
      }

      if (!node) {
        simRef.current.hazard = null;
        challengeTimerRemainingRef.current = null;
        lastTimerShownRef.current = null;
        setChallengeTimeLeft(null);
        return;
      }

      if (node.kind !== 'challenge') {
        challengeTimerRemainingRef.current = null;
        lastTimerShownRef.current = null;
        setChallengeTimeLeft(null);
      }

      if (node.kind === 'narration' || node.kind === 'dialogue') {
        simRef.current.hazard = null;
        setEndSummary(null);
        setPhase('overlay');
        return;
      }

      if (node.kind === 'challenge') {
        if (isLoopStep) {
          setWaveNumber((w) => w + 1);
        }
        const limitSec = resolveChallengeTimeLimitSec(node, edgesRef.current);
        challengeTimerRemainingRef.current = limitSec;
        lastTimerShownRef.current = limitSec;
        setChallengeTimeLeft(limitSec);
        setEndSummary(null);
        setPhase('live');
        spawnChallengeHazard(node);
        return;
      }

      if (node.kind === 'action') {
        simRef.current.hazard = null;
        pendingActionIdsRef.current.add(node.id);
        if (heroAssetIdRef.current) {
          recordRuntimeEvent('appears', {
            subjectAssetId: heroAssetIdRef.current,
            subjectRole: 'hero',
          });
        }
        setEndSummary(null);
        setPhase('live');
      }
    },
    [findOwningChapterId, recordRuntimeEvent, spawnChallengeHazard],
  );

  const applyPendingAndGroupTransitions = useCallback(
    (
      statsSnapshot: PlayStats,
      varsSnapshot: ScopedStateVariable[],
      runtimeCtx: PlayRuntimeContext,
    ): { newlyActivatedNodes: BoardNode[]; newFocusedGroupId: string | null } => {
      const newlyActivatedNodes: BoardNode[] = [];
      let newFocusedGroupId: string | null = null;
      const playableAll = getPlayableNodes(nodesRef.current);
      const playableAllMap = new Map(playableAll.map((n) => [n.id, n]));

      // 1. Unlock any pending Groups whose Available When now passes
      const stillPending: string[] = [];
      for (const pId of pendingGroupIdsRef.current) {
        const grp = playableAllMap.get(pId);
        if (!grp || grp.kind !== 'group') continue;
        const avail = evaluateGroupAvailability(
          grp,
          nodesRef.current,
          statsSnapshot,
          customFlagsRef.current,
          varsSnapshot,
          runtimeCtx,
        );
        if (!avail.passed) {
          stillPending.push(pId);
          continue;
        }
        const resolved = resolveTargetsExpandingGroups(
          [grp],
          statsSnapshot,
          varsSnapshot,
          runtimeCtx,
        );
        for (const uId of resolved.unlockedGroups) {
          if (!unlockedGroupIdsRef.current.includes(uId)) {
            unlockedGroupIdsRef.current = [...unlockedGroupIdsRef.current, uId];
          }
        }
        for (const npId of resolved.pendingGroups) {
          if (!stillPending.includes(npId)) stillPending.push(npId);
        }
        for (const leaf of resolved.leafEntries) {
          if (!activeNodeIdsRef.current.includes(leaf.id)) {
            activeNodeIdsRef.current = [...activeNodeIdsRef.current, leaf.id];
            newlyActivatedNodes.push(leaf);
          }
        }
        if (!newFocusedGroupId) newFocusedGroupId = grp.id;
      }
      pendingGroupIdsRef.current = stillPending;
      setPendingGroupIds(stillPending);

      // 2. Evaluate Group-to-Group outgoing progression (Completed When / Next Chapter)
      const unlockedSnapshot = [...unlockedGroupIdsRef.current];
      for (const uId of unlockedSnapshot) {
        if (completedGroupIdsRef.current.includes(uId)) continue;
        const grpNode = playableAllMap.get(uId);
        if (!grpNode || grpNode.kind !== 'group') continue;

        const grpOutgoing = getEvaluatedOutgoing(
          [uId],
          nodesRef.current,
          edgesRef.current,
          statsSnapshot,
          customFlagsRef.current,
          loopEdgeIdsRef.current,
          varsSnapshot,
          runtimeCtx,
        );
        if (grpOutgoing.length === 0) continue;

        const descendantIds = getDescendantNodeIds(uId, nodesRef.current);
        const playableLeafDescendants = descendantIds.filter((dId) => {
          const dn = playableAllMap.get(dId);
          return Boolean(dn && dn.kind !== 'group');
        });
        const allDescendantsDone =
          playableLeafDescendants.length > 0 &&
          playableLeafDescendants.every((dId) => completedNodeIdsRef.current.includes(dId));

        const triggeredEdge = grpOutgoing.find((item) => {
          if (!item.evaluation.passed) return false;
          if (item.evaluation.hasCondition) return true;
          return allDescendantsDone;
        });
        if (!triggeredEdge) continue;

        // Mark source Group as having completed its core progression (keep unlocked for side exploration!)
        completedGroupIdsRef.current = [...completedGroupIdsRef.current, uId];
        setCompletedGroupIds(completedGroupIdsRef.current);
        setLastEdgeId(triggeredEdge.edge.id);

        const targetResolved = resolveTargetsExpandingGroups(
          [triggeredEdge.target],
          statsSnapshot,
          varsSnapshot,
          runtimeCtx,
        );
        for (const nextUId of targetResolved.unlockedGroups) {
          if (!unlockedGroupIdsRef.current.includes(nextUId)) {
            unlockedGroupIdsRef.current = [...unlockedGroupIdsRef.current, nextUId];
          }
        }
        for (const nextPId of targetResolved.pendingGroups) {
          if (!pendingGroupIdsRef.current.includes(nextPId)) {
            pendingGroupIdsRef.current = [...pendingGroupIdsRef.current, nextPId];
          }
        }
        setPendingGroupIds([...pendingGroupIdsRef.current]);
        for (const leaf of targetResolved.leafEntries) {
          if (!activeNodeIdsRef.current.includes(leaf.id)) {
            activeNodeIdsRef.current = [...activeNodeIdsRef.current, leaf.id];
            newlyActivatedNodes.push(leaf);
          }
        }
        if (triggeredEdge.target.kind === 'group') {
          newFocusedGroupId = triggeredEdge.target.id;
        }
        const srcLabel = grpNode.title.trim() || grpNode.note.trim() || t.chapterCompleted;
        const dstLabel =
          triggeredEdge.target.title.trim() || triggeredEdge.target.note.trim();
        setHudToast({
          text: dstLabel ? `${srcLabel} → ${dstLabel}` : `${srcLabel} · ${t.chapterCompleted}`,
          tone: 'celebrate',
        });
      }

      setUnlockedGroupIds([...unlockedGroupIdsRef.current]);
      setActiveNodeIds([...activeNodeIdsRef.current]);
      return { newlyActivatedNodes, newFocusedGroupId };
    },
    [resolveTargetsExpandingGroups, t.chapterCompleted],
  );

  const getArmedStandaloneTriggerEdges = useCallback(() => {
    const playableAll = getPlayableNodes(nodesRef.current);
    const playableAllMap = new Map(playableAll.map((n) => [n.id, n]));
    const unlockedSet = new Set(unlockedGroupIdsRef.current);
    const activeSet = new Set(activeNodeIdsRef.current);

    return edgesRef.current
      .filter((edge) => {
        if (edge.fromId !== null) return false;
        if (firedTriggerEdgeIdsRef.current.has(edge.id)) return false;
        const target = playableAllMap.get(edge.toId);
        if (!target) return false;
        if (activeSet.has(target.id)) return false;
        if (target.kind === 'group' && unlockedSet.has(target.id)) return false;

        // If inside a Group, arm only once owning Group(s) are unlocked
        let currParentId = target.parentId;
        const seen = new Set<string>();
        while (currParentId && !seen.has(currParentId)) {
          seen.add(currParentId);
          const parent = playableAllMap.get(currParentId);
          if (!parent) break;
          if (parent.kind === 'group' && !unlockedSet.has(parent.id)) {
            return false;
          }
          currParentId = parent.parentId;
        }
        return true;
      })
      .map((edge) => ({ edge, target: playableAllMap.get(edge.toId)! }));
  }, []);

  const enterNodes = useCallback(
    (
      targets: BoardNode[],
      triggeredEdgeId: string | null,
      isLoopStep = false,
      options?: { replaceIds?: string[]; keepActive?: boolean },
    ) => {
      if (resolveTimerRef.current !== null) {
        window.clearTimeout(resolveTimerRef.current);
        resolveTimerRef.current = null;
      }
      if (targets.length === 0) return;

      runtimeEventsRef.current.clear();
      runtimeEventRecordsRef.current = [];
      prevSpatialRef.current.wasTouching = false;
      reactiveTransitionLockRef.current = false;

      const replaceSet = new Set(options?.replaceIds ?? []);
      const runtimeCtx = buildRuntimeCtx();

      // Expand any Group targets into their unlocked concurrent local roots
      const hasGroupTarget = targets.some((tNode) => tNode.kind === 'group');
      let effectiveTargets = targets;
      if (hasGroupTarget) {
        const expanded = resolveTargetsExpandingGroups(
          targets,
          statsRef.current,
          scopedVariablesRef.current,
          runtimeCtx,
        );
        for (const uId of expanded.unlockedGroups) {
          if (!unlockedGroupIdsRef.current.includes(uId)) {
            unlockedGroupIdsRef.current = [...unlockedGroupIdsRef.current, uId];
          }
        }
        setUnlockedGroupIds([...unlockedGroupIdsRef.current]);
        for (const pId of expanded.pendingGroups) {
          if (!pendingGroupIdsRef.current.includes(pId)) {
            pendingGroupIdsRef.current = [...pendingGroupIdsRef.current, pId];
          }
        }
        setPendingGroupIds([...pendingGroupIdsRef.current]);
        if (expanded.unlockedGroups.length > 0) {
          const topG = expanded.unlockedGroups[0];
          focusedGroupIdRef.current = topG;
          setFocusedGroupId(topG);
        }
        effectiveTargets = expanded.leafEntries;
      }

      // If only locked pending Groups were reached, enter waiting state cleanly
      if (effectiveTargets.length === 0) {
        const remaining = activeNodeIdsRef.current.filter((id) => !replaceSet.has(id));
        activeNodeIdsRef.current = remaining;
        setActiveNodeIds(remaining);
        setLastEdgeId(triggeredEdgeId);
        if (remaining.length > 0) {
          const nextNode =
            nodesRef.current.find((n) => n.id === remaining[0]) ?? null;
          focusNodeVisuals(nextNode, isLoopStep);
        } else {
          focusNodeVisuals(null);
          setEndSummary(null);
          setPhase('live');
        }
        setSimRevision((r) => r + 1);
        return;
      }

      const first = effectiveTargets[0];

      // Mark replaced nodes as completed (unless looping back to same node)
      const nextIdsSet = new Set(effectiveTargets.map((n) => n.id));
      for (const rId of replaceSet) {
        pendingActionIdsRef.current.delete(rId);
        if (!nextIdsSet.has(rId) && !completedNodeIdsRef.current.includes(rId)) {
          completedNodeIdsRef.current = [...completedNodeIdsRef.current, rId];
        }
      }
      setCompletedNodeIds([...completedNodeIdsRef.current]);

      // Merge activeNodeIds: keep concurrent sibling mechanisms while replacing stepped slot
      const baseActive =
        replaceSet.size > 0
          ? activeNodeIdsRef.current.filter((id) => !replaceSet.has(id))
          : options?.keepActive || hasGroupTarget || unlockedGroupIdsRef.current.length > 0
            ? [...activeNodeIdsRef.current]
            : [];

      const mergedActive = [...baseActive];
      for (const tNode of effectiveTargets) {
        if (tNode.kind !== 'outcome' && !mergedActive.includes(tNode.id)) {
          mergedActive.push(tNode.id);
        } else if (tNode.kind === 'outcome' && !mergedActive.includes(tNode.id)) {
          mergedActive.push(tNode.id);
        }
      }

      activeNodeIdsRef.current = mergedActive;
      setActiveNodeIds(mergedActive);
      setLastEdgeId(triggeredEdgeId);

      if (first.kind !== 'outcome') {
        focusNodeVisuals(first, isLoopStep);
        setSimRevision((r) => r + 1);
        return;
      }

      // Outcome Resolution
      let totalHpDelta = 0;
      let totalScoreDelta = 0;
      let primaryTone: 'celebrate' | 'hurt' | 'victory' | 'defeat' | 'neutral' =
        'neutral';

      for (const o of effectiveTargets) {
        const cfg = resolveOutcomeConfig(o);
        totalHpDelta += cfg.hpDelta;
        totalScoreDelta += cfg.scoreDelta;
        if (cfg.visual === 'victory') primaryTone = 'victory';
        else if (cfg.visual === 'defeat' && primaryTone !== 'victory')
          primaryTone = 'defeat';
        else if (cfg.visual === 'hurt' && primaryTone === 'neutral')
          primaryTone = 'hurt';
        else if (cfg.visual === 'celebrate' && primaryTone === 'neutral')
          primaryTone = 'celebrate';
      }

      const nextStats: PlayStats = {
        hp: Math.max(0, statsRef.current.hp + totalHpDelta),
        score: Math.max(0, statsRef.current.score + totalScoreDelta),
      };
      statsRef.current = nextStats;
      setStats(nextStats);

      // Execute structured Outcome Related Properties rules (4 types x 4 operations)
      let nextScopedVars = [...scopedVariablesRef.current];
      const numericParams = collectNumericBoardParameters(nodesRef.current);
      const appliedRuleVarIds = new Set<string>();
      const simForPopups = simRef.current;

      for (const o of effectiveTargets) {
        for (const rule of o.fields.relatedProperties ?? []) {
          const idx = nextScopedVars.findIndex((v) => v.variable.id === rule.variableId);
          if (idx === -1) continue;
          const entry = nextScopedVars[idx];
          const nextVal = applyOutcomePropertyRule(
            rule,
            entry,
            nextScopedVars,
            numericParams,
          );
          onUpdatePlayValue(entry.variable.id, nextVal);
          nextScopedVars[idx] = { ...entry, playValue: nextVal };
          appliedRuleVarIds.add(entry.variable.id);
          pushPopup(
            simForPopups.heroX,
            simForPopups.heroY - 52,
            `${entry.variable.name}: ${formatVariableValue(entry.variable, nextVal, lang)}`,
            '#38BDF8',
          );
        }
      }

      // Mirror legacy HP/Score outcome deltas into matching numeric variables
      if (totalHpDelta !== 0 || totalScoreDelta !== 0) {
        nextScopedVars = nextScopedVars.map((entry) => {
          if (entry.variable.type !== 'number' || appliedRuleVarIds.has(entry.variable.id)) {
            return entry;
          }
          const n = entry.variable.name;
          if (totalHpDelta !== 0 && /血量|血|生命|体力|\bhp\b|health|life/i.test(n)) {
            const updated = clampNumberValue(
              Number(entry.playValue) + totalHpDelta,
              entry.variable,
            );
            onUpdatePlayValue(entry.variable.id, updated);
            return { ...entry, playValue: updated };
          }
          if (
            totalScoreDelta !== 0 &&
            /分数|得分|积分|星星|金币|\bscore\b|point|\bpts\b|star|coin/i.test(n)
          ) {
            const updated = clampNumberValue(
              Number(entry.playValue) + totalScoreDelta,
              entry.variable,
            );
            onUpdatePlayValue(entry.variable.id, updated);
            return { ...entry, playValue: updated };
          }
          return entry;
        });
      }
      scopedVariablesRef.current = nextScopedVars;

      const sim = simRef.current;
      if (totalScoreDelta !== 0) {
        pushPopup(
          sim.heroX,
          sim.heroY - 46,
          `${totalScoreDelta > 0 ? '+' : ''}${totalScoreDelta} ${t.scoreLabel}`,
          totalScoreDelta > 0 ? '#FBC53D' : '#FB7185',
        );
      }
      if (totalHpDelta !== 0) {
        pushPopup(
          sim.heroX + 8,
          sim.heroY - 30,
          `${totalHpDelta > 0 ? '+' : ''}${totalHpDelta} ${t.hpLabel}`,
          totalHpDelta > 0 ? '#34D399' : '#FB7185',
        );
      }

      if (primaryTone === 'celebrate' || primaryTone === 'victory') {
        sim.lanternFlare = 1.4;
        spawnParticles(sim.heroX, sim.heroY - 22, '#FBC53D', 18);
        spawnParticles(120, 48, '#FDE68A', 10);
        spawnParticles(245, 48, '#FDE68A', 10);
      }
      if (primaryTone === 'victory') {
        sim.victoryGlow = 1;
        spawnParticles(WORLD_W / 2, 90, '#38BDF8', 22);
      }
      if (primaryTone === 'hurt' || primaryTone === 'defeat') {
        sim.hurtTimer = 0.55;
        sim.heroVx = -110;
        spawnParticles(sim.heroX + 12, sim.heroY - 18, '#FB7185', 14);
      }

      const toastText = effectiveTargets.map((o) => o.note).filter(Boolean).join(' · ');
      if (toastText) setHudToast({ text: toastText, tone: primaryTone });

      // Mark outcome targets completed
      for (const o of effectiveTargets) {
        if (!completedNodeIdsRef.current.includes(o.id)) {
          completedNodeIdsRef.current = [...completedNodeIdsRef.current, o.id];
        }
      }
      setCompletedNodeIds([...completedNodeIdsRef.current]);

      const updatedRuntimeCtx = buildRuntimeCtx();
      const nextOutgoing = getEvaluatedOutgoing(
        effectiveTargets.map((n) => n.id),
        nodesRef.current,
        edgesRef.current,
        nextStats,
        customFlagsRef.current,
        loopEdgeIdsRef.current,
        nextScopedVars,
        updatedRuntimeCtx,
      );
      const passing = nextOutgoing.filter((e) => e.evaluation.passed);

      if (passing.length > 0) {
        setPhase('resolving');
        const nextEdge = passing[0];
        const outcomeIds = effectiveTargets.map((n) => n.id);
        resolveTimerRef.current = window.setTimeout(() => {
          resolveTimerRef.current = null;
          enterNodes([nextEdge.target], nextEdge.edge.id, nextEdge.isLoop, {
            replaceIds: outcomeIds,
          });
        }, 950);
        return;
      }

      // No internal outgoing arrow from this Outcome — remove this finished chain from active pool
      const outcomeIdSet = new Set(effectiveTargets.map((o) => o.id));
      const remainingAfterOutcome = activeNodeIdsRef.current.filter(
        (id) => !outcomeIdSet.has(id),
      );
      activeNodeIdsRef.current = remainingAfterOutcome;
      setActiveNodeIds(remainingAfterOutcome);

      // Re-check pending Group Available When and Group-to-Group outgoing progression
      const prog = applyPendingAndGroupTransitions(
        nextStats,
        nextScopedVars,
        updatedRuntimeCtx,
      );

      const finalActiveIds = activeNodeIdsRef.current;
      if (finalActiveIds.length > 0) {
        const playableAllMap = new Map(
          getPlayableNodes(nodesRef.current).map((n) => [n.id, n]),
        );
        const preferredNode =
          prog.newlyActivatedNodes[0] ??
          finalActiveIds
            .map((id) => playableAllMap.get(id))
            .find(
              (n) =>
                n &&
                focusedGroupIdRef.current &&
                (n.parentId === focusedGroupIdRef.current ||
                  isDescendantOf(n.id, focusedGroupIdRef.current, playableAllMap)),
            ) ??
          playableAllMap.get(finalActiveIds[0]) ??
          null;

        if (prog.newFocusedGroupId) {
          focusedGroupIdRef.current = prog.newFocusedGroupId;
          setFocusedGroupId(prog.newFocusedGroupId);
        }

        setPhase('resolving');
        resolveTimerRef.current = window.setTimeout(() => {
          resolveTimerRef.current = null;
          focusNodeVisuals(preferredNode, false);
          setSimRevision((r) => r + 1);
        }, 720);
        return;
      }

      if (pendingGroupIdsRef.current.length > 0 || getArmedStandaloneTriggerEdges().length > 0) {
        sim.hazard = null;
        focusNodeVisuals(null);
        setEndSummary(null);
        setPhase('live');
        setSimRevision((r) => r + 1);
        return;
      }

      sim.hazard = null;
      setPhase('ended');
      setEndSummary({
        text: toastText,
        tone:
          primaryTone === 'victory'
            ? 'victory'
            : primaryTone === 'defeat'
              ? 'defeat'
              : 'neutral',
      });
    },
    [
      applyPendingAndGroupTransitions,
      buildRuntimeCtx,
      focusNodeVisuals,
      getArmedStandaloneTriggerEdges,
      lang,
      onUpdatePlayValue,
      pushPopup,
      resolveTargetsExpandingGroups,
      spawnParticles,
      t.hpLabel,
      t.scoreLabel,
    ],
  );

  const checkReactiveTransitions = useCallback((): boolean => {
    if (
      playModeRef.current !== 'playing' ||
      phaseRef.current !== 'live' ||
      reactiveTransitionLockRef.current
    ) {
      return false;
    }

    const runtimeCtx = buildRuntimeCtx();

    // First check pending Available When groups and Group-to-Group progression
    const prog = applyPendingAndGroupTransitions(
      statsRef.current,
      scopedVariablesRef.current,
      runtimeCtx,
    );
    if (prog.newlyActivatedNodes.length > 0 || prog.newFocusedGroupId) {
      reactiveTransitionLockRef.current = true;
      if (prog.newFocusedGroupId) {
        focusedGroupIdRef.current = prog.newFocusedGroupId;
        setFocusedGroupId(prog.newFocusedGroupId);
      }
      if (prog.newlyActivatedNodes.length > 0) {
        focusNodeVisuals(prog.newlyActivatedNodes[0], false);
      }
      reactiveTransitionLockRef.current = false;
      setSimRevision((r) => r + 1);
      return true;
    }

    const currentIds = activeNodeIdsRef.current;
    const candidateIds = Array.from(
      new Set([...currentIds, ...pendingActionIdsRef.current]),
    );

    if (candidateIds.length > 0) {
      const evals = getEvaluatedOutgoing(
        candidateIds,
        nodesRef.current,
        edgesRef.current,
        statsRef.current,
        customFlagsRef.current,
        loopEdgeIdsRef.current,
        scopedVariablesRef.current,
        runtimeCtx,
      );
      const directTriggered = evals.find((item) => {
        if (item.target.kind === 'action') return false;
        if (!item.evaluation.passed) return false;
        if (item.evaluation.hasCondition) return true;
        return (
          Boolean(item.edge.fromId) &&
          pendingActionIdsRef.current.has(item.edge.fromId!) &&
          !simRef.current.hazard
        );
      });
      if (directTriggered && directTriggered.edge.fromId) {
        reactiveTransitionLockRef.current = true;
        const ownerChallengeId = actionOwnerMapRef.current.get(directTriggered.edge.fromId);
        const replaceIds = [
          directTriggered.edge.fromId,
          ...(ownerChallengeId ? [ownerChallengeId] : []),
        ];
        enterNodes([directTriggered.target], directTriggered.edge.id, directTriggered.isLoop, {
          replaceIds,
        });
        return true;
      }
    }

    // Evaluate armed standalone ("from air") trigger arrows pointing to cards or Groups
    const armedEntries = getArmedStandaloneTriggerEdges();
    for (const { edge, target } of armedEntries) {
      const ev = evaluateEdgeCondition(
        edge.condition,
        statsRef.current,
        customFlagsRef.current,
        scopedVariablesRef.current,
        edge.conditionGroup,
        runtimeCtx,
      );
      if (ev.passed) {
        firedTriggerEdgeIdsRef.current.add(edge.id);
        reactiveTransitionLockRef.current = true;
        enterNodes([target], edge.id, false, { keepActive: true });
        return true;
      }
    }

    return false;
  }, [
    applyPendingAndGroupTransitions,
    buildRuntimeCtx,
    enterNodes,
    focusNodeVisuals,
    getArmedStandaloneTriggerEdges,
  ]);

  useEffect(() => {
    if (playMode === 'playing' && phase === 'live') {
      checkReactiveTransitions();
    }
  }, [checkReactiveTransitions, customFlags, phase, playMode, scopedVariables, simulatedEvents, stats]);

  const hasUnconditionalOutgoing = useCallback((nodeId: string) => {
    return edgesRef.current.some(
      (e) =>
        e.fromId === nodeId &&
        !e.condition?.trim() &&
        !(e.conditionGroup && e.conditionGroup.clauses.length > 0),
    );
  }, []);

  const resolveActionOutcome = useCallback(
    (control: LiveActionControl): boolean => {
      const actionNode = control.target;
      const evaluated = getEvaluatedOutgoing(
        [actionNode.id],
        nodesRef.current,
        edgesRef.current,
        statsRef.current,
        customFlagsRef.current,
        loopEdgeIdsRef.current,
        scopedVariablesRef.current,
        buildRuntimeCtx(),
      );
      const fromAction = evaluated.filter((e) => e.evaluation.passed);
      const replaceIds = [
        actionNode.id,
        ...(control.ownerNodeId ? [control.ownerNodeId] : []),
      ];

      if (fromAction.length > 0) {
        const allOutcomes = fromAction.every((e) => e.target.kind === 'outcome');
        if (allOutcomes) {
          const uniqueTargets = Array.from(
            new Map(fromAction.map((e) => [e.target.id, e.target])).values(),
          );
          enterNodes(uniqueTargets, fromAction[0].edge.id, false, { replaceIds });
          return true;
        }
        enterNodes([fromAction[0].target], fromAction[0].edge.id, fromAction[0].isLoop, {
          replaceIds,
        });
        return true;
      }

      if (evaluated.length > 0) {
        return false;
      }

      setFocusedNodeId(actionNode.id);
      focusedNodeIdRef.current = actionNode.id;
      setLastEdgeId(control.edgeId);
      setPhase('resolving');
      resolveTimerRef.current = window.setTimeout(() => {
        const parentChallenge = control.fromNodeId
          ? nodesRef.current.find((n) => n.id === control.fromNodeId)
          : null;
        if (parentChallenge && parentChallenge.kind === 'challenge') {
          enterNodes([parentChallenge], null, true, { replaceIds: [actionNode.id] });
        } else {
          enterNodes([actionNode], null, false, { replaceIds: [actionNode.id] });
        }
      }, 650);
      return true;
    },
    [buildRuntimeCtx, enterNodes],
  );

  const performLiveAction = useCallback(
    (control: LiveActionControl) => {
      if (playModeRef.current !== 'playing') return;
      if (phaseRef.current !== 'live' || !control.evaluation.passed) return;
      onUserTestedInPlay();

      // If player clicked or hotkeyed a parallel mechanism that wasn't focused yet, switch focus cleanly
      if (control.ownerNodeId && control.ownerNodeId !== focusedNodeIdRef.current) {
        const ownerNode = nodesRef.current.find((n) => n.id === control.ownerNodeId) ?? null;
        if (ownerNode && (ownerNode.kind === 'challenge' || ownerNode.kind === 'action')) {
          focusNodeVisuals(ownerNode);
        }
      }
      if (control.ownerNodeId) {
        actionOwnerMapRef.current.set(control.target.id, control.ownerNodeId);
      }

      const sim = simRef.current;
      sim.lastActionControlId = control.id;
      sim.lastActionMechanic = control.mechanic;
      pendingActionIdsRef.current.add(control.target.id);
      setLastEdgeId(control.edgeId);

      let recorded = false;
      if (control.mechanic === 'jump') {
        if (sim.onGround) {
          const jumpParam = (control.target.fields.relatedParameters ?? []).find((p) =>
            /jump|height|跳|高/i.test(p.name),
          );
          const jumpScale =
            jumpParam && Number.isFinite(jumpParam.value) && jumpParam.value > 0
              ? Math.max(0.65, Math.min(1.5, jumpParam.value / 120))
              : 1;
          sim.heroVy = -335 * jumpScale;
          sim.onGround = false;
          spawnParticles(sim.heroX, GROUND_Y, '#CBD5E1', 7);
          if (
            recordRuntimeEvent('jumps', {
              subjectAssetId: heroAssetIdRef.current,
              subjectRole: 'hero',
            })
          ) {
            recorded = true;
          }
        }
      } else if (control.mechanic === 'shield') {
        sim.shieldTimer = 0.72;
        spawnParticles(sim.heroX + 10, sim.heroY - 20, '#38BDF8', 8);
      } else if (control.mechanic === 'dodge') {
        sim.dodgeTimer = 0.52;
        sim.heroVx = sim.heroX < 120 ? 190 : -190;
        spawnParticles(sim.heroX, sim.heroY - 10, '#A5B4FC', 8);
      } else {
        sim.waves.push({
          x: sim.heroX + 20,
          y: sim.heroY - 22,
          vx: 270,
          actionControlId: control.id,
        });
        spawnParticles(sim.heroX + 18, sim.heroY - 22, '#38BDF8', 10);
        if (
          recordRuntimeEvent('fires', {
            subjectAssetId: heroAssetIdRef.current,
            subjectRole: 'hero',
            targetAssetId: hazardAssetIdRef.current,
            targetRole: 'hazard',
          })
        ) {
          recorded = true;
        }
      }

      if (recorded) {
        setSimRevision((r) => r + 1);
      }

      if (checkReactiveTransitions()) return;

      if (!sim.hazard && hasUnconditionalOutgoing(control.target.id)) {
        resolveActionOutcome(control);
      }
    },
    [
      checkReactiveTransitions,
      focusNodeVisuals,
      hasUnconditionalOutgoing,
      onUserTestedInPlay,
      recordRuntimeEvent,
      resolveActionOutcome,
      spawnParticles,
    ],
  );

  const resetSimulationState = useCallback(() => {
    if (resolveTimerRef.current !== null) {
      window.clearTimeout(resolveTimerRef.current);
      resolveTimerRef.current = null;
    }
    runtimeEventsRef.current.clear();
    runtimeEventRecordsRef.current = [];
    pendingActionIdsRef.current.clear();
    firedTriggerEdgeIdsRef.current.clear();
    actionOwnerMapRef.current.clear();
    activeNodeIdsRef.current = [];
    focusedNodeIdRef.current = null;
    focusedGroupIdRef.current = null;
    unlockedGroupIdsRef.current = [];
    completedGroupIdsRef.current = [];
    pendingGroupIdsRef.current = [];
    completedNodeIdsRef.current = [];
    setFocusedNodeId(null);
    setFocusedGroupId(null);
    setUnlockedGroupIds([]);
    setCompletedGroupIds([]);
    setPendingGroupIds([]);
    setCompletedNodeIds([]);
    challengeTimerRemainingRef.current = null;
    lastTimerShownRef.current = null;
    setChallengeTimeLeft(null);
    prevSpatialRef.current = {
      wasAirborne: false,
      wasTouching: false,
      wasBlocking: false,
      wasDashing: false,
    };
    reactiveTransitionLockRef.current = false;
    const sim = simRef.current;
    sim.heroX = HERO_BASE_X;
    sim.heroY = GROUND_Y;
    sim.heroVx = 0;
    sim.heroVy = 0;
    sim.onGround = true;
    sim.shieldTimer = 0;
    sim.dodgeTimer = 0;
    sim.hurtTimer = 0;
    sim.lanternFlare = 0;
    sim.victoryGlow = 0;
    sim.hazard = null;
    sim.waves = [];
    sim.particles = [];
    sim.popups = [];
    setHudToast(null);
    setEndSummary(null);
  }, []);

  const handleStartPlay = useCallback(() => {
    if (playableNodes.length === 0) return;
    onUserTestedInPlay();
    resetSimulationState();

    const freshStats = { ...INITIAL_PLAY_STATS };
    statsRef.current = freshStats;
    setStats(freshStats);
    setWaveNumber(1);
    setPlayMode('playing');

    const topLevelGroups = playableNodes.filter(
      (n) => n.kind === 'group' && (!n.parentId || !playableMap.has(n.parentId)),
    );
    const rootGroupsWithNoIncoming = topLevelGroups.filter(
      (grp) =>
        !edges.some(
          (e) =>
            e.toId === grp.id &&
            e.fromId !== grp.id &&
            (e.fromId === null || playableMap.has(e.fromId)),
        ),
    );

    if (rootGroupsWithNoIncoming.length > 0) {
      const sortedRoots = [...rootGroupsWithNoIncoming].sort((a, b) =>
        Math.abs(a.y - b.y) > 40 ? a.y - b.y : a.x - b.x,
      );
      enterNodes(sortedRoots, null, false);
      checkReactiveTransitions();
      return;
    }

    const startNode =
      (startNodeId ? playableMap.get(startNodeId) : null) ??
      (edges.some((e) => e.fromId === null) ? null : playableNodes[0]);
    if (startNode) {
      enterNodes([startNode], null, false);
      checkReactiveTransitions();
    } else {
      // All playable nodes/groups are guarded by standalone trigger arrows -> start listening cleanly
      phaseRef.current = 'live';
      setPhase('live');
      checkReactiveTransitions();
    }
  }, [
    checkReactiveTransitions,
    edges,
    enterNodes,
    onUserTestedInPlay,
    playableMap,
    playableNodes,
    resetSimulationState,
    startNodeId,
  ]);

  const handleStopPlay = useCallback(() => {
    resetSimulationState();
    setPlayMode('preview');
    setActiveNodeIds([]);
    setLastEdgeId(null);
  }, [resetSimulationState]);

  const handleFocusActiveNode = useCallback(
    (nodeId: string) => {
      if (playModeRef.current !== 'playing') return;
      const target = playableMap.get(nodeId);
      if (!target || target.kind === 'group') return;
      onUserTestedInPlay();
      if (resolveTimerRef.current !== null) {
        window.clearTimeout(resolveTimerRef.current);
        resolveTimerRef.current = null;
      }
      focusNodeVisuals(target);
      setSimRevision((r) => r + 1);
    },
    [focusNodeVisuals, onUserTestedInPlay, playableMap],
  );

  const handleFocusChapter = useCallback(
    (groupId: string) => {
      if (playModeRef.current !== 'playing') return;
      onUserTestedInPlay();
      if (resolveTimerRef.current !== null) {
        window.clearTimeout(resolveTimerRef.current);
        resolveTimerRef.current = null;
      }
      focusedGroupIdRef.current = groupId;
      setFocusedGroupId(groupId);
      const matchingActive = activeNodes.find(
        (n) => n.parentId === groupId || isDescendantOf(n.id, groupId, nodeMap),
      );
      if (matchingActive) {
        focusNodeVisuals(matchingActive);
      } else {
        focusNodeVisuals(null);
        setPhase('live');
      }
      setSimRevision((r) => r + 1);
    },
    [activeNodes, focusNodeVisuals, nodeMap, onUserTestedInPlay],
  );

  const handleAdvanceOverlay = useCallback(() => {
    if (playModeRef.current !== 'playing' || phaseRef.current !== 'overlay') return;
    onUserTestedInPlay();
    const targetOverlay = primaryNode;
    if (!targetOverlay) return;

    const evalOut = getEvaluatedOutgoing(
      [targetOverlay.id],
      nodesRef.current,
      edgesRef.current,
      statsRef.current,
      customFlagsRef.current,
      loopEdgeIdsRef.current,
      scopedVariablesRef.current,
      buildRuntimeCtx(),
    );
    const passing = evalOut.filter((e) => e.evaluation.passed);
    if (passing.length > 0) {
      enterNodes([passing[0].target], passing[0].edge.id, passing[0].isLoop, {
        replaceIds: [targetOverlay.id],
      });
      return;
    }

    if (edgesRef.current.length === 0 && unlockedGroupIdsRef.current.length === 0) {
      const idx = playableNodes.findIndex((n) => n.id === targetOverlay.id);
      const next = playableNodes[idx + 1];
      if (next) {
        enterNodes([next], null, false, { replaceIds: [targetOverlay.id] });
        return;
      }
    }

    // Remove finished narration/dialogue from active pool and keep sibling mechanisms alive
    if (!completedNodeIdsRef.current.includes(targetOverlay.id)) {
      completedNodeIdsRef.current = [...completedNodeIdsRef.current, targetOverlay.id];
      setCompletedNodeIds([...completedNodeIdsRef.current]);
    }
    const remaining = activeNodeIdsRef.current.filter((id) => id !== targetOverlay.id);
    activeNodeIdsRef.current = remaining;
    setActiveNodeIds(remaining);

    const prog = applyPendingAndGroupTransitions(
      statsRef.current,
      scopedVariablesRef.current,
      buildRuntimeCtx(),
    );

    if (activeNodeIdsRef.current.length > 0) {
      const nextNode =
        prog.newlyActivatedNodes[0] ??
        playableMap.get(activeNodeIdsRef.current[0]) ??
        null;
      focusNodeVisuals(nextNode);
      setSimRevision((r) => r + 1);
      return;
    }

    if (pendingGroupIdsRef.current.length > 0 || getArmedStandaloneTriggerEdges().length > 0) {
      focusNodeVisuals(null);
      setPhase('live');
      setSimRevision((r) => r + 1);
      return;
    }

    setPhase('ended');
    setEndSummary({
      text: targetOverlay.note ?? '',
      tone: 'neutral',
    });
  }, [
    applyPendingAndGroupTransitions,
    buildRuntimeCtx,
    enterNodes,
    focusNodeVisuals,
    getArmedStandaloneTriggerEdges,
    onUserTestedInPlay,
    playableMap,
    playableNodes,
    primaryNode,
  ]);

  useEffect(() => {
    if (
      playMode !== 'playing' ||
      phase !== 'live' ||
      !primaryNode ||
      primaryNode.kind !== 'challenge'
    ) {
      return;
    }
    const cfg = resolveChallengeConfig(primaryNode);
    const h = simRef.current.hazard;
    if (cfg.isSceneOnly) {
      if (h) simRef.current.hazard = null;
      return;
    }
    if (
      !h ||
      h.kind !== cfg.pattern ||
      h.direction !== cfg.direction ||
      h.speed !== cfg.speed ||
      Math.abs(h.speedMultiplier - cfg.speedMultiplier) > 0.01 ||
      h.visual !== cfg.visual ||
      h.bounces !== cfg.bounces ||
      h.rotates !== cfg.rotates
    ) {
      spawnChallengeHazard(primaryNode);
    }
  }, [phase, playMode, primaryNode, spawnChallengeHazard]);

  const activeOverlayPlayback = useMemo(() => {
    if (
      playMode !== 'playing' ||
      phase !== 'overlay' ||
      !primaryNode ||
      (primaryNode.kind !== 'narration' && primaryNode.kind !== 'dialogue')
    ) {
      return null;
    }
    return resolvePlaybackSettings(primaryNode);
  }, [phase, playMode, primaryNode]);

  const activeOverlayPlaybackRef = useRef(activeOverlayPlayback);
  activeOverlayPlaybackRef.current = activeOverlayPlayback;

  // Auto-play timer for Narration & Dialogue when Playback Settings mode === 'auto'
  useEffect(() => {
    if (!activeOverlayPlayback || activeOverlayPlayback.mode !== 'auto') return;
    const ms = Math.max(500, Math.round((activeOverlayPlayback.durationSec ?? 3) * 1000));
    const timer = window.setTimeout(() => {
      handleAdvanceOverlay();
    }, ms);
    return () => window.clearTimeout(timer);
  }, [activeOverlayPlayback, activeNodeIds, handleAdvanceOverlay]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (playModeRef.current !== 'playing') return;
      const activeTag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if (phaseRef.current === 'overlay') {
        const pb = activeOverlayPlaybackRef.current;
        if (pb?.mode === 'key') {
          if (matchesKeyEvent(pb.key || 'Space', e)) {
            e.preventDefault();
            handleAdvanceOverlay();
          }
          return;
        }
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          handleAdvanceOverlay();
        }
        return;
      }

      if (phaseRef.current !== 'live') return;
      const controls = liveActionControlsRef.current;
      if (controls.length === 0) return;

      let matched =
        controls.find(
          (c) =>
            c.ownerNodeId === focusedNodeIdRef.current &&
            c.evaluation.passed &&
            c.control.device === 'keyboard' &&
            c.control.interactionType !== 'release' &&
            matchesKeyEvent(c.keyLabel, e),
        ) ??
        controls.find(
          (c) =>
            c.evaluation.passed &&
            c.control.device === 'keyboard' &&
            c.control.interactionType !== 'release' &&
            matchesKeyEvent(c.keyLabel, e),
        );
      if (!matched && e.key >= '1' && e.key <= '4') {
        matched = controls[Number(e.key) - 1];
      }

      if (matched && matched.evaluation.passed) {
        if (e.repeat && matched.control.interactionType === 'press') return;
        e.preventDefault();
        performLiveAction(matched);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (playModeRef.current !== 'playing' || phaseRef.current !== 'live') return;
      const activeTag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
      const matched = liveActionControlsRef.current.find(
        (c) =>
          c.evaluation.passed &&
          c.control.device === 'keyboard' &&
          c.control.interactionType === 'release' &&
          matchesKeyEvent(c.keyLabel, e),
      );
      if (matched) {
        e.preventDefault();
        performLiveAction(matched);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleAdvanceOverlay, performLiveAction]);

  // 60fps 2D Canvas Renderer (Truly blank stage when empty -> dynamic live scene as cards are authored!)
  useEffect(() => {
    let rafId = 0;
    let lastTs = performance.now();

    const stepAndRender = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      const sim = simRef.current;
      sim.time += dt;
      const isPlaying = playModeRef.current === 'playing';
      const preview = previewSnapshotRef.current;
      const hasAnyPlayable = playableCountRef.current > 0;

      if (isPlaying) {
        let recordedNewEvent = false;
        const markEvt = (
          evt: string,
          opts?: Omit<RuntimeEventRecord, 'eventId'>,
        ) => {
          if (recordRuntimeEvent(evt, opts)) recordedNewEvent = true;
        };

        // Challenge countdown timer for time_up events & auto-time-limit parameter
        if (
          phaseRef.current === 'live' &&
          challengeTimerRemainingRef.current !== null &&
          challengeTimerRemainingRef.current > 0
        ) {
          const nextRem = Math.max(0, challengeTimerRemainingRef.current - dt);
          challengeTimerRemainingRef.current = nextRem;
          const rounded = Math.ceil(nextRem);
          if (lastTimerShownRef.current !== rounded) {
            lastTimerShownRef.current = rounded;
            setChallengeTimeLeft(rounded);
          }
          if (nextRem <= 0) {
            markEvt('time_up', {
              subjectRole: 'timer',
              subjectAssetId: backgroundAssetIdRef.current,
            });
          }
        }

        if (!sim.onGround) {
          prevSpatialRef.current.wasAirborne = true;
          sim.heroVy += 880 * dt;
          sim.heroY += sim.heroVy * dt;
          if (sim.heroY >= GROUND_Y) {
            sim.heroY = GROUND_Y;
            sim.heroVy = 0;
            sim.onGround = true;
            if (prevSpatialRef.current.wasAirborne) {
              markEvt('lands', {
                subjectAssetId: heroAssetIdRef.current,
                subjectRole: 'hero',
              });
              markEvt('was_airborne');
              prevSpatialRef.current.wasAirborne = false;
            }
          }
        }

        sim.heroX += sim.heroVx * dt;
        sim.heroVx += (HERO_BASE_X - sim.heroX) * 7.5 * dt;
        sim.heroVx *= Math.pow(0.06, dt);
        sim.heroX = Math.max(38, Math.min(WORLD_W - 60, sim.heroX));

        if (sim.shieldTimer > 0) {
          sim.shieldTimer = Math.max(0, sim.shieldTimer - dt);
          prevSpatialRef.current.wasBlocking = sim.shieldTimer > 0;
        } else {
          prevSpatialRef.current.wasBlocking = false;
        }

        if (sim.dodgeTimer > 0) {
          sim.dodgeTimer = Math.max(0, sim.dodgeTimer - dt);
          prevSpatialRef.current.wasDashing = sim.dodgeTimer > 0;
        } else {
          prevSpatialRef.current.wasDashing = false;
        }

        if (sim.hurtTimer > 0) sim.hurtTimer = Math.max(0, sim.hurtTimer - dt);
        if (sim.lanternFlare > 0)
          sim.lanternFlare = Math.max(0, sim.lanternFlare - dt * 1.1);

        for (let i = sim.waves.length - 1; i >= 0; i--) {
          const w = sim.waves[i];
          w.x += w.vx * dt;
          if (sim.hazard && !sim.hazard.resolved) {
            const dist = Math.hypot(w.x - sim.hazard.x, w.y - sim.hazard.y);
            if (dist < sim.hazard.radius + 16) {
              sim.hazard.resolved = true;
              markEvt('hits', {
                subjectAssetId: heroAssetIdRef.current,
                subjectRole: 'hero',
                targetAssetId: hazardAssetIdRef.current,
                targetRole: 'hazard',
              });
              markEvt('touches', {
                subjectAssetId: heroAssetIdRef.current,
                subjectRole: 'hero',
                targetAssetId: hazardAssetIdRef.current,
                targetRole: 'hazard',
              });
              markEvt('disappears', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
              });
              spawnParticles(sim.hazard.x, sim.hazard.y, '#38BDF8', 16);
              const matchedCtrl = liveActionControlsRef.current.find(
                (c) => c.id === w.actionControlId,
              );
              sim.waves.splice(i, 1);
              if (checkReactiveTransitions()) {
                continue;
              }
              if (matchedCtrl && hasUnconditionalOutgoing(matchedCtrl.target.id)) {
                resolveActionOutcome(matchedCtrl);
              }
              continue;
            }
          }
          if (w.x > WORLD_W + 30) {
            markEvt('leaves_stage', {
              subjectRole: 'projectile',
            });
            sim.waves.splice(i, 1);
          }
        }

        if (phaseRef.current === 'live' && sim.hazard && !sim.hazard.resolved) {
          const h = sim.hazard;
          h.age += dt;
          h.x += h.vx * dt;
          if (h.direction === 'down' || h.direction === 'up') {
            h.y += h.vy * dt;
          } else if (h.bounces) {
            h.y = h.baseY - cardPreviewBounce(h.age, h.speedMultiplier);
          } else {
            h.y = h.baseY;
          }

          if (h.direction === 'patrol') {
            const leftBound = HERO_BASE_X + 26;
            const rightBound = WORLD_W - 28;
            if (h.x <= leftBound) {
              h.x = leftBound;
              h.vx = Math.abs(h.vx);
            } else if (h.x >= rightBound) {
              h.x = rightBound;
              h.vx = -Math.abs(h.vx);
            }
          }

          if (h.visual === 'spark' && Math.random() < 0.45) {
            const trailDirX = h.vx > 1 ? -1 : h.vx < -1 ? 1 : 0;
            sim.particles.push({
              x: h.x + trailDirX * 8,
              y: h.y + (Math.random() - 0.5) * 8,
              vx: trailDirX * (25 + Math.random() * 25),
              vy: -15 - Math.random() * 25,
              size: 2 + Math.random() * 2,
              color: Math.random() > 0.4 ? '#F97316' : '#FDE047',
              life: 0.25,
              maxLife: 0.25,
            });
          }

          const resetHazardPosition = () => {
            h.resolved = false;
            h.age = 0;
            h.wasJumpedOver = false;
            prevSpatialRef.current.wasTouching = false;
            if (h.direction === 'right') {
              h.x = -24;
              h.y = h.baseY;
            } else if (h.direction === 'down') {
              h.y = -24;
            } else if (h.direction === 'up') {
              h.y = GROUND_Y + 12;
            } else if (h.direction === 'patrol') {
              h.x = 248;
              h.y = h.baseY;
            } else if (h.direction === 'static') {
              h.x = 232;
              h.y = h.baseY;
            } else {
              h.x = WORLD_W + 28;
              h.y = h.baseY;
            }
          };

          const heroCenterY = sim.heroY - 22;
          const dist = Math.hypot(h.x - sim.heroX, h.y - heroCenterY);
          const isCurrentlyTouching = dist < h.radius + 22;
          if (isCurrentlyTouching) {
            prevSpatialRef.current.wasTouching = true;
            markEvt('touches', {
              subjectAssetId: heroAssetIdRef.current,
              subjectRole: 'hero',
              targetAssetId: hazardAssetIdRef.current,
              targetRole: 'hazard',
            });
            markEvt('touches', {
              subjectAssetId: hazardAssetIdRef.current,
              subjectRole: 'hazard',
              targetAssetId: heroAssetIdRef.current,
              targetRole: 'hero',
            });
          } else {
            prevSpatialRef.current.wasTouching = false;
          }

          if (h.kind === 'collectible') {
            if (dist < h.radius + 22) {
              h.resolved = true;
              markEvt('touches', {
                subjectAssetId: heroAssetIdRef.current,
                subjectRole: 'hero',
                targetAssetId: hazardAssetIdRef.current,
                targetRole: 'hazard',
              });
              markEvt('is_collected', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
                targetAssetId: heroAssetIdRef.current,
                targetRole: 'hero',
              });
              markEvt('disappears', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
              });
              spawnParticles(h.x, h.y, '#FBC53D', 16);
              if (!checkReactiveTransitions()) {
                const ctrl =
                  liveActionControlsRef.current.find(
                    (c) => c.id === sim.lastActionControlId && c.evaluation.passed,
                  ) ?? liveActionControlsRef.current.find((c) => c.evaluation.passed);
                if (ctrl && hasUnconditionalOutgoing(ctrl.target.id)) {
                  resolveActionOutcome(ctrl);
                } else {
                  resetHazardPosition();
                }
              }
            } else if (
              (h.direction === 'left' && h.x < -28) ||
              (h.direction === 'right' && h.x > WORLD_W + 28) ||
              (h.direction === 'down' && h.y > GROUND_Y + 16) ||
              (h.direction === 'up' && h.y < -28)
            ) {
              markEvt('leaves_stage', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
              });
              if (!checkReactiveTransitions()) {
                resetHazardPosition();
              }
            }
          } else if (h.direction === 'down') {
            if (dist < h.radius + 17 && sim.dodgeTimer <= 0) {
              h.resolved = true;
              markEvt('touches', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
                targetAssetId: heroAssetIdRef.current,
                targetRole: 'hero',
              });
              if (sim.shieldTimer > 0) {
                markEvt('blocks', {
                  subjectAssetId: heroAssetIdRef.current,
                  subjectRole: 'hero',
                  targetAssetId: hazardAssetIdRef.current,
                  targetRole: 'hazard',
                });
                markEvt('disappears', {
                  subjectAssetId: hazardAssetIdRef.current,
                  subjectRole: 'hazard',
                });
                if (!checkReactiveTransitions()) {
                  const shieldCtrl =
                    liveActionControlsRef.current.find(
                      (c) => c.id === sim.lastActionControlId && c.evaluation.passed,
                    ) ??
                    liveActionControlsRef.current.find(
                      (c) => c.mechanic === 'shield' && c.evaluation.passed,
                    );
                  if (shieldCtrl && hasUnconditionalOutgoing(shieldCtrl.target.id)) {
                    resolveActionOutcome(shieldCtrl);
                  } else {
                    resetHazardPosition();
                  }
                }
              } else {
                markEvt('hits', {
                  subjectAssetId: hazardAssetIdRef.current,
                  subjectRole: 'hazard',
                  targetAssetId: heroAssetIdRef.current,
                  targetRole: 'hero',
                });
                sim.hurtTimer = 0.55;
                spawnParticles(sim.heroX, heroCenterY, '#F43F5E', 16);
                if (!checkReactiveTransitions()) {
                  resetHazardPosition();
                }
              }
            } else if (h.y > GROUND_Y + 6) {
              h.resolved = true;
              markEvt('passes', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
                targetAssetId: heroAssetIdRef.current,
                targetRole: 'hero',
              });
              markEvt('avoids', {
                subjectAssetId: heroAssetIdRef.current,
                subjectRole: 'hero',
                targetAssetId: hazardAssetIdRef.current,
                targetRole: 'hazard',
              });
              markEvt('leaves_stage', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
              });
              markEvt('disappears', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
              });
              spawnParticles(h.x, GROUND_Y, '#F97316', 10);
              if (!checkReactiveTransitions()) {
                const dodgeCtrl =
                  liveActionControlsRef.current.find(
                    (c) => c.id === sim.lastActionControlId && c.evaluation.passed,
                  ) ??
                  liveActionControlsRef.current.find(
                    (c) =>
                      (c.mechanic === 'dodge' || c.mechanic === 'jump') &&
                      c.evaluation.passed,
                  );
                if (dodgeCtrl && hasUnconditionalOutgoing(dodgeCtrl.target.id)) {
                  resolveActionOutcome(dodgeCtrl);
                } else {
                  resetHazardPosition();
                }
              }
            }
          } else if (h.direction === 'up') {
            if (dist < h.radius + 17 && sim.dodgeTimer <= 0) {
              h.resolved = true;
              markEvt('touches', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
                targetAssetId: heroAssetIdRef.current,
                targetRole: 'hero',
              });
              markEvt('hits', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
                targetAssetId: heroAssetIdRef.current,
                targetRole: 'hero',
              });
              sim.hurtTimer = 0.55;
              spawnParticles(sim.heroX, heroCenterY, '#F43F5E', 16);
              if (!checkReactiveTransitions()) {
                resetHazardPosition();
              }
            } else if (h.y < -24) {
              h.resolved = true;
              markEvt('passes', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
                targetAssetId: heroAssetIdRef.current,
                targetRole: 'hero',
              });
              markEvt('avoids', {
                subjectAssetId: heroAssetIdRef.current,
                subjectRole: 'hero',
                targetAssetId: hazardAssetIdRef.current,
                targetRole: 'hazard',
              });
              markEvt('leaves_stage', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
              });
              markEvt('disappears', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
              });
              if (!checkReactiveTransitions()) {
                const clearedCtrl =
                  sim.lastActionControlId
                    ? liveActionControlsRef.current.find(
                        (c) => c.id === sim.lastActionControlId && c.evaluation.passed,
                      )
                    : undefined;
                if (clearedCtrl && hasUnconditionalOutgoing(clearedCtrl.target.id)) {
                  resolveActionOutcome(clearedCtrl);
                } else {
                  resetHazardPosition();
                }
              }
            }
          } else {
            // Horizontal ('left' | 'right' | 'patrol') & 'static'
            if (
              Math.abs(h.x - sim.heroX) < 18 &&
              sim.heroY < GROUND_Y - 28 &&
              !h.wasJumpedOver
            ) {
              h.wasJumpedOver = true;
              markEvt('passes', {
                subjectAssetId: heroAssetIdRef.current,
                subjectRole: 'hero',
                targetAssetId: hazardAssetIdRef.current,
                targetRole: 'hazard',
              });
              markEvt('passes', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
                targetAssetId: heroAssetIdRef.current,
                targetRole: 'hero',
              });
              markEvt('avoids', {
                subjectAssetId: heroAssetIdRef.current,
                subjectRole: 'hero',
                targetAssetId: hazardAssetIdRef.current,
                targetRole: 'hazard',
              });
            }

            if (dist < h.radius + 17 && sim.dodgeTimer <= 0) {
              h.resolved = true;
              markEvt('touches', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
                targetAssetId: heroAssetIdRef.current,
                targetRole: 'hero',
              });
              if (sim.shieldTimer > 0) {
                markEvt('blocks', {
                  subjectAssetId: heroAssetIdRef.current,
                  subjectRole: 'hero',
                  targetAssetId: hazardAssetIdRef.current,
                  targetRole: 'hazard',
                });
                markEvt('disappears', {
                  subjectAssetId: hazardAssetIdRef.current,
                  subjectRole: 'hazard',
                });
                spawnParticles(sim.heroX + 14, heroCenterY, '#38BDF8', 16);
                if (!checkReactiveTransitions()) {
                  const shieldCtrl =
                    liveActionControlsRef.current.find(
                      (c) => c.id === sim.lastActionControlId && c.evaluation.passed,
                    ) ??
                    liveActionControlsRef.current.find(
                      (c) => c.mechanic === 'shield' && c.evaluation.passed,
                    );
                  if (shieldCtrl && hasUnconditionalOutgoing(shieldCtrl.target.id)) {
                    resolveActionOutcome(shieldCtrl);
                  } else {
                    resetHazardPosition();
                  }
                }
              } else {
                markEvt('hits', {
                  subjectAssetId: hazardAssetIdRef.current,
                  subjectRole: 'hazard',
                  targetAssetId: heroAssetIdRef.current,
                  targetRole: 'hero',
                });
                sim.hurtTimer = 0.55;
                sim.heroVx = h.direction === 'right' ? 115 : -115;
                spawnParticles(sim.heroX, heroCenterY, '#F43F5E', 16);
                if (!checkReactiveTransitions()) {
                  resetHazardPosition();
                }
              }
            } else if (
              (h.direction === 'left' && h.x < sim.heroX - 36) ||
              (h.direction === 'right' && h.x > WORLD_W + 26)
            ) {
              h.resolved = true;
              markEvt('passes', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
                targetAssetId: heroAssetIdRef.current,
                targetRole: 'hero',
              });
              markEvt('avoids', {
                subjectAssetId: heroAssetIdRef.current,
                subjectRole: 'hero',
                targetAssetId: hazardAssetIdRef.current,
                targetRole: 'hazard',
              });
              markEvt('leaves_stage', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
              });
              markEvt('disappears', {
                subjectAssetId: hazardAssetIdRef.current,
                subjectRole: 'hazard',
              });
              if (!checkReactiveTransitions()) {
                const clearedCtrl =
                  liveActionControlsRef.current.find(
                    (c) => c.id === sim.lastActionControlId && c.evaluation.passed,
                  ) ??
                  liveActionControlsRef.current.find(
                    (c) =>
                      (c.mechanic === 'jump' || c.mechanic === 'dodge') &&
                      c.evaluation.passed,
                  );
                if (clearedCtrl && hasUnconditionalOutgoing(clearedCtrl.target.id)) {
                  resolveActionOutcome(clearedCtrl);
                } else {
                  resetHazardPosition();
                }
              }
            }
          }
        }

        if (phaseRef.current === 'live') {
          const transitioned = checkReactiveTransitions();
          if (!transitioned && recordedNewEvent) {
            setSimRevision((r) => r + 1);
          }
        }

        for (let i = sim.particles.length - 1; i >= 0; i--) {
          const p = sim.particles[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 180 * dt;
          p.life -= dt;
          if (p.life <= 0) sim.particles.splice(i, 1);
        }
        for (let i = sim.popups.length - 1; i >= 0; i--) {
          const pop = sim.popups[i];
          pop.y -= 28 * dt;
          pop.life -= dt;
          if (pop.life <= 0) sim.popups.splice(i, 1);
        }
      }

      const canvas = canvasRef.current;
      const host = canvasHostRef.current;
      if (canvas && host) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const cssW = Math.max(200, host.clientWidth);
        const cssH = Math.max(180, host.clientHeight);
        if (
          canvas.width !== Math.round(cssW * dpr) ||
          canvas.height !== Math.round(cssH * dpr)
        ) {
          canvas.width = Math.round(cssW * dpr);
          canvas.height = Math.round(cssH * dpr);
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale((cssW * dpr) / WORLD_W, (cssH * dpr) / WORLD_H);

          if (!hasAnyPlayable) {
            // Truly blank, clean neutral stage canvas (zero pre-baked scenery!)
            ctx.fillStyle = '#F1F5F9';
            ctx.fillRect(0, 0, WORLD_W, WORLD_H);
            ctx.fillStyle = '#CBD5E1';
            for (let gx = 18; gx < WORLD_W; gx += 24) {
              for (let gy = 18; gy < WORLD_H; gy += 24) {
                ctx.beginPath();
                ctx.arc(gx, gy, 1, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            ctx.restore();
            rafId = window.requestAnimationFrame(stepAndRender);
            return;
          }

          const previewOutcomeVisual: OutcomeVisualKind =
            !isPlaying && preview.outcomeCfg ? preview.outcomeCfg.visual : 'none';
          const previewFlare =
            previewOutcomeVisual === 'celebrate' || previewOutcomeVisual === 'victory'
              ? 0.55 + 0.25 * Math.sin(sim.time * 3.5)
              : 0;
          const flare = isPlaying ? sim.lanternFlare : previewFlare;

          drawStageBackdrop(
            ctx,
            isPlaying ? activeSceneThemeRef.current : preview.sceneTheme,
            WORLD_W,
            WORLD_H,
            GROUND_Y,
            sim.time,
            flare,
            bgImgRef.current,
            bgBakedRef.current,
            bgEffectsRef.current,
          );

          // Hero Character (Only drawn when student has explicitly bound/selected a Character asset)
          if (heroImgRef.current && (isPlaying || preview.showHero)) {
            const hx = isPlaying ? sim.heroX : HERO_BASE_X;
            const idleBob =
              !isPlaying || sim.onGround ? Math.sin(sim.time * 4.5) * 1.5 : 0;
            const hy = (isPlaying ? sim.heroY : GROUND_Y) + idleBob;

            const heightAboveGround = Math.max(
              0,
              GROUND_Y - (isPlaying ? sim.heroY : GROUND_Y),
            );
            const shadowScale = Math.max(0.35, 1 - heightAboveGround / 120);
            ctx.fillStyle = 'rgba(11, 19, 43, 0.35)';
            ctx.beginPath();
            ctx.ellipse(
              hx,
              GROUND_Y + 2,
              15 * shadowScale,
              3.5 * shadowScale,
              0,
              0,
              Math.PI * 2,
            );
            ctx.fill();

            ctx.save();
            if (isPlaying && sim.hurtTimer > 0 && Math.floor(sim.time * 24) % 2 === 0) {
              ctx.globalAlpha = 0.45;
            }
            if (!isPlaying && previewOutcomeVisual === 'hurt') {
              ctx.strokeStyle = 'rgba(251, 113, 133, 0.8)';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(hx, hy - 22, 24 + Math.sin(sim.time * 6) * 2, 0, Math.PI * 2);
              ctx.stroke();
            }

            drawSpriteWithEffects(
              ctx,
              heroImgRef.current,
              heroBakedRef.current,
              hx,
              hy - 23,
              42,
              42,
              heroEffectsRef.current,
              sim.time,
              0,
              1,
            );

            if (isPlaying && sim.shieldTimer > 0) {
              const shieldGrad = ctx.createRadialGradient(
                hx + 2,
                hy - 20,
                6,
                hx + 2,
                hy - 20,
                28,
              );
              shieldGrad.addColorStop(0, 'rgba(56, 189, 248, 0.12)');
              shieldGrad.addColorStop(0.8, 'rgba(56, 189, 248, 0.48)');
              shieldGrad.addColorStop(1, 'rgba(186, 230, 253, 0.85)');
              ctx.fillStyle = shieldGrad;
              ctx.beginPath();
              ctx.arc(hx + 2, hy - 20, 27, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = '#7DD3FC';
              ctx.lineWidth = 2;
              ctx.stroke();
            }
            ctx.restore();
          }

          // Build Preview: Live Challenge Entity + Animated Direction/Speed Guide
          if (!isPlaying && preview.challenge && preview.challengeCfg && !preview.challengeCfg.isSceneOnly) {
            const cfg = preview.challengeCfg;
            const cycle = cardPreviewCycle(sim.time, cfg.speedMultiplier);
            const basePreviewY = cfg.pattern === 'collectible' ? GROUND_Y - 60 : GROUND_Y - 14;
            const bounceOffset = cfg.bounces ? cardPreviewBounce(sim.time, cfg.speedMultiplier, true) : 0;

            let px = 248;
            let py = basePreviewY - bounceOffset;
            let arrowFromX = 0;
            let arrowFromY = 0;
            let arrowToX = 0;
            let arrowToY = 0;
            let hasArrow = true;
            let doubleArrow = false;
            let previewRotateDir: -1 | 0 | 1 = 0;

            if (cfg.direction === 'right') {
              px = 112 + cycle * 196;
              py = basePreviewY - bounceOffset;
              arrowFromX = px + 18;
              arrowFromY = py;
              arrowToX = Math.min(WORLD_W - 14, px + 62);
              arrowToY = py;
              previewRotateDir = cfg.rotates || cfg.visual === 'rock' ? 1 : 0;
            } else if (cfg.direction === 'down') {
              px = HERO_BASE_X + 98;
              py = 26 + cycle * (GROUND_Y - 44);
              arrowFromX = px;
              arrowFromY = py + 18;
              arrowToX = px;
              arrowToY = Math.min(GROUND_Y - 6, py + 56);
              previewRotateDir = cfg.rotates ? 1 : 0;
            } else if (cfg.direction === 'up') {
              px = HERO_BASE_X + 98;
              py = GROUND_Y - 16 - cycle * (GROUND_Y - 46);
              arrowFromX = px;
              arrowFromY = py - 18;
              arrowToX = px;
              arrowToY = Math.max(12, py - 56);
              previewRotateDir = cfg.rotates ? -1 : 0;
            } else if (cfg.direction === 'patrol') {
              const patrol = cardPreviewPatrol(sim.time, cfg.speedMultiplier);
              px = 222 + patrol.offset * 66;
              py = basePreviewY - bounceOffset;
              arrowFromX = 152;
              arrowFromY = basePreviewY + 1;
              arrowToX = 292;
              arrowToY = basePreviewY + 1;
              doubleArrow = true;
              previewRotateDir = cfg.rotates || cfg.visual === 'rock' ? patrol.direction : 0;
            } else if (cfg.direction === 'static') {
              px = 236;
              py = basePreviewY - bounceOffset;
              hasArrow = false;
              previewRotateDir = cfg.rotates ? 1 : 0;
            } else {
              // 'left'
              px = 308 - cycle * 196;
              py = basePreviewY - bounceOffset;
              arrowFromX = px - 18;
              arrowFromY = py;
              arrowToX = Math.max(46, px - 62);
              arrowToY = py;
              previewRotateDir = cfg.rotates || cfg.visual === 'rock' ? -1 : 0;
            }

            const guideColor =
              cfg.pattern === 'collectible'
                ? 'rgba(251, 197, 61, 0.85)'
                : 'rgba(251, 146, 60, 0.85)';

            ctx.save();
            ctx.strokeStyle = guideColor;
            ctx.fillStyle = guideColor;
            ctx.lineWidth = 2;

            if (hasArrow) {
              const drawHead = (x1: number, y1: number, x2: number, y2: number) => {
                const ang = Math.atan2(y2 - y1, x2 - x1);
                const len = 6.5;
                ctx.beginPath();
                ctx.moveTo(x2, y2);
                ctx.lineTo(x2 - len * Math.cos(ang - 0.5), y2 - len * Math.sin(ang - 0.5));
                ctx.lineTo(x2 - len * Math.cos(ang + 0.5), y2 - len * Math.sin(ang + 0.5));
                ctx.closePath();
                ctx.fill();
              };

              ctx.setLineDash([4, 4]);
              ctx.beginPath();
              ctx.moveTo(arrowFromX, arrowFromY);
              ctx.lineTo(arrowToX, arrowToY);
              ctx.stroke();
              ctx.setLineDash([]);

              if (Math.hypot(arrowToX - arrowFromX, arrowToY - arrowFromY) > 10) {
                drawHead(arrowFromX, arrowFromY, arrowToX, arrowToY);
                if (doubleArrow) {
                  drawHead(arrowToX, arrowToY, arrowFromX, arrowFromY);
                }
              }
            } else {
              // Static hazard subtle anchor ring
              const pulseR = 17 + Math.sin(sim.time * 3.2) * 2.5;
              ctx.setLineDash([3, 3]);
              ctx.beginPath();
              ctx.arc(px, py, pulseR, 0, Math.PI * 2);
              ctx.stroke();
              ctx.setLineDash([]);
            }
            ctx.restore();

            drawChallengeEntity(
              ctx,
              px,
              py,
              13,
              cfg.visual,
              sim.time,
              hazardImgRef.current,
              previewRotateDir,
              hazardBakedRef.current,
              hazardEffectsRef.current,
            );
          }

          // Live Play Entities
          if (isPlaying) {
            sim.waves.forEach((w) => {
              ctx.save();
              ctx.strokeStyle = '#38BDF8';
              ctx.lineWidth = 3.5;
              ctx.beginPath();
              ctx.arc(w.x, w.y, 12, -Math.PI * 0.4, Math.PI * 0.4);
              ctx.stroke();
              ctx.restore();
            });

            if (sim.hazard && !sim.hazard.resolved) {
              const liveRotateDir: -1 | 0 | 1 =
                sim.hazard.rotates ||
                (sim.hazard.visual === 'rock' && sim.hazard.direction !== 'static')
                  ? sim.hazard.vx > 1
                    ? 1
                    : -1
                  : 0;
              drawChallengeEntity(
                ctx,
                sim.hazard.x,
                sim.hazard.y,
                sim.hazard.radius,
                sim.hazard.visual,
                sim.time,
                hazardImgRef.current,
                liveRotateDir,
                hazardBakedRef.current,
                hazardEffectsRef.current,
              );
            }

            sim.particles.forEach((p) => {
              ctx.save();
              ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            });

            sim.popups.forEach((pop) => {
              ctx.save();
              ctx.globalAlpha = Math.max(0, Math.min(1, pop.life));
              ctx.font = '700 13px "Fredoka", system-ui, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillStyle = '#0F172A';
              ctx.fillText(pop.text, pop.x + 1, pop.y + 1);
              ctx.fillStyle = pop.color;
              ctx.fillText(pop.text, pop.x, pop.y);
              ctx.restore();
            });
          }

          ctx.restore();
        }
      }

      rafId = window.requestAnimationFrame(stepAndRender);
    };

    rafId = window.requestAnimationFrame(stepAndRender);
    return () => window.cancelAnimationFrame(rafId);
  }, [
    checkReactiveTransitions,
    hasUnconditionalOutgoing,
    recordRuntimeEvent,
    resolveActionOutcome,
    spawnParticles,
  ]);

  if (!isOpen) {
    return (
      <aside className="relative h-full w-11 shrink-0 bg-white border-l border-[#E2E8F0] flex flex-col items-center py-3 gap-3 z-20">
        {isDimmed && (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[#0F172A]/24 pointer-events-none"
          />
        )}
        <button
          type="button"
          onClick={onToggle}
          title={t.expand}
          aria-label={t.expand}
          className="relative w-8 h-8 rounded-lg text-[#475569] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B]"
        >
          <PanelRightOpen className="w-4 h-4" aria-hidden="true" />
        </button>
        <div
          className="relative text-[11px] font-bold tracking-wider uppercase text-[#64748B] select-none"
          style={{ writingMode: 'vertical-rl' }}
        >
          {t.title}
        </div>
      </aside>
    );
  }

  const activeDialogueNode =
    playMode === 'playing'
      ? phase === 'overlay' && primaryNode?.kind === 'dialogue'
        ? primaryNode
        : null
      : previewSnapshot.dialogue;

  const activeDialogueParsed = activeDialogueNode
    ? resolveDialogueContent(activeDialogueNode)
    : null;

  const activeDialoguePortraitBinding = activeDialogueNode
    ? getNodeVisualBindingByCategories(activeDialogueNode, ['characters']) ?? characterBinding
    : null;
  const activeDialoguePortraitVisible =
    !!activeDialoguePortraitBinding &&
    !isHiddenByEffect(activeDialoguePortraitBinding.effects);
  const activeDialoguePortraitFilter = activeDialoguePortraitBinding
    ? buildCssFilterString(activeDialoguePortraitBinding.effects) || undefined
    : undefined;

  const activeNarrationNode =
    playMode === 'playing'
      ? phase === 'overlay' && primaryNode?.kind === 'narration'
        ? primaryNode
        : null
      : previewSnapshot.narration;

  const activeNarrationPos = activeNarrationNode
    ? resolveSubtitlePosition(activeNarrationNode)
    : 'bottom';

  const canPlay = playableNodes.length > 0;
  const showStatsBar = usedStats.usesHp || usedStats.usesScore;

  return (
    <aside
      style={{ width: fullscreen ? '100%' : `${width}px`, ...(fullscreen ? { position: 'fixed', inset: 0, zIndex: 1000 } : {}) }}
      className={`relative h-full shrink-0 bg-white border-l border-[#E2E8F0] flex flex-col min-h-0 overflow-hidden transition-shadow duration-300 ${
        isSpotlighted ? 'z-30 ring-2 ring-inset ring-[#FBC53D]/85' : 'z-10'
      }`}
    >
      {isDimmed && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[#0F172A]/24 pointer-events-none z-20 transition-opacity duration-300"
        />
      )}

      {/* Play Panel Header with Explicit Play / Stop Run Controls */}
      <div className="h-12 px-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="font-display text-sm font-bold text-[#14244B] truncate">
            {t.title}
          </h2>
          <span className="text-[11px] font-medium text-[#64748B] truncate">
            · {playMode === 'playing' ? t.liveLabel : t.previewLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {playMode === 'preview' && (
            <button type="button" onClick={onEditScene} className="px-2 py-1.5 text-xs font-semibold rounded-lg hover:bg-[#F1F5F9] text-[#14244B]">
              {lang === 'zh' ? '编辑场景' : 'Edit scene'}
            </button>
          )}
          {playMode === 'preview' ? (
            <button
              type="button"
              disabled={!canPlay}
              onClick={handleStartPlay}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                canPlay
                  ? 'bg-[#14244B] hover:bg-[#1E3468] text-white cursor-pointer'
                  : 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
              }`}
            >
              <Play className="w-3 h-3 fill-current" aria-hidden="true" />
              <span>{t.playBtn}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleStopPlay}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                <span>{t.stopBtn}</span>
              </button>
              <button
                type="button"
                onClick={handleStartPlay}
                title={t.restart}
                aria-label={t.restart}
                className="w-7 h-7 rounded-lg text-[#475569] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </>
          )}

          <button type="button" onClick={() => setFullscreen(value => !value)}
            aria-label={fullscreen ? (lang === 'zh' ? '退出全屏' : 'Exit fullscreen') : (lang === 'zh' ? '全屏' : 'Fullscreen')}
            className="w-7 h-7 rounded-lg text-[#475569] hover:bg-[#F1F5F9] flex items-center justify-center cursor-pointer shrink-0">
            <Maximize className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => { setFullscreen(false); onToggle(); }}
            title={t.collapse}
            aria-label={t.collapse}
            className="w-7 h-7 rounded-lg text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-pointer"
          >
            <PanelRightClose className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Dynamic Stats Strip — ONLY appears when the student's cards/conditions use HP/Score */}
      {showStatsBar && (
        <div className="px-3.5 py-2 border-b border-[#F1F5F9] bg-[#F8FAFC] flex items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {usedStats.usesHp && (
              <div className="flex items-center gap-1">
                <Heart
                  className="w-3.5 h-3.5 text-[#F43F5E] fill-[#F43F5E]/20 shrink-0"
                  aria-hidden="true"
                />
                <span className="text-[#64748B] font-medium">{t.hpLabel}</span>
                <div className="inline-flex items-center gap-0.5 ml-0.5 bg-white border border-[#E2E8F0] rounded-md px-0.5 py-0.5">
                  <button
                    type="button"
                    onClick={() => setStats((s) => ({ ...s, hp: Math.max(0, s.hp - 1) }))}
                    aria-label="Decrease HP"
                    className="w-4 h-4 rounded text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center cursor-pointer"
                  >
                    <Minus className="w-2.5 h-2.5" aria-hidden="true" />
                  </button>
                  <span className="font-mono font-bold tabular-nums text-[#14244B] px-1">
                    {stats.hp}
                  </span>
                  <button
                    type="button"
                    onClick={() => setStats((s) => ({ ...s, hp: Math.min(9, s.hp + 1) }))}
                    aria-label="Increase HP"
                    className="w-4 h-4 rounded text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-2.5 h-2.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}

            {usedStats.usesScore && (
              <div className="flex items-center gap-1">
                <Star
                  className="w-3.5 h-3.5 text-[#F59E0B] fill-[#F59E0B]/25 shrink-0"
                  aria-hidden="true"
                />
                <span className="text-[#64748B] font-medium">{t.scoreLabel}</span>
                <div className="inline-flex items-center gap-0.5 ml-0.5 bg-white border border-[#E2E8F0] rounded-md px-0.5 py-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      setStats((s) => ({ ...s, score: Math.max(0, s.score - 1) }))
                    }
                    aria-label="Decrease Score"
                    className="w-4 h-4 rounded text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center cursor-pointer"
                  >
                    <Minus className="w-2.5 h-2.5" aria-hidden="true" />
                  </button>
                  <span className="font-mono font-bold tabular-nums text-[#14244B] px-1">
                    {stats.score}
                  </span>
                  <button
                    type="button"
                    onClick={() => setStats((s) => ({ ...s, score: s.score + 1 }))}
                    aria-label="Increase Score"
                    className="w-4 h-4 rounded text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-2.5 h-2.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {playMode === 'playing' && (
            <span className="font-mono text-[11px] font-semibold tabular-nums text-[#64748B] shrink-0">
              {t.stepLabel} {waveNumber}
            </span>
          )}
        </div>
      )}

      {/* Live Synced Game & Asset Properties HUD (appears automatically when properties exist) */}
      {scopedVariables.length > 0 && (
        <div className="px-3.5 py-2 border-b border-[#E2E8F0] bg-[#F8FAFC] space-y-1.5 shrink-0 max-h-[132px] overflow-y-auto">
          <div className="text-[10.5px] font-bold text-[#64748B] flex items-center justify-between">
            <span>{st.playHudTitle}</span>
            <span className="font-mono tabular-nums font-normal">
              {scopedVariables.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {scopedVariables.map((entry) => {
              const { variable, playValue, isDirty } = entry;
              const hasProgress =
                variable.type === 'number' &&
                variable.hasMax &&
                typeof variable.maxValue === 'number' &&
                variable.maxValue > (variable.hasMin && typeof variable.minValue === 'number' ? variable.minValue : 0);
              const minBound =
                variable.hasMin && typeof variable.minValue === 'number'
                  ? variable.minValue
                  : 0;
              const pct = hasProgress
                ? Math.max(
                    0,
                    Math.min(
                      100,
                      ((Number(playValue) - minBound) /
                        (variable.maxValue! - minBound)) *
                        100,
                    ),
                  )
                : 0;

              return (
                <div
                  key={variable.id}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                    isDirty
                      ? 'bg-[#FFFBEB] border-[#FDE68A]'
                      : 'bg-white border-[#E2E8F0]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-1">
                      {entry.scope === 'asset' && entry.assetName && (
                        <span className="text-[10.5px] text-[#64748B] truncate max-w-[78px]">
                          {entry.assetName} ·
                        </span>
                      )}
                      <span className="font-semibold text-[#14244B] truncate">
                        {variable.name}
                      </span>
                    </div>

                    {variable.type === 'number' && (
                      <div className="inline-flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdatePlayValue(
                              variable.id,
                              clampNumberValue(Number(playValue) - 1, variable),
                            )
                          }
                          aria-label={`Decrease ${variable.name}`}
                          className="w-4 h-4 rounded text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center cursor-pointer"
                        >
                          <Minus className="w-2.5 h-2.5" aria-hidden="true" />
                        </button>
                        <span className="font-mono font-bold tabular-nums text-[#14244B]">
                          {Number(playValue)}
                          {variable.hasMax && typeof variable.maxValue === 'number' && (
                            <span className="text-[#94A3B8] font-normal">
                              /{variable.maxValue}
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdatePlayValue(
                              variable.id,
                              clampNumberValue(Number(playValue) + 1, variable),
                            )
                          }
                          aria-label={`Increase ${variable.name}`}
                          className="w-4 h-4 rounded text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center cursor-pointer"
                        >
                          <Plus className="w-2.5 h-2.5" aria-hidden="true" />
                        </button>
                      </div>
                    )}

                    {variable.type === 'boolean' && (
                      <button
                        type="button"
                        onClick={() => onUpdatePlayValue(variable.id, !Boolean(playValue))}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold cursor-pointer shrink-0 ${
                          Boolean(playValue)
                            ? 'bg-[#ECFDF5] text-[#047857]'
                            : 'bg-[#F1F5F9] text-[#475569]'
                        }`}
                      >
                        {Boolean(playValue) ? (
                          <Check className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <X className="w-3 h-3" aria-hidden="true" />
                        )}
                        <span>{Boolean(playValue) ? st.boolTrue : st.boolFalse}</span>
                      </button>
                    )}

                    {variable.type === 'choice' && (
                      <select
                        value={String(playValue ?? '')}
                        onChange={(e) => onUpdatePlayValue(variable.id, e.target.value)}
                        aria-label={variable.name}
                        className="max-w-[112px] px-1.5 py-0.5 text-[11px] font-semibold text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] rounded focus:outline-none cursor-pointer"
                      >
                        {(variable.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}

                    {variable.type === 'text' && (
                      <span className="font-mono text-[11px] font-semibold text-[#334155] truncate max-w-[116px]">
                        {String(playValue ?? '') || '—'}
                      </span>
                    )}
                  </div>

                  {hasProgress && (
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#E2E8F0] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#4E9AE3] transition-all duration-150"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Play Viewport Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3.5 flex flex-col gap-3">
        {/* Live 2D Stage Canvas */}
        <div
          ref={canvasHostRef}
          onClick={(e) => {
            if (playMode === 'playing' && phase === 'overlay') {
              if (!activeOverlayPlayback || activeOverlayPlayback.mode === 'click') {
                handleAdvanceOverlay();
              }
              return;
            }
            if (playMode === 'playing' && phase === 'live') {
              const host = canvasHostRef.current;
              const sim = simRef.current;
              let clickedHero = false;
              let clickedHazard = false;
              if (host) {
                const rect = host.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  const wx = ((e.clientX - rect.left) / rect.width) * WORLD_W;
                  const wy = ((e.clientY - rect.top) / rect.height) * WORLD_H;
                  if (Math.hypot(wx - sim.heroX, wy - (sim.heroY - 22)) < 28) {
                    clickedHero = true;
                  }
                  if (
                    sim.hazard &&
                    !sim.hazard.resolved &&
                    Math.hypot(wx - sim.hazard.x, wy - sim.hazard.y) <
                      sim.hazard.radius + 16
                  ) {
                    clickedHazard = true;
                  }
                }
              }

              let recordedClick = false;
              if (clickedHero) {
                if (
                  recordRuntimeEvent('is_clicked', {
                    subjectAssetId: heroAssetIdRef.current,
                    subjectRole: 'hero',
                  })
                ) {
                  recordedClick = true;
                }
              }
              if (clickedHazard) {
                if (
                  recordRuntimeEvent('is_clicked', {
                    subjectAssetId: hazardAssetIdRef.current,
                    subjectRole: 'hazard',
                  })
                ) {
                  recordedClick = true;
                }
              }
              if (!clickedHero && !clickedHazard) {
                if (
                  recordRuntimeEvent('is_clicked', {
                    subjectAssetId: backgroundAssetIdRef.current,
                    subjectRole: 'timer',
                  })
                ) {
                  recordedClick = true;
                }
              }

              if (recordedClick) {
                setSimRevision((r) => r + 1);
                if (checkReactiveTransitions()) return;
              }
              const mouseCtrl = liveActionControls.find(
                (c) =>
                  c.evaluation.passed &&
                  c.control.device === 'mouse' &&
                  c.control.input === 'Left Button' &&
                  c.control.interactionType !== 'double-click',
              );
              if (mouseCtrl) performLiveAction(mouseCtrl);
            }
          }}
          onDoubleClick={() => {
            if (playMode !== 'playing' || phase !== 'live') return;
            const dblCtrl = liveActionControls.find(
              (c) =>
                c.evaluation.passed &&
                c.control.device === 'mouse' &&
                c.control.interactionType === 'double-click',
            );
            if (dblCtrl) performLiveAction(dblCtrl);
          }}
          onContextMenu={(e) => {
            if (playMode !== 'playing' || phase !== 'live') return;
            const rightCtrl = liveActionControls.find(
              (c) =>
                c.evaluation.passed &&
                c.control.device === 'mouse' &&
                c.control.input === 'Right Button',
            );
            if (rightCtrl) {
              e.preventDefault();
              performLiveAction(rightCtrl);
            }
          }}
          className={`relative w-full aspect-[16/11] rounded-2xl overflow-hidden border shrink-0 transition-colors ${
            playableNodes.length === 0
              ? 'border-[#E2E8F0] bg-[#F1F5F9]'
              : 'border-[#1E293B] bg-[#1E293B] shadow-[0_12px_28px_rgba(11,19,43,0.16)]'
          } ${playMode === 'playing' && (phase === 'overlay' || phase === 'live') ? 'cursor-pointer' : ''}`}
        >
          <canvas ref={canvasRef} className="w-full h-full block" />

          {/* Clean Blank Stage Zero-State */}
          {playableNodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center">
              <div className="font-display text-sm font-bold text-[#14244B]">
                {t.stageEmptyTitle}
              </div>
              <p className="mt-1 text-[11.5px] text-[#64748B] leading-relaxed max-w-[230px]">
                {t.stageEmpty}
              </p>
            </div>
          )}

          {/* Build Preview: Outcome Stat/FX Preview Tag */}
          {playMode === 'preview' && previewSnapshot.outcome && previewSnapshot.outcomeCfg && (
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0F172A]/82 backdrop-blur-xs border border-white/15 text-[11px] font-semibold text-white pointer-events-none">
              <Sparkles className="w-3 h-3 text-[#FBC53D] shrink-0" aria-hidden="true" />
              {previewSnapshot.outcomeCfg.scoreDelta !== 0 && (
                <span className="font-mono tabular-nums text-[#FDE047]">
                  {previewSnapshot.outcomeCfg.scoreDelta > 0
                    ? `+${previewSnapshot.outcomeCfg.scoreDelta}`
                    : previewSnapshot.outcomeCfg.scoreDelta}{' '}
                  {t.scoreLabel}
                </span>
              )}
              {previewSnapshot.outcomeCfg.hpDelta !== 0 && (
                <span className="font-mono tabular-nums text-[#FDA4AF]">
                  {previewSnapshot.outcomeCfg.hpDelta > 0
                    ? `+${previewSnapshot.outcomeCfg.hpDelta}`
                    : previewSnapshot.outcomeCfg.hpDelta}{' '}
                  {t.hpLabel}
                </span>
              )}
              {previewSnapshot.outcomeCfg.scoreDelta === 0 &&
                previewSnapshot.outcomeCfg.hpDelta === 0 && (
                  <span className="truncate max-w-[140px]">
                    {previewSnapshot.outcome.note}
                  </span>
                )}
            </div>
          )}

          {/* Live Play: Challenge Countdown HUD */}
          {playMode === 'playing' && phase === 'live' && challengeTimeLeft !== null && (
            <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-[#0F172A]/82 backdrop-blur-xs border border-white/15 text-white font-mono text-[11px] font-bold tabular-nums shadow-md pointer-events-none">
              {challengeTimeLeft}s
            </div>
          )}

          {/* Live Play: Outcome HUD Banner */}
          {playMode === 'playing' && hudToast && phase !== 'ended' && (
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 max-w-[92%] px-3 py-1 rounded-lg bg-[#0F172A]/85 backdrop-blur-xs border border-white/15 text-white text-[11px] font-semibold text-center shadow-md pointer-events-none truncate">
              {hudToast.text}
            </div>
          )}

          {/* Pure In-Game Cinema Subtitle Overlay (Narration Card) */}
          {activeNarrationNode && activeNarrationNode.note.trim() && (
            <div
              className={`absolute inset-x-3 flex flex-col items-center gap-1.5 ${
                activeNarrationPos === 'top' ? 'top-2.5' : 'bottom-2.5'
              }`}
            >
              <div className="w-full px-3.5 py-2 rounded-lg bg-[#090F22]/82 backdrop-blur-xs text-center border border-white/10 shadow-lg">
                <p className="text-[12.5px] leading-snug text-white font-medium tracking-wide">
                  {activeNarrationNode.note}
                </p>
              </div>
              {playMode === 'playing' && (
                <span className="text-[10px] font-semibold text-white/80 tracking-wide">
                  {activeOverlayPlayback?.mode === 'auto'
                    ? lang === 'zh'
                      ? `自动播放 · ${activeOverlayPlayback.durationSec ?? 3} 秒后继续`
                      : `Auto-playing · ${activeOverlayPlayback.durationSec ?? 3}s`
                    : activeOverlayPlayback?.mode === 'key'
                      ? lang === 'zh'
                        ? `按 ${activeOverlayPlayback.key || 'Space'} 键继续`
                        : `Press ${activeOverlayPlayback.key || 'Space'} to continue`
                      : t.tapToContinue}
                </span>
              )}
            </div>
          )}

          {/* Pure In-Game Character Dialogue Box Overlay (Dialogue Card) */}
          {activeDialogueNode && activeDialogueParsed && activeDialogueParsed.body && (
            <div className="absolute inset-x-2.5 bottom-2.5">
              <div className="flex items-end gap-2.5 p-2.5 rounded-xl bg-[#0F172A]/90 backdrop-blur-xs border border-[#F43F5E]/60 shadow-lg">
                {activeDialoguePortraitBinding ? (
                  activeDialoguePortraitVisible ? (
                    <div className="relative w-11 h-11 rounded-lg bg-white/95 p-1 shrink-0 border border-white/20 flex items-center justify-center overflow-hidden">
                      <img
                        src={activeDialoguePortraitBinding.url}
                        alt={activeDialogueParsed.speaker || 'Character'}
                        referrerPolicy="no-referrer"
                        style={{
                          opacity: getStaticOpacity(activeDialoguePortraitBinding.effects),
                          filter: activeDialoguePortraitFilter,
                        }}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : null
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-[#FFF1F2] flex items-center justify-center shrink-0">
                    <MessageSquareQuote
                      className="w-5 h-5 text-[#BE123C]"
                      aria-hidden="true"
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {activeDialogueParsed.speaker && (
                    <div className="text-[11px] font-bold text-[#FDA4AF] leading-tight truncate">
                      {activeDialogueParsed.speaker}
                    </div>
                  )}
                  <p className="mt-0.5 text-[12px] leading-snug text-white font-medium">
                    {activeDialogueParsed.body}
                  </p>
                  {playMode === 'playing' && (
                    <div className="mt-1 text-right text-[10px] font-semibold text-[#FBC53D]">
                      {activeOverlayPlayback?.mode === 'auto'
                        ? `${activeOverlayPlayback.durationSec ?? 3}s ▸`
                        : activeOverlayPlayback?.mode === 'key'
                          ? `${activeOverlayPlayback.key || 'Space'} ▸`
                          : lang === 'zh'
                            ? '点击继续 ▸'
                            : 'Click ▸'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Locked Chapter Waiting Overlay */}
          {playMode === 'playing' &&
            phase === 'live' &&
            !primaryNode &&
            pendingGroupIds.length > 0 && (
              <div className="absolute inset-0 bg-[#0B132B]/72 backdrop-blur-[1px] flex flex-col items-center justify-center p-4 text-center gap-1.5">
                <Lock className="w-5 h-5 text-[#FBC53D]" aria-hidden="true" />
                <div className="text-xs font-bold text-white">
                  {t.chapterLockedHint}
                </div>
                <div className="text-[11px] text-[#CBD5E1] max-w-[240px]">
                  {pendingGroupIds
                    .map((gId) => {
                      const g = playableMap.get(gId);
                      if (!g) return '';
                      const name = g.title.trim() || g.note.trim();
                      return g.availableWhen ? `${name} (${g.availableWhen})` : name;
                    })
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            )}

          {/* Ending Overlay */}
          {playMode === 'playing' && phase === 'ended' && endSummary && (
            <div className="absolute inset-0 bg-[#0B132B]/78 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center gap-2.5">
              <div
                className={`text-xs font-bold uppercase tracking-wider ${
                  endSummary.tone === 'victory'
                    ? 'text-[#FBC53D]'
                    : endSummary.tone === 'defeat'
                      ? 'text-[#FDA4AF]'
                      : 'text-[#7DD3FC]'
                }`}
              >
                {endSummary.tone === 'victory'
                  ? lang === 'zh'
                    ? '通关成功'
                    : 'Victory'
                  : endSummary.tone === 'defeat'
                    ? lang === 'zh'
                      ? '挑战结束'
                      : 'Challenge Over'
                    : lang === 'zh'
                      ? '片段结束'
                      : 'Scene Complete'}
              </div>
              {endSummary.text && (
                <p className="text-sm font-semibold text-white leading-snug max-w-[260px]">
                  {endSummary.text}
                </p>
              )}
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleStartPlay}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FBC53D] hover:bg-[#F59E0B] text-[#14244B] text-xs font-bold transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.playAgain}</span>
                </button>
                <button
                  type="button"
                  onClick={handleStopPlay}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                  <span>{t.stopBtn}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Unlocked Chapters & Parallel Mechanisms Switcher */}
        {playMode === 'playing' &&
          (unlockedGroupIds.length > 0 ||
            pendingGroupIds.length > 0 ||
            activeNodes.length > 1) && (
            <div className="px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              {(unlockedGroupIds.length > 0 || pendingGroupIds.length > 0) && (
                <div className="space-y-1">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B] flex items-center justify-between">
                    <span>{t.chaptersLabel}</span>
                    <span className="font-mono tabular-nums font-normal">
                      {unlockedGroupIds.length}
                      {pendingGroupIds.length > 0
                        ? ` / ${unlockedGroupIds.length + pendingGroupIds.length}`
                        : ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {unlockedGroupIds.map((gId) => {
                      const grp = playableMap.get(gId);
                      if (!grp) return null;
                      const isFocused = focusedGroupId === gId;
                      const isCoreDone = completedGroupIds.includes(gId);
                      return (
                        <button
                          key={gId}
                          type="button"
                          onClick={() => handleFocusChapter(gId)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                            isFocused
                              ? 'bg-[#14244B] border-[#14244B] text-white'
                              : 'bg-white border-[#CBD5E1] text-[#14244B] hover:border-[#14244B]'
                          }`}
                        >
                          <Layers className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span className="font-mono text-[10px] font-bold opacity-75 shrink-0">
                            {resolveGroupCode(grp, nodes)}
                          </span>
                          <span className="truncate max-w-[130px]">
                            {grp.title.trim() || grp.note.trim() || COPY[lang].studio.board.groupUntitled}
                          </span>
                          {isCoreDone && (
                            <Check
                              className={`w-3 h-3 shrink-0 ${isFocused ? 'text-[#FBC53D]' : 'text-[#059669]'}`}
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      );
                    })}
                    {pendingGroupIds.map((gId) => {
                      const grp = playableMap.get(gId);
                      if (!grp) return null;
                      return (
                        <div
                          key={gId}
                          title={grp.availableWhen || t.chapterLockedHint}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B] text-[11px] font-medium whitespace-nowrap"
                        >
                          <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span className="font-mono text-[10px] font-bold opacity-75 shrink-0">
                            {resolveGroupCode(grp, nodes)}
                          </span>
                          <span className="truncate max-w-[110px]">
                            {grp.title.trim() || grp.note.trim() || COPY[lang].studio.board.groupUntitled}
                          </span>
                          {grp.availableWhen && (
                            <span className="text-[10px] text-[#94A3B8] truncate max-w-[90px]">
                              · {grp.availableWhen}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(() => {
                const scopedActive = focusedGroupId
                  ? activeNodes.filter(
                      (n) =>
                        n.parentId === focusedGroupId ||
                        isDescendantOf(n.id, focusedGroupId, nodeMap),
                    )
                  : activeNodes;
                const scopedDoneIds = focusedGroupId
                  ? completedNodeIds.filter((id) => {
                      const dn = playableMap.get(id);
                      return Boolean(
                        dn &&
                          dn.kind !== 'group' &&
                          (dn.parentId === focusedGroupId ||
                            isDescendantOf(dn.id, focusedGroupId, nodeMap)),
                      );
                    })
                  : [];
                if (scopedActive.length === 0 && scopedDoneIds.length === 0) {
                  return unlockedGroupIds.length > 0 ? (
                    <div className="text-[11px] text-[#64748B]">{t.noActiveMechInGroup}</div>
                  ) : null;
                }
                return (
                  <div className="space-y-1">
                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B] flex items-center justify-between">
                      <span>{t.mechanismsLabel}</span>
                      <span className="font-mono tabular-nums font-normal">
                        {scopedActive.length} {t.mechanismReady}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {scopedActive.map((mNode) => {
                        const isFocused = primaryNode?.id === mNode.id;
                        const label =
                          mNode.note.trim() ||
                          mNode.title.trim() ||
                          COPY[lang].studio.board[
                            mNode.kind === 'challenge'
                              ? 'patternLabel'
                              : mNode.kind === 'dialogue'
                                ? 'speakerLabel'
                                : 'title'
                          ];
                        return (
                          <button
                            key={mNode.id}
                            type="button"
                            onClick={() => handleFocusActiveNode(mNode.id)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                              isFocused
                                ? 'bg-[#EFF6FF] border-[#2563EB] text-[#1D4ED8]'
                                : 'bg-white border-[#CBD5E1] text-[#334155] hover:border-[#2563EB]'
                            }`}
                          >
                            <span className="truncate max-w-[155px]">{label}</span>
                          </button>
                        );
                      })}
                      {scopedDoneIds.slice(-3).map((dId) => {
                        const dn = playableMap.get(dId);
                        if (!dn || dn.kind === 'outcome') return null;
                        return (
                          <span
                            key={`done-${dId}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8] text-[10.5px] font-medium whitespace-nowrap"
                          >
                            <Check className="w-2.5 h-2.5 text-[#10B981] shrink-0" aria-hidden="true" />
                            <span className="truncate max-w-[110px]">
                              {dn.note.trim() || dn.title.trim()}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

        {/* Simulated Special Events (◇) Switchboard */}
        {simulatedEventList.length > 0 && (
          <div className="px-3 py-2 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] space-y-1.5">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#B45309]">
              {t.simEventsBar}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {simulatedEventList.map((evt) => {
                const active = Boolean(simulatedEvents[evt.key]);
                return (
                  <button
                    key={evt.key}
                    type="button"
                    onClick={() =>
                      setSimulatedEvents((prev) => ({ ...prev, [evt.key]: !prev[evt.key] }))
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#ECFDF5] border-[#10B981] text-[#047857]'
                        : 'bg-white border-[#FCD34D] text-[#92400E] hover:border-[#D97706]'
                    }`}
                  >
                    <span>◇ {evt.label}</span>
                    <span className="font-mono text-[10px]">
                      · {active ? t.simTriggered : t.simIdle}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Custom Text-Condition Switchboard */}
        {customFlagNames.length > 0 && (
          <div className="px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1.5">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
              {t.conditionsBar}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {customFlagNames.map((flag) => {
                const active = Boolean(customFlags[flag]);
                return (
                  <button
                    key={flag}
                    type="button"
                    onClick={() =>
                      setCustomFlags((prev) => ({ ...prev, [flag]: !prev[flag] }))
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#ECFDF5] border-[#10B981] text-[#047857]'
                        : 'bg-white border-[#CBD5E1] text-[#64748B] hover:border-[#14244B]'
                    }`}
                  >
                    <span>{flag}</span>
                    <span className="font-mono text-[10px]">
                      · {active ? t.condTrue : t.condFalse}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Controls Section */}
        {playMode === 'preview' ? (
          previewSnapshot.actions.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
                {t.previewControls}
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {previewSnapshot.actions.map((actionNode) => {
                  const cfg = resolveActionConfig(actionNode);
                  return (
                    <div
                      key={actionNode.id}
                      className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-[#E0F2FE] text-[#0369A1] flex items-center justify-center shrink-0">
                          {renderActionIcon(cfg.mechanic)}
                        </span>
                        <span className="text-xs font-semibold text-[#14244B] truncate">
                          {actionNode.note || cfg.mechanic}
                        </span>
                      </div>
                      <kbd className="px-1.5 py-0.5 rounded bg-white border border-[#CBD5E1] font-mono text-[10px] font-bold text-[#475569] shrink-0">
                        {cfg.keyBinding}
                      </kbd>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : phase === 'live' ? (
          <div className="space-y-2">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#0369A1]">
              {t.chooseAction}
            </div>
            {liveActionControls.length > 0 ? (
              <div className="grid grid-cols-1 gap-1.5">
                {liveActionControls.map((ctrl) => {
                  const locked = !ctrl.evaluation.passed;
                  return (
                    <button
                      key={ctrl.id}
                      type="button"
                      disabled={locked}
                      onClick={() => performLiveAction(ctrl)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                        locked
                          ? 'bg-[#F8FAFC] border-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
                          : 'bg-[#F0F9FF] border-[#7DD3FC] hover:border-[#0284C7] hover:bg-[#E0F2FE] text-[#14244B] active:scale-[0.98] cursor-pointer shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                            locked
                              ? 'bg-[#E2E8F0] text-[#94A3B8]'
                              : 'bg-[#0284C7] text-white'
                          }`}
                        >
                          {locked ? (
                            <Lock className="w-3 h-3" aria-hidden="true" />
                          ) : (
                            renderActionIcon(ctrl.mechanic)
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate">
                            {ctrl.target.note || ctrl.mechanic}
                            {ctrl.ownerLabel && (
                              <span className="ml-1.5 font-normal text-[10.5px] text-[#64748B]">
                                · {ctrl.ownerLabel}
                              </span>
                            )}
                          </div>
                          {ctrl.evaluation.hasCondition && (
                            <div
                              className={`text-[10px] font-medium truncate ${
                                locked ? 'text-[#94A3B8]' : 'text-[#047857]'
                              }`}
                            >
                              {locked ? `${t.requiresPrefix}: ` : 'if '}
                              {ctrl.evaluation.raw}
                            </div>
                          )}
                        </div>
                      </div>

                      <kbd
                        className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold shrink-0 ${
                          locked
                            ? 'bg-[#E2E8F0] text-[#94A3B8]'
                            : 'bg-white border border-[#BAE6FD] text-[#0369A1]'
                        }`}
                      >
                        {ctrl.keyLabel}
                      </kbd>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[#64748B]">{t.noControlsHint}</p>
            )}
          </div>
        ) : null}

        {/* Quiet Context Footer */}
        <p className="mt-auto pt-2 text-[11px] text-[#64748B] leading-relaxed">
          {playMode === 'playing' ? t.liveHint : t.previewHint}
        </p>
      </div>
    </aside>
  );
}
