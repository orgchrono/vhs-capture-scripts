import React from 'react';
import { Switch } from '../ui/switch';

export interface PreferenceSwitchRowProps {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (val: boolean) => void;
  action?: React.ReactNode;
}

export const PreferenceSwitchRow: React.FC<PreferenceSwitchRowProps> = ({
  label,
  description,
  checked,
  onCheckedChange,
  action,
}) => (
  <div className="flex items-center justify-between bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
    <div className="space-y-0.5 pr-2">
      <label className="text-xs font-medium text-slate-200 font-mono block">
        {label}
      </label>
      <p className="text-[11px] text-slate-400 font-mono">
        {description}
      </p>
    </div>
    {action ?? (
      <Switch
        aria-label={label}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    )}
  </div>
);
