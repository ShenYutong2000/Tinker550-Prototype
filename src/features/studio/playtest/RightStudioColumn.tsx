import { StageTimeline, type TimelineCursor, type TimelineEntry } from './StageTimeline';
import { StageEffectTimeline } from './StageEffectControls';
import { StageEffectLayer, TimelineEffectFrame } from './StageEffectLayer';
import { DEFAULT_STAGE_EFFECT, StageEffectScheduler, effectEntries, eventEffects, type EffectOccurrence, type EffectPoint, type EffectTrigger } from './stageEffects';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  Heart,
  Lock,
  MessageSquareQuote,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Pause,
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
  INITIAL_PLAY_STATS,
  collectNumericBoardParameters,
  computeLoopEdgeIds,
  detectUsedStats,
  extractCustomFlagConditions,
  findStartNodeId,
  getEvaluatedOutgoing,
  getPlayableNodes,
  resolveActionConfig,
  resolveChallengeConfig,
  resolveDialogueContent,
  resolveOutcomeConfig,
  resolvePlaybackSettings,
  resolveSceneTheme,
  resolveSubtitlePosition,
  type ChallengeDirection,
  type ConditionEvaluation,
  type PlayStats,
} from './boardPlayEngine';
import { COPY, type Language } from '../../../shared/i18n';
import {
  applyOutcomePropertyRule,
  clampNumberValue,
  formatVariableValue,
  type ScopedStateVariable,
  type StateVariableValue,
} from '../properties/stateModel';
import {
  getNodeAssetIds,
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

import { StagePlacementEditor, type PlacementItem } from './StagePlacementEditor';
import {
  WORLD_W, WORLD_H, HERO_BASE_X, GROUND_Y, HERO_POSE, DECORATION_POSE, EMPTY_STAGE_LAYOUT,
  challengeId, challengePose, stageBounds, stagePoint, editedStagePosition, stageLayoutChanges,
  cardOverlayId, getStagePlacement, type StageEditorSection,
  applyStageLayoutChanges, type LayoutChange, type StageLayout, type StagePlacement, type StagePose,
} from './stageLayout';

import {
  applyStageMoments, arrangeMoments, dueMoments, momentSecond, readMomentValue, upsertMoment,
  type MomentClock, type MomentEdit, type MomentTiming, type MomentValue, type StageMoment,
} from './stageMoments';
import { StageMomentList } from './StageMomentList';

type TrialSnapshot = { current: StageLayout; edits: MomentEdit[] };
const INITIAL_CLOCK: MomentClock = { runMs: 0, cardMs: 0 };
const EMPTY_TRIAL: TrialSnapshot = { current: EMPTY_STAGE_LAYOUT, edits: [] };

interface RightStudioColumnProps {
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
  onLocateCard: (id: string) => void;
  onStageCardsChange: (ids: string[]) => void;
  onOpenAsset: (id: string) => void;
  appearanceReset: { target: string } | null;
  onActivePlayChange: (nodeIds: string[], edgeId: string | null) => void;
  onUserTestedInPlay: () => void;
  onUpdatePlayValue: (variableId: string, value: StateVariableValue) => void;
  onResetPlayValues: () => void;
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

function drawChallengeEntity(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  visual: ChallengeVisual,
  time: number,
  spriteImg: HTMLImageElement | null,
  rotateDir: -1 | 0 | 1,
  baked: { canvas: HTMLCanvasElement; padRatio: number } | null = null,
  effects?: VisualEffectItem[],
  sizeOverride?: Partial<StagePose>,
) {
  ctx.save();
  const naturalSize = radius * 2.5;
  if (sizeOverride?.width !== undefined || sizeOverride?.height !== undefined) {
    ctx.translate(x, y);
    ctx.scale((sizeOverride.width ?? naturalSize) / naturalSize, (sizeOverride.height ?? naturalSize) / naturalSize);
    ctx.translate(-x, -y);
  }
  if (spriteImg) {
    const size = radius * 2.5;
    drawSpriteWithEffects(
      ctx,
      spriteImg,
      baked,
      x,
      y,
      size,
      size,
      effects,
      time,
      rotateDir !== 0 ? rotateDir * time * 5.0 : 0,
      1,
    );
    ctx.restore();
    return;
  }

  if (visual === 'coin') {
    const glow = ctx.createRadialGradient(x, y, 2, x, y, 22);
    glow.addColorStop(0, 'rgba(251, 197, 61, 0.85)');
    glow.addColorStop(1, 'rgba(251, 197, 61, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();

    const squeeze = 0.72 + 0.28 * Math.abs(Math.cos(time * 4));
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.ellipse(x, y, 10 * squeeze, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.ellipse(x, y, 5.5 * squeeze, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (visual === 'rock') {
    ctx.translate(x, y);
    if (rotateDir !== 0) ctx.rotate(rotateDir * time * 3.2);
    ctx.fillStyle = '#64748B';
    ctx.beginPath();
    ctx.moveTo(-12, -5);
    ctx.lineTo(-4, -13);
    ctx.lineTo(9, -10);
    ctx.lineTo(13, 2);
    ctx.lineTo(5, 12);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(-3, -2, 3, 0, Math.PI * 2);
    ctx.arc(5, 4, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (visual === 'creature') {
    const squish = Math.sin(time * 6) * 2;
    ctx.fillStyle = '#8B5CF6';
    ctx.beginPath();
    ctx.roundRect(x - 13, y - 10 - squish * 0.5, 26, 20 + squish * 0.5, [12, 12, 5, 5]);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x - 4.5, y - 2, 3.2, 0, Math.PI * 2);
    ctx.arc(x + 4.5, y - 2, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(x - 5.2, y - 2, 1.5, 0, Math.PI * 2);
    ctx.arc(x + 3.8, y - 2, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (visual === 'spike') {
    ctx.fillStyle = '#E11D48';
    for (let offset = -10; offset <= 10; offset += 10) {
      ctx.beginPath();
      ctx.moveTo(x + offset - 5, y + 10);
      ctx.lineTo(x + offset, y - 11);
      ctx.lineTo(x + offset + 5, y + 10);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // Default glowing fireball / spark
    const glow = ctx.createRadialGradient(x, y, 3, x, y, 22);
    glow.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
    glow.addColorStop(0.55, 'rgba(249, 115, 22, 0.85)');
    glow.addColorStop(1, 'rgba(249, 115, 22, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawStageBackdrop(
  ctx: CanvasRenderingContext2D,
  theme: SceneTheme,
  worldW: number,
  worldH: number,
  groundY: number,
  time: number,
  flare: number,
  bgImg: HTMLImageElement | null,
  bgBaked: { canvas: HTMLCanvasElement; padRatio: number } | null = null,
  bgEffects?: VisualEffectItem[],
) {
  if (theme === 'meadow') {
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#60A5FA');
    sky.addColorStop(1, '#DBEAFE');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, worldW, worldH);

    // Sun
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(308, 42, 18, 0, Math.PI * 2);
    ctx.fill();

    // Soft clouds
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const drift = (time * 8) % (worldW + 80);
    [60, 210].forEach((cx, idx) => {
      const x = ((cx + drift) % (worldW + 80)) - 40;
      const y = idx === 0 ? 44 : 68;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.arc(x + 14, y - 4, 16, 0, Math.PI * 2);
      ctx.arc(x + 28, y, 12, 0, Math.PI * 2);
      ctx.fill();
    });

    // Distant hills
    ctx.fillStyle = '#86EFAC';
    ctx.beginPath();
    ctx.ellipse(90, groundY, 130, 38, 0, Math.PI, Math.PI * 2);
    ctx.ellipse(280, groundY, 150, 48, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    if (bgImg) {
      drawSpriteWithEffects(
        ctx,
        bgImg,
        bgBaked,
        worldW / 2,
        groundY / 2,
        worldW,
        groundY,
        bgEffects,
        time,
        0,
        0.35,
      );
    }

    // Grassy ground
    ctx.fillStyle = '#16A34A';
    ctx.fillRect(0, groundY, worldW, 7);
    ctx.fillStyle = '#78350F';
    ctx.fillRect(0, groundY + 7, worldW, worldH - groundY - 7);
    return;
  }

  if (theme === 'space') {
    const sky = ctx.createLinearGradient(0, 0, 0, worldH);
    sky.addColorStop(0, '#020617');
    sky.addColorStop(1, '#1E1B4B');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, worldW, worldH);

    // Nebula glow
    const neb = ctx.createRadialGradient(110, 80, 10, 110, 80, 110);
    neb.addColorStop(0, 'rgba(139, 92, 246, 0.32)');
    neb.addColorStop(1, 'rgba(139, 92, 246, 0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, worldW, groundY);

    // Stars
    for (let i = 0; i < 18; i++) {
      const sx = (i * 53 + 17) % worldW;
      const sy = (i * 29 + 11) % (groundY - 24);
      const twinkle = 0.35 + 0.65 * Math.sin(time * 2.8 + i);
      ctx.fillStyle = `rgba(224, 242, 254, ${twinkle.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, i % 3 === 0 ? 1.6 : 1.0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ringed planet
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(296, 52, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(296, 52, 28, 7, -0.25, 0, Math.PI * 2);
    ctx.stroke();

    if (bgImg) {
      drawSpriteWithEffects(
        ctx,
        bgImg,
        bgBaked,
        worldW / 2,
        groundY / 2,
        worldW,
        groundY,
        bgEffects,
        time,
        0,
        0.25,
      );
    }

    // Starship deck floor
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(0, groundY, worldW, worldH - groundY);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(0, groundY, worldW, 3);
    return;
  }

  if (theme === 'ocean') {
    const sea = ctx.createLinearGradient(0, 0, 0, worldH);
    sea.addColorStop(0, '#0284C7');
    sea.addColorStop(0.7, '#0369A1');
    sea.addColorStop(1, '#0C4A6E');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, worldW, worldH);

    // Rising bubbles
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 8; i++) {
      const bx = 35 + i * 44;
      const by = groundY - (((time * 24 + i * 31) % (groundY - 12)) + 8);
      ctx.beginPath();
      ctx.arc(bx + Math.sin(time * 2 + i) * 4, by, 2.5 + (i % 3), 0, Math.PI * 2);
      ctx.stroke();
    }

    if (bgImg) {
      drawSpriteWithEffects(
        ctx,
        bgImg,
        bgBaked,
        worldW / 2,
        groundY / 2,
        worldW,
        groundY,
        bgEffects,
        time,
        0,
        0.28,
      );
    }

    // Sandy floor
    ctx.fillStyle = '#EAB308';
    ctx.fillRect(0, groundY, worldW, 6);
    ctx.fillStyle = '#CA8A04';
    ctx.fillRect(0, groundY + 6, worldW, worldH - groundY - 6);
    return;
  }

  if (theme === 'cavern') {
    const cav = ctx.createLinearGradient(0, 0, 0, worldH);
    cav.addColorStop(0, '#1C1917');
    cav.addColorStop(0.65, '#431407');
    cav.addColorStop(1, '#7C2D12');
    ctx.fillStyle = cav;
    ctx.fillRect(0, 0, worldW, worldH);

    if (bgImg) {
      drawSpriteWithEffects(
        ctx,
        bgImg,
        bgBaked,
        worldW / 2,
        groundY / 2,
        worldW,
        groundY,
        bgEffects,
        time,
        0,
        0.25,
      );
    }

    ctx.fillStyle = '#44403C';
    ctx.fillRect(0, groundY, worldW, worldH - groundY);
    ctx.fillStyle = '#EA580C';
    ctx.fillRect(0, groundY, worldW, 3);
    return;
  }

  if (theme === 'night') {
    const sky = ctx.createLinearGradient(0, 0, 0, worldH);
    sky.addColorStop(0, '#0B132B');
    sky.addColorStop(0.65, '#1C2E59');
    sky.addColorStop(1, '#263D73');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, worldW, worldH);

    if (bgImg) {
      drawSpriteWithEffects(
        ctx,
        bgImg,
        bgBaked,
        worldW / 2,
        groundY / 2,
        worldW,
        groundY,
        bgEffects,
        time,
        0,
        0.3,
      );
    }

    const stars = [
      [42, 28],
      [98, 44],
      [168, 22],
      [232, 36],
      [295, 24],
      [334, 52],
    ];
    stars.forEach(([sx, sy], idx) => {
      const twinkle = 0.45 + 0.55 * Math.sin(time * 2.4 + idx * 1.3);
      ctx.fillStyle = `rgba(254, 243, 199, ${twinkle.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.4, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.arc(312, 42, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#142347';
    ctx.beginPath();
    ctx.arc(318, 38, 12, 0, Math.PI * 2);
    ctx.fill();

    // Warm lanterns
    const lanterns = [62, 162, 262];
    lanterns.forEach((lx, idx) => {
      const sway = Math.sin(time * 2 + idx) * 2.5;
      const ly = 50 + Math.sin((lx / worldW) * Math.PI) * 8;
      const glowR = 18 + flare * 22;
      const grad = ctx.createRadialGradient(lx + sway, ly + 7, 2, lx + sway, ly + 7, glowR);
      grad.addColorStop(0, `rgba(251, 197, 61, ${Math.min(0.9, 0.45 + flare * 0.4)})`);
      grad.addColorStop(1, 'rgba(251, 197, 61, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(lx + sway, ly + 7, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.roundRect(lx + sway - 5, ly, 10, 14, 4);
      ctx.fill();
    });

    ctx.fillStyle = '#334155';
    ctx.fillRect(0, groundY, worldW, worldH - groundY);
    ctx.fillStyle = '#64748B';
    ctx.fillRect(0, groundY, worldW, 4);
    return;
  }

  // Default Neutral Clean Studio Stage (zero pre-baked Lantern Bridge clutter!)
  const bg = ctx.createLinearGradient(0, 0, 0, worldH);
  bg.addColorStop(0, '#1E293B');
  bg.addColorStop(1, '#334155');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, worldW, worldH);

  if (bgImg) {
    drawSpriteWithEffects(
      ctx,
      bgImg,
      bgBaked,
      worldW / 2,
      groundY / 2,
      worldW,
      groundY,
      bgEffects,
      time,
      0,
      0.45,
    );
  }

  // Subtle geometric studio grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let gx = 36; gx < worldW; gx += 36) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, groundY);
    ctx.stroke();
  }
  for (let gy = 36; gy < groundY; gy += 36) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(worldW, gy);
    ctx.stroke();
  }

  // Clean crisp ground platform
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, groundY, worldW, worldH - groundY);
  ctx.fillStyle = '#475569';
  ctx.fillRect(0, groundY, worldW, 4);
}

export function RightStudioColumn({
  lang,
  isOpen,
  width,
  spotlightStage,
  nodes,
  edges,
  assetItems,
  scopedVariables,
  selectedNodeId: boardSelectionId,
  onToggle,
  onActivePlayChange,
  onUserTestedInPlay,
  onUpdatePlayValue,
  onResetPlayValues,
  onLocateCard,
  onStageCardsChange,
  onOpenAsset,
  appearanceReset,
}: RightStudioColumnProps) {
  const t = COPY[lang].studio.play;
  const st = COPY[lang].studio.states;
  const isDimmed = spotlightStage === 'focus-build';
  const isSpotlighted = spotlightStage === 'focus-play';

  const playableNodes = useMemo(() => getPlayableNodes(nodes), [nodes]);
  const playableMap = useMemo(
    () => new Map(playableNodes.map((n) => [n.id, n])),
    [playableNodes],
  );
  const loopEdgeIds = useMemo(() => computeLoopEdgeIds(nodes, edges), [nodes, edges]);
  const startNodeId = useMemo(() => findStartNodeId(nodes, edges), [nodes, edges]);
  const customFlagNames = useMemo(
    () => extractCustomFlagConditions(nodes, edges, scopedVariables),
    [nodes, edges, scopedVariables],
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
  const [layoutHistory, setLayoutHistory] = useState<{ current: StageLayout; undo: StageLayout[] }>({
    current: EMPTY_STAGE_LAYOUT, undo: [],
  });
  const [layoutSelection, setLayoutSelection] = useState('');
  const [editorSection, setEditorSection] = useState<StageEditorSection>('card');
  const [editorCard, setEditorCard] = useState<string | null>(null);
  const selectedNodeId = editorCard ?? boardSelectionId;
  useEffect(() => {
    setEditorCard(null);
    setLayoutSelection('');
  }, [boardSelectionId]);
  const [runChallengeId, setRunChallengeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; pose: Partial<StagePose> } | null>(null);
  const [trialHistory, setTrialHistory] = useState<TrialSnapshot & { undo: TrialSnapshot[] }>({
    ...EMPTY_TRIAL, undo: [],
  });
  const [moments, setMoments] = useState<StageMoment[]>([]);
  const [visibleMoments, setVisibleMoments] = useState<StageMoment[]>([]);
  const scheduledRef = useRef<StageMoment[]>([]);
  const visibleRef = useRef<StageMoment[]>([]);
  const visitRef = useRef<{ id?: string; atMs: number }>({ atMs: 0 });
  const [clock, setClock] = useState(INITIAL_CLOCK);
  const frameClockRef = useRef(INITIAL_CLOCK);
  const [timings, setTimings] = useState<Record<string, MomentTiming>>({});
  const [editTab, setEditTab] = useState<'arrange' | 'interface' | 'effects' | 'moments'>('arrange');
  const [timelineCursor, setTimelineCursor] = useState<TimelineCursor | null>(null);
  const [timelineDetail, setTimelineDetail] = useState<string | null>(null);
  const effectScheduler = useRef(new StageEffectScheduler());
  const [effectOccurrences, setEffectOccurrences] = useState<EffectOccurrence[]>([]);
  const effectSequence = useRef(0);
  const effectEventRef = useRef<(trigger: EffectTrigger, point: EffectPoint, cardIds?: string[]) => void>(() => {});
  const effectTimeRef = useRef(0);
  const readEffectRunTime = useCallback(() => effectTimeRef.current, []);
  const readEffectPreviewTime = useCallback(() => performance.now(), []);
  const editSequence = useRef(0);
  const [loadingBackgrounds, setLoadingBackgrounds] = useState(false);
  const [failedBackgrounds, setFailedBackgrounds] = useState<string[]>([]);
  const startRequest = useRef(0);
  useEffect(() => () => { ++startRequest.current; }, []);
  const backgroundImages = useRef(new Map<string, HTMLImageElement>());
  const backgroundLoads = useRef(new Map<string, Promise<boolean>>());
  const currentBinding = useRef(getAssetVisualBinding);
  currentBinding.current = getAssetVisualBinding;
  const loadBackground = useCallback((url: string) => {
    if (backgroundImages.current.has(url)) return Promise.resolve(true);
    const existing = backgroundLoads.current.get(url);
    if (existing) return existing;
    const loading = new Promise<boolean>(resolve => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      const finish = (ready: boolean) => {
        window.clearTimeout(timeout);
        image.onload = image.onerror = null;
        if (ready) backgroundImages.current.set(url, image);
        resolve(ready);
      };
      const timeout = window.setTimeout(() => finish(false), 4000);
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = url;
    });
    backgroundLoads.current.set(url, loading);
    void loading.then(() => backgroundLoads.current.delete(url));
    return loading;
  }, []);
  const clearStageAppearance = useCallback((id: string) => {
    const clear = (layout: StageLayout): StageLayout => {
      const placement = layout.placements[id];
      if (placement?.assetId === undefined) return layout;
      return { ...layout, placements: { ...layout.placements, [id]: { ...placement, assetId: undefined } } };
    };
    setLayoutHistory(previous => ({ current: clear(previous.current), undo: previous.undo.map(clear) }));
    setTrialHistory(previous => ({
      ...previous,
      current: clear(previous.current),
      undo: previous.undo.map(snapshot => ({ ...snapshot, current: clear(snapshot.current) })),
    }));
  }, []);
  useEffect(() => {
    if (appearanceReset) clearStageAppearance(appearanceReset.target);
  }, [clearStageAppearance, appearanceReset]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const pauseLayoutRef = useRef<StageLayout | null>(null);
  const [review, setReview] = useState<'save' | 'restart' | 'stop' | null>(null);
  const [checkedChanges, setCheckedChanges] = useState<string[]>([]);
  const [savedNotice, setSavedNotice] = useState(false);
  const reviewDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (review && isOpen && !reviewDialogRef.current?.open) reviewDialogRef.current?.showModal();
  }, [review, isOpen]);
  const playing = playMode === 'playing';
  const timelineActive = isOpen && editTab === 'moments' && (!playing || paused);
  const viewingTimeline = timelineActive ? timelineCursor : null;
  useEffect(() => {
    if (!timelineActive) { setTimelineCursor(null); setTimelineDetail(null); }
  }, [timelineActive]);
  const base = playing ? trialHistory.current : layoutHistory.current;
  const edits = playing ? trialHistory.edits : EMPTY_TRIAL.edits;
  const layout = useMemo(() => applyStageMoments(applyStageMoments(base, visibleMoments), edits),
    [base, visibleMoments, edits]);
  const layoutRef = useRef({ layout, base, edits, draft, selection: layoutSelection });
  layoutRef.current = { layout, base, edits, draft, selection: layoutSelection };
  const changes = useMemo(
    () => stageLayoutChanges(layoutHistory.current, trialHistory.current),
    [layoutHistory.current, trialHistory.current],
  );
  const pendingEdits = trialHistory.edits.filter(edit => !edit.confirmed);
  const dirty = changes.length > 0 || pendingEdits.length > 0;
  const fireEffectsRef = useRef<(entries: ReturnType<typeof effectEntries>, point: EffectPoint, preview: boolean) => void>(() => {});
  fireEffectsRef.current = (entries, point, preview) => {
    const occurrences = entries.filter(([, placement]) => assetItems.some(asset => asset.id === placement.assetId && asset.categoryId === 'effects')).map(([, placement]) => {
      const anchor = placement.effect!.anchor;
      return { key: 'effect-play:' + (++effectSequence.current), placement,
        point: anchor === 'fixed' ? {x: placement.x ?? 180, y: placement.y ?? 125} : anchor === 'hero' ? {x:simRef.current.heroX,y:simRef.current.heroY-22} : point,
        at: preview ? performance.now() : effectTimeRef.current, preview };
    });
    if (occurrences.length) setEffectOccurrences(previous => [...previous.slice(-49), ...occurrences]);
  };
  effectEventRef.current = (trigger, point, cardIds = []) => {
    const challengeCard = hazardLayoutId.current?.replace(/^challenge:/, '');
    const ids = [...cardIds, ...(visitRef.current.id ? [visitRef.current.id] : []), ...(challengeCard ? [challengeCard] : [])];
    fireEffectsRef.current(eventEffects(layoutRef.current.layout, trigger, ids), point, trigger === 'victory');
  };
  const previewHits = useRef<{ id: string; pose: StagePose }[]>([]);
  const composedItemsRef = useRef<PlacementItem[]>([]);
  const hazardLayoutId = useRef<string | null>(null);
  const commitLayout = (change: (current: StageLayout) => StageLayout) => {
    setSavedNotice(false);
    if (playing) {
      setTrialHistory(prev => ({ ...prev, current: change(prev.current),
        undo: [...prev.undo.slice(-49), { current: prev.current, edits: prev.edits }] }));
    } else {
      setLayoutHistory(prev => ({ current: change(prev.current), undo: [...prev.undo.slice(-49), prev.current] }));
    }
  };
  const recordMoment = (target: string, change: MomentValue) => {
    if (change.field === 'background' && change.value.color === layout.background.color &&
      change.value.assetId === layout.background.assetId) return;
    setSavedNotice(false);
    const stamp = readClock();
    const id = 'moment:' + (++editSequence.current);
    const before = readMomentValue(layout, target, change.field);
    setTrialHistory(prev => {
      const last = prev.edits[prev.edits.length - 1];
      const replace = last && !last.confirmed && last.target === target && last.field === change.field &&
        last.clock.runMs === stamp.runMs && last.clock.cardId === stamp.cardId;
      const value = change.field === 'size' && replace && last.field === 'size'
        ? { ...change, value: { ...last.value, ...change.value } } : change;
      const edit = { ...value, id: replace ? last.id : id, target, before: replace ? last.before : before, clock: stamp };
      return { ...prev, edits: [...(replace ? prev.edits.slice(0, -1) : prev.edits), edit],
        undo: [...prev.undo.slice(-49), { current: prev.current, edits: prev.edits }] };
    });
  };
  const updatePlacement = (id: string, patch: StagePlacement) => {
    if (playing && !id.startsWith('effect:') && !id.startsWith('interface:') && !id.startsWith('overlay:') &&
      (!id.startsWith('decoration:') || layoutHistory.current.decorations.includes(id)) &&
      (patch.width !== undefined || patch.height !== undefined)) {
      const value = {
        ...(patch.width !== undefined && patch.width !== layout.placements[id]?.width ? { width: patch.width } : {}),
        ...(patch.height !== undefined && patch.height !== layout.placements[id]?.height ? { height: patch.height } : {}),
      };
      if (Object.keys(value).length) recordMoment(id, { field: 'size', value });
      return;
    }
    commitLayout(current => ({
      ...current,
      placements: { ...current.placements, [id]: { ...current.placements[id], ...patch } },
    }));
  };
  const [activeNodeIds, setActiveNodeIds] = useState<string[]>([]);
  const [lastEdgeId, setLastEdgeId] = useState<string | null>(null);
  const [stats, setStats] = useState<PlayStats>(INITIAL_PLAY_STATS);
  const [customFlags, setCustomFlags] = useState<Record<string, boolean>>({});
  const [waveNumber, setWaveNumber] = useState(1);
  const [phase, setPhase] = useState<StagePhase>('overlay');
  const [hudToast, setHudToast] = useState<{
    text: string;
    tone: 'celebrate' | 'hurt' | 'victory' | 'defeat' | 'neutral';
  } | null>(null);
  const [endSummary, setEndSummary] = useState<{
    text: string;
    tone: 'victory' | 'defeat' | 'neutral';
  } | null>(null);

  const actionsByChallenge = useMemo(() => {
    const result = new Map<string, BoardNode[]>();
    for (const edge of edges) {
      if (playableMap.get(edge.fromId)?.kind !== 'challenge') continue;
      const action = playableMap.get(edge.toId);
      if (action?.kind !== 'action') continue;
      const actions = result.get(edge.fromId) ?? [];
      if (!actions.some(node => node.id === action.id)) actions.push(action);
      result.set(edge.fromId, actions);
    }
    return result;
  }, [edges, playableMap]);
  const challengesForAction = useCallback((actionId: string) => {
    const found = new Set<string>();
    const visited = new Set<string>();
    const pending = [actionId];
    while (pending.length) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const edge of edges) {
        if (edge.toId !== current) continue;
        const source = playableMap.get(edge.fromId);
        if (source?.kind === 'challenge') found.add(source.id);
        if (source?.kind === 'action') pending.push(source.id);
      }
    }
    return [...found];
  }, [edges, playableMap]);
  const previewSnapshot = useMemo(() => {
    const selectedNode = (selectedNodeId && playableMap.get(selectedNodeId)) ||
      (startNodeId && playableMap.get(startNodeId)) || null;
    const narration = selectedNode?.kind === 'narration' ? selectedNode : null;
    const dialogue = selectedNode?.kind === 'dialogue' ? selectedNode : null;
    const challenge = selectedNode?.kind === 'challenge' ? selectedNode :
      selectedNode?.kind === 'action' ? playableMap.get(challengesForAction(selectedNode.id)[0]) ?? null : null;
    const outcome = selectedNode?.kind === 'outcome' ? selectedNode : null;
    const narrationPos = narration ? resolveSubtitlePosition(narration) : 'bottom';
    const themeCard = narration ?? playableNodes.find(node => node.kind === 'narration');
    return {
      selectedNode, narration, dialogue, challenge, outcome, narrationPos,
      sceneTheme: themeCard ? resolveSceneTheme(themeCard) : 'neutral' as const,
      challengeCfg: challenge ? resolveChallengeConfig(challenge) : null,
      outcomeCfg: outcome ? resolveOutcomeConfig(outcome) : null,
      actions: challenge ? actionsByChallenge.get(challenge.id) ?? [] : selectedNode?.kind === 'action' ? [selectedNode] : [],
      showHero: Boolean(challenge || dialogue || selectedNode?.kind === 'action'),
    };
  }, [actionsByChallenge, challengesForAction, playableMap, playableNodes, selectedNodeId, startNodeId]);

  const challengeRole = useCallback((id: string | null | undefined) => {
    const actions = id ? actionsByChallenge.get(id) ?? [] : [];
    const actors = new Set(actions.map(action =>
      action.promptInput?.actorAssetId ?? getNodeAssetIds(action).find(assetId => assetMap.get(assetId)?.categoryId === 'characters')
    ).filter((id): id is string => Boolean(id && assetMap.get(id)?.categoryId === 'characters')));
    return { actions, actorId: actors.size === 1 ? [...actors][0] : undefined, conflict: actors.size > 1 };
  }, [actionsByChallenge, assetMap]);

  const getNodeVisualBindingByCategories = useCallback(
    (
      node: BoardNode | null | undefined,
      preferredCategories: AssetCategoryId[],
      strictCategories = false,
    ) => {
      if (!node) return null;
      const ids = getNodeAssetIds(node);
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

  // Only load bound character sprite when explicitly bound or selected by the student
  const characterBinding = useMemo(() => {
    const override = getAssetVisualBinding(layout.placements.hero?.assetId);
    if (override) return override;
    const role = challengeRole(playing ? runChallengeId : previewSnapshot.challenge?.id);
    const challengeActor = getAssetVisualBinding(role.actorId);
    if (challengeActor) return challengeActor;
    const resolveCharacterFromNode = (node: BoardNode) => {
      const boundIds = getNodeAssetIds(node);
      const boundCharId = boundIds.find(
        (id) => assetMap.get(id)?.categoryId === 'characters' && id !== node.challengeAssetId,
      );
      if (boundCharId) {
        const binding = getAssetVisualBinding(boundCharId);
        if (binding) return binding;
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

    const prioritized = playableNodes.filter((n) =>
      playMode === 'playing' ? activeNodeIds.includes(n.id) : n.id === selectedNodeId,
    );
    for (const node of [...prioritized, ...playableNodes]) {
      if (node.kind !== 'action') continue;
      const actor = getAssetVisualBinding(node.promptInput?.actorAssetId);
      if (actor) return actor;
    }
    for (const node of prioritized) {
      const binding = resolveCharacterFromNode(node);
      if (binding) return binding;
    }
    for (const node of playableNodes) {
      const binding = resolveCharacterFromNode(node);
      if (binding) return binding;
    }
    return null;
  }, [
    activeNodeIds,
    challengeRole, playing, runChallengeId, previewSnapshot.challenge?.id,
    layout.placements.hero?.assetId,
    assetItems,
    assetMap,
    getAssetVisualBinding,
    playMode,
    playableNodes,
    selectedNodeId,
  ]);

  const cardBackgroundSource = useMemo(() => {
    const hasBgAsset = (n: BoardNode) =>
      getNodeAssetIds(n).some((id) => assetMap.get(id)?.categoryId === 'backgrounds');

    const activeMatch = playableNodes.find(
      (n) =>
        (playMode === 'playing'
          ? activeNodeIds.includes(n.id)
          : n.id === selectedNodeId) && hasBgAsset(n),
    );
    if (activeMatch) {
      return activeMatch;
    }
    const narrationOrChallenge =
      playableNodes.find((n) => n.kind === 'narration' && hasBgAsset(n)) ??
      playableNodes.find((n) => n.kind === 'challenge' && hasBgAsset(n)) ??
      playableNodes.find((n) => hasBgAsset(n));
    return narrationOrChallenge;
  }, [
    activeNodeIds,
    assetMap,
    getNodeVisualBindingByCategories,
    playMode,
    playableNodes,
    selectedNodeId,
  ]);
  const timelineCard = viewingTimeline?.cardId && playableNodes.find(node => node.id === viewingTimeline.cardId);
  const timelineBackground = timelineCard
    ? getNodeVisualBindingByCategories(timelineCard, ['backgrounds'], true) ??
      getNodeVisualBindingByCategories(playableNodes.find(node =>
        getNodeAssetIds(node).some(id => assetMap.get(id)?.categoryId === 'backgrounds')), ['backgrounds'], true)
    : null;
  const timelineUsesVisit = Boolean(viewingTimeline?.cardId && paused && viewingTimeline.cardId === clock.cardId);
  const selectedTime = viewingTimeline?.atMs ?? 0;
  const timelineTime = selectedTime - (viewingTimeline?.before ? 1 : 0);
  const timelineRunTime = timelineTime + (timelineUsesVisit ? clock.runMs - clock.cardMs : 0);
  const timelineLayout = viewingTimeline ? applyStageMoments(layoutHistory.current,
    dueMoments(arrangeMoments(moments), { runMs: timelineRunTime, cardMs: timelineTime, cardId: viewingTimeline.cardId })
      .filter(moment => moment.field !== 'background' || !moment.value.assetId ||
        Boolean(getAssetVisualBinding(moment.value.assetId) && !failedBackgrounds.includes(moment.value.assetId)))) : null;
  const timelineBackdrop = getAssetVisualBinding(timelineLayout?.background.assetId) ?? timelineBackground;
  const timelineRender = useRef({ layout: timelineLayout, background: timelineBackdrop, card: Boolean(timelineCard), sample: Boolean(timelineCard && !timelineUsesVisit) });
  timelineRender.current = { layout: timelineLayout, background: timelineBackdrop, card: Boolean(timelineCard), sample: Boolean(timelineCard && !timelineUsesVisit) };
  useEffect(() => {
    if (timelineBackdrop?.url) void loadBackground(timelineBackdrop.url);
  }, [timelineBackdrop?.url, loadBackground]);
  const cardBackgroundBinding = getNodeVisualBindingByCategories(cardBackgroundSource, ['backgrounds'], true);
  const arrangedBackground = getAssetVisualBinding(layout.background.assetId);
  const backgroundBinding = arrangedBackground ?? cardBackgroundBinding;
  useEffect(() => {
    if (arrangedBackground?.url) void loadBackground(arrangedBackground.url);
  }, [arrangedBackground?.url, loadBackground]);

  const challengeAppearance = useCallback((card: BoardNode) => {
    const preferred = card.challengeAssetId;
    return (preferred && getNodeAssetIds(card).includes(preferred) ? getAssetVisualBinding(preferred) : null) ??
      getNodeVisualBindingByCategories(card, ['objects', 'characters', 'effects'], true);
  }, [getAssetVisualBinding, getNodeVisualBindingByCategories]);
  const challengeBinding = useMemo(() => {
    const hasObstacleAsset = (n: BoardNode) =>
      getNodeAssetIds(n).some((id) => {
        const cat = assetMap.get(id)?.categoryId;
        return cat === 'objects' || cat === 'characters' || cat === 'effects';
      });
    const targetChallenge =
      playMode === 'playing'
        ? playableNodes.find(
            (n) =>
              n.kind === 'challenge' &&
              activeNodeIds.includes(n.id),
          )
        : previewSnapshot.challenge;
    const override = targetChallenge && getAssetVisualBinding(layout.placements[challengeId(targetChallenge.id)]?.assetId);
    if (override) return override;
    const anyChallenge = playableNodes.find(
      (n) => n.kind === 'challenge' && hasObstacleAsset(n),
    );
    return (targetChallenge ? challengeAppearance(targetChallenge) : null) ??
      (anyChallenge ? challengeAppearance(anyChallenge) : null);
  }, [
    activeNodeIds,
    assetMap,
    getNodeVisualBindingByCategories,
    playMode,
    playableNodes,
    previewSnapshot.challenge,
    getAssetVisualBinding,
    challengeAppearance,
    layout.placements,
  ]);

  useEffect(() => {
    for (const card of playableNodes) {
      if (card.kind !== 'challenge') continue;
      const override = layout.placements[challengeId(card.id)]?.assetId;
      const binding = getAssetVisualBinding(override) ?? challengeAppearance(card);
      if (binding) void loadBackground(binding.url);
    }
  }, [playableNodes, layout.placements, getAssetVisualBinding, challengeAppearance, loadBackground]);

  // Refs for smooth 60fps Canvas Loop
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heroImgRef = useRef<HTMLImageElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const hazardImgRef = useRef<HTMLImageElement | null>(null);
  const heroBakedRef = useRef<{ canvas: HTMLCanvasElement; padRatio: number } | null>(null);
  const bgBakedRef = useRef<{ canvas: HTMLCanvasElement; padRatio: number } | null>(null);
  const arrangedBgBakeRef = useRef<{
    image: HTMLImageElement;
    fingerprint: string;
    baked: ReturnType<typeof bakeStaticEffectsToCanvas>;
  } | null>(null);
  const hazardBakedRef = useRef<{ canvas: HTMLCanvasElement; padRatio: number } | null>(null);
  const heroEffectsRef = useRef<VisualEffectItem[] | undefined>(undefined);
  heroEffectsRef.current = characterBinding?.effects;
  const bgEffectsRef = useRef<VisualEffectItem[] | undefined>(undefined);
  bgEffectsRef.current = cardBackgroundBinding?.effects;
  const hazardEffectsRef = useRef<VisualEffectItem[] | undefined>(undefined);
  hazardEffectsRef.current = challengeBinding?.effects;
  const resolveTimerRef = useRef<{ at: number; run: () => void } | null>(null);
  const overlayTimerRef = useRef<number | null>(null);

  const playModeRef = useRef(playMode);
  playModeRef.current = playMode;
  const previewSnapshotRef = useRef(previewSnapshot);
  previewSnapshotRef.current = previewSnapshot;
  const statsRef = useRef(stats);
  statsRef.current = stats;
  const customFlagsRef = useRef(customFlags);
  customFlagsRef.current = customFlags;
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


  const readClock = (): MomentClock => {
    const runMs = Math.round(simRef.current.time * 1000);
    return { runMs, cardId: visitRef.current.id, cardMs: Math.max(0, runMs - visitRef.current.atMs) };
  };
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
    const url = cardBackgroundBinding?.url;
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
  }, [cardBackgroundBinding?.url]);

  useEffect(() => {
    if (bgImgRef.current) {
      bgBakedRef.current = bakeStaticEffectsToCanvas(
        bgImgRef.current,
        bgEffectsRef.current,
      );
    }
  }, [cardBackgroundBinding?.fingerprint]);

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
    if (playableNodes.length === 0 && playMode === 'playing') {
      ++startRequest.current;
      setLoadingBackgrounds(false);
      visibleRef.current = [];
      setVisibleMoments([]);
      resolveTimerRef.current = null;
      overlayTimerRef.current = null;
      pauseLayoutRef.current = null;
      pausedRef.current = false;
      setPaused(false);
      setReview(null);
      setDraft(null);
      setPlayMode('preview');
      setActiveNodeIds([]);
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
        .filter((n): n is BoardNode => Boolean(n)),
    [activeNodeIds, playableMap],
  );
  const primaryNode = activeNodes[0] ?? null;

  const outgoing = useMemo(
    () =>
      getEvaluatedOutgoing(
        activeNodeIds,
        nodes,
        edges,
        stats,
        customFlags,
        loopEdgeIds,
        scopedVariables,
      ),
    [activeNodeIds, nodes, edges, stats, customFlags, loopEdgeIds, scopedVariables],
  );

  const liveActionControls = useMemo<LiveActionControl[]>(() => {
    if (playMode !== 'playing') return [];

    if (primaryNode?.kind === 'challenge') {
      const wired = outgoing
        .filter((item) => item.target.kind === 'action')
        .map((item) => {
          const cfg = resolveActionConfig(item.target);
          return {
            id: item.edge.id,
            edgeId: item.edge.id,
            fromNodeId: item.edge.fromId,
            target: item.target,
            mechanic: cfg.mechanic,
            keyLabel: cfg.keyBinding,
            control: cfg.control,
            evaluation: item.evaluation,
          };
        });
      if (wired.length > 0) return wired;

      return playableNodes
        .filter((n) => n.kind === 'action')
        .map((actionNode) => {
          const cfg = resolveActionConfig(actionNode);
          return {
            id: `free-${actionNode.id}`,
            edgeId: null,
            fromNodeId: primaryNode.id,
            target: actionNode,
            mechanic: cfg.mechanic,
            keyLabel: cfg.keyBinding,
            control: cfg.control,
            evaluation: PASSING_EVAL,
          };
        });
    }

    if (primaryNode?.kind === 'action') {
      return playableNodes
        .filter((n) => n.kind === 'action')
        .map((actionNode) => {
          const cfg = resolveActionConfig(actionNode);
          return {
            id: `sandbox-${actionNode.id}`,
            edgeId: null,
            fromNodeId: null,
            target: actionNode,
            mechanic: cfg.mechanic,
            keyLabel: cfg.keyBinding,
            control: cfg.control,
            evaluation: PASSING_EVAL,
          };
        });
    }

    return [];
  }, [outgoing, playMode, playableNodes, primaryNode]);

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

  const spawnChallengeHazard = useCallback((challengeNode: BoardNode) => {
    const cfg = resolveChallengeConfig(challengeNode);
    const id = challengeId(challengeNode.id);
    hazardLayoutId.current = id;
    const sim = simRef.current;
    sim.lastActionControlId = null;
    sim.lastActionMechanic = null;
    sim.waves = [];

    if (cfg.isSceneOnly) {
      sim.hazard = null;
      return;
    }

    const baseHorizontalSpeed =
      (cfg.pattern === 'collectible' ? 125 : 148) * cfg.speedMultiplier;
    const baseY = cfg.pattern === 'collectible' ? GROUND_Y - 58 : GROUND_Y - 14;
    const radius = cfg.pattern === 'collectible' ? 14 : 13;

    if (cfg.direction === 'down') {
      sim.hazard = {
        x: HERO_BASE_X + 6,
        y: -18,
        baseY: -18,
        vx: 0,
        vy: 112 * cfg.speedMultiplier,
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
        vy: -102 * cfg.speedMultiplier,
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
        vx: baseHorizontalSpeed,
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
        vx: -112 * cfg.speedMultiplier,
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
        vx: -baseHorizontalSpeed,
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
    const configured = layoutRef.current.layout.placements[id];
    if (configured?.x !== undefined) sim.hazard.x = configured.x;
    if (configured?.y !== undefined) {
      sim.hazard.y = configured.y;
      sim.hazard.baseY = configured.y;
    }
  }, []);

  const enterNodes = useCallback(
    (
      targets: BoardNode[],
      triggeredEdgeId: string | null,
      isLoopStep = false,
    ) => {
      resolveTimerRef.current = null;
      overlayTimerRef.current = null;
      if (targets.length === 0) return;

      effectScheduler.current.enter();
      const first = targets[0];
      visitRef.current = { id: first.id, atMs: Math.round(simRef.current.time * 1000) };
      setActiveNodeIds(targets.map((n) => n.id));
      setLastEdgeId(triggeredEdgeId);

      if (first.kind === 'narration' || first.kind === 'dialogue') {
        setRunChallengeId(null);
        simRef.current.hazard = null;
        setEndSummary(null);
        setPhase('overlay');
        return;
      }

      if (first.kind === 'challenge') {
        setRunChallengeId(first.id);
        if (isLoopStep) {
          setWaveNumber((w) => w + 1);
        }
        setEndSummary(null);
        setPhase('live');
        spawnChallengeHazard(first);
        return;
      }

      if (first.kind === 'action') {
        simRef.current.hazard = null;
        setEndSummary(null);
        setPhase('live');
        return;
      }

      if (first.kind === 'outcome') {
        let totalHpDelta = 0;
        let totalScoreDelta = 0;
        let primaryTone: 'celebrate' | 'hurt' | 'victory' | 'defeat' | 'neutral' =
          'neutral';

        for (const o of targets) {
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

        for (const o of targets) {
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

        // Mirror legacy HP/Score outcome deltas into matching numeric variables not already updated by rules
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
        if (totalScoreDelta > 0) effectEventRef.current('score', { x: sim.heroX, y: sim.heroY - 30 }, targets.map(node => node.id));
        if (primaryTone === 'victory') effectEventRef.current('victory', { x: WORLD_W / 2, y: 90 }, targets.map(node => node.id));
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

        const toastText = targets.map((o) => o.note).filter(Boolean).join(' · ');
        if (toastText) setHudToast({ text: toastText, tone: primaryTone });

        const nextOutgoing = getEvaluatedOutgoing(
          targets.map((n) => n.id),
          nodesRef.current,
          edgesRef.current,
          nextStats,
          customFlagsRef.current,
          loopEdgeIdsRef.current,
          nextScopedVars,
        );
        const passing = nextOutgoing.filter((e) => e.evaluation.passed);

        if (passing.length === 0) {
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
          return;
        }

        setPhase('resolving');
        const nextEdge = passing[0];
        resolveTimerRef.current = {
          at: sim.time + 0.95,
          run: () => enterNodes([nextEdge.target], nextEdge.edge.id, nextEdge.isLoop),
        };
      }
    },
    [
      onUpdatePlayValue,
      pushPopup,
      spawnChallengeHazard,
      spawnParticles,
      t.hpLabel,
      t.scoreLabel,
    ],
  );

  const resolveActionOutcome = useCallback(
    (control: LiveActionControl) => {
      const actionNode = control.target;
      const fromAction = getEvaluatedOutgoing(
        [actionNode.id],
        nodesRef.current,
        edgesRef.current,
        statsRef.current,
        customFlagsRef.current,
        loopEdgeIdsRef.current,
        scopedVariablesRef.current,
      ).filter((e) => e.evaluation.passed);

      if (fromAction.length > 0) {
        const allOutcomes = fromAction.every((e) => e.target.kind === 'outcome');
        if (allOutcomes) {
          const uniqueTargets = Array.from(
            new Map(fromAction.map((e) => [e.target.id, e.target])).values(),
          );
          enterNodes(uniqueTargets, fromAction[0].edge.id, false);
          return;
        }
        enterNodes([fromAction[0].target], fromAction[0].edge.id, fromAction[0].isLoop);
        return;
      }

      visitRef.current = { id: actionNode.id, atMs: Math.round(simRef.current.time * 1000) };
      setActiveNodeIds([actionNode.id]);
      setLastEdgeId(control.edgeId);
      setPhase('resolving');
      resolveTimerRef.current = { at: simRef.current.time + 0.65, run: () => {
        const parentChallenge = control.fromNodeId
          ? nodesRef.current.find((n) => n.id === control.fromNodeId)
          : null;
        if (parentChallenge && parentChallenge.kind === 'challenge') {
          enterNodes([parentChallenge], null, true);
        } else {
          enterNodes([actionNode], null, false);
        }
      }};
    },
    [enterNodes],
  );

  const performLiveAction = useCallback(
    (control: LiveActionControl) => {
      if (pausedRef.current || playModeRef.current !== 'playing') return;
      if (phaseRef.current !== 'live' || !control.evaluation.passed) return;
      onUserTestedInPlay();

      const sim = simRef.current;
      sim.lastActionControlId = control.id;
      sim.lastActionMechanic = control.mechanic;
      setLastEdgeId(control.edgeId);

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
      }

      if (!sim.hazard) {
        const hasOutgoingFromAction = edgesRef.current.some(
          (e) => e.fromId === control.target.id,
        );
        if (hasOutgoingFromAction) {
          resolveActionOutcome(control);
        }
      }
    },
    [onUserTestedInPlay, resolveActionOutcome, spawnParticles],
  );

  const resetSimulationState = useCallback(() => {
    resolveTimerRef.current = null;
    overlayTimerRef.current = null;
    pauseLayoutRef.current = null;
    pausedRef.current = false;
    setPaused(false);
    setReview(null);
    setSavedNotice(false);
    visibleRef.current = [];
    setVisibleMoments([]);
    visitRef.current = { atMs: 0 };
    frameClockRef.current = INITIAL_CLOCK;
    setClock(INITIAL_CLOCK);
    const sim = simRef.current;
    effectTimeRef.current = 0;
    effectScheduler.current.reset();
    setEffectOccurrences([]);
    sim.time = 0;
    setRunChallengeId(null);
    sim.lastActionControlId = null;
    sim.lastActionMechanic = null;
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

  const startFromLayout = async (startLayout: StageLayout, savedMoments = moments) => {
    if (playableNodes.length === 0) return;
    const request = ++startRequest.current;
    const timeline = arrangeMoments(savedMoments);
    const assetIds = [...new Set(timeline.flatMap(moment =>
      moment.field === 'background' && moment.value.assetId ? [moment.value.assetId] : []))];
    const needsLoad = assetIds.some(id => {
      const url = getAssetVisualBinding(id)?.url;
      return url && !backgroundImages.current.has(url);
    });
    if (needsLoad) {
      if (playing && !paused) pauseRun();
      setReview(null);
      setLoadingBackgrounds(true);
    }
    const failures = needsLoad ? (await Promise.all(assetIds.map(async id => {
      const url = getAssetVisualBinding(id)?.url;
      return url && await loadBackground(url) ? '' : id;
    }))).filter(Boolean) : assetIds.filter(id => !getAssetVisualBinding(id));
    if (request !== startRequest.current) return;
    setFailedBackgrounds(failures);
    setLoadingBackgrounds(false);
    onUserTestedInPlay();
    setDraft(null);
    resetSimulationState();
    scheduledRef.current = timeline;
    layoutRef.current = { ...layoutRef.current, layout: startLayout, base: startLayout, edits: [], draft: null };
    setTrialHistory({ current: startLayout, edits: [], undo: [] });
    customFlagsRef.current = {};
    setCustomFlags({});
    scopedVariablesRef.current = scopedVariablesRef.current.map(entry => ({
      ...entry, playValue: entry.variable.initialValue,
    }));
    onResetPlayValues();

    const hero = startLayout.placements.hero;
    simRef.current.heroX = hero?.x ?? HERO_BASE_X;
    simRef.current.heroY = hero?.y ?? GROUND_Y;
    simRef.current.onGround = simRef.current.heroY >= GROUND_Y;

    const freshStats = { ...INITIAL_PLAY_STATS };
    statsRef.current = freshStats;
    setStats(freshStats);
    setWaveNumber(1);
    setPlayMode('playing');

    const startNode =
      (startNodeId ? playableMap.get(startNodeId) : null) ?? playableNodes[0];
    if (startNode) {
      enterNodes([startNode], null, false);
    }
  };

  const stopRun = () => {
    ++startRequest.current;
    setLoadingBackgrounds(false);
    scheduledRef.current = [];
    setTrialHistory({ ...EMPTY_TRIAL, undo: [] });
    resetSimulationState();
    setDraft(null);
    setPlayMode('preview');
    setActiveNodeIds([]);
    setLastEdgeId(null);
  };

  const pauseRun = () => {
    setEditorCard(null);
    setEditorSection('card');
    setLayoutSelection('');
    pauseLayoutRef.current = layoutRef.current.layout;
    const stamp = readClock();
    frameClockRef.current = stamp;
    setClock(stamp);
    pausedRef.current = true;
    setPaused(true);
  };

  const resumeRun = () => {
    const before = pauseLayoutRef.current;
    const sim = simRef.current;
    if (before) {
      const hero = editedStagePosition(before.placements.hero, layout.placements.hero, { x: sim.heroX, y: sim.heroY });
      if (sim.heroY !== hero.y) sim.onGround = hero.y >= GROUND_Y;
      sim.heroX = hero.x;
      sim.heroY = hero.y;
      const id = hazardLayoutId.current;
      if (id && sim.hazard && !sim.hazard.resolved) {
        const next = editedStagePosition(before.placements[id], layout.placements[id], sim.hazard);
        sim.hazard.x = next.x;
        sim.hazard.baseY += next.y - sim.hazard.y;
        sim.hazard.y = next.y;
      }
    }
    setDraft(null);
    pauseLayoutRef.current = null;
    pausedRef.current = false;
    setPaused(false);
  };

  const changeKey = ({ id, field }: LayoutChange) => id + '/' + field;
  const openReview = (intent: 'save' | 'restart' | 'stop') => {
    if (!paused) pauseRun();
    setDraft(null);
    setCheckedChanges([...changes.map(changeKey), ...pendingEdits.map(edit => edit.id)]);
    setTimings(Object.fromEntries(pendingEdits.map(edit => [edit.id, 'run'])));
    setReview(intent);
  };
  const handleStartPlay = () => {
    if (loadingBackgrounds) return;
    if (playing && dirty) openReview('restart');
    else startFromLayout(layoutHistory.current);
  };
  const handleStopPlay = () => {
    if (loadingBackgrounds) { stopRun(); return; }
    if (dirty) openReview('stop');
    else stopRun();
  };
  const confirmReview = () => {
    const selected = changes.filter(change => checkedChanges.includes(changeKey(change)));
    const selectedEdits = pendingEdits.filter(edit => checkedChanges.includes(edit.id));
    if (selected.length === 0 && selectedEdits.length === 0) return;
    const opening = selectedEdits.filter(edit => timings[edit.id] === 'opening');
    const next = applyStageMoments(applyStageLayoutChanges(layoutHistory.current, trialHistory.current, selected), opening);
    let nextMoments = moments;
    for (const edit of selectedEdits) {
      const timing = timings[edit.id];
      if (timing === 'opening') continue;
      const cardId = timing === 'card' ? edit.clock.cardId : undefined;
      const point = { id: edit.id, target: edit.target, cardId, atMs: cardId ? edit.clock.cardMs : edit.clock.runMs };
      nextMoments = upsertMoment(nextMoments, edit.field === 'background'
        ? { ...point, field: 'background', value: edit.value }
        : { ...point, field: 'size', value: edit.value });
    }
    setMoments(nextMoments);
    if (selected.length || opening.length) {
      setLayoutHistory(prev => ({ current: next, undo: [...prev.undo.slice(-49), prev.current] }));
    }
    // A later trial undo may expose a previous edit, but cannot unconfirm an already saved point.
    setTrialHistory(prev => {
      const confirmed = new Set(selectedEdits.map(edit => edit.id));
      const mark = (edits: MomentEdit[]) => edits.map(edit => confirmed.has(edit.id) ? { ...edit, confirmed: true } : edit);
      return { ...prev, current: applyStageMoments(prev.current, opening), edits: mark(prev.edits),
        undo: prev.undo.map(snapshot => ({ ...snapshot, current: applyStageMoments(snapshot.current, opening),
          edits: mark(snapshot.edits) })) };
    });
    if (review === 'restart') void startFromLayout(next, nextMoments);
    else if (review === 'stop') stopRun();
    else {
      setReview(null);
      setSavedNotice(true);
    }
  };

  const handleAdvanceOverlay = useCallback(() => {
    if (pausedRef.current || playModeRef.current !== 'playing' || phaseRef.current !== 'overlay') return;
    onUserTestedInPlay();
    const passing = outgoing.filter((e) => e.evaluation.passed);
    if (passing.length > 0) {
      enterNodes([passing[0].target], passing[0].edge.id, passing[0].isLoop);
      return;
    }
    if (edgesRef.current.length === 0 && primaryNode) {
      const idx = playableNodes.findIndex((n) => n.id === primaryNode.id);
      const next = playableNodes[idx + 1];
      if (next) {
        enterNodes([next], null, false);
        return;
      }
    }
    overlayTimerRef.current = null;
    setPhase('ended');
    setEndSummary({
      text: primaryNode?.note ?? '',
      tone: 'neutral',
    });
  }, [enterNodes, onUserTestedInPlay, outgoing, playableNodes, primaryNode]);

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

  const advanceOverlayRef = useRef(handleAdvanceOverlay);
  advanceOverlayRef.current = handleAdvanceOverlay;

  // Both timers use simulation time so waiting in the editor never consumes a game delay.
  useEffect(() => {
    overlayTimerRef.current = activeOverlayPlayback?.mode === 'auto'
      ? simRef.current.time + Math.max(0.5, activeOverlayPlayback.durationSec ?? 3)
      : null;
  }, [activeOverlayPlayback, activeNodeIds]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (pausedRef.current || playModeRef.current !== 'playing') return;
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

      let matched = controls.find(
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
      if (pausedRef.current || playModeRef.current !== 'playing' || phaseRef.current !== 'live') return;
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
      const isPlaying = playModeRef.current === 'playing';
      const isPaused = isPlaying && pausedRef.current;
      if (!isPaused) effectTimeRef.current += dt * 1000;
      const running = isPlaying && !isPaused && phaseRef.current !== 'ended';
      if (!isPlaying || running) sim.time += dt;
      if (running) {
        const pending = resolveTimerRef.current;
        if (pending && sim.time >= pending.at) {
          resolveTimerRef.current = null;
          pending.run();
        }
        if (overlayTimerRef.current !== null && sim.time >= overlayTimerRef.current) {
          overlayTimerRef.current = null;
          advanceOverlayRef.current();
        }
      }
      if (running) {
        const stamp = readClock();
        const dueEffects = effectScheduler.current.due(layoutRef.current.layout, stamp.runMs, stamp.cardMs, stamp.cardId);
        if (dueEffects.length) fireEffectsRef.current(dueEffects, { x: sim.heroX, y: sim.heroY - 22 }, false);
        const previous = frameClockRef.current;
        if (Math.floor(previous.runMs / 100) !== Math.floor(stamp.runMs / 100) ||
          previous.cardId !== stamp.cardId || stamp.runMs < previous.runMs) {
          frameClockRef.current = stamp;
          setClock(stamp);
        }
        const due = dueMoments(scheduledRef.current, stamp).filter(moment => {
          if (moment.field !== 'background' || !moment.value.assetId) return true;
          const url = currentBinding.current(moment.value.assetId)?.url;
          return Boolean(url && backgroundImages.current.has(url));
        });
        if (due.length !== visibleRef.current.length || due.some((entry, index) => entry !== visibleRef.current[index])) {
          visibleRef.current = due;
          const current = layoutRef.current;
          current.layout = applyStageMoments(applyStageMoments(current.base, due), current.edits);
          setVisibleMoments(due);
        }
      }
      const preview = previewSnapshotRef.current;
      const { layout, draft, selection } = layoutRef.current;
      const hero = { ...HERO_POSE, ...layout.placements.hero, ...(draft?.id === 'hero' ? draft.pose : {}) };
      const bg = currentBinding.current(layout.background.assetId);
      const arrangedImage = bg && backgroundImages.current.get(bg.url);
      const hasAnyPlayable = playableCountRef.current > 0 ||
        Boolean(layout.background.color || arrangedImage || bgImgRef.current);
      const previewTargets: { id: string; pose: StagePose }[] = [];
      previewHits.current = previewTargets;

      if (running) {
        if (!sim.onGround) {
          sim.heroVy += 880 * dt;
          sim.heroY += sim.heroVy * dt;
          if (sim.heroY >= GROUND_Y) {
            sim.heroY = GROUND_Y;
            sim.heroVy = 0;
            sim.onGround = true;
          }
        }

        sim.heroX += sim.heroVx * dt;
        sim.heroVx += (hero.x - sim.heroX) * 7.5 * dt;
        sim.heroVx *= Math.pow(0.06, dt);
        sim.heroX = Math.max(38, Math.min(WORLD_W - 60, sim.heroX));

        if (sim.shieldTimer > 0) sim.shieldTimer = Math.max(0, sim.shieldTimer - dt);
        if (sim.dodgeTimer > 0) sim.dodgeTimer = Math.max(0, sim.dodgeTimer - dt);
        if (sim.hurtTimer > 0) sim.hurtTimer = Math.max(0, sim.hurtTimer - dt);
        if (sim.lanternFlare > 0)
          sim.lanternFlare = Math.max(0, sim.lanternFlare - dt * 1.1);

        for (let i = sim.waves.length - 1; i >= 0; i--) {
          const w = sim.waves[i];
          w.x += w.vx * dt;
          if (sim.hazard && !sim.hazard.resolved) {
            const dist = Math.hypot(w.x - sim.hazard.x, w.y - sim.hazard.y);
            if (dist < sim.hazard.radius + 16) {
              effectEventRef.current('collision', { x: sim.hazard.x, y: sim.hazard.y });
              sim.hazard.resolved = true;
              spawnParticles(sim.hazard.x, sim.hazard.y, '#38BDF8', 16);
              const matchedCtrl = liveActionControlsRef.current.find(
                (c) => c.id === w.actionControlId,
              );
              sim.waves.splice(i, 1);
              if (matchedCtrl) resolveActionOutcome(matchedCtrl);
              continue;
            }
          }
          if (w.x > WORLD_W + 30) sim.waves.splice(i, 1);
        }

        if (phaseRef.current === 'live' && sim.hazard && !sim.hazard.resolved) {
          const h = sim.hazard;
          h.age += dt;
          h.x += h.vx * dt;
          if (h.direction === 'down' || h.direction === 'up') {
            h.y += h.vy * dt;
          } else if (h.bounces) {
            const bounceOffset =
              Math.abs(Math.sin(h.age * 5.0 * Math.sqrt(Math.max(0.4, h.speedMultiplier)))) * 26;
            h.y = h.baseY - bounceOffset;
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
            const configured = hazardLayoutId.current ? layout.placements[hazardLayoutId.current] : undefined;
            if (configured?.x !== undefined) h.x = configured.x;
            if (configured?.y !== undefined) h.y = configured.y;
          };

          const heroCenterY = sim.heroY - 22;
          const dist = Math.hypot(h.x - sim.heroX, h.y - heroCenterY);

          if (h.kind === 'collectible') {
            if (dist < h.radius + 22) {
              h.resolved = true;
              effectEventRef.current('collect', { x: h.x, y: h.y });
              spawnParticles(h.x, h.y, '#FBC53D', 16);
              const ctrl =
                liveActionControlsRef.current.find(
                  (c) => c.id === sim.lastActionControlId && c.evaluation.passed,
                ) ?? liveActionControlsRef.current.find((c) => c.evaluation.passed);
              if (ctrl) {
                resolveActionOutcome(ctrl);
              } else {
                resetHazardPosition();
              }
            } else if (
              (h.direction === 'left' && h.x < -28) ||
              (h.direction === 'right' && h.x > WORLD_W + 28) ||
              (h.direction === 'down' && h.y > GROUND_Y + 16) ||
              (h.direction === 'up' && h.y < -28)
            ) {
              resetHazardPosition();
            }
          } else if (h.direction === 'down') {
            if (dist < h.radius + 17 && sim.dodgeTimer <= 0) {
              effectEventRef.current('collision', { x: h.x, y: h.y });
              h.resolved = true;
              if (sim.shieldTimer > 0) {
                const shieldCtrl =
                  liveActionControlsRef.current.find(
                    (c) => c.id === sim.lastActionControlId && c.evaluation.passed,
                  ) ??
                  liveActionControlsRef.current.find(
                    (c) => c.mechanic === 'shield' && c.evaluation.passed,
                  );
                if (shieldCtrl) {
                  resolveActionOutcome(shieldCtrl);
                } else {
                  resetHazardPosition();
                }
              } else {
                sim.hurtTimer = 0.55;
                spawnParticles(sim.heroX, heroCenterY, '#F43F5E', 16);
                resetHazardPosition();
              }
            } else if (h.y > GROUND_Y + 6) {
              h.resolved = true;
              spawnParticles(h.x, GROUND_Y, '#F97316', 10);
              const dodgeCtrl =
                liveActionControlsRef.current.find(
                  (c) => c.id === sim.lastActionControlId && c.evaluation.passed,
                ) ??
                liveActionControlsRef.current.find(
                  (c) =>
                    (c.mechanic === 'dodge' || c.mechanic === 'jump') &&
                    c.evaluation.passed,
                ) ??
                liveActionControlsRef.current.find((c) => c.evaluation.passed);
              if (dodgeCtrl) {
                resolveActionOutcome(dodgeCtrl);
              } else {
                resetHazardPosition();
              }
            }
          } else if (h.direction === 'up') {
            if (dist < h.radius + 17 && sim.dodgeTimer <= 0) {
              effectEventRef.current('collision', { x: h.x, y: h.y });
              h.resolved = true;
              sim.hurtTimer = 0.55;
              spawnParticles(sim.heroX, heroCenterY, '#F43F5E', 16);
              resetHazardPosition();
            } else if (h.y < -24) {
              h.resolved = true;
              const clearedCtrl =
                sim.lastActionControlId
                  ? liveActionControlsRef.current.find(
                      (c) => c.id === sim.lastActionControlId && c.evaluation.passed,
                    )
                  : undefined;
              if (clearedCtrl) {
                resolveActionOutcome(clearedCtrl);
              } else {
                resetHazardPosition();
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
            }

            if (dist < h.radius + 17 && sim.dodgeTimer <= 0) {
              effectEventRef.current('collision', { x: h.x, y: h.y });
              h.resolved = true;
              if (sim.shieldTimer > 0) {
                spawnParticles(sim.heroX + 14, heroCenterY, '#38BDF8', 16);
                const shieldCtrl =
                  liveActionControlsRef.current.find(
                    (c) => c.id === sim.lastActionControlId && c.evaluation.passed,
                  ) ??
                  liveActionControlsRef.current.find(
                    (c) => c.mechanic === 'shield' && c.evaluation.passed,
                  );
                if (shieldCtrl) {
                  resolveActionOutcome(shieldCtrl);
                } else {
                  resetHazardPosition();
                }
              } else {
                sim.hurtTimer = 0.55;
                sim.heroVx = h.direction === 'right' ? 115 : -115;
                spawnParticles(sim.heroX, heroCenterY, '#F43F5E', 16);
                const shieldFallback = liveActionControlsRef.current.find(
                  (c) => c.mechanic === 'shield',
                );
                if (shieldFallback) {
                  resolveActionOutcome(shieldFallback);
                } else {
                  resetHazardPosition();
                }
              }
            } else if (
              (h.direction === 'left' && h.x < sim.heroX - 36) ||
              (h.direction === 'right' && h.x > WORLD_W + 26)
            ) {
              h.resolved = true;
              const clearedCtrl =
                liveActionControlsRef.current.find(
                  (c) => c.id === sim.lastActionControlId && c.evaluation.passed,
                ) ??
                liveActionControlsRef.current.find(
                  (c) =>
                    (c.mechanic === 'jump' || c.mechanic === 'dodge') &&
                    c.evaluation.passed,
                ) ??
                liveActionControlsRef.current.find((c) => c.evaluation.passed);
              if (clearedCtrl) {
                resolveActionOutcome(clearedCtrl);
              } else {
                resetHazardPosition();
              }
            }
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
          const frame = timelineRender.current;
          const drawingLayout = frame.layout ?? layout;
          const showLiveScene = isPlaying && !frame.sample;
          const hero = { ...HERO_POSE, ...drawingLayout.placements.hero, ...(!frame.layout && draft?.id === 'hero' ? draft.pose : {}) };
          const bg = frame.layout ? frame.background : currentBinding.current(layout.background.assetId);
          const arrangedImage = bg && backgroundImages.current.get(bg.url);
          const fallback = frame.card ? null : bgImgRef.current;
          ctx.save();
          ctx.scale((cssW * dpr) / WORLD_W, (cssH * dpr) / WORLD_H);

          if (!hasAnyPlayable && !frame.layout) {
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
          if (arrangedImage && (arrangedBgBakeRef.current?.image !== arrangedImage ||
            arrangedBgBakeRef.current.fingerprint !== bg.fingerprint)) {
            arrangedBgBakeRef.current = {
              image: arrangedImage,
              fingerprint: bg.fingerprint,
              baked: bakeStaticEffectsToCanvas(arrangedImage, bg.effects),
            };
          }

          drawStageBackdrop(
            ctx,
            preview.sceneTheme,
            WORLD_W,
            WORLD_H,
            GROUND_Y,
            sim.time,
            flare,
            arrangedImage || fallback,
            arrangedImage ? arrangedBgBakeRef.current?.baked ?? null : bgBakedRef.current,
            arrangedImage ? bg.effects : bgEffectsRef.current,
          );

          if (drawingLayout.background.color) {
            ctx.fillStyle = drawingLayout.background.color;
            ctx.fillRect(0, 0, WORLD_W, WORLD_H);
          }

          // Hero Character (Only drawn when student has explicitly bound/selected a Character asset)
          if (heroImgRef.current && (isPlaying || composedItemsRef.current.some(item => item.group === 'actor'))) {
            const position = frame.sample ? hero : frame.layout && isPaused ? { x: sim.heroX, y: sim.heroY } : isPaused
              ? editedStagePosition(pauseLayoutRef.current?.placements.hero,
                { ...layout.placements.hero, ...(draft?.id === 'hero' ? draft.pose : {}) }, { x: sim.heroX, y: sim.heroY })
              : isPlaying ? { x: sim.heroX, y: sim.heroY } : hero;
            const hx = position.x;
            const idleBob =
              !isPlaying || sim.onGround ? Math.sin(sim.time * 4.5) * 1.5 : 0;
            const hy = position.y + (!isPlaying || isPaused ? 0 : idleBob);
            if ((!isPlaying || isPaused) && !isHiddenByEffect(heroEffectsRef.current)) {
              previewTargets.push({ id: 'hero', pose: { ...hero, x: hx, y: hy } });
            }

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
              hy - 2 - hero.height / 2,
              hero.width,
              hero.height,
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

          if (!showLiveScene) {
            for (const item of composedItemsRef.current) {
              if (item.group !== 'gameplay') continue;
              const card = nodesRef.current.find(node => node.id === item.cardId);
              if (!card) continue;
              const cfg = resolveChallengeConfig(card);
              const placement = frame.layout
                ? { ...challengePose(cfg.pattern === 'collectible'), ...drawingLayout.placements[item.id] }
                : { ...item.pose, ...(draft?.id === item.id ? draft.pose : {}) };
              const binding = currentBinding.current(item.assetId);
              const image = binding && backgroundImages.current.get(binding.url);
              drawChallengeEntity(ctx, placement.x, placement.y, 13, cfg.visual, sim.time,
                image || null, 0, null, binding?.effects, placement);
              previewTargets.push({ id: item.id, pose: placement });
            }
          }

          // Live Play Entities
          if (showLiveScene) {
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
              const id = hazardLayoutId.current;
              const arrangement = id ? { ...drawingLayout.placements[id], ...(!frame.layout && draft?.id === id ? draft.pose : {}) } : undefined;
              const point = !frame.layout && id && isPaused
                ? editedStagePosition(pauseLayoutRef.current?.placements[id], arrangement, sim.hazard)
                : sim.hazard;
              if (id && isPaused) previewTargets.push({ id, pose: {
                x: point.x, y: point.y,
                width: arrangement?.width ?? sim.hazard.radius * 2.5,
                height: arrangement?.height ?? sim.hazard.radius * 2.5,
              } });
              drawChallengeEntity(
                ctx,
                point.x,
                point.y,
                sim.hazard.radius,
                sim.hazard.visual,
                sim.time,
                hazardImgRef.current,
                liveRotateDir,
                hazardBakedRef.current,
                hazardEffectsRef.current,
                arrangement,
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
  }, [resolveActionOutcome, spawnParticles]);

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
  const editing = playMode === 'preview' || paused;
  const stageItems: PlacementItem[] = [];
  const zh = lang === 'zh';
  const addItem = (id: string, label: string, pose: StagePose, symbol: string, active: boolean, cardId?: string, fallbackId?: string) => {
    const placement = getStagePlacement(layout, id);
    const assetId = placement.assetId || fallbackId;
    const arrangement = { ...placement, ...(draft?.id === id ? draft.pose : {}) };
    const sim = simRef.current;
    const runtimePosition = paused && id === hazardLayoutId.current && sim.hazard && !sim.hazard.resolved
      ? sim.hazard : null;
    const position = runtimePosition
      ? editedStagePosition(pauseLayoutRef.current?.placements[id], arrangement, runtimePosition)
      : {};
    const item: PlacementItem = {
      id, label, symbol, active, cardId, assetId,
      group: id.startsWith('challenge:') ? 'gameplay' : id.startsWith('decoration:') ? 'decoration' : 'base',
      pose: { ...pose, ...arrangement, ...position },
      image: getAssetVisualBinding(assetId)?.url,
    };
    stageItems.push(item);
    return item;
  };
  for (const card of playableNodes) {
    if (card.kind !== 'challenge') continue;
    const config = resolveChallengeConfig(card);
    if (config.isSceneOnly) continue;
    const visual = challengeAppearance(card) ?? (card.id === previewSnapshot.challenge?.id ? challengeBinding : null);
    const id = challengeId(card.id);
    const activeHazard = paused && id === hazardLayoutId.current && simRef.current.hazard && !simRef.current.hazard.resolved
      ? simRef.current.hazard : null;
    const pose = challengePose(config.pattern === 'collectible');
    if (activeHazard) pose.width = pose.height = activeHazard.radius * 2.5;
    addItem(id, card.note || (zh ? '挑战物件' : 'Challenge object'),
      pose, config.pattern === 'collectible' ? '★' : '◆',
      paused ? Boolean(activeHazard) : card.id === previewSnapshot.challenge?.id, card.id, visual?.assetId);
  }
  const decorations = layout.decorations.map(id => addItem(id,
    assetMap.get(layout.placements[id]?.assetId ?? '')?.name ?? (zh ? '装饰' : 'Decoration'),
    DECORATION_POSE, '◇', true,
  ));
  const narrationId = activeNarrationNode && cardOverlayId('narration', activeNarrationNode.id);
  const dialogueId = activeDialogueNode && cardOverlayId('dialogue', activeDialogueNode.id);
  const endingId = endSummary && phase === 'ended' && primaryNode ? cardOverlayId('ending', primaryNode.id) : null;
  for (const card of playableNodes) {
    if (card.kind === 'narration') {
      const id = cardOverlayId('narration', card.id);
      addItem(id, zh ? '字幕' : 'Subtitle',
        { x: 180, y: resolveSubtitlePosition(card) === 'top' ? 29 : 218, width: 320, height: 40 }, '≡', id === narrationId, card.id);
    }
    if (card.kind === 'dialogue') {
      const id = cardOverlayId('dialogue', card.id);
      addItem(id, zh ? '对话框' : 'Dialogue box',
        { x: 180, y: 212, width: 320, height: 52 }, '…', id === dialogueId, card.id);
    }
    const id = cardOverlayId('ending', card.id);
    if (endingId === id || layout.placements[id]) {
      addItem(id, zh ? '结尾画面' : 'Ending screen', { x: 180, y: 125, width: 240, height: 110 }, '⚑', id === endingId, card.id);
    }
  }
  const effectItems = effectEntries(layout).map(([id, placement]) => {
    const item = addItem(id, assetMap.get(placement.assetId ?? '')?.name ?? (zh ? '重新选择特效' : 'Choose effect'),
      {x:180, y:125, width:64, height:64}, '✦', true, undefined, placement.assetId);
    item.group = 'effect';
    return item;
  });
  const interfaceItems = Object.entries(layout.placements).filter(([id,p])=>id.startsWith('interface:') && p.ui).map(([id,p])=>{
    const item = addItem(id,p.ui!.text || assetMap.get(p.assetId ?? '')?.name || 'Interface',{x:180,y:30,width:100,height:30},'▣',true,undefined,p.assetId);
    item.group = 'interface'; return item;
  });
  const overlayItems = stageItems.filter(item => item.group === 'base' && (!playing || item.active));
  const cardOnStage = playing ? primaryNode : previewSnapshot.selectedNode;
  const editCard = playing && editorCard ? playableMap.get(editorCard) ?? cardOnStage : cardOnStage;
  const actorCard = editCard?.kind === 'action' ? editCard
    : (playing ? actionsByChallenge.get(runChallengeId ?? '')?.[0]
      : previewSnapshot.challenge ? actionsByChallenge.get(previewSnapshot.challenge.id)?.[0] : undefined) ??
      playableNodes.find(card => card.kind === 'action' &&
        Boolean(getAssetVisualBinding(card.promptInput?.actorAssetId) ||
          getNodeVisualBindingByCategories(card, ['characters'], true)));
  let actorChallengeId: string | undefined;
  if (actorCard) {
    const parents = challengesForAction(actorCard.id);
    const isCurrentAction = !playing || actorCard.id === primaryNode?.id ||
      Boolean(runChallengeId && parents.includes(runChallengeId));
    actorChallengeId = playing && runChallengeId && parents.includes(runChallengeId)
      ? runChallengeId : !playing && previewSnapshot.challenge && parents.includes(previewSnapshot.challenge.id)
        ? previewSnapshot.challenge.id : parents.length === 1 ? parents[0] : undefined;
    const inherited = challengeRole(actorChallengeId).actorId;
    const boundActor = getAssetVisualBinding(inherited ?? actorCard.promptInput?.actorAssetId) ??
      getNodeVisualBindingByCategories(actorCard, ['characters'], true);
    const appearance = boundActor && isCurrentAction ? characterBinding ?? boundActor : boundActor;
    if (appearance) {
      const name = assetMap.get(appearance.assetId)?.name ?? (zh ? '操控角色' : 'Player character');
      const player = addItem('hero', name, HERO_POSE, '●', isCurrentAction, actorCard.id, appearance.assetId);
      player.group = 'actor';
      player.assetId = appearance.assetId;
      player.image = appearance.url;
      player.readOnly = !isCurrentAction;
      if (paused && isCurrentAction) {
        player.pose = { ...player.pose, ...editedStagePosition(pauseLayoutRef.current?.placements.hero,
          { ...layout.placements.hero, ...(draft?.id === 'hero' ? draft.pose : {}) },
          { x: simRef.current.heroX, y: simRef.current.heroY }) };
      }
    }
  }
  composedItemsRef.current = stageItems;
  const editorItems = editorSection === 'effect' ? effectItems : editorSection === 'interface' ? [...interfaceItems, ...stageItems.filter(item=>item.id.startsWith('overlay:'))] : editorSection === 'card'
    ? stageItems.filter(item => item.cardId === editCard?.id && item.group !== 'decoration')
    : editorSection === 'decoration' ? decorations : [];
  const selectedLayoutItem = editorItems.find(item => item.id === layoutSelection)?.id ??
    editorItems.find(item => item.active)?.id ?? editorItems[0]?.id ?? '';
  const selectEditorCard = (id: string) => {
    setEditorSection('card');
    setLayoutSelection('');
    setDraft(null);
    setEditorCard(id);
  };
  const selectStageElement = (id: string) => {
    const item = stageItems.find(element => element.id === id);
    if (id === 'hero' && !item) return;
    if (item?.group === 'interface' || item?.group === 'effect') {
      setEditorSection(item.group);
      setEditTab(item.group === 'interface' ? 'interface' : 'effects');
    } else if (item?.cardId && !(editorSection === 'interface' && item.group === 'base')) {
      selectEditorCard(item.cardId);
      setEditTab('arrange');
    } else if (item?.group !== 'base' || editorSection !== 'interface') {
      setEditorSection(item?.group === 'decoration' ? 'decoration' : 'background');
      setEditTab('arrange');
    }
    setLayoutSelection(id);
  };
  const getOverlayStyle = (id: string | null | undefined) => {
    if (!id) return {};
    const item = overlayItems.find(element => element.id === id);
    if (!item) return {};
    const pose = item.pose;
    const arranged = getStagePlacement(layout, id);
    const moved = arranged.x !== undefined || arranged.y !== undefined || arranged.width !== undefined ||
      arranged.height !== undefined || draft?.id === id;
    const geometry = moved ? {
      inset: 'auto', left: pose.x / WORLD_W * 100 + '%', top: pose.y / WORLD_H * 100 + '%',
      width: pose.width / WORLD_W * 100 + '%', minHeight: pose.height / WORLD_H * 100 + '%',
      transform: 'translate(-50%, -50%)',
    } : {};
    return { ...geometry, color: arranged.textColor, fontSize: arranged.fontSize, backgroundImage: arranged.assetId && getAssetVisualBinding(arranged.assetId)?.url ? `url("${getAssetVisualBinding(arranged.assetId)?.url}")` : undefined, backgroundSize: '100% 100%', backgroundColor: arranged.panelColor };
  };
  const narrationStyle = narrationId ? getStagePlacement(layout, narrationId) : {};
  const dialogueStyle = dialogueId ? getStagePlacement(layout, dialogueId) : {};
  const endingStyle = endingId ? getStagePlacement(layout, endingId) : {};
  const showStatsBar = usedStats.usesHp || usedStats.usesScore;
  const cardName = (id: string) => {
    const card = playableMap.get(id);
    return card?.title || card?.note || (zh ? '卡片' : 'Card');
  };
  const targetName = (id: string) => stageItems.find(item => item.id === id)?.label ||
    (id === 'background' ? (zh ? '背景' : 'Background') : id === 'hero' ? (zh ? '主角' : 'Hero') : zh ? '物件' : 'Object');
  const timedEffects = effectEntries(layout).filter(([, item]) => item.effect?.trigger === 'run' || item.effect?.trigger === 'card');
  const timelineEffectFrames = viewingTimeline ? timedEffects.flatMap(([id, item]) => {
    const effect = item.effect!;
    const asset = assetMap.get(item.assetId ?? '');
    if (!asset || (effect.cardId && viewingTimeline.cardId !== effect.cardId)) return [];
    if (effect.trigger === 'card' && !effect.cardId) return [];
    const age = (effect.trigger === 'card' ? timelineTime : timelineRunTime) - effect.atMs;
    if (age < 0 || age >= effect.durationMs) return [];
    const hero = timelineRender.current.sample || !playing
      ? { ...HERO_POSE, ...timelineLayout?.placements.hero }
      : { x: simRef.current.heroX, y: simRef.current.heroY };
    const point = effect.anchor === 'fixed' ? { x: item.x ?? 180, y: item.y ?? 125 } : { x: hero.x, y: hero.y - 22 };
    const auditioning = effectOccurrences.some(occurrence => occurrence.preview && occurrence.placement === item &&
      performance.now() - occurrence.at < effect.durationMs);
    if (auditioning) return [];
    return [<TimelineEffectFrame key={id} asset={asset} placement={item} point={point} age={age} />];
  }) : [];
  const timelineEntries: TimelineEntry[] = [
    ...moments.map(moment => ({ id: moment.id, cardId: moment.cardId, atMs: moment.atMs,
      track: moment.target + ':' + moment.field,
      label: targetName(moment.target) + (moment.field === 'size' ? (zh ? ' · 外观大小' : ' · Size') : '') })),
    ...timedEffects.map(([id, item]) => ({ id, cardId: item.effect!.trigger === 'card' ? item.effect!.cardId : undefined,
      atMs: item.effect!.atMs, durationMs: item.effect!.durationMs, track: id,
      label: (assetMap.get(item.assetId ?? '')?.name ?? (zh ? '缺少特效素材' : 'Missing effect asset')) +
        (item.effect!.trigger === 'run' && item.effect!.cardId ? ' · ' + cardName(item.effect!.cardId!) : '') })),
  ];
  const timelineCards = [...new Set([...playableNodes.map(card => card.id), ...timelineEntries.flatMap(item => item.cardId ? [item.cardId] : [])])]
    .map(id => ({ id, name: playableMap.has(id) ? cardName(id) : (zh ? '已移除的卡片' : 'Missing card') }));

  const role = challengeRole(playing ? runChallengeId : previewSnapshot.challenge?.id);
  const challengeRoleName = (actorId?: string) => actorId ? assetMap.get(actorId)?.name : undefined;
  const clockLabel = (ms: number) => paused ? momentSecond(ms) : (Math.floor(ms / 100) / 10).toFixed(1);
  const undoLayout = () => {
    if (playing) {
      setTrialHistory(prev => ({ ...(prev.undo.at(-1) ?? prev), undo: prev.undo.slice(0, -1) }));
    } else {
      setLayoutHistory(prev => ({ current: prev.undo.at(-1) ?? prev.current, undo: prev.undo.slice(0, -1) }));
    }
  };

  const selectedItem = editorItems.find(item => item.id === selectedLayoutItem);
  const placement = selectedItem && layout.placements[selectedItem.id];
  const relatesToCard = Boolean(selectedItem?.cardId || placement?.ui?.cardId || placement?.effect?.cardId);
  const actorRole = challengeRole(actorChallengeId);
  const sharedActionIds = selectedItem?.group === 'actor'
    ? actorRole.actions.filter(action => {
      const assetId = action.promptInput?.actorAssetId ??
        getNodeAssetIds(action).find(id => assetMap.get(id)?.categoryId === 'characters') ?? actorRole.actorId;
      return assetId === selectedItem.assetId;
    }).map(action => action.id)
    : [];
  const scopedCardId = placement?.ui?.cardId ?? placement?.effect?.cardId;
  const backgroundOwner = editorSection === 'background' && !layout.background.assetId && !layout.background.color
    ? cardBackgroundSource?.id : undefined;
  const referencedCardIds = [...new Set([
    ...sharedActionIds,
    ...[selectedItem?.cardId, scopedCardId, backgroundOwner].filter((id): id is string => Boolean(id)),
  ])];
  const visibleRelationIds = referencedCardIds.filter(id => playableMap.has(id));
  const editingPlacement = editing && editTab !== 'moments';
  const relationKey = editingPlacement ? JSON.stringify(visibleRelationIds) : '[]';
  useEffect(() => {
    if (isOpen) onStageCardsChange(JSON.parse(relationKey));
  }, [isOpen, onStageCardsChange, relationKey]);
  const relationLabel = sharedActionIds.length > 1 ? (zh ? '共用角色' : 'Shared character')
    : placement?.effect && scopedCardId ? (zh ? '受此卡片触发限制' : 'Trigger limited to this card')
    : placement?.ui && scopedCardId ? (zh ? '在此卡片出现' : 'Shown on this card')
    : selectedItem?.group === 'gameplay' ? (zh ? '来自挑战卡' : 'From challenge card')
    : relatesToCard || backgroundOwner ? (zh ? '来自卡片' : 'From card')
    : selectedItem?.group === 'decoration' ? (zh ? '舞台装饰' : 'Stage decoration')
    : (zh ? '整局使用' : 'Used throughout the game');

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

  return (
    <aside
      style={{ width: `${width}px` }}
      className={`relative h-full shrink-0 bg-white border-l border-[#E2E8F0] flex flex-col min-h-0 overflow-hidden transition-shadow duration-300 max-[767px]:absolute max-[767px]:inset-0 max-[767px]:!w-full ${
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
            · {paused ? (zh ? '已暂停' : 'Paused') : playMode === 'playing' ? t.liveLabel : t.previewLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
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
                disabled={loadingBackgrounds}
                onClick={paused ? resumeRun : pauseRun}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-200 text-xs font-semibold cursor-pointer"
                title={paused ? (zh ? '继续试玩' : 'Resume play') : (zh ? '暂停并编辑' : 'Pause and edit')}
              >
                {paused ? <Play size={12} /> : <Pause size={12} />}
                {paused ? (zh ? '继续试玩' : 'Resume play') : (zh ? '暂停并编辑' : 'Pause and edit')}
              </button>
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

          <button
            type="button"
            onClick={() => { setDraft(null); onToggle(); }}
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
        {cardOnStage && <div className="min-w-0 text-xs text-slate-600">
          <p className="truncate font-semibold" title={cardName(cardOnStage.id)}>
            {zh ? (playing ? '正在试玩 · ' : '正在预览 · ') : (playing ? 'Playing · ' : 'Previewing · ')}
            {cardName(cardOnStage.id)}
          </p>
          {role.conflict ? <p role="status" className="text-amber-800">
            {zh ? '这张挑战的动作绑定了不同角色，请到画板核对。' : 'Actions in this challenge name different characters. Check the Design Board.'}
          </p> : challengeRoleName(role.actorId) && <p>
            {zh ? '操控 ' : 'Play as '}{challengeRoleName(role.actorId)}
          </p>}
        </div>}
        {/* Live 2D Stage Canvas */}
        <div
          ref={canvasHostRef}
          onClick={event => {
            if (viewingTimeline) return;
            if (playMode === 'preview' || paused) {
              const rect = canvasRef.current?.getBoundingClientRect();
              if (!rect) return;
              const point = stagePoint(rect, event.clientX, event.clientY);
              const hit = [...previewHits.current, ...decorations.filter(item => item.image), ...overlayItems].reverse().find(item => {
                const { left, top } = stageBounds(item.pose, item.id === 'hero');
                return point.x >= left && point.x <= left + item.pose.width && point.y >= top && point.y <= top + item.pose.height;
              });
              selectStageElement(hit?.id ?? 'background');
              return;
            }
            if (playMode === 'playing' && phase === 'overlay') {
              if (!activeOverlayPlayback || activeOverlayPlayback.mode === 'click') {
                handleAdvanceOverlay();
              }
              return;
            }
            if (playMode === 'playing' && phase === 'live') {
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
            if (paused || playMode !== 'playing' || phase !== 'live') return;
            const dblCtrl = liveActionControls.find(
              (c) =>
                c.evaluation.passed &&
                c.control.device === 'mouse' &&
                c.control.interactionType === 'double-click',
            );
            if (dblCtrl) performLiveAction(dblCtrl);
          }}
          onContextMenu={(e) => {
            if (paused || playMode !== 'playing' || phase !== 'live') return;
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
          {decorations.map(item => {
            if (!item.image) return null;
            const pose = timelineLayout ? { ...DECORATION_POSE, ...timelineLayout.placements[item.id] } : item.pose;
            const bounds = stageBounds(pose, false);
            return <img key={item.id} src={item.image} alt=""
              className="pointer-events-none absolute"
              style={{ left: (bounds.left/WORLD_W)*100+'%', top: (bounds.top/WORLD_H)*100+'%',
                width: (pose.width/WORLD_W)*100+'%', height: (pose.height/WORLD_H)*100+'%' }} />;
          })}

          {/* Clean Blank Stage Zero-State */}
          {playableNodes.length === 0 && !layout.background.color && !backgroundBinding && decorations.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center">
              <div className="font-display text-sm font-bold text-[#14244B]">
                {t.stageEmptyTitle}
              </div>
              <p className="mt-1 text-[11.5px] text-[#64748B] leading-relaxed max-w-[230px]">
                {t.stageEmpty}
              </p>
            </div>
          )}

          {!playing && overlayItems.map(item => {
            const card = playableMap.get(item.cardId ?? '');
            if (!card) return null;
            const style = getStagePlacement(layout, item.id);
            const bounds = stageBounds(item.pose, false);
            const text = card.kind === 'dialogue' ? resolveDialogueContent(card).body : card.note;
            return <div key={item.id} data-preview-element={item.id}
              className="pointer-events-none absolute flex items-center justify-center overflow-hidden rounded-lg px-2 text-center text-white"
              style={{ left: bounds.left / WORLD_W * 100 + '%', top: bounds.top / WORLD_H * 100 + '%',
                width: item.pose.width / WORLD_W * 100 + '%', height: item.pose.height / WORLD_H * 100 + '%',
                backgroundColor: style.panelColor ?? '#0f172ae6', color: style.textColor ?? '#ffffff',
                fontSize: style.fontSize ?? 13 }}>
              {text}
            </div>;
          })}

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

          {/* Live Play: Outcome HUD Banner */}
          {playMode === 'playing' && hudToast && phase !== 'ended' && (
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 max-w-[92%] px-3 py-1 rounded-lg bg-[#0F172A]/85 backdrop-blur-xs border border-white/15 text-white text-[11px] font-semibold text-center shadow-md pointer-events-none truncate">
              {hudToast.text}
            </div>
          )}

          {/* Pure In-Game Cinema Subtitle Overlay (Narration Card) */}
          {playing && activeNarrationNode && activeNarrationNode.note.trim() && (
            <div
              style={getOverlayStyle(narrationId)}
              className={`absolute inset-x-3 flex flex-col items-center gap-1.5 rounded-lg ${
                activeNarrationPos === 'top' ? 'top-2.5' : 'bottom-2.5'
              }`}
            >
              <div style={{ backgroundColor: narrationStyle.panelColor }}
                className="w-full px-3.5 py-2 rounded-lg bg-[#090F22]/82 backdrop-blur-xs text-center border border-white/10 shadow-lg">
                <p style={{ color: narrationStyle.textColor, fontSize: narrationStyle.fontSize }}
                  className="text-[12.5px] leading-snug text-white font-medium tracking-wide">
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
          {playing && activeDialogueNode && activeDialogueParsed && activeDialogueParsed.body && (
            <div style={getOverlayStyle(dialogueId)} className="absolute inset-x-2.5 bottom-2.5 rounded-xl">
              <div style={{ backgroundColor: dialogueStyle.panelColor }}
                className="flex items-end gap-2.5 p-2.5 rounded-xl bg-[#0F172A]/90 backdrop-blur-xs border border-[#F43F5E]/60 shadow-lg">
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
                  <p style={{ color: dialogueStyle.textColor, fontSize: dialogueStyle.fontSize }}
                    className="mt-0.5 text-[12px] leading-snug text-white font-medium">
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

          {interfaceItems.filter(item=> !layout.placements[item.id].ui?.cardId || layout.placements[item.id].ui?.cardId===cardOnStage?.id).map(item=>{
            const p=layout.placements[item.id]; const ui=p.ui!;const asset=assetMap.get(p.assetId ?? '');
            const value=ui.usage==='score'?stats.score:stats.hp;
            const enabled=ui.action==='start'? !playing : ui.action==='advance'? playing && !paused && phase==='overlay' : !playing || phase==='ended';
            return <div key={item.id} style={{position:'absolute',left:item.pose.x/WORLD_W*100+'%',top:item.pose.y/WORLD_H*100+'%',width:item.pose.width/WORLD_W*100+'%',height:item.pose.height/WORLD_H*100+'%',transform:'translate(-50%,-50%)',zIndex:30,color:p.textColor,fontSize:p.fontSize,backgroundColor:p.panelColor,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={event=>{event.stopPropagation();if(ui.usage==='button' && enabled){if(ui.action==='advance') handleAdvanceOverlay(); else handleStartPlay();}else if(!playing || paused)selectStageElement(item.id);}}>
              {(ui.usage==='icon' || ui.display==='icon' || ui.usage==='button' || asset?.interfaceMode==='image') && item.image && <img src={item.image} alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none" />}
              <span style={{position:'relative',width:'100%',textAlign:'center'}}>{ui.usage==='score'||ui.usage==='hp' ? ui.display==='bar'? <><span>{ui.text} {value}</span><progress aria-label={ui.text} max={ui.maximum} value={value} className="w-full" /></> : ui.text+' '+value : ui.usage==='icon'? '' : ui.text}</span>
              {ui.usage==='button' && <button type="button" aria-label={ui.text} disabled={!enabled && playing && !paused} className="absolute inset-0 rounded border border-current disabled:opacity-40" />}
            </div>;
          })}
          {viewingTimeline && <div role="status" className="pointer-events-none absolute left-2 top-2 z-50 rounded bg-slate-950/85 px-2 py-1 text-xs text-white">
            {zh ? '画面预览' : 'Scene preview'} · {momentSecond(selectedTime)} {zh ? '秒' : 's'}
            {viewingTimeline.before && (zh ? ' · 变化前' : ' · Before')}
            {timelineRender.current.sample && (zh ? ' · 示例：假设开局进入此卡' : ' · Example: card entered at start')}
          </div>}
          {viewingTimeline && <div className="pointer-events-none absolute inset-0 z-40" aria-label={zh ? '定时特效画面' : 'Timed effects preview'}>{timelineEffectFrames}</div>}
          <StageEffectLayer occurrences={effectOccurrences.filter(item =>
            viewingTimeline ? item.preview : (item.preview || item.placement.effect?.trigger !== 'card' || item.placement.effect.cardId === visitRef.current.id))} assets={assetItems}
            readRunTime={readEffectRunTime} readPreviewTime={readEffectPreviewTime} />
          {/* Ending Overlay */}
          {playMode === 'playing' && phase === 'ended' && endSummary && (
            <div className="absolute inset-0 bg-[#0B132B]/78 backdrop-blur-[2px] flex items-center justify-center">
              <div style={getOverlayStyle(endingId)} className="absolute flex flex-col items-center justify-center gap-2.5 rounded-xl p-3 text-center">
              <div style={{ color: endingStyle.textColor, fontSize: endingStyle.fontSize }}
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
                <p style={{ color: endingStyle.textColor, fontSize: endingStyle.fontSize }}
                  className="text-sm font-semibold text-white leading-snug max-w-[260px]">
                  {endSummary.text}
                </p>
              )}
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={event => { event.stopPropagation(); handleStartPlay(); }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FBC53D] hover:bg-[#F59E0B] text-[#14244B] text-xs font-bold transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.playAgain}</span>
                </button>
                <button
                  type="button"
                  onClick={event => { event.stopPropagation(); handleStopPlay(); }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                  <span>{t.stopBtn}</span>
                </button>
              </div>
              </div>
            </div>
          )}
        </div>

        {playing && <div className="text-xs text-slate-600" aria-label={zh ? '试玩时间' : 'Play time'}>
          {zh ? '本局 ' : 'Run '}{clockLabel(clock.runMs)} {zh ? '秒' : 's'}
          {clock.cardId && <span className="block">
            {zh ? '进入「' + cardName(clock.cardId) + '」后 ' : 'In ' + cardName(clock.cardId) + ' for '}
            {clockLabel(clock.cardMs)} {zh ? '秒' : 's'}
          </span>}
        </div>}
        {loadingBackgrounds && <p role="status" className="text-xs text-slate-600">{zh ? '正在预载背景…' : 'Loading backgrounds…'}</p>}
        {paused && <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" disabled={!dirty || loadingBackgrounds} onClick={() => openReview('save')}
            className="rounded-lg bg-[#14244B] px-2.5 py-1.5 font-semibold text-white disabled:opacity-40">
            {zh ? '保存到下次试玩' : 'Save for next play'}
          </button>
          <button type="button" onClick={handleStartPlay} className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-semibold">
            {zh ? '从头试玩已保存版本' : 'Play saved version from start'}
          </button>
          {savedNotice && <span role="status" className="text-emerald-700">{zh ? '已保存到下次试玩' : 'Saved for next play'}</span>}
        </div>}
        {editing && <div className="flex flex-wrap gap-2" aria-label={zh ? '舞台编辑' : 'Stage editor'}>
          <button type="button" aria-pressed={editTab === 'arrange'} onClick={() => { setEditTab('arrange'); setEditorSection('card'); setLayoutSelection(''); }}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs aria-pressed:bg-sky-100">
            {zh ? '布置' : 'Arrange'}
          </button>
          <button type="button" onClick={()=>{setEditTab('interface');setEditorSection('interface');setLayoutSelection('');}} className="rounded-lg border px-2.5 py-1.5 text-xs">{zh ? '游戏界面' : 'Game interface'}</button>
          <button type="button" aria-pressed={editTab === 'effects'} onClick={()=>{setEditTab('effects');setEditorSection('effect');setLayoutSelection('');}} className="rounded-lg border px-2.5 py-1.5 text-xs">{zh ? '特效' : 'Effects'}</button>
          <button type="button" aria-pressed={editTab === 'moments'} onClick={() => setEditTab('moments')}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs aria-pressed:bg-sky-100">
            {zh ? '变化' : 'Changes'}{timelineEntries.length > 0 && ' (' + timelineEntries.length + ')'}
          </button>
        </div>}
        {timelineActive && <StageTimeline lang={lang} entries={timelineEntries} cards={timelineCards}
          cursor={viewingTimeline} onCursor={setTimelineCursor} onInspect={setTimelineDetail}
          paused={paused ? { cardId: clock.cardId, atMs: clock.cardMs, runMs: clock.runMs } : undefined}
          onPlayEffect={id => {
            const item = layout.placements[id];
            if (item?.effect) fireEffectsRef.current([[id, item]], { x: simRef.current.heroX, y: simRef.current.heroY - 22 }, true);
          }}
          onRestart={handleStartPlay} canPlay={canPlay && !loadingBackgrounds} />}
        {editing && editTab === 'moments' && <StageEffectTimeline lang={lang} layout={layout} onlyId={timelineDetail} cards={playableNodes} onUpdate={updatePlacement} onSelect={selectStageElement} onRemove={id => commitLayout(current => { const placements={...current.placements}; delete placements[id]; return {...current,placements}; })} />}
        {editing && editTab === 'moments' && <StageMomentList lang={lang} moments={moments} onlyId={timelineDetail}
          opening={layoutHistory.current} assets={assetItems} cardName={cardName} targetName={targetName}
          cardBackground={cardBackgroundBinding?.url} targetImage={id => stageItems.find(item => item.id === id)?.image}
          missingCard={id => !playableMap.has(id)} failedBackgrounds={failedBackgrounds}
          getImage={id => getAssetVisualBinding(id)?.url}
          onUpdate={moment => setMoments(prev => upsertMoment(prev, moment))}
          onDelete={id => setMoments(prev => prev.filter(moment => moment.id !== id))}
          onRestart={handleStartPlay} canPlay={canPlay && !loadingBackgrounds}
        />}
        {editingPlacement && (selectedItem || editorSection === 'background') && <section
          aria-label={zh ? '画板关联' : 'Design Board links'} className="grid gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs">
          <p className="break-words"><strong>{selectedItem?.label ?? (zh ? '背景' : 'Background')}</strong> · {relationLabel}</p>
          {referencedCardIds.map(id => playableMap.has(id)
            ? <button key={id} type="button" onClick={() => onLocateCard(id)}
                className="justify-self-start rounded border border-teal-300 bg-white px-2 py-1 text-left text-teal-900">
                {zh ? '查看卡片' : 'View card'} · {cardName(id)}
              </button>
            : <span key={id} className="text-amber-800">{zh ? '关联卡片已移除' : 'Linked card was removed'}</span>)}
        </section>}
        {editing && (editTab === 'arrange' || editTab === 'interface' || editTab === 'effects') && <StagePlacementEditor lang={lang} items={stageItems} editorItems={editorItems}
          selection={selectedLayoutItem} onSelect={selectStageElement} layout={layout}
          section={editorSection} onSection={section => { setEditorSection(section); setLayoutSelection(''); }}
          cards={playableNodes} cardId={editCard?.id} onSelectCard={selectEditorCard}
          backgroundSource={!layout.background.assetId && !layout.background.color && cardBackgroundSource
            ? cardName(cardBackgroundSource.id) : undefined}
          isOffstage={playing && Boolean(editCard && editCard.id !== cardOnStage?.id)}
          backgroundImage={backgroundBinding && !isHiddenByEffect(backgroundBinding.effects) ? {
            url: backgroundBinding.url,
            filter: buildCssFilterString(backgroundBinding.effects) || undefined,
            opacity: getStaticOpacity(backgroundBinding.effects),
          } : undefined}
          assets={assetItems.filter(asset => Boolean(getAssetVisualBinding(asset.id)))}
          canUndo={(playing ? trialHistory.undo : layoutHistory.undo).length > 0}
          onUndo={undoLayout}
          onOpenAsset={onOpenAsset}
          cardName={cardName} backgroundName={assetMap.get(backgroundBinding?.assetId ?? '')?.name}
          onUpdate={updatePlacement} onPreview={(id, pose) => setDraft(pose ? { id, pose } : null)}
          onBackground={background => {
            if (playing) recordMoment('background', { field: 'background', value: background });
            else commitLayout(current => ({ ...current, background }));
          }}
          onPreviewEffect={id => {
            const placement = layout.placements[id];
            if (placement?.effect) fireEffectsRef.current([[id, placement]], { x: simRef.current.heroX, y: simRef.current.heroY - 22 }, true);
          }}
          onAddEffect={assetId => {
            const id = 'effect:' + crypto.randomUUID();
            commitLayout(current => ({...current, placements:{...current.placements,[id]:{assetId,x:180,y:125,width:64,height:64,effect:{...DEFAULT_STAGE_EFFECT}}}}));
            setEditorSection('effect'); setLayoutSelection(id);
          }}
          onAddInterface={assetId => {
            const id = 'interface:' + crypto.randomUUID();
            const asset = assetMap.get(assetId);
            commitLayout(current=>({...current,placements:{...current.placements,[id]:{assetId,x:180,y:30,width:100,height:30,ui:{usage:'text',text:asset?.typography?.text ?? asset?.name ?? '',display:'number',maximum:100,action:'start'},fontSize:asset?.typography?.fontSize ?? 16,textColor:asset?.typography?.textColor ?? '#ffffff'}}}));
            setEditorSection('interface');setLayoutSelection(id);
          }}
          onAddDecoration={assetId => {
            const id = 'decoration:' + crypto.getRandomValues(new Uint32Array(2)).join('-');
            commitLayout(current => ({
              ...current, decorations: [...current.decorations, id],
              placements: { ...current.placements, [id]: { assetId } },
            }));
            setLayoutSelection(id);
          }}
          onRemove={id => {
            commitLayout(current => {
              const placements = { ...current.placements };
              delete placements[id];
              return { ...current, placements, decorations: current.decorations.filter(item => item !== id) };
            });
            setLayoutSelection('');
          }}
        />}

        {review && <dialog ref={reviewDialogRef} aria-labelledby="stage-save-title"
          onCancel={event => { event.preventDefault(); setReview(null); }}
          className="m-auto max-h-[85vh] w-[min(90vw,380px)] overflow-auto rounded-xl bg-white p-4 text-sm shadow-xl backdrop:bg-slate-950/40">
            <h3 id="stage-save-title" className="font-bold">{zh ? '确认本局改动' : 'Review this run’s changes'}</h3>
            <p className="mt-1 text-xs text-slate-600">{zh ? '勾选要用于下一局的改动。' : 'Choose the changes to keep for the next run.'}</p>
            <div className="my-3 space-y-2">
              {pendingEdits.map(edit => {
                const timing = timings[edit.id] ?? 'run';
                const seconds = momentSecond(timing === 'card' ? edit.clock.cardMs : edit.clock.runMs);
                return <div key={edit.id} className="space-y-1.5 rounded-lg bg-slate-50 p-2 text-xs">
                  <label className="flex items-center gap-2 font-semibold">
                    <input type="checkbox" checked={checkedChanges.includes(edit.id)} onChange={event => {
                      setCheckedChanges(prev => event.target.checked ? [...prev, edit.id] : prev.filter(id => id !== edit.id));
                    }} />
                    {targetName(edit.target)}{edit.field === 'size' && (zh ? ' · 外观大小' : ' · Appearance size')}
                  </label>
                  <label className="grid gap-1">
                    {zh ? '何时变化' : 'When to change'}
                    <select value={timing} onChange={event => {
                      const value = event.currentTarget.value as MomentTiming;
                      setTimings(prev => ({ ...prev, [edit.id]: value }));
                    }} className="min-w-0 rounded border border-slate-300 bg-white p-1.5">
                      <option value="run">{zh ? '本局第 ' + momentSecond(edit.clock.runMs) + ' 秒' : momentSecond(edit.clock.runMs) + ' s from start'}</option>
                      {edit.clock.cardId && <option value="card">{zh ? '进入「' + cardName(edit.clock.cardId) + '」后 ' + momentSecond(edit.clock.cardMs) + ' 秒'
                        : momentSecond(edit.clock.cardMs) + ' s after entering ' + cardName(edit.clock.cardId)}</option>}
                      <option value="opening">{zh ? '从开局起使用' : 'Use as opening layout'}</option>
                    </select>
                  </label>
                  {timing !== 'opening' && <p className="text-slate-600">{zh ? seconds + ' 秒时立即切换' : 'Switch at ' + seconds + ' s'}</p>}
                </div>;
              })}
              {changes.map(change => {
                const key = changeKey(change);
                const names = {
                  position: zh ? '下局位置' : 'Next-run position', size: zh ? '外观大小' : 'Appearance size',
                  style: zh ? '界面样式' : 'Overlay style', assetId: zh ? '造型' : 'Appearance',
                  background: zh ? '背景' : 'Background', add: zh ? '新增装饰' : 'New decoration',
                  effect: zh ? '特效设置' : 'Effect settings', remove: zh ? '移除装饰' : 'Remove decoration', ui: zh ? '游戏界面设置' : 'Game interface settings',
                };
                const name = stageItems.find(item => item.id === change.id)?.label
                  ?? assetMap.get(layoutHistory.current.placements[change.id]?.assetId ?? '')?.name;
                const pose = layout.placements[change.id];
                return <label key={key} className="flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={checkedChanges.includes(key)} onChange={event => {
                    setCheckedChanges(prev => event.target.checked ? [...prev, key] : prev.filter(value => value !== key));
                  }} />
                  <span>{name ? name + ' · ' : ''}{change.id === 'hero' && change.field === 'position'
                    ? (zh ? '下局起点' : 'Next-run starting point') : names[change.field]}
                    {change.field === 'position' && pose && ' (' + (pose.x ?? '–') + ', ' + (pose.y ?? '–') + ')'}
                    {change.field === 'size' && pose && ' ' + (pose.width ?? '–') + ' × ' + (pose.height ?? '–')}
                  </span>
                </label>;
              })}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button type="button" disabled={checkedChanges.length === 0} onClick={confirmReview}
                className="rounded-lg bg-[#14244B] px-2.5 py-1.5 font-semibold text-white disabled:opacity-40">
                {review === 'restart' ? (zh ? '保存并重开' : 'Save and restart')
                  : review === 'stop' ? (zh ? '保存并停止' : 'Save and stop') : (zh ? '确认保存' : 'Confirm save')}
              </button>
              {review !== 'save' && <button type="button"
                onClick={() => review === 'restart' ? startFromLayout(layoutHistory.current) : stopRun()}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-semibold">
                {review === 'restart' ? (zh ? '舍弃并重开' : 'Discard and restart') : (zh ? '舍弃并停止' : 'Discard and stop')}
              </button>}
              <button type="button" autoFocus onClick={() => setReview(null)} className="rounded-lg border border-slate-300 px-2.5 py-1.5">{zh ? '返回' : 'Back'}</button>
            </div>
        </dialog>}

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
