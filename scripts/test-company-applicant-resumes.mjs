import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const admin = '00000000-0000-0000-0000-000000000001';
const company = '00000000-0000-0000-0000-000000000002';
const other = '00000000-0000-0000-0000-000000000003';
const interpreter = '00000000-0000-0000-0000-000000000004';
const application = '00000000-0000-0000-0000-000000000050';
const unrelated = '00000000-0000-0000-0000-000000000060';
const migration = await readFile(new URL('../supabase/migrations/20261008230000_company_applicant_resume_access.sql', import.meta.url), 'utf8');
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function is_active_admin() returns boolean language sql stable as
      $$select coalesce(auth.uid()='${admin}'::uuid,false)$$;
    create table requests(id bigint primary key,job_id bigint,owner uuid,approved boolean);
    create function portal_owns_request(p_id bigint) returns boolean language sql stable security definer as
      $$select exists(select 1 from requests where id=p_id and owner=auth.uid() and approved)$$;
    create table interpreters(id bigint primary key,resume_file_url text,is_public boolean);
    create view public_interpreters as select id from interpreters where is_public;
    create table job_applications(id uuid primary key,job_id bigint,interpreter_id bigint);
    create table storage.buckets(id text primary key,public boolean);
    create table storage.objects(bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated;
    grant select on storage.objects to authenticated;
    create policy owner_read on storage.objects for select to authenticated using(
      is_active_admin() or name like auth.uid()::text || '/%');
    insert into storage.buckets values('resume-files',true);
    insert into interpreters values(1,'${interpreter}/resume.pdf',true),(2,'other/resume.pdf',true);
    insert into requests values(10,100,'${company}',true),(20,200,'${other}',true);
    insert into job_applications values('${application}',100,1),('${unrelated}',200,2);
    insert into storage.objects values('resume-files','${interpreter}/resume.pdf'),
      ('resume-files','${interpreter}/bankbook.pdf'),('resume-files','${interpreter}/license.pdf'),
      ('resume-files','other/resume.pdf');
  `);
  await db.exec(migration);
  await db.exec(migration);
  assert.equal((await db.query("select public from storage.buckets where id='resume-files'")).rows[0].public, false);
  const login = async (uid, role='authenticated') => {
    await db.exec('reset role');
    await db.query("select set_config('test.uid',$1,false)", [uid]);
    await db.exec(`set role ${role}`);
  };
  const resume = async (id=application) => (await db.query('select get_company_applicant_resume($1) as data', [id])).rows[0].data;
  const files = async () => (await db.query("select name from storage.objects where bucket_id='resume-files' order by name")).rows;
  await login(company);
  assert.deepEqual(await resume(), {bucket:'resume-files', file_path:`${interpreter}/resume.pdf`});
  assert.equal(await resume(unrelated), null);
  assert.deepEqual(await files(), [{name:`${interpreter}/resume.pdf`}]);
  await assert.rejects(db.exec("insert into storage.objects values('resume-files','forged.pdf')"));
  await login(other);
  assert.equal(await resume(), null);
  assert.deepEqual(await files(), [{name:'other/resume.pdf'}]);
  await login(interpreter);
  assert.equal((await files()).length, 3, 'interpreter retains own documents');
  await login(admin);
  assert.equal((await files()).length, 4, 'admin retains access');
  await login('', 'anon');
  await assert.rejects(resume());
  await assert.rejects(files());
  await login('');
  assert.equal(await resume(), null, 'missing session denied');
  await db.exec('reset role');
  // Even an old overbroad authenticated grant cannot expose unrelated documents.
  await db.exec('create policy legacy_broad_read on storage.objects for select to authenticated using(true)');
  await login(company);
  assert.deepEqual(await files(), [{name:`${interpreter}/resume.pdf`}]);
  await db.exec('reset role');
  await db.exec("update requests set approved=false where id=10");
  await login(company);
  assert.equal(await resume(), null);
  assert.equal((await files()).length, 0);
  await db.exec('reset role');
  await db.exec('update requests set approved=true where id=10; update interpreters set is_public=false where id=1');
  await login(company);
  assert.equal(await resume(), null);
  assert.equal((await files()).length, 0);
  await db.exec('reset role');
  await db.exec(`update interpreters set is_public=true,resume_file_url='${interpreter}/new.pdf' where id=1`);
  await login(company);
  assert.equal(await resume(), null, 'missing source object denied');
  await db.exec('reset role');
  await db.exec(`insert into storage.objects values('resume-files','${interpreter}/new.pdf')`);
  await login(company);
  assert.deepEqual(await resume(), {bucket:'resume-files',file_path:`${interpreter}/new.pdf`});
  assert.deepEqual(await files(), [{name:`${interpreter}/new.pdf`}], 'new resume available without reapproval; old path revoked');
  await db.exec('reset role');
  await db.exec(`delete from job_applications where id='${application}'`);
  await login(company);
  assert.equal(await resume(), null);
  assert.equal((await files()).length, 0, 'application removal revokes future access');
  console.log('PASS: no-review applicant resumes, private bucket, cross-company/anonymous/unapproved/private-profile denial, settlement isolation, owner/admin access, source replacement, application removal, idempotent migration');
} finally { await db.close(); }
