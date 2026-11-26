import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Layers,
  Link2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Ungroup,
  X,
} from 'lucide-react';
import { COPY, type Language } from '../../../shared/i18n';
import {
  getGroupDefId,
  isGroupCodeTaken,
  resolveGroupCode,
  type BoardEdge,
  type BoardNode,
} from './studioModel';

interface GroupDirectoryPanelProps {
  lang: Language;
  nodes: BoardNode[];
  edges: BoardEdge[];
  onClose: () => void;
  onAddGroup: () => void;
  onUpdateGroupInfo: (id: string, groupCode: string, title: string, note: string) => void;
  onToggleGroupCollapse: (id: string) => void;
  onLocateGroup: (id: string) => void;
  onUngroupDefinition: (defId: string) => void;
  onDeleteGroupDefinition: (defId: string) => void;
}

function parseGroupNum(code: string): number {
  const m = code.match(/^G(\d+)$/i);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

export function GroupDirectoryPanel({
  lang,
  nodes,
  edges,
  onClose,
  onAddGroup,
  onUpdateGroupInfo,
  onToggleGroupCollapse,
  onLocateGroup,
  onUngroupDefinition,
  onDeleteGroupDefinition,
}: GroupDirectoryPanelProps) {
  const t = COPY[lang].studio.board;
  const [query, setQuery] = useState('');
  const [editingDefId, setEditingDefId] = useState<string | null>(null);
  const [draftCode, setDraftCode] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDeleteDefId, setConfirmDeleteDefId] = useState<string | null>(null);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const definitionRows = useMemo(() => {
    const groups = nodes.filter((n) => n.kind === 'group');
    const byDef = new Map<string, BoardNode[]>();
    for (const grp of groups) {
      const defId = getGroupDefId(grp);
      const list = byDef.get(defId) ?? [];
      list.push(grp);
      byDef.set(defId, list);
    }

    const rows = Array.from(byDef.entries()).map(([defId, instances]) => {
      const primary = instances[0];
      const code = resolveGroupCode(primary, nodes);
      const children = nodes.filter((n) => n.parentId === primary.id);
      const subGroupCount = children.filter((n) => n.kind === 'group').length;
      const cardCount = children.length - subGroupCount;
      const hasAnyChildren = instances.some((inst) =>
        nodes.some((n) => n.parentId === inst.id),
      );

      const placementDetails = instances.map((inst) => {
        const parentGroup =
          inst.parentId && nodeMap.get(inst.parentId)?.kind === 'group'
            ? nodeMap.get(inst.parentId)!
            : null;
        const parentCode = parentGroup ? resolveGroupCode(parentGroup, nodes) : null;
        const incomingCount = edges.filter((e) => e.toId === inst.id).length;
        const outgoingCount = edges.filter((e) => e.fromId === inst.id).length;
        return {
          inst,
          parentGroup,
          parentCode,
          incomingCount,
          outgoingCount,
        };
      });

      const totalIncoming = placementDetails.reduce((s, p) => s + p.incomingCount, 0);
      const totalOutgoing = placementDetails.reduce((s, p) => s + p.outgoingCount, 0);

      return {
        defId,
        primary,
        instances,
        placementDetails,
        code,
        cardCount,
        subGroupCount,
        hasAnyChildren,
        totalIncoming,
        totalOutgoing,
      };
    });

    rows.sort((a, b) => {
      const na = parseGroupNum(a.code);
      const nb = parseGroupNum(b.code);
      if (na !== nb) return na - nb;
      return a.code.localeCompare(b.code);
    });
    return rows;
  }, [edges, nodeMap, nodes]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return definitionRows;
    return definitionRows.filter((row) => {
      const codeMatch = row.code.toLowerCase().includes(q);
      const titleMatch = (row.primary.title || t.groupUntitled).toLowerCase().includes(q);
      const noteMatch = row.primary.note.toLowerCase().includes(q);
      return codeMatch || titleMatch || noteMatch;
    });
  }, [definitionRows, query, t.groupUntitled]);

  const startEditing = (defId: string, grp: BoardNode, code: string) => {
    setConfirmDeleteDefId(null);
    setEditingDefId(defId);
    setDraftCode(code);
    setDraftTitle(grp.title);
    setDraftNote(grp.note);
    setEditError(null);
  };

  const commitEditing = (defId: string, primaryId: string) => {
    const trimmed = draftCode.trim();
    if (!trimmed) {
      setEditError(t.groupIdEmptyErr);
      return;
    }
    if (isGroupCodeTaken(trimmed, nodes, defId)) {
      setEditError(t.groupIdDuplicateErr);
      return;
    }
    onUpdateGroupInfo(primaryId, trimmed, draftTitle.trim(), draftNote.trim());
    setEditingDefId(null);
    setEditError(null);
  };

  return (
    <div
      data-board-overlay="true"
      role="dialog"
      aria-label={t.groupDirTitle}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute top-3 left-3 right-3 bottom-16 z-40 bg-white/98 backdrop-blur-xs rounded-2xl border border-[#CBD5E1] shadow-[0_20px_50px_rgba(20,36,75,0.18)] flex flex-col overflow-hidden pointer-events-auto"
    >
      {/* Header Bar */}
      <div className="px-4 py-3 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="min-w-0 flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#334155] shrink-0" aria-hidden="true" />
          <h2 className="font-display text-sm font-bold text-[#14244B] whitespace-nowrap">
            {t.groupDirTitle}
          </h2>
          <span className="font-mono text-xs tabular-nums text-[#64748B]">
            · {definitionRows.length}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {definitionRows.length > 0 && (
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.groupDirSearchPh}
                className="w-52 max-w-[46vw] pl-8 pr-7 py-1.5 text-xs text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] focus:border-[#14244B] focus:bg-white rounded-lg focus:outline-none transition-colors"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded text-[#94A3B8] hover:text-[#14244B] flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              onAddGroup();
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#14244B] hover:bg-[#1E3468] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.groupDirAddShort}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            title={t.groupDirClose}
            aria-label={t.groupDirClose}
            className="w-8 h-8 rounded-lg text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Directory Body */}
      <div className="flex-1 min-h-0 overflow-auto">
        {definitionRows.length === 0 ? (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center p-8 text-center">
            <div className="w-10 h-10 rounded-xl bg-[#F1F5F9] flex items-center justify-center mb-3 text-[#475569]">
              <Layers className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="font-display text-sm font-bold text-[#14244B]">
              {t.groupDirEmpty}
            </div>
            <p className="mt-1 text-xs text-[#64748B] max-w-xs leading-relaxed">
              {t.groupDirEmptyHint}
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onAddGroup();
              }}
              className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#14244B] hover:bg-[#1E3468] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.groupDirAddShort}</span>
            </button>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="h-full min-h-[180px] flex items-center justify-center p-8 text-xs text-[#64748B]">
            {t.groupDirNoMatch}
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-[#F8FAFC] border-b border-[#E2E8F0]">
              <tr className="text-[11px] font-semibold text-[#64748B]">
                <th className="py-2.5 pl-4 pr-2 w-[96px]">{t.groupDirColId}</th>
                <th className="py-2.5 px-3 w-[24%]">{t.groupDirColName}</th>
                <th className="py-2.5 px-3">{t.groupDirColDesc}</th>
                <th className="py-2.5 pl-3 pr-4 w-[184px] text-right">
                  {t.groupDirColActions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {filteredRows.map(
                ({
                  defId,
                  primary,
                  instances,
                  placementDetails,
                  code,
                  cardCount,
                  subGroupCount,
                  hasAnyChildren,
                  totalIncoming,
                  totalOutgoing,
                }) => {
                  const isEditing = editingDefId === defId;
                  const isConfirmingDelete = confirmDeleteDefId === defId;
                  const isReused = instances.length > 1;
                  const duplicateEdit =
                    isEditing && isGroupCodeTaken(draftCode.trim(), nodes, defId);

                  const summaryParts: string[] = [];
                  if (cardCount > 0) {
                    summaryParts.push(
                      lang === 'zh'
                        ? `${cardCount} 张卡`
                        : `${cardCount} card${cardCount > 1 ? 's' : ''}`,
                    );
                  }
                  if (subGroupCount > 0) {
                    summaryParts.push(`${subGroupCount} ${t.groupSubgroupsUnit}`);
                  }
                  if (summaryParts.length === 0) {
                    summaryParts.push(lang === 'zh' ? '0 项内容' : '0 items');
                  }
                  if (totalIncoming > 0 || totalOutgoing > 0) {
                    summaryParts.push(
                      lang === 'zh'
                        ? `${totalIncoming}入/${totalOutgoing}出`
                        : `${totalIncoming} in / ${totalOutgoing} out`,
                    );
                  }

                  return (
                    <tr
                      key={defId}
                      className="align-top hover:bg-[#F8FAFC]/80 transition-colors"
                    >
                      {/* ID Column (Editable!) */}
                      <td className="py-3 pl-4 pr-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={draftCode}
                            placeholder={t.groupIdPlaceholder}
                            onChange={(e) => {
                              setDraftCode(e.target.value);
                              setEditError(null);
                            }}
                            className={`w-20 px-2 py-1 font-mono text-[11px] font-bold rounded-md border focus:outline-none ${
                              duplicateEdit || editError
                                ? 'border-[#DC2626] bg-[#FEF2F2] text-[#DC2626]'
                                : 'border-[#14244B] bg-white text-[#14244B]'
                            }`}
                          />
                        ) : (
                          <div className="flex flex-col items-start gap-1">
                            <button
                              type="button"
                              onClick={() => startEditing(defId, primary, code)}
                              title={t.groupIdEditTitle}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] font-bold tabular-nums cursor-pointer transition-opacity hover:opacity-90 ${
                                isReused
                                  ? 'bg-[#0284C7] text-white'
                                  : 'bg-[#14244B] text-white'
                              }`}
                            >
                              {isReused && (
                                <Link2 className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                              )}
                              <span>{code}</span>
                            </button>
                            {isReused && (
                              <span className="text-[10px] font-semibold text-[#0369A1]">
                                {t.groupReusedBadge} ×{instances.length}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Group Name & Placements */}
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input
                              type="text"
                              autoFocus
                              value={draftTitle}
                              placeholder={t.groupNamePlaceholder}
                              onChange={(e) => setDraftTitle(e.target.value)}
                              className="w-full px-2 py-1 text-xs font-bold text-[#14244B] bg-white border border-[#14244B] rounded-lg focus:outline-none"
                            />
                            {(editError || duplicateEdit) && (
                              <p className="text-[10.5px] font-medium text-[#DC2626] leading-snug">
                                {editError || t.groupIdDuplicateErr}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-[#14244B]">
                                {primary.title.trim() || t.groupUntitled}
                              </span>
                              {!isReused && primary.collapsed && (
                                <span className="px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[10px] font-semibold text-[#64748B]">
                                  {t.groupDirCollapsedTag}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#64748B] font-mono tabular-nums">
                              {summaryParts.join(' · ')}
                            </div>
                            {isReused ? (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {placementDetails.map((p, idx) => (
                                  <button
                                    key={p.inst.id}
                                    type="button"
                                    onClick={() => {
                                      onClose();
                                      onLocateGroup(p.inst.id);
                                    }}
                                    title={t.groupDirLocate}
                                    className="px-1.5 py-0.5 rounded bg-[#F0F9FF] hover:bg-[#E0F2FE] text-[#0369A1] text-[10px] font-semibold cursor-pointer transition-colors"
                                  >
                                    #{idx + 1}
                                    {p.parentCode ? ` (${p.parentCode})` : ''}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              placementDetails[0]?.parentGroup &&
                              placementDetails[0]?.parentCode && (
                                <div className="text-[10.5px] text-[#0369A1] font-medium">
                                  ↳ {t.groupDirInside} {placementDetails[0].parentCode} ·{' '}
                                  {placementDetails[0].parentGroup.title.trim() ||
                                    t.groupUntitled}
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </td>

                      {/* Core Idea / Meaning */}
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <div className="space-y-1.5">
                            <textarea
                              rows={3}
                              value={draftNote}
                              placeholder={t.groupDescPlaceholder}
                              onChange={(e) => setDraftNote(e.target.value)}
                              onKeyDown={(e) => {
                                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                  e.preventDefault();
                                  commitEditing(defId, primary.id);
                                } else if (e.key === 'Escape') {
                                  e.stopPropagation();
                                  setEditingDefId(null);
                                  setEditError(null);
                                }
                              }}
                              className="w-full px-2.5 py-1.5 text-xs text-[#1E293B] bg-white border border-[#14244B] rounded-lg resize-none leading-relaxed focus:outline-none"
                            />
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={!draftCode.trim() || duplicateEdit}
                                onClick={() => commitEditing(defId, primary.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#14244B] hover:bg-[#1E3468] disabled:bg-[#94A3B8] disabled:cursor-not-allowed text-white text-[11px] font-semibold cursor-pointer"
                              >
                                <Check className="w-3 h-3" aria-hidden="true" />
                                <span>{t.groupModalSave}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDefId(null);
                                  setEditError(null);
                                }}
                                className="px-2 py-1 rounded-md border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[11px] font-medium text-[#475569] cursor-pointer"
                              >
                                {t.groupModalSkip}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditing(defId, primary, code)}
                            title={t.groupDirEditInfo}
                            className="w-full text-left group/desc cursor-text rounded-lg p-1 -m-1 hover:bg-[#F1F5F9]/80 transition-colors"
                          >
                            {primary.note.trim() ? (
                              <p className="text-xs text-[#334155] leading-relaxed whitespace-pre-wrap break-words">
                                {primary.note}
                              </p>
                            ) : (
                              <span className="text-xs text-[#94A3B8] italic group-hover/desc:text-[#64748B]">
                                {t.groupDirNoDesc}
                              </span>
                            )}
                          </button>
                        )}
                      </td>

                      {/* Centralized Management Actions */}
                      <td className="py-3 pl-3 pr-4">
                        {isConfirmingDelete ? (
                          <div className="flex flex-col items-end gap-1.5">
                            <span className="text-[10.5px] font-semibold text-[#DC2626] text-right">
                              {t.groupDirDeletePrompt}
                            </span>
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmDeleteDefId(null);
                                  onDeleteGroupDefinition(defId);
                                }}
                                className="px-2 py-1 rounded-md bg-[#DC2626] hover:bg-[#B91C1C] text-white text-[10.5px] font-semibold cursor-pointer"
                              >
                                {t.groupDirDeleteConfirmAll}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteDefId(null)}
                                className="px-2 py-1 rounded-md border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[10.5px] font-medium text-[#475569] cursor-pointer"
                              >
                                {t.groupDirCancel}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onLocateGroup(primary.id);
                              }}
                              title={t.groupDirLocate}
                              aria-label={t.groupDirLocate}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#F0F9FF] hover:bg-[#E0F2FE] text-[#0369A1] text-[11px] font-semibold transition-colors cursor-pointer"
                            >
                              <Crosshair className="w-3 h-3 shrink-0" aria-hidden="true" />
                              <span>{lang === 'zh' ? '定位' : 'Locate'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                isEditing
                                  ? commitEditing(defId, primary.id)
                                  : startEditing(defId, primary, code)
                              }
                              title={t.groupDirEditInfo}
                              aria-label={t.groupDirEditInfo}
                              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                                isEditing
                                  ? 'bg-[#14244B] text-white'
                                  : 'text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9]'
                              }`}
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>

                            {!isReused && (
                              <button
                                type="button"
                                onClick={() => onToggleGroupCollapse(primary.id)}
                                title={primary.collapsed ? t.groupExpand : t.groupCollapse}
                                aria-label={
                                  primary.collapsed ? t.groupExpand : t.groupCollapse
                                }
                                className="w-7 h-7 rounded-md text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-pointer"
                              >
                                {primary.collapsed ? (
                                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                                ) : (
                                  <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                                )}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteDefId(null);
                                onUngroupDefinition(defId);
                              }}
                              title={t.groupDirUngroup}
                              aria-label={t.groupDirUngroup}
                              className="w-7 h-7 rounded-md text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <Ungroup className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (hasAnyChildren) {
                                  setConfirmDeleteDefId(defId);
                                } else {
                                  onDeleteGroupDefinition(defId);
                                }
                              }}
                              title={t.groupDirDeleteGroup}
                              aria-label={t.groupDirDeleteGroup}
                              className="w-7 h-7 rounded-md text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEF2F2] flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
