import { ReactNode } from 'react'

interface SectionProps {
    title?: string
    subtitle?: string
    actions?: ReactNode
    children: ReactNode
    className?: string
    /** Remove body padding when the child renders its own layout (e.g. a table). */
    flushBody?: boolean
    /** Use elevated shadow instead of the default subtle one. */
    elevated?: boolean
    /** Wrapper element. Default: `<section>`. Use `'div'` for non-sectioning contexts. */
    as?: 'section' | 'div' | 'article'
    /** Reduce padding and hide subtitle on mobile. Useful for the dashboard. */
    compact?: boolean
}

export function Section({
    title,
    subtitle,
    actions,
    children,
    className = '',
    flushBody = false,
    elevated = false,
    as: Tag = 'section',
    compact = false,
}: SectionProps) {
    const surfaceClass = elevated ? 'card-elevated' : 'card'
    const headerClass = title && actions ? 'card-header-row' : 'card-header'
    const headerCompact = compact ? 'px-4 py-3 sm:px-5 sm:py-4' : ''
    const bodyClass = flushBody ? 'card-body-flush' : 'card-body'
    const bodyCompact = compact && !flushBody ? 'p-3 sm:p-5' : ''
    return (
        <Tag className={`${surfaceClass} ${className}`.trim()}>
            {(title || actions) && (
                <div className={`${headerClass} ${headerCompact}`.trim()}>
                    {title && (
                        <div className="min-w-0">
                            <h2 className="card-title">{title}</h2>
                            {subtitle && (
                                <p className={`card-subtitle ${compact ? 'hidden sm:block' : ''}`}>
                                    {subtitle}
                                </p>
                            )}
                        </div>
                    )}
                    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
                </div>
            )}
            <div className={`${bodyClass} ${bodyCompact}`.trim()}>{children}</div>
        </Tag>
    )
}
