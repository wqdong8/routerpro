const fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const accessPath=process.env.ROUTERPRO_ACCESS;
if(!accessPath)throw Error('Set ROUTERPRO_ACCESS to a private access.json outside this repository');
const access=JSON.parse(fs.readFileSync(accessPath,'utf8'));
const artifacts=path.resolve(__dirname,'../artifacts');fs.mkdirSync(artifacts,{recursive:true});
const launchOptions={headless:true,args:['--proxy-server=direct://','--proxy-bypass-list=*'],...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})};
module.exports={chromium,access,launchOptions,artifacts};
