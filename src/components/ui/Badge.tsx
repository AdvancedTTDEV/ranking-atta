import { ReactNode } from 'react'

type Variant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

interface BadgeProps {
    variant?: Variant
    children: ReactNode
    className?: string
}

const variantClasses: Record<Variant, string> = {
    neutral: 'badge-neutral',
    brand: 'badge-brand',
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
    info: 'badge-info',
}

export function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
    return (
        <span className={`badge ${variantClasses[variant]} ${className}`.trim()}>
            {children}
        </span>
    )
}
