import type {
  BookIdentity,
  ColophonSymbol,
  CoverMaterial,
  EndpaperPattern,
  TitleTreatment,
} from '../types/book';

export interface CoverSwatch {
  id: string;
  name: string;
  coverColor: string;
  spineColor: string;
  inkOnCover: string;
  defaultRibbon: string;
}

export const COVER_SWATCHES: CoverSwatch[] = [
  {
    id: 'forest-linen',
    name: 'Deep forest',
    coverColor: '#2B3D34',
    spineColor: '#202E27',
    inkOnCover: '#ECE6DA',
    defaultRibbon: '#B87654',
  },
  {
    id: 'charcoal-cloth',
    name: 'Soft charcoal',
    coverColor: '#323539',
    spineColor: '#25272B',
    inkOnCover: '#EFECE6',
    defaultRibbon: '#9B4D46',
  },
  {
    id: 'oxblood-cloth',
    name: 'Muted oxblood',
    coverColor: '#5B3435',
    spineColor: '#452526',
    inkOnCover: '#F2EBE0',
    defaultRibbon: '#C9A86A',
  },
  {
    id: 'indigo-library',
    name: 'Library indigo',
    coverColor: '#2C3A4B',
    spineColor: '#1F2A37',
    inkOnCover: '#EDEAE2',
    defaultRibbon: '#C28B5B',
  },
  {
    id: 'warm-umber',
    name: 'Warm umber',
    coverColor: '#524438',
    spineColor: '#3D3229',
    inkOnCover: '#F1EAE0',
    defaultRibbon: '#5C7B6B',
  },
  {
    id: 'sage-board',
    name: 'Sage paperboard',
    coverColor: '#5A675D',
    spineColor: '#445047',
    inkOnCover: '#F4F1E9',
    defaultRibbon: '#8E4B42',
  },
  {
    id: 'oatmeal-linen',
    name: 'Natural linen',
    coverColor: '#C5BBA8',
    spineColor: '#AFA38E',
    inkOnCover: '#2D2722',
    defaultRibbon: '#4A5F52',
  },
  {
    id: 'slate-blue',
    name: 'Rain slate',
    coverColor: '#475560',
    spineColor: '#344049',
    inkOnCover: '#F0EEE9',
    defaultRibbon: '#B97B56',
  },
];

export const RIBBON_COLORS: { id: string; name: string; color: string }[] = [
  { id: 'terracotta', name: 'Burnt clay', color: '#B06A4B' },
  { id: 'crimson', name: 'Claret silk', color: '#8F3F40' },
  { id: 'ochre', name: 'Warm ochre', color: '#BE9656' },
  { id: 'moss', name: 'Quiet moss', color: '#536D5A' },
  { id: 'slate', name: 'Dusk slate', color: '#526576' },
  { id: 'plum', name: 'Dried plum', color: '#6E4B5C' },
];

export const COVER_MATERIALS: { id: CoverMaterial; label: string }[] = [
  { id: 'linen', label: 'Woven linen' },
  { id: 'paperboard', label: 'Soft paperboard' },
  { id: 'aged-cloth', label: 'Aged cloth' },
  { id: 'notebook-card', label: 'Smooth card' },
  { id: 'library-cloth', label: 'Library cloth' },
  { id: 'minimal-leather', label: 'Matte leather' },
];

export const ENDPAPER_PATTERNS: { id: EndpaperPattern; label: string }[] = [
  { id: 'botanical-grid', label: 'Botanical grid' },
  { id: 'marbled-wave', label: 'Quiet wave' },
  { id: 'linen-weave', label: 'Fine weave' },
  { id: 'fine-dots', label: 'Pin dots' },
  { id: 'architectural-lines', label: 'Ruled lines' },
];

const TITLE_TREATMENTS: TitleTreatment[] = ['paper-label', 'embossed', 'stamped'];

const SYMBOLS: ColophonSymbol[] = [
  'leaf',
  'sunburst',
  'diamond',
  'crescent',
  'compass',
  'fleuron',
  'waves',
  'frame',
];

/**
 * Deterministic FNV-1a 32-bit hash for reproducible book physical identities.
 */
export function hashTitle(input: string): number {
  const normalized = input.trim().toLowerCase() || 'untitled volume';
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function generateBookIdentity(title: string): BookIdentity {
  const normalized = title.trim().toLowerCase() || 'untitled volume';
  const h1 = hashTitle(normalized);
  const h2 = hashTitle(`${normalized}::material`);
  const h3 = hashTitle(`${normalized}::detail`);

  const swatch = COVER_SWATCHES[h1 % COVER_SWATCHES.length];
  const material = COVER_MATERIALS[h2 % COVER_MATERIALS.length].id;
  const endpaper = ENDPAPER_PATTERNS[(h2 >>> 4) % ENDPAPER_PATTERNS.length].id;
  const treatment = TITLE_TREATMENTS[h3 % TITLE_TREATMENTS.length];
  const symbol = SYMBOLS[(h3 >>> 3) % SYMBOLS.length];
  const ribbonColor =
    h1 % 3 === 0 ? swatch.defaultRibbon : RIBBON_COLORS[(h1 >>> 5) % RIBBON_COLORS.length].color;

  return {
    coverColor: swatch.coverColor,
    spineColor: swatch.spineColor,
    ribbonColor,
    coverMaterial: material,
    endpaperPattern: endpaper,
    titleTreatment: treatment,
    symbol,
    inkOnCover: swatch.inkOnCover,
  };
}

export function getCoverMaterialClass(material: CoverMaterial): string {
  switch (material) {
    case 'linen':
    case 'library-cloth':
      return 'texture-cover-linen';
    case 'aged-cloth':
      return 'texture-cover-aged';
    case 'paperboard':
    case 'notebook-card':
      return 'texture-cover-paperboard';
    case 'minimal-leather':
      return 'texture-cover-leather';
  }
}
