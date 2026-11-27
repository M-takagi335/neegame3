import test from 'node:test';
import assert from 'node:assert/strict';
import {block,makeScene,makeParameter,project,option,to,makeCharacter} from '../js/model.js';
import {createEngine} from '../js/engine.js';
import {sample} from '../js/sample.js';
import {edges} from '../js/graph.js';
import {validate} from '../js/validation.js';

test('add, subtract, set, clamping, and boolean parameters',()=>{
  const p=project();
  const number={...makeParameter(),initialValue:99,minValue:-2,maxValue:6};
  const bool={...makeParameter(),type:'boolean',initialValue:false};
  p.parameters=[number,bool];
  const change=(id,operation,value)=>({parameterId:id,operation,value});
  const [s]=p.scenes;
  s.blocks=[block('narration'),block('effect',{effects:[change(number.id,'subtract',50)]}),block('narration'),
    block('effect',{effects:[change(number.id,'set',4),change(number.id,'add',1),change(bool.id,'set',true),change(bool.id,'add',false)]}),block('narration')];
  const engine=createEngine(p);
  assert.equal(engine.state().parameterValues[number.id],6);
  engine.advance();
  assert.equal(engine.state().parameterValues[number.id],-2);
  engine.advance();
  assert.equal(engine.state().parameterValues[number.id],5);
  assert.equal(engine.state().parameterValues[bool.id],true);
});

test('ordered AND/OR branch, fallback, scene inheritance, and convergence',()=>{
  const p=project();
  const param=makeParameter();
  const [start]=p.scenes;
  const left=makeScene('左'),right=makeScene('右'),end=makeScene('合流');
  p.parameters=[param];
  p.scenes.push(left,right,end);
  start.backgroundAssetId='builtin:day';
  const c=(operator,value)=>({parameterId:param.id,operator,value});
  start.blocks=[block('branch',{routes:[
    {condition:{logic:'and',conditions:[c('>=',1),c('<=',2)]},target:to(left.id)},
    {condition:{logic:'or',conditions:[c('==',2),c('!=',0)]},target:to(right.id)}
  ],fallback:to(end.id)})];
  left.blocks=[block('narration',{text:'左'}),block('jump',{target:to(end.id)})];
  right.blocks=[block('narration',{text:'右'})];right.nextSceneId=end.id;
  end.blocks=[block('ending')];
  for(const [value,dest] of [[0,end],[2,left],[3,right]]){
    const engine=createEngine(p,{values:{[param.id]:value}});
    assert.equal(engine.state().currentSceneId,dest.id);
    assert.equal(engine.state().currentBackgroundAssetId,'builtin:day');
    if(value)engine.advance();
    assert.equal(engine.state().currentSceneId,end.id);
    assert.equal(engine.state().status,'ended');
  }
  assert.equal(edges(p).length,5);
  assert.equal(validate(p).length,0);
});

test('choices combine effects, hide/disable choices, and reject stale clicks',()=>{
  const p=project(), a=makeParameter(), b=makeParameter();
  p.parameters=[a,b];
  const c={logic:'and',conditions:[{parameterId:a.id,operator:'>',value:0}]};
  const yes={...option(),text:'選ぶ',effects:[{parameterId:a.id,operation:'add',value:3},{parameterId:b.id,operation:'subtract',value:2}]};
  const hidden={...option(),visibilityCondition:c}, disabled={...option(),enabledCondition:c};
  p.scenes[0].blocks=[block('choice',{options:[yes,hidden,disabled]}),block('choice',{options:[yes]})];
  const engine=createEngine(p);
  const event=engine.state().event;
  assert.equal(event.choices.length,2);
  assert.equal(engine.choose(disabled.id,event),false);
  assert.equal(engine.choose(yes.id,event),true);
  assert.equal(engine.choose(yes.id,event),false);
  assert.deepEqual(engine.state().parameterValues,{[a.id]:3,[b.id]:-2});
});

test('debug rewind restores visual state, history and parameters without changing project defaults',()=>{
  const p=project(),a=makeParameter(), char=makeCharacter();
  p.parameters=[a];p.characters=[char];
  p.scenes[0].blocks=[block('narration'),block('stage',{backgroundAssetId:'builtin:night',sprites:[{characterId:char.id}]}),
    block('effect',{effects:[{parameterId:a.id,operation:'set',value:2}]}),block('narration')];
  const engine=createEngine(p,{debug:true});
  const before=engine.snapshot();
  engine.advance();
  assert.equal(engine.state().currentBackgroundAssetId,'builtin:night');
  assert.equal(engine.state().visibleSprites[0].characterId,char.id);
  assert.equal(engine.state().dialogueHistory.length,2);
  assert.equal(engine.state().parameterValues[a.id],2);
  assert(engine.back());
  assert.deepEqual(engine.state(),before);
  assert.equal(p.parameters[0].initialValue,0);
});

test('automatic cycles stop while intentional player-driven loops work',()=>{
  const p=project(), [s]=p.scenes;
  s.blocks=[block('jump',{target:to(s.id)})];
  assert.equal(createEngine(p).state().status,'error');
  assert(validate(p).some(issue=>issue.message.includes('1000')));
  s.blocks.unshift(block('narration'));
  const playable=createEngine(p);
  assert(playable.advance());
  assert.equal(playable.state().status,'input');
});

test('all three sample endings',()=>{
  const p=sample();
  for(const [route,ending] of [[0,'また明日'],[1,'夕焼けの約束'],[2,'いつもの帰り道']]){
    const e=createEngine(p);
    for(let i=0;i<3;i++)assert(e.advance());
    assert(e.choose(e.state().event.choices[route].id));
    assert(e.choose(e.state().event.choices[route].id));
    assert.equal(e.state().event.name,ending);
  }
});
