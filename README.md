# LP — Mentoria Videomaker PraCima

Página de vendas estática (`index.html` + `assets/`). Checkout na Kiwify:

- Individual (R$ 347): https://pay.kiwify.com.br/su0F0XV
- Dupla (R$ 297/pessoa): https://pay.kiwify.com.br/12x3RTL

## Rastreamento

Edite `window.LP_CONFIG` no `<head>` do `index.html`:

- `META_PIXEL_ID` — carrega o Meta Pixel (PageView).
- `GTM_ID` — carrega o Google Tag Manager.

Ao clicar em qualquer botão de checkout a página dispara:

- Meta Pixel: `fbq('track', 'Lead', { value, currency: 'BRL', content_category: 'individual' | 'dupla' })`
- dataLayer: `{ event: 'lead', lead_plan, value, currency, event_id, checkout_url }`

e redireciona para a Kiwify após 300 ms. Parâmetros da URL (UTMs, fbclid etc.) são repassados para o link do checkout.
