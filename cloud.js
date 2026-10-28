'use strict';
/*
 * Supabase integration. All workspace writes use an atomic PostgreSQL RPC.
 * The publishable key is public. Security is enforced by the SQL RLS policies.
 * The SDK is only loaded if a Vercel project has Supabase URL + publishable key configured.
 */
window.ASMCloud = (() => {
  const state = {enabled:false,loading:true,resolving:false,syncing:false,lastSyncedAt:null,ready:false,user:null,workspace:null,role:null,revision:0,members:[],error:null};
  let client=null, listener=()=>{}, pendingWorkspaceLoad=null;
  function setUser(user){
    if(state.user?.id!==user?.id){
      state.workspace=null;state.role=null;state.ready=false;state.members=[];state.revision=0;
      state.lastSyncedAt=null;state.syncing=false;state.error=null;
    }
    state.user=user;
  }
  const changed=data=>listener(data);
  const message = error => error?.message || 'Bilinmeyen bir hata oluştu';
  const empty = () => ({doctors:[],expenses:[],transfers:[],allowances:[]});

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
      if(!response.ok)throw new Error('Bağlantı kurulamadı. İnternet bağlantınızı kontrol ederek yeniden deneyin.');
      const config=await response.json();
      if(!config.enabled)return;
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
        setUser(result.data?.user||null);
      } else setUser(null);
      if(state.user)await loadWorkspace();
      client.auth.onAuthStateChange((event,session)=>{
        // Avoid querying Supabase from inside an onAuthStateChange callback.
        if(event==='SIGNED_OUT'){
          setUser(null);state.resolving=false;changed();
        } else if ((event==='SIGNED_IN'||event==='USER_UPDATED') && session?.user?.id!==state.user?.id){
          setUser(session.user);
          Promise.resolve().then(()=>loadWorkspace()).catch(e=>{state.error=message(e);changed()});
        }
      });
    } catch(error) {state.error=message(error);}
    finally {state.loading=false;changed();}
  }

  function loadWorkspace() {
    if(!client||!state.user)return Promise.resolve(null);
    // Avoid two overlapping requests when Supabase emits SIGNED_IN during login.
    if(pendingWorkspaceLoad)return pendingWorkspaceLoad;
    const userId=state.user.id;
    const previouslyReady=state.ready;
    const previousWorkspace=state.workspace?.id;
    if(!state.ready){state.resolving=true;changed();}
    else state.syncing=true;
    const request=(async()=>{
      let loadedData=null;
      try {
        const {data,error}=await client.from('asm_members')
          .select('workspace_id,role,asm_workspaces(name)').eq('user_id',userId);
        if(error)throw error;
        if(state.user?.id!==userId)return null;
        const preferred=localStorage.getItem('asm-workspace-preferred');
        const membership=(data||[]).find(m=>m.workspace_id===preferred)||data?.[0];
        if(!membership){
          state.workspace=null;state.role=null;state.ready=false;state.members=[];state.revision=0;state.error=null;
          return null;
        }
        const workspace={id:membership.workspace_id,name:membership.asm_workspaces?.name||'ASM'};
        const {data:ledger,error:loadErr}=await client.from('asm_ledgers')
          .select('content,revision').eq('workspace_id',workspace.id).single();
        if(loadErr)throw loadErr;
        if(state.user?.id!==userId)return null;
        const latestData=ledger.content||empty();
        const changedRevision=!previouslyReady||previousWorkspace!==workspace.id||state.revision!==ledger.revision;
        loadedData=changedRevision?latestData:null;
        state.workspace=workspace;
        state.role=membership.role;
        state.revision=ledger.revision;
        state.ready=true;
        state.error=null;
        state.lastSyncedAt=Date.now();
        localStorage.setItem('asm-workspace-preferred',workspace.id);
        return loadedData;
      }catch(error){
        if(state.user?.id===userId)state.error=message(error);
        throw error;
      }finally{
        if(state.user?.id===userId){
          state.resolving=false;
          state.syncing=false;
          // A no-change background check must not repaint the interface.
          if(loadedData!==null||!previouslyReady||state.error||!state.workspace)changed(loadedData);
        }
      }
    })();
    pendingWorkspaceLoad=request.finally(()=>{pendingWorkspaceLoad=null;});
    return pendingWorkspaceLoad;
  }

  async function login(email,password) {
    if(!client)throw new Error('Bulut hizmeti henüz yapılandırılmadı');
    const {data,error}=await client.auth.signInWithPassword({email,password});
    if(error)throw error;
    setUser(data.user);
    await loadWorkspace();
  }
  async function register(email,password) {
    if(!client)throw new Error('Bulut hizmeti henüz yapılandırılmadı');
    const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});
    if(error)throw error;
    if(data.session){setUser(data.user);await loadWorkspace();}
    return Boolean(data.session);
  }
  async function logout(){
    if(!client)return;
    const {error}=await client.auth.signOut();
    if(error)throw error;
    setUser(null);state.resolving=false;changed();
  }
  async function createWorkspace(name){
    const {error}=await client.rpc('asm_create_workspace',{p_name:name});
    if(error)throw error;
    await loadWorkspace();
  }
  async function saveLedger(data,expectedRevision=state.revision){
    if(!client||!state.ready||!state.workspace)throw new Error('ASM bulut bağlantısı aktif değil');
    const {data:rev,error}=await client.rpc('asm_save_ledger',{
      p_workspace:state.workspace.id,p_expected_revision:expectedRevision,p_content:data
    });
    if(error)throw error;
    state.revision=rev;
    state.error=null;
    state.lastSyncedAt=Date.now();
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
