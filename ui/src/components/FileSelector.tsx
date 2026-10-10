import React from 'react';
import { IncompleteJobsCard } from './IncompleteJobsCard';
import { TapeLibraryCard } from './TapeLibraryCard';
import { PanasonicIngestCard } from './PanasonicIngestCard';
import type { RawFile } from '../types';

export interface FileSelectorProps {
  files: RawFile[];
  onRefresh: () => void;
  isRefetching: boolean;
}

export const FileSelector: React.FC<FileSelectorProps> = ({
  files,
  onRefresh,
  isRefetching,
}) => {
  return (
    <div className="flex flex-col gap-3">
      <IncompleteJobsCard onRefreshParent={onRefresh} />
      <TapeLibraryCard
        files={files}
        onRefresh={onRefresh}
        isRefetching={isRefetching}
      />
      <PanasonicIngestCard onRefresh={onRefresh} />
    </div>
  );
};
