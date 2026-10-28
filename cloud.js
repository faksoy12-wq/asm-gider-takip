'use strict';
/*
 * Supabase integration. All workspace writes use an atomic PostgreSQL RPC.
 * The publishable key is public. Security is enforced by the SQL RLS policies.
 * The SDK is only loaded if a Vercel project has Supabase URL + publishable key configured.
 */
window.ASMCloud = (() => {
  const state = {enabled:false,loading:true,ready:false,user:null,workspace:null,role:null,revision:0,members:[],error:null};
  let client=null, listener=()=>{};
  const changed=()=>listener();
  const message = error => error?.message || 'Bilinmeyen bir hata oluştu';
  const empty = () => ({doctors:[],expenses:[],transfers:[]});

  async function loadSDK() {
    if(window.supabase?.createClient) return;
    await new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload=resolve;script.onerror=()=>reject(new Error('Güvenli giriş kütüphanesi yüklenemedi; bağlantınızı kontrol edin.'));
      document.head.appendChild(script);
    });
    if(!window.supabase?.createClient)throw new Error('Supabase istemcisi başlatılamadı');
  }

  async function init(onChange) {
    listener=onChange;
    try {
      const response=await fetch('/api/public-config',{cache:'no-store'});
      if(!response.ok){state.loading=false;changed();return;}
      const config=await response.json();
      if(!config.enabled){state.loading=false;changed();return;}
      state.enabled=true;
      await loadSDK();
      client=window.supabase.createClient(config.url,config.publishableKey,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
      });
      const sessionResult=await client.auth.getSession();
      if(sessionResult.error)throw sessionResult.error;
      if(sessionResult.data?.session){
        const result=await client.auth.getUser();
        if(result.error)throw result.error;
        state.user=result.data?.user||null;
      } else state.user=null;
      if(state.user)await loadWorkspace();
      client.auth.onAuthStateChange((event,session)=>{
        // Avoid querying Supabase from inside an onAuthStateChange callback.
        if(event==='SIGNED_OUT'){
          state.user=null;state.workspace=null;state.ready=false;state.members=[];state.revision=0;changed();
        } else if ((event==='SIGNED_IN'||event==='USER_UPDATED') && session?.user?.id!==state.user?.id){
          state.user=session.user;
          Promise.resolve().then(()=>loadWorkspace()).catch(e=>{state.error=message(e);changed()});
        }
      });
    } catch(error) {state.error=message(error);}
    finally {state.loading=false;changed();}
  }

  async function loadWorkspace() {
    if(!client||!state.user)return null;
    state.ready=false;changed();
    const {data,error}=await client.from('asm_members')
      .select('workspace_id,role,asm_workspaces(name)').eq('user_id',state.user.id);
    if(error)throw error;
    const preferred=localStorage.getItem('asm-workspace-preferred');
    const membership=(data||[]).find(m=>m.workspace_id===preferred)||data?.[0];
    if(!membership){state.workspace=null;state.members=[];state.revision=0;changed();return null;}
    state.workspace={id:membership.workspace_id,name:membership.asm_workspaces?.name||'ASM'};
    state.role=membership.role;
    localStorage.setItem('asm-workspace-preferred',state.workspace.id);
    const {data:ledger,error:loadErr}=await client.from('asm_ledgers')
      .select('content,revision').eq('workspace_id',state.workspace.id).single();
    if(loadErr)throw loadErr;
    const dataValue=ledger.content||empty();
    state.revision=ledger.revision;
    state.ready=true;
    state.error=null;
    changed(dataValue);
    return dataValue;
  }

  async function login(email,password) {
    if(!client)throw new Error('Bulut hizmeti henüz yapılandırılmadı');
    const {data,error}=await client.auth.signInWithPassword({email,password});
    if(error)throw error;
    state.user=data.user;
    await loadWorkspace();
  }
  async function register(email,password) {
    if(!client)throw new Error('Bulut hizmeti henüz yapılandırılmadı');
    const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});
    if(error)throw error;
    if(data.session){state.user=data.user;await loadWorkspace();}
    return Boolean(data.session);
  }
  async function logout(){
    if(!client)return;
    const {error}=await client.auth.signOut();
    if(error)throw error;
    state.user=null;state.workspace=null;state.role=null;state.ready=false;state.members=[];changed();
  }
  async function createWorkspace(name){
    const {error}=await client.rpc('asm_create_workspace',{p_name:name});
    if(error)throw error;
    await loadWorkspace();
  }
  async function saveLedger(data){
    if(!client||!state.ready||!state.workspace)throw new Error('ASM bulut bağlantısı aktif değil');
    const {data:rev,error}=await client.rpc('asm_save_ledger',{
      p_workspace:state.workspace.id,p_expected_revision:state.revision,p_content:data
    });
    if(error)throw error;
    state.revision=rev;
    changed();
  }
  async function listMembers(){
    if(!state.workspace)return [];
    const {data,error}=await client.from('asm_members').select('user_id,email,role,created_at')
      .eq('workspace_id',state.workspace.id).order('created_at');
    if(error)throw error;
    state.members=data||[];changed();return state.members;
  }
  async function addMember(email){
    const {error}=await client.rpc('asm_add_member_by_email',{
      p_workspace:state.workspace.id,p_email:email
    });
    if(error)throw error;
    await listMembers();
  }
  async function removeMember(userId){
    const {error}=await client.rpc('asm_remove_member',{
      p_workspace:state.workspace.id,p_user:userId
    });
    if(error)throw error;
    await listMembers();
  }
  async function refresh(){return loadWorkspace();}
  function status(){return {...state,members:state.members.slice()};}
  return {init,status,login,register,logout,createWorkspace,saveLedger,listMembers,addMember,removeMember,refresh};
})();
