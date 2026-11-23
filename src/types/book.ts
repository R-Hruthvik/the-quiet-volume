export type CoverMaterial =
  | 'linen'
  | 'paperboard'
  | 'aged-cloth'
  | 'notebook-card'
  | 'library-cloth'
  | 'minimal-leather';

export type EndpaperPattern =
  | 'botanical-grid'
  | 'marbled-wave'
  | 'linen-weave'
  | 'fine-dots'
  | 'architectural-lines';

export type TitleTreatment = 'paper-label' | 'embossed' | 'stamped';

export type ColophonSymbol =
  | 'leaf'
  | 'sunburst'
  | 'diamond'
  | 'crescent'
  | 'compass'
  | 'fleuron'
  | 'waves'
  | 'frame';

export interface BookIdentity {
  coverColor: string;
  spineColor: string;
  ribbonColor: string;
  coverMaterial: CoverMaterial;
  endpaperPattern: EndpaperPattern;
  titleTreatment: TitleTreatment;
  symbol: ColophonSymbol;
  inkOnCover: string;
}

export type BlockKind =
  | 'chapter-title'
  | 'heading'
  | 'paragraph'
  | 'quote'
  | 'code'
  | 'scene-break'
  | 'source-note';

export interface BookBlock {
  id: string;
  kind: BlockKind;
  text: string;
  sectionIndex: number;
  dropCap?: boolean;
  technical?: boolean;
}

export interface BookSection {
  index: number;
  title: string;
  sourceFile?: string;
  sourceDate?: string;
  startBlockIndex: number;
}

export interface SourceFileMeta {
  name: string;
  size: number;
  type: string;
  lastModified?: number;
}

export interface MarginNote {
  id: string;
  blockId: string;
  text: string;
  createdAt: number;
  folded?: boolean;
}

export type HighlightKind = 'pencil' | 'red-pencil' | 'ink-wash' | 'bracket' | 'highlighter';

export interface BlockHighlight {
  blockId: string;
  kind: HighlightKind;
}

export interface BookVolume {
  id: string;
  title: string;
  author?: string;
  subtitle?: string;
  isCollection: boolean;
  sourceFiles: SourceFileMeta[];
  sections: BookSection[];
  blocks: BookBlock[];
  identity: BookIdentity;
  createdAt: number;
  lastOpenedAt: number;
  lastPageIndex: number;
  lastBlockId?: string;
  dogEaredPages: number[];
  notes: MarginNote[];
  highlights: Record<string, HighlightKind>;
  finishedAt?: number;
  finalThought?: string;
  wearCount: number;
  ocrNote?: string;
  isStarter?: boolean;
}

export type PageKind =
  | 'front-bookplate'
  | 'title-page'
  | 'toc'
  | 'blank-verso'
  | 'content'
  | 'endpaper';

export interface TocEntry {
  sectionIndex: number;
  title: string;
  pageNumber: number;
  sourceFile?: string;
}

export interface PaginatedPage {
  index: number;
  displayNumber: number | null; // Roman or arabic page number shown in outer corner
  kind: PageKind;
  sectionIndex?: number;
  sectionTitle?: string;
  blocks?: BookBlock[];
  tocEntries?: TocEntry[];
  wordCount: number;
}

export type WritingHand = 'kalam' | 'patrick' | 'caveat' | 'serif';
export type WritingSize = 'small' | 'compact' | 'natural' | 'comfortable' | 'large';
export type PageSpacing = 'close' | 'natural' | 'airy';
export type PageMode = 'single' | 'two-page';
export type PageFormat = 'notebook' | 'novel';
export type PaperRuling = 'plain' | 'lined' | 'margin-lined' | 'dot-grid' | 'graph';
export type BookSizeId =
  | 'a5-notebook'
  | 'b5-composition'
  | 'a4-folio'
  | 'pocket-a6'
  | 'trade-paperback'
  | 'uk-b-format';
export type PaperStock =
  | 'white-cotton'
  | 'warm-notebook'
  | 'cream-book'
  | 'recycled-grey'
  | 'high-contrast'
  | 'dark-charcoal';
export type LightingMode = 'daylight' | 'overcast' | 'warm-lamp' | 'night-light' | 'moonlit';
export type EnvironmentSurface =
  | 'wooden-table'
  | 'linen-surface'
  | 'bedside-table'
  | 'clear-desk'
  | 'dark-space';

export type TTSProvider = 'deepgram' | 'elevenlabs' | 'webspeech';
export type TTSAudioMode = 'recorded' | 'live';

export interface TTSVoiceOption {
  id: string;
  provider: TTSProvider;
  voice: string;
  name: string;
  gender: 'Female' | 'Male' | 'Neutral';
  style: string;
  costCategory: 'Ultra-Cheap (Primary)' | 'Cost-Effective' | 'High-Fidelity' | 'Device Default';
  allowanceInfo: string;
  previewUrl: string;
  description: string;
}

export interface ReaderSettings {
  pageMode: PageMode;
  pageFormat: PageFormat;
  paperRuling: PaperRuling;
  bookSize: BookSizeId;
  cameraZoom: number;
  cameraTilt: number;
  writingHand: WritingHand;
  writingSize: WritingSize;
  pageSpacing: PageSpacing;
  fineLineHeight?: number;
  fineMarginScale?: number;
  paper: PaperStock;
  lighting: LightingMode;
  autoLighting: boolean;
  environment: EnvironmentSurface;
  reducedMotion: boolean;
  reducedTexture: boolean;
  soundEnabled: boolean;
  useColoredRibbons: boolean;
  restReminderEnabled: boolean;
  ttsProvider?: TTSProvider;
  ttsVoice?: string;
  ttsSpeed?: number;
  ttsAudioMode?: TTSAudioMode;
}

export interface SearchResult {
  pageIndex: number;
  displayNumber: number;
  blockId: string;
  snippet: string;
  matchText: string;
}
