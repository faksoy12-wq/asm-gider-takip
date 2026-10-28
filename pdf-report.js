'use strict';
/*
 * PDF reports are generated locally in the browser. Expense data never reaches
 * the PDF library CDN; only public library scripts are downloaded.
 * A pinned pdfmake build embeds Roboto fonts so Turkish characters are supported.
 */
window.ASMPDF=(()=>{
  const PDFMAKE_CDN='https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/';
  let pending;
  function addScript(url){
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=url;
      script.async=true;
      script.onload=resolve;
      script.onerror=()=>reject(new Error('PDF kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.'));
      document.head.appendChild(script);
    });
  }
  function preload(){
    if(!pending){
      pending=(async()=>{
        if(!window.pdfMake?.createPdf)await addScript(PDFMAKE_CDN+'pdfmake.min.js');
        if(!window.pdfMake?.vfs?.['Roboto-Regular.ttf'])await addScript(PDFMAKE_CDN+'vfs_fonts.js');
        if(!window.pdfMake?.createPdf||!window.pdfMake?.vfs?.['Roboto-Regular.ttf']){
          throw new Error('PDF yazı tipleri yüklenemedi.');
        }
        return window.pdfMake;
      })().catch(error=>{pending=null;throw error;});
    }
    return pending;
  }
  const MONTHS=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const formatMoney=k => (Number(k||0)/100).toLocaleString('tr-TR',{
    minimumFractionDigits:2,maximumFractionDigits:2
  })+' ₺';
  const formatDate=s=>{
    const [y,m,d]=String(s||'').split('-');
    return y&&m&&d?d+'.'+m+'.'+y:String(s||'');
  };
  function reportDefinition(report){
    const doctors=new Map(report.doctors.map(d=>[d.id,d.name]));
    const name=id=>doctors.get(id)||'Bilinmeyen hekim';
    const expenses=[...report.expenses].sort((a,b)=>a.date.localeCompare(b.date)||a.category.localeCompare(b.category,'tr'));
    const totals=expenses.reduce((s,e)=>s+e.amount,0);
    const [year,month]=report.month.split('-');
    const titleMonth=(MONTHS[Number(month)-1]||month)+' '+year;
    const issued=new Date().toLocaleDateString('tr-TR');
    const byCategory=new Map();
    for(const e of expenses)byCategory.set(e.category,(byCategory.get(e.category)||0)+e.amount);
    const categories=[...byCategory.entries()].sort((a,b)=>b[1]-a[1]);
    const tableBody=[[
      {text:'TARİH',style:'tableHead'},
      {text:'KATEGORİ',style:'tableHead'},
      {text:'ÖDEYEN HEKİM',style:'tableHead'},
      {text:'TUTAR',style:'tableHead',alignment:'right'}
    ]];
    for(const [i,e] of expenses.entries()){
      const fill=i%2===0?'#f4f9f8':'#ffffff';
      tableBody.push([
        {text:formatDate(e.date),style:'cell',fillColor:fill,noWrap:true},
        {text:String(e.category),style:'cell',fillColor:fill},
        {text:name(e.paidBy),style:'cell',fillColor:fill},
        {text:formatMoney(e.amount),style:'cell',fillColor:fill,alignment:'right',bold:true,color:'#1d635b'}
      ]);
      const description=String(e.description||'').trim();
      const participants=e.participants.map(name).join(', ');
      const share=e.method==='custom'?'Yüzdesel paylaşım':'Eşit paylaşım';
      tableBody.push([
        {text:[
          {text:description?(description+'  ·  '):'',color:'#435a68'},
          {text:share+'  ·  '+participants,color:'#708391'}
        ],fontSize:8,colSpan:4,fillColor:fill,margin:[7,0,7,9]},
        {},{},{}
      ]);
    }
    const content=[
      {columns:[
        {stack:[
          {text:'ASM  /  GİDER TAKİP',fontSize:9,bold:true,color:'#178075',characterSpacing:1.2},
          {text:'Aylık Gider Raporu',fontSize:20,bold:true,color:'#203b4b',margin:[0,8,0,0]}
        ]},
        {stack:[
          {text:titleMonth,bold:true,fontSize:12,alignment:'right',color:'#116a64'},
          {text:'Oluşturulma: '+issued,fontSize:8,alignment:'right',color:'#788b99',margin:[0,6,0,0]}
        ],width:155}
      ],margin:[0,0,0,16]},
      {text:report.workspaceName,style:'workspace',margin:[0,0,0,16]},
      {table:{widths:['*','*'],body:[[
        {stack:[{text:'TOPLAM GİDER',style:'summaryLabel'},{text:formatMoney(totals),style:'summaryNumber'}],fillColor:'#e9f5f1',margin:[11,10,11,10]},
        {stack:[{text:'GİDER KAYDI',style:'summaryLabel'},{text:String(expenses.length),style:'summaryNumber'}],fillColor:'#e9f5f1',margin:[11,10,11,10]}
      ]]},layout:'noBorders',margin:[0,0,0,20]},
      {text:'Gider Dökümü',fontSize:13,bold:true,color:'#203b4b',margin:[0,0,0,9]},
      {table:{
        headerRows:1,
        widths:[69,100,'*',92],
        body:tableBody
      },layout:{
        hLineWidth:()=>0,vLineWidth:()=>0,
        paddingLeft:()=>0,paddingRight:()=>0,
        paddingTop:()=>0,paddingBottom:()=>0
      },margin:[0,0,0,17]}
    ];
    if(categories.length){
      content.push(
        {text:'Kategori Özeti',fontSize:12,bold:true,color:'#203b4b',margin:[0,4,0,7]},
        {table:{widths:['*',95],body:categories.map(([category,total])=>[
          {text:category,fontSize:9,margin:[6,5,5,5],color:'#415768'},
          {text:formatMoney(total),fontSize:9,alignment:'right',margin:[5,5,6,5],bold:true,color:'#116a64'}
        ])},layout:{
          hLineWidth:i=>i===0?0:.4,vLineWidth:()=>0,
          hLineColor:()=> '#e3ebed'
        }}
      );
    }
    content.push({text:'Bilgi: Bu rapor, seçilen ay için kayıtlı harcamaları gösterir. Banka dekontu veya resmî muhasebe belgesi değildir.',fontSize:8,color:'#82919d',margin:[0,18,0,0]});
    return {
      info:{title:'ASM Gider Takip - '+titleMonth+' Gider Raporu',author:'ASM Gider Takip'},
      pageSize:'A4',pageMargins:[32,39,32,48],
      content,
      defaultStyle:{font:'Roboto',fontSize:9,lineHeight:1.25},
      styles:{
        workspace:{fontSize:10,color:'#536e76',bold:true},
        summaryLabel:{fontSize:8,bold:true,color:'#538479',characterSpacing:.7},
        summaryNumber:{fontSize:19,bold:true,color:'#145d56',margin:[0,6,0,0]},
        tableHead:{bold:true,fontSize:8,color:'#ffffff',fillColor:'#16766e',margin:[7,9,7,9]},
        cell:{fontSize:9,margin:[7,9,7,3],color:'#314c5b'}
      },
      footer:(current,pageCount)=>({columns:[
        {text:'Geliştiren Dr. Furkan Aksoy',color:'#8c9aa4'},
        {text:current+' / '+pageCount,alignment:'right',color:'#8c9aa4'}
      ],margin:[32,14,32,0],fontSize:8})
    };
  }
  function downloadFile(blob,name){
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download=name;
    document.body.appendChild(anchor);
    anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function share(report){
    if(!report||!Array.isArray(report.expenses)||!report.expenses.length){
      throw new Error('Bu ay için gider kaydı bulunmuyor.');
    }
    const pdfMake=await preload();
    const documentDefinition=reportDefinition(report);
    const pdf=pdfMake.createPdf(documentDefinition);
    const blob=await new Promise((resolve,reject)=>{
      try{pdf.getBlob(resolve);}catch(error){reject(error);}
    });
    if(!blob||blob.type!=='application/pdf')throw new Error('PDF dosyası oluşturulamadı.');
    const filename='ASM-Gider-Raporu-'+report.month+'.pdf';
    const file=new File([blob],filename,{type:'application/pdf'});
    if(typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[file]})){
      try{
        await navigator.share({
          files:[file],
          title:'ASM Gider Takip - Aylık Gider Raporu',
          text:report.month+' aylık gider raporu'
        });
        return 'shared';
      }catch(error){
        if(error?.name==='AbortError')return 'cancelled';
        // Missing transient user activation or unsupported share sheet: download PDF.
      }
    }
    downloadFile(blob,filename);
    return 'downloaded';
  }
  return {preload,share,reportDefinition};
})();
