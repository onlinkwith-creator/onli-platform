import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create schema net; create schema cron; create schema auth;
   create function auth.uid() returns uuid language sql as $$select null::uuid$$;
   create function is_active_admin() returns boolean language sql as $$select coalesce(current_setting('test.admin',true)='true',false)$$;
   create table requests(id bigint primary key,estimate_status text,estimate_approved_at timestamptz);
   create table interpreters(id bigint primary key,resume_file_url text,resume_uploaded_at timestamptz,bankbook_file_url text,business_license_file_url text,name text);
   create table businesses(id bigint primary key); create table job_applications(id uuid primary key);
   create table notifications(id uuid primary key,recipient_type text,recipient_email text,notification_type text,title text,message text,channel text,status text,
    provider_message_id text,error_message text,sent_at timestamptz,attempt_count integer,last_attempt_at timestamptz);
   create table net.calls(body jsonb);
   create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$begin insert into net.calls values(body);return 1;end;$$;
   create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
   grant usage on schema public to anon,authenticated,service_role;
   insert into interpreters(id) values(999);
   insert into notifications(id,recipient_type,status) values(gen_random_uuid(),'admin','pending');
  `);
  const sql = (await readFile(new URL('../supabase/migrations/20261006110000_automatic_admin_action_alerts.sql',import.meta.url),'utf8'))
    .replace(/^create extension.*;$/gm,'');
  await db.exec(sql);
  await db.exec(await readFile(new URL('../supabase/migrations/20261006120000_admin_alert_preferences.sql',import.meta.url),'utf8'));
  await db.exec(`create function legacy_admin_internal() returns trigger language plpgsql as $$begin
   if new.recipient_type='admin' then new.channel:='internal';new.recipient_email:=null;end if;return new;end;$$;
   create trigger legacy_admin_internal before insert or update on notifications for each row execute function legacy_admin_internal();`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261006123000_admin_alert_delivery_channel.sql',import.meta.url),'utf8'));
  const count = async () => (await db.query('select count(*)::integer n from admin_action_alerts')).rows[0].n;
  assert.equal(await count(),0,'no backfill of old registrations or pending mail');
  await db.exec("insert into interpreters(id) values(1);insert into businesses values(1);insert into requests(id) values(1);insert into job_applications values(gen_random_uuid());");
  assert.equal(await count(),4,'every new approval source enqueued');
  assert.equal((await db.query("select count(*)::integer n from notifications where id in (select id from admin_action_alerts) and channel='email' and recipient_email='onlinkwith@gmail.com'")).rows[0].n,4,'automatic mail overrides legacy internal-only categorization');
  await db.exec("update interpreters set resume_file_url='private/resume.pdf',resume_uploaded_at=now() where id=1;update interpreters set name='changed' where id=1;");
  assert.equal(await count(),5,'resume queued; unrelated profile update not queued');
  await db.exec("update requests set estimate_status='estimate_approved' where id=1;update requests set estimate_status='estimate_approved' where id=1;");
  assert.equal(await count(),6,'one alert per estimate transition');
  assert.equal((await db.query("select count(*)::integer n from notifications where recipient_email is not null and recipient_email<>'onlinkwith@gmail.com'")).rows[0].n,0);
  await db.exec('select dispatch_admin_action_alerts()');
  const item = (await db.query('select id,nonce from admin_action_alerts limit 1')).rows[0];
  assert.equal((await db.query('select * from claim_admin_action_alert($1,gen_random_uuid())',[item.id])).rows.length,0);
  assert.equal((await db.query('select * from claim_admin_action_alert($1,$2)',[item.id,item.nonce])).rows.length,1);
  assert.equal((await db.query('select * from claim_admin_action_alert($1,$2)',[item.id,item.nonce])).rows.length,0,'nonce consumed; replay/concurrency denied');
  await db.query("select finish_admin_action_alert($1,'sent','provider-id',null)",[item.id]);
  assert.equal((await db.query('select status from notifications where id=$1',[item.id])).rows[0].status,'sent');
  await db.exec("update admin_action_alerts set next_attempt_at=now()-interval '10 minutes' where status='dispatched';select dispatch_admin_action_alerts();");
  assert.equal((await db.query('select status from admin_action_alerts where id=$1',[item.id])).rows[0].status,'sent','sent jobs never resent');
  const next=(await db.query("select id,nonce from admin_action_alerts where status='dispatched' limit 1")).rows[0];
  await db.query("update notifications set status='sending' where id=$1",[next.id]);
  assert.equal((await db.query('select * from claim_admin_action_alert($1,$2)',[next.id,next.nonce])).rows.length,0,'manual send lease prevents automatic duplicate');
  await db.query("update notifications set status='pending' where id=$1",[next.id]);
  await db.query('select * from claim_admin_action_alert($1,$2)',[next.id,next.nonce]);
  await db.query("update admin_action_alerts set next_attempt_at=now()-interval '10 minutes' where id=$1",[next.id]);
  await db.exec('select dispatch_admin_action_alerts()');
  assert.equal((await db.query('select status from admin_action_alerts where id=$1',[next.id])).rows[0].status,'uncertain','ambiguous SMTP never auto-retried');
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from admin_action_alerts'));
  await assert.rejects(db.query('select dispatch_admin_action_alerts()'));
  await assert.rejects(db.query('select * from claim_admin_action_alert($1,$2)',[item.id,item.nonce]));
  await assert.rejects(db.query("select enqueue_admin_action_alert('x','x','','x','/admin')"));
  await assert.rejects(db.query('select test_admin_action_alert()'));
  await assert.rejects(db.query('select get_admin_alert_preferences()'));
  await assert.rejects(db.query("select set_admin_alert_preferences(false,'{}')"));
  await db.exec('reset role');

  await db.exec("select set_config('test.admin','true',false)");
  const pref=(await db.query('select get_admin_alert_preferences() p')).rows[0].p;
  assert.equal(pref.recipient_email,'onlinkwith@gmail.com');
  const beforeMute=await count();
  await db.query('select set_admin_alert_preferences(false,$1)',[JSON.stringify(pref.event_types)]);
  await db.exec('insert into businesses values(2)');
  assert.equal(await count(),beforeMute,'disabled registration does not queue');
  assert.equal((await db.query("select count(*)::integer n from admin_action_alerts where status in ('pending','dispatched','failed')")).rows[0].n,0,'unclaimed backlog muted');
  assert.equal((await db.query("select count(*)::integer n from notifications n join admin_action_alerts a on a.id=n.id where a.status='muted' and (n.channel<>'internal' or n.recipient_email is not null)")).rows[0].n,0,'muted jobs cannot be emailed by the manual sender');
  await db.query('select set_admin_alert_preferences(true,$1)',[JSON.stringify(pref.event_types)]);
  await db.exec('select dispatch_admin_action_alerts()');
  assert.equal((await db.query("select count(*)::integer n from admin_action_alerts where status='dispatched'")).rows[0].n,0,'re-enabling never drains muted backlog');
  const selective={...pref.event_types,admin_action_company:false};
  await db.query('select set_admin_alert_preferences(true,$1)',[JSON.stringify(selective)]);
  await db.exec('insert into businesses values(3);insert into requests(id) values(2)');
  assert.equal(await count(),beforeMute+1,'per-type preference enforced on the server');
  await assert.rejects(db.query('select set_admin_alert_preferences(true,$1)',[JSON.stringify({...pref.event_types,recipient_email:'attacker@example.invalid'})]));

  // Exercise the deployed function handler without SMTP or production data.
  const source=(await readFile(new URL('../supabase/functions/admin-action-alert/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
  let handler, claims=0, sent=0, resultStatus, claimAvailable=true;
  const rpc=async (name) => name==='claim_admin_action_alert'
    ? (claims++,{data:claimAvailable?[{id:item.id,event_type:'admin_action_request',admin_path:'/admin?subTab=new_requests',title:'New request'}]:[],error:null})
    : ({error:null});
  const context={Response,Set,String,Number,JSON,Deno:{env:{get:()=> 'configured'},serve:(fn)=>{handler=fn;}},
    createClient:()=>({rpc:async(name,args)=>{if(name==='finish_admin_action_alert')resultStatus=args.p_status;return rpc(name);}}),
    nodemailer:{createTransport:()=>({close:()=>{},sendMail:async(mail)=>{assert.equal(mail.to,'onlinkwith@gmail.com');sent++;return {messageId:'provider',accepted:['onlinkwith@gmail.com']};}})}};
  vm.runInNewContext(source,context);
  const request=(body)=>new Request('https://example.invalid',{method:'POST',body:JSON.stringify(body)});
  assert.equal((await handler(request({}))).status,401);assert.equal(claims,0);
  assert.equal((await handler(request({id:item.id,nonce:item.nonce,to:'attacker@example.invalid'}))).status,200);
  assert.equal(sent,1);assert.equal(resultStatus,'sent');
  claimAvailable=false;
  assert.equal((await handler(request({id:item.id,nonce:item.nonce}))).status,401);assert.equal(sent,1);
  console.log('PASS: future-only approval alerts, fixed admin recipient, resume/estimate transitions, private nonce, replay denial, SMTP confirmation and no ambiguous resends');
} finally { await db.close(); }
