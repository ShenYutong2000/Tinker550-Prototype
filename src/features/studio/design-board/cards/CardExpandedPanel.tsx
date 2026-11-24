import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import type { AssetCategoryId, AssetItem } from '../../asset-library/assetLibraryModel';
import { COPY, type Language } from '../../../../shared/i18n';
import type { NumericFormulaSymbol, ScopedStateVariable } from '../../properties/stateModel';
import {
  formatActionControlKey,
  getNodeAssetIds,
  type ActionControlConfig,
  type BoardNode,
  type CardFieldConfig,
  type ChallengeBehaviorConfig,
  type ControlDevice,
  type ControlInteractionType,
  type PlaybackMode,
  type PlaybackSettings,
} from '../studioModel';
import {
  resolveActionControl,
  resolvePlaybackSettings,
} from '../../playtest/boardPlayEngine';
import { AssetMultiSelect } from './AssetMultiSelect';
import { RelatedParametersEditor } from './RelatedParametersEditor';
import { RelatedPropertiesEditor } from './RelatedPropertiesEditor';

interface CardExpandedPanelProps {
  lang: Language;
  node: BoardNode;
  assetItems: AssetItem[];
  scopedVariables: ScopedStateVariable[];
  numericParameters: NumericFormulaSymbol[];
  onUpdateNode: (
    id: string,
    patch: Partial<Pick<BoardNode, 'title' | 'note' | 'assetId' | 'assetIds' | 'promptInput' | 'challengeAssetId'>>,
  ) => void;
  onUpdateNodeField: <K extends keyof CardFieldConfig>(
    id: string,
    key: K,
    value: CardFieldConfig[K],
  ) => void;
  onResetAutoFields: (id: string) => void;
  onEnableChoiceOrdering?: (entry: ScopedStateVariable) => void;
  onCollapse: () => void;
}

const KEYBOARD_PRESET_INPUTS: { value: string; labelEn: string; labelZh: string }[] = [
  { value: 'Space', labelEn: 'Space', labelZh: '空格键 (Space)' },
  { value: 'ArrowUp', labelEn: 'Arrow Up (↑)', labelZh: '方向上键 (↑)' },
  { value: 'ArrowDown', labelEn: 'Arrow Down (↓)', labelZh: '方向下键 (↓)' },
  { value: 'ArrowLeft', labelEn: 'Arrow Left (←)', labelZh: '方向左键 (←)' },
  { value: 'ArrowRight', labelEn: 'Arrow Right (→)', labelZh: '方向右键 (→)' },
  { value: 'W', labelEn: 'W', labelZh: 'W 键' },
  { value: 'A', labelEn: 'A', labelZh: 'A 键' },
  { value: 'S', labelEn: 'S', labelZh: 'S 键' },
  { value: 'D', labelEn: 'D', labelZh: 'D 键' },
  { value: 'custom', labelEn: 'Custom key...', labelZh: '自定义按键...' },
];

const MOUSE_INPUTS: { value: string; labelKey: 'ctrlMouseLeft' | 'ctrlMouseRight' | 'ctrlMousePos' }[] = [
  { value: 'Left Button', labelKey: 'ctrlMouseLeft' },
  { value: 'Right Button', labelKey: 'ctrlMouseRight' },
  { value: 'Mouse Position', labelKey: 'ctrlMousePos' },
];

const KEYBOARD_INTERACTIONS: ControlInteractionType[] = ['press', 'hold', 'release'];
const MOUSE_INTERACTIONS: ControlInteractionType[] = [
  'press',
  'hold',
  'release',
  'double-click',
  'drag',
];

const PREFERRED_ASSETS_BY_KIND: Record<string, AssetCategoryId[]> = {
  narration: ['backgrounds', 'interface', 'effects'],
  dialogue: ['characters', 'interface', 'objects', 'backgrounds'],
  challenge: ['objects', 'characters', 'backgrounds', 'effects'],
  action: ['characters', 'effects', 'objects'],
  outcome: ['characters', 'objects', 'effects', 'backgrounds', 'interface'],
};

