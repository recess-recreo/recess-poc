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
        // Recess Brand Colors
        primary: "#003DA5", // Primary Blue
        secondary: "#FCBA04", // Yellow
        accent: {
          teal: "#068D9D", // Teal
          pink: "#D81E5B", // Pink
          orange: "#F4442E", // Orange
        },
        // Keep neutral palette for UI consistency
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
        },
        // Brand color variants for different use cases
        brand: {
          blue: {
            50: "#EBF3FF",
            100: "#D1E3FF",
            500: "#003DA5",
            600: "#002D7A",
            700: "#001F52",
            800: "#00142B",
            900: "#000A14"
          },
          yellow: {
            50: "#FFFBEB",
            100: "#FFF5CC",
            500: "#FCBA04",
            600: "#CA9500",
            700: "#996F00",
            800: "#664A00",
            900: "#332500"
          },
          teal: {
            50: "#E8F8F9",
            100: "#CCF0F2",
            500: "#068D9D",
            600: "#05707E",
            700: "#04545E",
            800: "#03373F",
            900: "#011B1F"
          },
          pink: {
            50: "#FDEEF3",
            100: "#FACDE1",
            500: "#D81E5B",
            600: "#AD1849",
            700: "#821237",
            800: "#560C25",
            900: "#2B0612"
          },
          orange: {
            50: "#FEEBE8",
            100: "#FDC8BC",
            500: "#F4442E",
            600: "#C43625",
            700: "#93291C",
            800: "#621B12",
            900: "#310E09"
          }
        }
      },
    },
  },
  plugins: [],
};
export default config;