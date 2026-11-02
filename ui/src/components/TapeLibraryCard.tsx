import React, { useState } from 'react';
import { UploadCloud, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTapeLibraryViewModel } from '../viewmodels/useTapeLibraryViewModel';
import type { RawFile } from '../types';
import { QcReportModal } from './QcReportModal';
import { DirectoryPickerModal } from './DirectoryPickerModal';
import { usePreferencesStore } from '../store/usePreferencesStore';
import { isSupportedVideoFile } from '../lib/constants';
import { TapeItemCard } from './library/TapeItemCard';
import { EmptyTapeListState } from './library/EmptyTapeListState';
import { LibraryHeader } from './library/LibraryHeader';
import { QuickTapeSelector } from './library/QuickTapeSelector';
import { RecoveryCheckpointRibbon } from './library/RecoveryCheckpointRibbon';
import { OrphanTapeCard } from './library/OrphanTapeCard';

export interface TapeLibraryCardProps {
  files: RawFile[];
  restoredFiles?: RawFile[];
  onRefresh: () => void;
  isRefetching: boolean;
}

export const TapeLibraryCard: React.FC<TapeLibraryCardProps> = ({
  files,
  restoredFiles = [],
  onRefresh,
  isRefetching,
}) => {
  const { t } = useTranslation();
  const [libraryTab, setLibraryTab] = useState<'raw' | 'masters'>('raw');
  const {
    isLibraryExpanded,
    setIsLibraryExpanded,
    selectedFile,
    setSelectedFile,
    isRestoring,
    isPaused,
    handleSelectTape,
    findIncompleteJob,
    selectedIncompleteJob,
    orphanJobs,
    handleAction,
    isPerformingAction,
    handleCleanBlackframes,
    isCleaningBlackframes,
  } = useTapeLibraryViewModel({ files, onRefreshParent: onRefresh });
  const [qcModalFile, setQcModalFile] = useState<string | null>(null);
  const [isDirPickerOpen, setIsDirPickerOpen] = useState(false);
  const prefs = usePreferencesStore();

  return (
    <div className="bg-studio-panel border border-studio-border rounded-md p-2.5 flex flex-col gap-2 select-none">
      <LibraryHeader
        rawCount={files.length + orphanJobs.length}
        mastersCount={restoredFiles.length}
        libraryTab={libraryTab}
        setLibraryTab={setLibraryTab}
        isLibraryExpanded={isLibraryExpanded}
        setIsLibraryExpanded={setIsLibraryExpanded}
        isRefetching={isRefetching}
        onRefresh={onRefresh}
        onOpenDirPicker={() => setIsDirPickerOpen(true)}
      />

      <QuickTapeSelector
        libraryTab={libraryTab}
        files={files}
        restoredFiles={restoredFiles}
        orphanJobs={orphanJobs}
        selectedFile={selectedFile}
        setSelectedFile={setSelectedFile}
        handleSelectTape={handleSelectTape}
        findIncompleteJob={findIncompleteJob}
        isRestoring={isRestoring}
        isPaused={isPaused}
        onOpenDirPicker={() => setIsDirPickerOpen(true)}
        onOpenQcModal={(f) => setQcModalFile(f)}
      />

      {selectedIncompleteJob && (
        <RecoveryCheckpointRibbon
          job={selectedIncompleteJob}
          isRestoring={isRestoring}
          isPerformingAction={isPerformingAction}
          onAction={handleAction}
        />
      )}

      {/* Tape Cards List */}
      {isLibraryExpanded && (
        <div className="space-y-1.5 max-h-[380px] overflow-y-auto custom-scrollbar pr-0.5 pt-0.5">
          {libraryTab === 'raw' ? (
            files.length === 0 && orphanJobs.length === 0 ? (
              <EmptyTapeListState
                icon={<UploadCloud className="w-6 h-6 text-slate-500 group-hover:text-amber-400 transition mb-0.5" />}
                titleKey="files.no_files_found"
                hintKey="files.empty_hint"
                testId="empty-raw-card-btn"
                onBrowse={() => setIsDirPickerOpen(true)}
              />
            ) : (
              <>
                {orphanJobs.map((job) => {
                  const targetPath = job.source_file || job.output_file;
                  const isSelected = selectedFile === targetPath;
                  const name = job.source_file ? (job.source_file.split(/[/\\]/).pop() || job.source_file) : job.job_id;
                  return (
                    <OrphanTapeCard
                      key={job.job_id}
                      job={job}
                      isSelected={isSelected}
                      isRestoring={isRestoring}
                      isPaused={isPaused}
                      onSelect={() => {
                        handleSelectTape({
                          name,
                          path: targetPath,
                          size_mb: Math.round(job.output_size_bytes / (1024 * 1024)),
                        });
                      }}
                    />
                  );
                })}

                {files.map((file) => (
                  <TapeItemCard
                    key={file.path}
                    file={file}
                    isSelected={selectedFile === file.path}
                    isRestoring={isRestoring}
                    isPaused={isPaused}
                    isMaster={false}
                    inc={findIncompleteJob(file.path)}
                    isCleaning={isCleaningBlackframes}
                    onSelect={handleSelectTape}
                    onOpenQc={setQcModalFile}
                    onCleanBlackframes={handleCleanBlackframes}
                  />
                ))}
              </>
            )
          ) : (
            restoredFiles.length === 0 ? (
              <EmptyTapeListState
                icon={<CheckCircle2 className="w-6 h-6 text-slate-500 group-hover:text-emerald-400 transition mb-0.5" />}
                titleKey="files.no_masters_yet"
                hintKey="files.empty_hint"
                testId="empty-masters-card-btn"
                onBrowse={() => setIsDirPickerOpen(true)}
              />
            ) : (
              restoredFiles.map((file) => (
                <TapeItemCard
                  key={file.path}
                  file={file}
                  isSelected={selectedFile === file.path}
                  isRestoring={isRestoring}
                  isPaused={isPaused}
                  isMaster={true}
                  isCleaning={isCleaningBlackframes}
                  onSelect={handleSelectTape}
                  onOpenQc={setQcModalFile}
                  onCleanBlackframes={handleCleanBlackframes}
                />
              ))
            )
          )}
        </div>
      )}

      {/* Contextual Quick Blackframe Clean Action */}
      {selectedFile && isSupportedVideoFile(selectedFile) && (
        <div className="pt-2 border-t border-studio-border/60 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={isRestoring || isPaused || isCleaningBlackframes}
            onClick={() => handleCleanBlackframes(selectedFile)}
            className="w-full h-7 bg-studio-surface hover:bg-studio-surface-hover disabled:opacity-50 text-slate-300 hover:text-amber-300 font-mono text-[10px] rounded-sm border border-studio-border flex items-center justify-center gap-1.5 transition cursor-pointer"
            title={t('blackframes.quick_clean_tooltip')}
            data-testid="quick-clean-blackframes-btn"
          >
            <CheckCircle2 className="w-3 h-3 text-amber-400" />
            <span>{isCleaningBlackframes ? t('blackframes.cleaning_in_progress') : t('blackframes.quick_clean_button')}</span>
          </button>
        </div>
      )}

      {/* QC Modal Overlay */}
      {qcModalFile && (
        <QcReportModal
          isOpen={Boolean(qcModalFile)}
          filePath={qcModalFile}
          onClose={() => setQcModalFile(null)}
        />
      )}

      {/* Directory Picker Modal */}
      <DirectoryPickerModal
        isOpen={isDirPickerOpen}
        onClose={() => setIsDirPickerOpen(false)}
        initialPath={libraryTab === 'raw' ? prefs.rawDir : prefs.restoredDir}
        mode="both"
        onSelect={(path) => {
          if (isSupportedVideoFile(path)) {
            const parentDir = path.replace(/[/\\][^/\\]+$/, '');
            const fileName = path.split(/[/\\]/).pop() || path;
            if (libraryTab === 'raw') {
              prefs.updatePreferences({ rawDir: parentDir });
            } else {
              prefs.updatePreferences({ restoredDir: parentDir });
            }
            handleSelectTape({
              name: fileName,
              path,
              size_mb: 0,
              is_master: libraryTab === 'masters',
            });
          } else {
            if (libraryTab === 'raw') {
              prefs.updatePreferences({ rawDir: path });
            } else {
              prefs.updatePreferences({ restoredDir: path });
            }
          }
          onRefresh();
        }}
      />
    </div>
  );
};
