/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Class strategy so an in-app toggle can override the OS preference.
  // The `dark` class is set on <html> by src/state/theme.ts.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Profile accents — see DECISIONS.md (palette is provisional).
        profile: {
          josh: '#7c3aed', // violet-600
          partner: '#0ea5e9', // sky-500
        },
      },
    },
  },
  plugins: [],
};
