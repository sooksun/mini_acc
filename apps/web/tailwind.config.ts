import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Thai"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg: 'var(--bg)',
        'bg-soft': 'var(--bg-soft)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        border: 'var(--border)',
        'border-2': 'var(--border-2)',
        text: 'var(--text)',
        'text-soft': 'var(--text-soft)',
        'text-mute': 'var(--text-mute)',
        'text-faint': 'var(--text-faint)',
        brand: 'var(--brand)',
        'brand-2': 'var(--brand-2)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        bad: 'var(--bad)',
        info: 'var(--info)',
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        DEFAULT: 'var(--r-md)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, var(--grad-from), var(--grad-via) 55%, var(--grad-to))',
      },
    },
  },
  plugins: [],
};

export default config;
