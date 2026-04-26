const { createClient } = require('@supabase/supabase-js');
function supabase(){
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Vercel');
  return createClient(url,key,{auth:{persistSession:false}});
}
module.exports={supabase};
