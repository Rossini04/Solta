import { showSponsor } from './anuncios.js';

export function infoPage(app, privacy = false) {
  app.innerHTML = privacy ? `<article class="card article"><h1>Privacidade</h1>
    <p>O Solta guarda seu nome de usuário, uma derivação protegida da senha, os arquivos que você envia e os registros necessários para pastas, grupos e documentos.</p>
    <h2>Quem pode acessar</h2><p>Arquivos públicos podem ser listados e baixados por qualquer pessoa durante até 15 dias. Pastas privadas, de grupos e protegidas por senha seguem as permissões indicadas na criação.</p>
    <h2>Sessão e proteção contra abuso</h2><p>Um cookie mantém sua conta conectada por até sete dias. O servidor usa um resumo criptográfico do IP para limitar tentativas de login e denúncias. O endereço de IP também é processado pelo provedor de hospedagem para entregar e proteger o serviço.</p>
    <h2>Exclusão e prazo</h2><p>Você pode excluir seus arquivos em “Meus arquivos”. Arquivos públicos deixam de abrir ao completar 15 dias; a limpeza automática remove os dados armazenados em seguida. Arquivos privados e de grupos ficam até a exclusão e contam nos seus 10 GB.</p>
    <h2>Documentos e tela</h2><p>Documentos são salvos no banco e ficam disponíveis aos membros do grupo. A tela só é compartilhada depois de você escolher o que mostrar no navegador. O Solta não grava a transmissão. A conexão direta pode revelar informações de rede aos participantes.</p>
    <h2>Anúncios</h2><p>Esta versão ainda não carrega redes de anúncios nem cookies de publicidade. Esta página será atualizada antes de ativar uma rede de anúncios.</p>
    <h2>Problemas com um arquivo</h2><p>Use “Denunciar” ao lado do arquivo para avisar a administração sobre dados pessoais, direitos autorais, conteúdo ilegal ou arquivos maliciosos.</p></article>`
    : `<article class="card article"><h1>Como funciona o Solta</h1><p>O Solta reúne compartilhamento de arquivos e colaboração em grupos. Você pode baixar arquivos públicos sem criar conta.</p>
    <h2>Enviar e compartilhar</h2><p>Crie uma conta, escolha um arquivo e aguarde o envio terminar. O botão “Link” copia o endereço para compartilhar. Um arquivo pode ter até 10 GB, desde que caiba no espaço restante da sua conta.</p>
    <h2>Seu espaço de 10 GB</h2><p>A página “Meus arquivos” mostra o que você guarda. Arquivos em pastas, envios incompletos e arquivos privados também ocupam espaço. Exclua o que não precisa antes de enviar mais. A capacidade total do site é compartilhada e novos envios podem ficar indisponíveis quando ela estiver cheia.</p>
    <h2>Arquivos públicos por 15 dias</h2><p>O prazo começa quando o envio termina. Depois dele, o link deixa de funcionar e o arquivo entra na limpeza automática. Guarde uma cópia dos arquivos que deseja manter.</p>
    <h2>Pastas e grupos</h2><p>Uma pasta pode ser pública, privada ou limitada a um grupo. Uma senha opcional acrescenta uma proteção ao acesso. Quem participa de um grupo pode criar documentos, editar junto com os outros membros e compartilhar uma janela ou aba da tela.</p>
    <h2>Recuperar a conta</h2><p>Guarde o código mostrado no cadastro. Na página “Esqueci a senha”, ele permite escolher uma nova senha. Um novo código substitui o anterior quando a recuperação termina.</p>
    <h2>Uso responsável</h2><p>Compartilhe apenas arquivos que você tem direito de disponibilizar. Não envie programas maliciosos, conteúdo ilegal ou dados pessoais de outras pessoas sem autorização. Use o botão “Denunciar” para avisar a administração.</p></article>`;
  if (!privacy) showSponsor(app);
}
