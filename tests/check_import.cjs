const assert=require('assert/strict');
const {parseNodeShare}=require('../web/node-import.js');
const uuid='00112233-4455-6677-8899-aabbccddeeff';
const base64=s=>Buffer.from(s).toString('base64');
const v=parseNodeShare('vless://'+uuid+'@example.com:443?security=reality&pbk=pubkey&sid=abcd&flow=xtls-rprx-vision&sni=example.com#Japan');
assert.equal(v.node.uuid,uuid);assert.equal(v.node['reality-opts']['short-id'],'abcd');assert.equal(v.node.flow,'xtls-rprx-vision');
const ws=parseNodeShare('vless://'+uuid+'@example.com:443?security=tls&type=ws&host=cdn.example.com&path=%2Fws#Tokyo','New Name');assert.equal(ws.node.name,'New Name');assert.equal(ws.node['ws-opts'].path,'/ws');
const vm=parseNodeShare('vmess://'+base64(JSON.stringify({ps:'VM Test',add:'example.com',port:'443',id:uuid,aid:0,net:'grpc',path:'service',tls:'tls'})));assert.equal(vm.node['grpc-opts']['grpc-service-name'],'service');
for(const uri of ['ss://'+base64('aes-128-gcm:abc:def')+'@example.com:8388#SS','ss://'+base64('aes-128-gcm:abc:def@example.com:8388')+'#SS']){const ss=parseNodeShare(uri);assert.equal(ss.node.password,'abc:def');assert.equal(ss.node.cipher,'aes-128-gcm');}
const trojan=parseNodeShare('trojan://a%40b@example.com:443?type=ws&path=%2Fproxy#Trojan');assert.equal(trojan.node.password,'a@b');assert.equal(trojan.node.tls,true);
const hy=parseNodeShare('hy2://password@example.com:443?sni=example.com&obfs=salamander&obfs-password=abc#HY');assert.equal(hy.node.type,'hysteria2');assert.equal(hy.node['obfs-password'],'abc');
assert.throws(()=>parseNodeShare('vless://bad@example.com:443'));assert.throws(()=>parseNodeShare('https://example.com'));assert.throws(()=>parseNodeShare('ss://'+base64('aes-128-gcm:password')+'@example.com:8388?plugin=v2ray-plugin'));assert.throws(()=>parseNodeShare('vless://'+uuid+'@example.com:443?type=xhttp'));assert.throws(()=>parseNodeShare('vless://'+uuid+'@example.com:0'));
console.log('PASS import: VLESS Reality/WS, VMess gRPC, SS SIP002/legacy, Trojan, Hysteria2; malformed/unsupported links rejected');
