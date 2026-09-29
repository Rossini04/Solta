import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Miniflare } from 'miniflare';
import * as Y from 'yjs';

// Banco e armazenamento em memória. Estes testes nunca acessam a sua conta.
test('Solta: contas, arquivos, permissões e colaboração', { timeout: 180000 }, async t => {
  const mf = new Miniflare({
    modules: true,
    scriptPath: '.wrangler/build-check/index.js',
    compatibilityDate: '2026-05-15',
    d1Databases: ['DB'], r2Buckets: ['BUCKET'],
    bindings: { SITE_STORAGE_LIMIT_BYTES: '50000000000', UPLOAD_INTERVAL_MS: '0', R2_MONTHLY_A_LIMIT: '100000', R2_MONTHLY_B_LIMIT: '500000' },
  });
  try {
    const db = await mf.getD1Database('DB');
    const bucket = await mf.getR2Bucket('BUCKET');
    for (const file of fs.readdirSync('banco').filter(name => name.endsWith('.sql')).sort()) {
      const sql = fs.readFileSync(`banco/${file}`, 'utf8').replace(/^--.*$/gm, '').replace(/\r?\n/g, ' ');
      await db.exec(sql);
    }
    async function request(client, path, method = 'GET', body, headers = {}) {
      const options = { method, headers: { Origin: 'https://solta.test', 'CF-Connecting-IP': client?.ip ?? '192.0.2.10', ...headers } };
      if (client?.cookie) options.headers.Cookie = client.cookie;
      if (body !== undefined) {
        options.body = body instanceof Uint8Array ? body : JSON.stringify(body);
        if (!(body instanceof Uint8Array)) options.headers['Content-Type'] = 'application/json';
      }
      const response = await mf.dispatchFetch(`https://solta.test${path}`, options);
      const cookie = response.headers.get('set-cookie');
      if (cookie && client) client.cookie = cookie.split(';')[0];
      const bytes = new Uint8Array(await response.arrayBuffer());
      let value;
      try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch {}
      return { status: response.status, value, bytes, headers: response.headers };
    }
    const alice = { ip: '192.0.2.1' }, bob = { ip: '192.0.2.2' }, outsider = { ip: '192.0.2.3' };
    const password = 'Senha local de teste 123';
    async function register(client, username) {
      const response = await request(client, '/api/auth/register', 'POST', { username, password });
      assert.equal(response.status, 200, JSON.stringify(response.value));
      client.id = response.value.user.id; client.recoveryCode = response.value.recoveryCode;
      return response;
    }
    await t.test('cadastro, login e sessão sem identidade externa', async () => {
      const result = await register(alice, 'alice');
      assert.match(result.headers.get('set-cookie'), /HttpOnly.*SameSite=Lax.*Secure/);
      await register(bob, 'bob'); await register(outsider, 'outsider');
      const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(alice.id).first();
      assert.notEqual(row.password_hash, password);
      assert.equal((await request(null, '/api/files', 'POST')).status, 401);
      assert.equal((await request(null, '/api/files', 'POST', undefined, { 'oai-authenticated-user-id': alice.id })).status, 401);
      assert.equal((await request({}, '/api/auth/login', 'POST', { username: 'alice', password: 'errada000000' })).status, 401);
      assert.equal((await request(alice, '/api/session')).value.user.name, 'alice');
      assert.equal((await request(alice, '/api/files', 'POST', {}, { Origin: 'https://outro.test' })).status, 403);
    });
    async function reserve(client, size, folderId) {
      return request(client, '/api/files', 'POST', { name: 'teste.txt', size, mime: 'text/plain', folderId });
    }
    async function remove(client, id) { return request(client, `/api/files/${id}`, 'DELETE'); }
    async function finish(client, bytes, folderId) {
      const reservation = await reserve(client, bytes.byteLength, folderId);
      assert.equal(reservation.status, 201, JSON.stringify(reservation.value));
      const upload = reservation.value;
      for (let offset = 0, part = 1; offset < bytes.byteLength; offset += upload.chunkSize, part++) {
        const result = await request(client, `/api/uploads/${upload.id}?part=${part}`, 'PUT', bytes.slice(offset, offset + upload.chunkSize), { Authorization: `Bearer ${upload.token}` });
        assert.equal(result.status, 200, JSON.stringify(result.value));
      }
      const result = await request(client, `/api/uploads/${upload.id}`, 'POST', undefined, { Authorization: `Bearer ${upload.token}` });
      assert.equal(result.status, 200, JSON.stringify(result.value));
      return result.value;
    }
    await t.test('cota de 10 GB, concorrência, isolamento e liberação', async () => {
      assert.equal((await reserve(alice, 10000000001)).status, 400);
      const full = await reserve(alice, 10000000000);
      assert.equal(full.status, 201);
      assert.equal((await reserve(alice, 1)).status, 413);
      assert.equal((await request(alice, '/api/session')).value.storage.used, 10000000000);
      assert.equal((await remove(bob, full.value.id)).status, 403);
      assert.equal((await remove(alice, full.value.id)).status, 200);
      assert.equal((await request(alice, '/api/session')).value.storage.used, 0);
      const concurrent = await Promise.all([reserve(alice, 6000000000), reserve(alice, 6000000000)]);
      assert.deepEqual(concurrent.map(result => result.status).sort(), [201, 413]);
      await remove(alice, concurrent.find(result => result.status === 201).value.id);
    });
    let publicFile;
    await t.test('multipart, download, faixa de bytes e denúncia', async () => {
      const bytes = new Uint8Array(2 * 8388608 + 777);
      for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
      publicFile = await finish(alice, bytes);
      assert.ok(Math.abs(publicFile.expires_at - Date.now() - 15 * 86400000) < 10000);
      assert.deepEqual((await request(null, `/api/download/${publicFile.id}`)).bytes, bytes);
      const range = await request(null, `/api/download/${publicFile.id}`, 'GET', undefined, { Range: 'bytes=100-199' });
      assert.equal(range.status, 206); assert.deepEqual(range.bytes, bytes.slice(100, 200));
      assert.equal((await request(null, `/api/download/${publicFile.id}`, 'HEAD')).headers.get('content-length'), String(bytes.length));
      const report = await request(bob, '/api/reports', 'POST', { fileId: publicFile.id, reason: 'Outro motivo', details: 'Teste de denúncia' });
      assert.equal(report.status, 201);
      assert.equal((await request(bob, '/api/reports')).status, 403);
      const mine = await request(alice, '/api/files?mine=1'); assert.ok(mine.value.files.some(file => file.id === publicFile.id && file.canDelete));
    });
    await t.test('expiração imediata e limpeza do arquivo e da cota', async () => {
      await db.prepare('UPDATE files SET expires_at = ? WHERE id = ?').bind(Date.now() - 1, publicFile.id).run();
      assert.equal((await request(null, `/api/download/${publicFile.id}`)).status, 410);
      assert.equal((await request(null, `/api/files?id=${publicFile.id}`)).status, 410);
      assert.ok(!(await request(null, '/api/files')).value.files.some(file => file.id === publicFile.id));
      await db.prepare('UPDATE users SET admin = 1 WHERE id = ?').bind(alice.id).run();
      assert.equal((await request(alice, '/api/admin/cleanup', 'POST')).status, 200);
      assert.equal(await bucket.head(`files/${publicFile.id}`), null);
      assert.equal((await request(alice, '/api/session')).value.storage.used, 0);
      assert.equal((await request(bob, '/api/admin/cleanup', 'POST')).status, 403);
      await db.prepare('UPDATE users SET admin = 0 WHERE id = ?').bind(alice.id).run();
    });
    let group, document;
    await t.test('pastas privadas, senhas e permissões de grupos', async () => {
      const privateFolder = (await request(alice, '/api/folders', 'POST', { name: 'Privada', access: 'private' })).value.id;
      const secret = await finish(alice, new TextEncoder().encode('segredo'), privateFolder);
      assert.equal(secret.expires_at, null);
      assert.equal((await request(bob, `/api/download/${secret.id}`)).status, 403);
      assert.equal((await request(alice, `/api/download/${secret.id}`)).status, 200);
      assert.ok(!(await request(null, '/api/files')).value.files.some(file => file.id === secret.id));
      const protectedFolder = (await request(alice, '/api/folders', 'POST', { name: 'Com senha', access: 'public', password: 'pastasegura' })).value.id;
      const protectedFile = await finish(alice, new TextEncoder().encode('com senha'), protectedFolder);
      const visitor = {};
      assert.equal((await request(visitor, `/api/download/${protectedFile.id}`)).status, 423);
      assert.equal((await request(visitor, `/api/folders/${protectedFolder}/unlock`, 'POST', { password: 'incorreta' })).status, 403);
      assert.equal((await request(visitor, `/api/folders/${protectedFolder}/unlock`, 'POST', { password: 'pastasegura' })).status, 200);
      assert.equal((await request(visitor, `/api/download/${protectedFile.id}`)).status, 200);
      group = (await request(alice, '/api/groups', 'POST', { name: 'Equipe de teste' })).value.id;
      const invite = (await request(alice, `/api/groups?id=${group}`)).value.group.invite;
      assert.equal((await request(bob, '/api/groups', 'POST', { invite })).status, 200);
      const folder = (await request(alice, '/api/folders', 'POST', { name: 'Equipe', access: 'group', groupId: group })).value.id;
      assert.equal((await reserve(outsider, 10, folder)).status, 403);
      const shared = await finish(bob, new TextEncoder().encode('grupo'), folder);
      assert.equal((await request(outsider, `/api/download/${shared.id}`)).status, 403);
      assert.equal((await request(alice, `/api/download/${shared.id}`)).status, 200);
      document = (await request(alice, '/api/documents', 'POST', { groupId: group, name: 'Plano' })).value.id;
    });
    await t.test('edições concorrentes sem perda e sinais isolados por participante', async () => {
      const first = new Y.Doc(), second = new Y.Doc();
      first.getText('test').insert(0, 'Alice'); second.getText('test').insert(0, 'Bob');
      const updates = [first, second].map(doc => Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'));
      const result = await Promise.all([request(alice, `/api/documents/${document}`, 'POST', { update: updates[0] }), request(bob, `/api/documents/${document}`, 'POST', { update: updates[1] })]);
      assert.ok(result.every(response => response.status === 200));
      const saved = (await request(alice, `/api/documents/${document}`)).value;
      const merged = new Y.Doc(); Y.applyUpdate(merged, Buffer.from(saved.state, 'base64'));
      assert.match(merged.getText('test').toString(), /Alice/); assert.match(merged.getText('test').toString(), /Bob/);
      assert.equal((await request(outsider, `/api/documents/${document}`)).status, 403);
      const a = crypto.randomUUID(), b = crypto.randomUUID();
      await request(alice, `/api/documents/${document}/presence`, 'POST', { peerId: a, sharing: true });
      await request(bob, `/api/documents/${document}/presence`, 'POST', { peerId: b, sharing: false });
      assert.equal((await request(bob, `/api/documents/${document}/presence`, 'POST', { peerId: a, sharing: true })).status, 403);
      assert.equal((await request(alice, `/api/documents/${document}/signals`, 'POST', { sender: a, receiver: b, payload: { type: 'stop' } })).status, 200);
      assert.equal((await request(bob, `/api/documents/${document}/signals?peer=${b}`)).value.signals.length, 1);
      assert.equal((await request(alice, `/api/documents/${document}/signals?peer=${b}`)).status, 403);
      first.destroy(); second.destroy(); merged.destroy();
    });
    await t.test('recuperação troca senha e revoga sessões antigas', async () => {
      const stale = { ...bob };
      const result = await request(bob, '/api/auth/recover', 'POST', { username: 'bob', password: 'Nova senha de teste 123', recoveryCode: bob.recoveryCode });
      assert.equal(result.status, 200);
      assert.notEqual(result.value.recoveryCode, bob.recoveryCode);
      assert.equal((await request(stale, '/api/session')).value.user, null);
      assert.equal((await request({}, '/api/auth/login', 'POST', { username: 'bob', password })).status, 401);
      assert.equal((await request({}, '/api/auth/login', 'POST', { username: 'bob', password: 'Nova senha de teste 123' })).status, 200);
    });
    await t.test('limite global e orçamento de operações bloqueiam novos gastos', async () => {
      const old = await db.prepare("SELECT bytes FROM storage_usage WHERE id = 'global'").first();
      await db.prepare("UPDATE storage_usage SET bytes = 50000000000 WHERE id = 'global'").run();
      assert.equal((await reserve(alice, 1)).status, 507);
      await db.prepare("UPDATE storage_usage SET bytes = ? WHERE id = 'global'").bind(old.bytes).run();
      const key = `r2:A:${new Date().toISOString().slice(0,7)}`;
      await db.prepare('UPDATE upload_limits SET count = 100000 WHERE key = ?').bind(key).run();
      const before = (await request(alice, '/api/session')).value.storage.used;
      assert.equal((await reserve(alice, 1)).status, 503);
      assert.equal((await request(alice, '/api/session')).value.storage.used, before);
    });
  } finally { await mf.dispose(); }
});
