'use strict';
const { Client } = require('pg');
if (process.env.DB_HOST !== 'novastore-auth-check-db-20261102' || process.env.DB_NAME !== 'novastore_auth_fixture' || process.env.NODE_ENV !== 'test') throw Error('TEST_TARGET_REQUIRED');
const c = new Client({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
const base='http://127.0.0.1:5000';
(async()=>{ await c.connect(); let ids=[]; try {
  const user=await fetch(base+'/api/users/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'local-auth@example.invalid',password:'LocalOnly-Auth-2026!'})});
  const data=await user.json(); if(!data.token) throw Error('LOGIN');
  const headers={'content-type':'application/json',authorization:`Bearer ${data.token}`};
  const guest=await fetch(base+'/api/questions/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({product_id:36,question:'Test question'})});
  const invalid=await fetch(base+'/api/questions/ask',{method:'POST',headers,body:JSON.stringify({product_id:36,question:'abc'})});
  const send=await fetch(base+'/api/questions/ask',{method:'POST',headers,body:JSON.stringify({product_id:36,question:'Local test question pending'})});
  const sent=await send.json(); if(!sent.question?.id)throw Error('SEND'); ids.push(sent.question.id);
  const answer=await c.query('INSERT INTO product_questions(product_id,user_id,question,answer) VALUES($1,$2,$3,$4) RETURNING id',[36,sent.question.user_id,'Local test answered','Local test answer']); ids.push(answer.rows[0].id);
  const many=await c.query("INSERT INTO product_questions(product_id,user_id,question,answer) SELECT 36,$1,'Local pagination ' || n,'Local answer' FROM generate_series(1,100) n RETURNING id",[sent.question.user_id]); ids.push(...many.rows.map(x=>x.id));
  for(const path of ['/api/public/review/questions/36','/api/questions/product/36']) { const r=await fetch(base+path); const value=await r.json(); const rows=Array.isArray(value)?value:value.items; if(!r.ok||rows.length!==100||rows.some(x=>x.id===ids[0])||rows.some(x=>Object.hasOwn(x,'user_id'))) throw Error(`PRIVACY ${path}`); if(!Array.isArray(value)){if(!value.pagination.hasMore)throw Error('MISSING_NEXT');const next=await fetch(base+path+'?cursor='+value.pagination.nextCursor);const more=await next.json();if(!more.items.some(x=>x.id===ids[1])||more.pagination.hasMore)throw Error('PAGINATION');} }
  if(guest.status!==401||invalid.status!==400||send.status!==201)throw Error('AUTH_OR_VALIDATION');
  console.log('LOCAL_QUESTION_PRIVACY_AUTH_AND_SEND_OK');
} finally { if(ids.length) await c.query('DELETE FROM product_questions WHERE id=ANY($1::int[])', [ids]); await c.end(); } })().catch(e=>{console.error(e.message);process.exitCode=1});
