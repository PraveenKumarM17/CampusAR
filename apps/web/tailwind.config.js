/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#eef1f3',
          soft: '#f7f8f9',
          raised: '#ffffff',
        },
        ink: {
          DEFAULT: '#1a2228',
          mute: '#5c6b76',
          faint: '#8a97a1',
          950: '#12171c',
          900: '#1a2228',
          800: '#2a353e',
          700: '#3d4b56',
        },
        line: {
          DEFAULT: '#d4dce6',
          strong: '#b8c2ca',
        },
        accent: {
          DEFAULT: '#0f6b63',
          soft: '#148a80',
          mint: '#1a9b8e',
          warn: '#c47a12',
          danger: '#b42318',
        },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'Georgia', 'serif'],
        body: ['"Public Sans"', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        atlas:
          'linear-gradient(180deg, #eef1f3 0%, #e4e9ed 100%), repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(26,34,40,0.04) 31px, rgba(26,34,40,0.04) 32px), repeating-linear-gradient(90deg, transparent, transparent 31px, rgba(26,34,40,0.04) 31px, rgba(26,34,40,0.04) 32px)',
        heroMap:
          'radial-gradient(ellipse 80% 60% at 70% 40%, rgba(15,107,99,0.12), transparent 55%), linear-gradient(135deg, #dfe6ea 0%, #eef1f3 45%, #d5ddd8 100%)',
      },
    },
  },
  plugins: [],
};
