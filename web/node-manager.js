'use strict';
const groupTypes={select:'手动选择','url-test':'自动优选',fallback:'故障切换','load-balance':'负载均衡',Selector:'手动选择',URLTest:'自动优选',Fallback:'故障切换',LoadBalance:'负载均衡'};
function groupType(type){return groupTypes[type]||type||'手动选择';}
function nodeSource(name){return Object.entries(S.providers||{}).find(([,p])=>p.vehicleType!=='Compatible'&&p.proxies?.some(n=>n.name===name))?.[0]||'';}
function renderNodes(root){
 S.nodeTab=S.nodeTab||localStorage.getItem('routerpro-node-tab')||'nodes';
 if(!['nodes','groups','subscriptions'].includes(S.nodeTab))S.nodeTab='nodes';
 const tabs=el('div','node-tabs');tabs.setAttribute('role','tablist');
 for(const [key,label]of [['nodes','节点'],['groups','策略组'],['subscriptions','订阅']]){
  const b=button(label,()=>{S.nodeTab=key;localStorage.setItem('routerpro-node-tab',key);render();});b.classList.toggle('active',S.nodeTab===key);b.setAttribute('role','tab');b.setAttribute('aria-selected',String(S.nodeTab===key));tabs.append(b);
 }root.append(tabs);
 if(S.nodeTab==='nodes')renderNodeList(root);else if(S.nodeTab==='groups')renderGroups(root);else renderSubscriptions(root);
}
function managerDialog(title){
 const dialog=el('dialog','manager-editor'),form=el('form'),message=el('div','editor-error'),actions=el('div','actions');message.setAttribute('role','alert');dialog.append(el('h2','',title),form,message,actions);
 const cancel=button('取消',()=>dialog.close());actions.append(cancel);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
 function field(label,element){const row=el('label','editor-field',label);element.setAttribute('aria-label',label);row.append(element);form.append(row);return element;}
 function save(label,body){const b=button(label,async()=>{if(!form.reportValidity())return;dialog.dataset.saving='true';const controls=[...dialog.querySelectorAll('input,select,textarea,button')];controls.forEach(c=>c.disabled=true);try{message.textContent='正在保存…';await manage(body(),stage=>message.textContent=stage);dialog.close();render();toast('已保存');}catch(e){message.textContent=e.message;}finally{controls.forEach(c=>c.disabled=false);delete dialog.dataset.saving;}},'primary');actions.append(b);form.addEventListener('submit',e=>{e.preventDefault();b.click();});return b;}
 dialog.addEventListener('cancel',e=>{if(dialog.dataset.saving)e.preventDefault();});return {dialog,form,message,field,save};
}
function textField(value='',required=true){const input=el('input');input.value=value;input.required=required;return input;}
function renderGroups(root){
 const toolbar=el('div','toolbar management-toolbar'),groups=S.settings.groups||[],count=el('span','',groups.length+' 个策略组');toolbar.append(count,button('新建策略组',()=>openGroupEditor(),'primary'));root.append(toolbar);
 const list=el('div','management-list');root.append(list);
 for(const g of groups){const live=S.proxies[g.name],row=el('div','management-row'),identity=el('div','management-identity');identity.append(el('div','name',g.name),el('div','sub',groupType(g.type)+' · '+(live?.all?.length||g.proxies?.length||0)+' 个成员'+(g.use?.length?' · '+g.use.length+' 个订阅源':'')));
  const status=el('div','management-status');status.append(el('span','muted','当前节点'),el('div','name',live?.now||'--'));
  const actions=el('div','actions');actions.append(tool('edit-node','编辑 '+g.name,()=>openGroupEditor(g)));
  const remove=tool('trash-2','删除 '+g.name,async()=>{if(await confirmAction('删除策略组？',g.name+'。被路由规则使用的策略组无法删除。')){await manage({action:'delete-group',name:g.name});render();toast('策略组已删除');}});remove.classList.add('danger');remove.disabled=g.name===mainGroup()?.name||!!S.settings.subscriptions?.[g.name];remove.title=remove.disabled?'主策略组或订阅策略组需保留':remove.title;actions.append(remove);row.append(identity,status,actions);list.append(row);
 }if(!groups.length)empty(list,'暂无策略组');
}
function openGroupEditor(existing){
 const d=managerDialog(existing?'编辑策略组':'新建策略组'),name=d.field('策略组名称',textField(existing?.name||''));name.maxLength=100;name.readOnly=!!existing;
 const type=d.field('选择策略',select(Object.entries(groupTypes).filter(([k])=>k===k.toLowerCase()),existing?.type||'select',()=>update(),'选择策略'));
 const url=d.field('检测平台',select(Object.entries(testTargets).map(([,t])=>[t.url,t.name]),existing?.url||testTargets.basic.url,()=>{},'检测平台'));
 const interval=d.field('检测间隔（秒）',textField(existing?.interval||300));interval.type='number';interval.min=60;interval.max=86400;
 const controls=el('div','member-controls'),selection=el('span','muted'),members=el('div','member-list'),search=filterInput('搜索成员',value=>{members.querySelectorAll('label').forEach(row=>row.hidden=!row.dataset.name.toLowerCase().includes(value.toLowerCase()));});controls.append(search,selection);d.form.append(el('h2','','成员与订阅源'),controls,members);
 const boxes=[];const candidates=[...Object.values(S.proxies).filter(p=>!p.all&&!nodeSource(p.name)&&!['GLOBAL','COMPATIBLE','PASS','REJECT-DROP'].includes(p.name)&&!meta(p.name)).map(p=>[p.name,'节点']),...(S.settings.groups||[]).filter(g=>g.name!==existing?.name&&g.name!==mainGroup()?.name).map(g=>[g.name,'策略组']),...Object.keys(S.settings.subscriptions||{}).map(n=>[n,'订阅源'])];
 for(const [value,kind]of candidates){const row=el('label','member-row'),check=el('input');check.type='checkbox';check.value=value;check.dataset.kind=kind;check.checked=(kind==='订阅源'?existing?.use:existing?.proxies)?.includes(value)||false;check.addEventListener('change',update);row.dataset.name=value;row.append(check,el('span','',value),el('small','',kind));members.append(row);boxes.push(check);}
 controls.append(button('全选节点',()=>{boxes.filter(b=>b.dataset.kind==='节点'&&!['DIRECT','REJECT'].includes(b.value)).forEach(b=>b.checked=true);update();}),button('清空',()=>{boxes.forEach(b=>b.checked=false);update();}));
 function update(){const auto=type.value!=='select';url.closest('label').hidden=!auto;interval.closest('label').hidden=!auto;selection.textContent='已选 '+boxes.filter(b=>b.checked).length+' 项';}update();
 d.save('保存策略组',()=>{const chosen=boxes.filter(b=>b.checked);if(!chosen.length)throw Error('至少选择一个成员或订阅源');return {action:'save-group',original:existing?.name,group:{name:name.value.trim(),type:type.value,proxies:chosen.filter(b=>b.dataset.kind!=='订阅源').map(b=>b.value),use:chosen.filter(b=>b.dataset.kind==='订阅源').map(b=>b.value),url:url.value,interval:Number(interval.value)}};});
}
function renderSubscriptions(root){
 const subscriptions=Object.values(S.settings.subscriptions||{}),toolbar=el('div','toolbar management-toolbar'),update=button('更新全部',async()=>{const failures=[];for(const sub of subscriptions){try{await manage({action:'update-subscription',name:sub.name});}catch(e){failures.push(sub.name+'：'+e.message);}}render();if(failures.length)throw Error(failures.join('；'));toast('全部订阅已更新');},'command');update.prepend(icon('refresh-cw'));update.disabled=!subscriptions.length;toolbar.append(el('span','',subscriptions.length+' 个订阅'),update,button('添加订阅',()=>openSubscriptionEditor(),'primary'));root.append(toolbar);
 const list=el('div','management-list');root.append(list);
 for(const sub of subscriptions){const provider=S.providers?.[sub.name],row=el('div','management-row'),identity=el('div','management-identity');identity.append(el('div','name',sub.name),el('div','sub',(provider?.proxies?.length||0)+' 个节点 · '+({0:'手动更新',3600:'每小时更新',21600:'每 6 小时更新',86400:'每天更新'}[sub.interval]||'手动更新')));
  const state=el('div','management-status'),date=provider?.updatedAt;state.append(el('span','muted','最近更新'),el('div','sub',date&&Date.parse(date)>0?new Date(date).toLocaleString('zh-CN'):'尚未更新'));
  const actions=el('div','actions');actions.append(tool('refresh-cw','更新 '+sub.name,async()=>{await manage({action:'update-subscription',name:sub.name});render();toast('订阅已更新');}),tool('edit-node','编辑 '+sub.name,()=>openSubscriptionEditor(sub)),tool('trash-2','删除订阅 '+sub.name,async()=>{if(await confirmAction('删除订阅？',sub.name+' 的节点及同名策略组会被移除。')){await manage({action:'delete-subscription',name:sub.name});render();toast('订阅已删除');}}));row.append(identity,state,actions);list.append(row);
 }if(!subscriptions.length)empty(list,'尚未添加订阅');
}
function openSubscriptionEditor(existing){
 const d=managerDialog(existing?'编辑订阅':'添加订阅'),name=d.field('订阅名称',textField(existing?.name||''));name.maxLength=60;name.readOnly=!!existing;
 const url=d.field('订阅地址',textField(existing?.url||''));url.type='url';url.placeholder='https://';url.autocomplete='off';url.spellcheck=false;
 const interval=d.field('自动更新',select([['0','仅手动更新'],['3600','每小时'],['21600','每 6 小时'],['86400','每天']],String(existing?.interval??86400),()=>{},'自动更新'));
 d.save('保存订阅',()=>({action:'save-subscription',name:name.value.trim(),url:url.value.trim(),interval:Number(interval.value),original:existing?.name}));
}
async function chooseNodeGroup(name){
 const groups=Object.values(S.proxies).filter(g=>g.type==='Selector'&&g.all?.includes(name));if(!groups.length)throw Error('请先在策略组中添加此节点');
 const d=managerDialog('选择节点'),group=d.field('目标策略组',select(groups.map(g=>[g.name,g.name]),groups.some(g=>g.name===mainGroup()?.name)?mainGroup().name:groups[0].name,()=>{},'目标策略组'));
 const b=button('使用节点',async()=>{await api('/proxies/'+encodeURIComponent(group.value),'PUT',{name});await readCore();d.dialog.close();render();toast('节点选择已保存');},'primary');d.dialog.querySelector('.actions').append(b);
}
function openBatchImport(){
 const d=managerDialog('批量导入节点'),input=el('textarea');input.rows=7;input.placeholder='vless://…\nvmess://…\ntrojan://…';input.spellcheck=false;d.field('节点分享链接（每行一个）',input);const preview=el('div','import-preview');d.form.append(preview);let entries=[];
 const save=d.save('导入节点',()=>({action:'import-nodes',entries}));save.disabled=true;
 input.addEventListener('input',()=>{preview.replaceChildren();entries=[];d.message.textContent='';const lines=input.value.trim().split(/\r?\n/).filter(line=>line.trim());try{if(!lines.length||lines.length>50)throw Error('每次可导入 1–50 个节点');const names=new Set(Object.keys(S.proxies));for(const [i,line]of lines.entries()){let entry;try{entry=parseNodeShare(line);}catch(e){throw Error('第 '+(i+1)+' 行：'+e.message);}if(names.has(entry.node.name))throw Error('节点名称重复：'+entry.node.name);names.add(entry.node.name);entries.push(entry);preview.append(el('div','sub',entry.node.name+' · '+entry.node.type.toUpperCase()));}save.disabled=false;}catch(e){save.disabled=true;d.message.textContent=e.message;}});
}
document.addEventListener('toggle',event=>{
 const menu=event.target;if(!menu.matches?.('.node-menu')||!menu.open)return;
 const items=menu.querySelector('.menu-items'),anchor=menu.querySelector('summary').getBoundingClientRect();
 items.style.position='fixed';items.style.right='auto';items.style.bottom='auto';
 items.style.left=Math.max(8,Math.min(innerWidth-items.offsetWidth-8,anchor.right-items.offsetWidth))+'px';
 items.style.top=(anchor.bottom+items.offsetHeight+8<=innerHeight?anchor.bottom+5:Math.max(8,anchor.top-items.offsetHeight-5))+'px';
},true);
