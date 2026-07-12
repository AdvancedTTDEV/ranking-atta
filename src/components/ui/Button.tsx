import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant
    size?: Size
    iconOnly?: boolean
    leadingIcon?: ReactNode
    trailingIcon?: ReactNode
    isLoading?: boolean
}

const variantClasses: Record<Variant, string> = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
    success: 'btn-success',
    warning: 'btn-warning',
}

const sizeClasses: Record<Size, string> = {
    sm: 'btn-sm',
    md: '',
    lg: 'btn-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    {
        variant = 'primary',
        size = 'md',
        iconOnly = false,
        leadingIcon,
        trailingIcon,
        isLoading = false,
        disabled,
        className = '',
        children,
        type = 'button',
        ...rest
    },
    ref
) {
    const classes = [
        'btn',
        variantClasses[variant],
        sizeClasses[size],
        iconOnly ? 'btn-icon' : '',
        className,
    ]
        .filter(Boolean)
        .join(' ')

    return (
        <button
            ref={ref}
            type={type}
            className={classes}
            disabled={disabled || isLoading}
            aria-busy={isLoading || undefined}
            {...rest}
        >
            {isLoading ? (
                <span
                    className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
                    aria-hidden="true"
                />
            ) : (
                leadingIcon
            )}
            {!iconOnly && children}
            {!isLoading && !iconOnly && trailingIcon}
        </button>
    )
})
