import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Film,
  Folder,
  FolderPlus,
  GripVertical,
  LayoutPanelTop,
  Lock,
  Mountain,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Shapes,
  Sparkles,
  Trash2,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { COPY, type Language } from '../../../shared/i18n';
import {
  FIXED_ASSET_CATEGORIES,
  type AssetCategoryId,
  type AssetItem,
  type AssetSubFolder,
} from './assetLibraryModel';

export interface AiPlacedNotice {
  assetId: string;
  folderId: string | null;
  categoryId: AssetCategoryId;
  pathText: string;
}

interface AssetsPanelProps {
  lang: Language;
  isOpen: boolean;
  width: number;
  folders: AssetSubFolder[];
  items: AssetItem[];
  unlockedCategories: Record<AssetCategoryId, boolean>;
  selectedAssetId: string | null;
  pickingForStage?: boolean;
  aiNotice: AiPlacedNotice | null;
  onToggle: () => void;
  onSelectAsset: (assetId: string) => void;
  onCreateSubFolder: (categoryId: AssetCategoryId, name: string) => string;
  onRenameSubFolder: (folderId: string, nextName: string) => void;
  onDeleteSubFolder: (folderId: string) => void;
  onCreateAsset: (categoryId: AssetCategoryId, folderId: string | null) => void;
  onMoveAsset: (
    assetId: string,
    targetCategoryId: AssetCategoryId,
    targetFolderId: string | null,
  ) => void;
  onDismissAiNotice: () => void;
}

const CATEGORY_ICONS: Record<AssetCategoryId, typeof Users> = {
  characters: Users,
  objects: Shapes,
  backgrounds: Mountain,
  interface: LayoutPanelTop,
  effects: Sparkles,
};

