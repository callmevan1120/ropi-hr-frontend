/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rotiBrown: '#3e2723',
        rotiYellow: '#fbc02d',
        rotiLight: '#fff8e1',
        surface: '#f8fafc',
      },
      boxShadow: {
        'floating': '0 10px 30px -5px rgba(251, 192, 45, 0.3)'
      }
    },
  },
  plugins: [],
}