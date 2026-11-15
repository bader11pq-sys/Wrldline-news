const TOPICS = new Set(['general','correction','copyright','sponsorship','privacy','technical']);
export function validateContact(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const allowed = new Set(['name','email','topic','message','page_path','website','consent']);
  if (Object.keys(input).some(key => !allowed.has(key))) return null;
  if (typeof input.website !== 'undefined' && typeof input.website !== 'string') return null;
  if (input.website) return null;
  if (input.consent !== true) return null;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  const topic = input.topic;
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (message.length < 10 || message.length > 5000 || /[\u0000\u0008\u000b\u000c\u001b]/.test(message)) return null;
  if (!TOPICS.has(topic)) return null;
  const page = typeof input.page_path === 'string' ? input.page_path : '/contact.html';
  if (!/^\/[a-zA-Z0-9/_\-.]*$/.test(page) || page.length > 200 || page.includes('..') || page.startsWith('//')) return null;
  return {name,email,topic,message,page_path:page,status:'new'};
}
