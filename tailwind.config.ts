import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#1e1e2e',
          raised: '#262637',
          overlay: '#2e2e42',
        },
        border: {
          DEFAULT: '#3e3e56',
          focus: '#6c6cff',
        },
        accent: {
          DEFAULT: '#6c6cff',
          hover: '#8080ff',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
