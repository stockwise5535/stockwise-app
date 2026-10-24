import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react(), {
  name:'localized-static-preview',
  configurePreviewServer(server) {
    server.middlewares.use((req,_res,next)=>{
      req.url=req.url?.replace(/^\/(en|ja)\/?(?=\?|$)/,'/$1/index.html')
      next()
    })
  },
}] })
