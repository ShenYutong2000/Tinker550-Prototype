import { useEffect, useRef, useState } from 'react';
import { Layers, X } from 'lucide-react';
import { COPY, type Language } from '../../../shared/i18n';

interface GroupInfoModalProps {
  lang: Language;
  groupCode: string;
  initialTitle: string;
  initialNote: string;
  focusField?: 'title' | 'note';
  onSave: (title: string, note: string) => void;
  onClose: () => void;
}

export function GroupInfoModal({
  lang,
  groupCode,
  initialTitle,
  initialNote,
  focusField = 'note',
  onSave,
  onClose,
}: GroupInfoModalProps) {
  const t = COPY[lang].studio.board;
  const [title, setTitle] = useState(initialTitle);
  const [note, setNote] = useState(initialNote);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (focusField === 'title') {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    } else {
      noteTextareaRef.current?.focus();
    }
  }, [focusField]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(title.trim(), note.trim());
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
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#334155] shrink-0" aria-hidden="true" />
              <span className="px-1.5 py-0.5 rounded bg-[#14244B] text-white font-mono text-[11px] font-bold tracking-tight shrink-0">
                {groupCode}
              </span>
              <h3 className="font-display text-sm font-bold text-[#14244B] truncate">
                {t.groupModalTitle}
              </h3>
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
          <div className="space-y-1">
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
                  onSave(title.trim(), note.trim());
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
            className="px-3.5 py-1.5 rounded-lg bg-[#14244B] hover:bg-[#1E3468] text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            {t.groupModalSave}
          </button>
        </div>
      </form>
    </div>
  );
}
