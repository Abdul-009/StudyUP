-- RLS policy checks. Run AFTER prisma/migrations/add_rls_policies/migration.sql
-- has been applied, by pasting this whole file into the Supabase SQL editor.
--
-- Everything runs inside one statement batch that ENDS WITH A DELIBERATE ERROR,
-- so the synthetic fixtures (fake users, groups, messages) are rolled back and
-- nothing persists. The error text is the report: "RLS TEST RESULT: N of N
-- passed" followed by any failing checks.

insert into "User"(id,email,name) values
 ('a0000000-0000-0000-0000-000000000001','rls-admin@example.invalid','RLS Admin'),
 ('a0000000-0000-0000-0000-000000000002','rls-member@example.invalid','RLS Member'),
 ('a0000000-0000-0000-0000-000000000003','rls-outsider@example.invalid','RLS Outsider');
insert into "Group"(id,name,"createdBy","isPrivate","inviteCode") values
 ('b0000000-0000-0000-0000-000000000001','Pub','a0000000-0000-0000-0000-000000000001',false,null),
 ('b0000000-0000-0000-0000-000000000002','Priv','a0000000-0000-0000-0000-000000000001',true,'TESTCD');
insert into "GroupMember"("groupId","userId",role) values
 ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','ADMIN'),
 ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','MEMBER'),
 ('b0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','ADMIN');
insert into "Message"(id,"groupId","userId",content) values ('c0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','hello');
insert into "Poll"(id,"groupId","createdBy",question,type) values ('d0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Q?','CUSTOM');
insert into "PollOption"(id,"pollId",label) values ('d1000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','A'),('d1000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001','B');
insert into "DirectConversation"(id,"userAId","userBId") values ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002');
insert into "Notification"(id,"userId",type,"groupId","refId",content) values
 ('f0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','NEW_MESSAGE','b0000000-0000-0000-0000-000000000001',null,'n-member'),
 ('f0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','NEW_MESSAGE',null,'e0000000-0000-0000-0000-000000000001','n-dm-admin');
insert into "NotificationPreference"("userId",type,enabled) values ('a0000000-0000-0000-0000-000000000001','NEW_MESSAGE',false);

create temp table results(n serial, name text, expect text, got text, pass boolean);
create function pg_temp.as_user(uid uuid) returns void language plpgsql as $f$
begin
  if uid is null then
    execute 'set local role anon';
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', uid::text, true);
  end if;
end $f$;
create function pg_temp.cnt(uid uuid, q text) returns text language plpgsql as $f$
declare c bigint; res text;
begin
  perform pg_temp.as_user(uid);
  begin execute q into c; res := c::text; exception when others then res := 'ERR: ' || sqlerrm; end;
  execute 'reset role';
  return res;
end $f$;
create function pg_temp.dml(uid uuid, q text) returns text language plpgsql as $f$
declare n bigint; res text;
begin
  perform pg_temp.as_user(uid);
  begin execute q; get diagnostics n = row_count; res := 'rows=' || n; exception when others then res := 'ERR: ' || sqlerrm; end;
  execute 'reset role';
  return res;
end $f$;
create function pg_temp.chk(nm text, expect text, got text) returns void language plpgsql as $f$
begin insert into results(name, expect, got, pass) values (nm, expect, got, got ~ expect); end $f$;

do $t$
declare
  A uuid := 'a0000000-0000-0000-0000-000000000001';
  M uuid := 'a0000000-0000-0000-0000-000000000002';
  O uuid := 'a0000000-0000-0000-0000-000000000003';
  G1 text := 'b0000000-0000-0000-0000-000000000001';
  G2 text := 'b0000000-0000-0000-0000-000000000002';
