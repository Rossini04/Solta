import fs from 'node:fs';

// Evita publicar por engano com o identificador usado na prévia local.
const config = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8'));
const id = config.d1_databases?.[0]?.database_id;
if (!id || id.startsWith('00000000-')) {
  console.error('Configure seu banco D1 em wrangler.jsonc antes de publicar. Veja docs/PUBLICAR.md.');
  process.exit(1);
}
if (Number(config.vars.SITE_STORAGE_LIMIT_BYTES) > 50000000000) {
  console.error('O limite global ultrapassa os 50 GB previstos para o primeiro mês. Revise o orçamento antes de aumentar.');
  process.exit(1);
}
console.log('Configuração de publicação verificada.');
