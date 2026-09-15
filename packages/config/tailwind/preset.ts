import type { Config } from 'tailwindcss';

// Shared Tailwind preset — the single home of the design tokens.
//
// The scale is deliberately CDEK-shaped (same roles, same rhythm) with our own
// palette: Registan cobalt as the brand, saffron as the accent.
const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        // White-label: a tenant overrides these variables (see @bazar/storefront brandingCss);
        // the defaults live in each app's globals.css.
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
          950: 'rgb(var(--brand-950) / <alpha-value>)',
          // Fixed deep cobalt for text on a white pill over a photo — the same in both themes.
          deep: '#2445A0',
        },
        saffron: {
          100: 'rgb(var(--saffron-100) / <alpha-value>)',
          300: 'rgb(var(--saffron-300) / <alpha-value>)',
          400: 'rgb(var(--saffron-400) / <alpha-value>)',
          500: 'rgb(var(--saffron-500) / <alpha-value>)',
          600: 'rgb(var(--saffron-600) / <alpha-value>)',
          900: 'rgb(var(--saffron-900) / <alpha-value>)',
        },
        // Neutrals are variables too: the dark theme redefines them (see globals.css).
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
          faint: 'rgb(var(--ink-faint) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--line) / <alpha-value>)',
          strong: 'rgb(var(--line-strong) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          soft: 'rgb(var(--surface-soft) / <alpha-value>)',
          mute: 'rgb(var(--surface-mute) / <alpha-value>)',
          // What sits white on a grey tile: buttons, steppers, kbd hints.
          raise: 'rgb(var(--surface-raise) / <alpha-value>)',
        },
        // Kraft paper and dried apricot: the warm neutrals a bazaar has and a taxi app does not.
        sand: {
          50: 'rgb(var(--sand-50) / <alpha-value>)',
          100: 'rgb(var(--sand-100) / <alpha-value>)',
          200: 'rgb(var(--sand-200) / <alpha-value>)',
          300: 'rgb(var(--sand-300) / <alpha-value>)',
        },
        danger: '#E4394F',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Roboto', 'system-ui', 'sans-serif'],
        // Headlines, prices, ETA — the numbers people glance at.
        display: ['var(--font-display)', 'Manrope', 'var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        // 8 for inputs and small cards, 10 for buttons, 16 for panels.
        control: '10px',
        panel: '16px',
      },
      boxShadow: {
        card: '0 2px 12px rgba(27, 31, 34, 0.06)',
        pop: '0 12px 32px rgba(27, 31, 34, 0.12)',
      },
      maxWidth: {
        container: '1264px',
      },
    },
  },
  plugins: [],
};

export default preset;
