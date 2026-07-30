/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070b14',
          900: '#0c1220',
          800: '#141c2e',
          700: '#1c2740',
        },
        accent: {
          DEFAULT: '#3d9bfd',
          soft: '#7ec0ff',
          mint: '#3ddeb5',
          warn: '#f0a35e',
          danger: '#f07178',
        },
      },
      fontFamily: {
        display: ['"Sora"', 'system-ui', 'sans-serif'],
        body: ['"Manrope"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.35)',
      },
      backgroundImage: {
        campus:
          'radial-gradient(ellipse at 20% 0%, rgba(61,155,253,0.25), transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(61,222,181,0.12), transparent 45%), linear-gradient(180deg, #070b14 0%, #0c1220 45%, #10182a 100%)',
        campusLight:
          'radial-gradient(ellipse at 20% 0%, rgba(61,155,253,0.18), transparent 50%), linear-gradient(180deg, #e8eef8 0%, #f4f7fc 100%)',
      },
    },
  },
  plugins: [],
};
