const $=s=>document.querySelector(s);
let mode="register",token=localStorage.getItem("tw_token")||"";
function showAuth(m){mode=m;$("#modalTitle").textContent=m==="register"?"Create your account":"Welcome back";$("#submitAuth").textContent=m==="register"?"Create account":"Log in";$("#switchAuth").textContent=m==="register"?"Already have an account? Log in":"New here? Create an account";$("#authMessage").textContent="";$("#modal").classList.remove("hidden")}
$("#openLogin").onclick=()=>showAuth("login");$("#openRegister").onclick=()=>showAuth("register");
$("#startPractice").onclick=()=>token?$("#markets").scrollIntoView({behavior:"smooth"}):showAuth("register");
$("#close").onclick=()=>$("#modal").classList.add("hidden");
$("#modal").onclick=e=>{if(e.target===$("#modal"))$("#modal").classList.add("hidden")};
$("#switchAuth").onclick=()=>showAuth(mode==="register"?"login":"register");
$("#authForm").onsubmit=async e=>{e.preventDefault();$("#submitAuth").disabled=true;$("#authMessage").textContent="Please wait…";try{const r=await fetch(`/api/auth/${mode}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("#email").value,password:$("#password").value})});const d=await r.json();if(!r.ok)throw Error(d.error||"Request failed");token=d.token;localStorage.setItem("tw_token",token);$("#authMessage").textContent=`Signed in as ${d.user.email}.`;$("#openLogin").textContent="My account";setTimeout(()=>$("#modal").classList.add("hidden"),600)}catch(err){$("#authMessage").textContent=err.message}finally{$("#submitAuth").disabled=false}};
$("#market").onchange=e=>$("#marketHeading").textContent=e.target.value+" · DEMO";
async function trade(dir){const n=Number($("#stake").value),out=$("#result");if(!Number.isFinite(n)||n<1||n>1000){out.textContent="Enter a virtual stake between $1 and $1,000.";return}out.textContent="Simulating…";await new Promise(r=>setTimeout(r,400));const win=Math.random()>.42;out.innerHTML=`<b style="color:${win?"#35d6a1":"#ff6681"}">${win?"SIMULATED WIN":"SIMULATED LOSS"}</b><br>${dir} · ${$("#market").value} · ${$("#contract").value}<br>${win?"+":"−"}$${(n*(win?.8:1)).toFixed(2)} illustrative result<br><small>Random demo result only; no money or account balance changed.</small>`}
$("#rise").onclick=()=>trade("Rise");$("#fall").onclick=()=>trade("Fall");
