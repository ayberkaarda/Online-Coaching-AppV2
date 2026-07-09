/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // Karanlık mod butonunun çalışmasını sağlayan kilit ayar
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-purple': '#8b5cf6',
        'brand-purpleHover': '#7c3aed',
      }
    },
  },
  plugins: [],
};