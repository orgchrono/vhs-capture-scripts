import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ptBR from './locales/pt-BR/translation.json';
import enUS from './locales/en-US/translation.json';
import es from './locales/es/translation.json';
import fr from './locales/fr/translation.json';
import de from './locales/de/translation.json';
import it from './locales/it/translation.json';
import ru from './locales/ru/translation.json';
import zhCN from './locales/zh-CN/translation.json';
import ja from './locales/ja/translation.json';
import ar from './locales/ar/translation.json';

export interface SupportedLanguage {
  code: string;
  name: string;
  region: string;
  dir: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'pt-BR', name: 'Português', region: 'Brasil', dir: 'ltr' },
  { code: 'en-US', name: 'English', region: 'US', dir: 'ltr' },
  { code: 'es', name: 'Español', region: 'Internacional', dir: 'ltr' },
  { code: 'fr', name: 'Français', region: 'France', dir: 'ltr' },
  { code: 'de', name: 'Deutsch', region: 'Deutschland', dir: 'ltr' },
  { code: 'it', name: 'Italiano', region: 'Italia', dir: 'ltr' },
  { code: 'ru', name: 'Русский', region: 'Россия', dir: 'ltr' },
  { code: 'zh-CN', name: '简体中文', region: '中国', dir: 'ltr' },
  { code: 'ja', name: '日本語', region: '日本', dir: 'ltr' },
  { code: 'ar', name: 'العربية', region: 'الشرق الأوسط', dir: 'rtl' },
];

const resources = {
  'pt-BR': { translation: ptBR },
  'en-US': { translation: enUS },
  'es': { translation: es },
  'fr': { translation: fr },
  'de': { translation: de },
  'it': { translation: it },
  'ru': { translation: ru },
  'zh-CN': { translation: zhCN },
  'ja': { translation: ja },
  'ar': { translation: ar },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'pt-BR', // Default broadcast language
    fallbackLng: 'en-US',
    interpolation: {
      escapeValue: false,
    },
  });

// Reactive internationalization & accessibility (a11y) layout direction
const syncDocumentDirection = (lng: string) => {
  if (typeof document !== 'undefined') {
    const isRtl = lng === 'ar';
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lng;
  }
};

syncDocumentDirection(i18n.language);
i18n.on('languageChanged', syncDocumentDirection);

export default i18n;
