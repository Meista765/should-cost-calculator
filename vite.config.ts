/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 운영 빌드에 CSP meta 태그를 주입한다. 개발 서버에서는 HMR(웹소켓)이 동작하도록 비워둔다.
// Tauri 환경 호환을 위해 connect-src 에 ipc:, http://ipc.localhost 추가.
// singlefile 모드는 JS 가 인라인되므로 'unsafe-inline' 허용 (사내 file:// 배포용).
function securityHeaders(mode: string): Plugin {
  const scriptSrc =
    mode === 'singlefile' ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'";
  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' ipc: http://ipc.localhost https://*.supabase.co",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'security-headers',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        /<meta charset="[^"]+"\s*\/?>/,
        (m) => `${m}\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    securityHeaders(mode),
    ...(mode === 'singlefile' ? [viteSingleFile()] : []),
  ],
  // Tauri 는 tauri://localhost/ 에서 서빙되므로 절대경로 base 사용 불가.
  // 정적 호스팅 (GitHub Pages 등) 환경에서는 vite preview 또는 sub-path 이전 빌드를 사용.
  base: './',
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2021',
    ...(mode === 'singlefile' && {
      assetsInlineLimit: 100_000_000,
      cssCodeSplit: false,
      rollupOptions: {
        output: { inlineDynamicImports: true },
      },
    }),
  },
  test: {
    globals: true,
    environment: 'node',
  },
}));
