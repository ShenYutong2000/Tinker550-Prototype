import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction, type PointerEvent } from 'react';
import { Image as ImageIcon, Lock, Maximize, Minimize, PanelRightClose, PanelRightOpen, Play, Plus, Redo2, RotateCcw, Settings2, Square, Undo2 } from 'lucide-react';
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
import { anchoredPosition, colliderBox, COLLIDER_SIDES, copyPlacements, createLibraryPlacement, createScene, exposedParameters, makeId, patchScenePlacement, placementBox, projectBoardScenes, RESIZE_CORNERS, resizeCollider, resizePlacement, resolveStageParameter, rotatePlacement, rotateStagePoint, stageParameterSourceLabel, VIEW_HEIGHT, VIEW_WIDTH, type ColliderSide, type Placement, type Point, type ResizeCorner, type Scene, type StageBoardSelection, type StageBoardTarget, type StageKind } from './stageProject';
import type { StageSceneUpdate } from './stageHistory';
import { BackgroundItemInspector, StageBackgroundSettings, type BackgroundChange, type BackgroundTool } from './StageBackgroundSettings';
import { backgroundImageBox, editableBackground, getBackgroundImage, rectangleBetween, resizeBackgroundImage, snapBackgroundBox, type BackgroundBox, type BackgroundElement, type BackgroundImage, type BackgroundPreview, type FreeBackground } from './stageBackground';
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
  onScenesChange: (sceneId: string, update: StageSceneUpdate, group?: symbol) => void;
  onRetainAnchors: (scenes: Scene[]) => void;
  undoSceneId?: string;
  redoSceneId?: string;
  onUndo: () => void;
  onRedo: () => void;
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
  onLocate: (target: StageBoardTarget) => void;
  onUpdateBoardTrial: (selection?: StageBoardSelection) => void;
  assetPick: 'picking' | { assetId: string } | null;
  onAssetPickChange: (pick: 'picking' | { assetId: string } | null) => void;
  onOpenLibrary: () => void;
  onOpenAsset: (assetId: string, propertyId?: string) => void;
  onSaveAsset: (sceneId: string, placement: Placement) => void;
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
type StageHandleHit = StageHandle & { pose: Placement };

