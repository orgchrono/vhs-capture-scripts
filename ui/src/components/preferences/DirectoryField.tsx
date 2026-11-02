import React from 'react';
import { Folder } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export interface DirectoryFieldProps {
  label: string;
  description: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  onBrowse: () => void;
  browseTitle: string;
}

export const DirectoryField: React.FC<DirectoryFieldProps> = ({
  label,
  description,
  value,
  onChange,
  placeholder,
  onBrowse,
  browseTitle,
}) => (
  <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
    <label className="text-xs font-medium text-slate-200 font-mono block">
      {label}
    </label>
    <p className="text-[11px] text-slate-400 font-mono">
      {description}
    </p>
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-studio-panel border-studio-border rounded-sm font-mono text-xs text-slate-200 flex-1"
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onBrowse}
        className="h-8 px-3 font-mono text-xs text-slate-300 hover:text-white shrink-0 cursor-pointer"
        title={browseTitle}
      >
        <Folder className="w-3.5 h-3.5 mr-1 text-amber-400" />
        <span>{browseTitle}</span>
      </Button>
    </div>
  </div>
);