export function AssetsPanel({
  lang,
  isOpen,
  width,
  folders,
  items,
  unlockedCategories,
  selectedAssetId,
  pickingForStage,
  aiNotice,
  onToggle,
  onSelectAsset,
  onCreateSubFolder,
  onRenameSubFolder,
  onDeleteSubFolder,
  onCreateAsset,
  onMoveAsset,
  onDismissAiNotice,
}: AssetsPanelProps) {
  const t = COPY[lang].studio.assets;
  const stagePickHint = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (pickingForStage && isOpen) stagePickHint.current?.focus();
  }, [isOpen, pickingForStage]);

  const [expandedCategories, setExpandedCategories] = useState<
    Record<AssetCategoryId, boolean>
  >({
    characters: true,
    objects: false,
    backgrounds: false,
    interface: false,
    effects: false,
  });
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'folder-forest-friends': true,
    'folder-collectibles': true,
  });

  // Active target folder/category for the unified top toolbar actions
  const [activeTarget, setActiveTarget] = useState<{
    categoryId: AssetCategoryId;
    folderId: string | null;
  }>({
    categoryId: 'characters',
    folderId: 'folder-forest-friends',
  });

  // Inline creation / renaming states
  const [creatingFolderInCat, setCreatingFolderInCat] = useState<AssetCategoryId | null>(
    null,
  );
  const [newFolderDraft, setNewFolderDraft] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  // HTML5 drag-and-drop reorganization state
  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  // Auto-expand and focus category & sub-folder when idea-driven AI places a new asset
  useEffect(() => {
    if (!aiNotice) return;
    setExpandedCategories((prev) => ({ ...prev, [aiNotice.categoryId]: true }));
    if (aiNotice.folderId) {
      setExpandedFolders((prev) => ({ ...prev, [aiNotice.folderId as string]: true }));
    }
    setActiveTarget({
      categoryId: aiNotice.categoryId,
      folderId: aiNotice.folderId,
    });
  }, [aiNotice]);

  const firstUnlockedCategory: AssetCategoryId =
    FIXED_ASSET_CATEGORIES.find((c) => unlockedCategories[c.id])?.id ?? 'characters';

  const resolvedTargetCategory: AssetCategoryId = unlockedCategories[
    activeTarget.categoryId
  ]
    ? activeTarget.categoryId
    : firstUnlockedCategory;

  const resolvedTargetFolderId: string | null =
    activeTarget.folderId &&
    folders.some(
      (f) => f.id === activeTarget.folderId && f.categoryId === resolvedTargetCategory,
    )
      ? activeTarget.folderId
      : null;

  const unlockedCategoryIds = FIXED_ASSET_CATEGORIES.filter(
    (c) => unlockedCategories[c.id],
  ).map((c) => c.id);

  const unlockedSubFolderIds = folders
    .filter((f) => unlockedCategories[f.categoryId])
    .map((f) => f.id);

  const areAllExpanded =
    unlockedCategoryIds.every((id) => expandedCategories[id]) &&
    unlockedSubFolderIds.every((id) => expandedFolders[id] ?? true);

  if (!isOpen) {
    return (
      <aside
        aria-label={t.title}
        className="w-11 shrink-0 bg-white border-r border-[#E2E8F0] flex flex-col items-center py-3 gap-4 select-none"
      >
        <button
          type="button"
          onClick={onToggle}
          title={t.expand}
          aria-label={t.expand}
          className="w-8 h-8 rounded-lg text-[#475569] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B]"
        >
          <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="text-[11px] font-semibold text-[#64748B] hover:text-[#14244B] tracking-wide cursor-pointer [writing-mode:vertical-rl] rotate-180 py-2"
        >
          {t.railTitle}
        </button>
      </aside>
    );
  }

  // Unified Top Toolbar Handlers
  const handleToolbarAddAsset = () => {
    setExpandedCategories((prev) => ({ ...prev, [resolvedTargetCategory]: true }));
    if (resolvedTargetFolderId) {
      setExpandedFolders((prev) => ({ ...prev, [resolvedTargetFolderId]: true }));
    }
    onCreateAsset(resolvedTargetCategory, resolvedTargetFolderId);
  };

  const handleToolbarAddFolder = () => {
    setExpandedCategories((prev) => ({ ...prev, [resolvedTargetCategory]: true }));
    setCreatingFolderInCat(resolvedTargetCategory);
    setNewFolderDraft('');
  };

  const handleToolbarToggleExpandAll = () => {
    const nextExpanded = !areAllExpanded;
    setExpandedCategories((prev) => {
      const updated = { ...prev };
      unlockedCategoryIds.forEach((id) => {
        updated[id] = nextExpanded;
      });
      return updated;
    });
    setExpandedFolders((prev) => {
      const updated = { ...prev };
      unlockedSubFolderIds.forEach((id) => {
        updated[id] = nextExpanded;
      });
      return updated;
    });
  };

  const toggleCategory = (catId: AssetCategoryId) => {
    if (!unlockedCategories[catId]) return;
    setExpandedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
    setActiveTarget({ categoryId: catId, folderId: null });
  };

  const toggleSubFolder = (catId: AssetCategoryId, folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !(prev[folderId] ?? true) }));
    setActiveTarget({ categoryId: catId, folderId });
  };

  const commitNewFolder = (catId: AssetCategoryId) => {
    const trimmed = newFolderDraft.trim();
    if (trimmed) {
      const createdId = onCreateSubFolder(catId, trimmed);
      setExpandedFolders((prev) => ({ ...prev, [createdId]: true }));
      setActiveTarget({ categoryId: catId, folderId: createdId });
    }
    setCreatingFolderInCat(null);
    setNewFolderDraft('');
  };

  const commitRenameFolder = (folderId: string) => {
    const trimmed = renameDraft.trim();
    if (trimmed) {
      onRenameSubFolder(folderId, trimmed);
    }
    setRenamingFolderId(null);
    setRenameDraft('');
  };

  // Drag-and-Drop Handlers
  const handleAssetDragStart = (
    e: ReactDragEvent<HTMLDivElement>,
    assetId: string,
  ) => {
    setDraggingAssetId(assetId);
    e.dataTransfer.setData('text/plain', assetId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleAssetDragEnd = () => {
    setDraggingAssetId(null);
    setDropTargetKey(null);
  };

  const handleFolderDragOver = (
    e: ReactDragEvent<HTMLDivElement>,
    targetKey: string,
    isUnlocked: boolean,
  ) => {
    if (!isUnlocked) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTargetKey !== targetKey) {
      setDropTargetKey(targetKey);
    }
  };

  const handleFolderDrop = (
    e: ReactDragEvent<HTMLDivElement>,
    targetCategoryId: AssetCategoryId,
    targetFolderId: string | null,
    isUnlocked: boolean,
  ) => {
    e.preventDefault();
    setDropTargetKey(null);
    if (!isUnlocked) return;
    const assetId = draggingAssetId || e.dataTransfer.getData('text/plain');
    if (!assetId) return;
    onMoveAsset(assetId, targetCategoryId, targetFolderId);
    setExpandedCategories((prev) => ({ ...prev, [targetCategoryId]: true }));
    if (targetFolderId) {
      setExpandedFolders((prev) => ({ ...prev, [targetFolderId]: true }));
    }
    setActiveTarget({ categoryId: targetCategoryId, folderId: targetFolderId });
    setDraggingAssetId(null);
  };

  const renderAssetRow = (asset: AssetItem, indentClass: string) => {
    const isSelected = asset.id === selectedAssetId;
    const isHighlighted = aiNotice?.assetId === asset.id;
    const activeSlot =
      asset.states.find((s) => s.id === asset.activeStateId) ?? asset.states[0];
    const hasExtraStates =
      (asset.categoryId === 'characters' || asset.categoryId === 'objects') &&
      asset.states.length > 1;
    const isInterfaceText =
      asset.categoryId === 'interface' && (asset.interfaceMode ?? 'text') === 'text';

    return (
      <div
        key={asset.id}
        draggable
        onDragStart={(e) => handleAssetDragStart(e, asset.id)}
        onDragEnd={handleAssetDragEnd}
        onClick={() => {
          setActiveTarget({ categoryId: asset.categoryId, folderId: asset.folderId });
          onSelectAsset(asset.id);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setActiveTarget({ categoryId: asset.categoryId, folderId: asset.folderId });
            onSelectAsset(asset.id);
          }
        }}
        className={`group flex items-center gap-2 py-1.5 pr-2 ${indentClass} rounded-lg transition-colors cursor-pointer ${
          isSelected
            ? 'bg-[#EFF6FF] text-[#14244B] ring-1 ring-[#93C5FD]'
            : isHighlighted
              ? 'bg-[#FEF9C3]/75 text-[#14244B]'
              : 'text-[#334155] hover:bg-[#F8FAFC]'
        } ${draggingAssetId === asset.id ? 'opacity-45' : ''}`}
      >
        <GripVertical
          className="w-3 h-3 text-[#CBD5E1] group-hover:text-[#94A3B8] shrink-0 cursor-grab"
          aria-hidden="true"
        />

        {/* WYSIWYG Miniature Thumbnail */}
        <div className="w-6 h-6 rounded-md border border-[#E2E8F0] bg-white overflow-hidden flex items-center justify-center shrink-0">
          {isInterfaceText && asset.typography ? (
            <span
              style={{
                backgroundColor:
                  asset.typography.textColor === '#FFFFFF' ? '#14244B' : '#F8FAFC',
                color: asset.typography.textColor,
              }}
              className="w-full h-full flex items-center justify-center text-[10px] font-bold"
            >
              Aa
            </span>
          ) : activeSlot.mediaKind === 'video' ? (
            <Film className="w-3.5 h-3.5 text-[#48B5A3]" aria-hidden="true" />
          ) : (
            <img
              src={activeSlot.mediaUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          )}
        </div>

        <span className="text-[13px] font-medium truncate flex-1">{asset.name}</span>

        <div className="flex items-center gap-1 shrink-0 text-[10px] font-mono tabular-nums text-[#64748B]">
          {activeSlot.audioUrl && (
            <Volume2 className="w-3 h-3 text-[#4E9AE3]" aria-hidden="true" />
          )}
          {hasExtraStates && <span>{asset.states.length}×</span>}
        </div>
      </div>
    );
  };

  return (
    <aside
      aria-label={t.title}
      style={{ width: `${width}px` }}
      className="shrink-0 bg-white border-r border-[#E2E8F0] flex flex-col min-h-0 select-none"
    >
      {/* Top Header */}
      <div className="h-11 px-3.5 border-b border-[#F1F5F9] flex items-center justify-between gap-2 shrink-0">
        <span className="font-display font-bold text-[15px] text-[#14244B] truncate">
          {t.title}
        </span>
        <button
          type="button"
          onClick={onToggle}
          title={t.collapse}
          aria-label={t.collapse}
          className="w-7 h-7 rounded-lg text-[#475569] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B]"
        >
          <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Unified Top Action Toolbar: [Palette: Create Asset] [FolderPlus: Add Sub-folder] [Expand / Collapse All] */}
      <div className="px-3 py-1.5 border-b border-[#E2E8F0] bg-[#FAFBFD] flex items-center justify-center gap-3 shrink-0">
        <button
          type="button"
          onClick={handleToolbarAddAsset}
          title={t.addAssetTo}
          aria-label={t.addAssetTo}
          className="w-8 h-7 rounded-md text-[#475569] hover:text-[#14244B] hover:bg-[#E2E8F0]/65 flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B]"
        >
          <Palette className="w-4 h-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={handleToolbarAddFolder}
          title={t.addSubFolderTo}
          aria-label={t.addSubFolderTo}
          className="w-8 h-7 rounded-md text-[#475569] hover:text-[#14244B] hover:bg-[#E2E8F0]/65 flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B]"
        >
          <FolderPlus className="w-4 h-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={handleToolbarToggleExpandAll}
          title={areAllExpanded ? t.collapseAll : t.expandAll}
          aria-label={areAllExpanded ? t.collapseAll : t.expandAll}
          className="w-8 h-7 rounded-md text-[#475569] hover:text-[#14244B] hover:bg-[#E2E8F0]/65 flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B]"
        >
          {areAllExpanded ? (
            <ChevronsDownUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronsUpDown className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {pickingForStage && <p ref={stagePickHint} tabIndex={-1} className="mx-3 my-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">
        {lang === 'zh' ? '选择一个素材放到舞台' : 'Choose an asset to place on stage'}
      </p>}
      {/* Idea-Triggered AI Auto-Placement Reveal Notice (Shown only when an idea creates an asset) */}
      {aiNotice && (
        <div className="mx-2.5 mt-2.5 px-3 py-2 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-[11px] text-[#1E3A8A] flex items-start justify-between gap-2 shrink-0">
          <div className="leading-snug">
            <div>
              {t.aiPlacedBanner}{' '}
              <span className="font-semibold text-[#14244B]">{aiNotice.pathText}</span>
            </div>
            <div className="text-[#475569] mt-0.5">{t.aiPlacedHint}</div>
          </div>
          <button
            type="button"
            onClick={onDismissAiNotice}
            aria-label={t.dismissBanner}
            className="text-[#64748B] hover:text-[#14244B] p-0.5 rounded cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* 5 Fixed Category Folders Tree (Distinct Icons + Sealed Progressive Reveal for Locked) */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-1">
        {FIXED_ASSET_CATEGORIES.map((category) => {
          const isUnlocked = unlockedCategories[category.id];
          const isExpanded = isUnlocked && expandedCategories[category.id];
          const label = lang === 'zh' ? category.labelZh : category.labelEn;
          const CategoryIcon = CATEGORY_ICONS[category.id];
          const catFolders = folders.filter((f) => f.categoryId === category.id);
          const catItems = items.filter((item) => item.categoryId === category.id);
          const rootItems = catItems.filter((item) => item.folderId === null);
          const rootDropKey = `cat::${category.id}`;
          const isRootDropHovered = dropTargetKey === rootDropKey;
          const isRootActiveTarget =
            isUnlocked &&
            resolvedTargetCategory === category.id &&
            resolvedTargetFolderId === null;

          // Locked Category: Strictly Progressive Reveal (greyed out, sealed, non-expandable)
          if (!isUnlocked) {
            return (
              <div
                key={category.id}
                aria-disabled="true"
                className="pb-1 border-b border-[#F1F5F9] last:border-b-0"
              >
                <div className="flex items-center gap-2 pl-6 pr-2 py-2 rounded-lg text-[#94A3B8] cursor-default">
                  <CategoryIcon
                    className="w-4 h-4 text-[#CBD5E1] shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-[14px] font-medium text-[#94A3B8] truncate flex-1">
                    {label}
                  </span>
                  <div className="flex items-center gap-1 shrink-0 text-[11px] text-[#94A3B8]">
                    <Lock className="w-3 h-3" aria-hidden="true" />
                    <span className="whitespace-nowrap">{t.lockedLabel}</span>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={category.id}
              className="pb-1 border-b border-[#F1F5F9] last:border-b-0"
            >
              {/* Unlocked Fixed Top-Level Category Row */}
              <div
                onDragOver={(e) => handleFolderDragOver(e, rootDropKey, true)}
                onDragLeave={() => {
                  if (dropTargetKey === rootDropKey) setDropTargetKey(null);
                }}
                onDrop={(e) => handleFolderDrop(e, category.id, null, true)}
                className={`group flex items-center gap-1.5 px-1.5 py-2 rounded-lg transition-colors ${
                  isRootDropHovered
                    ? 'bg-[#EFF6FF] ring-1 ring-[#4E9AE3] text-[#14244B]'
                    : isRootActiveTarget
                      ? 'bg-[#F8FAFC] text-[#14244B]'
                      : 'text-[#14244B] hover:bg-[#F8FAFC]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                >
                  {isExpanded ? (
                    <ChevronDown
                      className="w-3.5 h-3.5 text-[#94A3B8] shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <ChevronRight
                      className="w-3.5 h-3.5 text-[#94A3B8] shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <CategoryIcon
                    className="w-4 h-4 text-[#475569] shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-[14px] font-semibold text-[#14244B] truncate">
                    {label}
                  </span>
                </button>

                <span className="text-[11px] font-mono tabular-nums text-[#94A3B8] shrink-0 pr-1">
                  {catItems.length}
                </span>
              </div>

              {isExpanded && (
                <div className="mt-0.5 space-y-0.5 pb-1">
                  {/* Inline New Sub-Folder Input (Triggered from Top Toolbar) */}
                  {creatingFolderInCat === category.id && (
                    <div className="flex items-center gap-1.5 pl-5 pr-1.5 py-1">
                      <FolderPlus
                        className="w-3.5 h-3.5 text-[#4E9AE3] shrink-0"
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        autoFocus
                        value={newFolderDraft}
                        onChange={(e) => setNewFolderDraft(e.target.value)}
                        onBlur={() => commitNewFolder(category.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitNewFolder(category.id);
                          if (e.key === 'Escape') {
                            setCreatingFolderInCat(null);
                            setNewFolderDraft('');
                          }
                        }}
                        placeholder={t.newFolderPlaceholder}
                        className="flex-1 min-w-0 px-2 py-1 text-xs text-[#14244B] bg-[#F8FAFC] border border-[#4E9AE3] rounded-md focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Custom / AI Sub-Folders */}
                  {catFolders.map((subFolder) => {
                    const isSubOpen = expandedFolders[subFolder.id] ?? true;
                    const subItems = catItems.filter(
                      (item) => item.folderId === subFolder.id,
                    );
                    const subDropKey = `folder::${subFolder.id}`;
                    const isSubHovered = dropTargetKey === subDropKey;
                    const isRenaming = renamingFolderId === subFolder.id;
                    const isSubActiveTarget =
                      resolvedTargetCategory === category.id &&
                      resolvedTargetFolderId === subFolder.id;

                    return (
                      <div key={subFolder.id} className="space-y-0.5">
                        <div
                          onDragOver={(e) => handleFolderDragOver(e, subDropKey, true)}
                          onDragLeave={() => {
                            if (dropTargetKey === subDropKey) setDropTargetKey(null);
                          }}
                          onDrop={(e) =>
                            handleFolderDrop(e, category.id, subFolder.id, true)
                          }
                          className={`group flex items-center gap-1.5 pl-4 pr-1.5 py-1.5 rounded-lg transition-colors ${
                            isSubHovered
                              ? 'bg-[#EFF6FF] ring-1 ring-[#4E9AE3]'
                              : aiNotice?.folderId === subFolder.id
                                ? 'bg-[#FEF9C3]/60'
                                : isSubActiveTarget
                                  ? 'bg-[#F1F5F9]/85'
                                  : 'hover:bg-[#F8FAFC]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSubFolder(category.id, subFolder.id)}
                            aria-label="Toggle sub-folder"
                            className="p-0.5 text-[#94A3B8] hover:text-[#14244B] cursor-pointer shrink-0"
                          >
                            {isSubOpen ? (
                              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </button>

                          <Folder
                            className="w-3.5 h-3.5 text-[#64748B] shrink-0"
                            aria-hidden="true"
                          />

                          {isRenaming ? (
                            <input
                              type="text"
                              autoFocus
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onBlur={() => commitRenameFolder(subFolder.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRenameFolder(subFolder.id);
                                if (e.key === 'Escape') setRenamingFolderId(null);
                              }}
                              className="flex-1 min-w-0 px-1.5 py-0.5 text-[13px] font-medium text-[#14244B] bg-white border border-[#4E9AE3] rounded focus:outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleSubFolder(category.id, subFolder.id)}
                              onDoubleClick={() => {
                                setRenamingFolderId(subFolder.id);
                                setRenameDraft(subFolder.name);
                              }}
                              className="flex-1 min-w-0 text-left text-[13px] font-medium text-[#334155] truncate cursor-pointer"
                            >
                              {subFolder.name}
                            </button>
                          )}

                          {!isRenaming && (
                            <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingFolderId(subFolder.id);
                                  setRenameDraft(subFolder.name);
                                }}
                                title={t.renameFolder}
                                aria-label={t.renameFolder}
                                className="w-5 h-5 rounded text-[#64748B] hover:text-[#14244B] hover:bg-[#E2E8F0]/70 flex items-center justify-center cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteSubFolder(subFolder.id);
                                }}
                                title={t.deleteFolder}
                                aria-label={t.deleteFolder}
                                className="w-5 h-5 rounded text-[#64748B] hover:text-[#E11D48] hover:bg-[#FFF1F2] flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </div>

                        {isSubOpen && (
                          <div className="space-y-0.5">
                            {subItems.length > 0 ? (
                              subItems.map((asset) => renderAssetRow(asset, 'pl-8'))
                            ) : (
                              <div className="pl-10 pr-2 py-1 text-[11px] text-[#94A3B8]">
                                {t.emptyFolder}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Root-level Assets directly under this Category */}
                  {rootItems.map((asset) => renderAssetRow(asset, 'pl-5'))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
