import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { COPY, type Language } from '../../../shared/i18n';
import {
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
  onUpdateGroupInfo: (id: string, title: string, note: string) => void;
  onToggleGroupCollapse: (id: string) => void;
  onLocateGroup: (id: string) => void;
  onDeleteGroup: (id: string) => void;
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
  onDeleteGroup,
}: GroupDirectoryPanelProps) {
  const t = COPY[lang].studio.board;
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNote, setDraftNote] = useState('');

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const groupRows = useMemo(() => {
    const groups = nodes.filter((n) => n.kind === 'group');
    const enriched = groups.map((grp) => {
      const code = resolveGroupCode(grp, nodes);
      const children = nodes.filter((n) => n.parentId === grp.id);
      const subGroupCount = children.filter((n) => n.kind === 'group').length;
      const cardCount = children.length - subGroupCount;
      const parentGroup =
        grp.parentId && nodeMap.get(grp.parentId)?.kind === 'group'
          ? nodeMap.get(grp.parentId)!
          : null;
      const parentCode = parentGroup ? resolveGroupCode(parentGroup, nodes) : null;
      const incomingCount = edges.filter((e) => e.toId === grp.id).length;
      const outgoingCount = edges.filter((e) => e.fromId === grp.id).length;

      return {
        node: grp,
        code,
        cardCount,
        subGroupCount,
        parentGroup,
        parentCode,
        incomingCount,
        outgoingCount,
      };
    });

    enriched.sort((a, b) => parseGroupNum(a.code) - parseGroupNum(b.code));
    return enriched;
  }, [edges, nodeMap, nodes]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groupRows;
    return groupRows.filter((row) => {
      const codeMatch = row.code.toLowerCase().includes(q);
      const titleMatch = (row.node.title || t.groupUntitled).toLowerCase().includes(q);
      const noteMatch = row.node.note.toLowerCase().includes(q);
      return codeMatch || titleMatch || noteMatch;
    });
  }, [groupRows, query, t.groupUntitled]);

  const startEditing = (grp: BoardNode) => {
    setEditingId(grp.id);
    setDraftTitle(grp.title);
    setDraftNote(grp.note);
  };

  const commitEditing = (id: string) => {
    onUpdateGroupInfo(id, draftTitle.trim(), draftNote.trim());
    setEditingId(null);
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
            · {groupRows.length}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {groupRows.length > 0 && (
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
        {groupRows.length === 0 ? (
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
                <th className="py-2.5 pl-4 pr-2 w-[72px]">{t.groupDirColId}</th>
                <th className="py-2.5 px-3 w-[26%]">{t.groupDirColName}</th>
                <th className="py-2.5 px-3">{t.groupDirColDesc}</th>
                <th className="py-2.5 pl-3 pr-4 w-[132px] text-right">
                  {t.groupDirColActions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {filteredRows.map(
                ({
                  node,
                  code,
                  cardCount,
                  subGroupCount,
                  parentGroup,
                  parentCode,
                  incomingCount,
                  outgoingCount,
                }) => {
                  const isEditing = editingId === node.id;
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
                  if (incomingCount > 0 || outgoingCount > 0) {
                    summaryParts.push(
                      lang === 'zh'
                        ? `${incomingCount}入/${outgoingCount}出`
                        : `${incomingCount} in / ${outgoingCount} out`,
                    );
                  }

                  return (
                    <tr
                      key={node.id}
                      className="align-top hover:bg-[#F8FAFC]/80 transition-colors"
                    >
                      {/* ID Column */}
                      <td className="py-3 pl-4 pr-2">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-[#14244B] text-white font-mono text-[11px] font-bold tabular-nums">
                          {code}
                        </span>
                      </td>

                      {/* Group Name & Hierarchy */}
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <input
                            type="text"
                            autoFocus
                            value={draftTitle}
                            placeholder={t.groupNamePlaceholder}
                            onChange={(e) => setDraftTitle(e.target.value)}
                            className="w-full px-2 py-1 text-xs font-bold text-[#14244B] bg-white border border-[#14244B] rounded-lg focus:outline-none"
                          />
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-[#14244B]">
                                {node.title.trim() || t.groupUntitled}
                              </span>
                              {node.collapsed && (
                                <span className="px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[10px] font-semibold text-[#64748B]">
                                  {t.groupDirCollapsedTag}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#64748B] font-mono tabular-nums">
                              {summaryParts.join(' · ')}
                            </div>
                            {parentGroup && parentCode && (
                              <div className="text-[10.5px] text-[#0369A1] font-medium">
                                ↳ {t.groupDirInside} {parentCode} ·{' '}
                                {parentGroup.title.trim() || t.groupUntitled}
                              </div>
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
                                  commitEditing(node.id);
                                } else if (e.key === 'Escape') {
                                  e.stopPropagation();
                                  setEditingId(null);
                                }
                              }}
                              className="w-full px-2.5 py-1.5 text-xs text-[#1E293B] bg-white border border-[#14244B] rounded-lg resize-none leading-relaxed focus:outline-none"
                            />
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => commitEditing(node.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#14244B] hover:bg-[#1E3468] text-white text-[11px] font-semibold cursor-pointer"
                              >
                                <Check className="w-3 h-3" aria-hidden="true" />
                                <span>{t.groupModalSave}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="px-2 py-1 rounded-md border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[11px] font-medium text-[#475569] cursor-pointer"
                              >
                                {t.groupModalSkip}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditing(node)}
                            title={t.groupDirEditInfo}
                            className="w-full text-left group/desc cursor-text rounded-lg p-1 -m-1 hover:bg-[#F1F5F9]/80 transition-colors"
                          >
                            {node.note.trim() ? (
                              <p className="text-xs text-[#334155] leading-relaxed whitespace-pre-wrap break-words">
                                {node.note}
                              </p>
                            ) : (
                              <span className="text-xs text-[#94A3B8] italic group-hover/desc:text-[#64748B]">
                                {t.groupDirNoDesc}
                              </span>
                            )}
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 pl-3 pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onLocateGroup(node.id);
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
                              isEditing ? commitEditing(node.id) : startEditing(node)
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

                          <button
                            type="button"
                            onClick={() => onToggleGroupCollapse(node.id)}
                            title={node.collapsed ? t.groupExpand : t.groupCollapse}
                            aria-label={node.collapsed ? t.groupExpand : t.groupCollapse}
                            className="w-7 h-7 rounded-md text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-pointer"
                          >
                            {node.collapsed ? (
                              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => onDeleteGroup(node.id)}
                            title={t.deleteCard}
                            aria-label={t.deleteCard}
                            className="w-7 h-7 rounded-md text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEF2F2] flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
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
