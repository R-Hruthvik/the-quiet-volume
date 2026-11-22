import type { EnvironmentSurface, LightingMode, PaperStock } from '../types/book';

export interface PaperSpec {
  id: PaperStock;
  label: string;
  pageBg: string;
  pageLeftTint: string;
  pageRightTint: string;
  pageEdge: string;
  pageEdgeDark: string;
  ink: string;
  mutedInk: string;
  pencilInk: string;
  gutterShadow: string;
  isDarkPaper: boolean;
}

export const PAPER_STOCKS: Record<PaperStock, PaperSpec> = {
  'white-cotton': {
    id: 'white-cotton',
    label: 'White cotton',
    pageBg: '#F9F7F2',
    pageLeftTint: '#F4F1EA',
    pageRightTint: '#FAF8F3',
    pageEdge: '#E8E3D8',
    pageEdgeDark: '#CFC7B8',
    ink: '#241F1A',
    mutedInk: '#645B50',
    pencilInk: '#786E62',
    gutterShadow: 'rgba(42, 34, 24, 0.14)',
    isDarkPaper: false,
  },
  'warm-notebook': {
    id: 'warm-notebook',
    label: 'Warm notebook',
    pageBg: '#F5EFE2',
    pageLeftTint: '#EFE8D8',
    pageRightTint: '#F7F1E5',
    pageEdge: '#E1D7C3',
    pageEdgeDark: '#C4B79E',
    ink: '#2A221B',
    mutedInk: '#695C4E',
    pencilInk: '#7C6E5E',
    gutterShadow: 'rgba(54, 41, 25, 0.16)',
    isDarkPaper: false,
  },
  'cream-book': {
    id: 'cream-book',
    label: 'Cream book paper',
    pageBg: '#F1E9D7',
    pageLeftTint: '#EAE0CC',
    pageRightTint: '#F3EBDA',
    pageEdge: '#DCD1BA',
    pageEdgeDark: '#BEB195',
    ink: '#292118',
    mutedInk: '#66594A',
    pencilInk: '#7A6C59',
    gutterShadow: 'rgba(58, 42, 24, 0.18)',
    isDarkPaper: false,
  },
  'recycled-grey': {
    id: 'recycled-grey',
    label: 'Recycled grey',
    pageBg: '#E7E6E1',
    pageLeftTint: '#E0DFD9',
    pageRightTint: '#EAE9E4',
    pageEdge: '#D2D0C9',
    pageEdgeDark: '#B3B0A7',
    ink: '#222220',
    mutedInk: '#595853',
    pencilInk: '#6A6963',
    gutterShadow: 'rgba(26, 26, 24, 0.16)',
    isDarkPaper: false,
  },
  'high-contrast': {
    id: 'high-contrast',
    label: 'High-contrast white',
    pageBg: '#FFFFFF',
    pageLeftTint: '#FCFCFC',
    pageRightTint: '#FFFFFF',
    pageEdge: '#E8E8E6',
    pageEdgeDark: '#CCCCCC',
    ink: '#111111',
    mutedInk: '#454545',
    pencilInk: '#555555',
    gutterShadow: 'rgba(0, 0, 0, 0.12)',
    isDarkPaper: false,
  },
  'dark-charcoal': {
    id: 'dark-charcoal',
    label: 'Dark charcoal paper',
    pageBg: '#232325',
    pageLeftTint: '#1F1F21',
    pageRightTint: '#252527',
    pageEdge: '#18181A',
    pageEdgeDark: '#101012',
    ink: '#E6E1D7',
    mutedInk: '#A8A196',
    pencilInk: '#9C9488',
    gutterShadow: 'rgba(0, 0, 0, 0.45)',
    isDarkPaper: true,
  },
};

export interface LightingSpec {
  id: LightingMode;
  label: string;
  shortLabel: string;
  symbol: string;
  pageFilter: string;
  roomOverlay: string;
  bookShadow: string;
  gutterOpacity: number;
  ambientGlow: string;
  tableInk: string;
  isDim: boolean;
}

