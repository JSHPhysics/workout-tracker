/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Dark mode follows the OS via `prefers-color-scheme` (Tailwind's `media` strategy).
  darkMode: 'media',
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
