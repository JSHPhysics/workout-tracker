/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Class strategy so an in-app toggle can override the OS preference.
  // The `dark` class is set on <html> by src/state/theme.ts.
  darkMode: 'class',
  theme: {
    extend: {
      // Variable fonts loaded via @fontsource-variable/* in src/index.css.
      // System fallbacks first so anything renders before the WOFFs land.
      fontFamily: {
        sans: [
          '"Inter Variable"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        display: [
          '"Fraunces Variable"',
          'ui-serif',
          'Georgia',
          'Cambria',
          '"Times New Roman"',
          'serif',
        ],
      },
      colors: {
        // Warm-neutral surface palette. Replaces our earlier slate (cool
        // blue) for a more editorial feel; cards lift, backgrounds breathe.
        cream: {
          50: '#faf8f3',
          100: '#f4f0e6',
          200: '#e8e2d1',
          300: '#d6cdb4',
          400: '#b8ad8e',
          500: '#8a8377',
          600: '#5e584f',
          700: '#3d3933',
          800: '#26231f',
          900: '#161311',
          950: '#0c0a08',
        },
        // CSS variables let the active profile theme the whole app — see
        // src/index.css. `bg-accent` resolves to whatever the active
        // profile picked; `accent-fg` is the readable foreground for it.
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          fg: 'rgb(var(--accent-fg) / <alpha-value>)',
          soft: 'rgb(var(--accent) / 0.12)',
        },
        // Static profile chips for the picker (where the accent isn't yet
        // bound — we don't want both cards painted in the same colour).
        profile: {
          josh: '#22c55e', // sap green
          hayley: '#fb7185', // warm coral
        },
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        lift: '0 6px 24px -8px rgb(0 0 0 / 0.18), 0 2px 6px -2px rgb(0 0 0 / 0.08)',
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
    },
  },
  plugins: [],
};
