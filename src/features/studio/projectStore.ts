import type { AssetItem, AssetSubFolder } from './asset-library/assetLibraryModel';
import type { BoardComboFrame, BoardEdge, BoardNode } from './design-board/studioModel';
import type { Scene } from './playtest/stageProject';
import type { StateVariable } from './properties/stateModel';

export interface ProjectData {
  version: 1;
  id: string;
  name: string;
  updatedAt: number;
  nodes: BoardNode[];
  edges: BoardEdge[];
  comboFrames: BoardComboFrame[];
  assets: AssetItem[];
  folders: AssetSubFolder[];
  variables: StateVariable[];
  scenes?: Scene[];
}

export function emptyProject(name: string): ProjectData {
  return {
    version: 1, id: crypto.randomUUID(), name, updatedAt: Date.now(),
    nodes: [], edges: [], comboFrames: [], assets: [], folders: [], variables: [],
  };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tinker-games', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(project: ProjectData) {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('projects', 'readwrite');
      transaction.objectStore('projects').put(project);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function listProjects(): Promise<ProjectData[]> {
  const db = await openDB();
  try {
    return await new Promise<ProjectData[]>((resolve, reject) => {
      const request = db.transaction('projects').objectStore('projects').getAll();
      request.onsuccess = () => resolve(request.result.sort((a: ProjectData, b: ProjectData) => b.updatedAt - a.updatedAt));
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

function isScene(value: unknown): value is Scene {
  if (!value || typeof value !== 'object') return false;
  const scene = value as Scene;
  if (typeof scene.id !== 'string' || typeof scene.name !== 'string'
    || !Number.isFinite(scene.width) || scene.width <= 0
    || !Number.isFinite(scene.height) || scene.height <= 0
    || !Array.isArray(scene.placements) || !scene.placements.every(item => item
      && typeof item.id === 'string' && typeof item.kind === 'string' && typeof item.name === 'string'
      && [item.x, item.y, item.width, item.height, item.rotation, item.layer].every(Number.isFinite))) return false;

  const background = scene.background;
  if (background && (!['inherit', 'color', 'segments', 'tile', 'free'].includes(background.mode) || typeof background.color !== 'string')) return false;
  if (background?.mode === 'free') {
    return Array.isArray(background.elements) && background.elements.every(item => item
      && typeof item.id === 'string' && [item.x, item.y, item.width, item.height].every(Number.isFinite)
      && item.width > 0 && item.height > 0
      && (item.opacity === undefined || Number.isFinite(item.opacity) && item.opacity >= 0 && item.opacity <= 1)
      && (item.kind === 'image' ? typeof item.assetId === 'string'
        && (item.feather === undefined || Number.isFinite(item.feather) && item.feather >= 0)
        && (!item.crop?.image || [item.crop.image.x, item.crop.image.y, item.crop.image.width, item.crop.image.height].every(Number.isFinite))
        : item.kind === 'color' && typeof item.color === 'string'));
  }
  const segments = background?.segments;
  return segments === undefined || Array.isArray(segments) && segments.every(item => item
    && typeof item.id === 'string' && typeof item.assetId === 'string'
    && [item.start, item.end, item.transition].every(Number.isFinite)
    && (!item.imagePlacement || [item.imagePlacement.x, item.imagePlacement.y, item.imagePlacement.width, item.imagePlacement.height].every(Number.isFinite)));
}

export function parseProject(text: string): ProjectData {
  const project = JSON.parse(text) as Partial<ProjectData> | null;
  if (!project || project.version !== 1 || typeof project.name !== 'string'
    || !Array.isArray(project.nodes) || !Array.isArray(project.edges) || !Array.isArray(project.comboFrames)
    || !Array.isArray(project.assets) || !Array.isArray(project.folders) || !Array.isArray(project.variables)) {
    throw new Error('Invalid project file');
  }
  for (const node of project.nodes) {
    if (!node || typeof node.id !== 'string'
      || !['action', 'challenge', 'outcome', 'narration', 'dialogue', 'group', 'draft'].includes(node.kind)
      || !node.fields || !Array.isArray(node.manualFields) || typeof node.note !== 'string'
      || typeof node.title !== 'string' || !Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      throw new Error('Invalid card');
    }
  }
  for (const asset of project.assets) {
    if (!asset || typeof asset.id !== 'string' || !Array.isArray(asset.states)) throw new Error('Invalid asset');
    const preset = asset.stagePreset;
    if (preset && (typeof preset.challengeNodeId !== 'string'
      || !Array.isArray(preset.ruleAssetIds) || !preset.ruleAssetIds.every(id => typeof id === 'string')
      || ![preset.width, preset.height, preset.rotation].every(Number.isFinite)
      || preset.width <= 0 || preset.height <= 0
      || preset.collider && ![preset.collider.width, preset.collider.height].every(size => Number.isFinite(size) && size > 0))) {
      throw new Error('Invalid asset stage preset');
    }
  }
  if (project.scenes !== undefined && (!Array.isArray(project.scenes) || !project.scenes.every(isScene))) {
    throw new Error('Invalid Canvas scene');
  }
  return {
    ...project,
    version: project.version, name: project.name, nodes: project.nodes, edges: project.edges, comboFrames: project.comboFrames,
    assets: project.assets, folders: project.folders, variables: project.variables,
    id: crypto.randomUUID(), updatedAt: Date.now(),
  };
}

export function exportProject(project: ProjectData) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = (project.name || 'game') + '.tinker.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
