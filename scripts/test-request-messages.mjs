import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { mergeRequestMessages, messageError } from '../src/utils/requestMessages.js';
import { validWorkflowReturnTarget } from '../src/utils/workflowReturnTarget.js';

const db = new PGlite();
const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const company = uuid(1), interpreter = uuid(11), colleague = uuid(12), outsider = uuid(2);
const value = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
const login = async (id, role = 'authenticated') => {
  await db.exec('reset role');
  await db.query("select set_config('test.uid',$1,false)", [id]);
  await db.exec(`set role ${role}`);
};
const threads = () => db.query('select * from get_my_request_conversations()');
const get = (id, before = null) => db.query('select * from get_request_messages($1,$2)', [id,before]);
const send = (id, body, nonce) => value('select send_request_message($1,$2,$3) as value', [id,body,nonce]);
const read = (id, last) => db.query('select read_request_messages($1,$2)', [id,last]);
const queued = () => value('select queue_request_message_alerts() as value');
const admin = () => login('', 'postgres');
try {
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    insert into auth.users values('${company}','company@example.invalid',now()),('${interpreter}','interpreter@example.invalid',now()),
      ('${colleague}','colleague@example.invalid',now()),('${outsider}','outsider@example.invalid',now());
    create table businesses(id bigint primary key,auth_user_id uuid unique,status text,company_name text);
    insert into businesses values(1,'${company}','승인 완료','First Company'),(2,'${outsider}','승인 완료','Other Company');
    create table interpreters(id bigint primary key,auth_user_id uuid unique,name text,withdrawn_at timestamptz);
    insert into interpreters values(1,'${interpreter}','First Interpreter',null),(2,'${colleague}','Other Interpreter',null);
    create table requests(id bigint primary key,request_no text,company_id bigint,company_auth_user_id uuid,event_name text,status text,operation_status text);
    insert into requests values(1,'ONLI-REQ-001',1,'${company}','First Event','open','scheduled'),
      (2,'ONLI-REQ-002',2,'${outsider}','Other Event','open','scheduled');
    create table request_interpreters(id bigint primary key,request_id bigint,interpreter_id bigint,status text,assignment_no text);
    insert into request_interpreters values(1,1,1,'assigned','ONLI-REQ-001-1-ASG-001'),
      (2,1,2,'assigned','ONLI-REQ-001-1-ASG-002'),(3,2,2,'assigned','ONLI-REQ-002-1-ASG-001');
    create table workflow_action_alerts(id uuid primary key default gen_random_uuid(),event_type text,source_id text,source_version text,
      recipient_auth_user_id uuid,recipient_type text,recipient_email text,title text,message text,portal_path text,
      created_at timestamptz default now(),unique(event_type,source_id,source_version,recipient_auth_user_id));
    create table notifications(id uuid primary key,recipient_type text,recipient_id uuid,recipient_email text,notification_type text,
      title text,message text,channel text,status text);
    insert into notifications(id,notification_type,status) values('${uuid(999)}','historical','pending');
    create function workflow_followup_actionable(text,text,text,uuid) returns boolean language sql as $$select $1='old_event'$$;
    create schema cron;
    create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
  `);
  const sql = await readFile(new URL('../supabase/migrations/20261008180000_request_messages.sql',import.meta.url),'utf8');
  await db.exec(sql);
  assert.equal(await value('select count(*)::int as value from request_messages'),0);
  assert.equal(await value('select count(*)::int as value from workflow_action_alerts'),0);
  await login('', 'anon');
  await assert.rejects(threads(),/permission denied/);
  await assert.rejects(send(uuid(900),'hidden',uuid(901)),/permission denied/);
  await login(company);
  const own = (await threads()).rows.map((row) => row.get_my_request_conversations);
  assert.equal(own.length,2);
  const first = own.find((row) => row.peer_name==='First Interpreter').id;
  const second = own.find((row) => row.peer_name==='Other Interpreter').id;
  assert.ok(own.every((row) => row.can_send && row.my_role==='company'));
  assert.ok(!JSON.stringify(own).includes('@'));
  for (const table of ['request_conversations','request_messages','request_message_reads']) {
    await assert.rejects(db.query(`select * from ${table}`),/permission denied/);
    await assert.rejects(db.query(`delete from ${table}`),/permission denied/);
  }
  await assert.rejects(db.query('select request_conversation_access($1,$2,true)',[first,company]),/permission denied/);
  await assert.rejects(queued(),/permission denied/);
  await assert.rejects(send(first,'  \n\t ',uuid(100)),/INVALID_BODY/);
  await assert.rejects(send(first,'x'.repeat(2001),uuid(100)),/INVALID_BODY/);
  await assert.rejects(send(first,'Hello',null),/INVALID_BODY/);
  const result = await send(first,'  Meeting at 9\nBring materials  ',uuid(100));
  assert.equal((await send(first,'Meeting at 9\nBring materials',uuid(100))).id,result.id,'retry does not duplicate');
  await assert.rejects(send(first,'Different',uuid(100)),/NONCE_REUSED/);
  await assert.rejects(send(second,'Meeting at 9\nBring materials',uuid(100)),/NONCE_REUSED/);
  const projection = (await get(first)).rows[0].get_request_messages;
  assert.equal(projection.body,'Meeting at 9\nBring materials');
  assert.equal(projection.mine,true); assert.equal(projection.peer_read,false);
  assert.ok(!Object.keys(projection).includes('sender_user_id'));
  await login(colleague);
  await assert.rejects(get(first),/FORBIDDEN/);
  await assert.rejects(send(first,'Cannot read',uuid(101)),/FORBIDDEN/);
  await assert.rejects(read(first,result.id),/FORBIDDEN/);
  const sibling = (await threads()).rows.map((row) => row.get_my_request_conversations);
  assert.equal(sibling.length,2,'same-request colleagues get separate conversations');
  const other = sibling.find((row) => row.request_no==='ONLI-REQ-002').id;
  await login(outsider);
  await assert.rejects(get(first),/FORBIDDEN/);
  assert.equal((await threads()).rows.length,1);
  await login(interpreter);
  assert.equal((await threads()).rows[0].get_my_request_conversations.unread_count,1);
  await assert.rejects(read(first,'999999'),/INVALID_CURSOR/);
  await read(first,result.id);
  assert.equal((await threads()).rows[0].get_my_request_conversations.unread_count,0);
  const reply = await send(first,'<img src=x onerror=alert(1)>',uuid(102));
  await login(company);
  assert.equal((await get(first)).rows.find((row) => row.get_request_messages.id===result.id).get_request_messages.peer_read,true);
  assert.equal((await threads()).rows.find((row) => row.get_my_request_conversations.id===first).get_my_request_conversations.unread_count,1);
  await read(first,result.id);
  assert.equal((await threads()).rows.find((row) => row.get_my_request_conversations.id===first).get_my_request_conversations.unread_count,1,'read only observed cursor, not unseen new messages');
  await read(first,reply.id); await read(first,result.id);
  assert.equal((await threads()).rows.find((row) => row.get_my_request_conversations.id===first).get_my_request_conversations.unread_count,0,'read cursor monotonic');
  await assert.rejects(read(other,result.id),/FORBIDDEN/);
  for (let n=0;n<19;n++) await send(second,`Rate ${n}`,uuid(200+n));
  await assert.rejects(send(first,'Rate overflow',uuid(300)),/RATE_LIMIT/,'limit is account-wide, not per conversation');
  await admin();
  await db.exec("update request_messages set created_at=now()-interval '1 hour'");
  await login(company);
  for (let n=0;n<60;n++) {
    if (n && n%19===0) { await admin(); await db.exec("update request_messages set created_at=now()-interval '1 hour'"); await login(company); }
    await send(first,`History ${n}`,uuid(400+n));
  }
  const latest = (await get(first)).rows.map((row) => row.get_request_messages);
  assert.equal(latest.length,50);
  const page = (await get(first,latest.at(-1).id)).rows.map((row) => row.get_request_messages);
  assert.equal(page.length,12);
  assert.ok(page.every((item) => BigInt(item.id)<BigInt(latest.at(-1).id)));
  await admin(); await db.exec("update request_messages set created_at=now()-interval '3 minutes'");
  assert.equal(await queued(),2,'one unread alert per recipient/conversation, not per message');
  assert.equal(await queued(),0,'repeat scheduler is idempotent');
  const email = (await db.query("select * from workflow_action_alerts where source_id=$1",[first])).rows[0];
  assert.equal(email.recipient_auth_user_id,interpreter);
  assert.equal(email.portal_path,'/interpreter-mypage?tab=messages');
  assert.ok(!JSON.stringify(email).includes('History') && !JSON.stringify(email).includes('onerror'));
  assert.equal(await value('select workflow_followup_actionable($1,$2,$3,$4) as value',[email.event_type,email.source_id,email.source_version,interpreter]),true);
  await login(interpreter); await read(first,latest[0].id);
  await admin();
  assert.equal(await value('select workflow_followup_actionable($1,$2,$3,$4) as value',[email.event_type,email.source_id,email.source_version,interpreter]),false,'read before delivery suppresses email');
  assert.equal(await value("select workflow_followup_actionable('old_event','','',null) as value"),true,'old alert behavior preserved');
  assert.equal(await value("select status as value from notifications where notification_type='historical'"),'pending');
  await login(interpreter); const unreadReply = await send(first,'Company unread test',uuid(790));
  await admin(); await db.exec("update request_messages set created_at=now()-interval '3 minutes'");
  assert.equal(await queued(),1);
  const companyEmail = (await db.query("select * from workflow_action_alerts where recipient_auth_user_id=$1",[company])).rows[0];
  assert.equal(companyEmail.portal_path,'/business/mypage?tab=messages');
  await login(interpreter); await send(first,'Additional burst',uuid(791));
  await admin(); await db.exec("update request_messages set created_at=now()-interval '3 minutes'");
  assert.equal(await queued(),0,'new burst respects 30-minute conversation/recipient cooldown');
  await login(company); await read(first,unreadReply.id);
  await admin();
  assert.equal(await value('select workflow_followup_actionable($1,$2,$3,$4) as value',[companyEmail.event_type,companyEmail.source_id,companyEmail.source_version,company]),false);
  await db.exec("update request_interpreters set status='cancelled' where id=1");
  await login(interpreter);
  assert.equal((await threads()).rows[0].get_my_request_conversations.can_send,false);
  assert.equal((await get(first)).rows.length,50,'cancelled history remains readable only by original pair');
  await assert.rejects(send(first,'Cancelled',uuid(800)),/FORBIDDEN/);
  await admin();
  await db.exec("update request_interpreters set status='assigned' where id=1; update requests set status='cancelled' where id=1");
  await login(company); await assert.rejects(send(first,'Cancelled request',uuid(800)),/FORBIDDEN/);
  await admin(); await db.exec("update requests set status='open',company_id=2,company_auth_user_id='"+outsider+"' where id=1");
  await login(company); await assert.rejects(get(first),/FORBIDDEN/);
  await login(outsider); await assert.rejects(get(first),/FORBIDDEN/,'new owner cannot read old account-pair history');
  const transferred = (await threads()).rows.map((row) => row.get_my_request_conversations).find((row)=>row.assignment_no==='ONLI-REQ-001-1-ASG-001');
  assert.notEqual(transferred.id,first); assert.equal((await get(transferred.id)).rows.length,0);
  await admin(); await db.exec("update interpreters set withdrawn_at=now() where id=1");
  await login(interpreter); await assert.rejects(get(first),/FORBIDDEN/); await assert.rejects(get(transferred.id),/FORBIDDEN/);
  await admin(); await db.exec("update businesses set status='승인 대기' where id=2");
  await login(outsider); await assert.rejects(get(other),/FORBIDDEN/);
  await admin();
  await db.exec("update businesses set status='승인 완료' where id=2; update request_messages set created_at=now()-interval '2 minutes'");
  await db.query(`insert into request_messages(conversation_id,sender_user_id,sender_role,client_nonce,body,created_at)
    select $1,$2,'company',gen_random_uuid(),'daily-limit',now()-interval '2 hours' from generate_series(1,200)`,[other,outsider]);
  await login(outsider); await assert.rejects(send(other,'Daily overflow',uuid(850)),/RATE_LIMIT/);
  assert.deepEqual(mergeRequestMessages([{id:'9007199254740993',body:'old'}],[{id:'9007199254740992'},{id:'9007199254740993',body:'new'}]).map((row)=>row.id),['9007199254740992','9007199254740993']);
  assert.equal(messageError({message:'MESSAGE_RATE_LIMIT'}).includes('잠시'),true);
  assert.equal(validWorkflowReturnTarget('/business/mypage?tab=messages','company'),true);
  assert.equal(validWorkflowReturnTarget('/interpreter-mypage?tab=messages','company'),false);
  const component = await readFile(new URL('../src/components/RequestMessages.jsx',import.meta.url),'utf8');
  assert.ok(!component.includes('dangerouslySetInnerHTML'),'messages rendered as text, never HTML');
  const styles = await readFile(new URL('../src/components/RequestMessages.css',import.meta.url),'utf8');
  assert.match(styles,/\.request-messaging h2\s*\{[^}]*color:\s*#14263a/,'heading color must not inherit global dark-mode text');
  const worker = await readFile(new URL('../supabase/functions/admin-action-alert/index.ts',import.meta.url),'utf8');
  assert.ok(worker.includes('"workflow_message_unread"') && worker.includes('"/business/mypage?tab=messages"') && worker.includes('"/interpreter-mypage?tab=messages"'));
  console.log('Request messages: permissions, pair isolation, retries, read cursors, rate limits, pagination, unread mail and cancellation PASS');
} finally { await db.close(); }
