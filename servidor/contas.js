import { cookie, cookieValue, identity, passwordHash, verifyPassword, rateLimit } from './acesso.js';
import { ApiError, storage, json, readJson, hash } from './banco.js';

function checkCredentials(body) {
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(body?.username ?? '')) throw new ApiError(400, 'Use de 3 a 32 letras, números ou sublinhados no usuário.');
  if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128) throw new ApiError(400, 'Use uma senha de 10 a 128 caracteres.');
  return body.username.toLowerCase();
}
async function signIn(request, user, extra = {}) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const age = 7 * 24 * 60 * 60;
  await storage().db.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)').bind(await hash(token), user.id, Date.now() + age * 1000).run();
  const response = json({ user: { id: user.id, name: user.username }, ...extra });
  response.headers.append('Set-Cookie', cookie(request, 'solta_session', token, age));
  return response;
}
export async function auth(request, action) {
  const who = await identity(request);
  const { db } = storage();
  if (action === 'logout') {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hash(cookieValue(request, 'solta_session'))).run();
    const response = json({ signedOut: true });
    response.headers.append('Set-Cookie', cookie(request, 'solta_session', '', 0));
    return response;
  }
  const body = await readJson(request);
  const username = checkCredentials(body);
  await rateLimit(`auth-ip:${who.ip}`, 30, 600000);
  await rateLimit(`auth-user:${username}`, 10, 600000);
  if (action === 'register') {
    await rateLimit(`register:${who.ip}`, 5, 86400000);
    if (await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first()) throw new ApiError(409, 'Este nome de usuário já está em uso.');
    const id = crypto.randomUUID();
    const recoveryCode = crypto.randomUUID() + crypto.randomUUID();
    const password = await passwordHash(body.password);
    try {
      await db.prepare('INSERT INTO users (id, username, password_hash, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, username, password, await hash(recoveryCode), Date.now()).run();
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) throw new ApiError(409, 'Este nome de usuário já está em uso.');
      throw error;
    }
    return signIn(request, { id, username }, { recoveryCode });
  }
  if (action === 'login') {
    const user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
    const valid = await verifyPassword(body.password, user?.password_hash ?? 'missing:0000000000000000000000000000000000000000000000000000000000000000');
    if (!user || !valid) throw new ApiError(401, 'Usuário ou senha incorretos.');
    return signIn(request, user);
  }
  if (action === 'recover') {
    if (typeof body.recoveryCode !== 'string' || body.recoveryCode.length > 100) throw new ApiError(400, 'Informe seu código de recuperação.');
    const oldHash = await hash(body.recoveryCode.trim());
    const code = crypto.randomUUID() + crypto.randomUUID();
    const password = await passwordHash(body.password);
    const user = await db.prepare('UPDATE users SET password_hash = ?, recovery_hash = ? WHERE username = ? AND recovery_hash = ? RETURNING id, username').bind(password, await hash(code), username, oldHash).first();
    if (!user) throw new ApiError(401, 'Usuário ou código de recuperação inválidos.');
    await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
    return signIn(request, user, { recoveryCode: code });
  }
  throw new ApiError(404, 'Ação não encontrada.');
}
