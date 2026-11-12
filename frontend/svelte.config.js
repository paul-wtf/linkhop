import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: true
    }),
    prerender: {
      // The page links /api/v1/opensearch.xml, which only the backend serves.
      handleHttpError: ({ path, message }) => {
        if (path.startsWith('/api/')) return;
        throw new Error(message);
      }
    }
  }
};
