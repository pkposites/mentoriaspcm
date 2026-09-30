# Worker Cloudflare — Meta Conversions API

Recebe `PageView` e `Lead` da LP e envia para a Meta pelo servidor, com o mesmo `event_id` do Pixel. Assim a Meta deduplica e o evento não conta duas vezes.

## 1. Gerar o token
Gerenciador de Eventos → Pixel **731525046334517** → Configurações → API de Conversões → **Gerar token de acesso**.

## 2a. Publicar pelo painel (sem terminal)
1. Cloudflare → Workers & Pages → Create → **Create Worker** → nome `pracima-capi` → Deploy.
2. **Edit code**: apague tudo, cole o conteúdo de `src/index.js` e clique em Deploy.
3. Settings → **Variables and Secrets**:
   - `PIXEL_ID` (Text) = `731525046334517`
   - `ALLOWED_ORIGINS` (Text) = `https://mentoriapracimalp.netlify.app`
   - `GRAPH_VERSION` (Text) = `v23.0`
   - `META_ACCESS_TOKEN` (**Secret**) = token do passo 1
   - opcional: `TEST_EVENT_CODE` (Text) = código da aba "Testar eventos". Remova depois de testar.

## 2b. Publicar pelo terminal
```bash
cd capi-worker
npx wrangler login
npx wrangler secret put META_ACCESS_TOKEN
npx wrangler deploy
```

## 3. Ligar na LP
No `index.html`, dentro de `LP_CONFIG`:
```js
CAPI_URL: "https://pracima-capi.SEU-SUBDOMINIO.workers.dev/event",
```

## Testar
```bash
curl -X POST "https://pracima-capi.SEU-SUBDOMINIO.workers.dev/event?debug=1" \
  -H "Origin: https://mentoriapracimalp.netlify.app" -H "Content-Type: application/json" \
  -d '{"event_name":"Lead","event_id":"teste_1","value":347,"currency":"BRL"}'
```
A resposta deve ter `"events_received":1`.

Se usar domínio próprio na LP, adicione-o em `ALLOWED_ORIGINS`, separando por vírgula.
