/* Shared, minimal forms transport for WRLDLINE. Only the public publishable key is used. */
(function(){
  const SUPABASE_URL="https://vmaxbnogmmfyrcucapnq.supabase.co";
  const SUPABASE_KEY="sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  async function insert(table,payload){
    const response=await fetch(SUPABASE_URL+"/rest/v1/"+table,{method:"POST",headers:{apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify(payload)});
    if(!response.ok){let detail="";try{detail=(await response.json())?.message||"";}catch{}throw new Error(detail||("HTTP "+response.status));}
    return true;
  }
  window.WRLDLINE_FORMS={insert};
  const contact=document.getElementById("contactForm");
  if(contact){
    contact.addEventListener("submit",async event=>{
      event.preventDefault();const status=document.getElementById("contactStatus"),button=contact.querySelector("button[type=submit]");
      if(contact.querySelector("[name=website]")?.value){status.textContent="تعذر إرسال الرسالة.";status.className="form-status error";return;}
      if(!contact.reportValidity())return;
      button.disabled=true;status.textContent="جارٍ إرسال الرسالة...";status.className="form-status";
      try{
        await insert("contact_messages",{name:contact.elements.namedItem("name").value.trim(),email:contact.elements.namedItem("email").value.trim(),topic:contact.elements.namedItem("topic").value,message:contact.elements.namedItem("message").value.trim(),page_path:location.pathname});
        if(contact.elements.namedItem("topic").value==="sponsorship")window.WRLDLINE_ANALYTICS?.track("sponsor_contact",{plan:"sponsorship"});
        contact.reset();status.textContent="وصلت رسالتك. سنراجعها وفق أولوية الموضوع؛ لا ترسل معلومات سرية أو بطاقات دفع.";status.className="form-status ok";
      }catch(error){console.warn("WRLDLINE contact:",error);status.textContent="تعذر إرسال الرسالة الآن. حاول لاحقًا أو استخدم البريد المنشور في صفحة التواصل.";status.className="form-status error";}
      finally{button.disabled=false;}
    });
  }
  const newsletter=document.getElementById("newsletterForm");
  if(newsletter){
    newsletter.addEventListener("submit",async event=>{
      event.preventDefault();const status=document.getElementById("newsletterStatus"),button=newsletter.querySelector("button[type=submit]");
      if(newsletter.querySelector("[name=website]")?.value){status.textContent="تعذر التسجيل.";status.className="form-status error";return;}
      if(!newsletter.reportValidity())return;
      button.disabled=true;status.textContent="جارٍ تسجيل الاهتمام...";status.className="form-status";
      try{
        await insert("newsletter_subscribers",{email:newsletter.elements.namedItem("email").value.trim(),locale:document.documentElement.lang||"ar",source:"site"});
        window.WRLDLINE_ANALYTICS?.track("newsletter_signup",{plan:"newsletter"});
        newsletter.reset();status.textContent="سُجّل اهتمامك بالنشرة. لا نرسل رسائل دورية حتى يتم تفعيل خدمة الإرسال، ويمكنك طلب الحذف لاحقًا.";status.className="form-status ok";
      }catch(error){console.warn("WRLDLINE newsletter:",error);status.textContent="هذا البريد مسجل مسبقًا أو تعذر الحفظ الآن. إن كنت سجلت سابقًا فلا حاجة لإعادة المحاولة.";status.className="form-status";}
      finally{button.disabled=false;}
    });
  }
})();
