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
}: SectionProps) {
    const surfaceClass = elevated ? 'card-elevated' : 'card'
    return (
        <Tag className={`${surfaceClass} ${className}`.trim()}>
            {(title || actions) && (
                <div className={title && actions ? 'card-header-row' : 'card-header'}>
                    {title && (
                        <div className="min-w-0">
                            <h2 className="card-title">{title}</h2>
                            {subtitle && <p className="card-subtitle">{subtitle}</p>}
                        </div>
                    )}
                    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
                </div>
            )}
            <div className={flushBody ? 'card-body-flush' : 'card-body'}>{children}</div>
        </Tag>
    )
}
