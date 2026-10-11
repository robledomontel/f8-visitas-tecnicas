import {jsPDF} from 'jspdf';
import {quoteLogo} from './quote-logo.js';

// Decode and resize one original at a time to keep photo reports usable on phones.
async function pdfPhoto(url) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Tempo esgotado ao carregar a foto.')), 30000);
      image.onload = resolve;
      image.onerror = () => reject(new Error('Não foi possível carregar a foto.'));
      image.src = url;
    });
    const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Não foi possível preparar a foto.');
      context.fillStyle = '#fff';context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return {data: canvas.toDataURL('image/jpeg', .82), width: canvas.width, height: canvas.height};
    } finally {canvas.width = 0;canvas.height = 0;}
  } finally {clearTimeout(timer);image.onload = null;image.onerror = null;image.src = '';}
}

export async function visitPdf(visit, photos = [], loadPhoto = pdfPhoto, progress = () => {}) {
  const pdf = new jsPDF({unit: 'mm', format: 'a4'});
  const left = 14, width = 182, bottom = 277;
  let y;
  function header() {
    pdf.addImage(quoteLogo, 'PNG', left, 10, 23, 23);
    pdf.setTextColor(20, 91, 145);pdf.setFont('helvetica', 'bold');pdf.setFontSize(14);
    pdf.text('F8 Soluções em Tecnologia', 42, 19);
    pdf.setFontSize(11);pdf.text(`Relatório de Visita Técnica #${visit.numero || ''}`, 42, 27);
    pdf.setDrawColor(20, 91, 145);pdf.line(left, 37, left + width, 37);y = 45;
  }
  function newPage() {pdf.addPage();header();}
  function ensure(height) {if(y + height > bottom)newPage();}
  function font(bold = false, size = 10) {pdf.setFont('helvetica', bold ? 'bold' : 'normal');pdf.setFontSize(size);pdf.setTextColor(29, 44, 58);}
  function detail(label, value) {
    font();const lines = pdf.splitTextToSize(String(value || '-'), width);
    ensure(16);font(true);pdf.text(label, left, y);y += 6;
    for(const line of lines) {ensure(5);font();pdf.text(line, left, y);y += 5;}
    y += 4;
  }
  header();
  detail('Cliente', visit.clientes?.nome);
  const date = visit.data_visita ? String(visit.data_visita).slice(0, 10).split('-').reverse().join('/') : '-';
  detail('Data / Tipo / Sistema / Status', `${date} · ${visit.tipo || '-'} · ${visit.sistema || '-'} · ${visit.status || '-'}`);
  for(const [label, key] of [['Solicitação do cliente','solicitacao'],['Situação encontrada','situacao_encontrada'],['Diagnóstico','diagnostico'],['Serviço executado','servico_executado'],['Testes realizados','testes_realizados'],['Recomendações','recomendacoes'],['Observações','observacoes']])detail(label, visit[key]);
  if(!photos.length)detail('Registro fotográfico', 'Sem fotos.');
  for(let i = 0; i < photos.length; i++) {
    progress(i + 1, photos.length);
    const photo = photos[i];
    let image;
    try {image = await loadPhoto(photo.url);} catch(error) {throw new Error(`Foto ${i + 1}: ${error.message}`);}
    newPage();font(true, 12);pdf.text(`Registro fotográfico — Foto ${i + 1} de ${photos.length}`, left, y);y += 9;
    const scale = Math.min(width / image.width, 165 / image.height);
    const w = image.width * scale, h = image.height * scale;
    pdf.addImage(image.data, 'JPEG', left + (width - w) / 2, y, w, h);y += h + 8;
    detail('Categoria', photo.categoria);
    if(photo.legenda)detail('Legenda', photo.legenda);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  const pages = pdf.getNumberOfPages();
  for(let p = 1; p <= pages; p++) {pdf.setPage(p);font(false, 8);pdf.text(`Página ${p} de ${pages}`, left + width, 289, {align: 'right'});}
  return pdf;
}

export async function visitPdfFile(visit, photos, progress) {
  const pdf = await visitPdf(visit, photos, undefined, progress);
  const number = String(visit.numero || 'sem-numero').replace(/[^a-zA-Z0-9_-]/g, '-');
  return new File([pdf.output('blob')], `Relatorio-Visita-F8-${number}.pdf`, {type: 'application/pdf'});
}
