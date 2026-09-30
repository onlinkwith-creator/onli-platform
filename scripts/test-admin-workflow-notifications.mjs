import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const companyId = '00000000-0000-0000-0000-000000000001';
const interpreterId = '00000000-0000-0000-0000-000000000002';

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create table interpreters(id bigint primary key,auth_user_id uuid,email text,name text,
      status text,approved boolean,available_regions text[],specialties text[]);
    create table businesses(auth_user_id uuid,contact_email text,company_name text,contact_name text);
    create table requests(id bigint primary key,company_auth_user_id uuid,company_name text,
      event_name text,event_location text,email text,contact_name text,contact_status text);
    create table request_interpreters(id bigint primary key,request_id bigint,interpreter_id bigint);
    create table queued(event_type text,target_id text,recipient_type text,recipient_email text,payload jsonb);
    create function public.enqueue_notification_event_v2(
      event_type text,target_type text,target_id text,recipient_type text,
      recipient_email text,recipient_phone text,payload jsonb,channel text,title text,
      message text,related_request_id uuid,related_document_id uuid,
      recipient_id uuid,recipient_name text
    ) returns uuid language plpgsql as $$
    begin
      insert into queued values(event_type,target_id,recipient_type,recipient_email,payload);
      return '00000000-0000-0000-0000-000000000003'::uuid;
    end; $$;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20260930090000_queue_admin_workflow_notifications.sql', import.meta.url), 'utf8'));
  const events = async () => (await db.query('select event_type,target_id,recipient_type,recipient_email from queued order by event_type')).rows;

  await db.query(`insert into interpreters values(1,$1,'i@example.test','Interpreter','pending',false,array['Seoul'],array['IT'])`, [interpreterId]);
  await db.query(`insert into businesses values($1,'c@example.test','Company','Manager')`, [companyId]);
  await db.query(`insert into requests values(1,$1,'Company','Event','Seoul','fallback@example.test','Manager','not_contacted')`, [companyId]);
  assert.equal((await events()).length, 0);

  await db.exec("update interpreters set name='Updated' where id=1");
  await db.exec("update interpreters set status='active',approved=true where id=1");
  await db.exec("update interpreters set status='active',approved=true where id=1");
  await db.exec("update requests set contact_status='contacted' where id=1");
  await db.exec("update requests set contact_status='contacted' where id=1");
  await db.exec('insert into request_interpreters values(1,1,1)');
  assert.deepEqual((await events()).map(({ event_type }) => event_type), [
    'company_matching_confirmed', 'company_request_under_review',
    'interpreter_approved', 'resume_verified',
  ]);
  assert.equal((await events()).filter(({ recipient_email }) => recipient_email === 'c@example.test').length, 2);

  await db.exec("update businesses set contact_email=null where auth_user_id='" + companyId + "'");
  await db.exec("update requests set contact_status='not_contacted' where id=1");
  await db.exec("update requests set contact_status='contacted' where id=1");
  assert.equal((await events()).filter(({ recipient_email }) => recipient_email === 'fallback@example.test').length, 1);
  console.log('PASS: workflow notifications are queued on transitions with server-resolved recipients');
} finally {
  await db.close();
}
