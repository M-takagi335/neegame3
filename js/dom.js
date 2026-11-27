export function el(tag,attributes={},...children) {
  const item = document.createElement(tag);
  for (const [key,value] of Object.entries(attributes)) {
    if (value == null) continue;
    if (key.startsWith('on')) item.addEventListener(key.slice(2),value);
    else if (key === 'class') item.className = value;
    else if (key in item && !key.startsWith('aria')) item[key] = value;
    else item.setAttribute(key,value);
  }
  for (const child of children.flat(Infinity)) if (child != null && child !== false) item.append(child);
  return item;
}
export const button = (text,onclick,style='',attributes={}) => el('button',{type:'button',class:style,onclick,...attributes},text);
export const label = (name,control) => el('label',{},el('span',{},name),control);
export function input(value,set,{type='text',multiline=false,placeholder='',min,max,live=false}={}) {
  const item = el(multiline?'textarea':'input',{value,type:multiline?undefined:type,placeholder,min,max,rows:multiline?3:undefined});
  const read = () => type==='number' ? (item.value==='' ? null : item.valueAsNumber) : type==='checkbox' ? item.checked : item.value;
  if (type==='checkbox') item.checked = !!value;
  if(live){
    let first=true;
    item.addEventListener('input',()=>{set(read(),first);first=false;});
    item.addEventListener('blur',()=>{first=true;});
  }else item.addEventListener('change',()=>set(read()));
  return item;
}
export function select(value,items,set) {
  const list = el('select',{onchange:event=>set(event.target.value)},items.map(([id,name])=>el('option',{value:id},name)));
  if (items.some(([id])=>String(id)===String(value))) list.value=value;
  else if (value) { list.append(el('option',{value},'不明な参照')); list.value=value; }
  return list;
}
export const listOf = items => items.map(({id,name})=>[id,name]);
export function disclosure(title,...children) {
  return el('details',{},el('summary',{},title),el('div',{class:'stack'},children));
}
