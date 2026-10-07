import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const company = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const app = (id) => `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`;
try {
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table businesses(id bigint primary key,auth_user_id uuid,status text);
    create table jobs(id uuid primary key,status text,assignment_status text,start_date date,end_date date);
    create table requests(id bigint primary key,company_id bigint,company_auth_user_id uuid,job_id uuid,
      requested_people_count integer,required_count integer,start_date date,end_date date,event_date date,
      status text default 'draft',operation_status text default 'scheduled',matching_status text,assignment_status text,
      assigned_interpreter_id bigint,assigned_interpreter_name text,matched_interpreter_id bigint,
      matched_interpreter_name text,updated_at timestamptz);
    create function portal_owns_request(p_id bigint) returns boolean language sql stable security definer as
      $$select auth.uid() is not null and exists(select 1 from requests r join businesses b
      on b.auth_user_id=auth.uid() where r.id=p_id and b.status='승인 완료'
      and (r.company_id=b.id or r.company_auth_user_id=auth.uid()))$$;
    create table interpreters(id bigint primary key,name text,is_public boolean default true,activity_status text default 'active');
    create view public_interpreters as select id,name from interpreters where is_public;
    create function portal_pick(j jsonb,keys text[]) returns jsonb language sql immutable as
      $$select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(j) where key=any(keys)$$;
    create table job_applications(id uuid primary key,job_id uuid,interpreter_id bigint,status text default 'pending',created_at timestamptz default now());
    create table request_interpreters(id bigserial primary key,request_id bigint,interpreter_id bigint,
      status text default 'assigned',contact_visible boolean default false,assigned_at timestamptz default now(),unique(request_id,interpreter_id));
    create table matchings(id bigint,request_id bigint,job_id uuid,interpreter_id bigint,status text,start_date date,end_date date);
    alter table request_interpreters enable row level security;
    grant usage on schema public,auth to anon,authenticated;
    grant insert,update,delete on request_interpreters to authenticated;
    grant usage on sequence request_interpreters_id_seq to authenticated;
    insert into businesses values(1,'${company}','승인 완료'),(2,'${other}','승인 완료');
    insert into interpreters(id,name) values(1,'First'),(2,'Second'),(3,'Third'),(4,'Private'),(5,'Paused');
    update interpreters set is_public=false where id=4;
    update interpreters set activity_status='paused' where id=5;
  `);
  const migration = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
  await db.exec(await migration('20260711020500_sync_assignment_lifecycle_from_request_interpreters.sql'));
  await db.exec(await migration('20261008090000_company_applicant_assignment.sql'));
  const login = async (uid, role = 'authenticated') => {
    await db.exec('reset role');
    await db.query("select set_config('test.uid',$1,false)", [uid]);
    await db.exec(`set role ${role}`);
  };
  const seed = async (id, owner = 1, count = 1, days = 30) => {
    await db.exec('reset role');
    await db.query("insert into jobs(id,status) values($1,'open')", [app(id)]);
    await db.query(`insert into requests(id,company_id,job_id,requested_people_count,start_date,end_date)
      values($1,$2,$3,$4,current_date+$5::integer,current_date+$5::integer+2)`, [id, owner, app(id), count, days]);
    for (let interpreter = 1; interpreter <= 5; interpreter++) {
      await db.query('insert into job_applications(id,job_id,interpreter_id) values($1,$2,$3)', [app(id * 10 + interpreter), app(id), interpreter]);
    }
  };
  const assign = async (id, interpreter = 1) => (await db.query(
    'select assign_company_applicant($1,$2) as result', [id, app(id * 10 + interpreter)])).rows[0].result;
  await seed(10); await seed(20, 2); await seed(30, 1, 2); await seed(40, 1, 1, -10);
  await login('', 'anon'); await assert.rejects(assign(10));
  await login(other); await assert.rejects(assign(10), /ASSIGNMENT_FORBIDDEN/);
  await login('00000000-0000-0000-0000-000000000099'); await assert.rejects(assign(10), /ASSIGNMENT_FORBIDDEN/);
  await login(company);
  await assert.rejects(db.query('select assign_company_applicant(10,$1)', [app(201)]), /INVALID_APPLICATION/);
  await assert.rejects(assign(10, 4), /INTERPRETER_UNAVAILABLE/);
  await assert.rejects(assign(10, 5), /INTERPRETER_UNAVAILABLE/);
  await assert.rejects(assign(40), /REQUEST_CLOSED/);
  await assert.rejects(db.exec('insert into request_interpreters(request_id,interpreter_id) values(10,1)'));
  await assert.rejects(db.query('select company_assignment_window(10)'), /permission denied/);
  const first = await assign(10);
  assert.equal(first.already_assigned, false);
  assert.equal((await assign(10)).already_assigned, true, 'retries are idempotent');
  await assert.rejects(assign(10, 2), /CAPACITY_FULL/);
  await assert.rejects(assign(30), /SCHEDULE_CONFLICT/);
  await db.exec('reset role');
  assert.equal((await db.query('select contact_visible from request_interpreters')).rows[0].contact_visible, false);
  assert.equal((await db.query('select assignment_status from requests where id=10')).rows[0].assignment_status, 'assignment_completed');
  assert.equal((await db.query('select status from jobs where id=$1', [app(10)])).rows[0].status, 'assigned');
  assert.equal((await db.query('select status from job_applications where id=$1', [app(101)])).rows[0].status, 'accepted');
  await db.exec("update job_applications set status='withdrawn' where interpreter_id=2 and job_id='" + app(30) + "'");
  await login(company); await assert.rejects(assign(30, 2), /APPLICATION_UNAVAILABLE/);
  await assign(30, 3);
  await db.exec('reset role');
  assert.equal((await db.query('select assignment_status from requests where id=30')).rows[0].assignment_status, 'assignment_in_progress');
  await db.exec("update businesses set status='검토중' where id=1");
  await login(company); await assert.rejects(assign(30, 3), /FORBIDDEN/);
  await db.exec('reset role'); await db.exec("update businesses set status='승인 완료' where id=1");
  await seed(50, 1, 1, 60);
  await db.exec("insert into matchings values(1,20,'" + app(20) + "',2,'confirmed',current_date+60,current_date+61)");
  await login(company); await assert.rejects(assign(50, 2), /SCHEDULE_CONFLICT/);
  const rows = (await db.query('select get_company_portal_applicants(10) as result')).rows;
  assert.equal(rows.find((r) => r.result.id === app(101)).result.assigned, true);
  assert.equal(rows[0].result.assigned_count, 1);
  assert.equal((await db.query('select get_company_portal_applicants(20)')).rows.length, 0);
  console.log('PASS: company ownership, approval, private contact gating, capacity, dates, inactive/withdrawn applicants, schedule conflicts, idempotency, lifecycle synchronization and direct-write denial');
} finally {
  await db.close();
}
