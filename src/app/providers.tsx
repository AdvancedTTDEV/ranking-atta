'use client'

import { SessionProvider } from 'next-auth/react'
import {
    ReactNode,
    createContext,
    useContext,
    useEffect,
    useState,
} from 'react'

type Theme = 'light' | 'dark' | 'system'

type ThemeContextValue = {
    theme: Theme
    resolvedTheme: 'light' | 'dark'
    setTheme: (theme: Theme) => void
    toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue>({
    theme: 'dark',
    resolvedTheme: 'dark',
    setTheme: () => {},
    toggleTheme: () => {},
})

export function useTheme() {
    return useContext(ThemeContext)
}

const STORAGE_KEY = 'ranking-atta:theme'
const DEFAULT_THEME: Theme = 'dark'

function resolveTheme(theme: Theme): 'light' | 'dark' {
    if (theme === 'system') {
        if (typeof window === 'undefined') return 'dark'
        return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
    }
    return theme
}

function applyTheme(theme: Theme) {
    if (typeof document === 'undefined') return
    const resolved = resolveTheme(theme)
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    document.documentElement.style.colorScheme = resolved
}

type ProvidersProps = {
    children: ReactNode
}

export default function Providers({ children }: ProvidersProps) {
    const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME)
    const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark')

    useEffect(() => {
        const stored = (typeof window !== 'undefined'
            ? localStorage.getItem(STORAGE_KEY)
            : null) as Theme | null
        const initial: Theme = stored ?? DEFAULT_THEME
        setThemeState(initial)
        setResolvedTheme(resolveTheme(initial))
        applyTheme(initial)

        if (initial === 'system' && typeof window !== 'undefined') {
            const mq = window.matchMedia('(prefers-color-scheme: dark)')
            const handler = () => {
                setResolvedTheme(resolveTheme('system'))
                applyTheme('system')
            }
            mq.addEventListener('change', handler)
            return () => mq.removeEventListener('change', handler)
        }
    }, [])

    const setTheme = (next: Theme) => {
        setThemeState(next)
        setResolvedTheme(resolveTheme(next))
        try {
            localStorage.setItem(STORAGE_KEY, next)
        } catch {
            /* ignore quota / privacy errors */
        }
        applyTheme(next)
    }

    const toggleTheme = () => {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
    }

    return (
        <SessionProvider>
            <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
                {children}
            </ThemeContext.Provider>
        </SessionProvider>
    )
}