export function CardExpandedPanel({
  lang,
  node,
  assetItems,
  scopedVariables,
  numericParameters,
  onUpdateNode,
  onUpdateNodeField,
  onResetAutoFields,
  onEnableChoiceOrdering,
  onCollapse,
}: CardExpandedPanelProps) {
  const b = COPY[lang].studio.board;
  const boundAssetIds = getNodeAssetIds(node);
  const challengeAppearances = node.kind === 'challenge'
    ? assetItems.filter(asset => boundAssetIds.includes(asset.id) &&
      ['objects', 'characters', 'effects'].includes(asset.categoryId) &&
      asset.states.some(state => state.id === asset.activeStateId && state.mediaKind !== 'video' && state.mediaUrl))
    : [];

  // Action Control searchable input combobox
  const [ctrlInputOpen, setCtrlInputOpen] = useState(false);
  const [ctrlInputQuery, setCtrlInputQuery] = useState('');
  const ctrlInputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ctrlInputOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ctrlInputRef.current && !ctrlInputRef.current.contains(e.target as Node)) {
        setCtrlInputOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [ctrlInputOpen]);

  const playback: PlaybackSettings = resolvePlaybackSettings(node);
  const actionCtrl: ActionControlConfig = resolveActionControl(node);

  const updatePlayback = (patch: Partial<PlaybackSettings>) => {
    onUpdateNodeField(node.id, 'playbackSettings', {
      ...playback,
      ...patch,
    });
  };

  const updateActionControl = (patch: Partial<ActionControlConfig>) => {
    const next: ActionControlConfig = { ...actionCtrl, ...patch };
    // Ensure valid input & interactionType when switching device
    if (patch.device && patch.device !== actionCtrl.device) {
      if (patch.device === 'mouse') {
        next.input = 'Left Button';
        next.customKey = undefined;
      } else {
        next.input = 'Space';
        if (next.interactionType === 'double-click' || next.interactionType === 'drag') {
          next.interactionType = 'press';
        }
      }
    }
    onUpdateNodeField(node.id, 'actionControl', next);
    onUpdateNodeField(node.id, 'keyBinding', formatActionControlKey(next));
  };

  const filteredControlInputs = useMemo(() => {
    const q = ctrlInputQuery.trim().toLowerCase();
    if (actionCtrl.device === 'mouse') {
      return MOUSE_INPUTS.map((m) => ({
        value: m.value,
        label: b[m.labelKey],
      })).filter((opt) => !q || opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q));
    }
    return KEYBOARD_PRESET_INPUTS.map((k) => ({
      value: k.value,
      label: lang === 'zh' ? k.labelZh : k.labelEn,
    })).filter((opt) => !q || opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q));
  }, [actionCtrl.device, b, ctrlInputQuery, lang]);

  const currentControlInputLabel = useMemo(() => {
    if (actionCtrl.device === 'mouse') {
      const m = MOUSE_INPUTS.find((item) => item.value === actionCtrl.input);
      return m ? b[m.labelKey] : actionCtrl.input;
    }
    const k = KEYBOARD_PRESET_INPUTS.find((item) => item.value === actionCtrl.input);
    if (k) return lang === 'zh' ? k.labelZh : k.labelEn;
    return actionCtrl.input || 'Space';
  }, [actionCtrl.device, actionCtrl.input, b, lang]);

  const interactionLabel = (t: ControlInteractionType) => {
    switch (t) {
      case 'press':
        return b.ctrlPressOnce;
      case 'hold':
        return b.ctrlHold;
      case 'release':
        return b.ctrlRelease;
      case 'double-click':
        return b.ctrlDoubleClick;
      case 'drag':
        return b.ctrlDrag;
    }
  };

  const behavior = node.fields.relatedBehavior;
  const updateBehavior = (next: ChallengeBehaviorConfig | null) => {
    onUpdateNodeField(node.id, 'relatedBehavior', next);
  };

  const parameters = node.fields.relatedParameters ?? [];
  const propertyRules = node.fields.relatedProperties ?? [];

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="border-t border-black/10 bg-white/75 px-3.5 py-3 space-y-3.5 text-[#14244B]"
    >
      {/* 1. Asset Binding (All 5 playable cards) */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold text-[#334155]">
            1. {b.secAssetBinding}
          </h4>
          {boundAssetIds.length > 0 && (
            <span className="font-mono tabular-nums text-[10px] text-[#64748B]">
              {boundAssetIds.length}
            </span>
          )}
        </div>
        <AssetMultiSelect
          lang={lang}
          assetItems={assetItems}
          selectedIds={boundAssetIds}
          preferredCategories={PREFERRED_ASSETS_BY_KIND[node.kind]}
          onChange={(nextIds) => onUpdateNode(node.id, { assetIds: nextIds })}
        />
        {challengeAppearances.length > 0 && <label className="grid gap-1 text-xs text-slate-600">
          {lang === 'zh' ? '舞台造型' : 'Stage appearance'}
          <select value={challengeAppearances.some(asset => asset.id === node.challengeAssetId) ? node.challengeAssetId : ''}
            onChange={event => onUpdateNode(node.id, { challengeAssetId: event.target.value || undefined })}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1">
            <option value="">{lang === 'zh' ? '自动选择' : 'Automatic'}</option>
            {challengeAppearances.map(asset => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
          </select>
        </label>}
      </section>

      {/* 2. Narration & Dialogue: Playback Settings */}
      {(node.kind === 'narration' || node.kind === 'dialogue') && (
        <section className="pt-3 border-t border-black/8 space-y-2">
          <h4 className="text-[11px] font-semibold text-[#334155]">2. {b.secPlayback}</h4>

          <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#F1F5F9] rounded-lg border border-[#E2E8F0]">
            {(
              [
                { id: 'click' as PlaybackMode, label: b.playClick },
                { id: 'key' as PlaybackMode, label: b.playKey },
                { id: 'auto' as PlaybackMode, label: b.playAuto },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => updatePlayback({ mode: opt.id })}
                className={`py-1.5 px-1 rounded-md text-[10px] font-semibold transition-colors whitespace-nowrap truncate cursor-pointer ${
                  playback.mode === opt.id
                    ? 'bg-white text-[#14244B] shadow-xs'
                    : 'text-[#64748B] hover:text-[#14244B]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {playback.mode === 'key' && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#64748B] shrink-0">{b.playKeyLabel}</span>
              <input
                type="text"
                value={playback.key ?? 'Space'}
                onChange={(e) => updatePlayback({ key: e.target.value })}
                placeholder="Space / Enter / E"
                className="flex-1 min-w-0 px-2.5 py-1 font-mono text-[11px] font-semibold text-[#14244B] bg-white border border-[#CBD5E1] rounded-md focus:outline-none focus:border-[#4E9AE3]"
              />
            </div>
          )}

          {playback.mode === 'auto' && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0.5}
                max={60}
                step={0.5}
                value={playback.durationSec ?? 3}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  updatePlayback({
                    durationSec: Number.isFinite(val) && val > 0 ? val : 3,
                  });
                }}
                className="w-20 px-2.5 py-1 font-mono tabular-nums text-[11px] font-semibold text-[#14244B] bg-white border border-[#CBD5E1] rounded-md focus:outline-none focus:border-[#4E9AE3]"
              />
              <span className="text-[11px] text-[#64748B]">{b.playSecUnit}</span>
            </div>
          )}
        </section>
      )}

      {/* 2 & 3. Challenge: Optional Related Behavior + Optional Related Parameters */}
      {node.kind === 'challenge' && (
        <>
          <section className="pt-3 border-t border-black/8 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <h4 className="text-[11px] font-semibold text-[#334155] truncate">
                  2. {b.secBehavior}
                </h4>
                <span className="text-[10px] font-normal text-[#94A3B8] shrink-0">
                  · {b.behaviorOptional}
                </span>
              </div>
              {behavior ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      updateBehavior({
                        ...behavior,
                        mode: behavior.mode === 'custom' ? 'template' : 'custom',
                      })
                    }
                    className="text-[10px] font-semibold text-[#4338CA] hover:underline whitespace-nowrap cursor-pointer"
                  >
                    {behavior.mode === 'custom' ? b.modeTemplate : b.modeCustom}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateBehavior(null)}
                    aria-label={b.behaviorRemove}
                    className="text-[#94A3B8] hover:text-[#DC2626] cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    updateBehavior({
                      mode: 'template',
                      direction: '',
                      action: '',
                    })
                  }
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#4338CA] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                  <span>{b.behaviorAdd}</span>
                </button>
              )}
            </div>

            {behavior &&
              (behavior.mode === 'custom' ? (
                <textarea
                  rows={2}
                  value={behavior.customText ?? ''}
                  onChange={(e) =>
                    updateBehavior({ ...behavior, customText: e.target.value })
                  }
                  placeholder={b.behaviorCustomPh}
                  className="w-full px-2.5 py-1.5 text-[11px] text-[#14244B] placeholder:text-[#94A3B8] bg-white border border-[#CBD5E1] rounded-md resize-none focus:outline-none focus:border-[#6366F1]"
                />
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[#64748B] shrink-0">
                      {b.behaviorPrefix}
                    </span>
                    <input
                      type="text"
                      value={behavior.direction ?? ''}
                      onChange={(e) =>
                        updateBehavior({ ...behavior, direction: e.target.value })
                      }
                      placeholder={b.behaviorDirPh}
                      className="flex-1 min-w-0 px-2 py-1 text-[11px] font-medium text-[#14244B] placeholder:text-[#94A3B8] bg-white border border-[#CBD5E1] rounded-md focus:outline-none focus:border-[#6366F1]"
                    />
                  </div>
                  <input
                    type="text"
                    value={behavior.action ?? ''}
                    onChange={(e) =>
                      updateBehavior({ ...behavior, action: e.target.value })
                    }
                    placeholder={b.behaviorActPh}
                    className="w-full px-2 py-1 text-[11px] font-medium text-[#14244B] placeholder:text-[#94A3B8] bg-white border border-[#CBD5E1] rounded-md focus:outline-none focus:border-[#6366F1]"
                  />
                </div>
              ))}
          </section>

          <section className="pt-3 border-t border-black/8 space-y-2">
            <div className="flex items-center gap-1.5">
              <h4 className="text-[11px] font-semibold text-[#334155]">
                3. {b.secParameters}
              </h4>
              <span className="text-[10px] font-normal text-[#94A3B8]">
                · {b.behaviorOptional}
              </span>
            </div>
            <RelatedParametersEditor
              lang={lang}
              parameters={parameters}
              isOptional
              onChange={(next) => onUpdateNodeField(node.id, 'relatedParameters', next)}
            />
          </section>
        </>
      )}

      {/* 2 & 3. Action: 3-Part Control + Related Parameters */}
      {node.kind === 'action' && (
        <>
          <section className="pt-3 border-t border-black/8 space-y-2.5">
            <h4 className="text-[11px] font-semibold text-[#334155]">2. {b.secControl}</h4>

            {/* a. Device */}
            <div className="space-y-1">
              <span className="text-[10px] text-[#64748B]">a. {b.ctrlDevice}</span>
              <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#F1F5F9] rounded-lg border border-[#E2E8F0]">
                {(
                  [
                    { id: 'keyboard' as ControlDevice, label: b.ctrlKeyboard },
                    { id: 'mouse' as ControlDevice, label: b.ctrlMouse },
                  ] as const
                ).map((dev) => (
                  <button
                    key={dev.id}
                    type="button"
                    onClick={() => updateActionControl({ device: dev.id })}
                    className={`py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      actionCtrl.device === dev.id
                        ? 'bg-white text-[#14244B] shadow-xs'
                        : 'text-[#64748B] hover:text-[#14244B]'
                    }`}
                  >
                    {dev.label}
                  </button>
                ))}
              </div>
            </div>

            {/* b. Searchable Input Selector */}
            <div className="space-y-1">
              <span className="text-[10px] text-[#64748B]">b. {b.ctrlInput}</span>
              <div ref={ctrlInputRef} className="relative">
                <button
                  type="button"
                  onClick={() => setCtrlInputOpen((v) => !v)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#CBD5E1] hover:border-[#0EA5E9] text-[11px] font-semibold text-[#14244B] flex items-center justify-between gap-2 cursor-pointer"
                >
                  <span className="truncate">{currentControlInputLabel}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#64748B] shrink-0" aria-hidden="true" />
                </button>

                {ctrlInputOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-[60] bg-white rounded-xl border border-[#CBD5E1] shadow-[0_14px_34px_rgba(15,23,42,0.16)] overflow-hidden">
                    <div className="p-1.5 border-b border-[#F1F5F9]">
                      <div className="relative">
                        <Search
                          className="w-3 h-3 text-[#94A3B8] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
                          aria-hidden="true"
                        />
                        <input
                          type="text"
                          autoFocus
                          value={ctrlInputQuery}
                          onChange={(e) => setCtrlInputQuery(e.target.value)}
                          placeholder={b.ctrlInputSearchPh}
                          className="w-full pl-6 pr-2 py-1 text-[11px] text-[#14244B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md focus:outline-none focus:bg-white focus:border-[#0EA5E9]"
                        />
                      </div>
                    </div>
                    <div className="max-h-40 overflow-y-auto py-1">
                      {filteredControlInputs.length === 0 ? (
                        <div className="px-2.5 py-2 text-[11px] text-[#94A3B8] text-center">
                          {b.assetNoMatch}
                        </div>
                      ) : (
                        filteredControlInputs.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              updateActionControl({
                                input: opt.value,
                                customKey:
                                  opt.value === 'custom'
                                    ? actionCtrl.customKey || 'E'
                                    : undefined,
                              });
                              setCtrlInputOpen(false);
                              setCtrlInputQuery('');
                            }}
                            className={`w-full px-2.5 py-1.5 text-left text-[11px] cursor-pointer ${
                              actionCtrl.input === opt.value
                                ? 'bg-[#F0F9FF] text-[#0369A1] font-semibold'
                                : 'text-[#334155] hover:bg-[#F8FAFC]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {actionCtrl.device === 'keyboard' && actionCtrl.input === 'custom' && (
                <input
                  type="text"
                  value={actionCtrl.customKey ?? ''}
                  onChange={(e) => updateActionControl({ customKey: e.target.value })}
                  placeholder={b.ctrlCustomKeyPh}
                  className="w-full px-2.5 py-1 font-mono text-[11px] font-semibold text-[#14244B] bg-white border border-[#CBD5E1] rounded-md focus:outline-none focus:border-[#0EA5E9]"
                />
              )}
            </div>

            {/* c. Interaction Type */}
            <div className="space-y-1">
              <span className="text-[10px] text-[#64748B]">c. {b.ctrlInteraction}</span>
              <div className="flex flex-wrap gap-1">
                {(actionCtrl.device === 'mouse'
                  ? MOUSE_INTERACTIONS
                  : KEYBOARD_INTERACTIONS
                ).map((itype) => (
                  <button
                    key={itype}
                    type="button"
                    onClick={() => updateActionControl({ interactionType: itype })}
                    className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      actionCtrl.interactionType === itype
                        ? 'bg-[#0369A1] text-white'
                        : 'bg-white border border-[#E2E8F0] text-[#475569] hover:border-[#94A3B8]'
                    }`}
                  >
                    {interactionLabel(itype)}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="pt-3 border-t border-black/8 space-y-2">
            <h4 className="text-[11px] font-semibold text-[#334155]">3. {b.secParameters}</h4>
            <RelatedParametersEditor
              lang={lang}
              parameters={parameters}
              onChange={(next) => onUpdateNodeField(node.id, 'relatedParameters', next)}
            />
          </section>
        </>
      )}

      {/* 2 & 3. Outcome: Related Properties + Optional Related Parameters */}
      {node.kind === 'outcome' && (
        <>
          <section className="pt-3 border-t border-black/8 space-y-2">
            <h4 className="text-[11px] font-semibold text-[#334155]">
              2. {b.secProperties}
            </h4>
            <RelatedPropertiesEditor
              lang={lang}
              rules={propertyRules}
              scopedVariables={scopedVariables}
              numericParameters={numericParameters}
              onChange={(next) => onUpdateNodeField(node.id, 'relatedProperties', next)}
              onEnableChoiceOrdering={onEnableChoiceOrdering}
            />
          </section>

          <section className="pt-3 border-t border-black/8 space-y-2">
            <div className="flex items-center gap-1.5">
              <h4 className="text-[11px] font-semibold text-[#334155]">
                3. {b.secParameters}
              </h4>
              <span className="text-[10px] font-normal text-[#94A3B8]">
                · {b.behaviorOptional}
              </span>
            </div>
            <RelatedParametersEditor
              lang={lang}
              parameters={parameters}
              isOptional
              onChange={(next) => onUpdateNodeField(node.id, 'relatedParameters', next)}
            />
          </section>
        </>
      )}

      {/* Footer Actions */}
      <div className="pt-2.5 border-t border-black/8 flex items-center justify-between gap-2">
        {node.manualFields.length > 0 ? (
          <button
            type="button"
            onClick={() => onResetAutoFields(node.id)}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#64748B] hover:text-[#14244B] transition-colors whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            <span>{b.resetAuto}</span>
          </button>
        ) : (
          <span className="text-[10px] text-[#94A3B8]">{b.autoMappedTag}</span>
        )}
        <button
          type="button"
          onClick={onCollapse}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-[#475569] hover:text-[#14244B] hover:bg-black/5 transition-colors whitespace-nowrap cursor-pointer"
        >
          <ChevronUp className="w-3 h-3" aria-hidden="true" />
          <span>{b.collapseCard}</span>
        </button>
      </div>
    </div>
  );
}
