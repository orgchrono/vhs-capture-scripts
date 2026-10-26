import React from 'react';
import { TapeLibraryCard } from './TapeLibraryCard';
import { PanasonicIngestCard } from './PanasonicIngestCard';
import type { RawFile } from '../types';

export interface FileSelectorProps {
  files: RawFile[];
  restoredFiles?: RawFile[];
  onRefresh: () => void;
  isRefetching: boolean;
}

export const FileSelector: React.FC<FileSelectorProps> = ({
  files,
  restoredFiles = [],
  onRefresh,
  isRefetching,
}) => {
  return (
    <div className="flex flex-col gap-3">
      <TapeLibraryCard
        files={files}
        restoredFiles={restoredFiles}
        onRefresh={onRefresh}
        isRefetching={isRefetching}
      />
      <PanasonicIngestCard onRefresh={onRefresh} />
    </div>
  );
};
