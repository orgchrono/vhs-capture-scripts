import React from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { useTranslation } from 'react-i18next'

export const TabTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
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
      <SelectTrigger className="w-full h-9 bg-studio-surface border-studio-border text-white rounded-sm font-mono text-xs">
        <SelectValue placeholder={placeholder || t('settings.select_placeholder')} />
      </SelectTrigger>
      <SelectContent className="bg-studio-panel border-studio-border text-slate-200">
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.labelKey ? t(opt.labelKey) : (opt.label || opt.value)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
