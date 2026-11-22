import type { ColophonSymbol, EndpaperPattern } from '../types/book';

export function ColophonMark({
  symbol,
  color = 'currentColor',
  size = 20,
  className = '',
}: {
  symbol: ColophonSymbol;
  color?: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {symbol === 'leaf' && (
        <>
          <path d="M5 19C6 11 11 6 19 5C18 13 13 18 5 19Z" />
          <path d="M5 19L14 10" />
        </>
      )}
      {symbol === 'sunburst' && (
        <>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 3V5.5M12 18.5V21M3 12H5.5M18.5 12H21M5.6 5.6L7.4 7.4M16.6 16.6L18.4 18.4M18.4 5.6L16.6 7.4M7.4 16.6L5.6 18.4" />
        </>
      )}
      {symbol === 'diamond' && (
        <>
          <path d="M12 3L20 12L12 21L4 12L12 3Z" />
          <path d="M12 7.5L15.8 12L12 16.5L8.2 12L12 7.5Z" />
        </>
      )}
      {symbol === 'crescent' && (
        <path d="M16.5 16.5A7 7 0 1 1 11.2 5.2A5.5 5.5 0 0 0 16.5 16.5Z" />
      )}
      {symbol === 'compass' && (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4V20M4 12H20" strokeOpacity="0.45" />
          <path d="M12 7L14 12L12 17L10 12L12 7Z" />
        </>
      )}
      {symbol === 'fleuron' && (
        <>
          <path d="M12 5C9.5 7.5 9.5 10.5 12 12C14.5 10.5 14.5 7.5 12 5Z" />
          <path d="M12 19C9.5 16.5 9.5 13.5 12 12C14.5 13.5 14.5 16.5 12 19Z" />
          <path d="M5 12C7.5 9.5 10.5 9.5 12 12C10.5 14.5 7.5 14.5 5 12Z" />
          <path d="M19 12C16.5 9.5 13.5 9.5 12 12C13.5 14.5 16.5 14.5 19 12Z" />
        </>
      )}
      {symbol === 'waves' && (
        <>
          <path d="M4 9C6.5 7 9.5 7 12 9C14.5 11 17.5 11 20 9" />
          <path d="M4 15C6.5 13 9.5 13 12 15C14.5 17 17.5 17 20 15" />
        </>
      )}
      {symbol === 'frame' && (
        <>
          <rect x="5" y="5" width="14" height="14" rx="1" />
          <rect x="8.5" y="8.5" width="7" height="7" />
        </>
      )}
    </svg>
  );
}

export function getEndpaperBackgroundStyle(
  pattern: EndpaperPattern,
  tintColor: string,
  reducedTexture: boolean
): React.CSSProperties {
  if (reducedTexture) {
    return {};
  }
  const stroke = `${tintColor}26`;
  switch (pattern) {
    case 'botanical-grid':
      return {
        backgroundImage: `radial-gradient(${stroke} 1.2px, transparent 1.2px), linear-gradient(to right, ${tintColor}12 1px, transparent 1px), linear-gradient(to bottom, ${tintColor}12 1px, transparent 1px)`,
        backgroundSize: '28px 28px',
      };
    case 'marbled-wave':
      return {
        backgroundImage: `repeating-radial-gradient(circle at 0 0, transparent 0, transparent 18px, ${tintColor}14 19px, transparent 20px)`,
        backgroundSize: '42px 42px',
      };
    case 'linen-weave':
      return {
        backgroundImage: `repeating-linear-gradient(0deg, ${tintColor}12 0 1px, transparent 1px 6px), repeating-linear-gradient(90deg, ${tintColor}12 0 1px, transparent 1px 6px)`,
      };
    case 'fine-dots':
      return {
        backgroundImage: `radial-gradient(${stroke} 1px, transparent 1px)`,
        backgroundSize: '14px 14px',
      };
    case 'architectural-lines':
      return {
        backgroundImage: `repeating-linear-gradient(135deg, ${tintColor}14 0 1px, transparent 1px 16px)`,
      };
  }
}
