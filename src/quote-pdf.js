import { jsPDF } from 'jspdf';

const number = value => Math.max(0, Number(value) || 0);
const currency = value => number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';

export function quotePdf(quote) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = pdf.internal.pageSize.getWidth();
  const margin = 18;
  const usable = width - margin * 2;
  let y = 20;
  const page = () => { pdf.addPage(); y = 20; };
  const ensure = height => { if (y + height > 277) page(); };
  const line = (label, value) => {
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${label}:`, margin, y);
    pdf.setFont('helvetica', 'normal');
    const offset = pdf.getTextWidth(`${label}: `) + 2;
    const lines = pdf.splitTextToSize(String(value || '—'), usable - offset);
    ensure(lines.length * 5 + 2);
    pdf.text(lines, margin + offset, y);
    y += Math.max(1, lines.length) * 5 + 2;
  };
  pdf.setTextColor(20, 91, 145);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('F8 Soluções em Tecnologia', margin, y);
  y += 11;
  pdf.setFontSize(15);
  pdf.text(`Orçamento #${quote.numero || ''}`, margin, y);
  y += 10;
  pdf.setTextColor(30, 44, 58);
  pdf.setFontSize(10);
  line('Cliente', quote.cliente);
  line('Projeto', quote.projeto);
  line('Data', date(quote.data));
  line('Validade', date(quote.validade));
  if (quote.telefone) line('Telefone', quote.telefone);
  if (quote.email) line('E-mail', quote.email);
  y += 4;
  for (const item of quote.itens || []) {
    const description = pdf.splitTextToSize(String(item.descricao || ''), usable);
    ensure(description.length * 5 + 12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(description, margin, y);
    y += description.length * 5 + 1;
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${item.quantidade} × ${currency(item.valor)} = ${currency(number(item.quantidade) * number(item.valor))}`, margin, y);
    y += 10;
  }
  ensure(30);
  line('Desconto', currency(quote.desconto));
  line('Acréscimo', currency(quote.acrescimo));
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  const total = Math.max(0, (quote.itens || []).reduce((sum, item) => sum + number(item.quantidade) * number(item.valor), 0) - number(quote.desconto) + number(quote.acrescimo));
  pdf.text(`Total: ${currency(total)}`, margin, y);
  y += 10;
  pdf.setFontSize(10);
  ensure(15);
  line('Pagamento', quote.pagamento);
  if (quote.observacoes) {
    const lines = pdf.splitTextToSize(`Observações: ${quote.observacoes}`, usable);
    for (const text of lines) { ensure(6); pdf.text(text, margin, y); y += 5; }
  }
  ensure(12);
  pdf.text('F8 Soluções em Tecnologia · WhatsApp (98) 99223-8387', margin, y + 5);
  return pdf;
}
