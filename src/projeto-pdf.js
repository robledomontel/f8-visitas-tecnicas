import {jsPDF} from 'jspdf';
import {quoteLogo} from './quote-logo.js';

export function projectFilename(name){return `Projeto-CFTV-F8-${String(name||'sem-titulo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,90)}.pdf`;}
export async function projectPlanImage(plan){
 if(!plan?.image||!plan.width||!plan.height)throw new Error('Adicione uma planta baixa.');
 const image=new Image();image.src=plan.image;await image.decode();
 const canvas=document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Não foi possível desenhar a planta.');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
 for(const c of plan.cameras||[]){const a=(c.direction-c.angle/2)*Math.PI/180,b=(c.direction+c.angle/2)*Math.PI/180;
 ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.arc(c.x,c.y,c.range,a,b);ctx.closePath();ctx.fillStyle=c.color;ctx.globalAlpha=.2;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=c.color;ctx.lineWidth=2;ctx.stroke();}
 for(const c of plan.cameras||[]){ctx.save();ctx.translate(c.x,c.y);ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=c.color;ctx.lineWidth=3;ctx.stroke();ctx.save();ctx.rotate(c.direction*Math.PI/180);ctx.fillStyle=c.color;ctx.fillRect(-10,-6,14,12);ctx.beginPath();ctx.moveTo(4,-4);ctx.lineTo(12,-9);ctx.lineTo(12,9);ctx.lineTo(4,4);ctx.closePath();ctx.fill();ctx.restore();ctx.font='18px Arial';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#fff';ctx.strokeText(c.name,0,34);ctx.fillStyle='#0f172a';ctx.fillText(c.name,0,34);ctx.restore();}
 return canvas.toDataURL('image/png');
}
export async function projectPdfFile(project){
 const plan=project.planta,rendered=await projectPlanImage(plan);
 const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'}),margin=12,width=273,bottom=194;
 const font=(bold=false,size=10)=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(30,45,60);};
 function header(title){pdf.addImage(quoteLogo,'PNG',margin,8,18,18);font(true,15);pdf.text(title,35,16);font(false,9);pdf.text('F8 Soluções em Tecnologia',35,23);pdf.setDrawColor(200,210,220);pdf.line(margin,29,285,29);}
 header('Projeto de CFTV');let y=36;
 function lines(text,bold=false){font(bold);for(const line of pdf.splitTextToSize(String(text),width)){if(y>bottom){pdf.addPage();header('Projeto de CFTV - detalhes');y=37;}pdf.text(line,margin,y);y+=5;}}
 lines(project.nome||'Projeto CFTV',true);if(project.cliente)lines('Cliente: '+project.cliente);y+=3;
 const available=bottom-y-10,scale=Math.min(width/plan.width,available/plan.height),w=plan.width*scale,h=plan.height*scale;
 pdf.addImage(rendered,'PNG',margin+(width-w)/2,y,w,h);y+=h+6;
 font(false,8);pdf.text('Visada ilustrativa: não considera paredes, obstáculos ou distância real. Sem escala.',margin,Math.min(y,bottom));
 pdf.addPage();header('Câmeras e observações');y=37;
 lines('Projeto: '+(project.nome||'Projeto CFTV'),true);
 lines('Quantidade de câmeras: '+(plan.cameras||[]).length);y+=3;
 for(const c of plan.cameras||[])lines(`${c.name} | Abertura: ${c.angle}° | Direção: ${c.direction}°`);
 if(project.observacoes){y+=5;lines('Observações',true);lines(project.observacoes);}
 const total=pdf.getNumberOfPages();for(let page=1;page<=total;page++){pdf.setPage(page);font(false,8);pdf.text(`Página ${page} de ${total}`,285,204,{align:'right'});}
 return new File([pdf.output('blob')],projectFilename(project.nome),{type:'application/pdf'});
}
export function downloadProjectFile(file){const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export async function shareProjectFile(file){
 if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Projeto CFTV - F8 Soluções em Tecnologia'});return 'Compartilhamento concluído.';}
 downloadProjectFile(file);return 'Este navegador não oferece compartilhamento de PDF. O arquivo foi baixado para anexar ao WhatsApp ou e-mail.';
}
