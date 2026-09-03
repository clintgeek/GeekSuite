/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'sans': ['Geist', 'system-ui', 'sans-serif'],
        'mono': ['Geist Mono', 'monospace'],
      },
      // Console palette. Values live as CSS variables in index.css so the
      // whole look is tunable from one place; these names just let Tailwind
      // utilities reach them (text-ink-2, border-hair, bg-panel ...).
      colors: {
        ground: 'var(--ground)',
        panel: 'var(--panel)',
        'panel-hover': 'var(--panel-hover)',
        hair: 'var(--hair)',
        'hair-strong': 'var(--hair-strong)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        'ink-4': 'var(--ink-4)',
        accent: 'var(--accent)',
        'accent-dim': 'var(--accent-dim)',
        critical: 'var(--critical)',
        sky: 'var(--sky)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
