import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as physics from '../public/physics.mjs';
const { createGame, stepPhysics, serve, MODES } = physics;
test('elapsed time gives identical movement at 30, 60 and 144 render FPS', () => {
  function simulate(fps) { const game = createGame(); let accumulator = 0; for(let f=0;f<fps;f++) { accumulator += 1/fps; while(accumulator + 1e-12 >= 1/240) { stepPhysics(game,1/240); accumulator -= 1/240; } } return game.ball; }
  assert.deepEqual(simulate(30),simulate(60)); assert.deepEqual(simulate(60),simulate(144));
});
test('paddle edge changes angle; hits accelerate within the difficulty cap', () => {
  for(const difficulty of Object.keys(MODES)) {
    const g=createGame(difficulty); g.ball={x:85,y:390,vx:-MODES[difficulty].speed,vy:0,r:12};
    assert.equal(stepPhysics(g,1/240),'hit'); assert.ok(g.ball.vx>0); assert.ok(g.ball.vy>0); assert.equal(g.score,1);
    assert.ok(Math.hypot(g.ball.vx,g.ball.vy)>MODES[difficulty].speed);
    g.ball={x:85,y:360,vx:-MODES[difficulty].max,vy:0,r:12}; stepPhysics(g,1/240);
    assert.ok(Math.hypot(g.ball.vx,g.ball.vy)<=MODES[difficulty].max+.00001);
    assert.equal(stepPhysics(g,1/240),null); assert.equal(g.score,2);
  }
});
test('misses cost one life per serve and preserve cumulative score', () => {
  const g=createGame(); g.score=12;
  for(let lives=2;lives>=0;lives--) { g.ball.x=1300; assert.equal(stepPhysics(g,1/240),'miss'); assert.equal(g.lives,lives); if(lives) serve(g); }
  assert.equal(g.score,12);
});
function harness() {
  const elements = new Map(); const listeners = new Map(); let now=0, resultCallback;
  const context2d=new Proxy({}, { get:(_,name)=>name==='measureText'?()=>({width:0}):()=>{} });
  function element(id) { if(!elements.has(id)) elements.set(id,{value: id==='difficulty'?'normal':id==='control-mode'?'hands':'', checked:false, textContent:'', tagName:'DIV', disabled:false, readyState:2, getContext:()=>context2d, addEventListener(type,fn){listeners.set(id+':'+type,fn);},blur(){},replaceChildren(){},add(){},play:async()=>{},getVideoTracks:()=>[]}); return elements.get(id); }
  const document={getElementById:element,hidden:false,addEventListener(type,fn){listeners.set('document:'+type,fn);}};
  class Hands {setOptions(){} onResults(fn){resultCallback=fn;} send(){return Promise.resolve();}}
  const storage=new Map();
  const context=vm.createContext({...physics,document,window:{Hands,addEventListener(){}},navigator:{mediaDevices:{enumerateDevices:async()=>[],getUserMedia:async()=>({getTracks:()=>[{stop(){}}],getVideoTracks:()=>[{addEventListener(){}}]})}},Option:class{},performance:{now:()=>now},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},requestAnimationFrame(){},console});
  const source=fs.readFileSync(new URL('../public/main.js',import.meta.url),'utf8').replace(/^\uFEFF/,'').replace(/^import .*;\r?\n/,'');
  vm.runInContext(source+'\nthis.inspect=()=>({phase,game,calibrated,manualPause,best});this.tick=(dt,time)=>update(dt,time);this.acceptResults=()=>{inferenceGeneration=generation;};this.start=startCamera;this.resetGame=reset;this.togglePause=pause;',context);
  return { context,element,storage, async start(){await context.start();}, results(y){context.acceptResults();resultCallback({multiHandLandmarks:[Array(21).fill({y}),Array(21).fill({y})],multiHandedness:[{label:'Left'},{label:'Right'}]});},tick(dt=.02){now+=dt*1000;context.tick(dt,now);}, event(id,type){listeners.get(id+':'+type)();} };
}
test('keyboard countdown, pause/resume, game over and reset',()=>{
  const h=harness(); h.element('control-mode').value='keyboard'; h.event('control-mode','change');
  const initial=h.context.inspect().game.ball.x;
  for(let i=0;i<100;i++) h.tick(); assert.equal(h.context.inspect().game.ball.x,initial);
  for(let i=0;i<100;i++) h.tick(); assert.equal(h.context.inspect().phase,'playing');
  h.context.togglePause(); const paused=h.context.inspect().game.ball.x; for(let i=0;i<100;i++)h.tick(); assert.equal(h.context.inspect().game.ball.x,paused);
  h.context.togglePause(); assert.equal(h.context.inspect().phase,'waiting');
  for(let i=0;i<2000;i++)h.tick(); assert.equal(h.context.inspect().phase,'over'); assert.equal(h.context.inspect().game.lives,0);
  h.context.resetGame(); assert.equal(h.context.inspect().game.lives,3); assert.equal(h.context.inspect().game.score,0);
});
test('calibration requires hand range, tracking loss freezes and recovery counts down',async()=>{
  const h=harness(); await h.start(); assert.equal(h.context.inspect().phase,'calibrating');
  for(let i=0;i<210;i++){h.results(.5);h.tick();} assert.equal(h.context.inspect().calibrated,false);
  for(let i=0;i<210;i++){h.results(i%40<20?.2:.8);h.tick();} assert.equal(h.context.inspect().calibrated,true);
  for(let i=0;i<190;i++){h.results(.5);h.tick();} assert.equal(h.context.inspect().phase,'playing');
  for(let i=0;i<30;i++)h.tick(); assert.equal(h.context.inspect().phase,'waiting');
  const x=h.context.inspect().game.ball.x, lives=h.context.inspect().game.lives;
  for(let i=0;i<200;i++)h.tick(); assert.equal(h.context.inspect().game.ball.x,x); assert.equal(h.context.inspect().game.lives,lives);
  for(let i=0;i<40;i++){h.results(.5);h.tick();} assert.equal(h.context.inspect().phase,'countdown');
});
test('hits save the best score; preview toggle works',()=>{
  const h=harness(); h.element('control-mode').value='keyboard';h.event('control-mode','change');for(let i=0;i<190;i++)h.tick();
  const g=h.context.inspect().game;g.ball={x:85,y:360,vx:-560,vy:0,r:12};h.tick();assert.equal(h.storage.get('hand-pong-best'),'1');
  h.context.resetGame();assert.equal(h.context.inspect().best,1);
  h.element('preview').checked=false;h.event('preview','change');assert.equal(h.element('video').hidden,true);
});

