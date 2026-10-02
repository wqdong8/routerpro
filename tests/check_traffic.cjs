const fs=require('fs'),assert=require('assert/strict');
const {chromium,access:a,launchOptions,artifacts}=require('./support.cjs');
(async()=>{
 const browser=await chromium.launch(launchOptions);
 try{for(const blocked of [false,true]){const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,httpCredentials:{username:a.admin_user||a.proxy_user,password:a.admin_password||a.proxy_password}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(blocked=>{AbortSignal.timeout=undefined;if(blocked){window.WebSocket=class{constructor(){throw Error('WebSocket blocked for test');}};}else{window.WebSocket=class{constructor(){let i=0;this.timer=setInterval(()=>{i++;this.onmessage?.({data:JSON.stringify({down:500000+200000*Math.sin(i),up:120000+80000*Math.cos(i)})});},200);}close(){clearInterval(this.timer);this.onclose?.();}};}},blocked);
  let samples=0;await page.route('http://192.168.31.1:9090/connections',async route=>{if(route.request().method()==='OPTIONS'){await route.continue();return;}samples++;await route.fulfill({json:{connections:[],downloadTotal:samples*50000000,uploadTotal:samples*5000000},headers:{'Access-Control-Allow-Origin':'*'}});});
  await page.goto('http://192.168.31.1:9091/#overview');await page.locator('#traffic').waitFor();await page.waitForTimeout(blocked?6000:2800);
  assert.match(await page.locator('#rate-down').innerText(),/\/s/);assert(!/0 B\/s/.test(await page.locator('#rate-down').innerText()));
  const pixels=await page.locator('#traffic').evaluate(canvas=>{const ctx=canvas.getContext('2d'),d=ctx.getImageData(0,0,canvas.width,canvas.height).data;let count=0,min=Infinity,max=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>128&&Math.abs(d[i]-d[i+1])>40){count++;const x=(i/4)%canvas.width;min=Math.min(min,x);max=Math.max(max,x);}return{count,min,max,width:canvas.width};});assert(pixels.count>20);assert(pixels.min<pixels.width*.4);assert(pixels.max<pixels.width*.5,'new graph begins at left');assert.deepEqual(errors,[]);assert(await page.locator('#error').isHidden());
  await page.screenshot({path:artifacts+'/traffic-mobile-'+(blocked?'fallback':'websocket')+'.png',fullPage:true});console.log('PASS mobile traffic',blocked?'HTTP fallback without WebSocket':'WebSocket',pixels.count,'colored pixels, starts left, no AbortSignal.timeout dependency');await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
