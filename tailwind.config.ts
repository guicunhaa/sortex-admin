import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        base: {50:'#0b0d10',100:'#0f1216',200:'#12161b',300:'#151b21',400:'#1a222b'},
        primary:{50:'#eef2ff',100:'#e0e7ff',200:'#c7d2fe',300:'#a5b4fc',400:'#818cf8',500:'#6366f1',600:'#5457d6',700:'#4548b9',800:'#383a99',900:'#2f327f'},
        accent:{400:'#22d3ee',500:'#06b6d4',600:'#0891b2'},
      },
      backdropBlur:{ xs:'2px' },
      boxShadow:{ glass:'0 1px 1px rgba(255,255,255,0.06) inset, 0 10px 30px rgba(2,6,23,0.35)' },
      borderRadius:{ xl2:'1.25rem' },
    },
  },
  plugins: [],
}
export default config
