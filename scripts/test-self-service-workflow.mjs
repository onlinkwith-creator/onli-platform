import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEmailTemplate } from '../supabase/functions/_shared/email-template.js';
import { rankApplicants } from '../src/utils/applicantRanking.js';
import { validWorkflowReturnTarget } from '../src/utils/workflowReturnTarget.js';
import { makeRepeatRequestTemplate } from '../src/utils/repeatRequest.js';
import { PGlite } from '@electric-sql/pglite';
import vm from 'node:vm';

const db = new PGlite();
const uuid = (id) => `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`;
const company = uuid(1);
const interpreter = uuid(11);
const migration = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const login = async (uid, role = 'authenticated') => {
  await db.exec('reset role');
  await db.query("select set_config('test.uid',$1,false)", [uid]);
  await db.exec(`set role ${role}`);
};
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function is_active_admin() returns boolean language sql stable as $$select false$$;
    create function is_admin() returns boolean language sql stable as $$select false$$;
    create function auth.role() returns text language sql stable as
      $$select case when auth.uid() is null then 'service_role' else 'authenticated' end$$;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    insert into auth.users values('${company}','company@example.invalid',now()),('${interpreter}','interpreter@example.invalid',now()),
     ('${uuid(12)}','second@example.invalid',now()),('${uuid(2)}','other@example.invalid',now());
    create schema net; create schema cron;
    create table net.calls(body jsonb);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as
     $$begin insert into net.calls values(body);return 1;end;$$;
    create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
    create table notifications(id uuid primary key,recipient_type text,recipient_id uuid,recipient_email text,notification_type text,
     title text,message text,channel text,status text,provider_message_id text,error_message text,sent_at timestamptz,
     attempt_count integer,last_attempt_at timestamptz);
    insert into notifications(id,notification_type,status) values('${uuid(9999)}','historical','pending');
    create table businesses(id bigint primary key,auth_user_id uuid,status text,company_name text);
    create table jobs(id uuid primary key default gen_random_uuid(),status text,assignment_status text,operation_status text,
      start_date date,end_date date,deadline date,title text,event_name text,company_name text,location text,visibility text,pay text);
    create table requests(id bigint primary key,company_id bigint,company_auth_user_id uuid,job_id uuid,
      requested_people_count integer,required_count integer,start_date date,end_date date,event_date date,
      status text default 'draft',operation_status text default 'operation_before',matching_status text,assignment_status text,
      assigned_interpreter_id bigint,assigned_interpreter_name text,matched_interpreter_id bigint,
      matched_interpreter_name text,updated_at timestamptz,event_name text default 'Conference',request_no text,
      company_name text default 'Company',event_location text default 'Tokyo',requested_level text,required_level text,
      request_type text default 'general',is_public boolean default false,is_job_public boolean default false,
      work_hours text,event_start_time text,event_end_time text,contact_email text,contact_phone text,reference_file_path text,
      estimate_status text,payment_status text default 'unpaid',contact_status text default 'not_contacted',
      client_price numeric default 0,interpreter_price numeric default 0,profit numeric default 0,interpreter_fee numeric default 0,
      admin_checked boolean default false);
    create function portal_owns_request(p_id bigint) returns boolean language sql stable security definer as
      $$select auth.uid() is not null and exists(select 1 from requests r join businesses b
      on b.auth_user_id=auth.uid() where r.id=p_id and b.status='승인 완료'
      and (r.company_id=b.id or r.company_auth_user_id=auth.uid()))$$;
    create table interpreters(id bigint primary key,name text,auth_user_id uuid,is_public boolean default true,
      activity_status text default 'active',status text default 'active',approved boolean default false,
      region text,level text,short_intro text,specialties text[],available_regions text[],experience_count integer,
      custom_regions text[],withdrawn_at timestamptz);
    create view public_interpreters as select id,name from interpreters where is_public;
    create function portal_owns_interpreter(p_id bigint) returns boolean language sql stable security definer as
      $$select exists(select 1 from interpreters where id=p_id and auth_user_id=auth.uid())$$;
    create function portal_pick(j jsonb,keys text[]) returns jsonb language sql immutable as
      $$select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(j) where key=any(keys)$$;
    create table job_applications(id uuid primary key,job_id uuid,interpreter_id bigint,status text default 'pending',created_at timestamptz default now());
    create table request_interpreters(id bigserial primary key,request_id bigint,interpreter_id bigint,
      status text default 'assigned',contact_visible boolean default false,assigned_at timestamptz default now(),unique(request_id,interpreter_id));
    create table matchings(id bigint,request_id bigint,job_id uuid,interpreter_id bigint,status text,start_date date,end_date date);
    create table settlements(request_id bigint,interpreter_id bigint,amount numeric,payout_status text);
    alter table request_interpreters enable row level security;
    grant usage on schema public,auth to anon,authenticated;
    grant insert,update,delete on request_interpreters to authenticated;
    grant usage on sequence request_interpreters_id_seq to authenticated;
    insert into businesses(id,auth_user_id,status) values(1,'${company}','승인 완료'),(2,'${uuid(2)}','승인 완료');
    insert into interpreters(id,name,auth_user_id) values(1,'First','${interpreter}'),(2,'Second','${uuid(12)}');
    create function prevent_non_admin_request_operation_fields() returns trigger language plpgsql security definer as $$
    BEGIN
      if public.is_admin() or auth.role()='service_role' then return new; end if;
      if tg_op='UPDATE' and (old.company_auth_user_id=auth.uid() or
       (old.company_auth_user_id is null and exists(select 1 from businesses b where b.auth_user_id=auth.uid() and b.company_name=old.company_name)))
       and new.company_auth_user_id=old.company_auth_user_id and new.id=old.id
       and new.estimate_status in ('estimate_approved','company_approved')
       and coalesce(old.estimate_status,'') is distinct from coalesce(new.estimate_status,'')
       and (to_jsonb(new)-'estimate_status'-'updated_at')=(to_jsonb(old)-'estimate_status'-'updated_at') then return new; end if;
      if new.payment_status is distinct from 'unpaid' or new.contact_status is distinct from 'not_contacted'
       or coalesce(new.client_price,0)<>0 or coalesce(new.interpreter_price,0)<>0 or coalesce(new.profit,0)<>0
       or coalesce(new.interpreter_fee,0)<>0 or new.assigned_interpreter_id is not null or new.assigned_interpreter_name is not null
       or new.matched_interpreter_id is not null or new.matched_interpreter_name is not null or new.admin_checked is distinct from false
       then raise exception 'Only admins can set request operation fields.'; end if;
      if tg_op='UPDATE' then raise exception 'Only admins can update requests.'; end if;
      return new;
    END; $$;
    create trigger protected_request before update on requests for each row execute function prevent_non_admin_request_operation_fields();
    create function prevent_non_admin_job_application_review_fields() returns trigger language plpgsql security definer as $$
    BEGIN
      if public.is_admin() or auth.role()='service_role' then return new; end if;
      if tg_op='INSERT' and lower(trim(coalesce(new.status,'pending'))) not in ('pending','지원완료')
       then raise exception 'Only admins can set job application review fields.'; end if;
      if tg_op='UPDATE' then raise exception 'Only admins can update job applications.'; end if;
      return new;
    END; $$;
    create trigger protected_application before update on job_applications for each row execute function prevent_non_admin_job_application_review_fields();
  `);
  await db.exec(await migration('20260711020500_sync_assignment_lifecycle_from_request_interpreters.sql'));
  await db.exec(await migration('20261008090000_company_applicant_assignment.sql'));
  await db.exec(await migration('20261006090000_automatic_onli_certification.sql'));
  await db.exec(`insert into jobs(id,status) values('${uuid(99)}','open');
   insert into requests(id,company_id,company_auth_user_id,job_id,requested_people_count,start_date,end_date)
   values(99,1,'${company}','${uuid(99)}',1,current_date+30,current_date+30);
   insert into job_applications(id,job_id,interpreter_id) values('${uuid(991)}','${uuid(99)}',1);`);
  await login(company);
  await assert.rejects(db.query('select assign_company_applicant(99,$1)',[uuid(991)]),/Only admins can update job applications/,
    'reproduces the live company assignment failure with the production protection rules');
  await login('', 'service_role');
  await db.exec('reset role');
  assert.equal(await scalar('select count(*)::int as value from request_interpreters'),0,'failed assignment rolled back');
  await db.exec(await migration('20261008120000_self_service_workflow.sql'));
  await db.exec(await migration('20261008130000_self_service_email_alerts.sql'));
  assert.equal(await scalar('select count(*)::int as value from workflow_action_alerts'),0,'no backfill of historical events');
  const seed = async (id, days = 30, count = 1, type = 'general', owner = 1) => {
    await login('');
    await db.exec('reset role');
    await db.query(`insert into requests(id,company_id,company_auth_user_id,requested_people_count,start_date,end_date,request_type,
      contact_email,contact_phone,reference_file_path) values($1,$2,$3,$4,current_date+$5::integer,current_date+$5::integer,$6,'private@email','private-phone','private/file')`,
    [id, owner, uuid(owner), count, days, type]);
    let job = await scalar('select job_id as value from requests where id=$1', [id]);
    if (!job) {
      job = uuid(id);
      await db.query("insert into jobs(id,status) values($1,'open')", [job]);
      await db.query('update requests set job_id=$1 where id=$2', [job,id]);
    }
    for (let i = 1; i <= 2; i++) await db.query('insert into job_applications(id,job_id,interpreter_id) values($1,$2,$3)', [uuid(id * 10 + i),job,i]);
  };
  const propose = async (id, i = 1, amount = 500000) => scalar('select propose_company_assignment($1,$2,$3) as value',[id,uuid(id*10+i),amount]);
  const respond = (offer, accept = true) => scalar('select respond_assignment_offer($1,$2) as value',[offer.offer_id,accept]);
  await seed(100);
  const publicJob = await scalar('select to_jsonb(j) as value from jobs j join requests r on r.job_id=j.id where r.id=100');
  assert.equal(publicJob.visibility,'public'); assert.equal(publicJob.pay,'협의');
  assert.ok(!JSON.stringify(publicJob).includes('private'));
  await login('', 'anon'); await assert.rejects(propose(100));
  await login(uuid(2)); await assert.rejects(propose(100),/FORBIDDEN/);
  await login(company); await assert.rejects(propose(100,1,0),/INVALID_AMOUNT/);
  await assert.rejects(db.query('select assign_company_applicant(100,$1)',[uuid(1001)]),/permission denied/);
  await assert.rejects(db.query('select get_company_portal_applicants_base(100)'),/permission denied/);
  const offer = await propose(100);
  assert.equal((await propose(100)).offer_id,offer.offer_id);
  await assert.rejects(propose(100,2),/CAPACITY_FULL/);
  await assert.rejects(propose(100,1,600000),/CANCEL_OFFER_FIRST/);
  await assert.rejects(respond(offer),/FORBIDDEN/);
  await assert.rejects(db.query('select * from assignment_offers'),/permission denied/);
  await db.exec('reset role');
  assert.equal(await scalar('select count(*)::int as value from request_interpreters'),0);
  await login(uuid(12)); await assert.rejects(respond(offer),/FORBIDDEN/);
  await login(interpreter);
  const assigned = await respond(offer);
  assert.equal(assigned.status,'accepted'); assert.equal((await respond(offer)).assignment_id,assigned.assignment_id);
  assert.equal(await scalar("select coalesce(current_setting('app.onli_self_service',true),'') as value"),'');
  await assert.rejects(db.exec('insert into request_interpreters(request_id,interpreter_id) values(100,2)'));
  await db.exec('reset role');
  const actual = (await db.query('select * from request_interpreters')).rows[0];
  assert.equal(actual.contact_visible,false); assert.equal(Number(actual.agreed_total_amount),500000);
  assert.equal(await scalar('select assignment_status as value from requests where id=100'),'assignment_completed');
  await login(company); await assert.rejects(db.query("select allow_self_service_request_update('{}','{}')"),/permission denied/);
  await db.exec('reset role');
  for (const scope of ['on','company_publication','company_completion','interpreter_acceptance']) {
    await db.query("select set_config('app.onli_self_service',$1,false)",[scope]);
    await assert.rejects(db.exec("update requests set payment_status='paid' where id=100"),/Only admins/,
      'workflow context does not grant company financial/admin powers');
    await assert.rejects(db.exec('update requests set company_id=2 where id=100'),/Only admins/);
  }
  await db.exec("select set_config('app.onli_self_service','',false)");
  await login(interpreter); await assert.rejects(db.query('select submit_assignment_completion($1,$2)',[assigned.assignment_id,'Finished']),/NOT_FINISHED/);
  await seed(200); await login(company); const declined = await propose(200,2);
  await login(uuid(12)); assert.equal((await respond(declined,false)).status,'declined');
  await login(company); const expired = await propose(200,2);
  await db.exec('reset role'); await db.query("update assignment_offers set expires_at=now()-interval '1 hour' where id=$1",[expired.offer_id]);
  await login(company); const changed = await propose(200,1);
  await login(''); await db.exec('reset role'); await db.exec("update requests set event_location='Osaka' where id=200");
  await login(interpreter); await assert.rejects(respond(changed),/TERMS_CHANGED/);
  await login(company); await db.query('select cancel_assignment_offer($1)',[changed.offer_id]);
  await seed(300,30,1,'urgent');
  await db.exec('reset role'); assert.equal(await scalar('select is_public as value from requests where id=300'),false);
  await seed(400,-10);
  await db.exec('reset role');
  await db.exec("insert into request_interpreters(request_id,interpreter_id) values(400,1); insert into settlements values(400,1,123456,'paid')");
  const pastAssignment = await scalar('select id as value from request_interpreters where request_id=400');
  await login(company); await assert.rejects(db.query('select submit_assignment_completion($1,$2)',[pastAssignment,'Finished']),/FORBIDDEN/);
  await login(interpreter); await db.query('select submit_assignment_completion($1,$2)',[pastAssignment,'Finished']);
  await login(uuid(2)); await assert.rejects(db.query('select review_assignment_completion($1,true)',[pastAssignment]),/FORBIDDEN/);
  await login(company); await db.query('select review_assignment_completion($1,false,$2)',[pastAssignment,'Add report']);
  await login(interpreter); await db.query('select submit_assignment_completion($1,$2)',[pastAssignment,'Detailed report']);
  await login(company); await db.query('select review_assignment_completion($1,true)',[pastAssignment]);
  await db.query('select review_assignment_completion($1,true)',[pastAssignment]);
  await db.exec('reset role');
  assert.equal(await scalar('select operation_status as value from requests where id=400'),'operation_completed');
  assert.equal(await scalar('select count_onli_completed_work(1) as value'),1);
  const settlement = (await db.query('select * from settlements where request_id=400')).rows[0];
  assert.equal(settlement.payout_status,'paid'); assert.equal(Number(settlement.amount),123456); assert.ok(settlement.work_confirmed_at);
  await login(company); await assert.rejects(db.query('select * from assignment_completions'),/permission denied/);
  await assert.rejects(db.exec("insert into assignment_offers(request_id,application_id,interpreter_id,proposed_by,amount,terms) values(100,'"+uuid(1002)+"',2,'"+company+"',100,'{}')"),/permission denied/);
  await seed(500,30,2); await login(company); const conflict = await propose(500);
  await login(interpreter); await assert.rejects(respond(conflict),/SCHEDULE_CONFLICT/);
  await login(company); await db.query('select cancel_assignment_offer($1)',[conflict.offer_id]);
  await seed(600,60); await login(company); const withdrawn = await propose(600,2);
  await login(''); await db.exec('reset role'); await db.query("update job_applications set status='withdrawn' where id=$1",[uuid(6002)]);
  await login(uuid(12)); await assert.rejects(respond(withdrawn),/APPLICATION_UNAVAILABLE/);
  await login(company); await db.query('select cancel_assignment_offer($1)',[withdrawn.offer_id]);
  await seed(700,-5,2); await login(''); await db.exec('reset role');
  await db.exec('insert into request_interpreters(request_id,interpreter_id) values(700,1),(700,2)');
  const ids = (await db.query('select id,interpreter_id from request_interpreters where request_id=700 order by interpreter_id')).rows;
  await login(interpreter); await db.query('select submit_assignment_completion($1,$2)',[ids[0].id,'Finished']);
  await login(company); await db.query('select review_assignment_completion($1,true)',[ids[0].id]);
  await login(''); await db.exec('reset role');
  assert.equal(await scalar('select count_onli_completed_work(1) as value'),2,'individual confirmation counts before whole request completion');
  assert.notEqual(await scalar('select operation_status as value from requests where id=700'),'operation_completed');
  await login(uuid(12)); await db.query('select submit_assignment_completion($1,$2)',[ids[1].id,'Finished']);
  await login(company); await db.query('select review_assignment_completion($1,true)',[ids[1].id]);
  await login(''); await db.exec('reset role');
  assert.equal(await scalar('select operation_status as value from requests where id=700'),'operation_completed');
  assert.equal(await scalar('select count_onli_completed_work(1) as value'),2,'whole request transition does not double count');
  await seed(800,-10); await login(''); await db.exec('reset role');
  await db.exec("update requests set event_name='[TEST] Conference' where id=800; insert into request_interpreters(request_id,interpreter_id) values(800,1)");
  const testId = await scalar('select id as value from request_interpreters where request_id=800');
  await login(interpreter); await db.query('select submit_assignment_completion($1,$2)',[testId,'Finished']);
  await login(company); await db.query('select review_assignment_completion($1,true)',[testId]);
  await login(''); await db.exec('reset role');
  assert.equal(await scalar('select count_onli_completed_work(1) as value'),2,'test jobs remain excluded');
  await seed(900,-5); await login(''); await db.exec('reset role');
  await db.exec('insert into request_interpreters(request_id,interpreter_id) values(900,1)');
  const movedId = await scalar('select id as value from request_interpreters where request_id=900');
  await login(interpreter); await db.query('select submit_assignment_completion($1,$2)',[movedId,'Finished']);
  await login(''); await db.exec('reset role'); await db.exec('update requests set start_date=current_date+10,end_date=current_date+10 where id=900');
  await login(company); await assert.rejects(db.query('select review_assignment_completion($1,true)',[movedId]),/NOT_FINISHED/);
  await login(''); await db.exec('reset role');
  const alerts = (await db.query('select * from workflow_action_alerts')).rows;
  assert.ok(alerts.some((item) => item.event_type==='workflow_offer_received' && item.recipient_email==='interpreter@example.invalid'));
  assert.ok(alerts.some((item) => item.event_type==='workflow_offer_accepted' && item.recipient_email==='company@example.invalid'));
  assert.ok(alerts.some((item) => item.event_type==='workflow_completion_submitted' && item.recipient_type==='company'));
  assert.ok(alerts.some((item) => item.event_type==='workflow_completion_revision' && item.recipient_type==='interpreter'));
  assert.ok(alerts.some((item) => item.event_type==='workflow_completion_confirmed' && item.recipient_type==='interpreter'));
  assert.ok(alerts.every((item) => !JSON.stringify({title:item.title,message:item.message}).includes('500000')),'no remuneration in mail');
  await db.exec('select dispatch_workflow_action_alerts()');
  assert.equal(await scalar('select status as value from notifications where id=$1',[uuid(9999)]),'pending','historical pending mail untouched');
  assert.ok((await db.query('select body from net.calls')).rows.every(({body}) => body.scope==='workflow'));
  const dispatched = (await db.query("select id,nonce from workflow_action_alerts where status='dispatched' limit 1")).rows[0];
  assert.equal((await db.query('select * from claim_workflow_action_alert($1,gen_random_uuid())',[dispatched.id])).rows.length,0);
  assert.equal((await db.query('select * from claim_workflow_action_alert($1,$2)',[dispatched.id,dispatched.nonce])).rows.length,1);
  assert.equal((await db.query('select * from claim_workflow_action_alert($1,$2)',[dispatched.id,dispatched.nonce])).rows.length,0,'nonce replay denied');
  await assert.rejects(db.query("select finish_workflow_action_alert($1,'sent',null)",[dispatched.id]),/Provider confirmation/);
  await db.query("select finish_workflow_action_alert($1,'sent','smtp-confirmed')",[dispatched.id]);
  assert.equal(await scalar('select status as value from notifications where id=$1',[dispatched.id]),'sent');
  await login(company);
  await assert.rejects(db.query('select * from workflow_action_alerts'),/permission denied/);
  await assert.rejects(db.query('select dispatch_workflow_action_alerts()'),/permission denied/);
  await assert.rejects(db.query('select * from claim_workflow_action_alert($1,$2)',[dispatched.id,dispatched.nonce]),/permission denied/);

  const workerSource = (await readFile(new URL('../supabase/functions/admin-action-alert/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
  let handler, sent=0, finished='', claimAvailable=true;
  const worker = {
    Response, Set, String, Number, JSON, createEmailTemplate,
    Deno: {env:{get:()=> 'configured'},serve:(fn)=>{handler=fn;}},
    createClient:()=>({rpc:async(name,args)=>{
      if (name==='claim_workflow_action_alert') return {data:claimAvailable ? [{id:dispatched.id,event_type:'workflow_offer_received',
        recipient_email:'interpreter@example.invalid',portal_path:'/interpreter-mypage?tab=assignments',title:'New offer',message:'Log in to review'}] : [],error:null};
      assert.equal(name,'finish_workflow_action_alert');finished=args.p_status;return {error:null};
    }}),
    nodemailer:{createTransport:()=>({close:()=>{},sendMail:async(mail)=>{
      assert.equal(mail.to,'interpreter@example.invalid');assert.ok(mail.text.includes('?tab=assignments'));
      assert.match(mail.html, /ON-Link Interpretation Platform/);
      assert.match(mail.html, /class="email-button"/);
      assert.match(mail.html, /현재 상태/);
      assert.match(mail.html, /mailto:onlinkwith@gmail.com/);
      assert.ok(mail.html.includes('?tab=assignments'));
      sent++;return {messageId:'smtp-confirmed',accepted:['interpreter@example.invalid']};
    }})},
  };
  vm.runInNewContext(workerSource,{...worker});
  const workerRequest = (body)=>new Request('https://example.invalid',{method:'POST',body:JSON.stringify(body)});
  assert.equal((await handler(workerRequest({scope:'workflow',id:dispatched.id,nonce:dispatched.nonce,to:'attacker@example.invalid'}))).status,200);
  assert.equal(sent,1);assert.equal(finished,'sent');
  claimAvailable=false;
  assert.equal((await handler(workerRequest({scope:'workflow',id:dispatched.id,nonce:dispatched.nonce}))).status,401);
  assert.equal(sent,1);
  await login(''); await db.exec('reset role');
  await db.exec(`alter table jobs add column job_no text unique;
    alter table job_applications add column application_no text unique;
    alter table matchings add column matching_no text unique;
    update requests set request_no='ONLI-REQ-'||id;
    insert into matchings(id,request_id,interpreter_id,matching_no,status) values(90001,100,1,'ONLI-MAT-001','cancelled'),(90002,100,1,'ONLI-MAT-002','assigned');
    create table request_materials(id bigserial primary key,request_id bigint,created_at timestamptz default now());
    create table admin_alert_preferences(id boolean primary key,event_types jsonb);
    insert into admin_alert_preferences values(true,'{}');
    create table test_admin_alerts(kind text,source text,version text,unique(kind,source,version));
    create function enqueue_admin_action_alert(text,text,text,text,text) returns uuid language plpgsql as
    $$begin insert into test_admin_alerts values($1,$2,$3) on conflict do nothing;return null;end;$$;`);
  const financialBefore = await scalar("select jsonb_agg(jsonb_build_array(id,payment_status,client_price,interpreter_price,profit) order by id) as value from requests");
  const mailBefore = await scalar('select count(*)::int as value from workflow_action_alerts');
  await db.exec(await migration('20261008150000_linked_workflow_numbers.sql'));
  assert.equal(await scalar('select job_no as value from jobs where id=(select job_id from requests where id=100)'), 'ONLI-REQ-100-1');
  assert.equal(await scalar('select application_no as value from job_applications where id=$1',[uuid(1001)]), 'ONLI-REQ-100-1-APP-001');
  assert.equal(await scalar('select assignment_no as value from request_interpreters where request_id=100'), 'ONLI-REQ-100-1-ASG-001');
  assert.equal(await scalar('select count(distinct matching_no)::int as value from matchings where request_id=100'),2,'duplicate legacy assignment history remains distinct');
  assert.equal(await scalar('select count(*)::int as value from workflow_action_alerts'),mailBefore,'renumbering never sends mail');
  await db.exec(await migration('20261008160000_workflow_followups.sql'));
  await db.exec(await migration('20261008170000_nullable_discovery_regions.sql'));
  assert.equal(await scalar('select count(*)::int as value from workflow_action_alerts'),mailBefore,'no historical followup backfill');
  await login(company); await assert.rejects(db.query('select get_workflow_exceptions()'),/Admin required/);
  await assert.rejects(db.query('select prepare_workflow_followups()'),/permission denied/);
  await assert.rejects(db.query('select set_my_discovery_alerts(true)'),/FORBIDDEN/);
  await login(interpreter); assert.equal(await scalar('select get_my_discovery_alerts() as value'),false);
  assert.equal(await scalar('select set_my_discovery_alerts(true) as value'),true);
  await login('', 'anon'); await assert.rejects(db.query('select set_my_discovery_alerts(true)'),/permission denied/);
  await login(''); await db.exec('reset role');
  await db.exec("update interpreters set available_regions=array['Tokyo'],level='Lv3' where id=1");
  await seed(901,2);
  await db.exec("update requests set request_no='ONLI-REQ-901' where id=901");
  // Link trigger handles requests that receive their number before publication in production.
  await db.exec('update requests set job_id=job_id where id=901');
  assert.equal(await scalar('select count(*)::int as value from workflow_action_alerts where event_type=\'workflow_matching_job\' and source_id=\'901\''),1);
  await login(company); const reminderOffer=await propose(901);
  await login('');await db.exec('reset role');
  await db.query("update assignment_offers set expires_at=now()+interval '4 hours' where id=$1",[reminderOffer.offer_id]);
  await db.exec('select prepare_workflow_followups()');
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where event_type='workflow_offer_reminder' and source_id=$1",[reminderOffer.offer_id]),1);
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where event_type='workflow_unassigned_reminder' and source_id='901'"),1);
  await db.exec('select prepare_workflow_followups()');
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where event_type='workflow_offer_reminder' and source_id=$1",[reminderOffer.offer_id]),1,'deduplicated reminders');
  await login(interpreter); const reminderAssignment=await respond(reminderOffer);
  const visibleWork=(await db.query('select get_my_work_completions() as value')).rows.map(row=>row.value);
  assert.ok(visibleWork.find(item=>item.assignment_id===reminderAssignment.assignment_id)?.assignment_no.includes('ONLI-REQ-901-1-ASG-'));
  await login('');await db.exec('reset role');
  assert.equal(await scalar('select status as value from jobs where id=(select job_id from requests where id=901)'), 'assigned');
  await assert.rejects(db.query('insert into job_applications(id,job_id,interpreter_id) select $1,job_id,2 from requests where id=901',[uuid(9919)]),/RECRUITING_FULL/);
  const stale=(await db.query("update workflow_action_alerts set status='dispatched',nonce=gen_random_uuid() where event_type='workflow_unassigned_reminder' and source_id='901' returning id,nonce")).rows[0];
  assert.equal((await db.query('select * from claim_workflow_action_alert($1,$2)',[stale.id,stale.nonce])).rows.length,0);
  assert.equal(await scalar('select status as value from workflow_action_alerts where id=$1',[stale.id]),'cancelled','stop reminders after action');
  await db.exec('select prepare_workflow_followups()');
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where event_type='workflow_materials_reminder' and source_id='901'"),1);
  await db.exec('insert into request_materials(request_id) values(901),(901)');
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where event_type='workflow_materials_uploaded' and source_id='901'"),1,'one materials email per day');
  await db.exec("update request_interpreters set status='cancelled' where request_id=901");
  assert.equal(await scalar('select status as value from jobs where id=(select job_id from requests where id=901)'), 'open','cancelled assignment reopens auto-closed recruiting');
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where event_type='workflow_recruiting_reopened' and source_id='901'"),1);
  assert.deepEqual(await scalar("select jsonb_agg(jsonb_build_array(id,payment_status,client_price,interpreter_price,profit) order by id) as value from requests where id<>901"),financialBefore);
  await seed(902,4);
  await login('');await db.exec('reset role');await db.exec('update requests set start_date=current_date-2,end_date=current_date-2 where id=902');
  await assert.rejects(db.query('insert into job_applications(id,job_id,interpreter_id) select $1,job_id,2 from requests where id=902',[uuid(9929)]),/RECRUITING_CLOSED/);
  assert.deepEqual(rankApplicants([{id:'1',profile:{level:'Lv1',available_regions:['Osaka']}},{id:'2',profile:{level:'Lv3',available_regions:['Tokyo']}}],{requested_level:'Lv2',event_location:'Tokyo'}).map(item=>item.id),['2','1']);
  assert.equal(validWorkflowReturnTarget('/business/mypage?tab=materials','company'),true);
  assert.equal(validWorkflowReturnTarget('/business/mypage?tab=work','interpreter'),false);
  assert.equal(validWorkflowReturnTarget('https://attacker.invalid/','company'),false);
  await seed(903,3);
  await login('');await db.exec('reset role');
  await db.exec("insert into request_interpreters(request_id,interpreter_id,status) values(903,2,'assigned');update requests set start_date=current_date-1,end_date=current_date-1 where id=903;update workflow_automation_config set activated_at=now()-interval '2 days';");
  await db.exec('select prepare_workflow_followups()');
  const finishId=await scalar('select id as value from request_interpreters where request_id=903');
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where event_type='workflow_completion_reminder' and source_id=$1",[String(finishId)]),1);
  await db.query("insert into assignment_completions(assignment_id,request_id,interpreter_id,status,report,submitted_at) values($1,903,2,'submitted','Finished',now()-interval '25 hours')",[finishId]);
  await db.exec('select prepare_workflow_followups()');
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where event_type='workflow_review_reminder' and source_id=$1",[String(finishId)]),1);
  const staleCompletion=(await db.query("update workflow_action_alerts set status='dispatched',nonce=gen_random_uuid() where event_type='workflow_completion_reminder' and source_id=$1 returning id,nonce",[String(finishId)])).rows[0];
  assert.equal((await db.query('select * from claim_workflow_action_alert($1,$2)',[staleCompletion.id,staleCompletion.nonce])).rows.length,0);
  await login(interpreter);await db.query('select set_my_discovery_alerts(false)');
  await seed(904,4);
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where event_type='workflow_matching_job' and source_id='904'"),0,'discovery opt-out enforced');
  await db.exec('select queue_workflow_exception_alerts()');
  await db.exec('create or replace function is_active_admin() returns boolean language sql stable as $$select true$$');
  assert.ok((await db.query('select * from get_workflow_exceptions()')).rows.length>=0);
  await login(interpreter);await db.query('select set_my_discovery_alerts(true)');
  await login('');await db.exec('reset role');await db.exec('update interpreters set available_regions=null where id=1');
  await seed(905,5);
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where event_type='workflow_matching_job' and source_id='905'"),0,'missing discovery regions cannot break request publication');
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where event_type like '%participation%'"),0,'no pre-event participation reconfirmation');
  await db.exec(await migration('20261008180000_request_messages.sql'));
  const beforeMessages = await scalar("select jsonb_agg(jsonb_build_array(id,payment_status,client_price,interpreter_price,profit) order by id) as value from requests");
  await login(company);
  const conversation = (await db.query('select get_my_request_conversations() as value')).rows
    .map((row) => row.value).find((row) => row.assignment_id===String(finishId));
  assert.ok(conversation?.can_send);
  const observed = await scalar('select send_request_message($1,$2,$3) as value',[conversation.id,'Integration test, not a live message',uuid(777701)]);
  await login(''); await db.exec('reset role');
  await db.exec("update request_messages set created_at=now()-interval '3 minutes'");
  assert.equal(await scalar('select queue_request_message_alerts() as value'),1);
  const pendingMessageAlert = (await db.query("update workflow_action_alerts set status='dispatched',nonce=gen_random_uuid() where event_type='workflow_message_unread' returning id,nonce")).rows[0];
  await login(uuid(12)); await db.query('select read_request_messages($1,$2)',[conversation.id,observed.id]);
  await login(''); await db.exec('reset role');
  assert.equal((await db.query('select * from claim_workflow_action_alert($1,$2)',[pendingMessageAlert.id,pendingMessageAlert.nonce])).rows.length,0,'real worker claim suppresses already-read messages');
  assert.equal(await scalar('select status as value from workflow_action_alerts where id=$1',[pendingMessageAlert.id]),'cancelled');
  await login(company); await db.query('select send_request_message($1,$2,$3)',[conversation.id,'Second integration message',uuid(777702)]);
  await login(''); await db.exec('reset role');
  await db.exec("update request_messages set created_at=now()-interval '3 minutes';update workflow_action_alerts set created_at=now()-interval '31 minutes' where event_type='workflow_message_unread'");
  assert.equal(await scalar('select queue_request_message_alerts() as value'),1);
  const newMessageAlert=(await db.query("update workflow_action_alerts set status='dispatched',nonce=gen_random_uuid() where event_type='workflow_message_unread' and status='pending' returning id,nonce")).rows[0];
  const claimMessage=(await db.query('select * from claim_workflow_action_alert($1,$2)',[newMessageAlert.id,newMessageAlert.nonce])).rows[0];
  assert.equal(claimMessage.portal_path,'/interpreter-mypage?tab=messages');
  assert.equal(claimMessage.recipient_email,'second@example.invalid');
  await db.query("select finish_workflow_action_alert($1,'sent','isolated-provider-test')",[newMessageAlert.id]);
  assert.deepEqual(await scalar("select jsonb_agg(jsonb_build_array(id,payment_status,client_price,interpreter_price,profit) order by id) as value from requests"),beforeMessages,'messaging never changes financial states');
  assert.equal(await scalar("select status as value from notifications where id=$1",[uuid(9999)]),'pending','historical notifications remain untouched');
  const beforeAutomation = await scalar("select jsonb_agg(jsonb_build_array(id,payment_status,client_price,interpreter_price,profit) order by id) as value from requests");
  const beforeAutomationMail = await scalar('select count(*)::int as value from workflow_action_alerts');
  await db.exec(await migration('20261008200000_recruiting_automation_safety.sql'));
  assert.equal(await scalar('select count(*)::int as value from workflow_action_alerts'),beforeAutomationMail,'migration does not backfill email');
  await seed(910,10);
  await login(company); const expiringAutomation=await propose(910);
  await login(''); await db.exec('reset role');
  assert.equal(await scalar('select status as value from jobs where id=(select job_id from requests where id=910)'), 'recruiting','pending offers never close recruiting');
  await db.query('insert into job_applications(id,job_id,interpreter_id) select $1,job_id,2 from requests where id=910',[uuid(91099)]);
  await db.query("update assignment_offers set expires_at=now()-interval '1 minute' where id=$1",[expiringAutomation.offer_id]);
  await db.exec('select dispatch_workflow_action_alerts()');
  assert.equal(await scalar('select status as value from assignment_offers where id=$1',[expiringAutomation.offer_id]),'expired');
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where event_type='workflow_offer_expired' and source_id=$1",[expiringAutomation.offer_id]),2,'expiry alerts both parties once');
  await db.exec('select dispatch_workflow_action_alerts()');
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where event_type='workflow_offer_expired' and source_id=$1",[expiringAutomation.offer_id]),2);
  await login(company); const replacementAutomation=await propose(910,2);
  assert.equal(replacementAutomation.status,'pending','expired reservation frees slot for another applicant');
  await db.query('select cancel_assignment_offer($1)',[replacementAutomation.offer_id]);
  await login(''); await db.exec('reset role');
  await seed(911,11);
  await db.exec("insert into request_interpreters(request_id,interpreter_id) values(911,1)");
  assert.equal(await scalar('select status as value from jobs where id=(select job_id from requests where id=911)'), 'assigned');
  await db.exec("update request_interpreters set status='cancelled' where request_id=911");
  assert.equal(await scalar('select status as value from jobs where id=(select job_id from requests where id=911)'), 'open');
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where event_type='workflow_recruiting_reopened' and source_id='911' and recipient_type='company'"),1,'company receives vacancy without discovery opt-in');
  const vacancy=(await db.query("update workflow_action_alerts set status='dispatched',nonce=gen_random_uuid() where event_type='workflow_recruiting_reopened' and source_id='911' and recipient_type='company' returning id,nonce")).rows[0];
  await db.exec("insert into request_interpreters(request_id,interpreter_id) values(911,2)");
  assert.equal((await db.query('select * from claim_workflow_action_alert($1,$2)',[vacancy.id,vacancy.nonce])).rows.length,0,'refilled vacancy suppresses stale email');
  await db.exec("update request_interpreters set status='cancelled' where request_id=911 and interpreter_id=2");
  const nextVacancy=(await db.query("update workflow_action_alerts set status='dispatched',nonce=gen_random_uuid() where event_type='workflow_recruiting_reopened' and source_id='911' and recipient_type='company' and status='pending' returning id,nonce")).rows[0];
  const vacancyClaim=(await db.query('select * from claim_workflow_action_alert($1,$2)',[nextVacancy.id,nextVacancy.nonce])).rows[0];
  assert.equal(vacancyClaim.portal_path,'/business/mypage?tab=applicants');
  assert.equal(vacancyClaim.recipient_email,'company@example.invalid');
  assert.equal(vacancyClaim.recipient_type,'company','live claim resolves verified company without interpreter opt-in');
  await db.query("select finish_workflow_action_alert($1,'sent','isolated-vacancy-test')",[nextVacancy.id]);
  await seed(912,12);
  await db.exec("insert into request_interpreters(request_id,interpreter_id) values(912,1);update jobs set status='closed' where id=(select job_id from requests where id=912);update request_interpreters set status='cancelled' where request_id=912");
  assert.equal(await scalar('select status as value from jobs where id=(select job_id from requests where id=912)'), 'closed','manual closure survives cancelled assignment');
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where source_id='912' and event_type='workflow_recruiting_reopened'"),0);
  await seed(913,13);
  await db.exec("update jobs set deadline=(now() at time zone 'Asia/Seoul')::date-1 where id=(select job_id from requests where id=913)");
  await assert.rejects(db.query('insert into job_applications(id,job_id,interpreter_id) select $1,job_id,2 from requests where id=913',[uuid(91399)]),/RECRUITING_CLOSED/,'deadline rejects before scheduler scan');
  await db.exec('select sync_workflow_recruiting(913)');
  assert.equal(await scalar('select status as value from jobs where id=(select job_id from requests where id=913)'), 'closed');
  assert.equal(await scalar('select reason as value from workflow_closed_jobs where job_id=(select job_id from requests where id=913)'), 'deadline');
  await seed(914,14);
  await db.exec("update jobs set deadline=(now() at time zone 'Asia/Seoul')::date where id=(select job_id from requests where id=914)");
  await db.query('insert into job_applications(id,job_id,interpreter_id) select $1,job_id,2 from requests where id=914',[uuid(91499)]);
  await db.exec('select sync_workflow_recruiting(914)');
  assert.equal(await scalar('select status as value from jobs where id=(select job_id from requests where id=914)'), 'recruiting','deadline today open until Korean midnight');
  await seed(915,15);
  await db.exec("insert into request_interpreters(request_id,interpreter_id) values(915,1);update requests set requested_people_count=2 where id=915");
  assert.equal(await scalar('select status as value from jobs where id=(select job_id from requests where id=915)'), 'open','increasing capacity immediately reopens automatic closure');
  await db.exec('update requests set requested_people_count=1 where id=915');
  assert.equal(await scalar('select status as value from jobs where id=(select job_id from requests where id=915)'), 'assigned','decreasing capacity immediately closes recruiting');
  await db.exec("update requests set operation_status='operation_cancelled' where id=915;update request_interpreters set status='cancelled' where request_id=915");
  assert.equal(await scalar('select status as value from requests where id=915'),'assigned','cancelled request lifecycle is not resurrected');
  await login(company); await assert.rejects(db.query('select sync_workflow_recruiting(910)'),/permission denied/);
  await assert.rejects(db.query('select workflow_recruiting_deadline_passed($1)',[uuid(910)]),/permission denied/);
  await login(''); await db.exec('reset role');
  assert.deepEqual(await scalar("select jsonb_agg(jsonb_build_array(id,payment_status,client_price,interpreter_price,profit) order by id) as value from requests where id<910"),beforeAutomation,'automation leaves existing financial states unchanged');
  assert.equal(await scalar("select status as value from notifications where id=$1",[uuid(9999)]),'pending','no historical notification drain');
  const beforePostAssignment = await scalar("select jsonb_agg(jsonb_build_array(id,payment_status,client_price,interpreter_price,profit) order by id) as value from requests");
  const beforePostAssignmentMail = await scalar('select count(*)::int as value from workflow_action_alerts');
  await db.exec(await migration('20261008220000_post_assignment_automation.sql'));
  assert.equal(await scalar('select count(*)::int as value from workflow_action_alerts'),beforePostAssignmentMail,'no historical change/material email');
  await seed(930,100,2);
  await db.exec("insert into request_interpreters(request_id,interpreter_id) values(930,1),(930,2)");
  const newTerms=await scalar("select jsonb_build_object('start_date',current_date+101,'end_date',current_date+101,'event_date',current_date+101,'event_location','New venue','event_start_time','09:00','event_end_time','17:00','work_hours','Eight hours') as value");
  await login(uuid(2)); await assert.rejects(db.query('select propose_request_change(930,$1,$2,$3)',[newTerms,'Change venue',uuid(930000)]),/FORBIDDEN/);
  await login(company);
  await assert.rejects(db.query('select propose_request_change(930,$1,$2,$3)',[{...newTerms,client_price:99},'Invalid money',uuid(930999)]),/INVALID_TERMS/);
  const change=await scalar('select propose_request_change(930,$1,$2,$3) as value',[newTerms,'Change venue',uuid(930001)]);
  assert.equal(await scalar('select propose_request_change(930,$1,$2,$3) as value',[newTerms,'Change venue',uuid(930001)]),change,'proposal transport retry is idempotent');
  await assert.rejects(db.query('select propose_request_change(930,$1,$2,$3)',[newTerms,'Duplicate',uuid(930002)]),/ALREADY_PENDING/);
  await login('');await db.exec('reset role');
  assert.equal(await scalar('select event_location as value from requests where id=930'),'Tokyo','proposal never changes current conditions');
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where event_type='workflow_change_proposed' and source_id=$1",[change]),2);
  await login(company); await assert.rejects(db.query('select respond_request_change($1,true)',[change]),/FORBIDDEN/);
  await login(interpreter);
  const interpreterChanges=(await db.query('select get_my_request_changes() as value')).rows.map(row=>row.value);
  assert.equal(interpreterChanges.find(row=>row.request_id==='930').changes[0].my_status,'pending');
  assert.equal(await scalar('select respond_request_change($1,true) as value',[change]),'pending');
  await assert.rejects(db.query('select respond_request_change($1,false)',[change]),/ALREADY_RESPONDED/,'recorded consent cannot be silently replaced');
  await db.exec('reset role'); assert.equal(await scalar('select event_location as value from requests where id=930'),'Tokyo','partial agreement preserves original terms');
  await login(uuid(12)); assert.equal(await scalar('select respond_request_change($1,true) as value',[change]),'applied');
  await db.exec('reset role');
  assert.equal(await scalar('select event_location as value from requests where id=930'),'New venue');
  assert.equal(await scalar('select location as value from jobs where id=(select job_id from requests where id=930)'),'New venue');
  assert.equal(await scalar("select coalesce(current_setting('app.onli_self_service',true),'') as value"),'','context restored');
  assert.equal(await scalar("select count(*)::int as value from workflow_action_alerts where event_type='workflow_change_applied' and source_id=$1",[change]),3);
  await login(interpreter); assert.equal(await scalar('select respond_request_change($1,true) as value',[change]),'applied','response retry does not apply twice');
  await db.exec('reset role');
  await db.exec("select set_config('app.onli_self_service','agreed_condition_change',true)");
  await assert.rejects(db.exec("update requests set client_price=123 where id=930"),/Only admins/,'new agreement context does not authorize money edits');
  await db.exec("select set_config('app.onli_self_service','',false)");
  await login(company);const declinedChange=await scalar('select propose_request_change(930,$1,$2,$3) as value',[{...newTerms,event_location:'Rejected venue'},'Another venue',uuid(930003)]);
  await login(interpreter); assert.equal(await scalar('select respond_request_change($1,false) as value',[declinedChange]),'declined');
  await db.exec('reset role');assert.equal(await scalar('select event_location as value from requests where id=930'),'New venue','decline preserves conditions');
  await login(company);const expiredChange=await scalar('select propose_request_change(930,$1,$2,$3) as value',[{...newTerms,event_location:'Expired venue'},'Another venue',uuid(930004)]);
  await login('');await db.exec('reset role');
  await db.query("update request_changes set expires_at=now()-interval '1 minute' where id=$1",[expiredChange]);
  await db.exec('select prepare_workflow_followups()');
  assert.equal(await scalar('select status as value from request_changes where id=$1',[expiredChange]),'expired');
  assert.equal(await scalar('select event_location as value from requests where id=930'),'New venue');
  await login(company);const staleChange=await scalar('select propose_request_change(930,$1,$2,$3) as value',[{...newTerms,event_location:'Stale venue'},'Another venue',uuid(930005)]);
  await login('');await db.exec('reset role');
  await db.exec("update request_interpreters set status='cancelled' where request_id=930 and interpreter_id=2");
  await login(interpreter);await assert.rejects(db.query('select respond_request_change($1,true)',[staleChange]),/STALE/,'assignment changes require new agreement');
  await login(company);await db.query('select cancel_request_change($1)',[staleChange]);
  await login('', 'anon');await assert.rejects(db.query('select get_my_request_changes()'),/permission denied/);
  await login(uuid(2));assert.ok(!(await db.query('select get_my_request_changes() as value')).rows.some(row=>row.value.request_id==='930'));
  for(const table of ['request_changes','request_change_responses','material_acknowledgements']) await assert.rejects(db.query(`select * from ${table}`),/permission denied/);
  await login('');await db.exec('reset role');
  await db.exec('alter table request_materials add column file_path text;alter table request_materials add column file_size bigint;alter table request_materials add column file_name text');
  const materialId=await scalar("insert into request_materials(request_id,file_path,file_name,file_size) values(930,'private/version-one.pdf','Guide.pdf',100) returning id as value");
  await login(uuid(2));await assert.rejects(db.query('select get_material_acknowledgements(930)'),/FORBIDDEN/);
  await login(interpreter);const receipt=(await db.query('select get_material_acknowledgements(930) as value')).rows[0].value;
  assert.equal(receipt.acknowledged_at,null);
  await db.query('select acknowledge_request_material($1,$2)',[materialId,receipt.version]);
  await db.query('select acknowledge_request_material($1,$2)',[materialId,receipt.version]);
  await login(company);const companyReceipt=(await db.query('select get_material_acknowledgements(930) as value')).rows.find(row=>row.value.material_id===String(materialId)).value;
  assert.ok(companyReceipt.acknowledged_at);
  await assert.rejects(db.query('select acknowledge_request_material($1,$2)',[materialId,receipt.version]),/FORBIDDEN/,'company cannot acknowledge for interpreter');
  await login('');await db.exec('reset role');await db.query("update request_materials set file_path='private/version-two.pdf' where id=$1",[materialId]);
  await login(interpreter);await assert.rejects(db.query('select acknowledge_request_material($1,$2)',[materialId,receipt.version]),/VERSION_CHANGED/);
  assert.equal((await db.query('select get_material_acknowledgements(930) as value')).rows[0].value.acknowledged_at,null,'replacement invalidates previous acknowledgement');
  await login('');await db.exec('reset role');
  await seed(931,102);
  await db.exec('insert into request_interpreters(request_id,interpreter_id) values(931,1)');
  const conflictingTerms=await scalar("select jsonb_build_object('start_date',current_date+102,'end_date',current_date+102,'event_date',current_date+102,'event_location','Overlap venue','event_start_time','09:00','event_end_time','17:00','work_hours','Eight hours') as value");
  await login(company);const conflictingChange=await scalar('select propose_request_change(930,$1,$2,$3) as value',[conflictingTerms,'Overlapping date',uuid(930006)]);
  await login(interpreter);await assert.rejects(db.query('select respond_request_change($1,true)',[conflictingChange]),/SCHEDULE_CONFLICT/);
  const conflictView=(await db.query('select get_my_request_changes() as value')).rows.find(row=>row.value.request_id==='930').value;
  assert.equal(conflictView.changes.find(item=>item.id===conflictingChange).my_status,'pending','failed final consent rolls back');
  await login(company);await db.query('select cancel_request_change($1)',[conflictingChange]);
  const transferredChange=await scalar('select propose_request_change(930,$1,$2,$3) as value',[{...newTerms,event_location:'Transfer test'},'Transfer test',uuid(930007)]);
  await login('');await db.exec('reset role');
  await db.query('update requests set company_id=2,company_auth_user_id=$1 where id=930',[uuid(2)]);
  assert.equal(await scalar('select status as value from request_changes where id=$1',[transferredChange]),'cancelled');
  await login(uuid(2));const transferredView=(await db.query('select get_my_request_changes() as value')).rows.find(row=>row.value.request_id==='930').value;
  assert.deepEqual(transferredView.changes,[],'transferred company cannot read prior-company change notes');
  await login('');await db.exec('reset role');
  const template=makeRepeatRequestTemplate({event_name:'Repeat',start_date:'2020-01-01',contact_email:'old@example.invalid',assigned_interpreter_id:99,payment_status:'paid',client_price:99,request_no:'ONLI-REQ-OLD',reference_file_path:'private/old.pdf',requested_people_count:2});
  assert.deepEqual(template,{event_name:'Repeat',requested_people_count:2});
  assert.equal(validWorkflowReturnTarget('/business/mypage?tab=changes','company'),true);
  assert.equal(validWorkflowReturnTarget('/business/mypage?tab=changes','interpreter'),false);
  await db.exec("update workflow_action_alerts set status='uncertain' where id=(select id from workflow_action_alerts order by created_at desc limit 1)");
  assert.ok((await db.query('select get_workflow_exceptions() as value')).rows.some(row=>row.value.type==='email_failed'));
  await db.exec('select queue_workflow_exception_alerts();select queue_workflow_exception_alerts()');
  assert.ok((await db.query("select * from test_admin_alerts where source like 'mail:%'")).rows.length>0,'new failures reach existing administrator alert preference');
  await db.exec('create or replace function is_active_admin() returns boolean language sql stable as $$select false$$');
  await login(company);await assert.rejects(db.query('select get_workflow_exceptions()'),/Admin required/);
  await login('');await db.exec('reset role');
  assert.deepEqual(await scalar("select jsonb_agg(jsonb_build_array(id,payment_status,client_price,interpreter_price,profit) order by id) as value from requests where id<930"),beforePostAssignment,'post-assignment automation leaves finances unchanged');
  assert.equal(await scalar("select status as value from notifications where id=$1",[uuid(9999)]),'pending');
  worker.createClient=()=>({rpc:async(name)=>name==='claim_workflow_action_alert'
    ? {data:[{id:uuid(88888),event_type:'workflow_change_proposed',recipient_email:'interpreter@example.invalid',portal_path:'/interpreter-mypage?tab=changes',title:'업무 조건 변경 요청',message:'로그인 후 확인해 주세요.'}],error:null}
    : {error:null}});
  let changeEmail=0;
  worker.nodemailer={createTransport:()=>({close:()=>{},sendMail:async(mail)=>{
    assert.match(mail.html,/ON-Link Interpretation Platform/);assert.ok(mail.html.includes('?tab=changes'));
    assert.equal(mail.to,'interpreter@example.invalid');assert.ok(!mail.html.includes('New venue'));changeEmail++;
    return {messageId:'isolated-change-provider',accepted:['interpreter@example.invalid']};
  }})};
  vm.runInNewContext(workerSource,{...worker});
  assert.equal((await handler(workerRequest({scope:'workflow',id:uuid(88888),nonce:uuid(88889)}))).status,200);
  assert.equal(changeEmail,1,'new condition emails use original branded form and allowlisted role link');
  console.log('PASS: unanimous condition changes, original terms until agreement, retries, decline/expiry, stale assignment denial, private material receipts, replacement invalidation, safe repeat templates and admin-only delivery exceptions');
  console.log('PASS: scheduled offer expiry, released slots, private company vacancy alerts, stale alert suppression, manual closure protection, Korean deadline guard and live capacity sync');
  console.log('PASS: request messages integrate with canonical assignments, original private email claims, read cancellation and unchanged financial state');
  console.log('PASS: linked immutable display numbers, opt-in discovery, reminders, stale cancellation, recruiting closure/reopening, materials dedupe, scoped exceptions and unchanged financial states');
  console.log('PASS: offer acceptance, ownership, capacity reservations, expiry, cancellation, immutable terms, protected lifecycle, safe publication, bilateral completion, credit deduplication and unchanged payments');
  console.log('PASS: production assignment guard regression, future-only recipient-resolved emails, no historical sends, nonce authentication, replay denial and SMTP confirmation');
} catch (error) {
  console.error(error.message, error.stack?.split('\n').filter((line) => line.includes('test-self-service-workflow')).join('\n'));
  process.exitCode = 1;
} finally { await db.close(); }
