import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ssg: {
          green:    '#72B034',
          footer:   '#7AB33D',
          dark:     '#5E9A28',
          light:    '#EEF5E2',
          lighter:  '#F5F5F5',
          charcoal: '#2C2C2C',
          slate:    '#4A4A4A',
          muted:    '#8F968C',
          amber:    '#C9963B',
        },
      },
      fontFamily: {
        sans: ['"Source Serif Pro"', 'sans-serif'],
        serif: ['"Source Serif Pro"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
