import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    // Dynamic badge/status colors
    'bg-green-100', 'text-green-700', 'bg-yellow-100', 'text-yellow-700',
    'bg-red-100', 'text-red-700', 'bg-gray-100', 'text-gray-600',
    'bg-blue-100', 'text-blue-700', 'bg-purple-100', 'text-purple-700',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1B2B5E',
          light: '#2D4080',
          dark: '#111D3F',
          50: '#eef1fa',
          100: '#d5dcf2',
        },
        yellow: {
          DEFAULT: '#F5C518',
          light: '#FDE68A',
          dark: '#D4A016',
        },
        background: '#F4F5F7',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)',
        elevated: '0 4px 12px 0 rgba(0,0,0,0.12), 0 2px 4px -1px rgba(0,0,0,0.06)',
        'inner-sm': 'inset 0 1px 2px rgba(0,0,0,0.06)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      screens: {
        xs: '375px',
      },
    },
  },
  plugins: [],
};

export default config;
