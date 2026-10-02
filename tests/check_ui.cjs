const fs=require('fs');
const assert=require('assert/strict');
const {chromium,access,launchOptions,artifacts}=require('./support.cjs');
(async()=>{
 const browser=await chromium.launch(launchOptions);
 try{
  for(const width of [1200,390]){
   const context=await browser.newContext({viewport:{width,height:844},httpCredentials:{username:access.admin_user||access.proxy_user,password:access.admin_password||access.proxy_password}});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
   await page.addInitScript(()=>{window.WebSocket=class{constructor(){let i=0;this.timer=setInterval(()=>{i++;this.onmessage?.({data:JSON.stringify({down:420000+300000*Math.sin(i/5)+160000*Math.sin(i/2),up:160000+100000*Math.sin(i/7)})});},40);}close(){clearInterval(this.timer);this.onclose?.();}};});
   let mockProxies, mockDevices, phoneMac, testNodeName, chooseName;const mutations=[],jobs=new Map();const settings={modes:{},nodes:{},pins:{},defaultMode:'rule'};
   await page.route('**/cgi-bin/manage**',async route=>{
    const request=route.request(),job=new URL(request.url()).searchParams.get('job');if(request.method()==='GET'){if(job){const count=jobs.get(job)||0;jobs.set(job,count+1);await route.fulfill({status:count<1?202:200,json:count<1?{pending:true,stage:'validating'}:{ok:true}});}else await route.fulfill({json:settings});return;}
    const body=request.postDataJSON();mutations.push(body);
    if(body.action==='credentials'){await route.fulfill({status:400,json:{error:'Current password is incorrect'}});return;}
    if(body.action==='boot')settings.bootEnabled=body.enabled;
    if(body.action==='pin-node'){if(body.pinned)settings.pins[body.name]=true;else delete settings.pins[body.name];}
    if(body.action==='device'){const d=mockDevices.devices.find(d=>d.mac===body.mac);assert(!d.protected);d.enabled=body.mode!=='direct';settings.modes[body.mac]=body.mode;}
    if(body.action==='default')settings.defaultMode=body.mode;
    if(body.action==='save-node'){if(body.original){delete mockProxies.proxies[body.original];delete settings.nodes[body.original];}mockProxies.proxies[body.node.name]={name:body.node.name,type:'VLESS'};settings.nodes[body.node.name]={uri:body.uri,name:body.node.name};const g=Object.values(mockProxies.proxies).find(p=>p.name.includes('节点选择'));if(body.original)g.all=g.all.map(n=>n===body.original?body.node.name:n);else g.all.push(body.node.name);}
    if(body.action==='delete-node'){delete mockProxies.proxies[body.name];delete settings.nodes[body.name];for(const g of Object.values(mockProxies.proxies).filter(p=>p.all))g.all=g.all.filter(n=>n!==body.name);}
    if(['save-node','delete-node','device','default'].includes(body.action)){const job='mock-job-'+jobs.size;jobs.set(job,0);await route.fulfill({status:202,json:{job}});}else await route.fulfill({json:{ok:true}});
   });
   await page.route('**/cgi-bin/devices',async route=>{
    if(route.request().method()==='POST'){const data=route.request().postDataJSON();mutations.push(data);const d=mockDevices.devices.find(d=>d.mac===data.mac);assert(!d.protected);d.enabled=data.enabled;await route.fulfill({json:mockDevices});}
    else if(mockDevices)await route.fulfill({json:mockDevices});else{const r=await route.fetch();mockDevices=await r.json();mockDevices.devices.forEach((d,i)=>d.name=d.protected?'Protected computer':'Device '+(i+1));const phone=mockDevices.devices.find(d=>!d.protected);assert(phone,'A non-protected test device is required');phoneMac=phone.mac;phone.enabled=true;settings.modes[phoneMac]='rule';await route.fulfill({response:r,json:mockDevices});}
   });
   await page.route('http://192.168.31.1:9090/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(req.method()==='OPTIONS'){await route.continue();return;}
    const cors={'Access-Control-Allow-Origin':'*'};
    if(req.method()!=='GET'){mutations.push({path:url.pathname,method:req.method(),body:req.postData()});if(url.pathname.startsWith('/proxies/')){const group=decodeURIComponent(url.pathname.slice(9));mockProxies.proxies[group].now=req.postDataJSON().name;}await route.fulfill({status:204,headers:cors});return;}
    if(url.pathname.endsWith('/delay')){const target=url.searchParams.get('url');await route.fulfill({json:{delay:target.includes('youtube')?550:target.includes('x.com')?1200:100},headers:cors});return;}
    if(url.pathname==='/proxies'&&mockProxies){await route.fulfill({json:mockProxies,headers:cors});return;}
    const r=await route.fetch();if(url.pathname==='/proxies'){mockProxies=await r.json();const main=Object.values(mockProxies.proxies).find(p=>p.all&&p.name.includes('节点选择'));chooseName=main.all.find(n=>n!==main.now&&mockProxies.proxies[n]&&!mockProxies.proxies[n].all&&!['DIRECT','REJECT','REJECT-DROP'].includes(n)&&!/^(剩余流量|套餐到期)/.test(n));testNodeName=chooseName;assert(chooseName,'A selectable test node is required');}await route.fulfill({response:r,headers:{...r.headers(),...cors}});
   });
   await page.goto('http://192.168.31.1:9091/');await page.locator('.metric').first().waitFor();assert.match(await page.title(),/RouterPro/);assert(!(await page.locator('#content').innerText()).includes('套餐到期'));
   await page.waitForTimeout(2800);assert(await page.locator('#traffic').evaluate(canvas=>{const c=canvas.getContext('2d'),d=c.getImageData(0,0,canvas.width,canvas.height).data;let colored=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>0&&Math.abs(d[i]-d[i+1])>20)colored++;return colored>100;}));await page.screenshot({path:artifacts+'/overview-'+width+'.png',fullPage:true});
   for(const view of ['devices','nodes','rules','connections','settings']){
    await page.locator('nav button[data-view="'+view+'"]').click();
    if(view==='devices'){
     await page.locator('.devices .row:not(.head)').first().waitFor();
     const pc=page.locator('.devices .row').filter({hasText:'Protected computer'});assert(await pc.locator('button').isDisabled());assert.match(await pc.innerText(),/直连/);
     assert(await pc.locator('select').isDisabled());
     const phone=page.locator('.devices .row').filter({hasText:phoneMac});await phone.getByRole('button',{name:'关闭代理',exact:true}).click();await phone.getByRole('button',{name:'开启代理',exact:true}).waitFor();assert.match(await phone.innerText(),/直连/);await phone.locator('select').selectOption('global');await phone.locator('.badge').filter({hasText:'全局代理'}).waitFor();await phone.locator('select').selectOption('rule');await phone.locator('.badge').filter({hasText:'规则分流'}).waitFor();
    }
    if(view==='nodes'){
     await page.locator('.nodes .selected').waitFor();const selected=await page.locator('.nodes .selected .name').innerText();assert(selected.length>0);
     const row=page.locator('.nodes .row:not(.head):not(.selected)').filter({hasText:chooseName}).first();await row.locator('.choose').click();await page.locator('.nodes .selected').filter({hasText:chooseName}).waitFor();
     await page.getByRole('searchbox',{name:'搜索节点'}).fill('不存在的节点');await page.getByText('没有匹配的节点').waitFor();await page.getByRole('searchbox',{name:'搜索节点'}).fill('');
     await page.getByRole('button',{name:'导入节点',exact:true}).click();const dialog=page.locator('.node-editor');await dialog.getByRole('textbox',{name:'节点分享链接'}).fill('vless://00112233-4455-6677-8899-aabbccddeeff@example.com:443?security=tls&type=ws#UI-Test');await dialog.getByRole('button',{name:'保存节点',exact:true}).click();await dialog.waitFor({state:'detached'});await page.getByRole('searchbox',{name:'搜索节点'}).fill('UI-Test');await page.locator('.node-identity .sub:visible').filter({hasText:'手动导入'}).waitFor();
     await page.locator('summary[aria-label="管理 UI-Test"]').click();await page.getByRole('button',{name:'编辑节点',exact:true}).click();await page.locator('.node-editor').getByRole('textbox',{name:'节点名称',exact:true}).fill('UI-Renamed');await page.locator('.node-editor').getByRole('button',{name:'保存节点',exact:true}).click();await page.locator('.node-editor').waitFor({state:'detached'});await page.getByRole('searchbox',{name:'搜索节点'}).fill('UI-Renamed');await page.locator('summary[aria-label="管理 UI-Renamed"]').click();await page.getByRole('button',{name:'删除节点',exact:true}).click();await page.locator('#ok').click();await page.getByText('没有匹配的节点').waitFor();await page.getByRole('searchbox',{name:'搜索节点'}).fill('');
     const testRow=page.locator('.nodes .row:not(.head)').filter({hasText:testNodeName}).first();await testRow.locator('.node-test').click();await testRow.locator('.platform-cell').nth(1).getByText('550 ms',{exact:true}).waitFor();assert.match(await testRow.locator('.platform-cell').nth(2).innerText(),/1200 ms/);
     if(width>700){const aligned=await page.evaluate(()=>{const head=document.querySelector('.nodes .head'),rows=[...document.querySelectorAll('.nodes .row:not(.head)')].slice(0,6);return rows.every(row=>[...row.children].every((cell,i)=>Math.abs(cell.getBoundingClientRect().x-head.children[i].getBoundingClientRect().x)<1))&&rows.every(row=>Math.abs(row.querySelector('.node-test').getBoundingClientRect().x-rows[0].querySelector('.node-test').getBoundingClientRect().x)<1);});assert(aligned,'node header/row/actions alignment');}
     await page.getByRole('button',{name:'测试全部节点',exact:true}).click();await page.getByRole('button',{name:'测试全部节点',exact:true}).waitFor({timeout:60000});
     const pinnedName=await testRow.locator('.name').innerText();await testRow.locator('summary').click();await page.getByRole('button',{name:'置顶节点',exact:true}).click();await page.locator('.nodes .row:not(.head)').first().locator('.pin-mark').waitFor();assert.equal(await page.locator('.nodes .row:not(.head)').first().locator('.name').innerText(),pinnedName);
     let columnWidth;
     if(width>700){const handle=page.getByRole('separator',{name:'调整节点列宽',exact:true});await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox();await page.mouse.move(box.x+5,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+65,box.y+box.height/2);await page.mouse.up();columnWidth=await page.locator('.nodes .head').evaluate(n=>getComputedStyle(n).gridTemplateColumns);assert(await page.evaluate(()=>!!localStorage.getItem('routerpro-columns-nodes')));}
     await page.reload();await page.locator('.nodes').waitFor();assert.equal(new URL(page.url()).hash,'#nodes');assert.equal(await page.locator('#title').innerText(),'节点');assert.match(await page.locator('.nodes .row:not(.head)').filter({hasText:testNodeName}).first().innerText(),/550 ms/);
     if(columnWidth){assert.equal(await page.locator('.nodes .head').evaluate(n=>getComputedStyle(n).gridTemplateColumns),columnWidth);await page.getByRole('separator',{name:'调整节点列宽',exact:true}).dblclick();}
     await page.getByRole('searchbox',{name:'搜索节点'}).fill('');
    }
    if(view==='rules'){await page.locator('tbody tr').first().waitFor();await page.getByRole('searchbox').fill('telegram');assert((await page.locator('tbody').innerText()).includes('telegram'));await page.getByRole('searchbox').fill('');await page.getByRole('button',{name:'下一页',exact:true}).click();assert.match(await page.locator('.pagination').innerText(),/2 \/ /);}
    if(view==='connections'){await page.locator('.device-connection-list').waitFor();if(await page.locator('.device-connections').count()){assert(await page.locator('.device-connections').first().getAttribute('open')!==null);await page.locator('.device-connections').first().locator('summary>button').click();await page.locator('#confirm').waitFor();await page.locator('#cancel').click();}}
    if(view==='settings'){await page.getByRole('textbox',{name:'用户名',exact:true}).waitFor();await page.getByRole('switch',{name:'开机自动启动',exact:true}).check();await page.getByText('已开启',{exact:true}).waitFor();await page.getByRole('switch',{name:'开机自动启动',exact:true}).uncheck();await page.getByText('已关闭',{exact:true}).waitFor();await page.getByLabel('当前密码',{exact:true}).fill('incorrect-password');await page.getByLabel('新密码',{exact:true}).fill('new-test-password');await page.getByLabel('确认新密码',{exact:true}).fill('other-password');await page.getByRole('button',{name:'保存账号',exact:true}).click();await page.getByText('两次新密码不一致',{exact:true}).waitFor();await page.getByLabel('确认新密码',{exact:true}).fill('new-test-password');await page.getByRole('button',{name:'保存账号',exact:true}).click();await page.getByText('当前密码不正确',{exact:true}).waitFor();}
    await page.screenshot({path:artifacts+'/'+view+'-'+width+'.png',fullPage:view!=='nodes'});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow '+view+' '+width);
   }
   await page.locator('[data-view="overview"]').click();await page.getByRole('button',{name:'全局代理',exact:true}).click();await page.locator('#confirm').waitFor();await page.getByRole('button',{name:'确认',exact:true}).click();await page.waitForTimeout(1800);assert(mutations.some(m=>m.action==='default'&&m.mode==='global'));await page.getByRole('button',{name:'直连',exact:true}).click();await page.locator('#ok').click();await page.waitForTimeout(1800);assert(mutations.some(m=>m.action==='default'&&m.mode==='direct'));await page.locator('[data-view="devices"]').click();const phone=page.locator('.devices .row').filter({hasText:phoneMac});await phone.locator('select').selectOption('inherit');await phone.locator('.badge').filter({hasText:'直连'}).waitFor();await phone.getByRole('button',{name:'开启代理',exact:true}).click();await phone.locator('.badge').filter({hasText:'规则分流'}).waitFor();
   assert.deepEqual(errors,[]);assert(await page.locator('#error').isHidden());console.log('PASS',width,'RouterPro, protected PC, per-device modes, import/edit/delete, platform/all-node tests, refresh keeps page, rules and no overflow/JS errors');await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
