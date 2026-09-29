import { ApiError, handle, json, sameOrigin } from './banco.js';
import { identity } from './acesso.js';
import { auth } from './contas.js';
import { session, listFiles, createUpload, uploadPart, completeUpload, deleteFile } from './arquivos.js';
import { cleanup } from './limpeza.js';
import * as download from './download.js';
import * as folders from './pastas.js';
import * as unlock from './senha-pasta.js';
import * as groups from './grupos.js';
import * as reports from './denuncias.js';
import * as documents from './documentos.js';
import * as document from './documento.js';
import * as presence from './presenca.js';
import * as signals from './sinais.js';

async function call(module, request, id) {
  const action = module[request.method];
  if (!action) throw new ApiError(405, 'Método não permitido.');
  return action(request, { params: Promise.resolve({ id }) });
}

async function api(request) {
  const path = new URL(request.url).pathname;
  const method = request.method;
  if (!['GET', 'HEAD'].includes(method)) sameOrigin(request);
  if (path === '/api/session' && method === 'GET') return session(request);
  const account = /^\/api\/auth\/(register|login|logout|recover)$/.exec(path);
  if (account && method === 'POST') return auth(request, account[1]);
  if (path === '/api/files') {
    if (method === 'GET') return listFiles(request);
    if (method === 'POST') return createUpload(request);
  }
  let match = /^\/api\/files\/([a-f0-9-]+)$/.exec(path);
  if (match && method === 'DELETE') return deleteFile(request, match[1]);
  match = /^\/api\/uploads\/([a-f0-9-]+)$/.exec(path);
  if (match) {
    if (method === 'PUT') return uploadPart(request, match[1]);
    if (method === 'POST') return completeUpload(request, match[1]);
    if (method === 'DELETE') return deleteFile(request, match[1]);
  }
  match = /^\/api\/download\/([a-f0-9-]+)$/.exec(path);
  if (match) return call(download, request, match[1]);
  if (path === '/api/folders') return call(folders, request);
  match = /^\/api\/folders\/([a-f0-9-]+)\/unlock$/.exec(path);
  if (match) return call(unlock, request, match[1]);
  if (path === '/api/groups') return call(groups, request);
  if (path === '/api/reports') return call(reports, request);
  if (path === '/api/documents') return call(documents, request);
  match = /^\/api\/documents\/([a-f0-9-]+)(?:\/(presence|signals))?$/.exec(path);
  if (match) return call(match[2] === 'presence' ? presence : match[2] === 'signals' ? signals : document, request, match[1]);
  if (path === '/api/admin/cleanup' && method === 'POST') {
    const who = await identity(request);
    if (!who.admin) throw new ApiError(403, 'Área restrita à administração.');
    return json(await cleanup());
  }
  throw new ApiError(404, 'Endereço não encontrado.');
}

export default {
  async fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const response = await handle(() => api(request));
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'same-origin');
    return response;
  },
  async scheduled() { await cleanup(); },
};
