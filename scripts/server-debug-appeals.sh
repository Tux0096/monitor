#!/usr/bin/env bash
set -a
source /opt/monitor/.env.local
set +a

echo "== subscriptions =="
curl -sS -H "Authorization: ${MAX_BOT_TOKEN}" https://platform-api.max.ru/subscriptions
echo

echo "== appeals =="
node -e "
const postgres=require('postgres');
const sql=postgres(process.env.MONITOR_DATABASE_URL,{max:1});
(async()=>{
  const rows=await sql\`SELECT appeal_number, left(issue_text,80) as issue, created_at FROM support_appeals ORDER BY created_at DESC LIMIT 5\`;
  console.log(rows);
  const dialogs=await sql\`SELECT conversation_key, state, draft FROM max_support_dialogs LIMIT 5\`;
  console.log('dialogs', dialogs);
  await sql.end();
})().catch(e=>{console.error(e);process.exit(1);});
"
