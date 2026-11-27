import {createEngine} from './engine.js';
import {mountPlayer} from './player.js';
import {gradients,copy,id,names} from './model.js';
import {get,saveBundle} from './storage.js';
export const kinds={background:'背景',sprite:'立ち絵',icon:'アイコン',event:'イベントCG',thumbnail:'サムネイル'};
export const mime=['image/png','image/jpeg','image/webp','image/gif'];
const finite=Number.isFinite;
const string=v=>typeof v==='string';
const bool=v=>typeof v==='boolean';
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const shape=(v,fields)=>record(v)&&Object.keys(v).every(k=>Object.hasOwn(fields,k))&&Object.entries(fields).every(([k,check])=>check(v[k]));
const list=check=>v=>Array.isArray(v)&&v.every(check);
const one=(...values)=>v=>values.includes(v);
const position=one('left','center','right');
const val=v=>finite(v)||bool(v);
const valueMap={parameterId:string,value:val};
const effect=v=>shape(v,{...valueMap,operation:one('add','subtract','set')});
const group=v=>shape(v,{logic:one('and','or'),conditions:list(c=>shape(c,{...valueMap,operator:one('>=','<=','>','<','==','!=')}))});
const target=v=>shape(v,{type:one('scene','next'),sceneId:string});
const art={assetId:string,expressionId:string};
const sprite=v=>shape(v,{characterId:string,position,size:finite,flip:bool,assetId:x=>x===undefined||string(x),expressionId:x=>x===undefined||string(x)});
const bg={backgroundAssetId:string};
const byType={
  dialogue:{...bg,...art,text:string,characterId:string,position:v=>v===''||position(v)},
  narration:{text:string},
  choice:{text:string,options:list(o=>shape(o,{id:string,text:string,effects:list(effect),visibilityCondition:group,enabledCondition:group,target}))},
  effect:{effects:list(effect)},
  branch:{routes:list(r=>shape(r,{condition:group,target})),fallback:target},
  stage:{...bg,name:string,sprites:list(sprite),transition:one('none','fade','black','crossfade','slide'),duration:v=>finite(v)&&v>=0&&v<=10000},
  background:bg,
  sprite:{...art,characterId:string,position,size:finite,flip:bool,operation:one('show','hide','expression','image','position','size','flip')},
  jump:{target},
  ending:{...bg,name:string,text:string,kind:string}
};
const color=v=>string(v)&&/^#[0-9a-f]{6}$/i.test(v);
const dated=v=>string(v)&&finite(Date.parse(v));
const bounds=v=>v===null||finite(v);
const scene=s=>shape(s,{id:string,name:string,...bg,initialSprites:v=>v===null||list(sprite)(v),nextSceneId:string,blocks:list(b=>shape(b,{id:string,type:one(...Object.keys(names)),data:v=>shape(v,byType[b.type])}))});
const character=c=>shape(c,{id:string,name:string,description:string,color,nameColor:color,iconAssetId:string,defaultSpriteId:string,sprites:list(x=>shape(x,{id:string,name:string,assetId:string}))});
const parameter=p=>shape(p,{id:string,name:string,description:string,type:one('number','boolean'),initialValue:p?.type==='boolean'?bool:finite,minValue:bounds,maxValue:bounds,color,visible:bool})&&
  (p.minValue===null||p.maxValue===null||p.minValue<=p.maxValue);
