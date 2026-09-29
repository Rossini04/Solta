# Aprender mexendo no Solta

## 1. HTML e CSS

Comece por `index.html`. Ele contém cabeçalho, navegação, área principal, rodapé e caixa de mensagens.

Depois abra `cliente/estilo.css`. As primeiras variáveis controlam as cores. Por exemplo, altere `--green` para testar a cor dos botões. As regras no fim ajustam a tela para celulares. Altere uma coisa por vez, execute `npm run dev` e confira no navegador.

## 2. JavaScript no navegador

`cliente/app.js` lê o endereço da página e escolhe o conteúdo. A função `home()` monta a página inicial. `authPage()` monta cadastro, login e recuperação.

Os textos que vêm de usuários passam por `escape()` antes de entrar em HTML. Isso impede que um nome de arquivo seja interpretado como código.

`cliente/api.js` faz pedidos ao servidor. Exemplo:

```js
const resposta = await api('/api/files');
console.log(resposta.files);
```

`await` espera a resposta sem travar a página. Quando há um erro, `try/catch` permite mostrar uma mensagem e manter a página utilizável.

## 3. O servidor

O navegador não decide quem pode excluir arquivos nem quanto espaço uma pessoa pode usar. Ele pede uma operação; o servidor confere as regras.

`servidor/index.js` é a entrada. Uma requisição `POST /api/files` chega a `createUpload()` em `servidor/arquivos.js`. Essa função:

1. Confere a sessão da conta.
2. Valida o nome e o tamanho.
3. Confere a pasta, se houver.
4. Reserva espaço no banco.
5. Cria um envio em partes no armazenamento.
6. Devolve um identificador e uma chave temporária ao navegador.

O arquivo é enviado em blocos de 8 MiB. O navegador não precisa carregar os 10 GB inteiros na memória. Se um bloco falhar, “Tentar continuar” retoma a partir do último bloco confirmado enquanto a página e o arquivo continuam disponíveis. Reabrir a página não restaura automaticamente o envio; cancele o envio incompleto em “Meus arquivos” e comece de novo.

## 4. Banco de dados e arquivos

O D1 guarda nomes, tamanhos, donos, permissões e conteúdo dos documentos colaborativos. O R2 guarda os bytes dos arquivos enviados.

Abra `banco/0001_estrutura.sql` para as tabelas de arquivos, pastas e grupos. `banco/0002_contas_e_espaco.sql` acrescenta contas e contadores de espaço.

Exemplo de consulta local:

```sh
npx wrangler d1 execute solta-db --local --command "SELECT name, size, status FROM files LIMIT 10"
```

As consultas da aplicação usam `?` e `.bind(...)` para separar dados do SQL. Não forme consultas juntando texto digitado por usuários.

Os gatilhos `reserve_file_space` e `release_file_space` atualizam os contadores na mesma transação que muda um arquivo. Isso evita que dois envios simultâneos usem o mesmo espaço disponível.

## 5. Contas

`servidor/contas.js` cuida do cadastro, login e recuperação. A senha original não é guardada. O banco guarda uma derivação com PBKDF2 e um sal diferente por senha. A sessão usa um token aleatório num cookie HttpOnly; o banco guarda só o hash do token.

O código de recuperação funciona como uma chave da conta. Ele aparece uma vez e deve ser guardado pelo usuário. Redefinir a senha troca esse código e revoga as sessões anteriores.

## 6. Colaboração

Estude `cliente/editor.js` depois das telas simples. O Tiptap fornece a edição de texto e o Yjs combina mudanças feitas ao mesmo tempo. A aplicação salva as mudanças e consulta novas versões a cada três segundos enquanto a aba está visível.

`cliente/tela.js` usa WebRTC. Primeiro o navegador pede à pessoa qual janela ou aba deseja mostrar. Depois os participantes trocam sinais pelo servidor para estabelecer a conexão. A transmissão de tela não fica salva no banco.

## Exercícios pequenos

1. Troque a cor principal e o título da página inicial.
2. Acrescente uma mensagem explicando o prazo de 15 dias com suas palavras.
3. Consulte os arquivos do banco local e compare os resultados com “Meus arquivos”.
4. Adicione um filtro de nome à lista local; depois implemente a busca na API usando parâmetros SQL.
5. Rode `npm test` antes de publicar mudanças em cotas ou permissões.

Quando alterar o banco depois da primeira publicação, crie um novo arquivo SQL numerado em `banco/`. Não reescreva uma migração já aplicada.
