const {supabase}=require('./_supabase');
module.exports=async(req,res)=>{try{const sb=supabase();const uid=req.headers['x-user-id'];
if(req.method==='GET'){const {data,error}=await sb.from('ti_equipamentos').select('*,perifericos:ti_perifericos(*)').eq('deletado',false).order('criado_em',{ascending:false});if(error)throw error;return res.json({data})}
if(req.method==='POST'){const b=req.body||{};const {data:eq,error}=await sb.from('ti_equipamentos').insert({etiqueta:b.etiqueta,modelo:b.modelo,setor:b.setor,usuario_local:b.usuario_local,observacoes:b.observacoes,tipo:'pc',status:'ativo',criado_por:uid}).select().single();if(error)throw error;const ps=['mouse','teclado','monitor'].filter(k=>b[k]).map(k=>({equipamento_id:eq.id,tipo:k,etiqueta:b[k],criado_por:uid}));if(ps.length)await sb.from('ti_perifericos').insert(ps);return res.json({data:eq})}
if(req.method==='DELETE'){const {id}=req.body||{};const {error}=await sb.from('ti_equipamentos').update({deletado:true,deletado_por:uid,deletado_em:new Date().toISOString()}).eq('id',id);if(error)throw error;return res.json({ok:true})}
res.status(405).json({error:'Método inválido'})}catch(e){res.status(500).json({error:e.message})}}
