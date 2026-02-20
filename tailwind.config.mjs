/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        body: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        sand: {
          50: '#faf8f5',
          100: '#f2ede6',
          200: '#e6ddd0',
          300: '#d4c7b2',
          400: '#bfab90',
          500: '#a99072',
          600: '#947a5e',
          700: '#7c654f',
          800: '#665344',
          900: '#54453a',
          950: '#2d241e',
        },
        ink: {
          50: '#f6f6f6',
          100: '#e7e7e7',
          200: '#d1d1d1',
          300: '#b0b0b0',
          400: '#888888',
          500: '#6d6d6d',
          600: '#5d5d5d',
          700: '#4f4f4f',
          800: '#454545',
          900: '#3d3d3d',
          950: '#1a1a1a',
        },
      },
    },
  },
  plugins: [],
};
