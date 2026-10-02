'use strict';
function decodeShareBase64(text){
 const normalized=text.replace(/-/g,'+').replace(/_/g,'/');
 const raw=atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'='));
 return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(raw,c=>c.charCodeAt(0)));
}
function parseNodeShare(text,nameOverride=''){
 const uri=text.trim();if(!uri||/\s/.test(uri))throw Error('请粘贴单个完整的节点分享链接');
 let node;
 if(uri.startsWith('vmess://')){
  const p=JSON.parse(decodeShareBase64(uri.slice(8)));const network=p.net||'tcp';
  if(!['tcp','ws','grpc','http','h2'].includes(network))throw Error('暂不支持此 VMess 传输类型');
  if(p.type&&p.type!=='none'&&network==='tcp')throw Error('暂不支持带 TCP 伪装头的 VMess 链接');
  node={name:p.ps||p.add,type:'vmess',server:p.add,port:Number(p.port),uuid:p.id,alterId:Number(p.aid||0),cipher:p.scy||'auto',udp:true,network,tls:p.tls==='tls'};
  if(p.sni||p.host)node.servername=p.sni||p.host;
  if(network==='ws')node['ws-opts']={path:p.path||'/',headers:{Host:p.host||p.add}};
  if(network==='grpc')node['grpc-opts']={'grpc-service-name':p.path||''};
  if(network==='http')node['http-opts']={path:[p.path||'/'],headers:{Host:[p.host||p.add]}};
  if(network==='h2')node['h2-opts']={path:p.path||'/',host:[p.host||p.add]};
 }else if(uri.startsWith('ss://')){
  const hash=uri.indexOf('#'),fragment=hash>=0?decodeURIComponent(uri.slice(hash+1)):'';
  let authority=(hash>=0?uri.slice(5,hash):uri.slice(5));
  if(!authority.includes('@'))authority=decodeShareBase64(authority);
  const u=new URL('ss://'+authority),query=u.searchParams;
  if(query.has('plugin'))throw Error('暂不支持 Shadowsocks 插件链接');
  let credentials=decodeURIComponent(u.username)+(u.password?':'+decodeURIComponent(u.password):'');
  if(!credentials.includes(':'))credentials=decodeShareBase64(credentials);
  const separator=credentials.indexOf(':');if(separator<0)throw Error('Shadowsocks 密钥格式错误');
  node={name:fragment||u.hostname,type:'ss',server:u.hostname.replace(/^\[|\]$/g,''),port:Number(u.port),cipher:credentials.slice(0,separator),password:credentials.slice(separator+1),udp:true};
 }else{
  const u=new URL(uri),q=u.searchParams,protocol=u.protocol.slice(0,-1);
  const type=protocol==='hy2'?'hysteria2':protocol;
  if(!['vless','trojan','hysteria2'].includes(type))throw Error('支持 VLESS、VMess、Trojan、SS 和 Hysteria2 分享链接');
  const network=q.get('type')||'tcp';if(!['tcp','ws','grpc','http','h2'].includes(network))throw Error('暂不支持此传输类型：'+network);
  node={name:decodeURIComponent(u.hash.slice(1))||u.hostname,type,server:u.hostname.replace(/^\[|\]$/g,''),port:Number(u.port||(type==='hysteria2'||type==='trojan'?443:0)),udp:true};
  const credential=decodeURIComponent(u.username)+(u.password?':'+decodeURIComponent(u.password):'');
  if(type==='vless'){node.uuid=credential;node.tls=['tls','reality'].includes(q.get('security'));if(q.get('flow'))node.flow=q.get('flow');}
  else{node.password=credential;node.tls=true;}
  if(type!=='hysteria2')node.network=network;
  const sni=q.get('sni')||q.get('peer');if(sni)node[type==='vless'?'servername':'sni']=sni;
  if(q.get('alpn'))node.alpn=q.get('alpn').split(',');
  if(q.get('fp'))node['client-fingerprint']=q.get('fp');
  node['skip-cert-verify']=['1','true'].includes(q.get('allowInsecure')||q.get('insecure'));
  if(q.get('security')==='reality'){
   if(!q.get('pbk'))throw Error('Reality 链接缺少公钥');
   node['reality-opts']={'public-key':q.get('pbk'),'short-id':q.get('sid')||''};
  }
  if(network==='ws')node['ws-opts']={path:q.get('path')||'/',headers:{Host:q.get('host')||node.server}};
  if(network==='grpc')node['grpc-opts']={'grpc-service-name':q.get('serviceName')||''};
  if(network==='http')node['http-opts']={path:[q.get('path')||'/'],headers:{Host:[q.get('host')||node.server]}};
  if(network==='h2')node['h2-opts']={path:q.get('path')||'/',host:[q.get('host')||node.server]};
  if(type==='hysteria2'&&q.get('obfs')){node.obfs=q.get('obfs');node['obfs-password']=q.get('obfs-password')||'';}
 }
 if(nameOverride.trim())node.name=nameOverride.trim();
 if(!node.name||node.name.length>=180||/[,\r\n]/.test(node.name))throw Error('节点名称不能为空或包含逗号、换行');
 if(!node.server||!Number.isInteger(node.port)||node.port<1||node.port>65535)throw Error('节点地址或端口不正确');
 if(['vless','vmess'].includes(node.type)&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node.uuid||''))throw Error('节点 UUID 格式不正确');
 if(['ss','trojan','hysteria2'].includes(node.type)&&!node.password)throw Error('节点缺少密码');
 return {node,uri};
}
if(typeof module!=='undefined')module.exports={parseNodeShare};
