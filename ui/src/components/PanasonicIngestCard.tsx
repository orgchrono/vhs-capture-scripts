import React from 'react';
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

  return (
    <div className="bg-studio-panel border border-studio-border rounded-md p-2.5 flex flex-col gap-2 select-none">
      {/* Header: Title, Hotplug Indicator, and Expand/Collapse Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300 font-bold uppercase tracking-wider">
          <Disc className="w-3.5 h-3.5 text-amber-400" />
          <span>{t('files.panasonic_ingest_title')}</span>
          {hasPanasonicDisk && (
            <span className="led-lamp led-live animate-pulse" aria-hidden="true" />
          )}
          {panasonicHotplugEnabled ? (
            <span
              className="flex items-center gap-1 text-[9px] bg-studio-surface px-1.5 py-0.5 rounded-xs border border-studio-border text-slate-400 font-normal cursor-help"
              title={t('files.hotplug_tooltip')}
            >
              <span className="led-lamp led-idle" aria-hidden="true" />
              <span>{t('files.hotplug_active_label')}</span>
            </span>
          ) : (
            <span
              className="flex items-center gap-1 text-[9px] bg-studio-surface px-1.5 py-0.5 rounded-xs border border-studio-border text-slate-500 font-normal cursor-help"
              title={t('files.hotplug_disabled_tooltip')}
            >
              <span className="led-lamp led-off" aria-hidden="true" />
              <span>{t('files.hotplug_disabled_label')}</span>
            </span>
          )}
        </div>

        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-center w-5 h-5 text-slate-400 hover:text-slate-100 bg-studio-surface hover:bg-studio-surface-hover rounded-sm border border-studio-border cursor-pointer transition"
          title={isExpanded ? t('files.panasonic_collapse') : t('files.panasonic_expand')}
          aria-label={isExpanded ? t('files.panasonic_collapse') : t('files.panasonic_expand')}
          data-testid="toggle-panasonic-ingest-btn"
        >
          {isExpanded ? (
            <Minus className="w-3 h-3" aria-hidden="true" />
          ) : (
            <Plus className="w-3 h-3" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Expanded Controls */}
      {isExpanded && (
        <div className="p-2.5 rounded-sm border border-studio-border bg-studio-surface flex flex-col gap-3 text-xs font-mono">
          {/* Section 1: Auto-Detected Physical Disks & Hotplug Adapters */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-slate-400" />
                <span>{t('files.detected_drives_title')}</span>
              </label>
              <button
                type="button"
                onClick={() => refetchDisks()}
                disabled={isScanningDisks}
                className="text-slate-400 hover:text-slate-200 transition text-[9px] flex items-center gap-1 cursor-pointer font-mono"
                title={t('files.scan_drives')}
              >
                <RefreshCw className={`w-2.5 h-2.5 ${isScanningDisks ? 'animate-spin' : ''}`} />
                <span>{t('files.refresh')}</span>
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
                            className={`led-lamp ${isPana ? 'led-live animate-pulse' : 'led-idle'}`}
                            aria-hidden="true"
                          />
                          <span className="text-[11px] font-bold truncate">
                            {disk.model}
                          </span>
                          {isPana && (
                            <span className="text-[9px] bg-amber-950 px-1 py-0.5 rounded-xs border border-amber-600/60 text-amber-300 shrink-0 uppercase">
                              {t('files.panasonic_detected_badge')}
                            </span>
                          )}
                          <span className="text-[8px] bg-studio-surface px-1 py-0.5 rounded-xs border border-studio-border text-slate-400 shrink-0 flex items-center gap-0.5">
                            {disk.is_usb ? <Usb className="w-2.5 h-2.5" /> : null}
                            <span>{adapterLabel}</span>
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span className="truncate">{disk.device_id}</span>
                          <span>•</span>
                          <span>{disk.size_gb} GB</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setPanasonicPath(disk.device_id);
                          handleInspectPath(disk.device_id);
                        }}
                        className={`text-[10px] font-bold px-2 py-1 rounded-sm border transition cursor-pointer shrink-0 ${
                          isPana
                            ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500/50 shadow-xs'
                            : 'bg-studio-surface hover:bg-studio-surface-hover text-slate-300 border-studio-border'
                        }`}
                        title={t('files.connect_drive_btn')}
                      >
                        {t('files.connect_drive_btn')}
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
                className="flex-1 bg-studio-panel border border-studio-border rounded-sm px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-studio-border-focus"
                data-testid="panasonic-path-input"
              />
              <button
                type="button"
                disabled={!panasonicPath.trim() || isInspecting || isLoadingTree}
                onClick={() => handleInspectPath(panasonicPath)}
                className="bg-studio-panel hover:bg-studio-surface-hover text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-sm text-[10px] font-bold transition disabled:opacity-40 cursor-pointer flex items-center gap-1 shrink-0"
                data-testid="inspect-panasonic-btn"
              >
                {isInspecting || isLoadingTree ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Search className="w-3 h-3" />
                )}
                <span>{t('files.inspect')}</span>
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
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>{t('files.guidance_title')}</span>
              </span>
              <span className="text-[9px] text-slate-500">
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
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] font-bold text-amber-200">
                    {t('files.recording_tree_title')}
                  </span>
                  <span className="text-[9px] bg-studio-surface px-1.5 py-0.5 rounded-xs border border-studio-border text-slate-300">
                    {recordingTree.format}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 flex items-center gap-2">
                  <span>
                    {t('files.tree_total_titles', { count: recordingTree.total_titles })}
                  </span>
                  <span>•</span>
                  <span>
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
                    <CheckSquare className="w-3 h-3" />
                    <span>{t('files.select_all')}</span>
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="text-slate-400 hover:text-slate-200 transition cursor-pointer flex items-center gap-1"
                  >
                    <Square className="w-3 h-3" />
                    <span>{t('files.deselect_all')}</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isExtractingTitles || selectedTitleIds.size === 0}
                  onClick={handleExtractSelectedTitles}
                  className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-bold px-2.5 py-1 rounded-sm text-[10px] transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  {isExtractingTitles ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  <span>
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
                              src={title.thumbnail_url}
                              alt={title.title}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <Film className="w-4 h-4 text-slate-500" />
                          )}
                          <span className="absolute bottom-0 right-0 bg-black/80 text-[7px] font-mono px-0.5 rounded-xs text-amber-300">
                            {title.duration_formatted}
                          </span>
                        </div>

                        {/* Title Metadata */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-bold text-slate-200 truncate">
                              {title.title}
                            </span>
                            <span className="text-[9px] bg-studio-panel px-1 py-0.5 rounded-xs border border-studio-border text-slate-400 shrink-0">
                              {title.size_mb >= 1024
                                ? `${(title.size_mb / 1024).toFixed(1)} GB`
                                : `${title.size_mb} MB`}
                            </span>
                          </div>

                          <div className="text-[9px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>{title.recorded_date}</span>
                            <span>•</span>
                            <span>{title.format}</span>
                            {title.is_extracted && (
                              <span className="text-emerald-400 font-bold">
                                {t('files.extracted_badge')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Send to Desk Button */}
                        <button
                          type="button"
                          onClick={() => handleLoadTitleToDesk(title)}
                          className="bg-studio-panel hover:bg-studio-surface-hover text-slate-300 hover:text-white border border-studio-border px-1.5 py-1 rounded-sm text-[9px] font-semibold transition cursor-pointer shrink-0"
                          title={t('files.send_to_restoration_btn')}
                        >
                          {t('files.send_to_restoration_btn')}
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
                              <ChevronDown className="w-2.5 h-2.5" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="w-2.5 h-2.5" aria-hidden="true" />
                            )}
                            <span>
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
                <span className="font-bold">
                  {t('files.format_label')} {inspectionResult.format}
                </span>
                <span className="text-[9px] px-1 py-0.5 rounded-sm bg-studio-surface border border-studio-border text-slate-300">
                  {t('files.binary_native')}
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
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>{t('files.extracting')}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3 h-3" />
                      <span>{t('files.extract_btn')}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
