// Run against a built LOCAL Wrangler preview, with ADMIN_EMAIL=test-admin@sites.test.
// The Sites edge supplies trusted identity headers in production. These headers
// are injected only into loopback requests here to test distinct accounts.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import * as Y from 'yjs';
const base = process.env.TEST_URL || 'http://127.0.0.1:8787';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Tests must use a local preview.');
const run = randomUUID(), ip = () => `test-${randomUUID()}`;
async function http(url, method, headers, body) {
  const args=['--silent','--show-error','--max-time','30','--include','--request',method];
  if(method==='HEAD') args.push('--head');
  for(const [key,value] of Object.entries(headers)) args.push('--header',`${key}: ${value}`);
  if(body !== undefined) args.push('--data-binary','@-');
  args.push(url);
  const buffer = await new Promise((resolve,reject)=>{
    const child=spawn(process.platform==='win32'?'curl.exe':'curl',args,{windowsHide:true});
    const out=[],errors=[];child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>errors.push(b));child.on('error',reject);
    child.on('close',code=>code===0?resolve(Buffer.concat(out)):reject(new Error(Buffer.concat(errors).toString())));
    child.stdin.end(body);
  });
  let remaining=buffer,status=100,resultHeaders;
  while(status===100){const end=remaining.indexOf('\r\n\r\n'),lines=remaining.subarray(0,end).toString().split('\r\n');status=Number(lines.shift().split(' ')[1]);resultHeaders=new Headers();for(const line of lines){const pos=line.indexOf(':');if(pos>0)resultHeaders.append(line.slice(0,pos),line.slice(pos+1).trim());}remaining=remaining.subarray(end+4);}
  return new Response(method==='HEAD'?null:remaining,{status,headers:resultHeaders});
}
function client(user = '', address = ip(), email = '') {
  const cookies = new Map();
  return { address, async request(path, method = 'GET', body, expected = 200, extra = {}) {
    if (process.env.TEST_VERBOSE) console.log(method, path);
    const headers = { 'cf-connecting-ip': address, Origin: base, Connection: 'close', 'Accept-Encoding': 'identity', ...extra };
    if (user) Object.assign(headers, { 'oai-authenticated-user-id': user, 'oai-authenticated-user-email': email || `${user}@sites.test` });
    if (cookies.size) headers.Cookie = [...cookies].map(([k,v]) => `${k}=${v}`).join('; ');
    if (body && !(body instanceof Uint8Array)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
    const response = await http(base + path, method, headers, body);
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], index = pair.indexOf('='); cookies.set(pair.slice(0,index), pair.slice(index+1)); }
    if (response.status !== expected) throw new Error(`${method} ${path}: expected ${expected}, got ${response.status} ${await response.text()}`);
    return response;
  }, async json(...args) { return (await this.request(...args)).json(); } };
}
const owner = client(`owner-${run}`), member = client(`member-${run}`), stranger = client(`stranger-${run}`), admin = client('admin', ip(), 'test-admin@sites.test');
const anonymous = client(), sameIP = client('', anonymous.address), changedIP = client();
const summary = [];
const record = name => { summary.push(name); console.log(`PASS ${name}`); };
const sha = x => createHash('sha256').update(x).digest('hex');
await anonymous.json('/api/session');
await anonymous.json('/api/files','POST',{name:'large.bin',size:10_000_000_001},400);
const max = await anonymous.json('/api/files','POST',{name:'limit.bin',size:10_000_000_000},201);
assert.ok(max.nextUploadAt > Date.now()+7_190_000 && max.nextUploadAt <= Date.now()+7_200_000);
await sameIP.json('/api/files','POST',{name:'another.bin',size:1},429);
await anonymous.json(`/api/uploads/${max.id}`,'DELETE',undefined,200,{Authorization:`Bearer ${max.token}`});
record('10 GB boundary, atomic two-hour IP quota, cancellation releases reservation');
const bytes = randomBytes(8*1024*1024*2+1337);
async function upload(who, data, folderId) {
  const file = await who.json('/api/files','POST',{name:`validation-${run}.bin`,size:data.length,folderId},201);
  for(let offset=0,n=1;offset<data.length;offset+=file.chunkSize,n++) await who.json(`/api/uploads/${file.id}?part=${n}`,'PUT',data.subarray(offset,offset+file.chunkSize),200,{Authorization:`Bearer ${file.token}`,'Content-Type':'application/octet-stream'});
  await who.json(`/api/uploads/${file.id}`,'POST',undefined,200,{Authorization:`Bearer ${file.token}`});
  return file;
}
const publicFile = await upload(anonymous,bytes);
assert.equal((await stranger.request(`/api/download/${publicFile.id}`,'HEAD')).headers.get('content-length'),String(bytes.length));
assert.equal(sha(Buffer.from(await (await stranger.request(`/api/download/${publicFile.id}`)).arrayBuffer())),sha(bytes));
const partial=await stranger.request(`/api/download/${publicFile.id}`,'GET',undefined,206,{Range:'bytes=11-137'});assert.deepEqual(Buffer.from(await partial.arrayBuffer()),bytes.subarray(11,138));
assert.equal((await anonymous.json(`/api/files?id=${publicFile.id}`)).canDelete,true);
assert.equal((await sameIP.json(`/api/files?id=${publicFile.id}`)).canDelete,false);
await sameIP.json(`/api/files/${publicFile.id}`,'DELETE',undefined,403);
await stranger.json(`/api/files/${publicFile.id}`,'DELETE',undefined,403);
record('Multipart upload integrity, ranged download, ownership protects others sharing the same IP');
await stranger.json('/api/reports','POST',{fileId:publicFile.id,reason:'Outro motivo',details:'Local integration test'},201);
await stranger.json('/api/reports','GET',undefined,403);
const reports=await admin.json('/api/reports');const report=reports.reports.find(r=>r.file_id===publicFile.id);assert.ok(report);
await admin.json('/api/reports','PATCH',{id:report.id});
await anonymous.json(`/api/files/${publicFile.id}`,'DELETE');
await stranger.request(`/api/download/${publicFile.id}`,'GET',undefined,404);
await anonymous.json('/api/files','POST',{name:'still-limited.bin',size:1},429);
record('Reports, administrator moderation, owner deletion, cooldown persists after deletion');
await anonymous.json('/api/folders','POST',undefined,401);
const privateFolder = await owner.json('/api/folders','POST',{name:`Private ${run}`,access:'private'},201);
await stranger.json(`/api/folders?id=${privateFolder.id}`,'GET',undefined,403);
const locked = await owner.json('/api/folders','POST',{name:`Password ${run}`,access:'public',password:'test-only-123'},201);
const protectedFile=await upload(owner,Buffer.from('password protected content'),locked.id);
await stranger.request(`/api/download/${protectedFile.id}`,'GET',undefined,423);
await stranger.json(`/api/files?folder=${locked.id}`,'GET',undefined,423);
await stranger.json(`/api/folders/${locked.id}/unlock`,'POST',{password:'incorrect'},403);
await stranger.json(`/api/folders/${locked.id}/unlock`,'POST',{password:'test-only-123'});
assert.equal(await (await stranger.request(`/api/download/${protectedFile.id}`)).text(),'password protected content');
await stranger.json('/api/files','POST',{name:'blocked.bin',size:1,folderId:locked.id},403);
assert.equal((await anonymous.json('/api/files')).files.some(f=>f.id===protectedFile.id),false);
record('Private folders, salted passwords, direct-download authorization, public-list isolation');
const group = await owner.json('/api/groups','POST',{name:`Validation ${run}`},201);
const details = await owner.json(`/api/groups?id=${group.id}`);
await stranger.json(`/api/groups?id=${group.id}`,'GET',undefined,403);
await member.json('/api/groups','POST',{invite:details.group.invite});
const groupFolder=await owner.json('/api/folders','POST',{name:'Shared assets',access:'group',groupId:group.id},201);
const groupFile=await upload(member,Buffer.from('group content'),groupFolder.id);
await owner.request(`/api/download/${groupFile.id}`);
await stranger.request(`/api/download/${groupFile.id}`,'GET',undefined,403);
record('Group invitations, member uploads, outsiders denied');
const doc = await owner.json('/api/documents','POST',{name:'Concurrent document',groupId:group.id},201);
await stranger.json(`/api/documents/${doc.id}`,'GET',undefined,403);
const a=new Y.Doc(),b=new Y.Doc();a.getText('test').insert(0,'Alice ');b.getText('test').insert(0,'Bob ');
const enc=d=>Buffer.from(Y.encodeStateAsUpdate(d)).toString('base64');
await Promise.all([owner.json(`/api/documents/${doc.id}`,'POST',{update:enc(a)}),member.json(`/api/documents/${doc.id}`,'POST',{update:enc(b)})]);
let current=await owner.json(`/api/documents/${doc.id}`);const merged=new Y.Doc();Y.applyUpdate(merged,Buffer.from(current.state,'base64'));assert.ok(merged.getText('test').toString().includes('Alice'));assert.ok(merged.getText('test').toString().includes('Bob'));
await owner.json(`/api/documents/${doc.id}`,'POST',{update:enc(a)});current=await member.json(`/api/documents/${doc.id}`);const check=new Y.Doc();Y.applyUpdate(check,Buffer.from(current.state,'base64'));assert.equal(check.getText('test').toString(),merged.getText('test').toString());
record('Concurrent CRDT merge retains both edits; repeat updates are idempotent');
const peerA=randomUUID(),peerB=randomUUID();
await owner.json(`/api/documents/${doc.id}/presence`,'POST',{peerId:peerA,sharing:true});
await member.json(`/api/documents/${doc.id}/presence`,'POST',{peerId:peerB,sharing:false});
await member.json(`/api/documents/${doc.id}/presence`,'POST',{peerId:peerA,sharing:false},403);
await owner.json(`/api/documents/${doc.id}/signals`,'POST',{sender:peerA,receiver:peerB,payload:{type:'offer',description:{type:'offer',sdp:'local-protocol-test'}}});
const events=await member.json(`/api/documents/${doc.id}/signals?peer=${peerB}&after=0`);assert.equal(events.signals.length,1);
await stranger.json(`/api/documents/${doc.id}/signals?peer=${peerB}&after=0`,'GET',undefined,403);
await owner.json(`/api/documents/${doc.id}/signals?peer=${peerB}&after=0`,'GET',undefined,403);
record('Screen signaling, presence, peer ownership, and group isolation');
await admin.json(`/api/files/${protectedFile.id}`,'DELETE');
await admin.json(`/api/files/${groupFile.id}`,'DELETE');
console.log(JSON.stringify({passed:summary.length,summary},null,2));
