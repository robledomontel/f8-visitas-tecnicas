import { jsPDF } from 'jspdf';
import { quoteLogo } from './quote-logo.js';

const number = value => Math.max(0, Number(value) || 0);
const currency = value => number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '-';

export function quotePdf(quote) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const left=12, width=186, bottom=277;
  let y=12;
  const font=(bold=false,size=10)=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(38,43,48)};
  const box=(x,top,w,h)=>{pdf.setDrawColor(211,218,224);pdf.setLineWidth(.2);pdf.rect(x,top,w,h)};
  const text=(value,x,top,bold=false,align='left',size=10)=>{font(bold,size);pdf.text(String(value??''),x,top,{align})};
  function header(){
    box(left,12,width,31);box(left,12,30,31);
    pdf.addImage(quoteLogo,'PNG',left+2,14.5,26,26);
    text('F8 Soluções em Tecnologia',47,18,true);
    text('CNPJ 43.377.342/0001-38',47,24,false,'left',9);
    text('R. Paulino de Sousa, 199 - Sala 7',47,29,false,'left',9);
    text('Monte Castelo · CEP 65035-480',47,34,false,'left',9);
    text('São Luís - MA',47,39,false,'left',9);
    text('(98) 99223-8387',194,25,false,'right',9);
    text('f8solucoestecnologia@gmail.com',194,31,false,'right',8.5);
    box(left,47,width,9);box(left,47,105,9);
    text(`Orçamento: ${quote.numero||''}`,64.5,53,true,'center');
    text(`Data: ${date(quote.data)}`,157.5,53,true,'center');
    y=61;
  }
  function newPage(){pdf.addPage();header()}
  const ensure=h=>{if(y+h>bottom)newPage()};
  function section(title){ensure(9);box(left,y,width,9);text(title,105,y+6,true,'center');y+=9}
  function detail(label,value){
    if(!value)return;
    font();const lines=pdf.splitTextToSize(String(value),151);
    // Split long fields across pages without overflowing a cell.
    for(let i=0;i<lines.length;i+=40){
      const part=lines.slice(i,i+40),h=Math.max(9,part.length*4.5+4);
      ensure(h);box(left,y,27,h);box(left+27,y,width-27,h);
      text(label,left+3,y+6,true,'left',9);font();pdf.text(part,left+30,y+6);y+=h;
    }
  }
  header();section('Dados do cliente');
  detail('Nome',quote.cliente||'-');detail('CPF / CNPJ',quote.documento);
  detail('Endereço',quote.endereco||quote.endereco_completo);
  detail('Telefone',quote.telefone);detail('E-mail',quote.email);detail('Projeto',quote.projeto);
  y+=5;
  const cols=[8,82,18,37,41],xs=[left,left+8,left+90,left+108,left+145];
  function tableHeader(){
    section('Itens');
    cols.forEach((w,i)=>box(xs[i],y,w,9));
    text('#',left+4,y+6,true,'center');text('Nome / descrição',left+10,y+6,true);
    text('Qtd.',left+106,y+6,true,'right');text('Valor',left+143,y+6,true,'right');text('Subtotal',left+184,y+6,true,'right');y+=9;
  }
  tableHeader();
  (quote.itens||[]).forEach((item,index)=>{
    font();const lines=pdf.splitTextToSize(String(item.descricao||'-'),77);
    let offset=0;
    while(offset<lines.length){
      if(y+9>bottom){newPage();tableHeader()}
      const count=Math.max(1,Math.floor((bottom-y-4)/4.5));
      const part=lines.slice(offset,offset+count),h=Math.max(9,part.length*4.5+4);
      cols.forEach((w,i)=>box(xs[i],y,w,h));
      font();pdf.text(part,left+10,y+6);
      if(offset===0){
        text(index+1,left+4,y+6,false,'center',9);
        text(number(item.quantidade).toLocaleString('pt-BR'),left+106,y+6,false,'right',9);
        text(currency(item.valor),left+143,y+6,false,'right',9);
        text(currency(number(item.quantidade)*number(item.valor)),left+184,y+6,false,'right',9);
      }
      y+=h;offset+=part.length;
      if(offset<lines.length){newPage();tableHeader()}
    }
  });
  y+=5;
  const subtotal=(quote.itens||[]).reduce((sum,item)=>sum+number(item.quantidade)*number(item.valor),0);
  if(number(quote.desconto)||number(quote.acrescimo)){
    detail('Subtotal',currency(subtotal));
    if(number(quote.desconto))detail('Desconto',currency(quote.desconto));
    if(number(quote.acrescimo))detail('Acréscimo',currency(quote.acrescimo));
  }
  ensure(11);box(left,y,width,10);text(`Total: ${currency(Math.max(0,subtotal-number(quote.desconto)+number(quote.acrescimo)))}`,194,y+7,true,'right',12);y+=15;
  if(quote.pagamento||quote.validade||quote.observacoes){
    section('Condições do orçamento');detail('Pagamento',quote.pagamento);
    detail('Validade',quote.validade?date(quote.validade):'');detail('Observações',quote.observacoes);y+=7;
  }
  ensure(29);y+=17;pdf.setDrawColor(170,177,184);pdf.line(left+1,y,left+91,y);pdf.line(left+95,y,left+185,y);
  text('F8 Soluções em Tecnologia',left+46,y+6,false,'center',9);
  font(false,9);const clientLines=pdf.splitTextToSize(quote.cliente||'Cliente',86);
  pdf.text(clientLines.slice(0,2),left+140,y+6,{align:'center'});
  const pages=pdf.getNumberOfPages();
  for(let p=1;p<=pages;p++){pdf.setPage(p);text(`Página ${p} de ${pages}`,198,289,false,'right',8)}
  return pdf;
}
