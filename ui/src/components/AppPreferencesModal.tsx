import React, { useState } from 'react';
import {
  Settings,
  Folder,
  Sliders,
  Terminal,
  Cpu,
  Palette,
  X,
  RotateCcw,
  Check,
} from 'lucide-react';
import { Button } from './ui/button';
import { useTranslation } from 'react-i18next';
import { usePreferencesViewModel, type PreferencesTabType } from '../viewmodels/usePreferencesViewModel';
import { DirectoryPickerModal } from './DirectoryPickerModal';
import { DirectoriesTabContent } from './preferences/DirectoriesTabContent';
import { PerformanceTabContent } from './preferences/PerformanceTabContent';
import { ConsoleTabContent } from './preferences/ConsoleTabContent';
import { HardwareTabContent } from './preferences/HardwareTabContent';
import { InterfaceTabContent } from './preferences/InterfaceTabContent';

interface AppPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPrivacy?: () => void;
}

export type { PreferencesTabType as TabType };

export const AppPreferencesModal: React.FC<AppPreferencesModalProps> = ({
  isOpen,
  onClose,
  onOpenPrivacy,
}) => {
  const { t } = useTranslation();
  const [pickerTarget, setPickerTarget] = useState<'rawDir' | 'restoredDir' | 'cacheDir' | null>(null);
  const {
    prefs,
    activeTab,
    setActiveTab,
    handleSaveAndClose,
    handleReset,
  } = usePreferencesViewModel(onClose, isOpen);

  if (!isOpen) return null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-modal-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
      >
        <div className="bg-studio-panel border border-studio-border rounded-md max-w-3xl w-full h-[600px] max-h-[92vh] p-5 shadow-2xl flex flex-col overflow-hidden select-none">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-4 pb-3 border-b border-studio-border shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-studio-surface border border-studio-border rounded-sm text-amber-500">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h2
                  id="preferences-modal-title"
                  className="text-sm font-bold text-slate-100 flex items-center gap-2 font-mono uppercase tracking-wide"
                >
                  {t('preferences.title')}
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  {t('preferences.subtitle')}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 rounded-sm text-slate-400 hover:text-white hover:bg-studio-surface"
              onClick={onClose}
              aria-label={t('preferences.close')}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Tab Navigation Bar */}
          <div className="flex border-b border-studio-border gap-1 pb-2 shrink-0 overflow-x-auto custom-scrollbar" role="tablist">
            <Button
              role="tab"
              aria-selected={activeTab === 'directories'}
              variant={activeTab === 'directories' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('directories')}
              className={`h-8 text-xs font-mono rounded-sm flex items-center gap-1.5 ${activeTab === 'directories'
                  ? 'bg-studio-surface text-amber-400 border border-studio-border'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <Folder className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('preferences.tab_storage')}</span>
            </Button>
            <Button
              role="tab"
              aria-selected={activeTab === 'performance'}
              variant={activeTab === 'performance' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('performance')}
              className={`h-8 text-xs font-mono rounded-sm flex items-center gap-1.5 ${activeTab === 'performance'
                  ? 'bg-studio-surface text-amber-400 border border-studio-border'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <Sliders className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('preferences.tab_performance')}</span>
            </Button>
            <Button
              role="tab"
              aria-selected={activeTab === 'console'}
              variant={activeTab === 'console' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('console')}
              className={`h-8 text-xs font-mono rounded-sm flex items-center gap-1.5 ${activeTab === 'console'
                  ? 'bg-studio-surface text-amber-400 border border-studio-border'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('preferences.tab_console')}</span>
            </Button>
            <Button
              role="tab"
              aria-selected={activeTab === 'hardware'}
              variant={activeTab === 'hardware' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('hardware')}
              className={`h-8 text-xs font-mono rounded-sm flex items-center gap-1.5 ${activeTab === 'hardware'
                  ? 'bg-studio-surface text-amber-400 border border-studio-border'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <Cpu className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('preferences.tab_hardware')}</span>
            </Button>
            <Button
              role="tab"
              aria-selected={activeTab === 'interface'}
              variant={activeTab === 'interface' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('interface')}
              className={`h-8 text-xs font-mono rounded-sm flex items-center gap-1.5 ${activeTab === 'interface'
                  ? 'bg-studio-surface text-amber-400 border border-studio-border'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <Palette className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('preferences.tab_interface')}</span>
            </Button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-4">
            {activeTab === 'directories' && (
              <DirectoriesTabContent
                prefs={prefs}
                onBrowse={(target) => setPickerTarget(target)}
              />
            )}
            {activeTab === 'performance' && (
              <PerformanceTabContent prefs={prefs} />
            )}
            {activeTab === 'console' && (
              <ConsoleTabContent prefs={prefs} />
            )}
            {activeTab === 'hardware' && (
              <HardwareTabContent prefs={prefs} />
            )}
            {activeTab === 'interface' && (
              <InterfaceTabContent
                prefs={prefs}
                onOpenPrivacy={onOpenPrivacy}
                onClose={onClose}
              />
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-studio-border shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="h-8 text-xs font-mono rounded-sm border-studio-border bg-slate-800 text-slate-300 hover:text-white flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('preferences.reset_defaults')}</span>
            </Button>

            <Button
              size="sm"
              onClick={handleSaveAndClose}
              className="h-8 text-xs font-mono rounded-sm bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t('preferences.close')}</span>
            </Button>
          </div>
        </div>
      </div>

      <DirectoryPickerModal
        isOpen={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        initialPath={pickerTarget ? prefs[pickerTarget] : ''}
        onSelect={(selectedPath) => {
          if (pickerTarget) {
            prefs.updatePreferences({ [pickerTarget]: selectedPath });
          }
        }}
      />
    </>
  );
};
