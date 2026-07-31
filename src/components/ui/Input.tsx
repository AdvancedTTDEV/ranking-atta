import { InputHTMLAttributes, forwardRef, ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string
    hint?: string
    error?: string
    leadingIcon?: ReactNode
    trailingIcon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { label, hint, error, leadingIcon, trailingIcon, id, className = '', ...rest },
    ref
) {
    const inputId = id ?? `input-${Math.random().toString(36).slice(2, 9)}`
    return (
        <div className="w-full">
            {label && (
                <label htmlFor={inputId} className="label">
                    {label}
                </label>
            )}
            <div className="relative">
                {leadingIcon && (
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-fg-muted">
                        {leadingIcon}
                    </span>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    className={`input-base ${leadingIcon ? 'pl-9' : ''} ${trailingIcon ? 'pr-9' : ''} ${className}`}
                    aria-invalid={error ? 'true' : undefined}
                    {...rest}
                />
                {trailingIcon && (
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-fg-muted">
                        {trailingIcon}
                    </span>
                )}
            </div>
            {error ? (
                <p className="form-error">{error}</p>
            ) : hint ? (
                <p className="form-hint">{hint}</p>
            ) : null}
        </div>
    )
})
