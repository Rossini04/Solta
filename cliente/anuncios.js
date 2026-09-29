// Publicidade direta: combine o patrocínio com o anunciante e preencha estes dados.
// Deixe desativado enquanto não houver um anúncio real autorizado.
export const anuncio = {
  ativo: false,
  titulo: '',
  descricao: '',
  endereco: '', // URL HTTPS do anunciante.
};

export function showSponsor(container) {
  if (!anuncio.ativo || !anuncio.titulo) return;
  let url;
  try { url = new URL(anuncio.endereco); } catch { return; }
  if (url.protocol !== 'https:') return;
  const section = document.createElement('aside');
  section.className = 'card ad-slot';
  const label = document.createElement('small');
  label.textContent = 'Publicidade';
  const link = document.createElement('a');
  link.href = url.href; link.rel = 'sponsored noopener noreferrer'; link.target = '_blank';
  const title = document.createElement('strong');
  title.textContent = anuncio.titulo;
  const description = document.createElement('p');
  description.textContent = anuncio.descricao;
  link.append(title, description); section.append(label, link); container.append(section);
}
