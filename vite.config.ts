import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const values = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(values)) process.env[key] ??= value;
  return {
    plugins: [
      tailwindcss(),
      sveltekit({
        adapter: adapter(),
        compilerOptions: {
          runes: ({ filename }) => (filename.includes('node_modules') ? undefined : true)
        }
      })
    ],
    server: { port: 5173, strictPort: true }
  };
});
