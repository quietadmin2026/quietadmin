// Lightweight i18n for QuietAdmin.
//
// Mirrors the module-level "active currency" pattern in App.jsx: the app calls
// setActiveLanguage(settings.language) during render, and every t() below reads
// the active dictionary. Missing keys fall back to English, then to the key
// itself, so a half-translated string never renders blank.
//
// Phase 1 covers the app shell (navigation, top bar, Drive status, the language
// picker). Further screens and the client-facing documents are added key by key.

export const LANGUAGES = [
  ['en', 'English'],
  ['es', 'Español'],
  ['pt', 'Português'],
  ['de', 'Deutsch'],
];

// Locale used for date/time formatting per language (English keeps en-IN, the
// app's existing default).
const LOCALE_BY_LANGUAGE = { en: 'en-IN', es: 'es-ES', pt: 'pt-BR', de: 'de-DE' };

const translations = {
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.schedule': 'Schedule',
    'nav.clients': 'Clients',
    'nav.groups': 'Groups',
    'nav.payments': 'Payments',
    'nav.statements': 'Statements',
    'nav.reports': 'Reports',
    'nav.settings': 'Settings',
    'greeting.morning': 'Good Morning',
    'greeting.afternoon': 'Good Afternoon',
    'greeting.evening': 'Good Evening',
    'drive.syncing': 'Syncing…',
    'drive.synced': 'Synced',
    'drive.syncedAt': 'Synced {time}',
    'drive.signIn': 'Sign in to sync',
    'drive.signInTitle': 'Sign in to sync with Google Drive',
    'drive.signOut': 'Sign out',
    'sidebar.driveShape': 'Google Drive shape',
    'settings.language': 'Language',
  },
  es: {
    'nav.dashboard': 'Panel',
    'nav.schedule': 'Agenda',
    'nav.clients': 'Clientes',
    'nav.groups': 'Grupos',
    'nav.payments': 'Pagos',
    'nav.statements': 'Estados de cuenta',
    'nav.reports': 'Informes',
    'nav.settings': 'Ajustes',
    'greeting.morning': 'Buenos días',
    'greeting.afternoon': 'Buenas tardes',
    'greeting.evening': 'Buenas noches',
    'drive.syncing': 'Sincronizando…',
    'drive.synced': 'Sincronizado',
    'drive.syncedAt': 'Sincronizado {time}',
    'drive.signIn': 'Iniciar sesión para sincronizar',
    'drive.signInTitle': 'Inicia sesión para sincronizar con Google Drive',
    'drive.signOut': 'Cerrar sesión',
    'sidebar.driveShape': 'Estructura de Google Drive',
    'settings.language': 'Idioma',
  },
  pt: {
    'nav.dashboard': 'Painel',
    'nav.schedule': 'Agenda',
    'nav.clients': 'Clientes',
    'nav.groups': 'Grupos',
    'nav.payments': 'Pagamentos',
    'nav.statements': 'Extratos',
    'nav.reports': 'Relatórios',
    'nav.settings': 'Configurações',
    'greeting.morning': 'Bom dia',
    'greeting.afternoon': 'Boa tarde',
    'greeting.evening': 'Boa noite',
    'drive.syncing': 'Sincronizando…',
    'drive.synced': 'Sincronizado',
    'drive.syncedAt': 'Sincronizado {time}',
    'drive.signIn': 'Entrar para sincronizar',
    'drive.signInTitle': 'Entre para sincronizar com o Google Drive',
    'drive.signOut': 'Sair',
    'sidebar.driveShape': 'Estrutura do Google Drive',
    'settings.language': 'Idioma',
  },
  de: {
    'nav.dashboard': 'Übersicht',
    'nav.schedule': 'Kalender',
    'nav.clients': 'Klienten',
    'nav.groups': 'Gruppen',
    'nav.payments': 'Zahlungen',
    'nav.statements': 'Abrechnungen',
    'nav.reports': 'Berichte',
    'nav.settings': 'Einstellungen',
    'greeting.morning': 'Guten Morgen',
    'greeting.afternoon': 'Guten Tag',
    'greeting.evening': 'Guten Abend',
    'drive.syncing': 'Synchronisiere…',
    'drive.synced': 'Synchronisiert',
    'drive.syncedAt': 'Synchronisiert {time}',
    'drive.signIn': 'Zum Synchronisieren anmelden',
    'drive.signInTitle': 'Zum Synchronisieren mit Google Drive anmelden',
    'drive.signOut': 'Abmelden',
    'sidebar.driveShape': 'Google-Drive-Struktur',
    'settings.language': 'Sprache',
  },
};

let activeLanguage = 'en';

// Called during render from settings.language so every t() below reflects the
// therapist's chosen language.
export function setActiveLanguage(code) {
  activeLanguage = translations[code] ? code : 'en';
}

export function currentLanguage() {
  return activeLanguage;
}

export function localeForLanguage(code = activeLanguage) {
  return LOCALE_BY_LANGUAGE[code] || 'en-IN';
}

// Translate a key, interpolating {name} placeholders from vars. Falls back to
// English, then to the key itself.
export function t(key, vars) {
  const dict = translations[activeLanguage] || translations.en;
  let str = dict[key];
  if (str == null) str = translations.en[key];
  if (str == null) return key;
  if (vars) {
    for (const name of Object.keys(vars)) {
      str = str.split(`{${name}}`).join(String(vars[name]));
    }
  }
  return str;
}
