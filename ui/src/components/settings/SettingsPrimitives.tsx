import React from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { Switch } from "../ui/switch"
import { useTranslation } from 'react-i18next'

export const TabTransition: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = "flex flex-col gap-4",
}) => {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export interface GenericOption<T extends string> {
  value: T;
  label?: string;
  labelKey?: string;
}

export interface GenericSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<GenericOption<T>> | Array<GenericOption<T>>;
  placeholder?: string;
  disabled?: boolean;
}

export const GenericSelect = <T extends string>({
  value,
  onChange,
  options,
  placeholder,
  disabled
}: GenericSelectProps<T>) => {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(val) => onChange(val as T)} disabled={disabled}>
      <SelectTrigger className="w-full h-9 bg-studio-surface border-studio-border text-white rounded-sm font-mono text-xs text-left">
        <SelectValue placeholder={placeholder || t('settings.select_placeholder')} />
      </SelectTrigger>
      <SelectContent className="bg-studio-panel border-studio-border text-slate-200">
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-left">
            {opt.labelKey ? t(opt.labelKey) : (opt.label || opt.value)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface SettingToggleCardProps {
  id?: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  badge?: string;
}

export const SettingToggleCard: React.FC<SettingToggleCardProps> = ({
  id,
  label,
  description,
  checked,
  disabled = false,
  onChange,
  badge,
}) => (
  <div className="flex flex-col justify-between bg-studio-surface p-3.5 rounded-sm border border-studio-border min-h-[96px]">
    <div className="flex items-center gap-2.5 min-w-0">
      <Switch
        id={id}
        aria-label={label}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="shrink-0"
      />
      <label
        htmlFor={id}
        className="text-xs font-semibold text-slate-200 font-mono cursor-pointer truncate flex items-center gap-2"
        title={label}
        onClick={() => !disabled && onChange(!checked)}
      >
        <span>{label}</span>
        {badge && (
          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
            {badge}
          </span>
        )}
      </label>
    </div>
    <p className="text-[11px] text-slate-400 font-mono leading-relaxed mt-2">
      {description}
    </p>
  </div>
);

