# Solta

Compartilhamento de arquivos, pastas e documentos em grupo.

**Site:** https://solta-arquivos-rossini.rosslni.chatgpt.site

## Recursos

- Um arquivo de até **10 GB (10.000.000.000 bytes) a cada 2 horas por IP**. O prazo começa ao iniciar o envio. Cancelar um envio incompleto libera a tentativa; excluir um arquivo já publicado mantém o intervalo.
- Envio em partes de 8 MiB, progresso real, cancelamento e retomada das partes restantes enquanto a página permanece aberta.
- Lista pública, download, link individual e botão para copiar o link. Downloads aceitam `Range` e `HEAD`.
- Exclusão pelo autor e denúncias. Para visitantes, a exclusão exige o mesmo IP **e** a prova de autoria salva no navegador. Assim, outra pessoa na mesma rede não pode excluir o arquivo. Autores autenticados também podem excluir seus arquivos pela conta.
- Pastas públicas, privadas ou de grupo, com senha opcional. A proteção também é verificada nos endpoints de download e upload.
- Grupos com convite, lista de participantes e documentos compartilhados.
- Editor de texto com títulos, negrito, itálico, listas, desfazer/refazer e edição conjunta usando Tiptap + Yjs. Atualizações concorrentes são mescladas no servidor e sincronizadas aproximadamente a cada 1,5 segundo.
- Sala de tela ao vivo por documento, via WebRTC. A pessoa escolhe uma aba, janela ou tela no navegador e pode interromper a transmissão. Não há gravação nem captura automática.
- Painel de denúncias em `/moderacao`, disponível para a conta definida em `ADMIN_EMAIL`.

Uploads públicos e downloads não exigem cadastro. Criar pastas, grupos e editar documentos exige entrar com ChatGPT.

## Hospedagem e código

O site é publicado pelo **Sites** e executa em **Cloudflare Workers**. Arquivos ficam em **R2** (`BUCKET`); metadados, permissões e documentos ficam em **D1** (`DB`). `.openai/hosting.json` contém apenas os vínculos lógicos e o identificador do Site.

Este repositório contém o código. Um envio para o GitHub não muda a hospedagem, não copia os arquivos enviados pelos visitantes e não publica automaticamente uma nova versão. GitHub Pages, sozinho, não executa este backend. Para hospedar fora de Sites, será necessário provisionar R2/D1 e adaptar a autenticação: os cabeçalhos `oai-authenticated-user-*` só são confiáveis quando fornecidos pelo dispatcher do Sites.

## Desenvolvimento

Requer Node 22.13+ e npm.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_shallow_random.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_crazy_korath.sql
npm run dev
```

Aplique cada migração uma única vez em um banco local novo. Em Sites, o fluxo de publicação gerencia as migrações. Não altere migrações já publicadas: gere uma nova com `npm run db:generate`.

A prévia local oferece uma identidade fictícia pelo botão Entrar. Ela não autentica em produção. Configure `ADMIN_EMAIL` como segredo no Sites e publique novamente para aplicar a configuração. `.env.example` documenta a chave; valores reais nunca devem ser enviados ao GitHub.

## Testes

O teste de integração usa apenas loopback e dados fictícios. Requer `curl`, disponível no Windows atual e em muitos ambientes Unix. Em um terminal, execute o build e inicie a prévia compilada:

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to .wrangler/state --ip 127.0.0.1 --port 8787 --inspector-port 0 --var ADMIN_EMAIL:test-admin@sites.test
```

Em outro terminal:

```sh
node tests/integration.mjs
npx tsc --noEmit
```

O teste verifica limite de 10 GB e intervalo de 2 horas, upload em três partes de 16.778.553 bytes com comparação SHA-256, downloads, exclusão, denúncias, senhas, permissões de grupos, mesclagem concorrente Yjs e isolamento dos sinais de compartilhamento de tela. Os cabeçalhos de identidades fictícias só são injetados contra o servidor local.

## Limites atuais

- O limite de 10 GB foi validado na API; ainda não foi realizado um upload completo de 10 GB.
- O compartilhamento de tela usa STUN, sem servidor TURN. Redes restritas podem impedir a conexão entre participantes. A sinalização foi testada; uma transmissão de vídeo entre computadores em redes diferentes ainda precisa ser validada.
- O editor trabalha com texto formatado. Não inclui o editor visual completo de designs, slides ou PDFs do Canva.
- Documentos têm limite de tamanho; a sincronização depende de conexão. Aguarde o aviso de alterações salvas antes de fechar a página.
- Pessoas na mesma rede compartilham o intervalo de envio. Se um visitante apagar os cookies ou mudar de IP, perde a opção de excluir envios anônimos anteriores.
- Arquivos anteriores à implantação da autoria não têm dono identificável. A administração pode removê-los após análise de denúncia.
- Arquivos completos não expiram automaticamente. Envios incompletos expiram na aplicação após 24 horas; a limpeza física das partes abandonadas depende da política do armazenamento.

Referências: [R2 multipart uploads](https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/), [Yjs document updates](https://docs.yjs.dev/api/document-updates), [Screen Capture API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).

