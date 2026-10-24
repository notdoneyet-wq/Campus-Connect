import React, { createContext, useContext, useState, useEffect } from 'react';
import en from '../locales/en.json';
import hi from '../locales/hi.json';
import { Category, DepartmentId, SafetyFlag, TicketStatus, Urgency, UserRole } from '../types';

export type Language = 'en' | 'hi';
export type TranslationKey = keyof typeof en;

export const i18n: Record<Language, Record<TranslationKey, string>> = {
  en,
  hi,
};

export const I18N = i18n;

export function getTranslation(
  lang: Language,
  key: TranslationKey | (string & {}),
  vars?: Record<string, string | number>
): string {
  const dict = i18n[lang] as Record<string, string>;
  const fallbackDict = i18n.en as Record<string, string>;
  let text = dict?.[key] || fallbackDict?.[key] || String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

function resolveLangAndVal(a: string, b?: string): { lang: Language; val: string } {
  if ((a === 'en' || a === 'hi') && b !== undefined && b !== 'en' && b !== 'hi') {
    return { lang: a, val: b };
  }
  const lang: Language = b === 'hi' ? 'hi' : 'en';
  return { lang, val: a };
}

export function translateStatus(
  statusOrLang: TicketStatus | Language | string,
  langOrStatus: Language | TicketStatus | string = 'en'
): string {
  const { lang, val: status } = resolveLangAndVal(String(statusOrLang), String(langOrStatus));
  switch (status) {
    case 'Open':
      return getTranslation(lang, 'statusOpen');
    case 'Assigned':
      return getTranslation(lang, 'statusAssigned');
    case 'In Progress':
      return getTranslation(lang, 'statusInProgress');
    case 'Resolved':
      return getTranslation(lang, 'statusResolved');
    case 'Verified':
      return getTranslation(lang, 'statusVerified');
    case 'Reopened':
      return getTranslation(lang, 'statusReopened');
    case 'investigating':
      return lang === 'hi' ? 'जांच जारी' : 'Investigating';
    case 'fixing':
      return lang === 'hi' ? 'मरम्मत जारी' : 'Fixing';
    case 'resolved':
      return getTranslation(lang, 'statusResolved');
    default:
      return status;
  }
}

export function translateUrgency(
  urgencyOrLang: Urgency | Language | string,
  langOrUrgency: Language | Urgency | string = 'en'
): string {
  const { lang, val: urgency } = resolveLangAndVal(String(urgencyOrLang), String(langOrUrgency));
  switch (urgency) {
    case 'low':
      return getTranslation(lang, 'urgencyLow');
    case 'medium':
      return getTranslation(lang, 'urgencyMedium');
    case 'high':
      return getTranslation(lang, 'urgencyHigh');
    case 'critical':
      return getTranslation(lang, 'urgencyCritical');
    default:
      return urgency;
  }
}

export function translateCategory(
  catOrLang: Category | DepartmentId | Language | string,
  langOrCat: Language | Category | DepartmentId | string = 'en'
): string {
  const { lang, val: cat } = resolveLangAndVal(String(catOrLang), String(langOrCat));
  switch (cat) {
    case 'plumbing':
      return getTranslation(lang, 'deptPlumbing');
    case 'electricity':
      return getTranslation(lang, 'deptElectricity');
    case 'cleanliness':
      return getTranslation(lang, 'deptCleanliness');
    case 'internet':
      return getTranslation(lang, 'deptInternet');
    case 'unclear':
      return lang === 'hi' ? 'अस्पष्ट' : 'Unclear';
    default:
      return cat;
  }
}

const SUBTYPE_HI_MAP: Record<string, string> = {
  'Water Supply': 'जल आपूर्ति',
  'Pipe Leakage': 'पाइप लीकेज',
  'Taps & Fittings': 'नल और फिटिंग',
  'Washroom Fixtures': 'वॉशरूम फिटिंग',
  'Drainage': 'ड्रेनेज / नाली',
  'Drinking Water': 'पेयजल कूलर',
  'Fans & Lights': 'पंखे और लाइट',
  'Switches & Sockets': 'स्विच और सॉकेट',
  'Power Supply': 'बिजली आपूर्ति / MCB',
  'Appliances': 'उपकरण (गीज़र/कूलर)',
  'Washroom Hygiene': 'वॉशरूम सफ़ाई',
  'Common Area Cleaning': 'गलियारा / सामान्य सफ़ाई',
  'Garbage Collection': 'कचरा निस्तारण',
  'Waste Disposal': 'कचरा निस्तारण',
  'Corridors': 'गलियारा सफ़ाई',
  'Pest Control': 'कीट नियंत्रण',
  'Wi-Fi Coverage': 'वाई-फ़ाई कवरेज',
  'Wi-Fi': 'वाई-फ़ाई',
  'LAN Ports': 'लैन (LAN) पोर्ट',
  'Router Hardware': 'राउटर हार्डवेयर',
  'Connectivity Drop': 'कनेक्टिविटी बाधा',
  'General': 'सामान्य',
};

export function translateSubtype(
  subtypeOrLang?: string | null,
  langOrSubtype: Language | string | null = 'en'
): string {
  if (subtypeOrLang === 'en' || subtypeOrLang === 'hi') {
    const lang = subtypeOrLang;
    const sub = langOrSubtype;
    if (!sub) return lang === 'hi' ? 'सामान्य' : 'General';
    return lang === 'hi' ? SUBTYPE_HI_MAP[sub] || sub : sub;
  }
  const lang: Language = langOrSubtype === 'hi' ? 'hi' : 'en';
  const subtype = subtypeOrLang;
  if (!subtype) return lang === 'hi' ? 'सामान्य' : 'General';
  if (lang === 'hi') {
    return SUBTYPE_HI_MAP[subtype] || subtype;
  }
  return subtype;
}

export function translateRole(
  roleOrLang: UserRole | Language | string,
  deptOrRole?: DepartmentId | UserRole | string,
  langOrDept?: Language | DepartmentId | string
): string {
  let lang: Language = 'en';
  let role: string = 'student';
  let dept: string | undefined = undefined;

  if (roleOrLang === 'en' || roleOrLang === 'hi') {
    lang = roleOrLang;
    role = String(deptOrRole || 'student');
    dept = langOrDept ? String(langOrDept) : undefined;
  } else {
    role = String(roleOrLang);
    if (deptOrRole === 'en' || deptOrRole === 'hi') {
      lang = deptOrRole;
    } else {
      dept = deptOrRole ? String(deptOrRole) : undefined;
      lang = langOrDept === 'hi' ? 'hi' : 'en';
    }
  }

  if (role === 'admin') return getTranslation(lang, 'roleAdmin');
  if (role === 'supervisor') return getTranslation(lang, 'roleSupervisor');
  if (role === 'staff') {
    const deptLabel = dept ? translateCategory(dept, lang) : '';
    return `${deptLabel} ${getTranslation(lang, 'deptStaffSuffix')}`.trim();
  }
  return getTranslation(lang, 'roleStudent');
}

export function translateHostel(
  hostelOrLang?: string,
  langOrHostel: Language | string = 'en'
): string {
  if (!hostelOrLang) return '';
  const { lang, val: hostel } = resolveLangAndVal(hostelOrLang, String(langOrHostel));
  if (!hostel) return '';
  if (lang === 'hi') {
    return hostel.replace(/^Hostel\s+/i, 'हॉस्टल ');
  }
  return hostel;
}

export function translateRoomLabel(
  roomOrLang?: string,
  langOrRoom: Language | string = 'en'
): string {
  if (!roomOrLang) return '';
  const { lang, val: room } = resolveLangAndVal(roomOrLang, String(langOrRoom));
  if (!room) return '';
  if (lang === 'hi') {
    return room
      .replace(/^Room\s+/i, 'कमरा ')
      .replace(/^Washroom$/i, 'वॉशरूम')
      .replace(/^Water Cooler$/i, 'वाटर कूलर')
      .replace(/^Common Room$/i, 'कॉमन रूम')
      .replace(/^Stairs$/i, 'सीढ़ियाँ')
      .replace(/^Electrical Panel$/i, 'इलेक्ट्रिकल पैनल')
      .replace(/^Wi-Fi Access Point$/i, 'वाई-फ़ाई एक्सेस पॉइंट');
  }
  return room;
}

export function translateSafetyFlag(
  flagOrLang: SafetyFlag | Language | string,
  langOrFlag: Language | SafetyFlag | string = 'en'
): string {
  const { lang, val: flag } = resolveLangAndVal(String(flagOrLang), String(langOrFlag));
  if (lang === 'hi') {
    switch (flag) {
      case 'water_near_electric':
        return 'बिजली के पास पानी का रिसाव';
      case 'sparks_or_burning':
        return 'चिंगारी या जलने की गंध';
      case 'exposed_wire':
        return 'खुले बिजली के तार';
      case 'flooding':
        return 'जलभराव / बाढ़';
      case 'structural':
        return 'दीवार/छत में दरार';
      default:
        return 'कोई नहीं';
    }
  }
  switch (flag) {
    case 'water_near_electric':
      return 'Water near electricity';
    case 'sparks_or_burning':
      return 'Sparks or burning';
    case 'exposed_wire':
      return 'Exposed live wire';
    case 'flooding':
      return 'Severe water flooding';
    case 'structural':
      return 'Structural damage';
    default:
      return 'None';
  }
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey | (string & {}), vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: (key, vars) => getTranslation('en', key, vars),
});

