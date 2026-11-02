import React, { useState } from 'react';
import { Disc, Plus, Minus, HardDrive, Film } from 'lucide-react';
import { usePanasonicIngestViewModel } from '../viewmodels/usePanasonicIngestViewModel';
import { useDiskImagingViewModel } from '../viewmodels/useDiskImagingViewModel';
import { DirectoryPickerModal } from './DirectoryPickerModal';
import { Badge } from './ui/badge';
import { PanasonicRecordingTreePanel } from './panasonic/PanasonicRecordingTreePanel';
import { PanasonicDiskImagingPanel } from './panasonic/PanasonicDiskImagingPanel';

export interface PanasonicIngestCardProps {
  onRefresh?: () => void;
}

export const PanasonicIngestCard: React.FC<PanasonicIngestCardProps> = ({ onRefresh }) => {
  const {
    t,
    isExpanded,
    setIsExpanded,
    showGuidance,
    setShowGuidance,
    panasonicPath,
    setPanasonicPath,
    inspectionResult,
    recordingTree,
    selectedTitleIds,
    expandedChapterTitles,
    connectedDisks,
    hasPanasonicDisk,
    panasonicHotplugEnabled,
    isScanningDisks,
    isInspecting,
    isLoadingTree,
    isExtracting,
    isExtractingTitles,
    refetchDisks,
    handleInspectPath,
    handleExtractAll,
    handleExtractSelectedTitles,
    toggleSelectTitle,
    handleSelectAll,
    handleDeselectAll,
    toggleExpandChapters,
    handleLoadTitleToDesk,
  } = usePanasonicIngestViewModel({ onRefresh });

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isImageFolderModalOpen, setIsImageFolderModalOpen] = useState(false);

  const {
    ingestMode,
    setIngestMode,
    physicalDrives,
    isScanningDrives,
    scanDrives,
    selectedDriveId,
    setSelectedDriveId,
    outputImagePath,
    setOutputImagePath,
    containerFormat,
    setContainerFormat,
    zeroFillCorruptSectors,
    setZeroFillCorruptSectors,
    computeSha256Sidecar,
    setComputeSha256Sidecar,
    autoChainRestoration,
    setAutoChainRestoration,
    telemetry,
    isImaging,
    handleStartImaging,
    handleCancelImaging,
  } = useDiskImagingViewModel({ onRefreshParent: onRefresh });

  return (
    <div className="bg-studio-panel border border-studio-border rounded-md p-2.5 flex flex-col gap-2 select-none">
      {/* Header: Title, Hotplug Indicator, and Expand/Collapse Toggle */}
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300 font-bold uppercase tracking-wider min-w-0 flex-1">
          <Disc className="w-3.5 h-3.5 text-amber-400 shrink-0 self-center" />
          <span className="truncate self-center leading-none">{t('files.panasonic_ingest_title')}</span>
          {hasPanasonicDisk && (
            <span className="led-lamp led-live animate-pulse shrink-0 self-center" aria-hidden="true" />
          )}
          {panasonicHotplugEnabled ? (
            <Badge
              variant="secondary"
              size="sm"
              className="hidden sm:inline-grid text-slate-400 font-normal cursor-help"
              title={t('files.hotplug_tooltip')}
            >
              <span className="led-lamp led-idle" aria-hidden="true" />
              <span>{t('files.hotplug_active_label')}</span>
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              size="sm"
              className="hidden sm:inline-grid text-slate-500 font-normal cursor-help"
              title={t('files.hotplug_disabled_tooltip')}
            >
              <span className="led-lamp led-idle" aria-hidden="true" />
              <span>{t('files.hotplug_disabled_label')}</span>
            </Badge>
          )}
        </div>

        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-center w-5 h-5 text-slate-400 hover:text-slate-100 bg-studio-surface hover:bg-studio-surface-hover rounded-sm border border-studio-border cursor-pointer transition shrink-0"
          title={isExpanded ? t('files.panasonic_collapse') : t('files.panasonic_expand')}
          aria-label={isExpanded ? t('files.panasonic_collapse') : t('files.panasonic_expand')}
          data-testid="toggle-panasonic-ingest-btn"
        >
          {isExpanded ? (
            <Minus className="w-3 h-3 self-center" aria-hidden="true" />
          ) : (
            <Plus className="w-3 h-3 self-center" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Expanded Controls */}
      {isExpanded && (
        <div className="p-2.5 rounded-sm border border-studio-border bg-studio-surface flex flex-col gap-3 text-xs font-mono">
          {/* Ingest Mode Toggle: Titles vs Raw Disk Image */}
          <div className="flex border border-studio-border rounded-sm p-0.5 bg-studio-panel/80">
            <button
              type="button"
              onClick={() => setIngestMode('titles')}
              className={`flex-1 py-1 text-[10px] font-bold uppercase tracking-wider rounded-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${
                ingestMode === 'titles'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-studio-surface'
              }`}
              data-testid="ingest-mode-titles-btn"
            >
              <Film className="w-3 h-3 self-center" />
              <span className="self-center leading-none">{t('files.ingest_mode_titles')}</span>
            </button>
            <button
              type="button"
              onClick={() => setIngestMode('disk_image')}
              className={`flex-1 py-1 text-[10px] font-bold uppercase tracking-wider rounded-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${
                ingestMode === 'disk_image'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-studio-surface'
              }`}
              data-testid="ingest-mode-raw-image-btn"
            >
              <HardDrive className="w-3 h-3 self-center" />
              <span className="self-center leading-none">{t('files.ingest_mode_raw_image')}</span>
            </button>
          </div>

          {ingestMode === 'titles' && (
            <PanasonicRecordingTreePanel
              connectedDisks={connectedDisks}
              isScanningDisks={isScanningDisks}
              refetchDisks={refetchDisks}
              panasonicPath={panasonicPath}
              setPanasonicPath={setPanasonicPath}
              handleInspectPath={handleInspectPath}
              isInspecting={isInspecting}
              isLoadingTree={isLoadingTree}
              onOpenFolderModal={() => setIsFolderModalOpen(true)}
              showGuidance={showGuidance}
              setShowGuidance={setShowGuidance}
              recordingTree={recordingTree}
              selectedTitleIds={selectedTitleIds}
              expandedChapterTitles={expandedChapterTitles}
              toggleSelectTitle={toggleSelectTitle}
              handleSelectAll={handleSelectAll}
              handleDeselectAll={handleDeselectAll}
              toggleExpandChapters={toggleExpandChapters}
              handleLoadTitleToDesk={handleLoadTitleToDesk}
              handleExtractSelectedTitles={handleExtractSelectedTitles}
              isExtractingTitles={isExtractingTitles}
              inspectionResult={inspectionResult}
              isExtracting={isExtracting}
              handleExtractAll={handleExtractAll}
            />
          )}

          {ingestMode === 'disk_image' && (
            <PanasonicDiskImagingPanel
              physicalDrives={physicalDrives}
              isScanningDrives={isScanningDrives}
              scanDrives={scanDrives}
              selectedDriveId={selectedDriveId}
              setSelectedDriveId={setSelectedDriveId}
              outputImagePath={outputImagePath}
              setOutputImagePath={setOutputImagePath}
              containerFormat={containerFormat}
              setContainerFormat={setContainerFormat}
              onOpenImageFolderModal={() => setIsImageFolderModalOpen(true)}
              zeroFillCorruptSectors={zeroFillCorruptSectors}
              setZeroFillCorruptSectors={setZeroFillCorruptSectors}
              computeSha256Sidecar={computeSha256Sidecar}
              setComputeSha256Sidecar={setComputeSha256Sidecar}
              autoChainRestoration={autoChainRestoration}
              setAutoChainRestoration={setAutoChainRestoration}
              telemetry={telemetry}
              isImaging={isImaging}
              handleStartImaging={handleStartImaging}
              handleCancelImaging={handleCancelImaging}
            />
          )}
        </div>
      )}

      <DirectoryPickerModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        initialPath={panasonicPath}
        onSelect={(chosen) => setPanasonicPath(chosen)}
      />
      <DirectoryPickerModal
        isOpen={isImageFolderModalOpen}
        onClose={() => setIsImageFolderModalOpen(false)}
        initialPath={outputImagePath}
        onSelect={(chosen) => setOutputImagePath(chosen)}
      />
    </div>
  );
};
