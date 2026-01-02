/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        'game': {
          'bg': '#0a1628',
          'card': '#1a3a5c',
          'input': '#0d1f35',
        },
        'team1': '#4ecdc4',
        'team2': '#ff8c42',
        'card-red': '#ff6b6b',
      },
      fontFamily: {
        'vazir': ['Vazirmatn', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 2s infinite',
        'glow': 'glow 2s infinite',
        'fly-up': 'flyUp 0.3s ease-out',
      },
      keyframes: {
        glow: {
          '0%, 100%': { boxShadow: '0 4px 12px rgba(0,0,0,0.4)' },
          '50%': { boxShadow: '0 0 20px rgba(78,205,196,0.5)' },
        },
        flyUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      {
        game: {
          "primary": "#4ecdc4",
          "secondary": "#ff8c42", 
          "accent": "#fbbf24",
          "neutral": "#1a3a5c",
          "base-100": "#0a1628",
          "base-200": "#0f2744",
          "base-300": "#1a3a5c",
          "info": "#60a5fa",
          "success": "#4ade80",
          "warning": "#fbbf24",
          "error": "#f87171",
        },
      },
    ],
  },
}