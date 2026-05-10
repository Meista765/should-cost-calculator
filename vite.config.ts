import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/should-cost-calculator/' : '/',
  test: {
    globals: true,
    environment: 'node',
  },
}));
