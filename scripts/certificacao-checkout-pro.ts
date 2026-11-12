/**
 * Certificação Mercado Pago - Checkout Pro (ferramenta só de teste, não faz parte do app).
 *
 * Cria a preferência de pagamento exigida pelo desafio e imprime o link do checkout (init_point).
 * Usa só `fetch` e NÃO toca no código de assinatura (mercadopago.ts), que continua cuidando da cobrança real.
 *
 * Uso:
 *   MP_TEST_ACCESS_TOKEN=... MP_EXTERNAL_REFERENCE=email@da-conta-mercado-pago.com \
 *     npx tsx scripts/certificacao-checkout-pro.ts
 *   Para só ver o corpo da preferência, sem chamar o Mercado Pago: acrescente --dry-run
 *
 * Variáveis:
 *   MP_TEST_ACCESS_TOKEN    Access Token da CONTA VENDEDORA DE TESTE (painel > Credenciais de teste). Nunca o de produção
 *                           e nunca cole o token no chat.
 *   MP_EXTERNAL_REFERENCE   e-mail vinculado à conta do Mercado Pago (exigência do desafio)
 *   APP_URL                 endereço público do app (padrão https://vanescolar.ai.studio)
 *   PRODUTO_ID              4 dígitos numéricos (padrão 1234)
 *   PRODUTO_IMAGEM          URL https pública de uma imagem (padrão: /icons/icon-512.png do app)
 *   PRODUTO_PRECO           preço em reais, acima de US$ 1 (padrão 10)
 *
 * No checkout: use o comprador de teste, em aba anônima, e um cartão que NÃO seja Visa (Visa está excluído),
 * com o nome do titular começando por APRO (ex.: "APRO Teste").
 */

export {};

const dryRun = process.argv.includes('--dry-run');
const env = (nome: string, padrao = '') => String(process.env[nome] ?? padrao).trim();

const INTEGRATOR_ID = 'dev_24c65fb163bf11ea96500242ac130004';
const app = env('APP_URL', 'https://vanescolar.ai.studio').replace(/\/+$/, '');
const token = env('MP_TEST_ACCESS_TOKEN');
const referencia = env('MP_EXTERNAL_REFERENCE');
const idProduto = env('PRODUTO_ID', '1234');
const preco = Number(env('PRODUTO_PRECO', '10'));

if (!/^\d{4}$/.test(idProduto)) throw new Error('PRODUTO_ID deve ter exatamente 4 dígitos numéricos.');
if (!(preco > 6)) throw new Error('PRODUTO_PRECO deve ser maior que o equivalente a US$ 1 em reais (use 10 ou mais).');
if (!dryRun && !token) throw new Error('Defina MP_TEST_ACCESS_TOKEN (Access Token da conta vendedora de TESTE).');
if (!dryRun && !referencia.includes('@')) throw new Error('Defina MP_EXTERNAL_REFERENCE com o e-mail vinculado à sua conta do Mercado Pago.');

const corpo = {
  items: [{
    id: idProduto,
    title: 'Dispositivo móvel',
    description: 'Dispositivo de loja de comércio eletrônico móvel',
    picture_url: env('PRODUTO_IMAGEM', `${app}/icons/icon-512.png`),
    quantity: 1,
    currency_id: 'BRL',
    unit_price: preco
  }],
  payment_methods: {
    excluded_payment_methods: [{ id: 'visa' }],
    installments: 6
  },
  back_urls: {
    success: `${app}/app?pagamento=sucesso`,
    failure: `${app}/app?pagamento=falha`,
    pending: `${app}/app?pagamento=pendente`
  },
  auto_return: 'approved',
  notification_url: `${app}/api/webhooks/mercadopago`,
  external_reference: referencia || 'email@da-conta-mercado-pago.com'
};

if (dryRun) {
  console.log(JSON.stringify(corpo, null, 2));
  process.exit(0);
}

const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-integrator-id': INTEGRATOR_ID
  },
  body: JSON.stringify(corpo)
});
const d: any = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Mercado Pago recusou (${res.status}):`, JSON.stringify(d).slice(0, 600));
  process.exit(1);
}
console.log('Preferência criada:', d.id);
console.log('Abra em ABA ANÔNIMA (comprador de teste):');
console.log(d.init_point);
