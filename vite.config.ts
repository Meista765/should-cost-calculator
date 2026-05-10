import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// 운영 빌드에만 CSP meta 태그를 주입한다. 개발 서버에서는 HMR(웹소켓)이 동작하도록 비워둔다.
function securityHeaders(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
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
  plugins: [react(), securityHeaders()],
  base: mode === 'production' ? '/should-cost-calculator/' : '/',
  test: {
    globals: true,
    environment: 'node',
  },
}));
