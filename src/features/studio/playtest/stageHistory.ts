import { retainChallengeAnchors, type Scene } from './stageProject';

type Snapshot = { scenes: Scene[]; sceneId: string };
type StageHistory = {
  scenes: Scene[];
  past: Snapshot[];
  future: Snapshot[];
  group?: symbol;
};

export type StageSceneUpdate = (scenes: Scene[]) => Scene[];
export type StageHistoryAction =
  | { type: 'edit'; update: StageSceneUpdate; sceneId: string; group?: symbol }
  | { type: 'retain-anchors'; projected: Scene[] }
  | { type: 'undo' }
  | { type: 'redo' };

const MAX_HISTORY = 80;

export function createStageHistory(scenes: Scene[]): StageHistory {
  return { scenes, past: [], future: [] };
}

export function stageHistoryReducer(history: StageHistory, action: StageHistoryAction): StageHistory {
  switch (action.type) {
    case 'edit': {
      const scenes = action.update(history.scenes);
      if (scenes.length === history.scenes.length && scenes.every((scene, index) => scene === history.scenes[index])) return history;
      const grouped = action.group !== undefined && action.group === history.group;
      return {
        scenes, group: action.group, future: [],
        past: grouped ? history.past : [
          ...history.past.slice(1 - MAX_HISTORY),
          { scenes: history.scenes, sceneId: action.sceneId },
        ],
      };
    }
    case 'retain-anchors': {
      const scenes = retainChallengeAnchors(history.scenes, action.projected);
      if (scenes === history.scenes) return history;
      const retain = (entry: Snapshot): Snapshot => ({
        ...entry, scenes: retainChallengeAnchors(entry.scenes, action.projected),
      });
      return { ...history, scenes, past: history.past.map(retain), future: history.future.map(retain) };
    }
    case 'undo': {
      const entry = history.past.at(-1);
      if (!entry) return history;
      return {
        scenes: entry.scenes,
        past: history.past.slice(0, -1),
        future: [{ scenes: history.scenes, sceneId: entry.sceneId }, ...history.future],
      };
    }
    case 'redo': {
      const [entry, ...future] = history.future;
      if (!entry) return history;
      return {
        scenes: entry.scenes,
        past: [...history.past, { scenes: history.scenes, sceneId: entry.sceneId }],
        future,
      };
    }
  }
}
