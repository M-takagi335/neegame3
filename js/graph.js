import {el,button} from './dom.js';
import {conditionText} from './forms.js';
export function edges(p) {
  const result=[];
  const add=(from,target,label,kind)=>{if(target?.type==='scene'&&target.sceneId)result.push({from,to:target.sceneId,label,kind});};
  for(const s of p.scenes) {
    let fallsThrough=true;
    for(const b of s.blocks) {
      const d=b.data;
      if(b.type==='choice') for(const o of d.options) add(s.id,o.target,o.text||'選択肢','choice');
      if(b.type==='branch') {
        for(const r of d.routes) add(s.id,r.target,conditionText(p,r.condition),'branch');
        add(s.id,d.fallback,'それ以外','branch');
      }
      if(b.type==='jump') add(s.id,d.target,'シーン移動','jump');
      if(b.type==='ending'||b.type==='jump'||b.type==='branch'&&[...d.routes.map(r=>r.target),d.fallback].every(t=>t.type==='scene')||
        b.type==='choice'&&d.options.length&&d.options.every(o=>o.target.type==='scene')) {
        fallsThrough=false;
        break;
      }
    }
    if(fallsThrough&&s.nextSceneId)result.push({from:s.id,to:s.nextSceneId,label:'シーン終了後',kind:'next'});
  }
  return result;
}
export function depths(p,links) {
  const levels=new Map();
  if(!p.scenes.some(s=>s.id===p.startSceneId))return levels;
  levels.set(p.startSceneId,0);
  const queue=[p.startSceneId];
  const ids=new Set(p.scenes.map(s=>s.id));
  for(const from of queue) for(const link of links) if(link.from===from&&ids.has(link.to)&&!levels.has(link.to)){
    levels.set(link.to,levels.get(from)+1);
    queue.push(link.to);
  }
  return levels;
}
export function graph(p,open) {
  const links=edges(p), levels=depths(p,links), bounds=new Map(), counts=new Map();
  const last=Math.max(0,...levels.values());
  for(const scene of p.scenes) {
    const column=levels.get(scene.id)??last+1;
    const row=counts.get(column)??0;
    counts.set(column,row+1);
    bounds.set(scene.id,{x:30+column*320,y:28+row*144});
  }
  const width=Math.max(370,...[...bounds.values()].map(b=>b.x+280));
  const height=Math.max(250,...[...bounds.values()].map(b=>b.y+145));
  const canvas=el('div',{class:'map-canvas'});
  canvas.style.width=width+'px';
  canvas.style.height=height+'px';
  const viewport=el('div',{class:'map-viewport'},el('div',{class:'map-space'},canvas));
  const svg=(tag,attr)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attr))n.setAttribute(k,v);return n;};
  const drawing=svg('svg',{width,height,'aria-hidden':'true'});
  const defs=svg('defs',{});
  const marker=svg('marker',{id:'arrowhead',markerWidth:8,markerHeight:8,refX:7,refY:4,orient:'auto'});
  marker.append(svg('path',{d:'M0 0 L8 4 L0 8 Z',fill:'#a393bf'}));
  defs.append(marker);
  drawing.append(defs);
  const duplicateCounts=new Map();
  for(const link of links) {
    const a=bounds.get(link.from), b=bounds.get(link.to);
    if(!a||!b)continue;
    const key=link.from+'|'+link.to;
    const lane=duplicateCounts.get(key)??0;
    duplicateCounts.set(key,lane+1);
    const x=a.x+194,y=a.y+39+Math.min(lane*7,32), endX=b.x,endY=b.y+39+Math.min(lane*7,32);
    const backward=endX<=x;
    const pathData=backward?`M ${x} ${y} C ${x+105} ${y+75+lane*20}, ${endX-105} ${endY+75+lane*20}, ${endX} ${endY}`:
      `M ${x} ${y} C ${x+55} ${y}, ${endX-45} ${endY}, ${endX} ${endY}`;
    const path=svg('path',{d:pathData,class:'edge '+link.kind,'marker-end':'url(#arrowhead)'});
    const title=svg('title',{});title.textContent=link.label;path.append(title);
    drawing.append(path);
    const text=svg('text',{x:(x+endX)/2,y:(y+endY)/2+(backward?58+lane*16:-8+lane*10),'text-anchor':'middle',class:'edge-label'});
    text.textContent=link.label.length>19?link.label.slice(0,18)+'…':link.label;
    drawing.append(text);
  }
  canvas.append(drawing);
  for(const s of p.scenes) {
    const note=[s.id===p.startSceneId?'開始':null,s.blocks.some(b=>b.type==='ending')?'エンディング':null,!levels.has(s.id)?'未接続':null].filter(Boolean).join(' ・ ');
    const node=el('button',{type:'button',class:'map-node',onclick:()=>open(s.id)},el('strong',{},s.name),el('small',{},note||s.blocks.length+' ブロック'));
    Object.assign(node.style,{left:bounds.get(s.id).x+'px',top:bounds.get(s.id).y+'px'});
    canvas.append(node);
  }
  let zoom=1;
  const scale=value=>{zoom=Math.min(2,Math.max(.1,value));canvas.style.transform='scale('+zoom+')';
    viewport.firstElementChild.style.width=width*zoom+'px';viewport.firstElementChild.style.height=height*zoom+'px';};
  return el('div',{class:'stack'},el('div',{class:'row wrap'},
    button('拡大',()=>scale(zoom+.15)),button('縮小',()=>scale(zoom-.15)),
    button('全体表示',()=>{scale(Math.min(1,viewport.clientWidth/width,viewport.clientHeight/height));viewport.scrollTo(0,0);}),
    button('自動整列',()=>{scale(1);viewport.scrollTo(0,0);}),
    el('span',{class:'muted'},'オレンジ＝選択肢　紫＝条件分岐')),
    viewport,
    el('ul',{class:'map-links'},links.map(l=>el('li',{},p.scenes.find(s=>s.id===l.from)?.name+' → '+(p.scenes.find(s=>s.id===l.to)?.name??'不明')+' ／ '+l.label))));
}
