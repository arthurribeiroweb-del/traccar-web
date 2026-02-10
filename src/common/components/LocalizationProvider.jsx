import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSelector } from 'react-redux';
import dayjs from 'dayjs';
import en from '../../resources/l10n/en.json';
import usePersistedState from '../util/usePersistedState';

const languageDataLoaders = import.meta.glob(
  ['../../resources/l10n/*.json', '!../../resources/l10n/en.json'],
);

const languages = {
  af: { country: 'ZA', name: 'Afrikaans' },
  ar: { country: 'AE', name: 'Arabic' },
  az: { country: 'AZ', name: 'Azerbaijani' },
  bg: { country: 'BG', name: 'Bulgarian' },
  bn: { country: 'IN', name: 'Bengali' },
  ca: { country: 'ES', name: 'Catalan' },
  cs: { country: 'CZ', name: 'Czech' },
  da: { country: 'DK', name: 'Danish' },
  de: { country: 'DE', name: 'German' },
  el: { country: 'GR', name: 'Greek' },
  en: { country: 'US', name: 'English' },
  es: { country: 'ES', name: 'Spanish' },
  et: { country: 'EE', name: 'Estonian' },
  fa: { country: 'IR', name: 'Persian' },
  fi: { country: 'FI', name: 'Finnish' },
  fr: { country: 'FR', name: 'French' },
  gl: { country: 'ES', name: 'Galician' },
  he: { country: 'IL', name: 'Hebrew' },
  hi: { country: 'IN', name: 'Hindi' },
  hr: { country: 'HR', name: 'Croatian' },
  hu: { country: 'HU', name: 'Hungarian' },
  hy: { country: 'AM', name: 'Armenian' },
  id: { country: 'ID', name: 'Indonesian' },
  it: { country: 'IT', name: 'Italian' },
  ja: { country: 'JP', name: 'Japanese' },
  ka: { country: 'GE', name: 'Georgian' },
  kk: { country: 'KZ', name: 'Kazakh' },
  km: { country: 'KH', name: 'Khmer' },
  ko: { country: 'KR', name: 'Korean' },
  lo: { country: 'LA', name: 'Lao' },
  lt: { country: 'LT', name: 'Lithuanian' },
  lv: { country: 'LV', name: 'Latvian' },
  mk: { country: 'MK', name: 'Macedonian' },
  ml: { country: 'IN', name: 'Malayalam' },
  mn: { country: 'MN', name: 'Mongolian' },
  ms: { country: 'MY', name: 'Malay' },
  nb: { country: 'NO', name: 'Norwegian Bokmal' },
  ne: { country: 'NP', name: 'Nepali' },
  nl: { country: 'NL', name: 'Dutch' },
  nn: { country: 'NO', name: 'Norwegian Nynorsk' },
  pl: { country: 'PL', name: 'Polish' },
  pt: { country: 'PT', name: 'Portuguese' },
  pt_BR: { country: 'BR', name: 'Portuguese (Brazil)' },
  ro: { country: 'RO', name: 'Romanian' },
  ru: { country: 'RU', name: 'Russian' },
  si: { country: 'LK', name: 'Sinhala' },
  sk: { country: 'SK', name: 'Slovak' },
  sl: { country: 'SI', name: 'Slovenian' },
  sq: { country: 'AL', name: 'Albanian' },
  sr: { country: 'RS', name: 'Serbian' },
  sv: { country: 'SE', name: 'Swedish' },
  sw: { country: 'KE', name: 'Swahili' },
  ta: { country: 'IN', name: 'Tamil' },
  th: { country: 'TH', name: 'Thai' },
  tk: { country: 'TM', name: 'Turkmen' },
  tr: { country: 'TR', name: 'Turkish' },
  uk: { country: 'UA', name: 'Ukrainian' },
  uz: { country: 'UZ', name: 'Uzbek' },
  vi: { country: 'VN', name: 'Vietnamese' },
  zh: { country: 'CN', name: 'Chinese' },
  zh_TW: { country: 'TW', name: 'Chinese (Taiwan)' },
};

const hasLanguage = (language) => Object.prototype.hasOwnProperty.call(languages, language);

