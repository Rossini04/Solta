# Solta

Compartilhamento de arquivos com contas, pastas, grupos, documentos colaborativos e tela ao vivo. O código fica no seu GitHub; a aplicação usa a sua conta Cloudflare.

## Regras desta versão

- Cadastro com nome de usuário e senha para enviar arquivos. Downloads públicos não exigem conta.
- Até **10 GB armazenados por conta**, somando todas as pastas e os envios incompletos. Um arquivo também pode ter até 10 GB. Excluir libera espaço; o site não apaga arquivos antigos para abrir espaço para um novo envio.
- Arquivos públicos expiram **15 dias após concluir o envio**. O link para de funcionar no prazo; o armazenamento é limpo em lotes de dez, a cada cinco minutos. Uma fila grande pode atrasar a remoção física, mas não reabre o acesso.
- Arquivos em pastas privadas e de grupos ficam até o dono excluir e contam na mesma cota. A regra de 15 dias foi aplicada aos arquivos públicos.
- A configuração conserva o intervalo anterior de **um envio a cada duas horas**, agora por conta. Para permitir vários envios dentro dos 10 GB, mude `UPLOAD_INTERVAL_MS` para `"0"` em `wrangler.jsonc`. Essa escolha ainda aguarda confirmação do proprietário.
- Limite inicial de **50 GB para o site inteiro**, compartilhado entre as contas. Os 10 GB são um teto por conta, não uma reserva garantida para cada pessoa.
- Pastas públicas, privadas ou de grupos; senha opcional. Membros de grupos podem enviar arquivos às pastas do grupo.
- Exclusão pelo dono e denúncias de outros arquivos. A administração pode remover arquivos denunciados.
- Editor de texto conjunto com Tiptap e Yjs; compartilhamento de tela por WebRTC, sem gravação e sem áudio.

## Comece aqui

Instale o Node.js 22.13 ou superior, que inclui o npm. Abra um terminal nesta pasta:

```sh
npm ci
npm run db:local
npm run dev
```

Abra `http://127.0.0.1:8787`. Os dados dessa prévia são locais. Alterou HTML, CSS ou JavaScript do navegador? Pare o terminal com Ctrl+C e execute `npm run dev` novamente para reconstruir a interface.

- **[Aprender e modificar](docs/APRENDER.md):** por onde começar e onde fica cada função.
- **[Publicar na sua conta](docs/PUBLICAR.md):** conta Cloudflare, banco, arquivos e endereço público.
- **[Custos e anúncios](docs/CUSTOS-E-ANUNCIOS.md):** limites do primeiro mês e publicidade.

## Estrutura

```text
index.html       estrutura da página
cliente/         JavaScript e CSS do navegador
servidor/        JavaScript da API e das permissões
banco/           SQL que cria as tabelas e os índices
public/          ícone e cabeçalhos de segurança
testes/          testes com banco e armazenamento temporários
wrangler.jsonc   configuração da sua hospedagem
```

A interface usa HTML, CSS e JavaScript sem React. O Vite reúne os arquivos para publicar. O editor colaborativo usa bibliotecas porque sincronizar edições simultâneas é uma parte mais avançada do projeto.

## Testes

```sh
npm run build
npm test
```

Os testes usam Miniflare, D1 e R2 em memória. Verificam autenticação, recuperação, cota e concorrência, envio em partes, download parcial, expiração, limpeza, pastas, grupos, denúncias, sinais de tela e combinação de edições.

O teste de transferência envia cerca de 16,8 MB em três partes. Os limites de 10 GB são verificados pela API e pelo banco, sem transmitir um arquivo inteiro de 10 GB. Sinais de WebRTC testados não comprovam transmissão de vídeo em todas as redes: redes restritas podem exigir um servidor TURN, ainda não configurado por causa do orçamento.

## Migração e situação da publicação

Esta é a versão independente. Ela não usa login, SDK, serviço ou hospedagem da OpenAI. O histórico Git conserva as versões antigas para recuperação.

Os arquivos, contas e documentos do serviço anterior **não foram copiados** para o novo banco. O serviço anterior permanece separado. Antes de desligá-lo, salve os arquivos e documentos que quiser manter; contas da nova versão têm novo cadastro. Uma transferência dos dados antigos precisa de um procedimento específico que preserve os donos e as permissões.

O endereço definitivo na Cloudflare só existe depois de concluir `docs/PUBLICAR.md` com sua conta. O identificador de banco incluído na configuração é local e o comando de publicação rejeita esse identificador.
