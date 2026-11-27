import {project,makeScene,makeCharacter,makeParameter,block,to,option,id} from './model.js';
export function sample() {
  const p = project('放課後、鐘が鳴るまで');
  p.description = '昼休みと放課後、誰と過ごす？ 二度の選択から、三つの結末へ。';
  p.thumbnailAssetId = 'builtin:dusk';
  const a = {...makeCharacter(),name:'アオイ',color:'#7657d4'};
  const b = {...makeCharacter(),name:'ヒナタ',color:'#ba6531'};
  const pa = {...makeParameter(),name:'アオイの好感度',visible:true};
  const pb = {...makeParameter(),name:'ヒナタの好感度',visible:true,color:'#ba6531'};
  p.characters.push(a,b);
  p.parameters.push(pa,pb);
  const [opening] = p.scenes;
  opening.name = '教室での出会い';
  opening.backgroundAssetId = 'builtin:day';
  const afternoon = makeScene('放課後');
  const endA = makeScene('アオイエンド');
  const endB = makeScene('ヒナタエンド');
  const normal = makeScene('いつもの帰り道');
  const choice = (text,label) => block('choice',{text,options:[
    {...option(),text:'アオイと'+label,effects:[{parameterId:pa.id,operation:'add',value:3}]},
    {...option(),text:'ヒナタと'+label,effects:[{parameterId:pb.id,operation:'add',value:3}]},
    {...option(),text:'一人で'+label}
  ]});
  opening.blocks.push(
    block('stage',{name:'春の教室',backgroundAssetId:'builtin:day',sprites:[{characterId:a.id,position:'left',size:100,flip:false}]}),
    block('narration',{text:'春の光が差し込む教室。窓を開けると、遠くで昼休みの鐘が鳴った。'}),
    block('dialogue',{characterId:a.id,text:'お昼、まだ決めていないなら、一緒にどう？'}),
    block('sprite',{characterId:b.id,position:'right',operation:'show'}),
    block('dialogue',{characterId:b.id,text:'屋上も気持ちよさそうだよ。よかったら行こう！'}),
    choice('誰と昼食を食べる？','食べる')
  );
  opening.nextSceneId = afternoon.id;
  afternoon.blocks.push(
    block('background',{backgroundAssetId:'builtin:dusk'}),
    block('sprite',{characterId:b.id,position:'center',operation:'position'}),
    choice('放課後はどうする？','帰る'),
    block('branch',{routes:[[pa,endA],[pb,endB]].map(([param,end])=>({condition:{logic:'and',conditions:[{parameterId:param.id,operator:'>=',value:6}]},target:to(end.id)})),fallback:to(normal.id)})
  );
  endA.blocks.push(block('ending',{name:'また明日',kind:'グッドエンド',text:'校門の前で、アオイが小さく手を振った。「明日も一緒に帰ろう」'}));
  endB.blocks.push(block('ending',{name:'夕焼けの約束',kind:'グッドエンド',text:'ヒナタが振り返った。「今度は、夕焼けがよく見える場所を教えるね」'}));
  normal.blocks.push(block('ending',{name:'いつもの帰り道',kind:'ノーマルエンド',text:'夕焼けを眺めながら歩いた。明日も何か、いいことがありそうだ。'}));
  p.scenes.push(afternoon,endA,endB,normal);
  return p;
}
export async function sampleImages(p) {
  const colors=[
    {hair:'#23233d',coat:'#5062a2',skin:'#f1c4ac'},
    {hair:'#5b372c',coat:'#9a4d58',skin:'#edb98f'}
  ];
  const images=[];
  for(const [i,c] of p.characters.entries()) {
    const colorsForCharacter=colors[i];
    const canvas=document.createElement('canvas');
    canvas.width=340;canvas.height=450;
    const ctx=canvas.getContext('2d');
    const oval=(x,y,rx,ry,color)=>{
      ctx.fillStyle=color;
      ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();
    };
    const poly=(points,color)=>{
      ctx.fillStyle=color;ctx.beginPath();
      points.forEach(([x,y],index)=>index?ctx.lineTo(x,y):ctx.moveTo(x,y));
      ctx.closePath();ctx.fill();
    };
    for(const expression of ['通常','笑顔']) {
      ctx.clearRect(0,0,340,450);
      const {hair,coat,skin}=colorsForCharacter;
      oval(170,159,99,128,hair);
      oval(170,437,147,139,coat);
      poly([[126,269],[214,269],[202,322],[170,350],[138,321]],'#fff0e1');
      oval(170,267,32,43,skin);
      oval(170,163,74,91,skin);
      poly([[87,152],[92,92],[129,48],[211,43],[252,91],[265,163],[211,99],[175,119],[154,83],[123,131]],hair);
      for(const x of [142,198]) {
        if(expression==='笑顔') {
          ctx.strokeStyle=hair;ctx.lineWidth=5;ctx.lineCap='round';
          ctx.beginPath();ctx.arc(x,168,9,Math.PI,2*Math.PI);ctx.stroke();
        } else oval(x,162,5,10,hair);
      }
      oval(170,203,expression==='笑顔'?14:8,expression==='笑顔'?6:2,'#ad6069');
      poly([[155,313],[185,313],[170,344]],'#c17c6f');
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)continue;
      const asset={id:id(),kind:'sprite',name:c.name+'（'+expression+'）.png',mime:'image/png'};
      p.assets.push(asset);
      images.push([p.id+'/'+asset.id,blob]);
      if(expression==='通常')c.defaultSpriteId=asset.id;
      else c.sprites.push({id:id(),name:expression,assetId:asset.id});
    }
  }
  const afternoon=p.scenes[1];
  const character=p.characters[1];
  if(character.sprites.length)afternoon.blocks.splice(2,0,block('sprite',{operation:'expression',characterId:character.id,expressionId:character.sprites[0].id}));
  return images;
}
