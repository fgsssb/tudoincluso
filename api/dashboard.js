const {supabase}=require('./_supabase');
module.exports=async(req,res)=>{try{const sb=supabase();const [{count:abertos},{count:resolvidos},{count:equipamentos},{data:fechados}]=await Promise.all([
sb.from('ti_chamados').select('*',{count:'exact',head:true}).eq('deletado',false).neq('status','concluido'),
sb.from('ti_chamados').select('*',{count:'exact',head:true}).eq('deletado',false).eq('status','concluido'),
sb.from('ti_equipamentos').select('*',{count:'exact',head:true}).eq('deletado',false),
sb.from('ti_chamados').select('criado_em,fechado_em').eq('deletado',false).eq('status','concluido').not('fechado_em','is',null)
]);let media=0;if(fechados&&fechados.length){media=Math.round(fechados.reduce((a,r)=>a+(new Date(r.fechado_em)-new Date(r.criado_em))/60000,0)/fechados.length)}res.json({abertos:abertos||0,resolvidos:resolvidos||0,equipamentos:equipamentos||0,tempo_medio:media})}catch(e){res.status(500).json({error:e.message})}}
