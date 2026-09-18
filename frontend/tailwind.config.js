/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff7f0',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#f97316',
          500: '#ee6723',
          600: '#d9580e',
          700: '#b74b0a',
          800: '#93400d',
          900: '#7c3510',
          950: '#431a03',
        },
        navy: {
          700: '#1e3a5f',
          800: '#1e293b',
          900: '#0f172a',
        },
        surface: {
          bg: '#f8f9fb',
          card: '#ffffff',
          raised: '#f1f5f9',
          border: '#e5e7eb',
          'border-hover': '#d1d5db',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}
