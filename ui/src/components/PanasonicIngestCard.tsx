import React, { useState } from 'react';
import { formatMbSize } from '../lib/formatters';
import {
  Disc,
  Search,
  RefreshCw,
  Download,
  Plus,
  Minus,
  HardDrive,
  AlertTriangle,
  Info,
  Film,
  CheckSquare,
  Square,
  Usb,
  ChevronDown,
  ChevronRight,
  FolderOpen,
} from 'lucide-react';
import { usePanasonicIngestViewModel } from '../viewmodels/usePanasonicIngestViewModel';
import { useDiskImagingViewModel } from '../viewmodels/useDiskImagingViewModel';
import { SectorHealthBar } from './SectorHealthBar';
import { DirectoryPickerModal } from './DirectoryPickerModal';
import { Badge } from './ui/badge';
import { getApiBaseUrl } from '../api/tauriBridge';
import { DISK_IMAGING_CONFIG } from '../lib/constants';

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

  const emptyBuckets = React.useMemo(
    () => Array.from({ length: DISK_IMAGING_CONFIG.SECTOR_MAP_BUCKETS }, () => 'pending' as const),
    []
  );

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
            <>
              {/* Section 1: Auto-Detected Physical Disks & Hotplug Adapters */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-slate-400 self-center" />
                <span className="self-center leading-none">{t('files.detected_drives_title')}</span>
              </label>
              <button
                type="button"
                onClick={() => refetchDisks()}
                disabled={isScanningDisks}
                className="text-slate-400 hover:text-slate-200 transition text-[9px] flex items-center gap-1 cursor-pointer font-mono"
                title={t('files.scan_drives')}
              >
                <RefreshCw className={`w-2.5 h-2.5 ${isScanningDisks ? 'animate-spin' : ''} self-center`} />
                <span className="self-center leading-none">{t('files.refresh')}</span>
              </button>
            </div>

            {connectedDisks.length === 0 ? (
              <div className="p-2 border border-dashed border-studio-border rounded-sm bg-studio-panel/60 text-[10px] text-slate-500 text-center">
                {t('files.no_drives_found')}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto custom-scrollbar">
                {connectedDisks.map((disk) => {
                  const isPana = disk.is_panasonic;
                  const adapterLabel = disk.is_jmicron
                    ? t('files.adapter_jmicron')
                    : disk.is_asmedia
                    ? t('files.adapter_asmedia')
                    : disk.bus_type === 'NVMe'
                    ? t('files.adapter_nvme')
                    : disk.bus_type === 'IDE'
                    ? t('files.adapter_ide')
                    : disk.bus_type === 'SCSI'
                    ? t('files.adapter_scsi')
                    : disk.is_usb
                    ? t('files.adapter_usb')
                    : t('files.adapter_sata');

                  return (
                    <div
                      key={disk.device_id}
                      className={`p-2 rounded-sm border flex items-center justify-between gap-2 transition ${
                        isPana
                          ? 'bg-amber-950/40 border-amber-500/70 text-amber-200'
                          : 'bg-studio-panel border-studio-border text-slate-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className={`led-lamp ${isPana ? 'led-live animate-pulse' : 'led-idle'} shrink-0 self-center`}
                            aria-hidden="true"
                          />
                          <span className="text-[11px] font-bold truncate self-center leading-none">
                            {disk.model}
                          </span>
                          {isPana && (
                            <span className="text-[9px] bg-amber-950 px-1 py-0.5 rounded-xs border border-amber-600/60 text-amber-300 shrink-0 uppercase self-center leading-none inline-flex items-center justify-center">
                              {t('files.panasonic_detected_badge')}
                            </span>
                          )}
                          <span className="text-[8px] bg-studio-surface px-1 py-0.5 rounded-xs border border-studio-border text-slate-400 shrink-0 inline-flex items-center justify-center gap-0.5 self-center leading-none">
                            {disk.is_usb ? <Usb className="w-2.5 h-2.5 self-center" /> : null}
                            <span className="self-center leading-none">{adapterLabel}</span>
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span className="truncate self-center leading-none">{disk.device_id}</span>
                          <span className="self-center leading-none">•</span>
                          <span className="self-center leading-none">{disk.size_gb} GB</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setPanasonicPath(disk.device_id);
                          handleInspectPath(disk.device_id);
                        }}
                        className={`text-[10px] font-bold px-2 py-1 rounded-sm border transition cursor-pointer shrink-0 inline-flex items-center justify-center leading-none ${
                          isPana
                            ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500/50 shadow-xs'
                            : 'bg-studio-surface hover:bg-studio-surface-hover text-slate-300 border-studio-border'
                        }`}
                        title={t('files.connect_drive_btn')}
                      >
                        <span className="self-center leading-none">{t('files.connect_drive_btn')}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Manual Path Input / Disk Image */}
          <div className="flex flex-col gap-1 pt-1 border-t border-studio-border">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">
              {t('files.source_path_label')}
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={panasonicPath}
                onChange={(e) => setPanasonicPath(e.target.value)}
                placeholder={t('files.source_path_placeholder')}
                className="flex-1 bg-studio-panel border border-studio-border rounded-sm px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-studio-border-focus font-mono"
                data-testid="panasonic-path-input"
              />
              <button
                type="button"
                onClick={() => setIsFolderModalOpen(true)}
                className="bg-studio-panel hover:bg-studio-surface-hover text-slate-300 border border-studio-border px-2 py-1 rounded-sm text-[10px] font-bold transition cursor-pointer flex items-center justify-center gap-1 shrink-0"
                title={t('folders.browse_btn')}
                data-testid="panasonic-browse-btn"
              >
                <FolderOpen className="w-3 h-3 text-amber-400 self-center" />
              </button>
              <button
                type="button"
                disabled={!panasonicPath.trim() || isInspecting || isLoadingTree}
                onClick={() => handleInspectPath(panasonicPath)}
                className="bg-studio-panel hover:bg-studio-surface-hover text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-sm text-[10px] font-bold transition disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1 shrink-0"
                data-testid="inspect-panasonic-btn"
              >
                {isInspecting || isLoadingTree ? (
                  <RefreshCw className="w-3 h-3 animate-spin self-center" />
                ) : (
                  <Search className="w-3 h-3 self-center" />
                )}
                <span className="self-center leading-none">{t('files.inspect')}</span>
              </button>
            </div>
          </div>

          {/* Section 3: Educational User Guidance & Safety Alert */}
          <div className="border border-studio-border rounded-sm bg-studio-panel/70 p-2 flex flex-col gap-1">
            <button
              type="button"
              aria-expanded={showGuidance}
              onClick={() => setShowGuidance(!showGuidance)}
              className="flex items-center justify-between text-[10px] font-bold text-slate-300 hover:text-white cursor-pointer"
            >
              <span className="flex items-center gap-1 text-amber-400">
                <AlertTriangle className="w-3 h-3 shrink-0 self-center" />
                <span className="self-center leading-none">{t('files.guidance_title')}</span>
              </span>
              <span className="text-[9px] text-slate-500 self-center leading-none">
                {showGuidance ? t('files.collapse') : t('files.expand')}
              </span>
            </button>

            {showGuidance && (
              <div className="pt-1.5 space-y-1.5 text-[10px] text-slate-300 leading-relaxed border-t border-studio-border/60">
                <div className="p-1.5 rounded-sm bg-red-950/40 border border-red-800/60 text-red-200 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <p>{t('files.guidance_warning')}</p>
                </div>
                <div className="p-1.5 rounded-sm bg-studio-surface border border-studio-border text-slate-400 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <p>{t('files.guidance_imaging')}</p>
                </div>
              </div>
            )}
          </div>

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

              {/* Selection Controls */}
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

              {/* Titles List */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-0.5">
                {recordingTree.titles.map((title) => {
                  const isSelected = selectedTitleIds.has(title.id);
                  const isExpandedChapters = expandedChapterTitles.has(title.id);

                  return (
                    <div
                      key={title.id}
                      className={`p-2 rounded-sm border transition flex flex-col gap-1.5 ${
                        isSelected
                          ? 'bg-amber-950/20 border-amber-500/50'
                          : 'bg-studio-surface border-studio-border text-slate-400'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {/* Checkbox */}
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => toggleSelectTitle(title.id)}
                          className="mt-0.5 text-amber-400 hover:text-amber-300 transition cursor-pointer shrink-0"
                          aria-label={title.title}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-amber-400" aria-hidden="true" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500" aria-hidden="true" />
                          )}
                        </button>

                        {/* Thumbnail / Video Icon */}
                        <div className="relative w-16 h-11 bg-slate-900 rounded-xs border border-studio-border shrink-0 overflow-hidden flex items-center justify-center">
                          {title.thumbnail_url ? (
                            <img
                              src={
                                title.thumbnail_url.startsWith('http') || title.thumbnail_url.startsWith('data:')
                                  ? title.thumbnail_url
                                  : `${getApiBaseUrl()}${title.thumbnail_url}`
                              }
                              alt={title.title}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <Film className="w-4 h-4 text-slate-500" />
                          )}
                          <span className="absolute bottom-0 right-0 bg-black/80 text-[7px] font-mono px-0.5 rounded-xs text-amber-300 leading-none">
                            {title.duration_formatted}
                          </span>
                        </div>

                        {/* Title Metadata */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-bold text-slate-200 truncate self-center leading-none">
                              {title.title}
                            </span>
                            <span className="text-[9px] bg-studio-panel px-1 py-0.5 rounded-xs border border-studio-border text-slate-400 shrink-0 self-center leading-none inline-flex items-center justify-center">
                              {formatMbSize(title.size_mb)}
                            </span>
                          </div>

                          <div className="text-[9px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span className="self-center leading-none">{title.recorded_date}</span>
                            <span className="self-center leading-none">•</span>
                            <span className="self-center leading-none">{title.format}</span>
                            {title.is_extracted && (
                              <span className="text-emerald-400 font-bold self-center leading-none">
                                {t('files.extracted_badge')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Send to Desk Button */}
                        <button
                          type="button"
                          onClick={() => handleLoadTitleToDesk(title)}
                          className="bg-studio-panel hover:bg-studio-surface-hover text-slate-300 hover:text-white border border-studio-border px-1.5 py-1 rounded-sm text-[9px] font-semibold transition cursor-pointer shrink-0 inline-flex items-center justify-center"
                          title={t('files.send_to_restoration_btn')}
                        >
                          <span className="self-center leading-none">{t('files.send_to_restoration_btn')}</span>
                        </button>
                      </div>

                      {/* Chapters Accordion */}
                      {title.chapters.length > 0 && (
                        <div className="border-t border-studio-border/60 pt-1 flex flex-col gap-1">
                          <button
                            type="button"
                            aria-expanded={isExpandedChapters}
                            onClick={() => toggleExpandChapters(title.id)}
                            className="flex items-center gap-1 text-[9px] text-slate-400 hover:text-slate-200 transition cursor-pointer self-start"
                          >
                            {isExpandedChapters ? (
                              <ChevronDown className="w-2.5 h-2.5 shrink-0 self-center" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="w-2.5 h-2.5 shrink-0 self-center" aria-hidden="true" />
                            )}
                            <span className="self-center leading-none">
                              {t('files.chapters_count', { count: title.chapters.length })}
                            </span>
                          </button>

                          {isExpandedChapters && (
                            <div className="pl-3.5 space-y-1 text-[9px] text-slate-400">
                              {title.chapters.map((ch) => (
                                <div
                                  key={ch.id}
                                  className="flex items-center justify-between pr-1 py-0.5 border-b border-studio-border/30 last:border-0"
                                >
                                  <span>
                                    {t('files.chapter_item', {
                                      num: ch.id,
                                      time: ch.start_timecode,
                                    })}
                                  </span>
                                  <span className="font-mono text-slate-500">
                                    {ch.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 5: Diagnostic Inspection Result Display */}
          {inspectionResult && (
            <div
              className={`p-2 rounded-sm border text-[11px] ${
                inspectionResult.is_panasonic
                  ? 'bg-studio-panel border-amber-500/40 text-amber-200'
                  : 'bg-studio-panel border-red-500/40 text-red-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold self-center leading-none">
                  {t('files.format_label')} {inspectionResult.format}
                </span>
                <span className="text-[9px] px-1 py-0.5 rounded-sm bg-studio-surface border border-studio-border text-slate-300 shrink-0 self-center leading-none inline-flex items-center justify-center">
                  <span className="self-center leading-none">{t('files.binary_native')}</span>
                </span>
              </div>
              <p className="text-[10px] text-slate-300 mb-2 leading-relaxed">
                {inspectionResult.details}
              </p>
              {inspectionResult.can_extract && (
                <button
                  type="button"
                  disabled={isExtracting}
                  onClick={handleExtractAll}
                  className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-1.5 rounded-sm text-xs transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                  data-testid="extract-panasonic-btn"
                >
                  {isExtracting ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin self-center" />
                      <span className="self-center leading-none">{t('files.extracting')}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3 h-3 self-center" />
                      <span className="self-center leading-none">{t('files.extract_btn')}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
            </>
          )}

          {/* Raw Disk Imaging Panel */}
          {ingestMode === 'disk_image' && (
            <div className="flex flex-col gap-2.5">
              {/* Drive Selection */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                    <HardDrive className="w-3 h-3 text-slate-400 self-center" />
                    <span className="self-center leading-none">{t('files.detected_drives_title')}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => scanDrives()}
                    disabled={isScanningDrives}
                    className="text-slate-400 hover:text-slate-200 transition text-[9px] flex items-center gap-1 cursor-pointer font-mono"
                    title={t('files.scan_drives')}
                  >
                    <RefreshCw className={`w-2.5 h-2.5 ${isScanningDrives ? 'animate-spin' : ''} self-center`} />
                    <span className="self-center leading-none">{t('files.refresh')}</span>
                  </button>
                </div>

                {physicalDrives.length === 0 ? (
                  <div className="p-2 border border-dashed border-studio-border rounded-sm bg-studio-panel/60 text-[10px] text-slate-500 text-center">
                    {t('files.no_drives_found')}
                  </div>
                ) : (
                  <select
                    value={selectedDriveId}
                    onChange={(e) => setSelectedDriveId(e.target.value)}
                    className="bg-studio-panel border border-studio-border rounded-sm px-2 py-1.5 text-[11px] text-slate-200 font-mono focus:outline-none focus:border-amber-500 cursor-pointer"
                    data-testid="disk-image-drive-select"
                  >
                    {physicalDrives.map((d) => (
                      <option key={d.device_id} value={d.device_id}>
                        {d.display_name} • {d.bus_type} ({d.sector_size_bytes}B)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Destination Path and Container Format */}
              <div className="flex flex-col gap-1 pt-1 border-t border-studio-border">
                <label className="text-[10px] text-slate-400 uppercase font-semibold">
                  {t('files.disk_image_output_label')}
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={outputImagePath}
                    onChange={(e) => setOutputImagePath(e.target.value)}
                    placeholder={t('files.disk_image_output_placeholder')}
                    className="flex-1 bg-studio-panel border border-studio-border rounded-sm px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-studio-border-focus font-mono"
                    data-testid="disk-image-output-input"
                  />
                  <select
                    value={containerFormat}
                    onChange={(e) => setContainerFormat(e.target.value as 'img' | 'bin' | 'iso')}
                    className="bg-studio-panel border border-studio-border rounded-sm px-1.5 py-1 text-[10px] text-slate-300 font-mono cursor-pointer"
                    aria-label={t('files.disk_image_format_label')}
                  >
                    <option value="img">.img</option>
                    <option value="bin">.bin</option>
                    <option value="iso">.iso</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsImageFolderModalOpen(true)}
                    className="bg-studio-panel hover:bg-studio-surface-hover text-slate-300 border border-studio-border px-2 py-1 rounded-sm text-[10px] font-bold transition cursor-pointer flex items-center justify-center gap-1 shrink-0"
                    title={t('folders.browse_btn')}
                  >
                    <FolderOpen className="w-3 h-3 text-amber-400 self-center" />
                  </button>
                </div>
              </div>

              {/* Checkboxes: Fault tolerance, Fixity, Auto-Chain */}
              <div className="flex flex-col gap-1.5 py-1 text-[10px] text-slate-300">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={zeroFillCorruptSectors}
                    onChange={(e) => setZeroFillCorruptSectors(e.target.checked)}
                    className="rounded-xs border-studio-border bg-studio-panel text-amber-500 cursor-pointer"
                  />
                  <span>{t('files.disk_image_zero_fill_label')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={computeSha256Sidecar}
                    onChange={(e) => setComputeSha256Sidecar(e.target.checked)}
                    className="rounded-xs border-studio-border bg-studio-panel text-amber-500 cursor-pointer"
                  />
                  <span>{t('files.disk_image_sha256_label')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoChainRestoration}
                    onChange={(e) => setAutoChainRestoration(e.target.checked)}
                    className="rounded-xs border-studio-border bg-studio-panel text-amber-500 cursor-pointer"
                  />
                  <span>{t('files.disk_image_auto_chain_label')}</span>
                </label>
              </div>

              {/* Sector Health Bar (128 buckets) */}
              <SectorHealthBar
                buckets={telemetry?.sector_map_buckets ?? emptyBuckets}
                badSectorCount={telemetry?.bad_sector_count ?? 0}
                retriedCount={telemetry?.retried_sector_count ?? 0}
              />

              {/* Speedometer & Live Telemetry Bar */}
              {telemetry && (
                <div className="p-2 rounded-sm border border-studio-border bg-studio-panel/50 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>
                    {t('files.disk_image_lba_status', {
                      current: telemetry.current_lba,
                      total: telemetry.total_lba,
                      percent: telemetry.progress_percent.toFixed(1),
                    })}
                  </span>
                  <span className="text-amber-300 font-bold">
                    {t('files.disk_image_telemetry_bar', {
                      speed: telemetry.throughput_mbps.toFixed(1),
                      eta: `${telemetry.eta_seconds}s`,
                      errors: telemetry.bad_sector_count,
                    })}
                  </span>
                </div>
              )}

              {/* Action Buttons: Start / Cancel */}
              <div className="flex gap-2 pt-1">
                {isImaging ? (
                  <button
                    type="button"
                    onClick={handleCancelImaging}
                    className="flex-1 bg-red-800 hover:bg-red-700 text-white font-bold py-1.5 rounded-sm text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                    data-testid="cancel-disk-imaging-btn"
                  >
                    <RefreshCw className="w-3 h-3 animate-spin self-center" />
                    <span className="self-center leading-none">{t('files.disk_image_cancel_btn')}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartImaging}
                    disabled={!selectedDriveId || !outputImagePath.trim()}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-1.5 rounded-sm text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                    data-testid="start-disk-imaging-btn"
                  >
                    <Download className="w-3 h-3 self-center" />
                    <span className="self-center leading-none">{t('files.disk_image_start_btn')}</span>
                  </button>
                )}
              </div>
            </div>
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