export const LIGHTING_MODES: Record<LightingMode, LightingSpec> = {
  daylight: {
    id: 'daylight',
    label: 'Daylight',
    shortLabel: 'day',
    symbol: '☀',
    pageFilter: 'brightness(1.01) contrast(1)',
    roomOverlay:
      'linear-gradient(118deg, rgba(255, 253, 248, 0.24) 0%, rgba(255, 255, 255, 0.04) 48%, rgba(28, 26, 22, 0.14) 100%)',
    bookShadow:
      '14px 24px 48px -10px rgba(24, 19, 14, 0.36), 4px 8px 18px -4px rgba(24, 19, 14, 0.22)',
    gutterOpacity: 0.9,
    ambientGlow: 'radial-gradient(ellipse at 25% 20%, rgba(255, 254, 250, 0.22), transparent 62%)',
    tableInk: '#F4EFE6',
    isDim: false,
  },
  overcast: {
    id: 'overcast',
    label: 'Overcast daylight',
    shortLabel: 'overcast',
    symbol: '◐',
    pageFilter: 'brightness(0.97) saturate(0.92)',
    roomOverlay: 'rgba(218, 221, 224, 0.22)',
    bookShadow:
      '0px 14px 34px -10px rgba(22, 24, 28, 0.22), 0px 4px 12px -4px rgba(22, 24, 28, 0.14)',
    gutterOpacity: 0.65,
    ambientGlow: 'radial-gradient(ellipse at 50% 45%, rgba(235, 238, 240, 0.14), transparent 70%)',
    tableInk: '#F0EFEA',
    isDim: false,
  },
  'warm-lamp': {
    id: 'warm-lamp',
    label: 'Warm lamp',
    shortLabel: 'lamp',
    symbol: '●',
    pageFilter: 'brightness(0.94) sepia(0.14) saturate(1.04)',
    roomOverlay:
      'radial-gradient(ellipse 64% 62% at 50% 54%, rgba(255, 214, 152, 0.14) 0%, rgba(36, 25, 16, 0.42) 58%, rgba(15, 11, 8, 0.78) 100%)',
    bookShadow:
      '0px 26px 56px -6px rgba(10, 7, 4, 0.62), 0px 8px 20px -2px rgba(10, 7, 4, 0.42)',
    gutterOpacity: 1.25,
    ambientGlow:
      'radial-gradient(ellipse 52% 48% at 50% 52%, rgba(255, 212, 148, 0.14), transparent 70%)',
    tableInk: '#EADDC8',
    isDim: true,
  },
  'night-light': {
    id: 'night-light',
    label: 'Night light',
    shortLabel: 'night',
    symbol: '☾',
    pageFilter: 'brightness(0.76) sepia(0.18) contrast(0.96)',
    roomOverlay:
      'radial-gradient(ellipse 68% 64% at 50% 52%, rgba(42, 32, 24, 0.48) 0%, rgba(16, 13, 11, 0.86) 65%, rgba(9, 8, 7, 0.94) 100%)',
    bookShadow: '0px 24px 60px -6px rgba(0, 0, 0, 0.76), 0px 6px 18px rgba(0, 0, 0, 0.5)',
    gutterOpacity: 1.15,
    ambientGlow:
      'radial-gradient(ellipse 46% 44% at 50% 52%, rgba(210, 162, 108, 0.08), transparent 72%)',
    tableInk: '#D7CBB8',
    isDim: true,
  },
  moonlit: {
    id: 'moonlit',
    label: 'Moonlit reading',
    shortLabel: 'moonlit',
    symbol: '✦',
    pageFilter: 'brightness(0.78) saturate(0.72) hue-rotate(8deg) contrast(0.95)',
    roomOverlay:
      'radial-gradient(ellipse 68% 65% at 50% 48%, rgba(46, 62, 82, 0.36) 0%, rgba(14, 19, 28, 0.82) 64%, rgba(8, 12, 18, 0.92) 100%)',
    bookShadow:
      '0px 22px 54px -8px rgba(4, 8, 16, 0.72), -10px 8px 24px -6px rgba(140, 170, 210, 0.12)',
    gutterOpacity: 1.1,
    ambientGlow:
      'radial-gradient(ellipse 50% 45% at 38% 35%, rgba(188, 212, 242, 0.11), transparent 70%)',
    tableInk: '#CFD9E6',
    isDim: true,
  },
};

export const LIGHTING_ORDER: LightingMode[] = [
  'daylight',
  'overcast',
  'warm-lamp',
  'night-light',
  'moonlit',
];

export interface EnvironmentSpec {
  id: EnvironmentSurface;
  label: string;
  imageUrl?: string;
  imagePosition?: string;
  imageScale?: string;
  fallbackBg: string;
  className?: string;
  isDarkSurface: boolean;
}

export const ENVIRONMENTS: Record<EnvironmentSurface, EnvironmentSpec> = {
  'wooden-table': {
    id: 'wooden-table',
    label: 'Wooden table',
    imageUrl: '/src/assets/images/desk_walnut_surface_1795182290881.jpg',
    imagePosition: '54% 50%',
    imageScale: 'scale-[1.32]',
    fallbackBg:
      'linear-gradient(160deg, #6E5641 0%, #584331 52%, #473526 100%)',
    isDarkSurface: true,
  },
  'linen-surface': {
    id: 'linen-surface',
    label: 'Linen surface',
    fallbackBg: '#DCD5C9',
    className: 'texture-linen-table',
    isDarkSurface: false,
  },
  'bedside-table': {
    id: 'bedside-table',
    label: 'Bedside table',
    imageUrl: '/src/assets/images/desk_bedside_surface_1795182236540.jpg',
    imagePosition: '28% 50%',
    imageScale: 'scale-[1.34]',
    fallbackBg: 'linear-gradient(155deg, #27211D 0%, #1C1714 58%, #14100E 100%)',
    isDarkSurface: true,
  },
  'clear-desk': {
    id: 'clear-desk',
    label: 'Clear desk',
    fallbackBg: 'linear-gradient(165deg, #E4E1DA 0%, #D9D5CD 100%)',
    isDarkSurface: false,
  },
  'dark-space': {
    id: 'dark-space',
    label: 'Dark empty space',
    fallbackBg: 'radial-gradient(circle at 50% 48%, #222327 0%, #141518 75%)',
    isDarkSurface: true,
  },
};

export function resolveLightingForHour(hour: number): LightingMode {
  if (hour >= 7 && hour < 15) return 'daylight';
  if (hour >= 15 && hour < 18) return 'overcast';
  if (hour >= 18 && hour < 22) return 'warm-lamp';
  return 'night-light';
}

export function getEffectiveLighting(
  configured: LightingMode,
  autoLighting: boolean,
  date: Date = new Date()
): LightingMode {
  if (!autoLighting) return configured;
  return resolveLightingForHour(date.getHours());
}
