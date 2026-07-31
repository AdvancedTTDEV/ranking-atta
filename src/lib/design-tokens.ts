/**
 * Design tokens — the single source of truth for the app's visual language.
 * Use these constants in inline styles, recharts palettes, and any place
 * where Tailwind classes don't apply (e.g. SVG fills, canvas, libs).
 *
 * For Tailwind classes, prefer the semantic utilities defined in
 * `globals.css` (e.g. `bg-canvas`, `text-fg`, `border-line`).
 */

export const colors = {
    // Brand
    brand: '#3B82F6',         // blue-500
    brandStrong: '#2563EB',   // blue-600
    brandSoft: '#1E3A8A',     // blue-900

    // Neutrals
    canvas: '#0B1120',        // slate-950
    surface: '#111827',       // gray-900
    surface2: '#1F2937',      // gray-800
    subtle: '#1E293B',        // slate-800
    line: '#1E293B',          // slate-800 (border sutil)
    lineStrong: '#334155',    // slate-700
    muted: '#64748B',         // slate-500
    fg: '#F1F5F9',            // slate-100
    fgMuted: '#94A3B8',       // slate-400

    // Semantic
    success: '#10B981',       // emerald-500
    successSoft: '#064E3B',   // emerald-900
    danger: '#F43F5E',        // rose-500
    dangerSoft: '#881337',    // rose-900
    warning: '#F59E0B',       // amber-500
    warningSoft: '#78350F',   // amber-900
    info: '#38BDF8',          // sky-400
    infoSoft: '#0C4A6E',      // sky-900
} as const

/** Light-mode tokens — used when the user toggles to light. */
export const lightColors = {
    brand: '#2563EB',
    brandStrong: '#1D4ED8',
    brandSoft: '#EFF6FF',

    canvas: '#F8FAFC',
    surface: '#FFFFFF',
    surface2: '#F8FAFC',
    subtle: '#F1F5F9',
    line: '#E2E8F0',
    lineStrong: '#CBD5E1',
    muted: '#94A3B8',
    fg: '#0F172A',
    fgMuted: '#475569',

    success: '#059669',
    successSoft: '#ECFDF5',
    danger: '#E11D48',
    dangerSoft: '#FFF1F2',
    warning: '#D97706',
    warningSoft: '#FFFBEB',
    info: '#0EA5E9',
    infoSoft: '#F0F9FF',
} as const

/**
 * @deprecated `darkColors` is preserved for backward compatibility — but
 * the default theme is now dark, so prefer `colors`.
 */
export const darkColors = {
    brand: '#3B82F6',
    brandStrong: '#2563EB',
    brandSoft: '#1E3A8A',

    canvas: '#0B1120',
    surface: '#111827',
    surface2: '#1F2937',
    subtle: '#1E293B',
    line: '#1E293B',
    lineStrong: '#334155',
    muted: '#64748B',
    fg: '#F1F5F9',
    fgMuted: '#94A3B8',

    success: '#10B981',
    successSoft: '#064E3B',
    danger: '#F43F5E',
    dangerSoft: '#881337',
    warning: '#F59E0B',
    warningSoft: '#78350F',
    info: '#38BDF8',
    infoSoft: '#0C4A6E',
} as const

export const radii = {
    sm: 'rounded-md',
    md: 'rounded-lg',
    lg: 'rounded-xl',
    xl: 'rounded-2xl',
    full: 'rounded-full',
} as const

export const shadows = {
    sm: 'shadow-sm',
    md: 'shadow',
    lg: 'shadow-lg',
    xl: 'shadow-xl',
    none: 'shadow-none',
} as const

/** Elevation levels for the new card system (consumed by `.card` and friends in globals.css). */
export const elevations = {
    0: 'shadow-none',
    1: 'shadow-sm',
    2: 'shadow',
    3: 'shadow-lg',
    4: 'shadow-xl',
} as const

/** Motion durations for transitions across the app (ms). */
export const motion = {
    fast: 120,
    base: 200,
    slow: 320,
} as const

/**
 * Palette for charts (recharts Pie/Bar). Order matters — first color is
 * the first slice/bar, second is the second, etc.
 *
 * Tuned for dark mode contrast (more saturated, no washed pastels).
 */
export const chartPalette = [
    '#60A5FA', // blue-400
    '#34D399', // emerald-400
    '#FBBF24', // amber-400
    '#F87171', // red-400
    '#A78BFA', // violet-400
    '#22D3EE', // cyan-400
    '#F472B6', // pink-400
    '#A3E635', // lime-400
] as const

/**
 * Spacing rhythm. Prefer these over arbitrary values.
 */
export const spacing = {
    page: 'p-6',
    pageY: 'py-6',
    section: 'space-y-6',
    card: 'p-4',
    cardLg: 'p-6',
    gap: 'gap-4',
    gapLg: 'gap-6',
} as const
