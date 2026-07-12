import { SelectHTMLAttributes, forwardRef, ReactNode } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string
    hint?: string
    error?: string
    children: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
    { label, hint, error, id, className = '', children, ...rest },
    ref
) {
    const selectId = id ?? `select-${Math.random().toString(36).slice(2, 9)}`
    return (
        <div className="w-full">
            {label && (
                <label htmlFor={selectId} className="label">
                    {label}
                </label>
            )}
            <select
                ref={ref}
                id={selectId}
                className={`select-base ${className}`}
                aria-invalid={error ? 'true' : undefined}
                {...rest}
            >
                {children}
            </select>
            {error ? (
                <p className="form-error">{error}</p>
            ) : hint ? (
                <p className="form-hint">{hint}</p>
            ) : null}
        </div>
    )
})
