/* الألوان: غيّر لوحة "brand" من هنا ثم شغّل: npm run build:css */
module.exports = {
  content: ['./index.html'],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', '"Plus Jakarta Sans"', 'Tahoma', 'system-ui', 'sans-serif']
      },
      colors: {
        brand: {
          50: '#eef4ff', 100: '#dbe6ff', 200: '#bfd3ff', 300: '#93b4ff', 400: '#608bff',
          500: '#3b66f5', 600: '#2547e0', 700: '#1d38b8', 800: '#1e3494', 900: '#1e2f75', 950: '#131c47'
        }
      }
    }
  },
  plugins: []
};
