import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  RefreshCw,
  Download,
  CheckSquare,
  Square,
  FolderOpen,
} from 'lucide-react';
import { PanasonicDriveList } from './PanasonicDriveList';
import { PanasonicPathInputBar } from './PanasonicPathInputBar';
import { PanasonicGuidanceAlert } from './PanasonicGuidanceAlert';
import { PanasonicTitleCard } from './PanasonicTitleCard';
import { PanasonicInspectionResultBox } from './PanasonicInspectionResultBox';
import type {
  PanasonicDisk,
  PanasonicRecordingTreeResponse,
  PanasonicRecordingTitle,
  PanasonicInspection,
} from '../../types';

export interface PanasonicRecordingTreePanelProps {
  connectedDisks: PanasonicDisk[];
  isScanningDisks: boolean;
  refetchDisks: () => void;
  panasonicPath: string;
  setPanasonicPath: (path: string) => void;
  handleInspectPath: (path: string) => void;
  isInspecting: boolean;
  isLoadingTree: boolean;
  onOpenFolderModal: () => void;
  showGuidance: boolean;
  setShowGuidance: (show: boolean) => void;
  recordingTree: PanasonicRecordingTreeResponse | null;
  selectedTitleIds: Set<number>;
  expandedChapterTitles: Set<number>;
  toggleSelectTitle: (id: number) => void;
  handleSelectAll: () => void;
  handleDeselectAll: () => void;
  toggleExpandChapters: (id: number) => void;
  handleLoadTitleToDesk: (title: PanasonicRecordingTitle) => void;
  handleExtractSelectedTitles: () => void;
  isExtractingTitles: boolean;
  inspectionResult: PanasonicInspection | null;
  isExtracting: boolean;
  handleExtractAll: () => void;
}

export const PanasonicRecordingTreePanel: React.FC<PanasonicRecordingTreePanelProps> = ({
  connectedDisks,
  isScanningDisks,
  refetchDisks,
  panasonicPath,
  setPanasonicPath,
  handleInspectPath,
  isInspecting,
  isLoadingTree,
  onOpenFolderModal,
  showGuidance,
  setShowGuidance,
  recordingTree,
  selectedTitleIds,
  expandedChapterTitles,
  toggleSelectTitle,
  handleSelectAll,
  handleDeselectAll,
  toggleExpandChapters,
  handleLoadTitleToDesk,
  handleExtractSelectedTitles,
  isExtractingTitles,
  inspectionResult,
  isExtracting,
  handleExtractAll,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {/* Section 1: Auto-Detected Physical Disks & Hotplug Adapters */}
      <PanasonicDriveList
        connectedDisks={connectedDisks}
        isScanningDisks={isScanningDisks}
        refetchDisks={refetchDisks}
        onConnectDrive={(id) => {
          setPanasonicPath(id);
          handleInspectPath(id);
        }}
      />

      {/* Section 2: Manual Path Input / Disk Image */}
      <PanasonicPathInputBar
        panasonicPath={panasonicPath}
        setPanasonicPath={setPanasonicPath}
        onOpenFolderModal={onOpenFolderModal}
        handleInspectPath={handleInspectPath}
        isInspecting={isInspecting}
        isLoadingTree={isLoadingTree}
      />

      {/* Section 3: Educational User Guidance & Safety Alert */}
      <PanasonicGuidanceAlert
        showGuidance={showGuidance}
        setShowGuidance={setShowGuidance}
      />

      {/* Section 4: Interactive Recording Tree & Chapters Gallery */}
      {recordingTree && recordingTree.titles.length > 0 && (
        <div className="border border-amber-500/40 rounded-sm bg-studio-panel/80 p-2.5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between border-b border-studio-border pb-1.5">
            <div className="flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0 self-center" />
              <span className="text-[11px] font-bold text-amber-200 self-center leading-none">
                {t('files.recording_tree_title')}
              </span>
              <span className="text-[9px] bg-studio-surface px-1.5 py-0.5 rounded-xs border border-studio-border text-slate-300 shrink-0 self-center leading-none inline-flex items-center justify-center">
                {recordingTree.format}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-2">
              <span className="self-center leading-none">
                {t('files.tree_total_titles', { count: recordingTree.total_titles })}
              </span>
              <span className="self-center leading-none">•</span>
              <span className="self-center leading-none">
                {t('files.tree_total_size', { size: recordingTree.total_size_mb })}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-amber-400 hover:text-amber-300 transition cursor-pointer flex items-center gap-1"
              >
                <CheckSquare className="w-3 h-3 self-center" />
                <span className="self-center leading-none">{t('files.select_all')}</span>
              </button>
              <span className="text-slate-600 self-center leading-none">|</span>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-slate-400 hover:text-slate-200 transition cursor-pointer flex items-center gap-1"
              >
                <Square className="w-3 h-3 self-center" />
                <span className="self-center leading-none">{t('files.deselect_all')}</span>
              </button>
            </div>

            <button
              type="button"
              disabled={isExtractingTitles || selectedTitleIds.size === 0}
              onClick={handleExtractSelectedTitles}
              className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-bold px-2.5 py-1 rounded-sm text-[10px] transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              {isExtractingTitles ? (
                <RefreshCw className="w-3 h-3 animate-spin self-center" />
              ) : (
                <Download className="w-3 h-3 self-center" />
              )}
              <span className="self-center leading-none">
                {t('files.ingest_selected_btn', { count: selectedTitleIds.size })}
              </span>
            </button>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-0.5">
            {recordingTree.titles.map((title) => (
              <PanasonicTitleCard
                key={title.id}
                title={title}
                isSelected={selectedTitleIds.has(title.id)}
                isExpandedChapters={expandedChapterTitles.has(title.id)}
                onToggleSelect={toggleSelectTitle}
                onToggleExpandChapters={toggleExpandChapters}
                onLoadTitleToDesk={handleLoadTitleToDesk}
              />
            ))}
          </div>
        </div>
      )}

      {/* Section 5: Diagnostic Inspection Result Display */}
      {inspectionResult && (
        <PanasonicInspectionResultBox
          inspectionResult={inspectionResult}
          isExtracting={isExtracting}
          handleExtractAll={handleExtractAll}
        />
      )}
    </>
  );
};
