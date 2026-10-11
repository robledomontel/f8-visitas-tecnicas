export function visitDashboardCards(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  return [
    {id:'hoje',label:'Visitas hoje',table:'visitas',column:'data_visita',value:today},
    {id:'andamento',label:'Em andamento',table:'visitas',column:'status',value:'em_andamento'},
    {id:'concluidas',label:'Concluídas',table:'visitas',column:'status',value:'concluida'},
    {id:'pendencias',label:'Pendências',table:'pendencias',column:'status',value:'aberta'},
    {id:'material',label:'Aguardando material',table:'visitas',column:'status',value:'aguardando_material'},
    {id:'orcamento',label:'Necessitam orçamento',table:'visitas',column:'necessita_orcamento',value:true},
  ];
}

export function applyVisitDashboardFilter(query, filter) {
  return filter ? query.eq(filter.column, filter.value) : query;
}
