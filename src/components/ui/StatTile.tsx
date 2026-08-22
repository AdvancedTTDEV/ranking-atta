import Link from 'next/link'
import { ReactNode } from 'react'

interface StatTileProps {
    label: string
    value: number | string
    icon?: ReactNode
    /** Color hint for the icon. Default: brand. */
    accent?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
    href?: string
    /** Sublabel like "delta esta semana" or "en X clubes". */
    caption?: ReactNode
    className?: string
    /** 'sm' reduces padding, value size and icon size for tight mobile grids. */
    size?: 'sm' | 'md'
}

const accentClasses: Record<NonNullable<StatTileProps['accent']>, string> = {
    brand: 'bg-brand-soft text-brand',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-info-soft text-info',
    neutral: 'bg-subtle text-fg-muted',
}

export function StatTile({
    label,
    value,
    icon,
    accent = 'brand',
    href,
    caption,
    className = '',
    size = 'md',
}: StatTileProps) {
    const isSm = size === 'sm'
    const valueClass = isSm ? 'text-2xl sm:text-3xl font-semibold tracking-tight text-fg' : 'text-3xl font-semibold tracking-tight text-fg'
    const iconWrapClass = isSm
        ? 'flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg'
        : 'flex h-9 w-9 items-center justify-center rounded-lg'
    const inner = (
        <div
            className={`card card-body flex flex-col gap-2 sm:gap-3 transition-shadow hover:shadow-md ${
                href ? 'cursor-pointer hover:border-line-strong' : ''
            } ${isSm ? '!p-3 sm:!p-5' : ''} ${className}`.trim()}
        >
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-fg-muted">{label}</p>
                {icon && (
                    <div
                        className={`${iconWrapClass} ${accentClasses[accent]}`}
                        aria-hidden="true"
                    >
                        {icon}
                    </div>
                )}
            </div>
            <p className={valueClass}>{value}</p>
            {caption && <p className="text-xs text-fg-muted">{caption}</p>}
        </div>
    )

    if (href) {
        return (
            <Link href={href} className="block focus-visible:outline-none">
                {inner}
            </Link>
        )
    }
    return inner
}
