const fs=require('fs');
const http=require('http');
const assert=require('assert/strict');
const {execFileSync}=require('child_process');
const {chromium,access,launchOptions,artifacts}=require('./support.cjs');
const headers={Authorization:'Basic '+Buffer.from((access.admin_user||access.proxy_user)+':'+(access.admin_password||access.proxy_password)).toString('base64'),'Content-Type':'application/json'};
const endpoint='http://192.168.31.1:9091';
async function get(path){const r=await fetch(endpoint+path,{headers});assert(r.ok,'HTTP '+r.status);return r.json();}
async function job(body){const r=await fetch(endpoint+'/cgi-bin/manage',{method:'POST',headers,body:JSON.stringify({...body,csrf:access.controller_secret})});let d=await r.json();assert(r.ok,JSON.stringify(d));if(d.job){const id=d.job;for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,500));const response=await fetch(endpoint+'/cgi-bin/manage?job='+id,{headers});d=await response.json();if(!d.pending)return d;}throw Error('Job timed out');}return d;}
async function core(path){const r=await fetch('http://192.168.31.1:9090'+path,{headers:{Authorization:'Bearer '+access.controller_secret}});assert(r.ok);return r.json();}
(async()=>{
 const sshArgs=process.env.ROUTERPRO_CONTROL_PATH?['-S',process.env.ROUTERPRO_CONTROL_PATH]:[];
 const fixtureHost=process.env.ROUTERPRO_FIXTURE_HOST;assert(fixtureHost,'Set ROUTERPRO_FIXTURE_HOST to a computer IP reachable by the router');assert(/^[\w.-]+$/.test(fixtureHost),'Invalid fixture host');
 const base=JSON.parse(execFileSync('ssh',[...sshArgs,process.env.ROUTERPRO_SSH_HOST||'rd15','cat /data/rd15-proxy/base.json'],{encoding:'utf8'}));
 const first=base.proxies.find(p=>!p.name.startsWith('剩余')&&!p.name.startsWith('套餐'));
 const original=await core('/proxies');const main=Object.values(original.proxies).find(g=>g.all&&g.name.includes('节点选择'));
 const groupName='RouterPro-check-group',subName='RouterPro-check-sub';let invalid=false;
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(invalid?'invalid subscription':JSON.stringify({proxies:[{...first,name:'fixture-node'}]}));});
 await new Promise(resolve=>server.listen(18765,'0.0.0.0',resolve));
 try{
  const initial=await get('/cgi-bin/manage');assert(!initial.groups.some(g=>g.name===groupName));assert(!initial.subscriptions[subName]);
  for(const type of ['select','url-test','fallback','load-balance']){
   const result=await job({action:'save-group',dryRun:true,group:{name:groupName,type,proxies:[first.name,'DIRECT'],use:[],url:'https://www.gstatic.com/generate_204',interval:300}});assert(result.ok,JSON.stringify(result));
  }
  let result=await job({action:'save-group',group:{name:groupName,type:'select',proxies:[first.name,'DIRECT'],use:[],url:'https://www.gstatic.com/generate_204',interval:300}});assert(result.ok,JSON.stringify(result));
  assert((await get('/cgi-bin/manage')).groups.some(g=>g.name===groupName));
  result=await job({action:'save-group',original:groupName,dryRun:true,group:{name:groupName,type:'select',proxies:[groupName],use:[]}});assert(result.error);
  result=await job({action:'save-group',dryRun:true,group:{name:'RouterPro-cycle',type:'select',proxies:[groupName],use:[]}});assert(result.ok);
  result=await job({action:'save-subscription',name:subName,url:'http://'+fixtureHost+':18765/feed',interval:0});assert(result.ok,JSON.stringify(result));
  const providers=(await core('/providers/proxies')).providers;assert.equal(providers[subName].proxies.length,1);
  result=await job({action:'update-subscription',name:subName});assert(result.ok,JSON.stringify(result));
  invalid=true;result=await job({action:'update-subscription',name:subName});assert(result.error);assert.equal((await core('/providers/proxies')).providers[subName].proxies.length,1);invalid=false;
  result=await job({action:'pin-node',name:subName+' · fixture-node',pinned:true});assert(result.ok);await job({action:'pin-node',name:subName+' · fixture-node',pinned:false});
  const browser=await chromium.launch(launchOptions);
  try{for(const width of [1200,390]){
   const context=await browser.newContext({viewport:{width,height:844},httpCredentials:{username:access.admin_user||access.proxy_user,password:access.admin_password||access.proxy_password}}),page=await context.newPage(),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/cgi-bin/manage',async route=>{if(route.request().method()==='POST'){writes.push(route.request().postDataJSON().action);await route.fulfill({status:400,json:{error:'Unexpected preview mutation'}});}else await route.continue();});
   await page.goto(endpoint+'/#nodes');await page.locator('.node-tabs').waitFor();await page.getByRole('tab',{name:'策略组',exact:true}).click();await page.locator('.management-row').first().waitFor();await page.getByRole('button',{name:'新建策略组',exact:true}).click();await page.getByLabel('策略组名称',{exact:true}).fill('Preview');await page.getByLabel('选择策略',{exact:true}).selectOption('fallback');assert(await page.getByLabel('检测平台',{exact:true}).isVisible());await page.getByRole('button',{name:'全选节点',exact:true}).click();assert(await page.locator('.member-list input:checked').count()>1);await page.screenshot({path:artifacts+'/group-editor-'+width+'.png'});await page.getByRole('button',{name:'取消',exact:true}).last().click();
   await page.getByRole('tab',{name:'订阅',exact:true}).click();assert(await page.locator('.management-row').filter({hasText:subName}).count()===1);await page.screenshot({path:artifacts+'/subscriptions-'+width+'.png',fullPage:true});await page.getByRole('button',{name:'添加订阅',exact:true}).click();await page.getByLabel('订阅名称',{exact:true}).fill('Preview');await page.getByLabel('订阅地址',{exact:true}).fill('https://example.com/feed');await page.screenshot({path:artifacts+'/subscription-editor-'+width+'.png'});await page.getByRole('button',{name:'取消',exact:true}).last().click();
   await page.getByRole('tab',{name:'节点',exact:true}).click();await page.getByLabel('策略组',{exact:true}).selectOption(subName);assert(await page.locator('.node-identity').filter({hasText:'fixture-node'}).count()===1);await page.locator('.node-menu summary').click();assert(await page.getByRole('button',{name:'管理订阅',exact:true}).isVisible());assert(await page.getByRole('button',{name:'删除节点',exact:true}).count()===0);await page.locator('.node-menu summary').click();await page.getByLabel('策略组',{exact:true}).selectOption('__all');await page.getByRole('button',{name:'批量导入',exact:true}).click();await page.getByLabel('节点分享链接（每行一个）',{exact:true}).fill('bad');assert(await page.locator('.editor-error').last().innerText());await page.getByRole('button',{name:'取消',exact:true}).last().click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:artifacts+'/node-manager-'+width+'.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(writes,[],'Preview controls submitted configuration');await context.close();
  }}finally{await browser.close();}
  assert.equal((await core('/proxies')).proxies[main.name].now,main.now,'Selected node changed');
  console.log('Group validation, live CRUD, provider update/failure retention, pin and desktop/mobile UI passed');
 }finally{
  const settings=await get('/cgi-bin/manage');if(settings.subscriptions[subName]){const r=await job({action:'delete-subscription',name:subName});assert(r.ok,JSON.stringify(r));}
  if(settings.groups.some(g=>g.name===groupName)){const r=await job({action:'delete-group',name:groupName});assert(r.ok,JSON.stringify(r));}
  server.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
