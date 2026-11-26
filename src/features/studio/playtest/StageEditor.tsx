import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction, type PointerEvent } from 'react';
import { Image as ImageIcon, Lock, Maximize, Minimize, PanelRightClose, PanelRightOpen, Play, Plus, RotateCcw, Settings2, Square } from 'lucide-react';
import { COPY, type Language } from '../../../shared/i18n';
import type { AssetItem } from '../asset-library/assetLibraryModel';
import { bakeStaticEffectsToCanvas, drawSpriteWithEffects, getOutcomeVisualEffects, getStaticEffectsFingerprint, isHiddenByEffect } from '../asset-library/effects/visualEffectsModel';
import { getAncestorGroupIds, getDescendantNodeIds, getNodeAssetIds, isDescendantOf } from '../design-board/studioModel';
import type { BoardComboFrame, BoardEdge, BoardNode, SpotlightStage } from '../design-board/studioModel';
import { extractSimulatedEventsFromEdges, formatEventClauseSummary, formatPropertyClauseSummary } from '../design-board/arrowConditionModel';
import { coerceVariableValue, type ScopedStateVariable, type StateVariableValue } from '../properties/stateModel';
import { detectUsedStats, extractCustomFlagConditions, getPlayableNodes, resolvePlaybackSettings, resolveSubtitlePosition } from './boardPlayEngine';
import { drawChallengeEntity, drawStageBackdrop } from './cardPreviewDrawing';
import { cardPreviewBehavior, cardPreviewTimeLimit, challengeMotion, challengeSpeed } from './cardPreviewMotion';
import { activateStageEvent, advanceOverlay, beginSceneRules, calculateStageReward, clickStageObject, focusStageChapter, isActive, restoreSceneCheckpoint, sceneCamera, setStageEntityHidden, stageEditPose, startScene, stepScene, syncRunScenes, syncStageRules, type StageEntity, type StageRun } from './sceneRuntime';
import { anchoredPosition, colliderBox, COLLIDER_SIDES, copyPlacements, createLibraryPlacement, createScene, exposedParameters, makeId, patchScenePlacement, placementBox, projectBoardScenes, RESIZE_CORNERS, resizeCollider, resizePlacement, retainChallengeAnchors, rotatePlacement, rotateStagePoint, VIEW_HEIGHT, VIEW_WIDTH, type ColliderSide, type Placement, type Point, type ResizeCorner, type Scene, type StageKind } from './stageProject';
import { StageBackgroundSettings, type BackgroundTool } from './StageBackgroundSettings';
import { StageBackgroundTrack } from './StageBackgroundTrack';
import { backgroundBoundaries, backgroundImageExtent, backgroundImagePlacement, backgroundRangeForDrop, backgroundRangeInView, backgroundSegments, DEFAULT_SCENE_BACKGROUND, dragBackgroundBoundary, getBackgroundImage, insertBackgroundSegment, moveBackgroundSegment, resizeBackgroundImage, type BackgroundBoundary, type BackgroundImageDraft, type BackgroundImagePlacement, type BackgroundSegment, type SceneBackground } from './stageBackground';
import { drawSceneBackground, loadStageImage } from './stageBackgroundDrawing';
import { StageActionControls } from './StageActionControls';
import { StagePlayProperties } from './StagePlayProperties';
import { StagePlaySwitches } from './StagePlaySwitches';
import { StageCutscene } from './StageCutscene';
import { StagePlayChapters } from './StagePlayChapters';
import './stageEditor.css';

export interface StageEditorProps {
  lang: Language;
  isOpen: boolean;
  width: number;
  nodes: BoardNode[];
  edges: BoardEdge[];
  comboFrames: BoardComboFrame[];
  sceneDrafts: Scene[];
  onScenesChange: Dispatch<SetStateAction<Scene[]>>;
  onPlayVariables: Dispatch<SetStateAction<Record<string, StateVariableValue>>>;
  onUpdatePlayValue: (variableId: string, value: StateVariableValue) => void;
  playValueEdit?: { variableId?: string; value?: StateVariableValue };
  spotlightStage: SpotlightStage;
  assets: AssetItem[];
  variables: ScopedStateVariable[];
  selectedNodeId: string | null;
  stageFocus: { nodeId: string; nonce: number } | null;
  onPlacementCounts: (counts: Record<string, number>) => void;
  onToggle: () => void;
  onLocate: (target: { nodeId?: string; edgeId?: string }) => void;
  assetPick: 'picking' | { assetId: string } | null;
  onAssetPickChange: (pick: 'picking' | { assetId: string } | null) => void;
  onOpenLibrary: () => void;
  onActive: (nodes: string[], edge: string | null, edges?: string[]) => void;
  onPlay: () => void;
}

type Mode = 'edit' | 'play' | 'paused';
const screenObject = (kind: StageKind) => kind === 'hud' || kind === 'subtitle';
const isHelper = (item: Placement) => item.kind === 'spawn' || item.kind === 'zone' || item.kind === 'checkpoint';
const maxPan = (scene: Scene, zoom: number) => Math.max(0, scene.width - VIEW_WIDTH / zoom);
type StageHandle = { kind: 'size'; corner: ResizeCorner; at: Point }
  | { kind: 'collision'; side: ColliderSide; at: Point }
  | { kind: 'rotation'; at: Point; stem: Point };

function backgroundScaleHandles(image: BackgroundImagePlacement, pan: number, zoom: number) {
  const inset = 9 / zoom;
  const limit = (value: number, start: number, end: number) => Math.min(end - inset, Math.max(start + inset, value));
  return RESIZE_CORNERS.map(corner => ({
    corner,
    x: limit(image.x + (corner.x > 0 ? image.width : 0), pan, pan + VIEW_WIDTH / zoom),
    y: limit(image.y + (corner.y > 0 ? image.height : 0), 0, VIEW_HEIGHT / zoom),
  }));
}

function stageHandles(item: Placement, scale: number, showCollider: boolean): StageHandle[] {
  const box = placementBox(item);
  const pivot = anchoredPosition(item);
  const rotate = (p: Point) => rotateStagePoint(p, pivot, item.rotation);
  const handles: StageHandle[] = RESIZE_CORNERS.map(corner => ({
    kind: 'size', corner,
    at: rotate({ x: box.x + (corner.x > 0 ? box.width : 0), y: box.y + (corner.y > 0 ? box.height : 0) }),
  }));
  handles.push({
    kind: 'rotation',
    at: rotate({ x: box.x + box.width / 2, y: box.y - 19 / scale }),
    stem: rotate({ x: box.x + box.width / 2, y: box.y }),
  });
  if (item.kind === 'challenge' && showCollider) {
    const box = colliderBox(item);
    for (const side of COLLIDER_SIDES) {
      handles.push({ kind: 'collision', side, at: { x: item.x + side.x * box.width / 2, y: item.y + side.y * box.height / 2 } });
    }
  }
  return handles;
}

