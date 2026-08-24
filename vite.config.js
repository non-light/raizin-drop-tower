import { defineConfig } from 'vite'

/**
 * 公開先は https://daruma.lightspirits.jp/ 。
 * public/CNAME がそのまま dist/ へコピーされ、GitHub Pages がそれを見てドメインを当てる。
 * base は相対にしてあるので、どのパスに置かれても動く。
 */
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
})
