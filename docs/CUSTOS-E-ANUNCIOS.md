# Primeiro mês: custos e publicidade

Orçamento informado: **até R$ 20**. A configuração inicial usa Workers Free e D1 Free, sem domínio pago nem servidor de retransmissão de vídeo.

## Armazenamento

O site começa com teto global de **50 GB**, incluindo espaço reservado para uploads incompletos. Os arquivos de cada conta têm teto de 10 GB. Se o site atingir 50 GB, ele recusa novos envios até haver espaço; não exclui arquivos de outras pessoas para aceitar novos envios.

No R2 Standard, a franquia é 10 GB-mês, e o excedente custa US$ 0,015 por GB-mês. Manter 50 GB durante todo o mês dá aproximadamente **US$ 0,60 só em armazenamento**: `(50 - 10) × 0,015`. A transferência de saída do R2 não é cobrada. Isso não é uma garantia de fatura de R$ 20: câmbio, impostos, uso de outros serviços da mesma conta e mudanças de preços também importam. Confira a fatura no painel.

Fontes oficiais: [R2](https://developers.cloudflare.com/r2/pricing/), [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/).

## Proteções no código

- `SITE_STORAGE_LIMIT_BYTES`: 50.000.000.000 bytes no site inteiro.
- `R2_MONTHLY_A_LIMIT`: até 100 mil operações mensais de criação/envio/finalização.
- `R2_MONTHLY_B_LIMIT`: até 500 mil operações mensais de leitura/metadados.
- Upload em partes com tamanho validado, sem aceitar bytes acima do tamanho reservado.
- Exclusão física antes de liberar espaço no contador.
- Downloads públicos bloqueados após 15 dias e limpeza periódica.
- Arquivos incompletos expiram após 24 horas.

Os tetos de operações ficam abaixo das franquias publicadas do R2: 1 milhão de classe A e 10 milhões de classe B. São contadores da aplicação, não um teto de cobrança imposto pela Cloudflare. Operações feitas diretamente no painel, em outro programa ou em outros buckets não entram nesses contadores. Mudanças de configuração e falhas externas também podem alterar o custo.

No plano gratuito, Workers e D1 podem interromper o serviço quando a franquia acaba. A aplicação não contrata um plano pago automaticamente. Não ative recursos pagos sem revisar o orçamento.

Para ficar dentro apenas da franquia gratuita de armazenamento, reduza `SITE_STORAGE_LIMIT_BYTES` para `"10000000000"`. Isso limita **todo o site** a 10 GB, compartilhados entre as contas.

## Publicidade direta

`cliente/anuncios.js` tem um espaço de patrocínio **desativado por padrão**, exibido na página “Como funciona”. Quando tiver um anunciante real, preencha título, descrição e URL HTTPS, e troque `ativo` para `true`. Publique de novo. O anúncio aparece identificado como “Publicidade” e não se parece com um botão de download.

Esse formato não usa cookies de rede de anúncios. O pagamento precisa ser combinado por você com o patrocinador; o código não cobra nem recebe dinheiro automaticamente.

## Google AdSense

Esta versão não carrega AdSense nem contém um identificador de editor. Para ativá-lo, ainda são necessários:

1. Conta e site aprovados pela rede.
2. Seu identificador de editor e o bloco de anúncio.
3. Revisão das páginas em que os anúncios aparecem e do processo de moderação.
4. Configuração de privacidade/consentimento exigida pela rede para os visitantes e atualização da página de privacidade.
5. Ajuste dos cabeçalhos de segurança em `public/_headers` para os domínios de anúncios efetivamente usados.

Arquivos enviados por usuários exigem atenção: o Google orienta manter anúncios desativados em conteúdo não revisado. Não insira anúncios automaticamente nas páginas de todos os downloads. A aprovação e a receita não são garantidas.

Veja as orientações oficiais sobre [arquivos compartilhados](https://support.google.com/adsense/answer/3011913?hl=pt-BR) e [posicionamento de anúncios](https://support.google.com/adsense/answer/1346295?hl=pt-BR).
