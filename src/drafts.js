let scope='';
export function draftScope(id){scope=id;}
export function bindDraft(form,name,custom={}){
 const key=`f8:rascunho:${scope}:${name}`,storage=globalThis.localStorage;
 let existing;try{existing=JSON.parse(storage?.getItem(key)||'null');}catch{}
 const notice=form.ownerDocument.createElement('p');notice.className='draftNotice';notice.setAttribute('role','status');form.before(notice);
 const collect=custom.collect||(()=>Object.fromEntries([...form.elements].filter(e=>e.name&&e.type!=='password'&&e.type!=='file').map(e=>[e.name,e.type==='checkbox'?e.checked:e.value])));
 const apply=custom.apply||(values=>{for(const e of form.elements){if(e.name in values&&e.type!=='password'&&e.type!=='file'){if(e.type==='checkbox')e.checked=Boolean(values[e.name]);else e.value=values[e.name];}}});
 if(existing){notice.textContent='Há um rascunho neste aparelho. ';for(const [label,fn] of [['Recuperar',()=>{apply(existing.values);form.dispatchEvent(new form.ownerDocument.defaultView.Event('input',{bubbles:true}));notice.textContent='Rascunho recuperado. Revise e salve.';}],['Descartar rascunho',()=>{storage?.removeItem(key);notice.textContent='Rascunho descartado.';}]]){const b=form.ownerDocument.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;notice.append(b);}}
 const save=()=>{try{storage?.setItem(key,JSON.stringify({em:new Date().toISOString(),values:collect()}));notice.textContent='Rascunho salvo neste aparelho. Anexos ainda precisam ser enviados.';}catch{notice.textContent='Não foi possível guardar o rascunho neste aparelho. Salve o formulário antes de sair.';}};
 form.addEventListener('input',save);form.addEventListener('change',save);
 return {clear(){try{storage?.removeItem(key);}catch{}notice.remove();},save};
}