export const LanguageProvider: React.FC<{
  language?: Language;
  setLanguage?: (lang: Language) => void;
  onLanguageChange?: (lang: Language) => void;
  children: React.ReactNode;
}> = ({ language: controlledLang, setLanguage: externalSetLang, onLanguageChange, children }) => {
  const [internalLang, setInternalLang] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('campusconnect_lang');
      return saved === 'hi' ? 'hi' : 'en';
    } catch {
      return 'en';
    }
  });

  const activeLang = controlledLang ?? internalLang;

  useEffect(() => {
    try {
      localStorage.setItem('campusconnect_lang', activeLang);
      document.documentElement.lang = activeLang;
    } catch {}
  }, [activeLang]);

  const setLanguage = (next: Language) => {
    setInternalLang(next);
    try {
      localStorage.setItem('campusconnect_lang', next);
    } catch {}
    if (externalSetLang) externalSetLang(next);
    if (onLanguageChange) onLanguageChange(next);
  };

  const toggleLanguage = () => {
    setLanguage(activeLang === 'en' ? 'hi' : 'en');
  };

  const t = (key: TranslationKey | (string & {}), vars?: Record<string, string | number>) =>
    getTranslation(activeLang, key, vars);

  return React.createElement(
    LanguageContext.Provider,
    { value: { language: activeLang, setLanguage, toggleLanguage, t } },
    children
  );
};

export function useT() {
  return useContext(LanguageContext);
}
