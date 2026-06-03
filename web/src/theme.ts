/**
 * Heaveneye Design Tokens + Motion Presets
 * Phase 3.1 — Design tokens + motion presets (theme.ts)
 *
 * Usage in components:
 *   import { colors, motion, typography } from '../theme';
 *   // or reference CSS vars directly: bg-[var(--color-bg-primary)]
 */

import type { Transition } from 'motion/react';

// ─── Color Tokens ──────────────────────────────────────────

export const colors = {
  // Background layers — deep space slate
  bgPrimary:   'var(--color-bg-primary)',
  bgSecondary: 'var(--color-bg-secondary)',
  bgTertiary:  'var(--color-bg-tertiary)',

  // Surface — glass panels
  surface:      'var(--color-surface)',

  // Border
  border:       'var(--color-border)',

  // Text
  textPrimary:  'var(--color-text-primary)',
  textSecondary:'var(--color-text-secondary)',
  textMuted:    'var(--color-text-muted)',

  // Agent accent colors
  agentHermes:  'var(--color-agent-hermes)',  // blue
  agentClaude:  'var(--color-agent-claude)',  // emerald
  agentAgy:     'var(--color-agent-agy)',     // amber
} as const;

// ─── Typography ─────────────────────────────────────────────

export const typography = {
  fontSans:  'var(--font-sans)',   // Sarabun, Inter, system-ui
  fontMono:  'var(--font-mono)',   // JetBrains Mono or ui-monospace
} as const;

// ─── Spacing / Sizing Scale ─────────────────────────────────

export const spacing = {
  0:  'var(--space-0)',   // 0
  1:  'var(--space-1)',   // 0.25rem (4px)
  2:  'var(--space-2)',   // 0.5rem  (8px)
  3:  'var(--space-3)',   // 0.75rem (12px)
  4:  'var(--space-4)',   // 1rem    (16px)
  5:  'var(--space-5)',   // 1.25rem (20px)
  6:  'var(--space-6)',   // 1.5rem  (24px)
  8:  'var(--space-8)',   // 2rem    (32px)
  10: 'var(--space-10)',  // 2.5rem  (40px)
  12: 'var(--space-12)',  // 3rem    (48px)
  16: 'var(--space-16)',  // 4rem    (64px)
  20: 'var(--space-20)',  // 5rem    (80px)
  24: 'var(--space-24)',  // 6rem    (96px)
} as const;

// ─── Border Radius Scale ────────────────────────────────────

export const radius = {
  none: 'var(--radius-none)',  // 0
  sm:   'var(--radius-sm)',    // 0.25rem (4px)
  md:   'var(--radius-md)',    // 0.5rem  (8px)
  lg:   'var(--radius-lg)',    // 0.75rem (12px)
  xl:   'var(--radius-xl)',    // 1rem    (16px)
  '2xl':'var(--radius-2xl)',   // 1.5rem  (24px)
  '3xl':'var(--radius-3xl)',   // 2rem    (32px)
  full: 'var(--radius-full)',  // 9999px — pill/circle
} as const;

// ─── Shadow / Glow Presets for Glassmorphism ────────────────

export const shadows = {
  glassSurface: 'var(--glass-surface)',
  glassOverlay: 'var(--glass-overlay)',
  glassDeep:    'var(--glass-deep)',
  glassAmbient: 'var(--glass-ambient)',

  // Panel depth
  panelSm:      'var(--shadow-panel-sm)',
  panelMd:      'var(--shadow-panel-md)',
  panelLg:      'var(--shadow-panel-lg)',

  // Glow
  glowBlue:     'var(--shadow-glow-blue)',
  glowEmerald:  'var(--shadow-glow-emerald)',
  glowAmber:    'var(--shadow-glow-amber)',
} as const;

// ─── Motion Presets ─────────────────────────────────────────

/** Stiff spring — snappy, ideal for UI controls (buttons, toggles) */
export const springTransition: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
};

/** Gentle spring — loose, ideal for panel slides, page transitions */
export const gentleTransition: Transition = {
  type: 'spring',
  stiffness: 120,
  damping: 20,
};

/** Stagger config — use with MotionContext staggerChildren */
export const staggerChildren = {
  staggerChildren: 0.05,
  delayChildren: 0.1,
};

/** fadeInUp — initial hidden → animate visible with upward drift */
export const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' } as Transition,
};

/** fadeOutDown — animate out with downward drift (for exits) */
export const fadeOutDown = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 0, y: 20 },
  exit: { opacity: 0, y: 20 },
  transition: { duration: 0.25, ease: 'easeIn' } as Transition,
};

/** scaleIn — pop-in from slightly scaled down */
export const scaleIn = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.3, ease: [0.34, 1.56, 0.64, 1] } as Transition, // ease-out-back
};

// ─── CSS Variable Export ─────────────────────────────────────
// Re-export as a string map so tailwind.config.ts (if added later)
// can reference --color-*, --font-*, etc.
//
// For Tailwind 4 CSS-first config, these variables live in styles.css
// under :root and are consumed directly as CSS custom properties.
// This named export is here for any JS/TS code that needs the raw variable name.

export const cssVars = {
  colorBgPrimary:     '--color-bg-primary',
  colorBgSecondary:   '--color-bg-secondary',
  colorBgTertiary:    '--color-bg-tertiary',
  colorSurface:       '--color-surface',
  colorBorder:        '--color-border',
  colorTextPrimary:   '--color-text-primary',
  colorTextSecondary: '--color-text-secondary',
  colorTextMuted:     '--color-text-muted',
  colorAgentHermes:   '--color-agent-hermes',
  colorAgentClaude:   '--color-agent-claude',
  colorAgentAgy:      '--color-agent-agy',
  fontSans:           '--font-sans',
  fontMono:           '--font-mono',
  spaceBase:          '--space-base',
  radiusBase:         '--radius-base',
} as const;