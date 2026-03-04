import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhDict from './locales/zh.json';
import enDict from './locales/en.json';

i18n
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: enDict },
            zh: { translation: zhDict }
        },
        lng: 'zh', // Default language
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false // React already escapes values
        }
    });

export default i18n;
