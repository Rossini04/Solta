import { defineConfig } from 'vite';

// O Vite reúne os módulos JavaScript do navegador na pasta dist.
export default defineConfig({
  build: { outDir: 'dist', emptyOutDir: true },
});
