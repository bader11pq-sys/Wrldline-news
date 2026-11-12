import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":Deno.env.get("SITE_URL")||"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return reply({error:"Method not allowed"},405);
try{
 const auth=req.headers.get("Authorization");if(!auth?.startsWith("Bearer "))return reply({error:"Authentication required"},401);
 const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});const {data:{user},error:authError}=await userClient.auth.getUser();if(authError||!user)return reply({error:"Invalid session"},401);
 const {cycle}=await req.json();const priceId=cycle==="monthly"?Deno.env.get("STRIPE_PRICE_ID_MONTHLY"):cycle==="yearly"?Deno.env.get("STRIPE_PRICE_ID_YEARLY"):null;if(!priceId)return reply({error:"خطة الدفع غير مهيأة. أضف Stripe Price ID إلى أسرار Edge Functions."},503);
 const admin=createClient(url,service);const {data:existing}=await admin.from("subscriptions").select("stripe_customer_id").eq("user_id",user.id).maybeSingle();
 const stripe=new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!,{apiVersion:"2025-02-24.acacia"});
 const customer=existing?.stripe_customer_id?{id:existing.stripe_customer_id}:await stripe.customers.create({email:user.email,metadata:{supabase_user_id:user.id}});
 const {error:saveError}=await admin.from("subscriptions").upsert({user_id:user.id,stripe_customer_id:customer.id},{onConflict:"user_id"});if(saveError)throw saveError;
 const site=(Deno.env.get("SITE_URL")||"https://al-ghaib.us.ci").replace(/\/$/,"");
 const checkout=await stripe.checkout.sessions.create({mode:"subscription",customer:customer.id,line_items:[{price:priceId,quantity:1}],client_reference_id:user.id,metadata:{supabase_user_id:user.id,plan:"plus"},subscription_data:{metadata:{supabase_user_id:user.id,plan:"plus"}},success_url:site+"/account.html?checkout=success",cancel_url:site+"/account.html?checkout=cancelled"});
 return reply({url:checkout.url});
}catch(error){console.error("checkout:",error);return reply({error:error instanceof Error?error.message:"Checkout failed"},500);}
});