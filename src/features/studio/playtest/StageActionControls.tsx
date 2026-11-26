import { ArrowUp, Lock, Shield, Wind, Zap } from 'lucide-react';
import { COPY, type Language } from '../../../shared/i18n';
import { getPlayableNodes, resolveActionConfig } from './boardPlayEngine';
import { getStageActionControls, type StageRun } from './sceneRuntime';
import type { ActionMechanic } from '../design-board/studioModel';

function renderActionIcon(mechanic: ActionMechanic) {
  const cls = 'w-3.5 h-3.5 shrink-0';
  if (mechanic === 'jump') return <ArrowUp className={cls} aria-hidden="true" />;
  if (mechanic === 'shield') return <Shield className={cls} aria-hidden="true" />;
  if (mechanic === 'dodge') return <Wind className={cls} aria-hidden="true" />;
  return <Zap className={cls} aria-hidden="true" />;
}

type Props = {
  lang: Language;
  graph: Parameters<typeof getStageActionControls>[1];
  run?: StageRun;
  previewNodeIds?: Set<string>;
  mode: 'edit' | 'play' | 'paused';
  onChoose: (actionId: string) => void;
};

export function StageActionControls({ lang, graph, run, previewNodeIds, mode, onChoose }: Props) {
  const t = COPY[lang].studio.play;
  const previewActions = mode === 'edit' ? getPlayableNodes(graph.nodes).filter(node =>
    node.kind === 'action' && (!previewNodeIds || previewNodeIds.has(node.id))) : [];
  const available = run && mode === 'play' && !run.overlayId && !run.finished ? getStageActionControls(run, graph) : [];
  const showOwners = new Set(available.map(item => item.ownerKey)).size > 1;
  const controls = available.map(item => ({
      ...item, target: item.action, mechanic: item.config.mechanic, keyLabel: item.config.keyBinding,
      comboFrameId: item.frame?.id ?? null, hasExclusiveSiblings: item.exclusive, exclusiveLocked: item.locked,
      ownerLabel: showOwners ? item.owner?.name : undefined,
      evaluation: { passed: item.passed, hasCondition: Boolean(item.edge?.condition), raw: item.edge?.condition },
    }));

  return (mode === 'edit' ? (
    previewActions.length > 0 ? (
      <div className="space-y-1.5">
        <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
          {t.previewControls}
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {previewActions.map((actionNode) => {
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
    : null
  ) : mode === 'play' && run && !run.overlayId && !run.finished ? (
    <div className="stage-action-controls space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#0369A1]">
          {t.chooseAction}
        </span>
        {controls.some((c) => c.comboFrameId !== null) && (
          <span className="px-1.5 py-0.5 rounded bg-[#E0F2FE] text-[#0369A1] text-[10px] font-semibold">
            {t.comboGroupBadge}
          </span>
        )}
        {!controls.some((c) => c.comboFrameId !== null) &&
          controls.some((c) => c.hasExclusiveSiblings) && (
            <span className="px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[#475569] text-[10px] font-semibold">
              {t.exclusiveGroupBadge}
            </span>
          )}
      </div>
      {controls.length > 0 ? (
        <div className="grid grid-cols-1 gap-1.5">
          {controls.map((ctrl) => {
            const locked = !ctrl.evaluation.passed || ctrl.exclusiveLocked;
            const isCombo = ctrl.comboFrameId !== null;
            return (
              <button
                key={ctrl.id}
                type="button"
                disabled={locked}
                onClick={() => onChoose(ctrl.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                  locked
                    ? 'bg-[#F8FAFC] border-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
                    : isCombo
                      ? 'bg-[#FFFBEB] border-[#FBBF24] hover:border-[#D97706] hover:bg-[#FEF3C7] text-[#14244B] active:scale-[0.98] cursor-pointer shadow-2xs'
                      : 'bg-[#F0F9FF] border-[#7DD3FC] hover:border-[#0284C7] hover:bg-[#E0F2FE] text-[#14244B] active:scale-[0.98] cursor-pointer shadow-2xs'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                      locked
                        ? 'bg-[#E2E8F0] text-[#94A3B8]'
                        : isCombo
                          ? 'bg-[#F59E0B] text-white'
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
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-bold truncate">
                        {ctrl.target.note || ctrl.mechanic}
                      </span>
                      {isCombo && !locked && (
                        <span className="px-1 py-0.25 rounded bg-[#FEF3C7] border border-[#FCD34D] text-[9.5px] font-bold text-[#B45309] shrink-0">
                          {t.comboGroupBadge}
                        </span>
                      )}
                      {!isCombo && ctrl.hasExclusiveSiblings && (
                        <span className="px-1 py-0.25 rounded bg-[#F1F5F9] text-[9.5px] font-semibold text-[#64748B] shrink-0">
                          {t.exclusiveGroupBadge}
                        </span>
                      )}
                      {ctrl.ownerLabel && (
                        <span className="font-normal text-[10.5px] text-[#64748B] truncate">
                          · {ctrl.ownerLabel}
                        </span>
                      )}
                    </div>
                    {ctrl.exclusiveLocked ? (
                      <div className="text-[10px] font-medium text-[#94A3B8] truncate">
                        {t.exclusiveLockedMsg}
                      </div>
                    ) : ctrl.evaluation.hasCondition ? (
                      <div
                        className={`text-[10px] font-medium truncate ${
                          locked ? 'text-[#94A3B8]' : 'text-[#047857]'
                        }`}
                      >
                        {locked ? `${t.requiresPrefix}: ` : 'if '}
                        {ctrl.evaluation.raw}
                      </div>
                    ) : null}
                  </div>
                </div>

                <kbd
                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold shrink-0 ${
                    locked
                      ? 'bg-[#E2E8F0] text-[#94A3B8]'
                      : isCombo
                        ? 'bg-white border border-[#FCD34D] text-[#B45309]'
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
        <p className="text-xs text-[#64748B]">
          {run.pendingOutcomes.length ? (lang === 'zh' ? '正在执行 Outcome…' : 'Executing outcome…') : run.entities.some(item => item.kind === 'challenge' && !item.collected) ? t.noConnectedActionHint : t.noControlsHint}
        </p>
      )}
    </div>
  ) : null);
}
