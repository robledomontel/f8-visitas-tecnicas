import {cents,effectiveDate} from './financeiro-model.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function expensePie(rows,month){
 const expenses=rows.filter(r=>r.tipo==='saida'&&r.status==='liquidado'&&effectiveDate(r)?.startsWith(month)&&cents(r.valor)>0).sort((a,b)=>cents(b.valor)-cents(a.valor)||String(a.id).localeCompare(String(b.id)));
 const total=expenses.reduce((sum,r)=>sum+cents(r.valor),0);
 if(!total)return '<section class="financeChart financeExpenseChart"><h2>Gastos pagos — mês selecionado</h2><p class="notice">Nenhum gasto pago neste mês.</p></section>';
 let end=0;
 const slices=expenses.map((r,i)=>{const start=end;end+=cents(r.valor)/total*100;return {row:r,color:`hsl(${(i*137.508+215)%360} 65% 42%)`,start,end:i===expenses.length-1?100:end,percent:cents(r.valor)/total*100}});
 return `<section class="financeChart financeExpenseChart"><h2>Gastos pagos — mês selecionado</h2><p class="muted">Total: ${money(total/100)}</p><div class="financePieLayout"><div class="financePie" role="img" aria-label="Distribuição dos gastos pagos. Valores e percentuais na legenda ao lado." style="background:conic-gradient(${slices.map(s=>`${s.color} ${s.start}% ${s.end}%`).join(',')})"></div><ul class="financePieLegend">${slices.map(s=>`<li><span class="financePieSwatch" style="background:${s.color}" aria-hidden="true"></span><div><b>${esc(s.row.descricao||'Sem descrição')}</b><span class="muted">${esc([s.row.categoria,s.row.subcategoria,s.row.pessoa].filter(Boolean).join(' · '))}</span><span>${money(cents(s.row.valor)/100)} · ${s.percent.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</span></div></li>`).join('')}</ul></div></section>`;
}