function backgroundScaleHandles(image: BackgroundBox, pan: number, zoom: number) {
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
  const [trialEditsEnabled, setTrialEditsEnabled] = useState(false);
  const [assetMenu, setAssetMenu] = useState(false);
  const [editPanel, setEditPanel] = useState<'background' | 'settings' | null>(null);
  const [backgroundId, setBackgroundId] = useState<string>();
  const [backgroundTool, setBackgroundTool] = useState<BackgroundTool>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<BackgroundPreview>();
  const [backgroundNotice, setBackgroundNotice] = useState<'loading' | 'unavailable'>();
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
  const backgroundOverview = useRef<HTMLCanvasElement>(null);
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
  const drags = useRef<{ pin: number; x: number; y: number; item?: Placement; handle?: StageHandleHit; group?: symbol; trial?: boolean } | undefined>(undefined);
  const fieldEdit = useRef<{ input: HTMLInputElement; group: symbol } | undefined>(undefined);
  const fieldEvent = useRef<symbol | undefined>(undefined);
  const mapDrag = useRef<{ pointerId: number; offset: number } | undefined>(undefined);
  const backgroundDrag = useRef<{
    pointerId: number; origin: Point; element: BackgroundElement; corner?: ResizeCorner; creating?: boolean;
  } | undefined>(undefined);
  const detailPan = useRef(0);
  const trial = useRef(new Map<string, Partial<Placement>>());
  const images = useRef(new Map<string, HTMLImageElement>());
  const bakedSprites = useRef(new WeakMap<HTMLImageElement, Map<string, ReturnType<typeof bakeStaticEffectsToCanvas>>>());
  const audio = useRef<HTMLAudioElement | null>(null);
  const graph = { scenes, nodes: props.nodes, edges: props.edges, comboFrames: props.comboFrames, assets: props.assets };
  const scene = scenes.find(item => item.id === sceneId) ?? scenes[0];
  const pan = Math.max(0, Math.min(requestedPan, maxPan(scene, zoom)));
  const playScene = scenes.find(item => item.id === run.current?.sceneId) ?? scene;
  const playableNodes = useMemo(() => getPlayableNodes(props.nodes), [props.nodes]);
  const emptyPreview = !playableNodes.length && playScene.placements.every(isHelper)
    && (!playScene.background || playScene.background.mode === 'inherit');
  const sceneDraft = sceneDrafts.find(item => item.id === scene.id)!;
  const background = editableBackground(scene);
  const selectedBackground = background.elements.find(item => item.id === backgroundId);
  const objects = scene.placements.filter(item => !isHelper(item) && item.kind !== 'background');
  const inspectedObjects = (run.current?.entities ?? []).filter(item => !isHelper(item) && item.kind !== 'background');
  const selected = objects.find(item => item.id === selectedId);
  const trialEditing = mode === 'paused' && trialEditsEnabled;
  const editingRunScene = mode === 'paused' && run.current?.sceneId === scene.id;
  const trialSelection = editingRunScene ? inspectedObjects.find(item => item.id === selectedId) : undefined;
  const matchingAssets = assetMenu ? props.assets.filter(asset => asset.name.toLowerCase().includes(assetSearch.trim().toLowerCase())) : [];
  const visibleMapWidth = Math.min(scene.width, VIEW_WIDTH / zoom);
  const wholeMapVisible = scene.width - visibleMapWidth < .01;
  const { assetPick, onAssetPickChange } = props;
  const backgroundSelection = editPanel === 'background' && !backgroundTool
    ? backgroundPreview?.element.id === selectedBackground?.id ? backgroundPreview?.element : selectedBackground : undefined;
  const controls = useRef({ graph, scene, props, mode, pan, zoom, selectedId, trialEditing, bounds, grid, zh, backgroundPreview, backgroundSelection, emptyPreview });
  controls.current = { graph, scene, props, mode, pan, zoom, selectedId, trialEditing, bounds, grid, zh, backgroundPreview, backgroundSelection, emptyPreview };
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
      const value = entry.variable.stageParameterId ? entry.variable.initialValue
        : useEdit ? edit.value ?? entry.variable.initialValue : previous.get(entry.variable.id) ?? entry.variable.initialValue;
      return { ...entry, playValue: coerceVariableValue(entry.variable, value) };
    });
    if (edit) redraw(value => value + 1);
  }, [props.playValueEdit, props.variables]);

  function captureFieldEdit(event: FormEvent<HTMLElement>) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !['text', 'number', 'color'].includes(input.type)) return;
    if (fieldEdit.current?.input !== input) fieldEdit.current = { input, group: Symbol() };
    fieldEvent.current = fieldEdit.current.group;
    queueMicrotask(() => { fieldEvent.current = undefined; });
  }
  const updateScene = (change: Partial<Scene>) => setScenes(scene.id, current => current.map(item =>
    item.id === scene.id && (Object.keys(change) as (keyof Scene)[]).some(key => !Object.is(item[key], change[key]))
      ? { ...item, ...change } : item), fieldEvent.current);
  const updateBackground = useCallback((change: (source: FreeBackground) => FreeBackground) => {
    setScenes(scene.id, current => current.map(item => {
      if (item.id !== scene.id) return item;
      const source = item.background?.mode === 'free' ? item.background : editableBackground(scene);
      const background = change(source);
      return background === source ? item : { ...item, background };
    }), fieldEvent.current);
  }, [scene, setScenes]);

  function chooseBackgroundTool(tool: BackgroundTool) {
    backgroundDrag.current = undefined;
    setBackgroundPreview(undefined);
    setBackgroundNotice(undefined);
    setBackgroundTool(tool);
    if (tool?.kind === 'image') {
      const asset = props.assets.find(item => item.id === tool.assetId);
      if (asset) loadStageImage(getBackgroundImage(asset)?.mediaUrl, images.current);
    }
  }
  function closeBackground() {
    chooseBackgroundTool(null);
    setBackgroundId(undefined);
    setEditPanel(null);
  }
  function selectBackground(id: string, reveal = false) {
    setBackgroundId(id);
    if (!reveal || wholeMapVisible) return;
    const item = background.elements.find(candidate => candidate.id === id);
    if (item && (item.x + item.width <= pan || item.x >= pan + visibleMapWidth)) {
      setPan(item.x - Math.min(item.width, visibleMapWidth) / 4);
    }
  }
  function editBackgroundItem(change: BackgroundChange) {
    if (!selectedBackground) return;
    updateBackground(source => ({
      ...source, elements: source.elements.map(item => {
        if (item.id !== selectedBackground.id) return item;
        if (item.kind === 'image' && !item.locked) {
          if (change.width !== undefined && change.height === undefined) return { ...item, ...change, height: item.height * change.width / item.width };
          if (change.height !== undefined && change.width === undefined) return { ...item, ...change, width: item.width * change.height / item.height };
        }
        return { ...item, ...change };
      }),
    }));
  }
  function moveBackgroundLayer(direction: -1 | 1) {
    updateBackground(source => {
      const index = source.elements.findIndex(item => item.id === backgroundId);
      const neighbor = index + direction;
      if (index < 0 || neighbor < 0 || neighbor >= source.elements.length) return source;
      const elements = [...source.elements];
      [elements[index], elements[neighbor]] = [elements[neighbor], elements[index]];
      return { ...source, elements };
    });
  }
  function showFullBackgroundImage() {
    if (selectedBackground?.kind !== 'image' || selectedBackground.locked) return;
    const asset = props.assets.find(item => item.id === selectedBackground.assetId);
    const image = asset && loadStageImage(getBackgroundImage(asset)?.mediaUrl, images.current);
    if (image) editBackgroundItem({ ...backgroundImageBox(selectedBackground, image.naturalWidth, image.naturalHeight), crop: undefined });
  }
  useLayoutEffect(() => {
    props.onRetainAnchors(scenes);
    if (run.current && !scenes.some(item => item.id === run.current?.sceneId)) {
      stop();
    } else if (run.current) {
      syncRunScenes(run.current, previousScenes.current, scenes, trial.current);
      redraw(value => value + 1);
    }
    if (!scenes.some(item => item.id === sceneId)) changeScene(scenes[0].id);
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
  const editItem = (patch: Partial<Placement>, id = selectedId, group = fieldEvent.current) => {
    if (!id) return;
    setScenes(scene.id, current => current.map(item => item.id === scene.id ? patchScenePlacement(item, id, patch) : item), group);
  };
  const editTrial = (id: string, patch: Partial<Placement>) => {
    const active = run.current;
    const entity = active?.entities.find(item => item.id === id);
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
    if ('parameters' in patch) props.onUpdateBoardTrial({
      sceneId: active.sceneId, placementId: entity.id, trialParameters: patch.parameters,
    });
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
    setScenes(activeScene, current => current.map(item => item.id === activeScene
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
    props.onUpdateBoardTrial();
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
      } else if (editPanel === 'background' && (backgroundTool || backgroundDrag.current)) {
        chooseBackgroundTool(null);
        viewport.current?.focus({ preventScroll: true });
      } else if (editPanel) {
        setEditPanel(null);
        setBackgroundId(undefined);
        (editPanel === 'background' ? backgroundButton : settingsButton).current?.focus();
      } else if (full && !document.fullscreenElement) void leaveFull();
    };
    document.addEventListener('fullscreenchange', change);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('fullscreenchange', change);
      window.removeEventListener('keydown', escape);
    };
  }, [assetMenu, assetPick, backgroundTool, editPanel, full, leaveFull, onAssetPickChange]);
  useEffect(() => {
    if (!assetMenu) return;
    assetSearchInput.current?.focus();
    const close = (event: globalThis.PointerEvent) => {
      if (!toolbar.current?.contains(event.target as Node)) setAssetMenu(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [assetMenu]);
  const locate = async (target: StageBoardTarget) => {
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
    props.onUpdateBoardTrial();
    keys.current.clear();
    pressed.current.clear();
    setNotice('');
    props.onPlayVariables({});
    setAssetMenu(false);
    onAssetPickChange(null);
    setInspectedId(undefined);
    setInspectedEdgeId(undefined);
    setTrialEditsEnabled(false);
    setMode('play');
    playViewport.current?.focus();
    props.onPlay();
  };
  const stop = () => {
    audio.current?.pause();
    run.current = undefined;
    checkpoint.current = undefined;
    trial.current.clear();
    setInspectedId(undefined);
    setInspectedEdgeId(undefined);
    setTrialEditsEnabled(false);
    props.onUpdateBoardTrial();
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
    props.onUpdateBoardTrial();
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
          const values = Object.fromEntries(active.variables.filter(entry => !entry.variable.stageParameterId).map(entry => [entry.variable.id, entry.playValue]));
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
        showInactivePlacements: live.mode === 'paused',
      });
      const currentScene = live.graph.scenes.find(item => item.id === active?.sceneId) ?? live.scene;
      paintCanvas(playViewport.current, currentScene, {
        ...live, mode: active ? live.mode : 'preview', run: active, time: active?.time ?? previewTime,
        pan: active ? sceneCamera(currentScene, active) : live.pan,
        zoom: active ? 1 : live.zoom, grid: false,
        selectedId: undefined, trialEditing: false,
      });
      const map = backgroundOverview.current;
      const ctx = map?.getContext('2d');
      if (map?.clientWidth && map.clientHeight && ctx) {
        const dpr = Math.min(window.devicePixelRatio, 2);
        const width = Math.round(map.clientWidth * dpr);
        const height = Math.round(map.clientHeight * dpr);
        if (map.width !== width || map.height !== height) { map.width = width; map.height = height; }
        ctx.setTransform(width / live.scene.width, 0, 0, height / live.scene.height, 0, 0);
        ctx.clearRect(0, 0, live.scene.width, live.scene.height);
        drawSceneBackground(ctx, live.scene, 0, live.scene.width, live.scene.height, live.props.assets, images.current, live.backgroundPreview);
      }
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
  const makeBackgroundImage = useCallback((asset: AssetItem, at: Point, id: string): BackgroundImage | undefined => {
    const image = loadStageImage(getBackgroundImage(asset)?.mediaUrl, images.current);
    if (!image) return;
    const scale = Math.max((scene.height - 28) / image.naturalHeight, 8 / image.naturalWidth, 8 / image.naturalHeight);
    const height = image.naturalHeight * scale;
    const width = image.naturalWidth * scale;
    const box = { kind: 'image' as const, id, assetId: asset.id, x: at.x, y: at.y, width, height };
    return { ...box, ...snapBackgroundBox(box, editableBackground(scene).elements, scene, 6 / zoom) };
  }, [scene, zoom]);

  const addAsset = useCallback((asset: AssetItem, at?: Point) => {
    const backgroundSlot = asset.categoryId === 'backgrounds' ? getBackgroundImage(asset) : undefined;
    if (backgroundSlot) {
      setEditPanel('background');
      setSelectedId(undefined);
      if (at) {
        chooseBackgroundTool(null);
        const id = makeId();
        const place = () => {
          const added = makeBackgroundImage(asset, at, id);
          if (!added) return false;
          updateBackground(source => ({ ...source, elements: [...source.elements, added] }));
          if (controls.current.scene.id === scene.id) {
            setBackgroundId(id);
            setBackgroundNotice(undefined);
          }
          return true;
        };
        if (!place()) {
          setBackgroundNotice('loading');
          const image = images.current.get(backgroundSlot.mediaUrl);
          void image?.decode().then(() => {
            if (!place() && controls.current.scene.id === scene.id) setBackgroundNotice('unavailable');
          }).catch(() => {
            if (controls.current.scene.id === scene.id) setBackgroundNotice('unavailable');
          });
        }
      } else chooseBackgroundTool({ kind: 'image', assetId: asset.id });
    } else {
      const world = at ?? { x: Math.round(pan + VIEW_WIDTH / (2 * zoom)), y: Math.min(Math.round(VIEW_HEIGHT / (2 * zoom)), scene.height - 45) };
      const screen = at ? { x: (at.x - pan) * zoom, y: at.y * zoom } : { x: 55, y: 28 };
      const item = createLibraryPlacement(asset, scene, world, screen, controls.current.graph.nodes);
      setScenes(scene.id, current => current.map(draft => draft.id === scene.id ? { ...draft, placements: [...draft.placements, item] } : draft));
      setSelectedId(item.id);
      closeBackground();
    }
    setAssetMenu(false);
    onAssetPickChange(null);
    viewport.current?.focus({ preventScroll: true });
  }, [makeBackgroundImage, onAssetPickChange, pan, scene, setScenes, updateBackground, zoom]);
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
    setBackgroundId(undefined);
    chooseBackgroundTool(null);
  }
  function changeHistory(direction: 'undo' | 'redo') {
    const target = direction === 'undo' ? props.undoSceneId : props.redoSceneId;
    if (!target) return;
    drags.current = undefined;
    backgroundDrag.current = undefined;
    fieldEdit.current = undefined;
    setBackgroundPreview(undefined);
    if (direction === 'undo') props.onUndo();
    else props.onRedo();
    if (target !== scene.id) changeScene(target);
  }
  function revealInEditor(item: StageEntity, scrollToEditor = true) {
    const placement = playScene.placements.find(placement => placement.id === item.id);
    if (!placement) return;
    const changingScene = playScene.id !== scene.id;
    if (changingScene) changeScene(playScene.id);
    closeBackground();
    setAssetMenu(false);
    onAssetPickChange(null);
    setSelectedId(item.id);
    if (!screenObject(item.kind)) {
      const scale = scrollToEditor || changingScene ? 1 : zoom;
      if (scrollToEditor) setZoom(1);
      const pose = stageEditPose(placement, item, trial.current.get(item.id), trialEditing);
      if (scrollToEditor || changingScene || pose.x < pan || pose.x > pan + VIEW_WIDTH / scale) {
        setPan(Math.max(0, Math.min(maxPan(playScene, scale), pose.x - VIEW_WIDTH / (2 * scale))));
      }
    }
    if (scrollToEditor) requestAnimationFrame(() => {
      viewport.current?.scrollIntoView({ block: 'nearest' });
      viewport.current?.focus({ preventScroll: true });
    });
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
    if (trialEditing || !selected || selected.kind === 'background') return;
    const copies = copyPlacements(scene.placements, selected, whole, { x: 24, y: -8 });
    updateScene({ placements: [...sceneDraft.placements, ...copies] });
    const index = whole && selected.mechanismId ? scene.placements.filter(item => item.mechanismId === selected.mechanismId).indexOf(selected) : 0;
    setSelectedId(copies[index]?.id);
  }
  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const p = point(event);
    if (editPanel === 'background' && !assetPick) {
      if (backgroundTool?.kind === 'image') {
        const asset = props.assets.find(item => item.id === backgroundTool.assetId);
        if (asset) addAsset(asset, p);
        return;
      }
      if (backgroundTool?.kind === 'color') {
        const element = { kind: 'color' as const, id: makeId(), color: backgroundTool.color, ...p, width: 0, height: 0 };
        backgroundDrag.current = { pointerId: event.pointerId, origin: p, element, creating: true };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      const corner = selectedBackground && !selectedBackground.locked &&
        backgroundScaleHandles(selectedBackground, pan, zoom).find(handle => Math.hypot(p.x - handle.x, p.y - handle.y) <= 8 / zoom)?.corner;
      const item = corner ? selectedBackground : backgroundUnderPointer(p);
      if (item) {
        setBackgroundId(item.id);
        if (!item.locked) {
          backgroundDrag.current = { pointerId: event.pointerId, origin: p, element: item, corner: corner || undefined };
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        return;
      }
      setBackgroundId(undefined);
      drags.current = { pin: event.pointerId, x: event.clientX, y: pan };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const handle = editHandleAt(p);
    if (handle && selected) {
      drags.current = {
        pin: event.pointerId, x: p.x, y: p.y, handle, group: Symbol(),
        item: { ...(trialEditing ? handle.pose : selected) }, trial: trialEditing,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const screen = { x: (p.x - pan) * zoom, y: p.y * zoom };
    const pose = pickObject(objects.map(item => editPose(item)), p, screen, mode === 'paused');
    const hit = pose && objects.find(item => item.id === pose.id);
    setSelectedId(hit?.id);
    if (hit && pose) {
      if (trialEditing && !runtimeEditEntity(hit.id)) return;
      drags.current = { pin: event.pointerId, x: p.x, y: p.y, item: { ...(trialEditing ? pose : hit) }, group: Symbol(), trial: trialEditing };
    } else drags.current = { pin: event.pointerId, x: event.clientX, y: pan };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function playPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const active = run.current;
    if (!active) return;
    event.currentTarget.focus();
    const camera = sceneCamera(playScene, active);
    const p = point(event, camera, 1);
    if (mode === 'paused' && event.button === 0) {
      const hit = pickObject(inspectedObjects.filter(item => isActive(item, active)), p, { x: p.x - camera, y: p.y });
      setInspectedId(hit?.id);
      setInspectedEdgeId(undefined);
      if (hit) revealInEditor(hit, false);
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
  function runtimeEditEntity(id: string) {
    const active = run.current?.sceneId === scene.id ? run.current : undefined;
    return active?.entities.find(entity => entity.id === id);
  }
  function editPose(item: Placement, showTrial = trialEditing) {
    return stageEditPose(item, runtimeEditEntity(item.id), trial.current.get(item.id), showTrial);
  }
  function pickObject(items: StageEntity[], p: Point, screen: Point, showInactive = false) {
    return [...items].reverse().sort((a, b) => Number(screenObject(b.kind)) - Number(screenObject(a.kind)) || b.layer - a.layer).find(item => {
      if (item.kind === 'background' || item.isHidden || (!showInactive && (item.collected || item.open))) return false;
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
    if (!selected || trialEditing && !trialSelection) return undefined;
    const pose = editPose(selected);
    if (pose.isHidden || (mode !== 'paused' && (pose.collected || pose.open))) return undefined;
    const card = pose.kind === 'challenge' && props.nodes.find(node => node.id === pose.nodeId);
    if (card && cardPreviewBehavior(card).isSceneOnly) return undefined;
    const scale = screenObject(pose.kind) ? 1 : zoom;
    const pointer = placementPointer(p, pose);
    let closest: StageHandle | undefined;
    let distance = 8 / scale;
    for (const handle of stageHandles(pose, scale, bounds)) {
      const hit = Math.hypot(pointer.x - handle.at.x, pointer.y - handle.at.y);
      if (hit < distance) {
        closest = handle;
        distance = hit;
      }
    }
    return closest && { ...closest, pose: { ...pose } };
  }
  function backgroundUnderPointer(p: Point) {
    return [...background.elements].reverse().find(item => p.x >= item.x && p.x <= item.x + item.width
      && p.y >= item.y && p.y <= item.y + item.height);
  }
  function backgroundAtPointer(drag: NonNullable<typeof backgroundDrag.current>, event: PointerEvent<HTMLCanvasElement>): BackgroundElement {
    const p = point(event);
    const delta = { x: p.x - drag.origin.x, y: p.y - drag.origin.y };
    const item = drag.element;
    if (drag.creating) {
      const box = rectangleBetween(p, drag.origin);
      return { ...item, ...(box.width < 4 && box.height < 4
        ? { ...drag.origin, width: 80, height: 48 }
        : { ...box, width: Math.max(8, box.width), height: Math.max(8, box.height) }) };
    }
    if (drag.corner) {
      if (item.kind === 'image') return { ...item, ...resizeBackgroundImage(item, drag.corner, delta) };
      const width = Math.max(8, item.width + delta.x * drag.corner.x);
      const height = Math.max(8, item.height + delta.y * drag.corner.y);
      return { ...item, width, height, x: drag.corner.x < 0 ? item.x + item.width - width : item.x,
        y: drag.corner.y < 0 ? item.y + item.height - height : item.y };
    }
    const box = { ...item, x: item.x + delta.x, y: item.y + delta.y };
    return event.altKey ? box : { ...box, ...snapBackgroundBox(box, background.elements, scene, 6 / zoom) };
  }
  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const dragBackground = backgroundDrag.current;
    if (dragBackground?.pointerId === event.pointerId) {
      setBackgroundPreview({ sceneId: scene.id, element: backgroundAtPointer(dragBackground, event) });
      event.currentTarget.style.cursor = dragBackground.creating ? 'crosshair' : dragBackground.corner ? 'nwse-resize' : 'grabbing';
      return;
    }
    if (editPanel === 'background' && !drags.current) {
      const p = point(event);
      if (backgroundTool?.kind === 'image') {
        const asset = props.assets.find(item => item.id === backgroundTool.assetId);
        const element = asset && makeBackgroundImage(asset, p, '');
        if (element) setBackgroundPreview({ sceneId: scene.id, element, placing: true });
      }
      const item = backgroundUnderPointer(p);
      const corner = selectedBackground && !selectedBackground.locked &&
        backgroundScaleHandles(selectedBackground, pan, zoom).find(handle => Math.hypot(p.x - handle.x, p.y - handle.y) <= 8 / zoom);
      event.currentTarget.style.cursor = backgroundTool?.kind === 'image' || backgroundTool?.kind === 'color' ? 'crosshair'
        : corner ? corner.corner.x === corner.corner.y ? 'nwse-resize' : 'nesw-resize'
          : item && !item.locked ? 'grab' : '';
      return;
    }
    const drag = drags.current;
    if (!drag) {
      const p = point(event);
      const handle = editHandleAt(p);
      if (handle?.kind === 'rotation') event.currentTarget.style.cursor = 'grab';
      else if (handle?.kind === 'collision') event.currentTarget.style.cursor = handle.side.x ? 'ew-resize' : 'ns-resize';
      else if (handle?.kind === 'size') event.currentTarget.style.cursor = handle.corner.x === handle.corner.y ? 'nwse-resize' : 'nesw-resize';
      else event.currentTarget.style.cursor = '';
      return;
    }
    if (drag.pin !== event.pointerId) return;
    if (!drag.item) {
      setPan(Math.min(maxPan(scene, zoom), Math.max(0, drag.y + (drag.x - event.clientX) * VIEW_WIDTH / event.currentTarget.clientWidth / zoom)));
      return;
    }
    const item = drag.item;
    const apply = (patch: Partial<Placement>) => {
      if (drag.trial) editTrial(item.id, patch);
      else editItem(patch, item.id, drag.group);
    };
    const p = point(event);
    const adjust = (value: number) => grid ? Math.round(value / 10) * 10 : Math.round(value);
    const scale = screenObject(drag.item.kind) ? zoom : 1;
    const delta = { x: (p.x - drag.x) * scale, y: (p.y - drag.y) * scale };
    if (drag.handle?.kind === 'size') {
      apply(resizePlacement(item, drag.handle.corner, delta));
      return;
    }
    if (drag.handle?.kind === 'collision') {
      apply({ collider: resizeCollider(item, drag.handle.side, delta) });
      return;
    }
    if (drag.handle?.kind === 'rotation') {
      event.currentTarget.style.cursor = 'grabbing';
      const { pose } = drag.handle;
      apply({ rotation: rotatePlacement(pose, placementPointer(drag, pose), placementPointer(p, pose)) });
      return;
    }
    const dx = delta.x * (drag.item.anchor?.endsWith('right') ? -1 : 1);
    const dy = delta.y * (drag.item.anchor?.startsWith('bottom') ? -1 : 1);
    apply({ x: adjust(item.x + dx), y: adjust(item.y + dy) });
  }
  function endDrag(event: PointerEvent<HTMLCanvasElement>) {
    const gesture = backgroundDrag.current;
    if (gesture?.pointerId === event.pointerId) {
      backgroundDrag.current = undefined;
      const moved = gesture.creating || Math.hypot(point(event).x - gesture.origin.x, point(event).y - gesture.origin.y) >= 1 / zoom;
      let id: string | undefined;
      if (event.type === 'pointerup' && moved) {
        const element = backgroundAtPointer(gesture, event);
        updateBackground(source => ({
          ...source, elements: gesture.creating ? [...source.elements, element] : source.elements.map(item => item.id === element.id ? element : item),
        }));
        id = element.id;
      }
      if (gesture.creating && id) {
        setBackgroundId(id);
        chooseBackgroundTool(null);
      } else setBackgroundPreview(undefined);
      event.currentTarget.style.cursor = '';
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
  function locatePlacement(placement: Placement, target: StageBoardTarget, inRun: boolean) {
    void locate({
      ...target,
      stage: {
        sceneId: inRun ? playScene.id : scene.id, placementId: placement.id,
        trial: inRun,
        trialParameters: inRun ? trial.current.get(placement.id)?.parameters : undefined,
      },
    });
  }
  function renderObjectPicker(items: Placement[], id: string | undefined, onSelect: (item?: Placement) => void) {
    return items.length > 0 && <select aria-label={l('Stage objects', '舞台对象')} value={id ?? ''} onChange={event => {
      onSelect(items.find(item => item.id === event.target.value));
    }}><option value="">{l('Select an element', '选择元素')}</option>{items.map(item => <option key={item.id} value={item.id}>
      {item.name}{item.kind === 'challenge' ? l(' · Challenge', ' · 挑战') : ''}{item.isHidden ? l(' · Hidden', ' · 已隐藏') : ''}
    </option>)}</select>;
  }
  function renderEditInspector() {
    const item = trialEditing ? trialSelection : selected;
    const selectedNode = props.nodes.find(node => node.id === item?.nodeId);
    const selectedAsset = props.assets.find(asset => asset.id === item?.assetId);
    const parameters = item ? exposedParameters(props.nodes, item) : [];
    const openSelectedAsset = async (propertyId?: string) => {
      if (!selectedAsset) return;
      if (full) await leaveFull(false);
      props.onOpenAsset(selectedAsset.id, propertyId);
    };
    const saveSelectedAsset = async () => {
      if (!item) return;
      if (full) await leaveFull(false);
      props.onSaveAsset(scene.id, item);
    };
    const edit = (patch: Partial<Placement>) => {
      if (trialEditing) {
        if (!item) return;
        editTrial(item.id, patch);
        if (patch.x !== undefined && !screenObject(item.kind) && (patch.x < pan || patch.x > pan + VIEW_WIDTH / zoom)) {
          setPan(Math.min(maxPan(scene, zoom), Math.max(0, patch.x - VIEW_WIDTH / (2 * zoom))));
        }
      } else editItem(patch);
    };
    const rewardCards = props.nodes.filter(node => node.kind === 'outcome' && node.fields.stageScoreFormula &&
      props.edges.some(edge => edge.fromId === selectedNode?.id && edge.toId === node.id));
    return (
      <aside className="stage-inspector" aria-label={l('Edit selection', '编辑对象')}>
        <div className="stage-inspector-heading">
          <h3>{selected?.name || l('Stage inspection', '舞台检查')}</h3>
          {selected && !trialEditing && <div className="stage-row">
            {selected.kind !== 'background' && <button type="button" onClick={() => duplicate(false)}>{l('Duplicate', '复制')}</button>}
            {selected.mechanismId && selected.kind !== 'background' && <button type="button" onClick={() => duplicate(true)}>{l('Duplicate mechanism', '复制整套机制')}</button>}
            {!selected.id.startsWith('board:') && <button type="button" onClick={() => {
              updateScene({ placements: sceneDraft.placements.filter(item => item.id !== selected.id) });
              setSelectedId(undefined);
            }}>{l('Remove', '移除')}</button>}
          </div>}
        </div>
        {renderObjectPicker(trialEditing ? objects.map(item => editPose(item)) : objects, selected?.id, item => {
          setSelectedId(item?.id);
          if (item && !screenObject(item.kind) && item.kind !== 'background') {
            const pose = editPose(item);
            setPan(Math.min(maxPan(scene, zoom), Math.max(0, pose.x - VIEW_WIDTH / (2 * zoom))));
          }
        })}
        {(editingRunScene || trialEditing) && <div className="stage-row">
          <label className="stage-check">
            <input type="checkbox" checked={trialEditing} onChange={event => {
              const enabled = event.currentTarget.checked;
              setTrialEditsEnabled(enabled);
              if (!selected || screenObject(selected.kind)) return;
              const pose = editPose(selected, enabled);
              if (pose.x < pan || pose.x > pan + VIEW_WIDTH / zoom) {
                setPan(Math.min(maxPan(scene, zoom), Math.max(0, pose.x - VIEW_WIDTH / (2 * zoom))));
              }
            }} />{l('Edit this run only', '仅本局试调')}
          </label>
          {editingRunScene && trial.current.size > 0 && <button type="button" onClick={commitTrial}>{l('Apply trial edits to project', '应用本局修改到项目')}</button>}
        </div>}
        {trialEditing && !editingRunScene && <small>{l('Return to the paused scene to continue trial edits.', '切回已暂停的场景即可继续试调。')}</small>}
        {trialEditing && trialSelection && (trialSelection.collected || trialSelection.open) && <small>
          {trialSelection.collected
            ? l('Already collected in this run. Trial edits leave the recorded reward as it was.', '本局已收集，试调前已经结算的奖励会保留。')
            : l('Already open in this run.', '本局已打开。')}
        </small>}
        {item ? <div className="stage-object-details" key={item.id}>
          <div className="stage-row">
            {selectedNode && <button type="button" onClick={() => locatePlacement(item, { nodeId: selectedNode.id }, trialEditing)}>{l('Locate rule on board', '在设计板定位')}</button>}
            {!trialEditing && item.kind === 'challenge' && selectedNode?.kind === 'challenge' && selectedAsset &&
              <button type="button" onClick={() => void saveSelectedAsset()}>{l('Save as new asset', '保存为新素材')}</button>}
          </div>
          {!trialEditing && selectedAsset?.stagePreset && <div className="stage-row">
            <small>{l('Asset', '素材')} · {selectedAsset.name}</small>
            <button type="button" onClick={() => void openSelectedAsset()}>{l('Open in library', '在素材库编辑')}</button>
          </div>}
          {item.nodeId && !selectedNode && <p className="stage-notice" role="status">{l('The source card is missing.', '来源卡片已不存在。')}</p>}
          <fieldset><legend>{l('Placement', '摆放与外观')}</legend>
            {numeric(l('Width', '宽度'), item.width, width => edit({ width }), 1)}
            {numeric(l('Height', '高度'), item.height, height => edit({ height }), 1)}
          </fieldset>
          <details><summary>{l('More placement settings', '更多摆放设置')}</summary><fieldset>
            <label><input type="checkbox" checked={Boolean(item.isHidden)} onChange={event => edit({ isHidden: event.target.checked })} />{l('IsHidden?', '隐藏（IsHidden?）')}</label>
            {!trialEditing && <>
              <label>{l('Name', '名称')}<input value={item.name} onChange={e => edit({ name: e.target.value, nameSource: 'custom' })} /></label>
              {selectedAsset && item.nameSource !== 'asset' && <button type="button"
                onClick={() => edit({ name: selectedAsset.name, nameSource: 'asset' })}>{l('Use asset name', '使用素材名称')}</button>}
            </>}
            {numeric('X', item.x, x => edit({ x }))}
            {numeric('Y', item.y, y => edit({ y }))}
            {numeric(l('Rotation', '旋转'), item.rotation, rotation => edit({ rotation }))}
            {numeric(l('Layer', '图层'), item.layer, layer => edit({ layer }))}
            {screenObject(item.kind) && <label>{l('Screen anchor', '屏幕锚点')}<select value={item.anchor ?? 'top-left'} onChange={e => edit({ anchor: e.target.value as Placement['anchor'] })}>
              {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((anchor, index) => <option key={anchor} value={anchor}>{zh ? ['左上', '右上', '左下', '右下'][index] : anchor}</option>)}
            </select></label>}
          </fieldset></details>
          {item.kind === 'challenge' && <details><summary>{l('Collision bounds', '碰撞范围')}</summary><fieldset>
            <label><input type="checkbox" checked={!item.collider} onChange={e => edit({ collider: e.target.checked ? undefined : { width: item.width, height: item.height } })} />{l('Follow appearance', '跟随外观')}</label>
            {item.collider && <>
              {numeric(l('Collision width', '碰撞宽度'), item.collider.width, width => edit({ collider: { ...item.collider!, width } }), 1)}
              {numeric(l('Collision height', '碰撞高度'), item.collider.height, height => edit({ collider: { ...item.collider!, height } }), 1)}
            </>}
            <label><input type="checkbox" checked={bounds} onChange={e => setBounds(e.target.checked)} />{l('Show collision handles', '显示碰撞范围手柄')}</label>
          </fieldset></details>}
          {(parameters.length > 0 || rewardCards.length > 0) && <fieldset><legend>{l('Instance parameters', '实例参数')}</legend>
            {parameters.map(parameter => {
              const resolved = resolveStageParameter(parameter, item, selectedAsset);
              const defaultLabel = stageParameterSourceLabel(props.lang, resolved.defaultSource);
              return <div key={parameter.id} className="stage-parameter">
                {numeric(parameter.name, resolved.value, value => edit({
                  parameters: { ...item.parameters, [parameter.id]: Math.min(parameter.max ?? Infinity, Math.max(parameter.min ?? -Infinity, value)) },
                }), parameter.min)}
                <small>{stageParameterSourceLabel(props.lang, resolved.source)}
                  {resolved.source === 'asset' && <> · {resolved.assetName}</>}
                  {resolved.source === 'instance' && <> · {defaultLabel} {resolved.defaultValue}</>}
                </small>
                {resolved.source === 'instance' && <button type="button" onClick={() => {
                  const parameters = { ...item.parameters };
                  delete parameters[parameter.id];
                  edit({ parameters });
                }}>{l('Restore default', '恢复默认')}</button>}
              </div>;
            })}
            {rewardCards.map(card => {
              const reward = calculateStageReward(card, props.nodes, trialEditing ? run.current?.variables ?? props.variables : props.variables, item, props.assets);
              return <div key={card.id} className="stage-parameter">
                <button type="button" onClick={() => locatePlacement(item, { nodeId: card.id }, trialEditing)}>{card.title || l('Reward rule', '奖励规则')}</button>
                <small>{reward.formula} · {reward.valid ? reward.value : l('Invalid formula; using the card default', '公式无效，使用卡片默认值')}</small>
              </div>;
            })}
          </fieldset>}
        </div> : !(trialEditing && !editingRunScene) && <small>{selected
          ? l('This object is unavailable in the current run.', '这个对象在当前试玩中不可用。')
          : l('Select an element on the stage to edit it.', '点击舞台上的元素进行编辑。')}</small>}
      </aside>
    );
  }
  function renderPlayInspection() {
    if (!inspectedObjects.length) return null;
    const item = inspectedObjects.find(object => object.id === inspectedId);
    const node = props.nodes.find(card => card.id === item?.nodeId);
    const verdicts = item && run.current ? Object.values(run.current.verdicts).filter(entry => entry.objectId === item.id) : [];
    const byEdge = new Map(verdicts.map(entry => [entry.edgeId, entry]));
    const conditions = item ? props.edges.filter(edge => byEdge.has(edge.id) ||
      (edge.condition?.trim() || edge.conditionGroup?.clauses.length)
      && item.nodeId && (edge.fromId === item.nodeId || edge.toId === item.nodeId)) : [];
    const recent = [...verdicts].reverse().sort((a, b) => b.at - a.at || Number(b.passed) - Number(a.passed))[0];
    const recentEdge = conditions.find(edge => edge.id === inspectedEdgeId) ??
      conditions.find(edge => edge.id === recent?.edgeId) ?? conditions[0];
    const verdict = recentEdge && byEdge.get(recentEdge.id);
    return <aside className="stage-inspector" aria-label={l('Play inspection', '试玩检查')}>
      <div className="stage-inspector-heading">
        <h3>{l('This run', '本局状态')}</h3>
        {renderObjectPicker(inspectedObjects, item?.id, object => {
          setInspectedId(object?.id);
          setInspectedEdgeId(undefined);
        })}
      </div>
      {item && <>
        <div className="stage-row">
          <small>{item.collected ? l('Collected', '已收集') : item.open ? l('Open', '已打开')
            : run.current && isActive(item, run.current) ? l('Active', '已激活') : l('Inactive', '未激活')}</small>
          {playScene.placements.some(placement => placement.id === item.id) &&
            <button type="button" onClick={() => revealInEditor(item)}>{l('Locate in Edit stage', '在编辑舞台定位')}</button>}
          {node && <button type="button" onClick={() => locatePlacement(item, { nodeId: node.id }, true)}>{l('Locate rule on board', '在设计板定位')}</button>}
          {conditions.length > 1 && recentEdge && <select aria-label={l('Related condition', '相关条件')} value={recentEdge.id}
            onChange={event => setInspectedEdgeId(event.target.value)}>
            {conditions.map(edge => {
              const target = props.nodes.find(node => node.id === edge.toId);
              const result = byEdge.get(edge.id);
              const label = target?.title || target?.note || l('Condition', '条件');
              const state = result ? result.passed ? l('Passed', '通过') : l('Not passed', '未通过') : l('No evaluation yet', '尚未求值');
              return <option key={edge.id} value={edge.id}>{label} · {state}</option>;
            })}
          </select>}
          {recentEdge && <button type="button" onClick={() => locatePlacement(item, { edgeId: recentEdge.id }, true)}>{l('Locate related condition', '查看相关条件')}</button>}
        </div>
        {verdict && recentEdge ? <div className="stage-parameter">
          <p>{verdict.passed ? l('Passed', '通过') : l('Not passed', '未通过')} · {l('Score', '分数')} {verdict.scoreBefore} → {verdict.scoreAfter}</p>
          {Boolean(verdict.parameters?.length) && <div className="stage-parameter">
            <strong>{l('Parameters at evaluation', '当次判定参数')}</strong>
            {verdict.parameters?.map(parameter => <p key={parameter.id}>
              {parameter.name} {parameter.value} · {stageParameterSourceLabel(props.lang, parameter.source)}
              {parameter.source === 'asset' && <> · {parameter.assetName}</>}
            </p>)}
          </div>}
          {verdict.propertyChanges?.map(change => <p key={change.id}>{change.name} {String(change.before)} → {String(change.after)}</p>)}
          {verdict.clauses.map(result => {
            const clause = recentEdge.conditionGroup?.clauses.find(item => item.id === result.id);
            const summary = clause?.kind === 'event' ? formatEventClauseSummary(clause, props.lang)
              : clause ? formatPropertyClauseSummary(clause, props.variables, props.lang) : l('Condition', '条件');
            return <p key={result.id}>{result.passed ? '✓' : '×'} {summary}{result.actual !== undefined && <> · {l('Actual', '实际值')} {String(result.actual)}</>}</p>;
          })}
        </div> : <small>{l('No evaluation yet', '尚未求值')}</small>}
      </>}
    </aside>;
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
            <StagePlayProperties lang={props.lang} scopedVariables={props.variables.filter(entry => !entry.variable.stageParameterId)} onUpdatePlayValue={props.onUpdatePlayValue} />
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
            </div>}
            {notice && <p role="status" className="stage-notice">{notice}</p>}
            {mode === 'paused' && renderPlayInspection()}
            {mode !== 'paused' && <p className="text-[11px] text-[#64748B] leading-relaxed">{mode === 'play' ? t.liveHint : t.previewHint}</p>}
          </section>
          <section className="stage-main stage-edit" aria-label={l('Edit stage', '编辑舞台')}
            onInputCapture={captureFieldEdit} onChangeCapture={captureFieldEdit} onBlurCapture={event => {
              if (fieldEdit.current?.input === event.target) fieldEdit.current = undefined;
            }}
            onKeyDown={event => {
              if (!(event.ctrlKey || event.metaKey) || event.altKey || event.defaultPrevented) return;
              if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]')) return;
              const key = event.key.toLowerCase();
              if (key !== 'z' && key !== 'y') return;
              event.preventDefault();
              event.stopPropagation();
              changeHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo');
            }}>
            <div className="stage-edit-heading">
              <h2 className="stage-section-title">{l('Edit stage', '编辑舞台')}</h2>
              <div className="stage-row" role="group" aria-label={l('Stage edit history', '舞台编辑历史')}>
                <button type="button" className="stage-icon" disabled={!props.undoSceneId} onClick={() => changeHistory('undo')}
                  aria-label={l('Undo', '撤销')} title={l('Undo (Ctrl/⌘+Z)', '撤销（Ctrl/⌘+Z）')}
                  aria-keyshortcuts="Control+Z Meta+Z"><Undo2 size={16} aria-hidden="true" /></button>
                <button type="button" className="stage-icon" disabled={!props.redoSceneId} onClick={() => changeHistory('redo')}
                  aria-label={l('Redo', '重做')} title={l('Redo (Ctrl/⌘+Shift+Z)', '重做（Ctrl/⌘+Shift+Z）')}
                  aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z"><Redo2 size={16} aria-hidden="true" /></button>
              </div>
            </div>
            <div className="stage-toolbar" ref={toolbar}>
              <span className="stage-scene-name">{scene.name}</span>
              <button ref={addButton} type="button" className="stage-add" aria-pressed={assetPick === 'picking' || assetMenu}
                onClick={() => {
                if (editPanel === 'background') closeBackground();
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
              <button ref={backgroundButton} type="button" className="stage-add" aria-expanded={editPanel === 'background'}
                aria-controls="stage-background-settings" onClick={() => {
                  onAssetPickChange(null); setAssetMenu(false);
                  if (editPanel === 'background') closeBackground();
                  else { setSelectedId(undefined); setEditPanel('background'); }
                }}><span className="stage-background-dot" aria-hidden="true" style={{ background: background.useSceneBackdrop ? undefined : background.color }} />
                {l('Background', '背景')}</button>
              <button ref={settingsButton} type="button" className="stage-icon" aria-label={l('Scene settings', '场景设置')} title={l('Scene settings', '场景设置')}
                aria-expanded={editPanel === 'settings'} aria-controls="stage-scene-settings" onClick={() => {
                  onAssetPickChange(null); setAssetMenu(false);
                  chooseBackgroundTool(null);
                  setBackgroundId(undefined);
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
            {editPanel === 'background' && <StageBackgroundSettings lang={props.lang} assets={props.assets}
              background={background} tool={backgroundTool} onTool={chooseBackgroundTool} notice={backgroundNotice}
              onColor={color => updateBackground(source => ({ ...source, color, useSceneBackdrop: false }))}
              onDone={() => { closeBackground(); backgroundButton.current?.focus(); }} />}
            {editPanel === 'settings' && <section id="stage-scene-settings" className="stage-inline-panel" aria-label={l('Scene settings', '场景设置')}>
              <div className="stage-row">
                {scenes.length > 1 && <select aria-label={l('Scene', '场景')} value={scene.id} onChange={event => changeScene(event.target.value)}>
                  {scenes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>}
                <button type="button" onClick={() => {
                  const next = createScene(l('Scene ', '场景 ') + (scenes.length + 1), l('Player', '玩家'));
                  setScenes(next.id, items => [...items, next]);
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
                onPointerLeave={() => { if (backgroundPreview?.placing) setBackgroundPreview(undefined); }}
                onDragOver={event => event.preventDefault()}
                onDrop={event => {
                  event.preventDefault();
                  const asset = props.assets.find(item => item.id === event.dataTransfer.getData('text/plain'));
                  if (asset) addAsset(asset, point(event));
                }} />
              {renderHud(scene, run.current?.sceneId === scene.id ? run.current : undefined, true)}
              {renderOverlay(scene, run.current?.sceneId === scene.id ? run.current : undefined, false)}
            </div>
            {(scene.width > VIEW_WIDTH || editPanel === 'background') && <div className="stage-map-nav">
              <div className="stage-map-track">
                <span className="stage-map-label">{l('Map overview', '关卡总览')}
                  <small>X {Math.round(pan)}–{Math.round(pan + visibleMapWidth)} / {scene.width}</small>
                </span>
                <span className="stage-map-rail" data-pannable={!wholeMapVisible}
                  onPointerDown={startMapDrag} onPointerMove={moveMapDrag} onPointerUp={endMapDrag}
                  onPointerCancel={endMapDrag} onLostPointerCapture={endMapDrag}
                  style={{ backgroundColor: background.useSceneBackdrop ? undefined : background.color }}>
                  {(editPanel === 'background' || background.elements.length > 0) && <canvas ref={backgroundOverview} className="stage-map-background" aria-hidden="true" />}
                  <span className="stage-map-window" aria-hidden="true"
                    style={{ left: pan / scene.width * 100 + '%', width: visibleMapWidth / scene.width * 100 + '%' }} />
                  <input type="range" min="0" max={maxPan(scene, zoom)} step="any" value={pan}
                    aria-label={l('Map overview', '关卡总览')} disabled={wholeMapVisible}
                    onChange={event => setPan(Number(event.target.value))} />
                </span>
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
            {editPanel === 'background' ? <BackgroundItemInspector lang={props.lang} assets={props.assets}
              elements={background.elements} selected={backgroundSelection}
              onSelect={id => { chooseBackgroundTool(null); selectBackground(id, true); }}
              onChange={editBackgroundItem} onMoveLayer={moveBackgroundLayer} onShowFullImage={showFullBackgroundImage}
              onRemove={() => {
                updateBackground(source => ({ ...source, elements: source.elements.filter(item => item.id !== backgroundId) }));
                setBackgroundId(undefined);
              }} /> : renderEditInspector()}
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
  trialEditing?: boolean;
  showInactivePlacements?: boolean;
  time: number;
  pan: number;
  zoom: number;
  grid: boolean;
  bounds: boolean;
  selectedId?: string;
  zh: boolean;
  backgroundPreview?: BackgroundPreview;
  backgroundSelection?: BackgroundElement;
  emptyPreview?: boolean;
};
type SpriteCache = WeakMap<HTMLImageElement, Map<string, ReturnType<typeof bakeStaticEffectsToCanvas>>>;

function paint(ctx: CanvasRenderingContext2D, width: number, height: number, scene: Scene, view: PaintView,
  images: Map<string, HTMLImageElement>, bakedSprites: SpriteCache) {
  if (view.mode === 'preview' && view.emptyPreview && (!view.backgroundPreview || view.backgroundPreview.placing)) {
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
  drawSceneBackground(ctx, scene, pan, VIEW_WIDTH / zoom, VIEW_HEIGHT / zoom, view.props.assets, images,
    view.backgroundPreview?.placing && view.mode !== 'edit' ? undefined : view.backgroundPreview, run?.visualOutcomes, time);

  const drawAsset = (item: StageEntity, x: number, y: number, behavior?: ReturnType<typeof cardPreviewBehavior>, spin: -1 | 0 | 1 = 0, age = time) => {
    const asset = view.props.assets.find(candidate => candidate.id === item.assetId);
    const slot = asset?.states.find(state => state.id === asset.activeStateId) ?? asset?.states[0];
    const showPlacement = view.showInactivePlacements && (item.collected || item.open);
    const visual = !showPlacement && asset ? run?.visualOutcomes[asset.id] : undefined;
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
  const activeById = editing && run ? new Map(run.entities.map(item => [item.id, item])) : undefined;
  const placements: StageEntity[] = activeById
    ? scene.placements.map(item => stageEditPose(item, activeById.get(item.id), view.trial?.get(item.id), view.trialEditing))
    : run?.entities ?? scene.placements;
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
    const selected = editing && item.id === view.selectedId;
    const age = run ? Math.max(0, time - (run.activationTimes[item.id] ?? run.entryTime)) : time;
    const motion = view.mode === 'preview' && card && behavior
      ? { ...item, ...challengeMotion(item, behavior, challengeSpeed(item, card, behavior), scene, age, true) }
      : item;
    const spriteRadius = Math.hypot(item.width, item.height) / 2;
    const spriteVisible = motion.x + spriteRadius >= pan && motion.x - spriteRadius <= pan + VIEW_WIDTH / zoom;
    if (behavior && (view.mode === 'preview' || selected && editing)) {
      drawBehaviorGuide(ctx, motion, item, behavior, zoom, editing ? 0 : time);
    }
    const inactive = motion.collected || motion.open;
    if (spriteVisible && (!inactive || view.showInactivePlacements)) {
      if (inactive) {
        ctx.save();
        ctx.globalAlpha *= .5;
      }
      drawAsset(item, motion.x, motion.y, behavior, motion.spin, age);
      if (inactive) ctx.restore();
    }
    if (!selected || (inactive && !view.showInactivePlacements)) continue;
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
  const selected = editing ? placements.find(item => item.id === view.selectedId && !item.isHidden &&
    (view.showInactivePlacements || (!item.collected && !item.open)) &&
    item.kind !== 'background') : undefined;
  if (selected && (!view.trialEditing || activeById?.has(selected.id))) {
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
  const backgroundItem = editing ? view.backgroundSelection ?? view.backgroundPreview?.element : undefined;
  if (backgroundItem) drawBackgroundSelection(ctx, backgroundItem, pan, zoom, Boolean(view.backgroundPreview?.placing));
}

function drawBackgroundSelection(ctx: CanvasRenderingContext2D, item: BackgroundElement, pan: number, zoom: number, placing: boolean) {
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-pan, 0);
  ctx.strokeStyle = item.locked ? '#cbd5e1' : '#c4b5fd';
  ctx.lineWidth = 1.6 / zoom;
  if (placing || item.locked) ctx.setLineDash([4 / zoom, 3 / zoom]);
  ctx.strokeRect(item.x, item.y, item.width, item.height);
  if (!placing && !item.locked) {
    ctx.fillStyle = '#faf7ff';
    const size = 8 / zoom;
    for (const { x, y } of backgroundScaleHandles(item, pan, zoom)) {
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    }
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
