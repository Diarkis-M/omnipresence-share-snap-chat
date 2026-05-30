/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        godrej: {
          sky: '#5BC8FF',        // Primary brand accent
          blue: '#2B95DA',       // Secondary chart accent
          black: '#000000',      // Title bg, section dividers
          charcoal: '#3D3D3D',   // Dark grey
          grey: '#878787',       // Chart grey — primary fill
          'grey-mid': '#989898', // Medium grey
          'grey-light': '#BABABA', // Light grey
          'grey-pale': '#DDDDDD',  // Pale grey
        },
        navy: '#000000',
        'navy-light': '#3D3D3D',
        accent: '#5BC8FF',
        'accent-dark': '#2B95DA',
        warning: '#989898',
        danger: '#e17055',
        'off-white': '#f7f8fa',
      },
      fontFamily: {
        sans: ['Gotham', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
