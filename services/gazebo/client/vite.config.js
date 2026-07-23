import { defineConfig } from 'vite';

// The client is served BEHIND THE PROXY at the /gzweb/ subpath, so every
// bundled asset URL must carry that prefix — otherwise the built index.html
// requests /assets/*.js at the origin root and misses the subpath. `base`
// prefixes all generated URLs with /gzweb/, matching the gzweb-client nginx
// root (dist copied to .../html/gzweb) and the proxy's /gzweb/ location 1:1.
export default defineConfig({
  base: '/gzweb/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
