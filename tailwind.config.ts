import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Merck brand palette
        merck: {
          blue: '#009FE3',
          dark: '#003065',
          purple: '#6B2D8B',
        },
        // Excel convention colours
        highlight: {
          yellow: '#FFFF00',  // changed cell (노란 셀)
          green: '#92D050',   // on-track
          red: '#FF0000',     // risk flag
          orange: '#FFA500',  // anomaly
        },
        // Status colours
        status: {
          draft: '#94A3B8',
          submitted: '#3B82F6',
          approved: '#22C55E',
          locked: '#6B7280',
        },
      },
      fontFamily: {
        sans: ['Pretendard', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [forms],
};

export default config;
