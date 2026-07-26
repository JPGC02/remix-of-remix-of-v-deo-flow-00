## Renomear marca de "Vídeo Flow AI" para "Video Maker AI"

Substituir todas as ocorrências do nome exibido ao usuário.

### Arquivos a alterar

1. **`src/pages/Auth.tsx`** — título no card de login (`<CardTitle>Vídeo Flow AI</CardTitle>`).
2. **`src/pages/Dashboard.tsx`** — header (`<span>Vídeo Flow AI</span>`).
3. **`src/pages/Index.tsx`** — header do editor (`<span>Vídeo Flow AI</span>`).
4. **`index.html`** — já está como "VideoMaker AI" em `<title>`, `og:title`, `twitter:title`. Padronizar para "Video Maker AI" (com espaço) para consistência com a UI.

### Fora de escopo

- Nome do projeto Supabase, secrets e identificadores técnicos permanecem inalterados.
- Memórias internas (`mem://`) que mencionam "Vídeo Flow AI" não precisam mudar — são notas técnicas, não UI.
- README/docs não serão tocados salvo pedido.

Confirma "Video Maker AI" (com espaço, sem acento) como grafia oficial?