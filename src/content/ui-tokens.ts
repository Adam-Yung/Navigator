export const UI = {
  colors: {
    bg: 'rgba(15, 15, 30, 0.92)',
    bgSolid: '#0f0f1e',
    border: 'rgba(100, 80, 255, 0.2)',
    borderHover: 'rgba(100, 80, 255, 0.4)',
    text: '#e4e4ef',
    textMuted: '#9999b8',
    textDim: '#7a7a9a',
    accent: 'hsl(250, 80%, 65%)',
    accentDim: 'hsla(250, 80%, 65%, 0.2)',
    accentGlow: 'hsla(250, 80%, 65%, 0.4)',
    danger: '#ff6b6b',
    success: '#4ade80',
  },
  radius: {
    panel: '12px',
    item: '8px',
    badge: '4px',
    pill: '999px',
  },
  shadow: {
    panel: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px rgba(100, 80, 255, 0.3)',
    subtle: '0 2px 8px rgba(0, 0, 0, 0.3)',
    glow: '0 0 12px rgba(100, 80, 255, 0.2)',
  },
  backdrop: 'blur(20px)',
  font: {
    base: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    mono: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace",
    sizeXs: '10px',
    sizeSm: '11px',
    sizeMd: '13px',
    sizeLg: '15px',
  },
  anim: {
    entryDuration: '150ms',
    exitDuration: '100ms',
    easeFastOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
    easeSmooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
    easeSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  zIndex: {
    overlay: 2147483640,
    labels: 2147483642,
    ring: 2147483644,
    panel: 2147483645,
    indicator: 2147483647,
  },
} as const;

export type UITokens = typeof UI;

export function panelStyles(): string {
  return `
    background: ${UI.colors.bg};
    border: 1px solid ${UI.colors.border};
    border-radius: ${UI.radius.panel};
    backdrop-filter: ${UI.backdrop};
    box-shadow: ${UI.shadow.panel};
    color: ${UI.colors.text};
    font-family: ${UI.font.base};
    font-size: ${UI.font.sizeMd};
  `;
}

export function entryAnimation(): string {
  return `
    opacity: 0;
    transform: scale(0.95) translateY(4px);
    transition: opacity ${UI.anim.entryDuration} ${UI.anim.easeFastOut},
                transform ${UI.anim.entryDuration} ${UI.anim.easeFastOut};
  `;
}

export function entryAnimationActive(): string {
  return `
    opacity: 1;
    transform: scale(1) translateY(0);
  `;
}

export function exitAnimation(): string {
  return `
    opacity: 0;
    transform: scale(0.97);
    transition: opacity ${UI.anim.exitDuration} ease-out,
                transform ${UI.anim.exitDuration} ease-out;
  `;
}

export function keycapStyles(): string {
  return `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    background: ${UI.colors.accentDim};
    border: 1px solid ${UI.colors.border};
    border-radius: ${UI.radius.badge};
    font-family: ${UI.font.mono};
    font-size: ${UI.font.sizeXs};
    font-weight: 600;
    color: ${UI.colors.text};
    line-height: 1;
  `;
}

export function reducedMotionStyles(): string {
  return `
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 50ms !important;
        scroll-behavior: auto !important;
      }
    }
  `;
}