const resolveDayjsLocale = (language) => {
  if (language === 'pt_BR') {
    return 'pt-br';
  }
  if (language === 'zh_TW') {
    return 'zh-tw';
  }
  return language.toLowerCase();
};

const loadDayjsLocale = async (language) => {
  let locale = resolveDayjsLocale(language);
  if (locale !== 'en') {
    try {
      await import(`dayjs/locale/${locale}.js`);
    } catch {
      const fallbackLocale = locale.split('-')[0];
      if (fallbackLocale && fallbackLocale !== locale && fallbackLocale !== 'en') {
        try {
          await import(`dayjs/locale/${fallbackLocale}.js`);
          locale = fallbackLocale;
        } catch {
          locale = 'en';
        }
      } else {
        locale = 'en';
      }
    }
  }
  dayjs.locale(locale);
};

const loadLanguageData = async (language) => {
  if (language === 'en') {
    return en;
  }

  const loader = languageDataLoaders[`../../resources/l10n/${language}.json`];
  if (!loader) {
    return en;
  }

  try {
    const module = await loader();
    return module.default || module;
  } catch {
    return en;
  }
};

const getDefaultLanguage = () => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const browserLanguages = window.navigator.languages ? window.navigator.languages.slice() : [];
  const browserLanguage = window.navigator.userLanguage || window.navigator.language;

  if (browserLanguage) {
    browserLanguages.push(browserLanguage);
    browserLanguages.push(browserLanguage.substring(0, 2));
  }

  for (let i = 0; i < browserLanguages.length; i += 1) {
    const entry = browserLanguages[i];
    if (!entry || typeof entry !== 'string') {
      continue;
    }

    let language = entry.replace('-', '_');
    if (hasLanguage(language)) {
      return language;
    }
    if (language.length > 2) {
      language = language.substring(0, 2);
      if (hasLanguage(language)) {
        return language;
      }
    }
  }

  return 'en';
};

const LocalizationContext = createContext({
  languages,
  language: 'en',
  direction: 'ltr',
  messages: en,
  setLocalLanguage: () => {},
});

export const LocalizationProvider = ({ children }) => {
  const remoteLanguage = useSelector((state) => {
    const serverLanguage = state.session.server?.attributes?.language;
    const userLanguage = state.session.user?.attributes?.language;
    const targetLanguage = userLanguage || serverLanguage;
    return hasLanguage(targetLanguage) ? targetLanguage : null;
  });

  const [localLanguage, setLocalLanguage] = usePersistedState('language', getDefaultLanguage());
  const [languageData, setLanguageData] = useState({ en });
  const requestRef = useRef(0);

  const language = remoteLanguage || (hasLanguage(localLanguage) ? localLanguage : 'en');
  const direction = /^(ar|he|fa)$/.test(language) ? 'rtl' : 'ltr';

  const setSafeLocalLanguage = useCallback((nextLanguage) => {
    if (typeof nextLanguage === 'string' && hasLanguage(nextLanguage)) {
      setLocalLanguage(nextLanguage);
    }
  }, [setLocalLanguage]);

  useEffect(() => {
    document.dir = direction;
  }, [direction]);

  useEffect(() => {
    let active = true;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    const load = async () => {
      const [messages] = await Promise.all([
        loadLanguageData(language),
        loadDayjsLocale(language),
      ]);

      if (!active || requestRef.current !== requestId) {
        return;
      }

      setLanguageData((previous) => {
        if (previous[language] === messages) {
          return previous;
        }
        return {
          ...previous,
          [language]: messages,
        };
      });
    };

    load();

    return () => {
      active = false;
    };
  }, [language]);

  const messages = languageData[language] || languageData.en || en;

  const value = useMemo(() => ({
    languages,
    language,
    direction,
    messages,
    setLocalLanguage: setSafeLocalLanguage,
  }), [language, direction, messages, setSafeLocalLanguage]);

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
};

export const useLocalization = () => useContext(LocalizationContext);

export const useTranslation = () => {
  const { messages } = useContext(LocalizationContext);
  return useMemo(() => (key) => messages[key] ?? en[key] ?? key, [messages]);
};

export const useTranslationKeys = (predicate) => {
  const { messages } = useContext(LocalizationContext);
  const keys = Object.keys(messages || en);
  return typeof predicate === 'function' ? keys.filter(predicate) : keys;
};
