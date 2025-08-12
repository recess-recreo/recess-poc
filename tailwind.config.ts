import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#8B5A3C",
        secondary: "#FFB85F",
        neutral: {
          0: "#FFFFFF",
          10: "#FBFBFB", 
          20: "#F0F0F0",
          30: "#E4E4E4",
          40: "#D1D1D1",
          50: "#AFAFAF",
          60: "#808080",
          70: "#565656",
          80: "#333333",
          90: "#1A1A1A",
          100: "#000000"
        }
      },
    },
  },
  plugins: [],
};
export default config;