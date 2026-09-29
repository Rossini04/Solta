# Publicar na sua conta Cloudflare

O código pode continuar no repositório público `Rossini04/Solta`. O serviço roda na sua conta Cloudflare com Workers, D1 e R2. Não é necessário domínio pago: a publicação fornece um endereço `workers.dev`.

## 1. Conta e plano

Crie uma conta Cloudflare ou entre na conta que você já tem. Mantenha **Workers Free**. Não ative Workers Paid para esta configuração: sua mensalidade mínima de US$ 5 não cabe com folga no orçamento inicial de R$ 20.

O R2 usa cobrança por consumo e pode pedir cadastro de pagamento. Confira isso no próprio painel; nunca coloque dados de cartão ou senhas no repositório. Leia `CUSTOS-E-ANUNCIOS.md` antes de ativá-lo.

## 2. Autorizar o terminal

Na pasta do projeto:

```sh
npm ci
npx wrangler login
```

O comando abre a página de autorização. Entre na sua conta e autorize a ferramenta. Não copie tokens para arquivos do código. Confira a conta escolhida com `npx wrangler whoami`.

## 3. Criar o banco e o armazenamento

```sh
npx wrangler d1 create solta-db
npx wrangler r2 bucket create solta-arquivos
```

O primeiro comando mostra um `database_id`. Substitua o identificador que começa com `00000000-` no arquivo `wrangler.jsonc` pelo identificador real. Se usar outros nomes de banco ou bucket, atualize também a configuração e os scripts `db:local` e `db:remoto` de `package.json`.

No painel R2, mantenha o bucket **privado**, sem domínio público ou acesso `r2.dev`. Os downloads passam pela API para conferir senhas, permissões e validade.

Em **Object lifecycle rules** do bucket, mantenha ou crie uma regra para abortar uploads multipart incompletos após **um dia**. Ela é a proteção adicional para envios interrompidos; a aplicação também os limpa automaticamente. Não aplique uma regra de exclusão de 15 dias ao bucket inteiro: pastas privadas e de grupos têm prazo diferente.

## 4. Aplicar as tabelas e publicar

```sh
npm run db:remoto
npm run build
npm test
npm run deploy
```

O comando de publicação mostra o endereço final. No painel Workers, confirme que o Cron Trigger `*/5 * * * *` está ativo: ele remove expirados e envios abandonados. O bloqueio de downloads expirados acontece mesmo antes de o próximo lote de limpeza rodar.

## 5. Sua conta de administrador

Abra o site publicado, crie a sua conta e guarde o código de recuperação. Depois promova apenas a sua conta pelo terminal autenticado na Cloudflare. Substitua `seu_usuario` pelo nome exato cadastrado, em minúsculas:

```sh
npx wrangler d1 execute solta-db --remote --command "UPDATE users SET admin = 1 WHERE username = 'seu_usuario'"
```

Recarregue o site. O link **Moderação** aparece no cabeçalho. Outras pessoas que se cadastrarem não recebem esse acesso.

## 6. Publicar novas alterações

Salve e envie o código atualizado para seu GitHub. Para atualizar o site pelo seu computador:

```sh
git pull
npm ci
npm run build
npm test
npm run deploy
```

Quando houver uma nova migração SQL, execute `npm run db:remoto` antes de publicar a versão que precisa dela. O GitHub guarda o código; um `git push` sozinho não publica na Cloudflare nesta configuração. Você pode configurar integração automática depois, quando estiver confortável com o processo manual.

## 7. O serviço anterior

Publicar esta versão cria um serviço separado. Não apaga nem importa os dados do endereço anterior. Salve os arquivos e documentos que quiser manter antes de desligar a hospedagem anterior. Os identificadores de contas são diferentes: não associe dados antigos a novos donos só pelo nome exibido.

## Se alguma coisa falhar

- **Banco local sem tabelas:** rode `npm run db:local`.
- **Banco remoto sem tabelas:** confirme a conta e o `database_id`, depois rode `npm run db:remoto`.
- **R2 não habilitado:** conclua a ativação no painel Cloudflare.
- **Arquivo cheio / cota atingida:** veja “Meus arquivos” e o limite global no painel. Não aumente limites sem revisar custos.
- **Limite gratuito do Worker ou D1 atingido:** aguarde a renovação da franquia. Não altere automaticamente para plano pago.
- **Não aparece uma mudança na interface:** rode `npm run build` e publique novamente.
- **Tela não conecta em uma rede:** a versão inicial usa STUN. Algumas redes precisam de TURN, que exige uma configuração e um orçamento próprios.
