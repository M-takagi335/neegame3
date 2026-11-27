import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname} from 'node:path';
const mount='/neegame3/';
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript'};
const port=Number(process.env.STORY_EDITOR_PORT??4173);
createServer(async (request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname;
  if(pathname==='/'){
    response.writeHead(302,{location:mount}).end();
    return;
  }
  const path=pathname.slice(mount.length)||'index.html';
  if(!pathname.startsWith(mount)||! /^(index\.html|(?:js|css)\/[a-z]+\.(?:js|css))$/.test(path)){
    response.writeHead(404).end();
    return;
  }
  try{
    const contents=await readFile(new URL('./'+path,import.meta.url));
    response.writeHead(200,{'content-type':types[extname(path)]+'; charset=utf-8','cache-control':'no-store'}).end(contents);
  }catch{
    response.writeHead(404).end();
  }
}).listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port+mount));
