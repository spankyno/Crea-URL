// Suite de extremo a extremo: Worker REAL en workerd + D1 real (SQLite) + Supabase/Clerk simulados.
// No se ejecuta sola: la lanza tests/e2e/run.mjs (npm run test:e2e), que arranca antes wrangler dev.
import http from 'node:http'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { generateKeyPairSync, createSign } from 'node:crypto'; import { execSync } from 'node:child_process';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const BASE=process.env.E2E_BASE||'http://127.0.0.1:8787';
const MOCK_PORT=+(process.env.E2E_MOCK_PORT||8801);
const STATE=process.env.E2E_STATE||path.join(ROOT,'.wrangler','e2e-state');
const { publicKey, privateKey } = generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'k1',alg:'RS256'};
const issuer='http://127.0.0.1:'+MOCK_PORT;
const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const tok=(sub,extra={})=>{const h=b({alg:'RS256',kid:'k1'}),p=b({sub,iss:issuer,exp:Math.floor(Date.now()/1000)+300,...extra});return `${h}.${p}.${createSign('RSA-SHA256').update(h+'.'+p).sign(privateKey).toString('base64url')}`};
// --- Supabase + Clerk simulados ---
const store=new Map(); const storeLog=[];
http.createServer((req,res)=>{ const u=new URL(req.url,'http://x');
  if(u.pathname==='/.well-known/jwks.json'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({keys:[jwk]}))}
  const m=u.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/); if(!m){res.statusCode=404;return res.end('nf')}
  const key=m[2]; storeLog.push(req.method+' '+m[1]+'/'+key);
  if(req.headers.authorization!=='Bearer clave-de-prueba'){res.statusCode=401;return res.end('{"message":"bad key"}')}
  if(req.method==='GET'){ if(store.has(key)){res.setHeader('content-type','text/html');return res.end(store.get(key))} res.statusCode=404;return res.end('{"message":"Object not found"}')}
  if(req.method==='DELETE'){store.delete(key);return res.end('{}')}
  let body=''; req.on('data',d=>body+=d); req.on('end',()=>{store.set(key,body);res.end('{"Key":"ok"}')});
}).listen(MOCK_PORT);
let ipn=0; const nextIp=()=>'10.7.'+Math.floor(++ipn/250)+'.'+(ipn%250);
const call=async(m,p,{id,token,body,ip,headers={}}={})=>{ const h={'content-type':'application/json','cf-connecting-ip':ip||nextIp(),...headers}; if(id)h['x-user-id']=id; if(token)h.authorization='Bearer '+token;
  const t0=performance.now(); let r; for(let k=0;k<3;k++){ try{ r=await fetch(BASE+p,{method:m,headers:{...h,connection:'close'},body:body?JSON.stringify(body):undefined,redirect:'manual'}); break }catch(e){ if(k===2) throw e; await new Promise(x=>setTimeout(x,300)) } } const t=await r.text(); let j={}; try{j=JSON.parse(t)}catch{}; return {s:r.status,h:r.headers,t,j,ms:Math.round(performance.now()-t0)} };