const asset=a=>shape(a,{id:string,name:string,kind:one(...Object.keys(kinds)),mime:one(...mime)});
export function assertProject(p) {
  if(!shape(p,{id:string,schemaVersion:one(1),title:string,description:string,thumbnailAssetId:string,createdAt:dated,updatedAt:dated,startSceneId:string,
    settings:s=>shape(s,{mode:one('novel','chat'),speed:v=>finite(v)&&v>=0&&v<=120}),characters:list(character),parameters:list(parameter),scenes:list(scene),assets:list(asset)}))
    throw Error('作品のデータ構造またはバージョンが対応していません。');
  const ids=[...p.characters,...p.parameters,...p.assets,...p.scenes,...p.characters.flatMap(c=>c.sprites),...p.scenes.flatMap(s=>s.blocks),
    ...p.scenes.flatMap(s=>s.blocks.flatMap(b=>b.data.options??[]))].map(o=>o.id);
  if(ids.some(k=>!k||k.startsWith('builtin:'))||new Set(ids).size!==ids.length)throw Error('データ内のIDが不正です。');
  return p;
}
const dataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
export const imageKey=(projectId,assetId)=>projectId+'/'+assetId;
async function gather(p) {
  return Object.fromEntries(await Promise.all(p.assets.map(async a=>{
    const blob=await get('images',imageKey(p.id,a.id));
    if(!blob)throw Error('画像「'+a.name+'」を読み込めません。');
    return [a.id,await dataUrl(blob)];
  })));
}
function download(content,name,type) {
  const a=document.createElement('a');
  const url=URL.createObjectURL(new Blob([content],{type}));
  a.href=url;a.download=(name.trim()||'ストーリー').replace(/[\\/:*?"<>|]/g,'_');a.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export async function exportJSON(p) {
  const snapshot=copy(p);
  download(JSON.stringify({format:'story-editor',version:1,project:snapshot,images:await gather(snapshot)}),snapshot.title+'.json','application/json');
}
export async function importJSON(file) {
  const result=JSON.parse(await file.text());
  if(!shape(result,{format:one('story-editor'),version:one(1),project:record,images:record}))throw Error('ストーリーエディターのJSONを選択してください。');
  const p=assertProject(result.project);
  p.id=id();p.updatedAt=new Date().toISOString();
  const images=p.assets.map(a=>{
    const encoded=result.images[a.id];
    const prefix='data:'+a.mime+';base64,';
    if(!string(encoded)||!encoded.startsWith(prefix))throw Error('画像「'+a.name+'」のデータ形式が不正です。');
    const bytes=Uint8Array.from(atob(encoded.slice(prefix.length)),c=>c.charCodeAt(0));
    if(!bytes.length)throw Error('画像「'+a.name+'」が空です。');
    return [imageKey(p.id,a.id),new Blob([bytes],{type:a.mime})];
  });
  await saveBundle(p,images);
  return p;
}
export async function cloneProject(p) {
  const cloned={...copy(p),id:id(),title:p.title+'（コピー）',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const images=await Promise.all(p.assets.map(async a=>{
    const blob=await get('images',imageKey(p.id,a.id));
    if(!blob)throw Error('画像「'+a.name+'」を読み込めません。');
    return [imageKey(cloned.id,a.id),blob];
  }));
  await saveBundle(cloned,images);return cloned;
}
function safeJSON(value){return JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');}
export function standalone(p,images,style) {
  return '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ストーリー</title><style>'+style+
    '</style><body class="standalone"><main id="game"></main><script>const project='+safeJSON(p)+';const images='+safeJSON(images)+';const gradients='+safeJSON(gradients)+
    ';document.title=project.title;const key="story-editor:game:"+project.id;const options={assetUrl:id=>Object.hasOwn(images,id)?images[id]:undefined,save:state=>localStorage.setItem(key,JSON.stringify(state)),load:()=>JSON.parse(localStorage.getItem(key))};('+mountPlayer.toString()+')(document.querySelector("#game"),project,options,'+createEngine.toString()+',gradients);</'+'script></body></html>';
}
export async function exportHTML(p) {
  const snapshot=copy(p);
  const [images,style]=await Promise.all([gather(snapshot),fetch(new URL('../css/player.css',import.meta.url)).then(r=>{if(!r.ok)throw Error('プレイ画面のCSSを読み込めません。');return r.text();})]);
  download(standalone(snapshot,images,style),snapshot.title+'.html','text/html');
}
