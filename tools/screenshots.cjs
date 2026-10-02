const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../web'),output=path.resolve(__dirname,'../docs/assets');
const proxies={DIRECT:{name:'DIRECT',type:'Direct'},'Demo node A':{name:'Demo node A',type:'Vless'},'Demo node B':{name:'Demo node B',type:'Trojan'},'节点选择':{name:'节点选择',type:'Selector',all:['Demo node A','Demo node B'],now:'Demo node A'}};
const settings={modes:{},nodes:{},pins:{},defaultMode:'rule',adminUser:'demo-admin',proxyUser:'demo-proxy',bootEnabled:true,subscriptions:{},groups:[{name:'节点选择',type:'select',proxies:['Demo node A','Demo node B']}]};
const devices={csrf:'synthetic-demo-token',running:true,system:{memoryTotal:180224,memoryAvailable:49152,uptime:104400},devices:[{name:'Demo laptop',ip:'192.0.2.10',mac:'02:00:00:00:00:01',protected:true,enabled:false},{name:'Demo phone',ip:'192.0.2.11',mac:'02:00:00:00:00:02',protected:false,enabled:true}]};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}try{const type={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html'}[path.extname(file)]||'application/octet-stream';res.setHeader('Content-Type',type);res.end(fs.readFileSync(file));}catch(e){res.writeHead(404);res.end();}});
(async()=>{
 fs.mkdirSync(output,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
  for(const [view,width,name]of [['overview',1200,'overview.png'],['settings',390,'settings-mobile.png']]){
   const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{window.WebSocket=class{close(){}};});
   await page.route('**/cgi-bin/devices',route=>route.fulfill({json:devices}));await page.route('**/cgi-bin/manage',route=>route.fulfill({json:settings}));
   await page.route('http://127.0.0.1:9090/**',route=>{const url=new URL(route.request().url()),data={'/proxies':{proxies},'/configs':{mode:'rule'},'/version':{version:'1.19.17'},'/providers/proxies':{providers:{}},'/connections':{connections:[],downloadTotal:314572800,uploadTotal:52428800}}[url.pathname];return route.fulfill({json:data||{},headers:{'Access-Control-Allow-Origin':'*'}});});
   await page.goto('http://127.0.0.1:'+server.address().port+'/#'+view);await page.locator(view==='overview'?'.metrics':'.account-form').waitFor();
   if(view==='overview')await page.evaluate(()=>{const now=Date.now();S.traffic=Array.from({length:61},(_,i)=>({time:now-(60-i)*1000,down:350000+180000*Math.sin(i/6)+90000*Math.sin(i/2.3),up:95000+45000*Math.sin(i/8)}));S.trafficStarted=now-60000;S.trafficShifted=true;chartFromMax=chartToMax=chartMax=1048576;drawTraffic();$('rate-down').textContent='↓ 320 KB/s';$('rate-up').textContent='↑ 88 KB/s';});
   await page.waitForTimeout(250);if(errors.length)throw Error(errors.join('; '));await page.screenshot({path:path.join(output,name),fullPage:true});await context.close();
  }
  const page=await browser.newPage();
  const sources=['overview.png','settings-mobile.png'].map(name=>'data:image/png;base64,'+fs.readFileSync(path.join(output,name)).toString('base64'));
  const preview=await page.evaluate(async sources=>{
   const images=await Promise.all(sources.map(src=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.src=src;})));
   const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1040;const ctx=canvas.getContext('2d');ctx.fillStyle='#f4f7f9';ctx.fillRect(0,0,1600,1040);
   ctx.fillStyle='#263943';ctx.font='600 22px system-ui';ctx.fillText('Desktop overview',40,45);ctx.fillText('Mobile settings',1240,45);
   for(const [i,x,width]of [[0,40,1160],[1,1240,320]]){const image=images[i],height=image.height/image.width*width;ctx.save();ctx.beginPath();ctx.roundRect(x,72,width,height,6);ctx.clip();ctx.drawImage(image,x,72,width,height);ctx.restore();ctx.strokeStyle='#d8e2e8';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,72,width,height,6);ctx.stroke();}
   ctx.fillStyle='#71818b';ctx.font='17px system-ui';ctx.fillText('RouterPro / synthetic demo data',40,1010);return canvas.toDataURL('image/png').split(',')[1];
  },sources);
  fs.writeFileSync(path.join(output,'preview.png'),Buffer.from(preview,'base64'));await page.close();
  console.log('Generated README screenshots from synthetic data only');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
