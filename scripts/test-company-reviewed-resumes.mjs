import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const admin = '00000000-0000-0000-0000-000000000001';
const company = '00000000-0000-0000-0000-000000000002';
const other = '00000000-0000-0000-0000-000000000003';
const ownApplication = '00000000-0000-0000-0000-000000000050';
const otherApplication = '00000000-0000-0000-0000-000000000060';
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function is_active_admin() returns boolean language sql stable as
      $$select coalesce(auth.uid()='${admin}'::uuid,false)$$;
    create table requests(id bigint primary key, job_id bigint, owner uuid, approved boolean);
    create function portal_owns_request(p_id bigint) returns boolean language sql stable security definer as
      $$select exists(select 1 from requests where id=p_id and owner=auth.uid() and approved)$$;
    create table interpreters(id bigint primary key, resume_file_url text, resume_uploaded_at timestamptz, is_public boolean);
    create view public_interpreters as select id from interpreters where is_public;
    create table job_applications(id uuid primary key, job_id bigint, interpreter_id bigint);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;
    insert into interpreters values(1,'private/original.pdf','2026-10-05',true),(2,'private/other.pdf',null,true);
    insert into requests values(10,100,'${company}',true),(20,200,'${other}',true);
    insert into job_applications values('${ownApplication}',100,1),('${otherApplication}',200,2);
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261005160000_company_reviewed_resumes.sql',import.meta.url),'utf8'));
  const login = async (uid,role='authenticated') => {
    await db.exec('reset role');
    await db.query("select set_config('test.uid',$1,false)",[uid]);
    await db.exec(`set role ${role}`);
  };
  const resume = async (id) => (await db.query('select get_company_applicant_resume($1) as data',[
    id === 50 ? ownApplication : otherApplication,
  ])).rows[0].data;
  await login(admin);
  await db.exec(`insert into storage.objects values('company-resumes','1/aaaaaaaa-bbbb.pdf'),('company-resumes','2/aaaaaaaa-bbbb.pdf');
    insert into company_reviewed_resumes(interpreter_id,file_path,source_resume_file_url,source_resume_uploaded_at)
    values(1,'1/aaaaaaaa-bbbb.pdf','private/original.pdf','2026-10-05'),(2,'2/aaaaaaaa-bbbb.pdf','private/other.pdf',null);`);
  await login(company);
  assert.deepEqual(await resume(50),{file_path:'1/aaaaaaaa-bbbb.pdf'});
  assert.equal(await resume(60),null,'other company application must be denied');
  assert.equal((await db.query('select * from company_reviewed_resumes')).rows.length,0);
  assert.equal((await db.query('select * from storage.objects')).rows.length,1);
  await assert.rejects(db.exec("insert into storage.objects values('company-resumes','1/forged.pdf')"));
  await login(other);
  assert.equal(await resume(50),null);
  await login('','anon');
  await assert.rejects(resume(50));
  await login(admin);
  await db.exec('reset role');
  await db.exec("update interpreters set resume_uploaded_at='2026-10-06' where id=1");
  await login(company);
  assert.equal(await resume(50),null,'source replacement invalidates reviewed copy');
  assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  await login(admin);
  await db.exec('reset role');
  await db.exec("update interpreters set resume_uploaded_at='2026-10-05',is_public=false where id=1");
  await login(company);
  assert.equal(await resume(50),null,'private profile denied');
  await login(admin);
  await db.exec('reset role');
  await db.exec('update interpreters set is_public=true where id=1; update requests set approved=false where id=10');
  await login(company);
  assert.equal(await resume(50),null,'unapproved company denied');
  console.log('PASS: applicant-based access, cross-company denial, private storage, admin-only writes, source invalidation, anonymous/private/unapproved denial');
} finally { await db.close(); }
