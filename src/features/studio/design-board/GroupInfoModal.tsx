import { useEffect, useRef, useState } from 'react';
import { Layers, Link2, X } from 'lucide-react';
import { COPY, type Language } from '../../../shared/i18n';
import {
  getGroupDefId,
  isGroupCodeTaken,
  type BoardNode,
} from './studioModel';

interface GroupInfoModalProps {
  lang: Language;
  groupNode: BoardNode;
  nodes: BoardNode[];
  initialCode: string;
  initialTitle: string;
  initialNote: string;
  isReusedInstance?: boolean;
  reusedCount?: number;
  focusField?: 'code' | 'title' | 'note';
  onSave: (groupCode: string, title: string, note: string) => void;
  onClose: () => void;
}

export function GroupInfoModal({
  lang,
  groupNode,
  nodes,
  initialCode,
  initialTitle,
  initialNote,
  isReusedInstance = false,
  reusedCount = 1,
  focusField = 'note',
  onSave,
  onClose,
}: GroupInfoModalProps) {
  const t = COPY[lang].studio.board;
  const [groupCode, setGroupCode] = useState(initialCode);
  const [title, setTitle] = useState(initialTitle);
  const [note, setNote] = useState(initialNote);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (focusField === 'code') {
      codeInputRef.current?.focus();
      codeInputRef.current?.select();
    } else if (focusField === 'title') {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    } else {
      noteTextareaRef.current?.focus();
    }
  }, [focusField]);

  const defId = getGroupDefId(groupNode);
  const trimmedCode = groupCode.trim();
  const isDuplicate = isGroupCodeTaken(trimmedCode, nodes, defId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedCode) {
      setErrorMsg(t.groupIdEmptyErr);
      codeInputRef.current?.focus();
      return;
    }
    if (isDuplicate) {
      setErrorMsg(t.groupIdDuplicateErr);
      codeInputRef.current?.focus();
      return;
    }
    onSave(trimmedCode, title.trim(), note.trim());
  };

  return (
    <div
      data-board-overlay="true"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      className="absolute inset-0 z-50 bg-[#0F172A]/25 backdrop-blur-[1px] flex items-center justify-center p-4 pointer-events-auto"
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label={t.groupModalTitle}
        className="w-full max-w-md bg-white rounded-2xl border border-[#CBD5E1] shadow-[0_24px_54px_rgba(20,36,75,0.22)] overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              {isReusedInstance ? (
                <Link2 className="w-4 h-4 text-[#0284C7] shrink-0" aria-hidden="true" />
              ) : (
                <Layers className="w-4 h-4 text-[#334155] shrink-0" aria-hidden="true" />
              )}
              <span
                className={`px-1.5 py-0.5 rounded font-mono text-[11px] font-bold tracking-tight shrink-0 ${
                  isReusedInstance
                    ? 'bg-[#0284C7] text-white'
                    : 'bg-[#14244B] text-white'
                }`}
              >
                {trimmedCode || initialCode}
              </span>
              <h3 className="font-display text-sm font-bold text-[#14244B] truncate">
                {t.groupModalTitle}
              </h3>
              {isReusedInstance && (
                <span className="px-1.5 py-0.5 rounded bg-[#E0F2FE] text-[#0369A1] text-[10px] font-bold shrink-0">
                  {t.groupReusedBadge} ×{reusedCount}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#64748B] leading-snug">
              {t.groupModalSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.groupModalSkip}
            className="w-7 h-7 rounded-lg text-[#64748B] hover:text-[#14244B] hover:bg-[#E2E8F0]/60 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3.5">
          <div className="grid grid-cols-[136px_1fr] gap-2.5">
            <div className="space-y-1">
              <label
                htmlFor="group-info-code"
                className="block text-[11px] font-bold text-[#334155]"
              >
                {t.groupIdLabel}
              </label>
              <input
                id="group-info-code"
                ref={codeInputRef}
                type="text"
                value={groupCode}
                placeholder={t.groupIdPlaceholder}
                onChange={(e) => {
                  setGroupCode(e.target.value);
                  setErrorMsg(null);
                }}
                className={`w-full px-2.5 py-2 font-mono text-xs font-bold text-[#14244B] bg-[#F8FAFC] border rounded-xl focus:outline-none transition-colors ${
                  isDuplicate || errorMsg
                    ? 'border-[#DC2626] focus:border-[#DC2626] bg-[#FEF2F2]/40'
                    : 'border-[#CBD5E1] focus:border-[#14244B] focus:bg-white'
                }`}
              />
            </div>

            <div className="space-y-1 min-w-0">
              <label
                htmlFor="group-info-title"
                className="block text-[11px] font-bold text-[#334155]"
              >
                {t.groupNameField}
              </label>
              <input
                id="group-info-title"
                ref={titleInputRef}
                type="text"
                value={title}
                placeholder={t.groupNamePlaceholder}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] focus:border-[#14244B] focus:bg-white rounded-xl focus:outline-none transition-colors"
              />
            </div>
          </div>

          {(errorMsg || isDuplicate) && (
            <p className="text-[11px] font-medium text-[#DC2626] leading-snug">
              {errorMsg || t.groupIdDuplicateErr}
            </p>
          )}

          <div className="space-y-1">
            <label
              htmlFor="group-info-note"
              className="block text-[11px] font-bold text-[#334155]"
            >
              {t.groupDescField}
            </label>
            <textarea
              id="group-info-note"
              ref={noteTextareaRef}
              rows={4}
              value={note}
              placeholder={t.groupDescPlaceholder}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              className="w-full px-3 py-2 text-xs text-[#1E293B] bg-[#F8FAFC] border border-[#CBD5E1] focus:border-[#14244B] focus:bg-white rounded-xl resize-none leading-relaxed focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-xs font-semibold text-[#475569] transition-colors cursor-pointer"
          >
            {t.groupModalSkip}
          </button>
          <button
            type="submit"
            disabled={!trimmedCode || isDuplicate}
            className="px-3.5 py-1.5 rounded-lg bg-[#14244B] hover:bg-[#1E3468] disabled:bg-[#94A3B8] disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            {t.groupModalSave}
          </button>
        </div>
      </form>
    </div>
  );
}