export function StageEditor(props: StageEditorProps) {
  const zh = props.lang === 'zh';
  const t = COPY[props.lang].studio.play;
  const l = (en: string, cn: string) => zh ? cn : en;
  const { sceneDrafts, onScenesChange: setScenes } = props;
  const scenes = useMemo(() => projectBoardScenes(sceneDrafts, props.nodes, props.assets), [sceneDrafts, props.nodes, props.assets]);
  const previousScenes = useRef(scenes);
  const [sceneId, setSceneId] = useState(sceneDrafts[0].id);
  const [mode, setMode] = useState<Mode>('edit');
  const [playFlags, setPlayFlags] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [inspectedId, setInspectedId] = useState<string>();
  const [inspectedEdgeId, setInspectedEdgeId] = useState<string>();
  const [assetMenu, setAssetMenu] = useState(false);
  const [editPanel, setEditPanel] = useState<'background' | 'settings' | null>(null);
  const [segmentId, setSegmentId] = useState<string>();
  const [boundary, setBoundary] = useState<BackgroundBoundary>();
  const [backgroundTool, setBackgroundTool] = useState<BackgroundTool>(null);
  const [backgroundDraft, setBackgroundDraft] = useState<BackgroundImageDraft>();
  const editingBackgroundImage = Boolean(backgroundDraft);
  const [pendingBackgroundAsset, setPendingBackgroundAsset] = useState<string>();
  const [backgroundNotice, setBackgroundNotice] = useState('');
  const [assetSearch, setAssetSearch] = useState('');
  const [grid, setGrid] = useState(false);
  const [bounds, setBounds] = useState(true);
  const [full, setFull] = useState(false);
  const [requestedPan, setPan] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [notice, setNotice] = useState('');
  const [, redraw] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLCanvasElement>(null);
  const playViewport = useRef<HTMLCanvasElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const backgroundButton = useRef<HTMLButtonElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const assetSearchInput = useRef<HTMLInputElement>(null);
  const fullButton = useRef<HTMLButtonElement>(null);
  const native = useRef(false);
  const run = useRef<StageRun | undefined>(undefined);
  const playEntryId = useRef<string | undefined>(undefined);
  const checkpoint = useRef<StageRun | undefined>(undefined);
  const keys = useRef(new Set<string>());
  const pressed = useRef(new Set<string>());
  const released = useRef(new Set<string>());
  const drags = useRef<{ pin: number; x: number; y: number; item?: Placement; handle?: StageHandle } | undefined>(undefined);
  const mapDrag = useRef<{ pointerId: number; offset: number } | undefined>(undefined);
  const frameDrag = useRef<{ pointerId: number; origin: Point; image: BackgroundImagePlacement; corner?: ResizeCorner } | undefined>(undefined);
  const sectionDrag = useRef<{ pointerId: number; id: string; offset: number; clientX: number; original: BackgroundSegment[]; moved: boolean } | undefined>(undefined);
  const detailPan = useRef(0);
  const trial = useRef(new Map<string, Partial<Placement>>());
  const images = useRef(new Map<string, HTMLImageElement>());
  const bakedSprites = useRef(new WeakMap<HTMLImageElement, Map<string, ReturnType<typeof bakeStaticEffectsToCanvas>>>());
  const audio = useRef<HTMLAudioElement | null>(null);
  const graph = { scenes, nodes: props.nodes, edges: props.edges, comboFrames: props.comboFrames };
  const scene = scenes.find(item => item.id === sceneId) ?? scenes[0];
  const pan = Math.max(0, Math.min(requestedPan, maxPan(scene, zoom)));
  const playScene = scenes.find(item => item.id === run.current?.sceneId) ?? scene;
  const playableNodes = useMemo(() => getPlayableNodes(props.nodes), [props.nodes]);
  const emptyPreview = !playableNodes.length && playScene.placements.every(isHelper)
    && (!playScene.background || playScene.background.mode === 'inherit');
  const sceneDraft = sceneDrafts.find(item => item.id === scene.id)!;
  const background = scene.background ?? DEFAULT_SCENE_BACKGROUND;
  const hasBackgroundSections = background.mode === 'segments' || background.mode === 'tile';
  const segments = backgroundSegments(background, scene.width);
  const selectedSegment = segments.find(item => item.id === segmentId);
  const availableBoundaries = boundary ? backgroundBoundaries(segments) : [];
  const selectedBoundary = availableBoundaries.find(item => item.id === boundary?.id)
    ?? availableBoundaries.find(item => boundary?.leftId ? item.leftId === boundary.leftId : item.rightId === boundary?.rightId);
  const objects = scene.placements.filter(item => !isHelper(item) && (item.kind !== 'background' || background.mode === 'inherit'));
  const inspectedObjects = (run.current?.entities ?? []).filter(item => !isHelper(item) &&
    (item.kind !== 'background' || (playScene.background?.mode ?? 'inherit') === 'inherit'));
  const selected = objects.find(item => item.id === selectedId);
  const matchingAssets = assetMenu ? props.assets.filter(asset => asset.name.toLowerCase().includes(assetSearch.trim().toLowerCase())) : [];
  const visibleMapWidth = Math.min(scene.width, VIEW_WIDTH / zoom);
  const wholeMapVisible = scene.width - visibleMapWidth < .01;
  const { assetPick, onAssetPickChange } = props;
  const backgroundSelection = editPanel === 'background' && !pendingBackgroundAsset ? selectedSegment : undefined;
  const controls = useRef({ graph, scene, props, mode, pan, zoom, selectedId, inspectedId, bounds, grid, zh, backgroundDraft, backgroundSelection, emptyPreview });
  controls.current = { graph, scene, props, mode, pan, zoom, selectedId, inspectedId, bounds, grid, zh, backgroundDraft, backgroundSelection, emptyPreview };
  useLayoutEffect(() => {
    if (run.current) syncStageRules(run.current, controls.current.graph);
  }, [props.nodes, props.edges]);

  const lastPlayValueEdit = useRef(props.playValueEdit);
  useLayoutEffect(() => {
    const edit = props.playValueEdit !== lastPlayValueEdit.current ? props.playValueEdit : undefined;
    lastPlayValueEdit.current = props.playValueEdit;
    const active = run.current;
    if (!active) return;
    const previous = new Map(active.variables.map(entry => [entry.variable.id, entry.playValue]));
    active.variables = props.variables.map(entry => {
      const useEdit = edit && (!edit.variableId || edit.variableId === entry.variable.id);
      const value = useEdit ? edit.value ?? entry.variable.initialValue : previous.get(entry.variable.id) ?? entry.variable.initialValue;
      return { ...entry, playValue: coerceVariableValue(entry.variable, value) };
    });
    if (edit) redraw(value => value + 1);
  }, [props.playValueEdit, props.variables]);

  const updateScene = (change: Partial<Scene>) => setScenes(current => current.map(item => item.id === scene.id ? { ...item, ...change } : item));
  const updateBackgroundSections = (change: (items: BackgroundSegment[]) => BackgroundSegment[]) => {
    setScenes(current => current.map(item => {
      if (item.id !== scene.id) return item;
      const source = item.background ?? DEFAULT_SCENE_BACKGROUND;
      return { ...item, background: { ...source, mode: 'segments', segments: change(backgroundSegments(source, scene.width)) } };
    }));
  };
  function beginBackgroundTool(tool: BackgroundTool) {
    if (tool === 'frame') {
      if (selectedSegment) beginBackgroundImageEdit(selectedSegment);
      return;
    }
    setBackgroundDraft(undefined);
    frameDrag.current = undefined;
    setBackgroundTool(tool);
    setPendingBackgroundAsset(undefined);
    setBackgroundNotice('');
    if (tool === 'add') {
      setSegmentId(undefined);
      setBoundary(undefined);
    }
  }
  function fittedBackgroundImage(item: BackgroundSegment) {
    const asset = props.assets.find(candidate => candidate.id === item.assetId);
    const image = asset && loadStageImage(getBackgroundImage(asset)?.mediaUrl, images.current);
    const index = segments.findIndex(segment => segment.id === item.id);
    if (!image || index < 0) return undefined;
    const { start, end } = backgroundImageExtent(segments, index);
    return backgroundImagePlacement(item, start, end, scene.height - 28, image.naturalWidth, image.naturalHeight);
  }
  function beginBackgroundImageEdit(item: BackgroundSegment) {
    const image = fittedBackgroundImage(item);
    if (!image) {
      setBackgroundNotice(l('The background image is unavailable or still loading.', '背景图片仍在加载或已不可用。'));
      return;
    }
    setBackgroundNotice('');
    setPendingBackgroundAsset(undefined);
    setBackgroundTool('frame');
    setBackgroundDraft({ sceneId: scene.id, segmentId: item.id, assetId: item.assetId, image });
  }
  function finishBackgroundImageEdit(save: boolean) {
    if (save && backgroundDraft?.sceneId === scene.id) {
      editBackgroundSegment(backgroundDraft.segmentId, { imagePlacement: backgroundDraft.image, frame: undefined });
    }
    beginBackgroundTool(null);
    if (viewport.current) {
      viewport.current.style.cursor = '';
      viewport.current.focus({ preventScroll: true });
    }
  }
  function resetBackgroundSelection() {
    setSegmentId(undefined);
    setBoundary(undefined);
    beginBackgroundTool(null);
  }
  function changeBackground(next: SceneBackground) {
    if (next.mode !== background.mode) resetBackgroundSelection();
    updateScene({ background: next.mode === 'segments' ? { ...next, segments } : next });
  }
  function revealMapPosition(x: number) {
    if (!wholeMapVisible && (x <= pan || x >= pan + visibleMapWidth)) {
      setPan(Math.max(0, Math.min(maxPan(scene, zoom), x - visibleMapWidth / 2)));
    }
  }
  function chooseBackgroundSegment(id: string, reveal = true) {
    const item = segments.find(segment => segment.id === id);
    if (!item) return;
    resetBackgroundSelection();
    setSelectedId(undefined);
    setSegmentId(id);
    if (reveal) revealMapPosition((item.start + item.end) / 2);
  }
  function chooseBackgroundBoundary(next: BackgroundBoundary) {
    resetBackgroundSelection();
    setSelectedId(undefined);
    setBoundary(next);
    revealMapPosition(next.x);
  }
  function moveBackgroundBoundary(item: BackgroundBoundary, x: number, snap = 0) {
    if (!Number.isFinite(x)) return;
    updateBackgroundSections(items => dragBackgroundBoundary(items, item, scene.width, x, snap));
  }
  function moveBackgroundSection(id: string, x: number, snap = 0, original?: BackgroundSegment[]) {
    if (!Number.isFinite(x)) return;
    updateBackgroundSections(items => moveBackgroundSegment(original ?? items, id, scene.width, x, snap));
  }
  function editBackgroundSegment(id: string, patch: Partial<BackgroundSegment>) {
    updateBackgroundSections(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
  }
  function chooseBackgroundAsset(id: string) {
    if (backgroundTool === 'replace' && selectedSegment) {
      editBackgroundSegment(selectedSegment.id, { assetId: id, frame: undefined, imagePlacement: undefined });
      beginBackgroundTool(null);
    } else {
      setBackgroundTool('add');
      setPendingBackgroundAsset(id);
      setBackgroundNotice('');
    }
  }
  function placeBackgroundAt(at?: number) {
    if (!pendingBackgroundAsset) return;
    const range = at === undefined
      ? backgroundRangeInView(segments, scene.width, pan, visibleMapWidth, VIEW_WIDTH)
      : backgroundRangeForDrop(segments, scene.width, at, VIEW_WIDTH);
    if (!range) {
      setBackgroundNotice(l('Choose an empty part of the map or drag an edge to make space.', '请选择地图的空白处，或拖动背景边界留出位置。'));
      return;
    }
    const added = { ...range, id: makeId(), assetId: pendingBackgroundAsset, transition: 0 };
    const fragment = makeId();
    updateBackgroundSections(items => insertBackgroundSegment(items, added, fragment));
    resetBackgroundSelection();
    setSelectedId(undefined);
    setSegmentId(added.id);
    if (added.end <= pan || added.start >= pan + visibleMapWidth) revealMapPosition(added.start);
  }
  useLayoutEffect(() => {
    setScenes(drafts => retainChallengeAnchors(drafts, scenes));
    if (run.current) {
      syncRunScenes(run.current, previousScenes.current, scenes);
      redraw(value => value + 1);
    }
    previousScenes.current = scenes;
  }, [scenes]);
  const onPlacementCounts = props.onPlacementCounts;
  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const item of scenes.flatMap(scene => scene.placements)) {
      if (item.nodeId) counts[item.nodeId] = (counts[item.nodeId] ?? 0) + 1;
    }
    onPlacementCounts(counts);
  }, [scenes, onPlacementCounts]);
  useEffect(() => {
    if (!props.stageFocus) return;
    const live = controls.current;
    const locations = live.graph.scenes.flatMap(candidate => candidate.placements
      .filter(item => !isHelper(item) && item.nodeId === props.stageFocus?.nodeId)
      .map(item => ({ candidate, item })));
    const currentIndex = locations.findIndex(location => location.item.id === live.selectedId);
    const location = locations.length ? locations[(currentIndex + 1) % locations.length] : undefined;
    if (!location) return;
    setSceneId(location.candidate.id);
    setSelectedId(location.item.id);
    setZoom(1);
    setPan(Math.min(maxPan(location.candidate, 1), Math.max(0, location.item.x - VIEW_WIDTH / 2)));
    if (run.current?.sceneId === location.candidate.id) {
      setInspectedId(location.item.id);
      if (live.mode === 'play') setMode('paused');
    }
  }, [props.stageFocus]);
  const editItem = (patch: Partial<Placement>, id = selectedId) => {
    if (!id) return;
    setScenes(current => current.map(item => item.id === scene.id ? patchScenePlacement(item, id, patch) : item));
  };
  const editTrial = (patch: Partial<Placement>) => {
    const active = run.current;
    const entity = active?.entities.find(item => item.id === inspectedId);
    if (!active || !entity) return;
    const previous = trial.current.get(entity.id);
    const change = { ...previous, ...patch };
    for (const axis of ['x', 'y'] as const) {
      if (patch[axis] === undefined) continue;
      const delta = patch[axis] - entity[axis];
      change[axis] = (previous?.[axis] ?? 0) + delta;
      entity.motionOffset ??= { x: 0, y: 0 };
      entity.motionOffset[axis] += delta;
    }
    if ('isHidden' in patch) setStageEntityHidden(active, entity, patch.isHidden);
    Object.assign(entity, patch);
    trial.current.set(entity.id, change);
    redraw(value => value + 1);
  };
  const commitTrial = () => {
    const changes = new Map(trial.current);
    const activeScene = playScene.id;
    for (const entity of run.current?.entities ?? []) {
      const change = changes.get(entity.id);
      if (!change) continue;
      for (const axis of ['x', 'y'] as const) {
        const delta = change[axis] ?? 0;
        if (entity.motionOffset) entity.motionOffset[axis] -= delta;
        entity[axis] -= delta;
      }
    }
    setScenes(current => current.map(item => item.id === activeScene
      ? [...changes].reduce((updated, [id, patch]) => {
        const original = playScene.placements.find(placement => placement.id === id);
        if (!original) return updated;
        return patchScenePlacement(updated, id, {
          ...patch,
          ...(patch.x !== undefined ? { x: original.x + patch.x } : {}),
          ...(patch.y !== undefined ? { y: original.y + patch.y } : {}),
        });
      }, item)
      : item));
    trial.current.clear();
    redraw(value => value + 1);
  };

  const leaveFull = useCallback(async (focus = true) => {
    if (document.fullscreenElement === panel.current) await document.exitFullscreen().catch(() => {});
    native.current = false;
    setFull(false);
    setAssetMenu(false);
    if (focus) fullButton.current?.focus();
  }, []);
  const toggleFull = async () => {
    setAssetMenu(false);
    onAssetPickChange(null);
    if (full) { await leaveFull(); return; }
    setFull(true);
    if (!panel.current?.requestFullscreen) return;
    try {
      await panel.current.requestFullscreen();
      native.current = true;
    } catch {
      native.current = false;
    }
  };
  useEffect(() => {
    const change = () => {
      if (native.current && document.fullscreenElement !== panel.current) void leaveFull();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (assetMenu || assetPick === 'picking') {
        setAssetMenu(false);
        onAssetPickChange(null);
        addButton.current?.focus();
      } else if (editingBackgroundImage) {
        setBackgroundDraft(undefined);
        setBackgroundTool(null);
        frameDrag.current = undefined;
        if (viewport.current) viewport.current.style.cursor = '';
        viewport.current?.focus({ preventScroll: true });
      } else if (editPanel) {
        setEditPanel(null);
        setBackgroundTool(null);
        setPendingBackgroundAsset(undefined);
        (editPanel === 'background' ? backgroundButton : settingsButton).current?.focus();
      } else if (full && !document.fullscreenElement) void leaveFull();
    };
    document.addEventListener('fullscreenchange', change);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('fullscreenchange', change);
      window.removeEventListener('keydown', escape);
    };
  }, [assetMenu, assetPick, editingBackgroundImage, editPanel, full, leaveFull, onAssetPickChange]);
  useEffect(() => {
    if (!assetMenu) return;
    assetSearchInput.current?.focus();
    const close = (event: globalThis.PointerEvent) => {
      if (!toolbar.current?.contains(event.target as Node)) setAssetMenu(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [assetMenu]);
  useEffect(() => {
    if (pendingBackgroundAsset) panel.current?.querySelector('.stage-background-track')?.scrollIntoView({ block: 'nearest' });
  }, [pendingBackgroundAsset]);
  const locate = async (target: { nodeId?: string; edgeId?: string }) => {
    if (full) await leaveFull(false);
    props.onLocate(target);
  };

  const start = (startingScene: Scene) => {
    if (!startingScene.placements.some(item => item.kind === 'spawn')) {
      setNotice(l('The player could not load in this scene.', '当前场景无法载入玩家。'));
      return;
    }
    const next = startScene(startingScene, props.variables.map(entry => ({ ...entry, playValue: entry.variable.initialValue })));
    next.flags = [...playFlags];
    beginSceneRules(next, startingScene, graph);
    run.current = next;
    playEntryId.current = startingScene.id;
    checkpoint.current = undefined;
    trial.current.clear();
    keys.current.clear();
    pressed.current.clear();
    setNotice('');
    props.onPlayVariables({});
    setAssetMenu(false);
    onAssetPickChange(null);
    setInspectedId(undefined);
    setInspectedEdgeId(undefined);
    setMode('play');
    playViewport.current?.focus();
    props.onPlay();
  };
  const stop = () => {
    audio.current?.pause();
    run.current = undefined;
    checkpoint.current = undefined;
    trial.current.clear();
    setMode('edit');
    props.onActive([], null);
    props.onPlayVariables({});
  };
  const restart = () => start(scenes.find(item => item.id === playEntryId.current) ?? scene);
  const resume = () => {
    keys.current.clear();
    pressed.current.clear();
    setMode('play');
    playViewport.current?.focus();
  };
  useEffect(() => {
    if (mode !== 'play') audio.current?.pause();
    else if (audio.current) void audio.current.play().catch(() => {});
  }, [mode]);
  useEffect(() => () => { audio.current?.pause(); }, []);
  const restore = () => {
    const snap = checkpoint.current;
    const restored = snap && restoreSceneCheckpoint(snap, scenes, props.nodes);
    if (!restored) {
      setNotice(l('Checkpoint unavailable for these rules. Restart from the scene entrance.', '当前规则已无法使用此检查点，请从场景入口重新试玩。'));
      return;
    }
    run.current = restored;
    trial.current.clear();
    setNotice('');
    setInspectedId(undefined);
    resume();
  };

  useEffect(() => {
    if (mode !== 'play') return;
    const name = (event: KeyboardEvent) => event.code === 'Space' ? 'space' : event.key.toLowerCase();
    const down = (event: KeyboardEvent) => {
      if (document.activeElement !== playViewport.current) return;
      const key = name(event);
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'space'].includes(key)) event.preventDefault();
      if (!keys.current.has(key)) pressed.current.add(key);
      else if (event.repeat) pressed.current.add('repeat:' + key);
      keys.current.add(key);
      if (run.current?.overlayId && !event.repeat) advanceOverlay(run.current, controls.current.graph, key === 'space' ? 'space' : key);
    };
    const up = (event: KeyboardEvent) => {
      const key = name(event);
      if (keys.current.delete(key)) released.current.add(key);
    };
    const clear = () => { keys.current.clear(); pressed.current.clear(); released.current.clear(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    const canvas = playViewport.current;
    canvas?.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      canvas?.removeEventListener('blur', clear);
      clear();
    };
  }, [mode, props.isOpen, full]);

  useEffect(() => {
    let frame: number;
    let previous = performance.now();
    let accumulator = 0;
    let published = 0;
    let lastEdge: string | undefined;
    let lastSound: string | undefined;
    const previewStart = performance.now();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const draw = (time: number) => {
      const live = controls.current;
      const active = run.current;
      if (active && live.mode === 'play') {
        accumulator += Math.min(.05, (time - previous) / 1000);
        while (accumulator >= 1 / 120) {
          const oldCheckpoint = active.checkpointVisits;
          const oldScene = active.sceneId;
          stepScene(active, live.graph, {
            left: keys.current.has('arrowleft') || keys.current.has('a'),
            right: keys.current.has('arrowright') || keys.current.has('d'),
            keys: pressed.current,
            released: released.current,
          }, 1 / 120);
          pressed.current.clear();
          released.current.clear();
          if (active.sceneId !== oldScene) {
            trial.current.clear();
            setInspectedId(undefined);
          }
          if (active.checkpointId && active.checkpointVisits !== oldCheckpoint) checkpoint.current = structuredClone(active);
          accumulator -= 1 / 120;
        }
        if (time - published >= 80 || lastEdge !== active.edgeId) {
          published = time;
          lastEdge = active.edgeId;
          const activeNodes = active.entities.filter(item => !item.collected && item.nodeId && isActive(item, active)).map(item => item.nodeId!);
          const activeScene = live.graph.scenes.find(item => item.id === active.sceneId);
          if (active.groupId ?? activeScene?.entryGroupId) activeNodes.push((active.groupId ?? activeScene?.entryGroupId)!);
          for (const [id, action] of Object.entries(active.activeActions)) {
            if (active.time - action.at < .4) activeNodes.push(id);
          }
          activeNodes.push(...active.pendingOutcomes.map(outcome => outcome.nodeId));
          if (active.overlayId) activeNodes.push(active.overlayId);
          const edges = Object.entries(active.firedEdges).filter(([, at]) => active.time - at < 1.4).map(([id]) => id);
          for (const edge of live.graph.edges) {
            if (edges.includes(edge.id) && live.graph.nodes.some(node => node.id === edge.toId && node.kind === 'outcome')) activeNodes.push(edge.toId);
          }
          live.props.onActive([...new Set(activeNodes)], active.time - (active.edgeTime ?? -Infinity) < 1.4 ? active.edgeId ?? null : null, edges);
          const values = Object.fromEntries(active.variables.map(entry => [entry.variable.id, entry.playValue]));
          live.props.onPlayVariables(before => Object.keys(values).length === Object.keys(before).length
            && Object.entries(values).every(([id, value]) => Object.is(value, before[id])) ? before : values);
          redraw(value => value + 1);
        }
        if (active.sound && active.sound.id !== lastSound) {
          lastSound = active.sound.id;
          const sound = live.props.assets.find(item => item.id === active.sound?.assetId);
          const slot = sound?.states.find(state => state.id === sound.activeStateId);
          if (slot?.audioUrl) {
            audio.current?.pause();
            audio.current = new Audio(slot.audioUrl);
            void audio.current.play().catch(() => {});
          }
        }
      } else {
        accumulator = 0;
        if (!active) {
          lastSound = undefined;
          audio.current = null;
        }
      }
      previous = time;
      const paintCanvas = (canvas: HTMLCanvasElement | null, scene: Scene, view: PaintView) => {
        if (!canvas?.clientWidth) return;
        const dpr = Math.min(window.devicePixelRatio, 2);
        const width = Math.round(canvas.clientWidth * dpr);
        const height = Math.round(canvas.clientHeight * dpr);
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        const ctx = canvas.getContext('2d');
        if (ctx) paint(ctx, width, height, scene, view, images.current, bakedSprites.current);
      };
      const previewTime = reducedMotion.matches ? 0 : (time - previewStart) / 1000;
      const editRun = active?.sceneId === live.scene.id ? active : undefined;
      paintCanvas(viewport.current, live.scene, {
        ...live, mode: 'edit', run: editRun, time: editRun?.time ?? 0, trial: trial.current,
      });
      const currentScene = live.graph.scenes.find(item => item.id === active?.sceneId) ?? live.scene;
      paintCanvas(playViewport.current, currentScene, {
        ...live, mode: active ? live.mode : 'preview', run: active, time: active?.time ?? previewTime,
        pan: active ? sceneCamera(currentScene, active) : live.pan,
        zoom: active ? 1 : live.zoom, grid: false, selectedId: live.inspectedId,
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  function point(event: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement }, camera = pan, scale = zoom) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * VIEW_WIDTH / rect.width / scale + camera,
      y: (event.clientY - rect.top) * VIEW_HEIGHT / rect.height / scale,
    };
  }
  const addAsset = useCallback((asset: AssetItem, at?: Point) => {
    const world = at ?? { x: Math.round(pan + VIEW_WIDTH / (2 * zoom)), y: Math.min(Math.round(VIEW_HEIGHT / (2 * zoom)), scene.height - 45) };
    const screen = at ? { x: (at.x - pan) * zoom, y: at.y * zoom } : { x: 55, y: 28 };
    const item = createLibraryPlacement(asset, scene, world, screen);
    const useAsBackground = item.kind === 'background' && Boolean(getBackgroundImage(asset));
    const sections = backgroundSegments(scene.background ?? DEFAULT_SCENE_BACKGROUND, scene.width);
    const range = useAsBackground && at ? backgroundRangeForDrop(sections, scene.width, at.x, VIEW_WIDTH) : null;
    const added = range ? { ...range, id: makeId(), assetId: asset.id, transition: 0 } : undefined;
    const fragment = added ? makeId() : '';
    setScenes(current => current.map(draft => {
      if (draft.id !== scene.id) return draft;
      if (useAsBackground) {
        const background = draft.background ?? DEFAULT_SCENE_BACKGROUND;
        const segments = added ? insertBackgroundSegment(sections, added, fragment) : sections;
        return { ...draft, background: { ...background, mode: 'segments', segments } };
      }
      const placements = item.kind === 'background' ? draft.placements.filter(placement => placement.kind !== 'background') : draft.placements;
      const background = item.kind === 'background' && draft.background ? { ...draft.background, mode: 'inherit' as const } : draft.background;
      return { ...draft, background, placements: [...placements, item] };
    }));
    setSelectedId(useAsBackground ? undefined : item.id);
    if (useAsBackground) {
      setEditPanel('background');
      setSegmentId(added?.id);
      setBoundary(undefined);
      setBackgroundTool(added ? null : 'add');
      setPendingBackgroundAsset(added ? undefined : asset.id);
      setBackgroundNotice('');
    }
    setAssetMenu(false);
    onAssetPickChange(null);
    viewport.current?.focus();
  }, [onAssetPickChange, pan, scene, zoom]);
  useEffect(() => {
    if (!assetPick || assetPick === 'picking') return;
    const asset = props.assets.find(item => item.id === assetPick.assetId);
    if (asset && props.isOpen) addAsset(asset);
    else onAssetPickChange(null);
  }, [addAsset, assetPick, onAssetPickChange, props.assets, props.isOpen]);
  function changeScene(id: string) {
    setSceneId(id);
    setSelectedId(undefined);
    setPan(0);
    detailPan.current = 0;
    setZoom(1);
    setAssetMenu(false);
    resetBackgroundSelection();
    frameDrag.current = undefined;
  }
  function mapPosition(event: PointerEvent<HTMLSpanElement>) {
    const rail = event.currentTarget;
    return (event.clientX - rail.getBoundingClientRect().left - rail.clientLeft) * scene.width / rail.clientWidth;
  }
  function startMapDrag(event: PointerEvent<HTMLSpanElement>) {
    if (wholeMapVisible || event.button !== 0) return;
    const x = mapPosition(event);
    const offset = x >= pan && x <= pan + visibleMapWidth ? x - pan : visibleMapWidth / 2;
    mapDrag.current = { pointerId: event.pointerId, offset };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.querySelector('input')?.focus({ preventScroll: true });
    setPan(Math.min(maxPan(scene, zoom), Math.max(0, x - offset)));
  }
  function moveMapDrag(event: PointerEvent<HTMLSpanElement>) {
    const drag = mapDrag.current;
    if (drag?.pointerId !== event.pointerId) return;
    setPan(Math.min(maxPan(scene, zoom), Math.max(0, mapPosition(event) - drag.offset)));
  }
  function endMapDrag(event: PointerEvent<HTMLSpanElement>) {
    if (mapDrag.current?.pointerId === event.pointerId) mapDrag.current = undefined;
  }
  function duplicate(whole: boolean) {
    if (!selected || selected.kind === 'background') return;
    const copies = copyPlacements(scene.placements, selected, whole, { x: 24, y: -8 });
    updateScene({ placements: [...sceneDraft.placements, ...copies] });
    const index = whole && selected.mechanismId ? scene.placements.filter(item => item.mechanismId === selected.mechanismId).indexOf(selected) : 0;
    setSelectedId(copies[index]?.id);
  }
  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const p = point(event);
    if (backgroundDraft) {
      const corner = backgroundCornerAt(p, backgroundDraft.image);
      frameDrag.current = { pointerId: event.pointerId, origin: p, image: backgroundDraft.image, corner };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (editPanel === 'background' && pendingBackgroundAsset && p.y <= scene.height - 28) {
      placeBackgroundAt(p.x);
      return;
    }
    const handle = editHandleAt(p);
    if (handle && selected) {
      drags.current = { pin: event.pointerId, x: p.x, y: p.y, item: selected, handle };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const screen = { x: (p.x - pan) * zoom, y: p.y * zoom };
    const active = run.current?.sceneId === scene.id ? run.current : undefined;
    const liveObjects = active && objects.map(item => stageEditPose(item, active.entities.find(entity => entity.id === item.id), trial.current.get(item.id)))
      .filter(item => !item.collected && !item.open && isActive(item, active));
    const liveHit = liveObjects && pickObject(liveObjects, p, screen);
    const hit = (liveHit && objects.find(item => item.id === liveHit.id)) ?? pickObject(objects, p, screen);
    const backgroundHit = backgroundSectionUnderPointer(p);
    if (backgroundHit && (!hit || backgroundHit.id === segmentId)) {
      chooseBackgroundSegment(backgroundHit.id, false);
      sectionDrag.current = {
        pointerId: event.pointerId, id: backgroundHit.id, clientX: event.clientX,
        offset: p.x - backgroundHit.start, original: segments, moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (hit && segmentId) resetBackgroundSelection();
    setSelectedId(hit?.id);
    drags.current = hit ? { pin: event.pointerId, x: p.x, y: p.y, item: hit }
      : { pin: event.pointerId, x: event.clientX, y: pan };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function playPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const active = run.current;
    if (!active) return;
    event.currentTarget.focus();
    const camera = sceneCamera(playScene, active);
    const p = point(event, camera, 1);
    if (mode === 'paused' && event.button === 0) {
      const hit = pickObject(inspectedObjects, p, { x: p.x - camera, y: p.y });
      setInspectedId(hit?.id);
    } else if (mode === 'play') {
      if (active.overlayId) advanceOverlay(active, graph);
      else {
        const key = event.button === 2 ? 'right button' : 'left button';
        pressed.current.add(key);
        keys.current.add(key);
        if (event.button === 0) clickStageObject(active, graph, p.x, p.y);
      }
    }
  }
  function chooseAction(actionId: string) {
    const active = run.current;
    if (!active || mode !== 'play') return;
    stepScene(active, graph, { left: false, right: false, keys: new Set(), actionId }, 0);
    playViewport.current?.focus({ preventScroll: true });
    redraw(value => value + 1);
  }
  function renderHud(stageScene: Scene, active?: StageRun, editing = false) {
    const variables = active?.variables ?? props.variables;
    const placements = (editing ? stageScene.placements : active?.entities ?? stageScene.placements)
      .filter(item => item.kind === 'hud');
    return props.assets.flatMap(asset => {
      const binding = asset.categoryId === 'interface' ? asset.displayBinding : undefined;
      const entry = binding && variables.find(item => item.variable.id === binding.variableId);
      if (!binding || !entry) return [];
      const state = asset.states.find(slot => slot.id === asset.activeStateId) ?? asset.states[0];
      const effects = getOutcomeVisualEffects(state?.visualEffects, active?.visualOutcomes[asset.id], active?.time ?? 0);
      if (isHiddenByEffect(effects)) return [];
      const value = active ? entry.playValue : entry.variable.initialValue;
      const percent = Math.max(0, Math.min(100, Number(value) / Math.max(1, binding.max) * 100));
      const instances = placements.filter(item => item.assetId === asset.id);
      return (instances.length ? instances.filter(item => !item.isHidden) : [undefined]).map(item => {
        const box = item && placementBox(item);
        const style = item && box ? {
          left: box.x / VIEW_WIDTH * 100 + '%', top: box.y / VIEW_HEIGHT * 100 + '%',
          width: box.width / VIEW_WIDTH * 100 + '%', minHeight: box.height / VIEW_HEIGHT * 100 + '%',
          transform: `rotate(${item.rotation}deg)`, zIndex: Math.max(0, item.layer),
        } : { left: binding.x + '%', top: binding.y + '%' };
        return <div key={item?.id ?? asset.id} style={style}
          className={'absolute pointer-events-none rounded-lg bg-slate-950/75 px-3 py-2 text-white shadow-lg' + (item ? '' : ' w-[40%] max-w-44')}>
          <div className="flex justify-between gap-2 text-xs"><span className="truncate">{entry.fullKey}</span><strong>{String(value)}</strong></div>
          {binding.style === 'bar' && entry.variable.type === 'number' && <div className="mt-1.5 h-2 rounded-full overflow-hidden bg-white/20">
            <div style={{ width: percent + '%', background: binding.color }} className="h-full transition-[width] duration-200" />
          </div>}
        </div>;
      });
    });
  }
  function pickObject(items: Placement[], p: Point, screen: Point) {
    return [...items].reverse().sort((a, b) => Number(screenObject(b.kind)) - Number(screenObject(a.kind)) || b.layer - a.layer).find(item => {
      if (item.kind === 'background' || item.isHidden) return false;
      const card = item.kind === 'challenge' && props.nodes.find(node => node.id === item.nodeId);
      if (card && cardPreviewBehavior(card).isSceneOnly) return false;
      const box = placementBox(item);
      const local = rotateStagePoint(screenObject(item.kind) ? screen : p, anchoredPosition(item), -item.rotation);
      return local.x >= box.x && local.x <= box.x + box.width && local.y >= box.y && local.y <= box.y + box.height;
    });
  }
  function placementPointer(p: Point, item: Placement) {
    return screenObject(item.kind) ? { x: (p.x - pan) * zoom, y: p.y * zoom } : p;
  }
  function editHandleAt(p: Point) {
    if (!selected || selected.isHidden) return undefined;
    const card = selected.kind === 'challenge' && props.nodes.find(node => node.id === selected.nodeId);
    if (card && cardPreviewBehavior(card).isSceneOnly) return undefined;
    const scale = screenObject(selected.kind) ? 1 : zoom;
    const pointer = placementPointer(p, selected);
    let closest: StageHandle | undefined;
    let distance = 8 / scale;
    for (const handle of stageHandles(selected, scale, bounds)) {
      const hit = Math.hypot(pointer.x - handle.at.x, pointer.y - handle.at.y);
      if (hit < distance) {
        closest = handle;
        distance = hit;
      }
    }
    return closest;
  }
  function backgroundSectionUnderPointer(p: Point) {
    if (editPanel !== 'background' || !hasBackgroundSections || backgroundTool !== null ||
      assetPick === 'picking' || p.y < 0 || p.y > scene.height - 28) return undefined;
    return segments.find(segment => p.x >= segment.start && p.x < segment.end);
  }
  function backgroundCornerAt(p: Point, image: BackgroundImagePlacement) {
    return backgroundScaleHandles(image, pan, zoom).find(handle => Math.hypot(p.x - handle.x, p.y - handle.y) <= 8 / zoom)?.corner;
  }
  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (backgroundDraft) {
      const drag = frameDrag.current;
      const p = point(event);
      const corner = drag?.corner ?? backgroundCornerAt(p, backgroundDraft.image);
      if (drag?.pointerId === event.pointerId) updateBackgroundDrag(drag, p);
      event.currentTarget.style.cursor = corner ? corner.x === corner.y ? 'nwse-resize' : 'nesw-resize'
        : drag ? 'grabbing' : 'grab';
      return;
    }
    const section = sectionDrag.current;
    if (section?.pointerId === event.pointerId) {
      dragBackgroundSection(section, event);
      event.currentTarget.style.cursor = 'grabbing';
      return;
    }
    const drag = drags.current;
    if (!drag) {
      const p = point(event);
      const handle = editHandleAt(p);
      if (handle?.kind === 'rotation') event.currentTarget.style.cursor = 'grab';
      else if (handle?.kind === 'collision') event.currentTarget.style.cursor = handle.side.x ? 'ew-resize' : 'ns-resize';
      else if (handle?.kind === 'size') event.currentTarget.style.cursor = handle.corner.x === handle.corner.y ? 'nwse-resize' : 'nesw-resize';
      else if (editPanel === 'background' && pendingBackgroundAsset) event.currentTarget.style.cursor = 'crosshair';
      else event.currentTarget.style.cursor = backgroundSectionUnderPointer(p) ? 'grab' : '';
      return;
    }
    if (drag.pin !== event.pointerId) return;
    if (!drag.item) {
      setPan(Math.min(maxPan(scene, zoom), Math.max(0, drag.y + (drag.x - event.clientX) * VIEW_WIDTH / event.currentTarget.clientWidth / zoom)));
      return;
    }
    const p = point(event);
    const adjust = (value: number) => grid ? Math.round(value / 10) * 10 : Math.round(value);
    const scale = screenObject(drag.item.kind) ? zoom : 1;
    const delta = { x: (p.x - drag.x) * scale, y: (p.y - drag.y) * scale };
    if (drag.handle?.kind === 'size') {
      editItem(resizePlacement(drag.item, drag.handle.corner, delta), drag.item.id);
      return;
    }
    if (drag.handle?.kind === 'collision') {
      editItem({ collider: resizeCollider(drag.item, drag.handle.side, delta) }, drag.item.id);
      return;
    }
    if (drag.handle?.kind === 'rotation') {
      event.currentTarget.style.cursor = 'grabbing';
      editItem({ rotation: rotatePlacement(drag.item, placementPointer(drag, drag.item), placementPointer(p, drag.item)) }, drag.item.id);
      return;
    }
    const dx = delta.x * (drag.item.anchor?.endsWith('right') ? -1 : 1);
    const dy = delta.y * (drag.item.anchor?.startsWith('bottom') ? -1 : 1);
    editItem({ x: adjust(drag.item.x + dx), y: adjust(drag.item.y + dy) }, drag.item.id);
  }
  function dragBackgroundSection(drag: NonNullable<typeof sectionDrag.current>, event: PointerEvent<HTMLCanvasElement>) {
    if (!drag.moved && Math.abs(event.clientX - drag.clientX) < 4) return;
    drag.moved = true;
    const snap = 8 * VIEW_WIDTH / event.currentTarget.clientWidth / zoom;
    moveBackgroundSection(drag.id, point(event).x - drag.offset, snap, drag.original);
  }
  function updateBackgroundDrag(drag: NonNullable<typeof frameDrag.current>, p: Point) {
    const delta = { x: p.x - drag.origin.x, y: p.y - drag.origin.y };
    const image = drag.corner ? resizeBackgroundImage(drag.image, drag.corner, delta)
      : { ...drag.image, x: drag.image.x + delta.x, y: drag.image.y + delta.y };
    setBackgroundDraft(draft => draft && { ...draft, image });
  }
  function endDrag(event: PointerEvent<HTMLCanvasElement>) {
    const section = sectionDrag.current;
    if (section?.pointerId === event.pointerId) {
      if (event.type === 'pointerup') dragBackgroundSection(section, event);
      sectionDrag.current = undefined;
      event.currentTarget.style.cursor = 'grab';
    }
    const frame = frameDrag.current;
    if (frame?.pointerId === event.pointerId) {
      if (event.type === 'pointerup') updateBackgroundDrag(frame, point(event));
      frameDrag.current = undefined;
      event.currentTarget.style.cursor = 'grab';
    }
    const drag = drags.current;
    if (drag?.pin === event.pointerId) {
      drags.current = undefined;
      event.currentTarget.style.cursor = '';
    }
  }

  const numeric = (title: string, value: number, onChange: (value: number) => void, min?: number) => (
    <label>{title}<input aria-label={title} type="number" min={min} value={value} onChange={event => {
      if (event.currentTarget.value === '') return;
      const next = Number(event.currentTarget.value);
      if (Number.isFinite(next)) onChange(min === undefined ? next : Math.max(min, next));
    }} /></label>
  );
  const boardSelection = playableNodes.find(node => node.id === props.selectedNodeId);
  const groupChildren = boardSelection?.kind === 'group' ? new Set(getDescendantNodeIds(boardSelection.id, props.nodes)) : undefined;
  const scopedPreview = groupChildren?.size ? playableNodes.filter(node => groupChildren.has(node.id)) : playableNodes;
  const previewPool = scopedPreview.length ? scopedPreview : playableNodes;
  const reversePreview = [...previewPool].reverse();
  const previewNarration = boardSelection?.kind === 'narration' ? boardSelection : reversePreview.find(node => node.kind === 'narration');
  const previewDialogue = boardSelection?.kind === 'dialogue' ? boardSelection : reversePreview.find(node => node.kind === 'dialogue');
  const narrationAtBottom = previewNarration && resolveSubtitlePosition(previewNarration) === 'bottom';
  const simulatedEvents = useMemo(() => extractSimulatedEventsFromEdges(
    props.nodes, props.edges, new Set(playableNodes.map(node => node.id)), props.lang,
  ), [playableNodes, props.nodes, props.edges, props.lang]);
  const customFlags = useMemo(() => extractCustomFlagConditions(props.nodes, props.edges, props.variables), [props.nodes, props.edges, props.variables]);
  const stats = useMemo(() => detectUsedStats(
    props.nodes.filter(node => !node.promptInput?.outcomeMode || node.fields.stageScoreFormula), props.edges,
  ), [props.nodes, props.edges]);
  const activeRun = run.current;
  const stageNodeMap = useMemo(() => new Map(playableNodes.map(node => [node.id, node])), [playableNodes]);
  const availableMechanisms = new Set(activeRun?.entities.filter(item => item.kind === 'challenge' && !item.collected && !item.open &&
    isActive(item, activeRun) && item.nodeId && getAncestorGroupIds(item.nodeId, stageNodeMap).every(id => activeRun.unlockedGroups.includes(id)))
    .map(item => item.nodeId));
  const mechanisms = activeRun ? playableNodes.filter(node => (availableMechanisms.has(node.id) || node.id === activeRun.overlayId) &&
    (!activeRun.groupId || isDescendantOf(node.id, activeRun.groupId, stageNodeMap))) : [];
  const showStats = activeRun && (stats.usesHp || stats.usesScore);
  const waitingForChapter = activeRun && activeRun.waitingGroups.length > 0 && !activeRun.overlayId && !activeRun.finished
    && !activeRun.groupId && !activeRun.entities.some(item => item.kind === 'challenge' && item.nodeId
      && playableNodes.some(node => node.id === item.nodeId && !node.parentId));
  const togglePlayFlag = (key: string) => {
    if (mode === 'paused') return;
    const enabled = !playFlags.includes(key);
    setPlayFlags(flags => enabled ? [...flags, key] : flags.filter(flag => flag !== key));
    if (!activeRun) return;
    if (enabled) activateStageEvent(activeRun, key, graph);
    else activeRun.flags = activeRun.flags.filter(flag => flag !== key);
  };
  const chooseChapter = (groupId: string) => {
    if (!activeRun) return;
    const prior = activeRun.sceneId;
    focusStageChapter(activeRun, groupId, graph);
    if (prior !== activeRun.sceneId) {
      trial.current.clear();
      setInspectedId(undefined);
    }
    redraw(value => value + 1);
    playViewport.current?.focus({ preventScroll: true });
  };
  const chooseMechanism = (nodeId: string) => {
    if (!activeRun) return;
    const entity = activeRun.entities.find(item => item.nodeId === nodeId && !item.collected && !item.open && isActive(item, activeRun));
    if (!entity) return;
    activeRun.focusedObjectId = entity.id;
    redraw(value => value + 1);
    playViewport.current?.focus({ preventScroll: true });
  };

  function renderOverlay(stageScene: Scene, active: StageRun | undefined, interactive: boolean) {
    const overlay = active && props.nodes.find(node => node.id === active.overlayId);
    const narration = active ? overlay?.kind === 'narration' ? overlay : undefined
      : narrationAtBottom && previewDialogue && boardSelection?.kind !== 'narration' ? undefined : previewNarration;
    const dialogue = active ? overlay?.kind === 'dialogue' ? overlay : undefined
      : narrationAtBottom && boardSelection?.kind === 'narration' ? undefined : previewDialogue;
    const subtitle = (active && interactive ? active.entities : stageScene.placements).find(item => item.kind === 'subtitle');
    const portrait = dialogue && [...getNodeAssetIds(dialogue), stageScene.placements.find(item => item.id === stageScene.entrySpawnId)?.assetId]
      .map(id => props.assets.find(asset => asset.id === id && asset.categoryId === 'characters')).find(Boolean);
    return <StageCutscene lang={props.lang} narration={narration} dialogue={dialogue} portrait={portrait}
      subtitle={subtitle} run={active} hint={Boolean(active && interactive && mode === 'play')} />;
  }
  function renderInspector(trialMode: boolean) {
    const mode = trialMode ? 'paused' : 'edit';
    const objectsForView = trialMode ? inspectedObjects : objects;
    const selected = objectsForView.find(item => item.id === (trialMode ? inspectedId : selectedId)) as StageEntity | undefined;
    const setSelectedForView = trialMode ? setInspectedId : setSelectedId;
    const edit = trialMode ? editTrial : editItem;
    const selectedNode = props.nodes.find(node => node.id === selected?.nodeId);
    const parameters = selected ? exposedParameters(props.nodes, selected) : [];
    const rewardCards = props.nodes.filter(node => node.kind === 'outcome' && node.fields.stageScoreFormula &&
      props.edges.some(edge => edge.fromId === selectedNode?.id && edge.toId === node.id));
    const verdicts = trialMode && run.current && selected ? Object.values(run.current.verdicts)
      .filter(entry => entry.objectId === selected.id) : [];
    const byEdge = new Map(verdicts.map(entry => [entry.edgeId, entry]));
    const conditions = trialMode && selected ? props.edges.filter(edge =>
      (edge.condition?.trim() || edge.conditionGroup?.clauses.length)
      && (byEdge.has(edge.id) || selected.nodeId && (edge.fromId === selected.nodeId || edge.toId === selected.nodeId))) : [];
    const recent = [...verdicts].reverse().sort((a, b) => b.at - a.at || Number(b.passed) - Number(a.passed))[0];
    const recentEdge = conditions.find(edge => edge.id === inspectedEdgeId) ??
      conditions.find(edge => edge.id === recent?.edgeId) ?? conditions[0];
    const verdict = recentEdge && byEdge.get(recentEdge.id);
    return (
      <aside className="stage-inspector" aria-label={trialMode ? l('Play inspection', '试玩检查') : l('Edit selection', '编辑对象')}>
        <div className="stage-inspector-heading">
          <h3>{selected?.name || l('Stage inspection', '舞台检查')}</h3>
          {selected && mode === 'edit' && <div className="stage-row">
            {selected.kind !== 'background' && <button type="button" onClick={() => duplicate(false)}>{l('Duplicate', '复制')}</button>}
            {selected.mechanismId && selected.kind !== 'background' && <button type="button" onClick={() => duplicate(true)}>{l('Duplicate mechanism', '复制整套机制')}</button>}
            {!selected.id.startsWith('board:') && <button type="button" onClick={() => {
              updateScene({ placements: sceneDraft.placements.filter(item => item.id !== selected.id) });
              setSelectedForView(undefined);
            }}>{l('Remove', '移除')}</button>}
          </div>}
        </div>
        {objectsForView.length > 0 && <select aria-label={l('Stage objects', '舞台对象')} value={selected?.id ?? ''} onChange={event => {
          const item = objectsForView.find(object => object.id === event.target.value);
          setSelectedForView(item?.id);
          if (item && mode === 'edit' && !screenObject(item.kind) && item.kind !== 'background') {
            setPan(Math.min(maxPan(scene, zoom), Math.max(0, item.x - VIEW_WIDTH / (2 * zoom))));
          }
        }}><option value="">{l('Select an element', '选择元素')}</option>{objectsForView.map(item => <option key={item.id} value={item.id}>
          {item.name}{item.kind === 'challenge' ? l(' · Challenge', ' · 挑战') : ''}{item.isHidden ? l(' · Hidden', ' · 已隐藏') : ''}
        </option>)}</select>}
        {selected ? <div className="stage-object-details" key={selected.id}>
          {selectedNode && <div className="stage-row"><button type="button" onClick={() => void locate({ nodeId: selectedNode.id })}>{l('Locate rule on board', '在设计板定位')}</button></div>}
          {selected.nodeId && !selectedNode && <p className="stage-notice" role="status">{l('The source card is missing.', '来源卡片已不存在。')}</p>}
          <fieldset><legend>{l('Placement', '摆放与外观')}</legend>
            {numeric(l('Width', '宽度'), selected.width, width => edit({ width }), 1)}
            {numeric(l('Height', '高度'), selected.height, height => edit({ height }), 1)}
          </fieldset>
          <details><summary>{l('More placement settings', '更多摆放设置')}</summary><fieldset>
            <label><input type="checkbox" checked={Boolean(selected.isHidden)} onChange={event => edit({ isHidden: event.target.checked })} />{l('IsHidden?', '隐藏（IsHidden?）')}</label>
            {mode === 'edit' && <label>{l('Name', '名称')}<input value={selected.name} onChange={e => edit({ name: e.target.value })} /></label>}
            {numeric('X', selected.x, x => edit({ x }))}
            {numeric('Y', selected.y, y => edit({ y }))}
            {numeric(l('Rotation', '旋转'), selected.rotation, rotation => edit({ rotation }))}
            {numeric(l('Layer', '图层'), selected.layer, layer => edit({ layer }))}
            {screenObject(selected.kind) && <label>{l('Screen anchor', '屏幕锚点')}<select value={selected.anchor ?? 'top-left'} onChange={e => edit({ anchor: e.target.value as Placement['anchor'] })}>
              {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((anchor, index) => <option key={anchor} value={anchor}>{zh ? ['左上', '右上', '左下', '右下'][index] : anchor}</option>)}
            </select></label>}
          </fieldset></details>
          {selected.kind === 'challenge' && <details open={mode === 'paused' || undefined}><summary>{l('Collision bounds', '碰撞范围')}</summary><fieldset>
            <label><input type="checkbox" checked={!selected.collider} onChange={e => edit({ collider: e.target.checked ? undefined : { width: selected.width, height: selected.height } })} />{l('Follow appearance', '跟随外观')}</label>
            {selected.collider && <>
              {numeric(l('Collision width', '碰撞宽度'), selected.collider.width, width => edit({ collider: { ...selected.collider!, width } }), 1)}
              {numeric(l('Collision height', '碰撞高度'), selected.collider.height, height => edit({ collider: { ...selected.collider!, height } }), 1)}
            </>}
            {mode === 'edit' && <label><input type="checkbox" checked={bounds} onChange={e => setBounds(e.target.checked)} />{l('Show collision handles', '显示碰撞范围手柄')}</label>}
          </fieldset></details>}
          {(parameters.length > 0 || rewardCards.length > 0) && <fieldset><legend>{l('Instance parameters', '实例参数')}</legend>
            {parameters.map(parameter => <div key={parameter.id} className="stage-parameter">
              {numeric(parameter.name, selected.parameters?.[parameter.id] ?? parameter.value, value => edit({
                parameters: { ...selected.parameters, [parameter.id]: Math.min(parameter.max ?? Infinity, Math.max(parameter.min ?? -Infinity, value)) },
              }))}
              <small>{selected.parameters?.[parameter.id] === undefined ? l('Following rule default', '跟随规则默认') : l('Instance override', '仅此实例')} · {parameter.value}</small>
              {selected.parameters?.[parameter.id] !== undefined && <button type="button" onClick={() => { const parameters = { ...selected.parameters }; delete parameters[parameter.id]; edit({ parameters }); }}>{l('Restore default', '恢复默认')}</button>}
            </div>)}
            {rewardCards.map(card => {
              const reward = calculateStageReward(card, props.nodes, mode === 'paused' ? run.current?.variables ?? props.variables : props.variables, selected);
              return <div key={card.id} className="stage-parameter">
                <button type="button" onClick={() => void locate({ nodeId: card.id })}>{card.title || l('Reward rule', '奖励规则')}</button>
                <small>{reward.formula} · {reward.valid ? reward.value : l('Invalid formula; using the card default', '公式无效，使用卡片默认值')}</small>
              </div>;
            })}
          </fieldset>}
          {mode === 'paused' && <fieldset><legend>{l('This run', '本局状态')}</legend>
            <p>{selected.collected ? l('Collected', '已收集') : selected.open ? l('Open', '已打开') : l('Active', '运行实例')}</p>
            {conditions.length > 1 && recentEdge && <label>{l('Related condition', '相关条件')}
              <select aria-label={l('Related condition', '相关条件')} value={recentEdge.id} onChange={event => setInspectedEdgeId(event.target.value)}>
                {conditions.map(edge => {
                  const target = props.nodes.find(node => node.id === edge.toId);
                  const result = byEdge.get(edge.id);
                  const label = target?.title || target?.note || l('Condition', '条件');
                  const state = result ? result.passed ? l('Passed', '通过') : l('Not passed', '未通过') : l('No evaluation yet', '尚未求值');
                  return <option key={edge.id} value={edge.id}>{label} · {state}</option>;
                })}
              </select>
            </label>}
            {recentEdge && <button type="button" onClick={() => void locate({ edgeId: recentEdge.id })}>{l('Locate related condition', '查看相关条件')}</button>}
            {verdict && recentEdge ? <>
              <p>{verdict.passed ? l('Passed', '通过') : l('Not passed', '未通过')} · {l('Score', '分数')} {verdict.scoreBefore} → {verdict.scoreAfter}</p>
              {verdict.clauses.map(result => {
                const clause = recentEdge.conditionGroup?.clauses.find(item => item.id === result.id);
                const summary = clause?.kind === 'event' ? formatEventClauseSummary(clause, props.lang)
                  : clause ? formatPropertyClauseSummary(clause, props.variables, props.lang) : l('Condition', '条件');
                return <p key={result.id}>{result.passed ? '✓' : '×'} {summary}{result.actual !== undefined && <> · {l('Actual', '实际值')} {String(result.actual)}</>}</p>;
              })}
            </> : <p>{l('No evaluation yet', '尚未求值')}</p>}
          </fieldset>}
        </div> : <small>{mode === 'paused' ? l('Select an element to inspect it.', '选择一个元素进行检查。') : l('Select an element on the stage to edit it.', '点击舞台上的元素进行编辑。')}</small>}
      </aside>
    );
  }

  return (
    <aside ref={panel} className={'stage-editor' + (full ? ' stage-full' : '') + (props.spotlightStage === 'focus-play' ? ' stage-spotlight' : '')}
      style={{ width: full ? undefined : props.isOpen ? props.width : 44 }}
      aria-label={l('Canvas stage', 'Canvas 舞台')}
      onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && event.target === viewport.current && selected) {
          event.preventDefault(); duplicate(false);
        }
      }}>
      {!props.isOpen && !full ? <button type="button" className="stage-icon" aria-label={l('Expand Play panel', '展开试玩栏')} onClick={props.onToggle}><PanelRightOpen size={16} /></button> : <>
        <header className="stage-header">
          <div className="flex items-center gap-2 min-w-0"><h2>{t.title}</h2>
            <small>· {mode === 'play' ? t.liveLabel : mode === 'paused' ? l('Paused', '已暂停') : t.previewLabel}</small>
          </div>
          <div className="stage-row">
            {mode === 'edit' && <button className="stage-primary stage-team-play" type="button" disabled={emptyPreview}
              onClick={() => start(scene)}><Play size={12} fill="currentColor" aria-hidden="true" />{t.playBtn}</button>}
            {mode === 'play' && <button type="button" onClick={() => setMode('paused')}>{l('Pause', '暂停')}</button>}
            {mode === 'paused' && <button className="stage-primary" type="button" onClick={resume}>{l('Resume', '继续')}</button>}
            {mode !== 'edit' && <>
              <button type="button" className="stage-team-stop" onClick={stop}><Square size={12} fill="currentColor" aria-hidden="true" />{t.stopBtn}</button>
              <button type="button" className="stage-icon" aria-label={t.restart} title={t.restart} onClick={restart}><RotateCcw size={14} /></button>
            </>}
            <button ref={fullButton} type="button" className="stage-icon" onClick={() => void toggleFull()} aria-label={full ? l('Exit fullscreen', '退出全屏') : l('Fullscreen', '全屏')} title={full ? l('Exit fullscreen', '退出全屏') : l('Fullscreen', '全屏')}>{full ? <Minimize size={16} /> : <Maximize size={16} />}</button>
            {!full && <button type="button" className="stage-icon" aria-label={t.collapse} onClick={props.onToggle}><PanelRightClose size={16} /></button>}
          </div>
        </header>
        <div className="stage-body">
          <section className="stage-main stage-play" aria-label={l('Play stage', '试玩舞台')}>
            <StagePlayProperties lang={props.lang} scopedVariables={props.variables} onUpdatePlayValue={props.onUpdatePlayValue} />
            {(scenes.length > 1 || showStats) && <div className="stage-toolbar">
              {scenes.length > 1 && <span className="stage-scene-name">{playScene.name}</span>}
              {showStats && <span className="stage-stats">
                {stats.usesScore && l('Score ', '分数 ') + activeRun.score}{stats.usesHp && (stats.usesScore ? ' · ' : '') + 'HP ' + activeRun.hp}
              </span>}
            </div>}
            <div className={'stage-view stage-team-view' + (emptyPreview ? ' stage-team-empty' : '')}>
              <canvas ref={playViewport} tabIndex={0} aria-label={l('Play viewport', '试玩画面')}
                onPointerDown={playPointerDown}
                onPointerUp={event => {
                  const key = event.button === 2 ? 'right button' : 'left button';
                  if (keys.current.delete(key)) released.current.add(key);
                }}
                onPointerMove={event => {
                  if (mode === 'play' && event.buttons) {
                    pressed.current.add('drag:mouse position');
                    if (event.buttons & 1) pressed.current.add('drag:left button');
                    if (event.buttons & 2) pressed.current.add('drag:right button');
                  }
                }}
                onDoubleClick={event => {
                  if (mode === 'play') pressed.current.add('double-click:' + (event.button === 2 ? 'right button' : 'left button'));
                }}
                onContextMenu={event => { if (mode === 'play') event.preventDefault(); }} />
              {renderHud(playScene, run.current)}
              {renderOverlay(playScene, activeRun, true)}
              {emptyPreview && <div className="absolute pointer-events-none inset-0 flex flex-col items-center justify-center p-5 text-center">
                <div className="font-display text-sm font-bold text-[#14244B]">{t.stageEmptyTitle}</div>
                <p className="mt-1 text-[11.5px] text-[#64748B] leading-relaxed max-w-[230px]">{t.stageEmpty}</p>
              </div>}
              {waitingForChapter && <div className="absolute pointer-events-none inset-0 bg-[#0B132B]/72 backdrop-blur-[1px] flex flex-col items-center justify-center p-4 text-center gap-1.5">
                <Lock className="w-5 h-5 text-[#FBC53D]" aria-hidden="true" />
                <div className="text-xs font-bold text-white">{t.chapterLockedHint}</div>
                <div className="text-[11px] text-[#CBD5E1] max-w-[240px]">{activeRun.waitingGroups.map(id => {
                  const group = props.nodes.find(node => node.id === id);
                  const name = group?.title || group?.note;
                  return name && (group?.availableWhen ? name + ' (' + group.availableWhen + ')' : name);
                }).filter(Boolean).join(' · ')}</div>
              </div>}
              {activeRun?.finished && <div className="stage-team-ending absolute inset-0 bg-[#0B132B]/78 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center gap-2.5">
                <div className={'text-xs font-bold uppercase tracking-wider ' +
                  (activeRun.finished === 'victory' ? 'text-[#FBC53D]' : activeRun.finished === 'defeat' ? 'text-[#FDA4AF]' : 'text-[#7DD3FC]')}>
                  {activeRun.finished === 'victory' ? l('Victory', '通关成功') : activeRun.finished === 'defeat' ? l('Challenge Over', '挑战结束') : l('Scene Complete', '片段结束')}
                </div>
                {activeRun.endText && <p className="text-sm font-semibold text-white leading-snug max-w-[260px]">{activeRun.endText}</p>}
                <div className="mt-1 flex items-center gap-2">
                  <button type="button" onClick={restart} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FBC53D] hover:bg-[#F59E0B] text-[#14244B] text-xs font-bold">
                    <RotateCcw size={14} aria-hidden="true" />{t.playAgain}
                  </button>
                  <button type="button" onClick={stop} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold">
                    <Square size={12} fill="currentColor" aria-hidden="true" />{t.stopBtn}
                  </button>
                </div>
              </div>}
              {run.current?.message && run.current.time - run.current.message.at < 2.5 &&
                <div role="status" className="absolute pointer-events-none top-2.5 left-1/2 -translate-x-1/2 max-w-[92%] rounded-lg bg-slate-950/85 px-3 py-1 text-center text-[11px] font-semibold text-white">
                  {run.current.message.key === 'formula' ? l('Complete the property formula before running.', '请补充明确的属性公式')
                    : l('Choose a target and change for this outcome.', '请先设置这张 Outcome 的目标和变化')}
                </div>}
            </div>
            {mode === 'play' && activeRun && <StagePlayChapters lang={props.lang} nodes={playableNodes} run={activeRun}
              mechanisms={mechanisms} onChapter={chooseChapter} onMechanism={chooseMechanism} />}
            <StagePlaySwitches lang={props.lang} events={simulatedEvents} conditions={customFlags}
              active={playFlags} disabled={mode === 'paused'} onToggle={togglePlayFlag} />
            <StageActionControls lang={props.lang} graph={graph} run={activeRun} mode={mode}
              previewNodeIds={groupChildren && scopedPreview.length ? groupChildren : undefined} onChoose={chooseAction} />
            {mode === 'paused' && <div className="stage-row">
              <button type="button" disabled={!checkpoint.current} onClick={restore}>{l('Retry checkpoint', '从检查点复测')}</button>
              <button type="button" onClick={() => start(playScene)}>{l('Restart scene', '从入口重试')}</button>
              {trial.current.size > 0 && <button type="button" onClick={commitTrial}>{l('Keep trial edits', '保留本局修改')}</button>}
            </div>}
            {notice && <p role="status" className="stage-notice">{notice}</p>}
            {mode === 'paused' && renderInspector(true)}
            {mode !== 'paused' && <p className="text-[11px] text-[#64748B] leading-relaxed">{mode === 'play' ? t.liveHint : t.previewHint}</p>}
          </section>
          <section className="stage-main stage-edit" aria-label={l('Edit stage', '编辑舞台')}>
            <h2 className="stage-section-title">{l('Edit stage', '编辑舞台')}</h2>
            <div className="stage-toolbar" ref={toolbar}>
              <span className="stage-scene-name">{scene.name}</span>
              <button ref={addButton} type="button" className="stage-add" aria-pressed={assetPick === 'picking' || assetMenu}
                disabled={editingBackgroundImage} onClick={() => {
                if (full) {
                  setAssetSearch('');
                  setAssetMenu(!assetMenu);
                } else if (assetPick === 'picking') {
                  onAssetPickChange(null);
                } else {
                  setAssetMenu(false);
                  props.onOpenLibrary();
                  onAssetPickChange('picking');
                }
              }}><Plus size={15} aria-hidden="true" />{l('Add asset', '添加素材')}</button>
              <button ref={backgroundButton} type="button" className="stage-add" aria-expanded={editPanel === 'background'} disabled={editingBackgroundImage}
                aria-controls="stage-background-settings" onClick={() => {
                  onAssetPickChange(null); setAssetMenu(false);
                  beginBackgroundTool(null);
                  setEditPanel(editPanel === 'background' ? null : 'background');
                }}><span className="stage-background-dot" aria-hidden="true" style={{ background: background.mode === 'inherit' ? undefined : background.color }} />
                {l('Background', '背景')}</button>
              <button ref={settingsButton} type="button" className="stage-icon" aria-label={l('Scene settings', '场景设置')} title={l('Scene settings', '场景设置')} disabled={editingBackgroundImage}
                aria-expanded={editPanel === 'settings'} aria-controls="stage-scene-settings" onClick={() => {
                  onAssetPickChange(null); setAssetMenu(false);
                  beginBackgroundTool(null);
                  setEditPanel(editPanel === 'settings' ? null : 'settings');
                }}><Settings2 size={16} aria-hidden="true" /></button>
              {assetMenu && <div className="stage-popover" aria-label={l('Asset library', '素材库')}>
                <input ref={assetSearchInput} type="search" aria-label={l('Search assets', '搜索素材')} placeholder={l('Search assets', '搜索素材')} value={assetSearch} onChange={event => setAssetSearch(event.target.value)} />
                <div className="stage-asset-list">
                  {matchingAssets.map(asset => {
                    const slot = asset.states.find(state => state.id === asset.activeStateId);
                    return <button key={asset.id} type="button" onClick={() => addAsset(asset)}>
                      {slot?.mediaUrl && slot.mediaKind !== 'video' ? <img src={slot.mediaUrl} alt="" /> : <ImageIcon size={16} aria-hidden="true" />}
                      {asset.name}
                    </button>;
                  })}
                  {!matchingAssets.length && <small>{l('No matching assets', '没有匹配的素材')}</small>}
                </div>
              </div>}
            </div>
            {editPanel === 'background' && <StageBackgroundSettings lang={props.lang} assets={props.assets} background={background}
              segments={segments} segment={selectedSegment} boundary={selectedBoundary} tool={backgroundTool}
              pendingAsset={pendingBackgroundAsset} notice={backgroundNotice}
              onChange={changeBackground} onTool={beginBackgroundTool} onAsset={chooseBackgroundAsset}
              onPlaceInView={() => placeBackgroundAt()}
              onRemoveSegment={() => {
                if (!selectedSegment) return;
                updateBackgroundSections(items => items.filter(item => item.id !== selectedSegment.id));
                resetBackgroundSelection();
              }}
              onResetFrame={() => {
                if (!selectedSegment || !backgroundDraft) return;
                const image = fittedBackgroundImage({ ...selectedSegment, imagePlacement: undefined, frame: undefined });
                if (image) setBackgroundDraft({ ...backgroundDraft, image });
              }}
              onSaveFrame={() => finishBackgroundImageEdit(true)} onCancelFrame={() => finishBackgroundImageEdit(false)}
              onSaveFrameAndAdd={() => { finishBackgroundImageEdit(true); beginBackgroundTool('add'); }}
              onMoveSection={moveBackgroundSection}
              onMoveBoundary={moveBackgroundBoundary}
              onTransition={(id, transition) => editBackgroundSegment(id, { transition, transitionFrom: selectedBoundary?.leftId })} />}
            {editPanel === 'settings' && <section id="stage-scene-settings" className="stage-inline-panel" aria-label={l('Scene settings', '场景设置')}>
              <div className="stage-row">
                {scenes.length > 1 && <select aria-label={l('Scene', '场景')} value={scene.id} onChange={event => changeScene(event.target.value)}>
                  {scenes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>}
                <button type="button" onClick={() => {
                  const next = createScene(l('Scene ', '场景 ') + (scenes.length + 1), l('Player', '玩家'));
                  setScenes(items => [...items, next]);
                  changeScene(next.id);
                }}>{l('New scene', '新建场景')}</button>
                <label className="stage-check"><input type="checkbox" checked={grid} onChange={event => setGrid(event.target.checked)} />{l('Show grid', '显示网格')}</label>
              </div>
              <fieldset>
                <label>{l('Name', '名称')}<input value={scene.name} onChange={event => updateScene({ name: event.target.value })} /></label>
                {numeric(l('Map width', '地图宽度'), scene.width, width => {
                  updateScene({ width });
                  if (zoom !== 1) setZoom(VIEW_WIDTH / width);
                  setPan(Math.min(pan, maxPan({ ...scene, width }, zoom)));
                }, VIEW_WIDTH)}
                {numeric(l('Map height', '地图高度'), scene.height, height => updateScene({ height }), VIEW_HEIGHT)}
                <label>{l('Board group', '设计板机制组')}<select value={scene.entryGroupId ?? ''} onChange={event => updateScene({ entryGroupId: event.target.value || undefined })}>
                  <option value="">{l('None', '无')}</option>
                  {props.nodes.filter(node => node.kind === 'group').map(node => <option key={node.id} value={node.id}>{node.title || node.id}</option>)}
                </select></label>
              </fieldset>
            </section>}
            {assetPick === 'picking' && <p className="stage-pick-hint" role="status">{l('Choose an asset from the library on the left.', '从左侧素材库选择一个素材。')}</p>}
            <div className="stage-view">
              <canvas ref={viewport} tabIndex={0} aria-label={l('Edit viewport', '编辑画面')}
                onPointerDown={pointerDown} onPointerMove={pointerMove}
                onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
                onDragOver={event => event.preventDefault()}
                onDrop={event => {
                  event.preventDefault();
                  if (backgroundDraft) return;
                  const asset = props.assets.find(item => item.id === event.dataTransfer.getData('text/plain'));
                  if (asset) addAsset(asset, point(event));
                }} />
              {renderHud(scene, run.current?.sceneId === scene.id ? run.current : undefined, true)}
              {renderOverlay(scene, run.current?.sceneId === scene.id ? run.current : undefined, false)}
            </div>
            {(scene.width > VIEW_WIDTH || editPanel === 'background' && hasBackgroundSections) && <div className="stage-map-nav">
              <div className="stage-map-track">
                <span className="stage-map-label">{l('Map overview', '关卡总览')}
                  <small>X {Math.round(pan)}–{Math.round(pan + visibleMapWidth)} / {scene.width}</small>
                </span>
                <span className="stage-map-rail" data-pannable={!wholeMapVisible}
                  onPointerDown={startMapDrag} onPointerMove={moveMapDrag} onPointerUp={endMapDrag}
                  onPointerCancel={endMapDrag} onLostPointerCapture={endMapDrag}
                  style={{ backgroundColor: background.mode === 'inherit' ? undefined : background.color }}>
                  <span className="stage-map-window" aria-hidden="true"
                    style={{ left: pan / scene.width * 100 + '%', width: visibleMapWidth / scene.width * 100 + '%' }} />
                  <input type="range" min="0" max={maxPan(scene, zoom)} step="any" value={pan}
                    aria-label={l('Map overview', '关卡总览')} disabled={wholeMapVisible}
                    onChange={event => setPan(Number(event.target.value))} />
                </span>
                {editPanel === 'background' && hasBackgroundSections && <StageBackgroundTrack
                  lang={props.lang} width={scene.width} preferredWidth={VIEW_WIDTH} color={background.color}
                  segments={segments} assets={props.assets} segmentId={segmentId} boundaryId={selectedBoundary?.id}
                  pendingAsset={pendingBackgroundAsset} editingImage={editingBackgroundImage} onSelect={chooseBackgroundSegment} onBoundary={chooseBackgroundBoundary}
                  onMove={moveBackgroundBoundary} onMoveSection={moveBackgroundSection} onPlace={placeBackgroundAt} />}
              </div>
              {scene.width > VIEW_WIDTH && <button type="button" onClick={() => {
                if (wholeMapVisible) {
                  setZoom(1);
                  setPan(Math.min(detailPan.current, maxPan(scene, 1)));
                } else {
                  detailPan.current = pan;
                  setPan(0);
                  setZoom(VIEW_WIDTH / scene.width);
                }
              }}>{wholeMapVisible ? l('100%', '100%') : l('Fit map', '查看全图')}</button>}
            </div>}
            {renderInspector(false)}
          </section>
        </div>
      </>}
    </aside>
  );
}

type PaintView = {
  graph: { nodes: BoardNode[]; edges: BoardEdge[] };
  props: StageEditorProps;
  mode: Mode | 'preview';
  run?: StageRun;
  trial?: ReadonlyMap<string, Partial<Placement>>;
  time: number;
  pan: number;
  zoom: number;
  grid: boolean;
  bounds: boolean;
  selectedId?: string;
  zh: boolean;
  backgroundDraft?: BackgroundImageDraft;
  backgroundSelection?: BackgroundSegment;
  emptyPreview?: boolean;
};
type SpriteCache = WeakMap<HTMLImageElement, Map<string, ReturnType<typeof bakeStaticEffectsToCanvas>>>;

function paint(ctx: CanvasRenderingContext2D, width: number, height: number, scene: Scene, view: PaintView,
  images: Map<string, HTMLImageElement>, bakedSprites: SpriteCache) {
  if (view.mode === 'preview' && view.emptyPreview) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return;
  }
  const { run, pan, zoom, time } = view;
  ctx.setTransform(width / VIEW_WIDTH, 0, 0, height / VIEW_HEIGHT, 0, 0);
  ctx.save();
  ctx.scale(zoom, zoom);
  drawStageBackdrop(ctx, scene.theme ?? 'neutral', VIEW_WIDTH / zoom, VIEW_HEIGHT / zoom, scene.height - 28, time, 0, null);
  ctx.translate(-pan, 0);
  drawSceneBackground(ctx, scene, pan, zoom, view.props.assets, images, view.backgroundDraft, run?.visualOutcomes, time);

  const drawAsset = (item: Placement, x: number, y: number, behavior?: ReturnType<typeof cardPreviewBehavior>, spin: -1 | 0 | 1 = 0, age = time) => {
    const asset = view.props.assets.find(candidate => candidate.id === item.assetId);
    const slot = asset?.states.find(state => state.id === asset.activeStateId) ?? asset?.states[0];
    const visual = asset && run?.visualOutcomes[asset.id];
    const sceneVisual = visual ? { run: visual, time } : undefined;
    if (isHiddenByEffect(getOutcomeVisualEffects(slot?.visualEffects, visual, time))) return;
    const url = slot?.mediaKind === 'video' ? undefined : slot?.mediaUrl;
    const sprite = loadStageImage(url, images);
    let baked = null;
    if (sprite) {
      let entries = bakedSprites.get(sprite);
      if (!entries) {
        entries = new Map();
        bakedSprites.set(sprite, entries);
      }
      const fingerprint = getStaticEffectsFingerprint(slot?.visualEffects);
      if (!entries.has(fingerprint)) entries.set(fingerprint, bakeStaticEffectsToCanvas(sprite, slot?.visualEffects));
      baked = entries.get(fingerprint) ?? null;
    }
    const rotation = item.rotation * Math.PI / 180;
    if (behavior) {
      drawChallengeEntity(ctx, x, y, 13, behavior.visual, age, sprite, spin, baked, slot?.visualEffects,
        { width: item.width, height: item.height, rotation }, sceneVisual);
    } else if (asset?.interfaceMode === 'text' && asset.typography) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.fillStyle = asset.typography.textColor;
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(asset.typography.text, -item.width / 2, 4, item.width);
      ctx.restore();
    } else if (sprite) {
      drawSpriteWithEffects(ctx, sprite, baked, x, y, item.width, item.height, slot?.visualEffects, time, rotation, 1, sceneVisual);
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.fillStyle = item.kind === 'platform' ? '#64748b' : '#6987a7';
      ctx.fillRect(-item.width / 2, -item.height / 2, item.width, item.height);
      ctx.restore();
    }
  };

  const editing = view.mode === 'edit';
  const placements = !editing && run ? run.entities : scene.placements;
  const activeById = editing && run ? new Map(run.entities.map(item => [item.id, item])) : undefined;
  const inheritsBackground = !scene.background || scene.background.mode === 'inherit';
  if (inheritsBackground) {
    for (const item of [...placements].sort((a, b) => a.layer - b.layer)) {
      if (item.kind === 'background' && !item.isHidden) drawAsset(item, item.x, item.y);
    }
  }
  if (view.grid) {
    ctx.fillStyle = '#b8cadf';
    for (let x = Math.floor(pan / 20) * 20; x < pan + VIEW_WIDTH / zoom; x += 20) {
      for (let y = 0; y < VIEW_HEIGHT / zoom; y += 20) ctx.fillRect(x, y, 1.3, 1.3);
    }
  }

  const layered: StageEntity[] = [...placements].sort((a, b) => a.layer - b.layer);
  for (const item of layered) {
    if (item.isHidden || screenObject(item.kind) || item.kind === 'background' || (!editing && run && !isActive(item, run))) continue;
    if (isHelper(item)) {
      if (item.kind === 'spawn' && !run && item.id === scene.entrySpawnId && item.assetId) drawAsset(item, item.x, item.y);
      continue;
    }
    const card = item.kind === 'challenge' && view.graph.nodes.find(node => node.id === item.nodeId);
    const behavior = card ? cardPreviewBehavior(card) : undefined;
    if (behavior?.isSceneOnly) continue;
    const selected = view.mode !== 'play' && item.id === view.selectedId;
    const age = run ? Math.max(0, time - (run.activationTimes[item.id] ?? run.entryTime)) : time;
    const motion = view.mode === 'preview' && card && behavior
      ? { ...item, ...challengeMotion(item, behavior, challengeSpeed(item, card, behavior), scene, age, true) }
      : editing ? stageEditPose(item, activeById?.get(item.id), view.trial?.get(item.id)) : item;
    const spriteRadius = Math.hypot(item.width, item.height) / 2;
    const spriteVisible = motion.x + spriteRadius >= pan && motion.x - spriteRadius <= pan + VIEW_WIDTH / zoom;
    if (behavior && (view.mode === 'preview' || selected && editing)) {
      drawBehaviorGuide(ctx, editing ? item : motion, item, behavior, zoom, editing ? 0 : time);
    }
    if (spriteVisible && (editing || !run || isActive(item, run)) && !motion.collected && !motion.open) {
      drawAsset(item, motion.x, motion.y, behavior, motion.spin, age);
    }
    if (!selected) continue;
    if (!editing && item.kind === 'challenge') drawColliderOutline(ctx, item, zoom);
    ctx.font = '10px sans-serif';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5 / zoom;
    ctx.strokeText(item.name, item.x - item.width / 2, item.y - item.height / 2 - 4);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(item.name, item.x - item.width / 2, item.y - item.height / 2 - 4);
  }

  const spawn = run && scene.placements.find(item => item.id === scene.entrySpawnId);
  if (run && spawn && spawn.assetId && !spawn.isHidden) {
    const hero = { ...spawn, x: run.player.x, y: run.player.y + (run.player.height - spawn.height) / 2 };
    drawAsset(hero, hero.x, hero.y);
  }
  if (run) {
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#7dd3fc';
    ctx.shadowBlur = 6;
    for (const wave of run.waves) {
      ctx.beginPath();
      ctx.ellipse(wave.x, wave.y, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (run.guardUntil && run.guardUntil > run.time) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(run.player.x, run.player.y, 17, 22, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();

  if (run && !editing && !run.finished) {
    const seconds = run.entities.reduce((remaining, item) => {
      if (item.collected || item.open || !isActive(item, run)) return remaining;
      const card = view.graph.nodes.find(node => node.id === item.nodeId && node.kind === 'challenge');
      const limit = card && cardPreviewTimeLimit(card, view.graph.edges);
      if (limit == null) return remaining;
      const left = limit - (run.time - (run.activationTimes[item.id] ?? run.entryTime));
      return left >= 0 ? Math.min(remaining, left) : remaining;
    }, Infinity);
    if (Number.isFinite(seconds)) {
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'right';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      const label = Math.ceil(seconds) + 's';
      ctx.strokeText(label, VIEW_WIDTH - 12, 22);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(label, VIEW_WIDTH - 12, 22);
      ctx.textAlign = 'start';
    }
  }

  for (const item of placements.filter(item => screenObject(item.kind) && !item.isHidden)) {
    const position = anchoredPosition(item);
    if (item.kind === 'hud') {
      const binding = view.props.assets.find(asset => asset.id === item.assetId && asset.categoryId === 'interface')?.displayBinding;
      const hasBoundReadout = binding && (run?.variables ?? view.props.variables).some(entry => entry.variable.id === binding.variableId);
      if (item.assetId && !hasBoundReadout) drawAsset(item, position.x, position.y);
      if (item.hud) {
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(item.hud === 'hp' ? 'HP ' + (run?.hp ?? 0) : (view.zh ? '分数 ' : 'Score ') + (run?.score ?? 0), position.x, position.y);
      }
    }
    if (view.mode === 'preview' || view.mode === 'play' || (editing && item.id === view.selectedId) ||
      (item.id !== view.selectedId && (item.kind !== 'subtitle' || !editing))) continue;
    ctx.strokeStyle = item.id === view.selectedId ? '#60a5fa' : '#94a3b8';
    if (item.kind === 'subtitle') ctx.strokeRect(item.anchor?.endsWith('right') ? position.x - item.width : position.x,
      item.anchor?.startsWith('bottom') ? position.y - item.height : position.y, item.width, item.height);
    else ctx.strokeRect(position.x - item.width / 2, position.y - item.height / 2, item.width, item.height);
  }
  const selected = editing ? scene.placements.find(item => item.id === view.selectedId && !item.isHidden &&
    (item.kind !== 'background' || inheritsBackground)) : undefined;
  if (selected) {
    const card = selected.kind === 'challenge' && view.graph.nodes.find(node => node.id === selected.nodeId);
    if (!card || !cardPreviewBehavior(card).isSceneOnly) {
      const fixed = screenObject(selected.kind);
      const scale = fixed ? 1 : zoom;
      const box = placementBox(selected);
      ctx.save();
      if (!fixed) {
        ctx.scale(zoom, zoom);
        ctx.translate(-pan, 0);
      }
      const pivot = anchoredPosition(selected);
      ctx.save();
      ctx.translate(pivot.x, pivot.y);
      ctx.rotate(selected.rotation * Math.PI / 180);
      ctx.translate(-pivot.x, -pivot.y);
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1.4 / scale;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.restore();
      if (selected.kind === 'challenge' && view.bounds) drawColliderOutline(ctx, selected, scale);
      for (const handle of stageHandles(selected, scale, view.bounds)) drawStageHandle(ctx, handle, scale);
      ctx.restore();
    }
  }
  const draft = editing && view.backgroundDraft?.sceneId === scene.id ? view.backgroundDraft : undefined;
  if (draft && scene.background) {
    const segment = backgroundSegments(scene.background, scene.width).find(item => item.id === draft.segmentId);
    if (segment) drawBackgroundImageEditor(ctx, draft.image, segment, scene.height - 28, pan, zoom);
  } else if (editing && view.backgroundSelection) {
    const segment = view.backgroundSelection;
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-pan, 0);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([5 / zoom, 4 / zoom]);
    ctx.strokeRect(segment.start, 0, segment.end - segment.start, scene.height - 28);
    ctx.restore();
  }
}

function drawBackgroundImageEditor(
  ctx: CanvasRenderingContext2D, image: BackgroundImagePlacement, segment: BackgroundSegment, height: number, pan: number, zoom: number,
) {
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-pan, 0);
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([5 / zoom, 4 / zoom]);
  ctx.strokeRect(segment.start, 0, segment.end - segment.start, height);
  ctx.setLineDash([]);
  ctx.strokeStyle = '#c4b5fd';
  ctx.strokeRect(image.x, image.y, image.width, image.height);
  ctx.fillStyle = '#f5f3ff';
  const size = 8 / zoom;
  for (const { x, y } of backgroundScaleHandles(image, pan, zoom)) {
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
  }
  ctx.restore();
}

function drawColliderOutline(ctx: CanvasRenderingContext2D, item: Placement, scale: number) {
  const box = colliderBox(item);
  ctx.save();
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 1.7 / scale;
  ctx.setLineDash([5 / scale, 3 / scale]);
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();
}

function drawStageHandle(ctx: CanvasRenderingContext2D, handle: StageHandle, scale: number) {
  const { x, y } = handle.at;
  const size = 7 / scale;
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 1.5 / scale;
  ctx.fillStyle = '#fff';
  if (handle.kind === 'size') {
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    return;
  }
  if (handle.kind === 'rotation') {
    ctx.beginPath();
    ctx.moveTo(handle.stem.x, handle.stem.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 5 / scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }
  ctx.fillStyle = '#fbbf24';
  ctx.strokeStyle = '#78350f';
  const radius = 4.5 / scale;
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius, y);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - radius, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawBehaviorGuide(ctx: CanvasRenderingContext2D, at: Point, item: Placement,
  behavior: ReturnType<typeof cardPreviewBehavior>, zoom: number, time: number) {
  const { direction } = behavior;
  const vertical = direction === 'up' || direction === 'down';
  const reverse = direction === 'left' || direction === 'up';
  const start = (vertical ? item.height : item.width) / 2 + 5;
  const from = direction === 'patrol' ? -start - 22 : reverse ? -start : start;
  const to = reverse ? from - 35 : start + 35;
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = behavior.pattern === 'collectible' ? '#fbc53d' : '#fb923c';
  ctx.lineWidth = 1.5 / zoom;
  ctx.translate(at.x, at.y);
  if (vertical) ctx.rotate(Math.PI / 2);
  if (direction === 'patrol') ctx.translate(0, item.height / 2 + 6);
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  if (direction === 'static') {
    ctx.ellipse(0, 0, item.width / 2 + 4 + Math.sin(time * 3.2) * 2, item.height / 2 + 4, 0, 0, Math.PI * 2);
  } else {
    ctx.moveTo(from, 0);
    ctx.lineTo(to, 0);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  if (direction !== 'static') {
    const arrowhead = (x: number, sign: number) => {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - 6 * sign, -3.5);
      ctx.lineTo(x - 6 * sign, 3.5);
      ctx.closePath();
      ctx.fill();
    };
    arrowhead(to, reverse ? -1 : 1);
    if (direction === 'patrol') arrowhead(from, -1);
  }
  ctx.restore();
}