begin
  perform pg_temp.chk('anon cannot read Messages', '^(0|ERR)', pg_temp.cnt(null, 'select count(*) from "Message"'));
  perform pg_temp.chk('anon cannot read Users', '^(0|ERR)', pg_temp.cnt(null, 'select count(*) from "User"'));
  perform pg_temp.chk('anon cannot call join rpc', '^ERR', pg_temp.cnt(null, $q$select count(*) from (select public.join_group_with_code('TESTCD')) s$q$));
  perform pg_temp.chk('anon cannot call signup trigger fn', '^ERR', pg_temp.cnt(null, 'select count(*) from (select public.handle_new_auth_user()) s'));
  perform pg_temp.chk('member reads group messages', '^1$', pg_temp.cnt(M, 'select count(*) from "Message"'));
  perform pg_temp.chk('outsider reads no messages', '^0$', pg_temp.cnt(O, 'select count(*) from "Message"'));
  perform pg_temp.chk('outsider sees only own User row', '^1$', pg_temp.cnt(O, 'select count(*) from "User" where email like ''rls-%'''));
  perform pg_temp.chk('member sees group-mates (self+admin)', '^2$', pg_temp.cnt(M, 'select count(*) from "User" where email like ''rls-%'''));
  perform pg_temp.chk('outsider cannot see private group', '^0$', pg_temp.cnt(O, 'select count(*) from "Group" where name = ''Priv'''));
  perform pg_temp.chk('outsider can see public group', '^1$', pg_temp.cnt(O, 'select count(*) from "Group" where name = ''Pub'''));
  perform pg_temp.chk('admin sees private group', '^1$', pg_temp.cnt(A, 'select count(*) from "Group" where name = ''Priv'''));
  perform pg_temp.chk('outsider sees no memberships of others', '^0$', pg_temp.cnt(O, 'select count(*) from "GroupMember" where "userId" <> ''' || O || ''''));
  perform pg_temp.chk('member sees fellow members', '^2$', pg_temp.cnt(M, 'select count(*) from "GroupMember" where "groupId" = ''' || G1 || ''''));
  perform pg_temp.chk('outsider cannot read polls', '^0$', pg_temp.cnt(O, 'select count(*) from "Poll"'));
  perform pg_temp.chk('member reads poll options', '^2$', pg_temp.cnt(M, 'select count(*) from "PollOption"'));
  perform pg_temp.chk('outsider cannot read options', '^0$', pg_temp.cnt(O, 'select count(*) from "PollOption"'));
  perform pg_temp.chk('outsider cannot read others notifications', '^0$', pg_temp.cnt(O, 'select count(*) from "Notification"'));
  perform pg_temp.chk('member reads own notification only', '^1$', pg_temp.cnt(M, 'select count(*) from "Notification" where "userId" = ''' || M || ''''));
  perform pg_temp.chk('outsider cannot read DM notifications of others conversations', '^0$', pg_temp.cnt(O, 'select count(*) from "Notification" where type = ''NEW_MESSAGE'' and "groupId" is null'));
  perform pg_temp.chk('member reads group-mate notif preference', '^1$', pg_temp.cnt(M, 'select count(*) from "NotificationPreference"'));
  perform pg_temp.chk('outsider cannot read notif preferences', '^0$', pg_temp.cnt(O, 'select count(*) from "NotificationPreference"'));
  perform pg_temp.chk('DM participant reads conversation (existing policy)', '^1$', pg_temp.cnt(M, 'select count(*) from "DirectConversation"'));
  perform pg_temp.chk('outsider cannot read conversation', '^0$', pg_temp.cnt(O, 'select count(*) from "DirectConversation"'));
  perform pg_temp.chk('outsider cannot edit others message', '^rows=0$', pg_temp.dml(O, 'update "Message" set content = ''pwned'''));
  perform pg_temp.chk('admin cannot edit members message', '^rows=0$', pg_temp.dml(A, 'update "Message" set content = ''pwned'''));
  perform pg_temp.chk('sender can edit own message', '^rows=1$', pg_temp.dml(M, 'update "Message" set content = ''edited'', "isEdited" = true'));
  perform pg_temp.chk('outsider cannot post in group', '^ERR', pg_temp.dml(O, 'insert into "Message"("groupId","userId",content) values (''' || G1 || ''',''' || O || ''',''x'')'));
  perform pg_temp.chk('member cannot post as someone else', '^ERR', pg_temp.dml(M, 'insert into "Message"("groupId","userId",content) values (''' || G1 || ''',''' || A || ''',''x'')'));
  perform pg_temp.chk('member can post', '^rows=1$', pg_temp.dml(M, 'insert into "Message"("groupId","userId",content) values (''' || G1 || ''',''' || M || ''',''hi'')'));
  perform pg_temp.chk('read receipt upsert', '^rows=1$', pg_temp.dml(A, 'insert into "MessageRead"("messageId","groupId","userId") values (''c0000000-0000-0000-0000-000000000001'',''' || G1 || ''',''' || A || ''') on conflict ("messageId","userId") do update set "readAt" = now()'));
  perform pg_temp.chk('outsider cannot add read receipt', '^ERR', pg_temp.dml(O, 'insert into "MessageRead"("messageId","groupId","userId") values (''c0000000-0000-0000-0000-000000000001'',''' || G1 || ''',''' || O || ''')'));
  perform pg_temp.chk('outsider cannot self-join private group directly', '^ERR', pg_temp.dml(O, 'insert into "GroupMember"("groupId","userId",role) values (''' || G2 || ''',''' || O || ''',''MEMBER'')'));
  perform pg_temp.chk('outsider cannot self-add as admin of public group', '^ERR', pg_temp.dml(O, 'insert into "GroupMember"("groupId","userId",role) values (''' || G1 || ''',''' || O || ''',''ADMIN'')'));
  perform pg_temp.chk('wrong invite code rejected', '^ERR.*No group matches', pg_temp.cnt(O, $q$select count(*) from (select public.join_group_with_code('NOPE99')) s$q$));
  perform pg_temp.chk('correct invite code joins private group', '^1$', pg_temp.cnt(O, $q$select count(*) from (select public.join_group_with_code(' testcd ')) s$q$));
  perform pg_temp.chk('...and now sees that private group', '^1$', pg_temp.cnt(O, 'select count(*) from "Group" where name = ''Priv'''));
  perform pg_temp.chk('outsider can join public group directly', '^rows=1$', pg_temp.dml(O, 'insert into "GroupMember"("groupId","userId",role) values (''' || G1 || ''',''' || O || ''',''MEMBER'')'));
  perform pg_temp.chk('member cannot promote self', '^ERR.*Only admins', pg_temp.dml(M, 'update "GroupMember" set role = ''ADMIN'' where "userId" = ''' || M || ''' and "groupId" = ''' || G1 || ''''));
  perform pg_temp.chk('member can update own lastSeenAt', '^rows=1$', pg_temp.dml(M, 'update "GroupMember" set "lastSeenAt" = now() where "userId" = ''' || M || ''' and "groupId" = ''' || G1 || ''''));
  perform pg_temp.chk('member cannot edit group', '^rows=0$', pg_temp.dml(M, 'update "Group" set name = ''hax'' where id = ''' || G1 || ''''));
  perform pg_temp.chk('admin can edit group', '^rows=1$', pg_temp.dml(A, 'update "Group" set name = ''Pub2'' where id = ''' || G1 || ''''));
  perform pg_temp.chk('admin can promote a member', '^rows=1$', pg_temp.dml(A, 'update "GroupMember" set role = ''ADMIN'' where "userId" = ''' || O || ''' and "groupId" = ''' || G1 || ''''));
  perform pg_temp.chk('member cannot remove another member', '^rows=0$', pg_temp.dml(M, 'delete from "GroupMember" where "userId" = ''' || A || ''' and "groupId" = ''' || G1 || ''''));
  perform pg_temp.chk('member cannot delete group', '^rows=0$', pg_temp.dml(M, 'delete from "Group" where id = ''' || G1 || ''''));
  perform pg_temp.chk('user creates group (insert + returning select)', '^rows=1$', pg_temp.dml(M, 'insert into "Group"(id,name,"createdBy") values (''b0000000-0000-0000-0000-0000000000aa'',''Mine'',''' || M || ''') returning id'));
  perform pg_temp.chk('creator seeds own empty group as admin', '^rows=1$', pg_temp.dml(M, 'insert into "GroupMember"("groupId","userId",role) values (''b0000000-0000-0000-0000-0000000000aa'',''' || M || ''',''ADMIN'')'));
  perform pg_temp.chk('cannot create group in someone elses name', '^ERR', pg_temp.dml(M, 'insert into "Group"(name,"createdBy") values (''Fake'',''' || A || ''')'));
  perform pg_temp.chk('cannot add self as admin to existing admin-run group', '^ERR', pg_temp.dml(M, 'insert into "GroupMember"("groupId","userId",role) values (''' || G2 || ''',''' || M || ''',''ADMIN'')'));
  perform pg_temp.chk('outsider cannot mark others notification read', '^rows=0$', pg_temp.dml(O, 'update "Notification" set "isRead" = true'));
  perform pg_temp.chk('user marks own notification read', '^rows=1$', pg_temp.dml(M, 'update "Notification" set "isRead" = true where id = ''f0000000-0000-0000-0000-000000000001'''));
  perform pg_temp.chk('member notifies group-mate', '^rows=1$', pg_temp.dml(M, 'insert into "Notification"("userId",type,"groupId","refId",content) values (''' || A || ''',''NEW_MESSAGE'',''' || G1 || ''',null,''hi'')'));
  perform pg_temp.chk('cannot notify non-member of group', '^ERR', pg_temp.dml(M, 'insert into "Notification"("userId",type,"groupId","refId",content) values (''' || O || ''',''NEW_MESSAGE'',''' || G2 || ''',null,''spam'')'));
  perform pg_temp.chk('outsider cannot spam arbitrary user', '^ERR', pg_temp.dml(O, 'insert into "Notification"("userId",type,"groupId",content) values (''' || A || ''',''ANNOUNCEMENT'',null,''spam'')'));
  perform pg_temp.chk('DM sender refreshes recipient DM notification', '^rows=1$', pg_temp.dml(M, 'update "Notification" set content = ''new text'' where id = ''f0000000-0000-0000-0000-000000000002'''));
  perform pg_temp.chk('DM sender creates recipient DM notification', '^rows=1$', pg_temp.dml(M, 'insert into "Notification"("userId",type,"groupId","refId",content) values (''' || A || ''',''NEW_MESSAGE'',null,''e0000000-0000-0000-0000-000000000001'',''dm'')'));
  perform pg_temp.chk('stranger cannot DM-notify via others conversation', '^ERR', pg_temp.dml(O, 'insert into "Notification"("userId",type,"groupId","refId",content) values (''' || A || ''',''NEW_MESSAGE'',null,''e0000000-0000-0000-0000-000000000001'',''dm'')'));
  perform pg_temp.chk('stranger cannot edit DM notification', '^rows=0$', pg_temp.dml(O, 'update "Notification" set content = ''x'' where id = ''f0000000-0000-0000-0000-000000000002'''));
  perform pg_temp.chk('user clears own notifications', '^rows=[0-9]+$', pg_temp.dml(M, 'delete from "Notification" where "userId" = ''' || M || ''''));
  perform pg_temp.chk('user cannot delete others notifications', '^rows=0$', pg_temp.dml(M, 'delete from "Notification" where "userId" = ''' || A || ''''));
  perform pg_temp.chk('member cannot post announcement', '^ERR', pg_temp.dml(M, 'insert into "Announcement"("groupId","postedBy",content) values (''' || G1 || ''',''' || M || ''',''x'')'));
  perform pg_temp.chk('admin posts announcement', '^rows=1$', pg_temp.dml(A, 'insert into "Announcement"("groupId","postedBy",content) values (''' || G1 || ''',''' || A || ''',''x'')'));
  perform pg_temp.chk('member reads announcements', '^1$', pg_temp.cnt(M, 'select count(*) from "Announcement"'));
  perform pg_temp.chk('member creates assignment', '^rows=1$', pg_temp.dml(M, 'insert into "Assignment"(id,"groupId","createdBy",title,"dueDate") values (''aa000000-0000-0000-0000-000000000001'',''' || G1 || ''',''' || M || ''',''HW'',now())'));
  perform pg_temp.chk('non-member cannot create assignment in private group', '^ERR', pg_temp.dml(M, 'insert into "Assignment"("groupId","createdBy",title,"dueDate") values (''' || G2 || ''',''' || M || ''',''HW'',now())'));
  perform pg_temp.chk('completion upsert', '^rows=1$', pg_temp.dml(M, 'insert into "AssignmentCompletion"("assignmentId","userId","groupId") values (''aa000000-0000-0000-0000-000000000001'',''' || M || ''',''' || G1 || ''') on conflict ("assignmentId","userId") do update set "completedAt" = now()'));
  perform pg_temp.chk('member creates poll', '^rows=1$', pg_temp.dml(M, 'insert into "Poll"(id,"groupId","createdBy",question,type) values (''d0000000-0000-0000-0000-0000000000bb'',''' || G1 || ''',''' || M || ''',''Q2'',''CUSTOM'')'));
  perform pg_temp.chk('creator adds poll options', '^rows=1$', pg_temp.dml(M, 'insert into "PollOption"("pollId",label) values (''d0000000-0000-0000-0000-0000000000bb'',''opt'')'));
  perform pg_temp.chk('member votes', '^rows=1$', pg_temp.dml(M, 'insert into "PollVote"("pollOptionId","userId") values (''d1000000-0000-0000-0000-000000000001'',''' || M || ''')'));
  perform pg_temp.chk('member sees votes', '^1$', pg_temp.cnt(M, 'select count(*) from "PollVote"'));
  perform pg_temp.chk('member removes own vote', '^rows=1$', pg_temp.dml(M, 'delete from "PollVote" where "userId" = ''' || M || ''''));
  perform pg_temp.chk('member uploads file record', '^rows=1$', pg_temp.dml(M, 'insert into "SharedFile"("groupId","uploadedBy","fileName","fileUrl","fileType","fileSize") values (''' || G1 || ''',''' || M || ''',''a.pdf'',''u'',''pdf'',1)'));
  perform pg_temp.chk('non-member cannot add file to private group', '^ERR', pg_temp.dml(M, 'insert into "SharedFile"("groupId","uploadedBy","fileName","fileUrl","fileType","fileSize") values (''' || G2 || ''',''' || M || ''',''a.pdf'',''u'',''pdf'',1)'));
  perform pg_temp.chk('user edits own profile', '^rows=1$', pg_temp.dml(M, 'update "User" set name = ''New Name'' where id = ''' || M || ''''));
  perform pg_temp.chk('user cannot edit others profile', '^rows=0$', pg_temp.dml(M, 'update "User" set name = ''X'' where id = ''' || A || ''''));
  perform pg_temp.chk('user upserts own preferences', '^rows=1$', pg_temp.dml(M, 'insert into "NotificationPreference"("userId",type,enabled) values (''' || M || ''',''POLL_UPDATE'',false) on conflict ("userId",type) do update set enabled = false'));
  perform pg_temp.chk('user cannot set others preferences', '^ERR', pg_temp.dml(M, 'insert into "NotificationPreference"("userId",type,enabled) values (''' || A || ''',''POLL_UPDATE'',false)'));
  perform pg_temp.chk('group-mates can start a DM (existing policy)', '^rows=1$', pg_temp.dml(O, 'insert into "DirectConversation"("userAId","userBId") values (''' || O || ''',''' || A || ''')'));
  perform pg_temp.chk('non-group-mates cannot start a DM', '^ERR', pg_temp.dml(O, 'insert into "DirectConversation"("userAId","userBId") values (''a0000000-0000-0000-0000-000000000003'',''a0000000-0000-0000-0000-0000000000ff'')'));
  perform pg_temp.chk('sole member can delete own group', '^rows=1$', pg_temp.dml(M, 'delete from "Group" where id = ''b0000000-0000-0000-0000-0000000000aa'''));
end $t$;

do $t$
declare fails text; total int; passed int;
begin
  select count(*), count(*) filter (where pass) into total, passed from results;
  select string_agg(format('%s [expect %s, got %s]', name, expect, got), E'\n') into fails from results where not pass;
  raise exception E'RLS TEST RESULT: % of % passed\n%', passed, total, coalesce(fails, 'no failures');
end $t$;
