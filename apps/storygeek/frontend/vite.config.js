import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';

  return {
    plugins: [react()],
    // Force a SINGLE instance of MUI, Emotion, and React across the app and
    // the @geeksuite/ui workspace package. Without this, pnpm can give
    // @geeksuite/ui its own copies, so shared components (GeekShell,
    // GeekAppFrame, …) render through a different MUI/Emotion instance that
    // never sees the app's ThemeProvider — they fall back to MUI's default
    // LIGHT theme, which is why the content frame stayed white in dark mode
    // while app-owned components (top bar, cards) were correctly dark.
    // Only dedupe packages the app directly depends on. Deduping @mui/material
    // transitively makes its nested @mui/system a singleton too; listing
    // @mui/system explicitly instead breaks resolution (it isn't hoisted to a
    // root-resolvable location under pnpm).
    resolve: {
      dedupe: [
        '@mui/material',
        '@emotion/react',
        '@emotion/styled',
        'react',
        'react-dom',
      ],
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:9977',
          changeOrigin: true,
        },
        '/graphql': {
          target: 'http://localhost:8987',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(isProd ? '/api' : 'http://localhost:9977/api'),
      'import.meta.env.VITE_GRAPHQL_API_URL': JSON.stringify(isProd ? 'https://basegeek.clintgeek.com/graphql' : 'http://localhost:8987/graphql'),
    }
  };
})
