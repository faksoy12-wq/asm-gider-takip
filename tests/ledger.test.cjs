const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const source=readFileSync(__dirname+'/../app.js','utf8').split("$('#account').onclick=")[0];
function testContext(body){
  const sandbox={localStorage:{getItem:()=>null},window:{ASMCloud:{status:()=>({enabled:false,ready:false})}},console,Date};
  return runInNewContext(source+'\n'+body,sandbox);
}
test('4 physicians share expenses with correct minimal transfers',()=>{
  const result=testContext(`
    db={doctors:['Ahmet','Ayse','Mehmet','Zeynep'].map(name=>({id:name,name})),expenses:[
      {id:'e1',date:'2026-10-28',amount:2000000,method:'equal',participants:['Ahmet','Ayse','Mehmet','Zeynep'],paidBy:'Ahmet',description:'',category:'Elektrik'},
      {id:'e2',date:'2026-10-28',amount:1000000,method:'equal',participants:['Ahmet','Ayse','Mehmet','Zeynep'],paidBy:'Ayse',description:'',category:'Su'},
      {id:'e3',date:'2026-10-28',amount:600000,method:'equal',participants:['Ahmet','Ayse','Mehmet','Zeynep'],paidBy:'Mehmet',description:'',category:'Temizlik'},
      {id:'e4',date:'2026-10-28',amount:400000,method:'equal',participants:['Ahmet','Ayse','Mehmet','Zeynep'],paidBy:'Zeynep',description:'',category:'Sarf'}],transfers:[]};month='2026-10';
    ({balances:balances(),transfers:transfers()})
  `);
  assert.equal(result.balances.Ahmet,1000000);
  assert.equal(result.balances.Ayse,0);
  assert.equal(result.balances.Mehmet,-400000);
  assert.equal(result.balances.Zeynep,-600000);
  assert.equal(result.transfers.length,2);
  assert.equal(result.transfers.reduce((s,t)=>s+t.amount,0),1000000);
});
test('percentage shares always total exactly one expense in kuruş',()=>{
  const result=testContext(`split({amount:100,method:'custom',participants:['a','b','c'],percentages:{a:33.33,b:33.33,c:33.34}})`);
  assert.equal(Object.values(result).reduce((a,b)=>a+b,0),100);
});
test('Turkish decimal and thousands formatting',()=>{
  const result=testContext(`[parseAmount('8.400,00'),parseAmount('8.400'),parseAmount('8400,50'),parseAmount('12,345')]`);
  assert.equal(result[0],840000);assert.equal(result[1],840000);assert.equal(result[2],840050);
  assert.ok(Number.isNaN(result[3]));
});
