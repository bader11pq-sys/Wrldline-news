import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const stripe=new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!,{apiVersion:"2025-02-24.acacia"});
const cryptoProvider=Stripe.createSubtleCryptoProvider();
Deno.serve(async req=>{if(req.method!=="POST")return new Response("Method not allowed",{status:405});const signature=req.headers.get("Stripe-Signature");if(!signature)return new Response("Missing signature",{status:400});
try{const raw=await req.text();const event=await stripe.webhooks.constructEventAsync(raw,signature,Deno.env.get("STRIPE_WEBHOOK_SECRET")!,undefined,cryptoProvider);const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const sync=async(subscription:Stripe.Subscription,customerId:string,userId?:string)=>{const resolvedUser=userId||subscription.metadata.supabase_user_id;if(!resolvedUser)throw new Error("Subscription missing Supabase user metadata");const item=subscription.items.data[0];const active=["active","trialing"].includes(subscription.status);await db.from("subscriptions").upsert({user_id:resolvedUser,stripe_customer_id:customerId,stripe_subscription_id:subscription.id,stripe_price_id:item?.price.id||null,plan:active?"plus":"free",status:subscription.status,current_period_end:item?.current_period_end?new Date(item.current_period_end*1000).toISOString():null,cancel_at_period_end:subscription.cancel_at_period_end,updated_at:new Date().toISOString()},{onConflict:"user_id"}).throwOnError();};
switch(event.type){
case "checkout.session.completed":{const s=event.data.object as Stripe.Checkout.Session;if(s.mode==="subscription"&&typeof s.subscription==="string"){const sub=await stripe.subscriptions.retrieve(s.subscription);await sync(sub,String(s.customer),s.client_reference_id||s.metadata?.supabase_user_id||undefined);}break;}
case "customer.subscription.created":case "customer.subscription.updated":case "customer.subscription.deleted":{const s=event.data.object as Stripe.Subscription;await sync(s,String(s.customer));break;}
default:break;
}
return new Response(JSON.stringify({received:true}),{headers:{"Content-Type":"application/json"}});
}catch(error){console.error("stripe webhook:",error);return new Response("Webhook signature or processing error",{status:400});}
});