let fails=0,total=0; const T=(n,ok,x='')=>{total++;console.log((ok?'  OK  ':' FALLO ')+n.padEnd(76)+x); if(!ok) fails++};
const d1=(sql)=>execSync(`npx wrangler d1 execute crea_url_db --local --config tests/e2e/wrangler.e2e.toml --persist-to "${STATE}" --json --command "${sql.replace(/"/g,'\\"')}"`,{cwd:ROOT,env:{...process.env,CI:'1',WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','ignore']}).toString();
const d1rows=(sql)=>{try{const j=JSON.parse(d1(sql));return j[0].results}catch(e){return []}};
const A='anon_'+'e2eAnonSecret00000000001', B='anon_'+'e2eOtherSecret0000000002';
const html=(t)=>`<!doctype html><html><head><title>${t}</title></head><body><h1>${t}</h1></body></html>`;

console.log('\n[A] Aplicación estática y cabeceras (workerd real)');
let r=await call('GET','/'); T('GET / → 200 HTML de la aplicación',r.s===200&&/<div id="root">/.test(r.t));
T('  CSP en modo informe + frame-ancestors + hash del script en línea',/frame-ancestors 'self'/.test(r.h.get('content-security-policy')||'')&&/'sha256-/.test(r.h.get('content-security-policy-report-only')||''));
T('  HSTS, nosniff, X-Frame-Options',!!r.h.get('strict-transport-security')&&r.h.get('x-content-type-options')==='nosniff'&&r.h.get('x-frame-options')==='SAMEORIGIN');
r=await call('GET','/acerca-de'); T('GET /acerca-de → 200 (acerca-de.html por html_handling)',r.s===200&&/Acerca de Crea URL/.test(r.t));
r=await call('GET','/preview-frame'); T('GET /preview-frame → 200 con CSP sandbox sin allow-same-origin',r.s===200&&(r.h.get('content-security-policy')||'').startsWith('sandbox')&&!/allow-same-origin/.test(r.h.get('content-security-policy')));
r=await call('GET','/p/inexistente'); T('GET /p/inexistente → SPA con noindex',r.s===200&&/<div id="root">/.test(r.t)&&r.h.get('x-robots-tag')==='noindex');
r=await call('GET','/assets/no-existe-123.js'); T('asset inexistente → 404 real (no la SPA)',r.s===404);
r=await call('GET','/robots.txt'); T('/robots.txt y /sitemap.xml',r.s===200&&/Sitemap/.test(r.t)&&(await call('GET','/sitemap.xml')).s===200);
r=await call('GET','/og-image.jpg'); T('/og-image.jpg se sirve',r.s===200&&/image\/jpeg/.test(r.h.get('content-type')||''));

console.log('\n[B] Anónimo: publicar, ver, listar, borrar (SQL real)');
r=await call('POST','/api/pages',{id:A,ip:'20.0.0.1',body:{html:html('Hola E2E'),title:'Hola E2E',customSlug:'e2e-uno'}}); T('POST /api/pages → 201',r.s===201,'→ '+r.s+' '+(r.j.error||''));
T('  el HTML llegó al almacenamiento (Supabase simulado)',store.get('e2e-uno.html')?.includes('Hola E2E'));
const row=d1rows("SELECT user_id, size_bytes, has_password, expires_at FROM pages WHERE slug='e2e-uno'")[0]||{};
T('  fila real en D1 con propietario hasheado (anonh_...), no el secreto',/^anonh_[0-9a-f]{32}$/.test(row.user_id||'')&&!(row.user_id||'').includes('e2eAnon'),row.user_id);
r=await call('GET','/api/pages/e2e-uno',{ip:'20.0.0.2'}); T('GET público → 200 con html y sin identificadores',r.s===200&&r.j.html?.includes('Hola E2E')&&!('userId' in r.j.page));
r=await call('GET','/raw/e2e-uno',{ip:'20.0.0.3'}); T('GET /raw → 200 con CSP sandbox y noindex',r.s===200&&/sandbox allow-scripts/.test(r.h.get('content-security-policy')||'')&&r.h.get('x-robots-tag')==='noindex');
r=await call('GET','/api/pages',{id:A}); T('listado del dueño (OR user_id) → 1 página',r.s===200&&r.j.pages.length===1&&r.j.pages[0].slug==='e2e-uno');
r=await call('GET','/api/pages',{id:B}); T('otro anónimo no ve nada',r.j.pages.length===0);
r=await call('DELETE','/api/pages/e2e-uno',{id:B}); T('otro anónimo no puede borrar → 403',r.s===403);
r=await call('PUT','/api/pages/e2e-uno',{id:A,body:{html:html('Editada'),title:'Editada'}}); T('el dueño edita (UPDATE real) → 200',r.s===200&&store.get('e2e-uno.html').includes('Editada'));
r=await call('PATCH','/api/pages/e2e-uno/extend',{id:A}); T('prorrogar → 200',r.s===200);
r=await call('DELETE','/api/pages/e2e-uno',{id:A}); T('el dueño borra → 200 y desaparece de D1 y del almacenamiento',r.s===200&&!store.has('e2e-uno.html')&&d1rows("SELECT slug FROM pages WHERE slug='e2e-uno'").length===0);

console.log('\n[C] Usuario registrado con token de Clerk (JWT real verificado en workerd)');
const U=tok('user_REG1'); 
r=await call('GET','/api/me',{token:U}); T('/api/me con token válido → user',r.j.role==='user'&&r.j.userId==='user_REG1'&&r.j.authenticated===true);
r=await call('GET','/api/me',{token:tok('user_REG1')+'x'}); T('firma alterada → 401',r.s===401);
r=await call('GET','/api/me',{token:tok('user_REG1',{azp:'https://otra-app.example'})}); T('azp de otra aplicación → 401',r.s===401);
r=await call('POST','/api/pages',{token:U,body:{html:html('Secreta'),title:'Informe confidencial',description:'Cifras internas',customSlug:'e2e-secreta',password:'clave-segura-9'}}); T('publicar con contraseña (PBKDF2 en workerd) → 201',r.s===201,'→ '+r.s+' '+(r.j.error||'')+' '+r.ms+' ms');
const ph=d1rows("SELECT password_hash FROM pages WHERE slug='e2e-secreta'")[0]?.password_hash||''; T('  hash guardado con formato pbkdf2$50000$sal$hash',/^pbkdf2\$50000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(ph));
r=await call('GET','/api/pages/e2e-secreta',{ip:'21.0.0.1'}); T('visitante: título genérico y sin html',r.j.page.title==='Página protegida'&&r.j.html===undefined&&r.j.hasPassword===true);
r=await call('GET','/api/pages/e2e-secreta',{token:U,ip:'21.0.0.2'}); T('el dueño sí ve el título real',r.j.page.title==='Informe confidencial');
r=await call('POST','/api/pages/e2e-secreta/unlock',{ip:'21.0.0.3',body:{password:'incorrecta'}}); T('contraseña incorrecta → 401',r.s===401);
r=await call('POST','/api/pages/e2e-secreta/unlock',{ip:'21.0.0.4',body:{password:'clave-segura-9'}}); T('contraseña correcta → 200 con HTML',r.s===200&&r.j.html?.includes('Secreta'),r.ms+' ms (incluye PBKDF2 50.000 iteraciones)');
r=await call('GET','/raw/e2e-secreta',{ip:'21.0.0.5'}); T('/raw de página protegida → redirige a /p/slug (sin ?pwd=)',r.s===302&&/\/p\/e2e-secreta\?protected=1/.test(r.h.get('location')||''));
r=await call('POST','/api/pages',{token:U,body:{html:html('Corta'),customSlug:'e2e-corta',password:'abc'}}); T('contraseña de 3 caracteres → 400',r.s===400);
r=await call('PATCH','/api/pages/e2e-secreta/password',{token:U,body:{password:''}}); T('quitar la contraseña → 200',r.s===200);
r=await call('POST','/api/pages',{id:A,body:{html:html('x'),customSlug:'e2e-anon-pw',password:'clave-segura-9'}}); T('anónimo no puede poner contraseña → 403',r.s===403);

console.log('\n[D] Colecciones, estadísticas y visitas');
r=await call('POST','/api/collections',{token:U,body:{title:'Mi colección',customSlug:'e2e-col'}}); T('crear colección → 201',r.s===201);
r=await call('POST','/api/pages',{token:U,body:{html:html('En colección'),customSlug:'e2e-encol',collectionId:r.j.collection?.id}}); T('publicar dentro de la colección → 201',r.s===201);
r=await call('GET','/api/collections/e2e-col',{ip:'22.0.0.1'}); T('GET colección pública → incluye la página, sin datos del dueño',r.s===200&&r.j.pages.some(p=>p.slug==='e2e-encol')&&!('userEmail' in r.j.collection)&&!('userId' in r.j.collection));
r=await call('GET','/api/collections',{token:U}); T('listado de colecciones del usuario',r.s===200&&r.j.collections.length===1);
for(let i=0;i<4;i++) await call('GET','/api/pages/e2e-encol',{ip:'23.0.0.1'});
await call('GET','/api/pages/e2e-encol',{ip:'23.0.0.2'});
r=await call('GET','/api/pages/e2e-encol/stats?days=7',{token:U}); T('estadísticas reales: 5 lecturas de 2 IP = 2 visitas (deduplicadas)',r.s===200&&r.j.totalViews===2&&r.j.series.length===7,'totalViews='+r.j.totalViews+' hoy='+r.j.viewsToday);
r=await call('GET','/api/pages/e2e-encol/stats',{id:A}); T('stats de otro usuario → 403',r.s===403);
r=await call('DELETE','/api/collections/e2e-col',{token:U}); T('borrar colección → 200',r.s===200);

console.log('\n[E] Límites reales (INSERT ... RETURNING en SQLite)');
let blocked=0; for(let i=1;i<=12;i++){ const x=await call('POST','/api/pages',{id:'anon_'+('limit'+i).padEnd(22,'z'),ip:'30.0.0.1',body:{html:html('l'+i),customSlug:'e2e-lim-'+i}}); if(x.s===429){blocked=i;break} }
T('anónimo: la publicación nº '+blocked+' en una hora desde la misma IP → 429 (límite 10)',blocked===11);
let rb=0; for(let i=1;i<=125;i++){ const x=await call('GET','/api/pages/e2e-encol',{ip:'31.0.0.1'}); if(x.s===429){rb=i;break} }
T('lecturas públicas: la nº '+rb+' en un minuto → 429 (límite 120)',rb===121);
let ub=0; for(let i=1;i<=12;i++){ const x=await call('POST','/api/pages/e2e-secreta/unlock',{ip:'32.0.0.1',body:{password:'mala'+i}}); if(x.s===429){ub=i;break} }
await call('PATCH','/api/pages/e2e-secreta/password',{token:U,body:{password:'clave-segura-9'}});
let ub2=0; for(let i=1;i<=12;i++){ const x=await call('POST','/api/pages/e2e-secreta/unlock',{ip:'32.0.0.2',body:{password:'mala'+i}}); if(x.s===429){ub2=i;break} }
T('desbloqueo: bloqueo tras 10 fallos desde una IP (intento nº '+ub2+')',ub2===11);

console.log('\n[F] Cuota de almacenamiento (SUM real)');
const big='a'.repeat(1024*1024-200); let q=0,qs=0;
for(let i=1;i<=7;i++){ const x=await call('POST','/api/pages',{id:'anon_'+('quota'+i).padEnd(22,'q'),ip:'40.0.0.'+i,body:{html:big,customSlug:'e2e-q-'+i}}); }
const QA='anon_quotaowner0000000000000'; let okc=0, last;
for(let i=1;i<=7;i++){ last=await call('POST','/api/pages',{id:QA,ip:'41.0.0.'+i,body:{html:big,customSlug:'e2e-qa-'+i}}); if(last.s===201) okc++; else break }
T('5 páginas de ~1 MB caben y la 6.ª se rechaza (cuota 5 MB)',okc===5&&last.s===413&&last.j.code==='quota_exceeded','permitidas: '+okc+' | siguiente: '+last.s);

console.log('\n[G] Administración y limpieza programada');
const ADM=tok('user_ADM');
r=await call('GET','/api/admin/stats',{token:ADM}); T('admin (ADMIN_USER_IDS) → estadísticas',r.s===200&&r.j.totalPages>0,'totalPages='+r.j.totalPages);
r=await call('GET','/api/admin/stats',{token:U}); T('usuario normal → 403',r.s===403);
r=await call('GET','/api/pages',{token:ADM}); T('el admin lista todas las páginas con propietario',r.s===200&&r.j.pages.length>5&&r.j.pages.every(p=>'userId' in p));
d1("UPDATE pages SET expires_at='2020-01-01T00:00:00.000Z' WHERE slug IN ('e2e-qa-1','e2e-qa-2')");
const before=store.has('e2e-qa-1.html')&&store.has('e2e-qa-2.html');
r=await fetch(BASE+'/__scheduled?cron=0+*+*+*+*'); await r.text(); await new Promise(x=>setTimeout(x,1500));
const left=d1rows("SELECT slug FROM pages WHERE slug IN ('e2e-qa-1','e2e-qa-2')").length;
T('cron: las 2 páginas caducadas se borran de D1 y del almacenamiento',before&&left===0&&!store.has('e2e-qa-1.html')&&!store.has('e2e-qa-2.html'),'filas restantes: '+left);
T('cron: quedan limpias las ventanas de límite vencidas (tabla rate_limits)',(d1rows("SELECT COUNT(*) AS n FROM rate_limits WHERE window_end < strftime('%s','now')")[0]?.n??1)===0);

console.log('\n[H] Seguridad: cabeceras y CORS en el runtime real');
r=await call('GET','/api/me',{headers:{origin:'https://sitio-malicioso.example'}}); T('origen ajeno: sin Access-Control-Allow-Origin',r.h.get('access-control-allow-origin')===null);
r=await call('GET','/api/me',{headers:{origin:BASE}}); T('mismo origen: permitido',r.h.get('access-control-allow-origin')===BASE);
r=await call('GET','/api/me'); T('API con Cache-Control: no-store',r.h.get('cache-control')==='no-store');
r=await call('GET','/api/pages/%E0%A4%A'); T('URL mal codificada → 400 (no 500)',r.s===400);
console.log('\n[I] Denuncias de abuso (SEC-03)');
const OWN8=tok('user_OWN8');
await call('POST','/api/pages',{token:OWN8,body:{html:html('A denunciar'),title:'Página dudosa',customSlug:'e2e-denuncia'}});
r=await call('POST','/api/pages/e2e-denuncia/report',{ip:'50.0.0.1',body:{reason:'inventado'}}); T('motivo no válido → 400',r.s===400);
r=await call('POST','/api/pages/e2e-denuncia/report',{ip:'50.0.0.1',body:{reason:'otro',details:'x'.repeat(1001)}}); T('detalles de más de 1000 caracteres → 400',r.s===400);
r=await call('POST','/api/pages/no-existe-zzz/report',{ip:'50.0.0.1',body:{reason:'phishing'}}); T('denunciar una página inexistente → 404',r.s===404);
r=await call('POST','/api/pages/e2e-denuncia/report',{ip:'50.0.0.1',body:{reason:'phishing',details:'Simula el acceso a un banco',contact:'yo@correo.com'}}); T('denuncia válida (sin cuenta) → 201',r.s===201,'→ '+r.s+' '+(r.j.error||''));
r=await call('POST','/api/pages/e2e-denuncia/report',{ip:'50.0.0.1',body:{reason:'phishing'}}); T('la misma conexión no puede repetir la denuncia el mismo día (200 duplicada)',r.s===200&&r.j.duplicate===true);
T('  una sola fila en D1 para esa página',(d1rows("SELECT COUNT(*) AS n FROM reports WHERE slug='e2e-denuncia'")[0]?.n)===1);
for(let i=1;i<=6;i++) await call('POST','/api/pages',{token:OWN8,body:{html:html('d'+i),customSlug:'e2e-d-'+i}});
let rl=0; for(let i=1;i<=6;i++){ const x=await call('POST','/api/pages/e2e-d-'+i+'/report',{ip:'50.0.0.9',body:{reason:'otro'}}); if(x.s===429){rl=i;break} }
T('límite: la denuncia nº '+rl+' en una hora desde la misma IP → 429 (límite 5)',rl===6);
const ADM8=tok('user_ADM');
r=await call('GET','/api/admin/reports',{token:ADM8}); const rep=(r.j.reports||[]).find(x=>x.slug==='e2e-denuncia');
T('el administrador ve la denuncia con título, motivo y contacto',r.s===200&&rep&&rep.reason==='phishing'&&rep.pageTitle==='Página dudosa'&&rep.pageExists&&rep.contact==='yo@correo.com'&&rep.details.includes('banco'));
r=await call('GET','/api/admin/reports',{token:OWN8}); T('un usuario normal no puede ver las denuncias → 403',r.s===403);
r=await call('GET','/api/admin/reports'); T('un anónimo no puede ver las denuncias → 403',r.s===403);
r=await call('GET','/api/admin/stats',{token:ADM8}); T('las estadísticas de administración cuentan las denuncias abiertas',typeof r.j.openReports==='number'&&r.j.openReports>=1,'openReports='+r.j.openReports);
r=await call('PATCH','/api/admin/reports/'+rep.id,{token:OWN8,body:{status:'dismissed'}}); T('un usuario normal no puede resolver denuncias → 403',r.s===403);
r=await call('PATCH','/api/admin/reports/'+rep.id,{token:ADM8,body:{status:'borrar'}}); T('estado no válido → 400',r.s===400);
r=await call('PATCH','/api/admin/reports/'+rep.id,{token:ADM8,body:{status:'dismissed'}}); T('descartar una denuncia → 200',r.s===200);
r=await call('GET','/api/admin/reports',{token:ADM8}); T('ya no aparece entre las abiertas',!(r.j.reports||[]).some(x=>x.id===rep.id));
await call('POST','/api/pages/e2e-d-1/report',{ip:'50.0.1.1',body:{reason:'malware'}});
r=await call('GET','/api/admin/reports',{token:ADM8}); const rep2=(r.j.reports||[]).find(x=>x.slug==='e2e-d-1');
r=await call('DELETE','/api/pages/e2e-d-1',{token:ADM8}); T('el administrador elimina la página denunciada → 200',r.s===200&&!store.has('e2e-d-1.html'));
await call('PATCH','/api/admin/reports/'+rep2.id,{token:ADM8,body:{status:'resolved'}});
r=await call('GET','/api/admin/reports?status=all',{token:ADM8}); const done=(r.j.reports||[]).find(x=>x.id===rep2.id);
T('la denuncia resuelta consta con la página ya eliminada',done&&done.status==='resolved'&&done.pageExists===false&&!!done.resolvedAt);
const oldDate=new Date(Date.now()-100*86400000).toISOString(); d1("UPDATE reports SET resolved_at='"+oldDate+"' WHERE id='"+rep2.id+"'");
await (await fetch(BASE+'/__scheduled?cron=0+*+*+*+*')).text(); await new Promise(x=>setTimeout(x,1500));
T('cron: las denuncias resueltas hace más de 90 días se borran',d1rows("SELECT id FROM reports WHERE id='"+rep2.id+"'").length===0);

console.log('\n[J] Borrado de todos mis datos (SEC-17)');
const ER=tok('user_ERASE1');
for(let i=1;i<=45;i++) await call('POST','/api/pages',{token:ER,body:{html:html('bulk'+i),customSlug:'e2e-bulk-'+i}});
await call('POST','/api/pages',{token:tok('user_KEEP1'),body:{html:html('Se queda'),customSlug:'e2e-keep'}});
r=await call('POST','/api/collections',{token:ER,body:{title:'Para borrar',customSlug:'e2e-col-erase'}});
await call('GET','/api/pages/e2e-bulk-1',{ip:'60.0.0.1'}); await call('GET','/api/pages/e2e-bulk-2',{ip:'60.0.0.2'});
const cnt=(sql)=>d1rows(sql)[0]?.n;
T('preparación: 45 páginas, 1 colección y estadísticas del usuario',cnt("SELECT COUNT(*) AS n FROM pages WHERE user_id='user_ERASE1'")===45&&cnt("SELECT COUNT(*) AS n FROM collections WHERE user_id='user_ERASE1'")===1&&cnt("SELECT COUNT(*) AS n FROM page_views_daily WHERE slug LIKE 'e2e-bulk-%'")>=2);
r=await call('POST','/api/me/erase',{token:ER,body:{}}); T('sin confirmación → 400',r.s===400);
r=await call('POST','/api/me/erase',{token:ER,body:{confirm:false}}); T('confirm:false → 400',r.s===400);
r=await call('POST','/api/me/erase',{body:{confirm:true}}); T('sin identidad (ni sesión ni secreto) → 400',r.s===400);
r=await call('POST','/api/me/erase',{token:ER,body:{confirm:true}}); T('1.er lote: borra 40 y quedan 5 (límite de peticiones de Workers)',r.s===200&&r.j.deletedPages===40&&r.j.remaining===5,JSON.stringify(r.j));
r=await call('POST','/api/me/erase',{token:ER,body:{confirm:true}}); T('2.º lote: borra las 5 restantes y no queda nada',r.s===200&&r.j.deletedPages===5&&r.j.remaining===0,JSON.stringify(r.j));
T('  en D1: sin páginas, colecciones ni estadísticas de ese usuario',cnt("SELECT COUNT(*) AS n FROM pages WHERE user_id='user_ERASE1'")===0&&cnt("SELECT COUNT(*) AS n FROM collections WHERE user_id='user_ERASE1'")===0&&cnt("SELECT COUNT(*) AS n FROM page_views_daily WHERE slug LIKE 'e2e-bulk-%'")===0);
T('  en el almacenamiento: ningún archivo suyo',![...store.keys()].some(k=>k.startsWith('e2e-bulk-')));
r=await call('GET','/api/pages/e2e-keep',{ip:'60.0.1.1'}); T('los datos de OTRO usuario siguen intactos',r.s===200&&store.has('e2e-keep.html'));
const AE='anon_'+'eraseAnonSecret000000001';
await call('POST','/api/pages',{id:AE,ip:'61.0.0.1',body:{html:html('a1'),customSlug:'e2e-anon-er-1'}}); await call('POST','/api/pages',{id:AE,ip:'61.0.0.1',body:{html:html('a2'),customSlug:'e2e-anon-er-2'}});
r=await call('POST','/api/me/erase',{id:AE,body:{confirm:true}}); T('un invitado también puede borrar todo lo suyo',r.s===200&&r.j.deletedPages===2&&r.j.remaining===0);
r=await call('POST','/api/me/erase',{id:'anon_'+'otroSecretoCualquiera00000',body:{confirm:true}}); T('con un secreto ajeno no se borra nada',r.s===200&&r.j.deletedPages===0&&store.has('e2e-keep.html'));

console.log('\n[K] Páginas estáticas, privacidad y seguimiento (SEC-03, SEC-04, SEC-17)');
r=await call('GET','/privacidad'); T('GET /privacidad → 200 con normas de uso y forma de denunciar',r.s===200&&/Normas de uso/.test(r.t)&&/Denunciar esta página/.test(r.t)&&/Tus derechos/.test(r.t));
T('  indexable (sin noindex) y con su canonical',!/noindex/.test(r.h.get('x-robots-tag')||'')&&/rel="canonical" href="[^"]*\/privacidad"/.test(r.t));
r=await call('GET','/sitemap.xml'); T('el sitemap incluye /privacidad',/\/privacidad</.test(r.t));
r=await call('GET','/'); T('el seguimiento va entre marcadores y es una etiqueta normal que apunta a la copia PROPIA (/analytics.js)',/<!--tracker:start-->/.test(r.t)&&/<script src="\/analytics\.js" data-app="crea-url" data-key="ak_[0-9a-f]+" async><\/script>/.test(r.t)&&!/tracker\.js/.test(r.t));
T('  se mide a todos: no hay ninguna condición de sesión en la página (sin cookies de Clerk, sin cargador)',!/__session|__client_uat|document\.cookie/.test(r.t.split('<!--tracker:start-->')[1].split('<!--tracker:end-->')[0]));
const csp=r.h.get('content-security-policy-report-only')||'';
T('  la CSP incluye lo que Clerk documenta (telemetría y Clerk Protect en connect-src y frame-src)',/connect-src[^;]*\*\.clerk-telemetry\.com/.test(csp)&&/connect-src[^;]*\*\.protect\.clerk\.com/.test(csp)&&/frame-src[^;]*challenges\.cloudflare\.com[^;]*\*\.protect\.clerk\.com/.test(csp));
T('  la CSP ya NO permite ejecutar scripts del dashboard (script-src), solo enviarle datos (connect-src)',!/script-src[^;]*aitors-hub-dashboard/.test(csp)&&/connect-src[^;]*aitors-hub-dashboard/.test(csp));
r=await call('GET','/analytics.js'); T('/analytics.js se sirve desde la propia aplicación como JavaScript',r.s===200&&/javascript/.test(r.h.get('content-type')||''));
T('  tiene la API del dashboard fijada y no usa cookies ni almacenamiento',/var API_BASE = 'https:\/\/aitors-hub-dashboard\.asanchezgu\.workers\.dev'/.test(r.t)&&!/document\.cookie|localStorage|sessionStorage|indexedDB/.test(r.t));
T('  solo envía la aplicación y la ruta (nada más) a /api/v1/visit',/\/api\/v1\/visit/.test(r.t)&&/app: appSlug,\s*url: window\.location\.pathname/.test(r.t));
r=await call('GET','/acerca-de'); T('/acerca-de enlaza con la privacidad',/href="\/privacidad"/.test(r.t));

console.log('\n'+(fails===0?`TODAS LAS COMPROBACIONES CORRECTAS (${total})`:`COMPROBACIONES FALLIDAS: ${fails} de ${total}`));
process.exit(fails===0?0:1);
