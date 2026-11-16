import "dotenv/config";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db, { initialize, seedData } from "./mysql.js";

const app = express();
const PORT = process.env.PORT || 4000;
const SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const ACTIVE_RIDER_STATUSES = ["Accepted", "Picked Up", "On the Way"];
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
for (const method of ["get", "post", "patch", "delete"]) {
  const register = app[method].bind(app);
  app[method] = (path, ...handlers) => register(path, ...handlers.map(asyncHandler));
}

async function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  let user;
  try {
    if (!token) throw new Error("Missing token");
    user = jwt.verify(token, SECRET);
  } catch { res.status(401).json({ error: "Please sign in again." }); }
  if (!user) return;
  const account = await db.prepare("SELECT suspended FROM users WHERE id=?").get(user.id);
  if (!account) return res.status(401).json({ error: "Please sign in again." });
  if (account.suspended) return res.status(403).json({ error: "This account is suspended. Contact an administrator.", code: "ACCOUNT_SUSPENDED" });
  req.user = user;
  next();
}
function allow(...roles) {
  return async (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "You do not have permission for this action." });
    if (req.user.role === "rider") {
      const rider = await db.prepare("SELECT verified FROM users WHERE id=?").get(req.user.id);
      if (!rider?.verified) return res.status(403).json({ error: "Your rider account is waiting for admin verification." });
    }
    next();
  };
}
function issueToken(user) {
  return jwt.sign({ id:user.id,name:user.name,email:user.email,role:user.role },SECRET,{expiresIn:"7d"});
}
function parseContact(value) {
  const raw=String(value||"").trim();
  if(/^\S+@\S+\.\S+$/.test(raw))return{type:"email",value:raw.toLowerCase()};
  const phone=raw.replace(/[\s()-]/g,"");
  if(/^\+?\d{8,15}$/.test(phone))return{type:"phone",value:phone};
  return null;
}
async function findUserByContact(contact) {
  return await db.prepare("SELECT * FROM users WHERE lower(email)=? OR phone=?").get(contact,contact);
}
function otpDigest(id,code) {
  return createHmac("sha256",SECRET).update(`${id}:${code}`).digest("hex");
}
function safeUser(user) {
  return {id:user.id,name:user.name,email:user.email,role:user.role};
}
async function findActiveCoupon(code) {
  const coupon=await db.prepare("SELECT * FROM coupons WHERE code=? AND active=1").get(code);
  if(!coupon||(coupon.expires_at&&(!Number.isFinite(Date.parse(coupon.expires_at))||Date.parse(coupon.expires_at)<=Date.now()))||(coupon.max_uses>0&&coupon.uses_count>=coupon.max_uses))return null;
  return coupon;
}
async function findActiveRiderOrder(orderId, riderId) {
  return db.prepare(
    "SELECT id,status FROM orders WHERE id=? AND rider_id=? AND status IN ('Accepted','Picked Up','On the Way')",
  ).get(orderId, riderId);
}
app.get("/api/health",async (_,res)=>res.json({ok:true,name:"ShopEase Cebu Go API"}));
app.post("/api/auth/otp/send",async (req,res)=>{
 const purpose=String(req.body?.purpose||"");
 const parsed=parseContact(req.body?.contact);
 if(!["login","signup","reset"].includes(purpose)||!parsed)return res.status(400).json({error:"Enter a valid phone number or email address."});
 if(process.env.NODE_ENV==="production")return res.status(503).json({error:"OTP delivery is not configured. Set up an SMS or email provider before production use."});
 const user=await findUserByContact(parsed.value);
 if(purpose==="signup"&&user)return res.status(409).json({error:"That phone number or email is already registered."});
 if(purpose!=="signup"&&!user)return res.status(404).json({error:"No account matches that phone number or email."});
 const now=Date.now();
 const recent=await db.prepare("SELECT created_at FROM auth_otps WHERE contact=? AND purpose=? ORDER BY created_at DESC LIMIT 1").get(parsed.value,purpose);
 if(recent&&now-recent.created_at<OTP_COOLDOWN_MS)return res.status(429).json({error:"Please wait before requesting another code.",retryAfterSeconds:Math.ceil((OTP_COOLDOWN_MS-(now-recent.created_at))/1000)});
 await db.prepare("UPDATE auth_otps SET used_at=? WHERE contact=? AND purpose=? AND used_at IS NULL").run(now,parsed.value,purpose);
 const id=randomUUID(),code=String(randomInt(100000,1000000));
 await db.prepare("INSERT INTO auth_otps(id,contact,purpose,code_hash,created_at,expires_at) VALUES (?,?,?,?,?,?)")
   .run(id,parsed.value,purpose,otpDigest(id,code),now,now+OTP_TTL_MS);
 res.json({challengeId:id,expiresInSeconds:OTP_TTL_MS/1000,demoCode:code,message:"Demo mode: no SMS or email was sent."});
});
app.post("/api/auth/otp/verify",async (req,res)=>{
 const challengeId=String(req.body?.challengeId||"");
 const code=String(req.body?.code||"");
 const row=await db.prepare("SELECT * FROM auth_otps WHERE id=?").get(challengeId);
 if(!row||row.used_at||row.expires_at<=Date.now())return res.status(400).json({error:"This code has expired. Request a new one."});
 if(row.attempts>=OTP_MAX_ATTEMPTS)return res.status(429).json({error:"Too many incorrect codes. Request a new one."});
 if(!/^\d{6}$/.test(code)||!timingSafeEqual(Buffer.from(row.code_hash,"hex"),Buffer.from(otpDigest(row.id,code),"hex"))){
   await db.prepare("UPDATE auth_otps SET attempts=attempts+1 WHERE id=?").run(row.id);
   return res.status(400).json({error:"The verification code is incorrect."});
 }
 const now=Date.now();
 if(row.purpose==="login"){
   const user=await findUserByContact(row.contact);
   if(!user)return res.status(404).json({error:"No account matches that phone number or email."});
   if(user.suspended)return res.status(403).json({error:"This account is suspended. Contact an administrator.",code:"ACCOUNT_SUSPENDED"});
   await db.prepare("UPDATE auth_otps SET verified_at=?,used_at=? WHERE id=?").run(now,now,row.id);
   const safe=safeUser(user);
   return res.json({token:issueToken(safe),user:safe});
 }
 await db.prepare("UPDATE auth_otps SET verified_at=COALESCE(verified_at,?) WHERE id=?").run(now,row.id);
 res.json({verificationId:row.id});
});
app.post("/api/auth/password/reset",async (req,res)=>{
 const verificationId=String(req.body?.verificationId||"");
 const password=req.body?.password;
 if(typeof password!=="string"||password.length<8)return res.status(400).json({error:"Choose a password with at least 8 characters."});
 const reset=db.transaction(async ()=>{
   const row=await db.prepare("SELECT * FROM auth_otps WHERE id=? AND purpose='reset' AND verified_at IS NOT NULL AND used_at IS NULL AND expires_at>?").get(verificationId,Date.now());
   if(!row)throw new Error("Verify a current OTP before resetting your password.");
   const user=await findUserByContact(row.contact);
   if(!user)throw new Error("No account matches that phone number or email.");
   await db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(bcrypt.hashSync(password,10),user.id);
   await db.prepare("UPDATE auth_otps SET used_at=? WHERE id=?").run(Date.now(),row.id);
 });
 try{await reset();res.json({ok:true,message:"Password updated. You can now sign in."})}
 catch(error){res.status(400).json({error:error.message})}
});
app.post("/api/auth/register",async (req,res)=>{
 const{name,email,phone,password,verificationId}=req.body||{};
 const role = ["customer", "rider", "merchant"].includes(req.body?.role) ? req.body.role : "customer";
 const parsedPhone=parseContact(phone),normalizedEmail=String(email||"").trim().toLowerCase();
 if(typeof name!=="string"||typeof password!=="string"||typeof verificationId!=="string"||!name.trim()||!/^\S+@\S+\.\S+$/.test(normalizedEmail)||parsedPhone?.type!=="phone"||password.length<8)return res.status(400).json({error:"Enter your name, valid email and phone number, and a password of at least 8 characters."});
 const register=db.transaction(async ()=>{
   const otp=await db.prepare("SELECT * FROM auth_otps WHERE id=? AND purpose='signup' AND verified_at IS NOT NULL AND used_at IS NULL AND expires_at>?").get(verificationId,Date.now());
   if(!otp||![normalizedEmail,parsedPhone.value].includes(otp.contact))throw new Error("Verify your current phone number or email before creating an account.");
   if(await db.prepare("SELECT 1 FROM users WHERE phone=?").get(parsedPhone.value))throw new Error("That phone number is already registered.");
   const result=await db.prepare("INSERT INTO users (name,email,phone,password_hash,role,verified) VALUES (?,?,?,?,?,?)").run(name.trim(),normalizedEmail,parsedPhone.value,bcrypt.hashSync(password,10),role,role==="customer"?1:0);
   if(role==="merchant")await db.prepare("INSERT INTO stores(owner_id,name) VALUES (?,?)").run(result.lastInsertRowid,name.trim()+"'s Store");
   await db.prepare("UPDATE auth_otps SET used_at=? WHERE id=?").run(Date.now(),otp.id);
   return await db.prepare("SELECT id,name,email,role FROM users WHERE id=?").get(result.lastInsertRowid);
 });
 try{const user=await register();res.status(201).json({token:issueToken(user),user})}
 catch(error){res.status(error.code==="ER_DUP_ENTRY"?409:400).json({error:error.code==="ER_DUP_ENTRY"?"That email or phone number is already registered.":error.message})}
});
app.post("/api/auth/login",async (req,res)=>{
 const identifier=String(req.body?.identifier||req.body?.email||"").trim();
 const user=await findUserByContact(parseContact(identifier)?.value||identifier.toLowerCase());
 if(!user||!bcrypt.compareSync(req.body?.password||"",user.password_hash))return res.status(401).json({error:"Incorrect email or password."});
 if(user.suspended)return res.status(403).json({error:"This account is suspended. Contact an administrator.",code:"ACCOUNT_SUSPENDED"});
 const safe=safeUser(user);res.json({token:issueToken(safe),user:safe})
});
app.get("/api/profile", auth, async (req,res) => {
  res.json(await db.prepare("SELECT id,name,email,role,phone,address,verified,online FROM users WHERE id=?").get(req.user.id));
});
app.patch("/api/profile", auth, async (req,res) => {
  const name=String(req.body?.name||"").trim();
  if(!name)return res.status(400).json({error:"Name is required."});
  const rawPhone=String(req.body?.phone||"").trim(),parsedPhone=rawPhone?parseContact(rawPhone):null;
  if(rawPhone&&parsedPhone?.type!=="phone")return res.status(400).json({error:"Enter a valid phone number."});
  if(parsedPhone&&await db.prepare("SELECT 1 FROM users WHERE phone=? AND id<>?").get(parsedPhone.value,req.user.id))return res.status(409).json({error:"That phone number is already registered."});
  await db.prepare("UPDATE users SET name=?,phone=?,address=? WHERE id=?").run(name.slice(0,100),parsedPhone?.value||"",String(req.body?.address||"").slice(0,300),req.user.id);
  res.json({ok:true});
});
app.get("/api/favorites", auth, async (req,res) => res.json(await db.prepare("SELECT p.* FROM favorites f JOIN products p ON p.id=f.product_id WHERE f.user_id=? AND p.active=1").all(req.user.id)));
app.post("/api/favorites/:productId", auth, async (req,res) => {
  const id=Number(req.params.productId);
  if(!Number.isInteger(id)||!await db.prepare("SELECT 1 FROM products WHERE id=? AND active=1").get(id))return res.status(404).json({error:"Product not found."});
  const exists=await db.prepare("SELECT 1 FROM favorites WHERE user_id=? AND product_id=?").get(req.user.id,id);
  if(exists)await db.prepare("DELETE FROM favorites WHERE user_id=? AND product_id=?").run(req.user.id,id);
  else await db.prepare("INSERT OR IGNORE INTO favorites(user_id,product_id) VALUES (?,?)").run(req.user.id,id);
  res.json({favorite:!exists});
});
app.get("/api/products/:id/reviews", async (req,res) => res.json(await db.prepare("SELECT r.*,u.name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.product_id=? ORDER BY r.id DESC").all(Number(req.params.id))));
app.post("/api/products/:id/reviews", auth, allow("customer"), async (req,res) => {
  const productId=Number(req.params.id);
  if(!Number.isInteger(productId)||!await db.prepare("SELECT 1 FROM products WHERE id=? AND active=1").get(productId))return res.status(404).json({error:"Product not found."});
  const rating=Number(req.body?.rating);
  if(!Number.isInteger(rating)||rating<1||rating>5)return res.status(400).json({error:"Choose a rating from 1 to 5."});
  await db.prepare("INSERT INTO reviews(user_id,product_id,rating,comment) VALUES (?,?,?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET rating=excluded.rating,comment=excluded.comment").run(req.user.id,productId,rating,String(req.body?.comment||"").slice(0,500));
  res.json({ok:true});
});
app.get("/api/notifications", auth, async (req,res) => res.json(await db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 30").all(req.user.id)));
app.get("/api/notifications/unread-count", auth, async (req,res) => {
  const result=await db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND `read`=0").get(req.user.id);
  res.json({count:result.count});
});
app.patch("/api/notifications/:id/read", auth, async (req,res) => {
  const result=await db.prepare("UPDATE notifications SET `read`=1 WHERE id=? AND user_id=?").run(Number(req.params.id),req.user.id);
  if(!result.changes)return res.status(404).json({error:"Notification not found."});
  res.json({ok:true});
});
app.get("/api/settings",async (_,res)=>{
 const rows = await db.prepare("SELECT key,value FROM platform_settings").all();
 const settings=Object.fromEntries(rows.map(row=>[row.key,Number(row.value)]));
 res.json(settings);
});
app.post("/api/coupons/validate",auth,allow("customer"),async (req,res)=>{
 const code=String(req.body?.code||"").trim().toUpperCase(),subtotal=Number(req.body?.subtotal);
 if(!/^[A-Z0-9_-]{3,30}$/.test(code)||!Number.isFinite(subtotal)||subtotal<=0)return res.status(400).json({error:"Enter a valid coupon code and shopping subtotal."});
 const coupon=await findActiveCoupon(code);
 if(!coupon)return res.status(404).json({error:"This coupon is invalid, expired, or no longer available."});
 const discount=Math.min(subtotal,Math.round(subtotal*coupon.discount_percent)/100);
 res.json({code:coupon.code,discountPercent:coupon.discount_percent,discount:Number(discount.toFixed(2))});
});
app.get("/api/admin/coupons",auth,allow("admin"),async (_,res)=>res.json(await db.prepare("SELECT * FROM coupons ORDER BY id DESC").all()));
app.post("/api/admin/coupons",auth,allow("admin"),async (req,res)=>{
 const code=String(req.body?.code||"").trim().toUpperCase(),discountPercent=Number(req.body?.discountPercent),expiresAt=String(req.body?.expiresAt||""),maxUses=Number(req.body?.maxUses||0);
 if(!/^[A-Z0-9_-]{3,30}$/.test(code)||!Number.isInteger(discountPercent)||discountPercent<1||discountPercent>100||!Number.isInteger(maxUses)||maxUses<0||(expiresAt&&!Number.isFinite(Date.parse(expiresAt))))
   return res.status(400).json({error:"Enter a 3–30 character code, discount from 1 to 100%, valid expiration, and a non-negative whole-number usage limit."});
 try{
   const result=await db.prepare("INSERT INTO coupons(code,discount_percent,expires_at,max_uses) VALUES (?,?,?,?)").run(code,discountPercent,expiresAt,maxUses);
   res.status(201).json({id:result.lastInsertRowid});
 }catch(error){if(error.code==="ER_DUP_ENTRY")return res.status(409).json({error:"That coupon code already exists."});throw error}
});
app.patch("/api/admin/coupons/:id",auth,allow("admin"),async (req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isInteger(id)||typeof req.body?.active!=="boolean")return res.status(400).json({error:"Choose whether the coupon should be active."});
 const result=await db.prepare("UPDATE coupons SET active=? WHERE id=?").run(req.body.active?1:0,id);
 if(!result.changes)return res.status(404).json({error:"Coupon not found."});
 res.json({ok:true});
});
app.get("/api/support",auth,async (req,res)=>{
 const query=req.user.role==="admin"
   ?"SELECT t.*,u.name AS customer_name,u.email FROM support_tickets t JOIN users u ON u.id=t.user_id ORDER BY t.updated_at DESC,t.id DESC"
   :"SELECT * FROM support_tickets WHERE user_id=? ORDER BY id DESC";
 res.json(req.user.role==="admin"?await db.prepare(query).all():await db.prepare(query).all(req.user.id));
});
app.post("/api/support",auth,allow("customer"),async (req,res)=>{
 const subject=String(req.body?.subject||"").trim(),message=String(req.body?.message||"").trim(),category=String(req.body?.category||"General");
 if(subject.length<3||subject.length>120||message.length<5||message.length>2000||!["General","Order","Payment","Delivery","Account"].includes(category))
   return res.status(400).json({error:"Enter a subject and message, and choose a valid support category."});
 const result=await db.prepare("INSERT INTO support_tickets(user_id,subject,category,message) VALUES (?,?,?,?)").run(req.user.id,subject,category,message);
 res.status(201).json({id:result.lastInsertRowid,status:"Open"});
});
app.patch("/api/admin/support/:id",auth,allow("admin"),async (req,res)=>{
 const status=String(req.body?.status||""),reply=String(req.body?.adminReply||"").trim();
 if(!["Open","In Progress","Resolved"].includes(status)||reply.length>2000)return res.status(400).json({error:"Choose a valid ticket status and reply under 2,000 characters."});
 const result=await db.prepare("UPDATE support_tickets SET status=?,admin_reply=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status,reply,Number(req.params.id));
 if(!result.changes)return res.status(404).json({error:"Support ticket not found."});
 const ticket=await db.prepare("SELECT user_id FROM support_tickets WHERE id=?").get(Number(req.params.id));
 await db.prepare("INSERT INTO notifications(user_id,message) VALUES (?,?)").run(ticket.user_id,"Support ticket #"+req.params.id+" updated: "+status+".");
 res.json({ok:true});
});
app.get("/api/products",async (req,res)=>{const q=String(req.query.q||"");const c=String(req.query.category||"");res.json(await db.prepare(`SELECT p.id,p.name,p.category,p.description,p.price,p.image,p.stock,p.featured,s.name AS store_name,(SELECT ROUND(AVG(rating),1) FROM reviews WHERE product_id=p.id) AS rating,(SELECT COUNT(*) FROM reviews WHERE product_id=p.id) AS review_count FROM products p LEFT JOIN stores s ON s.id=p.store_id WHERE p.active=1 AND p.stock>0 AND (?='' OR p.category=?) AND (?='' OR p.name LIKE CONCAT('%',?,'%') OR p.description LIKE CONCAT('%',?,'%')) ORDER BY p.featured DESC,p.category,p.name`).all(c,c,q,q,q))});
app.get("/api/products/:id",async (req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isInteger(id))return res.status(400).json({error:"Invalid product ID."});
 const product=await db.prepare("SELECT p.id,p.name,p.category,p.description,p.price,p.image,p.stock,p.featured,s.name AS store_name,(SELECT ROUND(AVG(rating),1) FROM reviews WHERE product_id=p.id) AS rating,(SELECT COUNT(*) FROM reviews WHERE product_id=p.id) AS review_count FROM products p LEFT JOIN stores s ON s.id=p.store_id WHERE p.id=? AND p.active=1").get(id);
 if(!product)return res.status(404).json({error:"Product not found."});
 res.json(product);
});
app.post("/api/orders",auth,allow("customer"),async (req,res)=>{
 const{type="Shopping",pickup,destination,notes="",paymentMethod="Cash on Delivery",paymentReference="",couponCode="",items=[]}=req.body||{};
 if(typeof pickup!=="string"||typeof destination!=="string"||!pickup.trim()||!destination.trim())return res.status(400).json({error:"Pickup and delivery addresses are required."});
 if(!["Shopping","Delivery","Pasabuy"].includes(type))return res.status(400).json({error:"Invalid order type."});
 if(!Array.isArray(items))return res.status(400).json({error:"Order items must be a list."});
 if(!["Cash on Delivery","GCash (manual confirmation)","Maya (manual confirmation)","Cash to Rider"].includes(paymentMethod))return res.status(400).json({error:"Choose a supported payment method."});
 if(typeof paymentReference!=="string"||paymentReference.length>100)return res.status(400).json({error:"Payment reference must be under 100 characters."});
 let subtotal=0;const validItems=[];
 for(const item of items){if(!item||typeof item!=="object")return res.status(400).json({error:"Invalid order item."});const productId=Number(item.productId),requested=Number(item.quantity),qty=Math.floor(requested);if(!Number.isInteger(productId)||!Number.isFinite(requested))return res.status(400).json({error:"Invalid order item."});const p=await db.prepare("SELECT id,price,stock,store_id FROM products WHERE id=? AND active=1").get(productId);if(!p||qty<1||qty>50||qty>p.stock)return res.status(400).json({error:"A product is unavailable or the requested quantity exceeds stock."});subtotal+=p.price*qty;validItems.push({productId:p.id,quantity:qty,unitPrice:p.price,storeId:p.store_id})}
 if(type==="Shopping"&&!validItems.length)return res.status(400).json({error:"Add at least one product to your cart."});
 const normalizedCoupon=String(couponCode||"").trim().toUpperCase();
 let coupon=null,discount=0;
 if(normalizedCoupon){
   if(type!=="Shopping"||!validItems.length)return res.status(400).json({error:"Coupons can only be used on shopping orders."});
   coupon=await findActiveCoupon(normalizedCoupon);
   if(!coupon)return res.status(400).json({error:"This coupon is invalid, expired, or no longer available."});
   discount=Math.min(subtotal,Number((subtotal*coupon.discount_percent/100).toFixed(2)));
 }
 const feeKey=type==="Shopping"?"shopping_delivery_fee":"service_delivery_fee";
 const feeSetting=await db.prepare("SELECT value FROM platform_settings WHERE key=?").get(feeKey);
 const fee=Number(feeSetting?.value||(type==="Shopping"?59:69)),total=subtotal+fee-discount;
 const paymentStatus=paymentMethod.includes("manual confirmation")?"Awaiting Manual Confirmation":"Pending Collection";
 const create=db.transaction(async ()=>{
   if(coupon){
     const couponUpdate=await db.prepare("UPDATE coupons SET uses_count=uses_count+1 WHERE id=? AND active=1 AND (max_uses=0 OR uses_count<max_uses)").run(coupon.id);
     if(!couponUpdate.changes)return null;
   }
   const result=await db.prepare("INSERT INTO orders (user_id,type,pickup,destination,notes,payment_method,payment_status,payment_reference,coupon_code,discount_amount,subtotal,delivery_fee,total,scheduled_at,delivery_pin) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(req.user.id,type,pickup.trim(),destination.trim(),String(notes).slice(0,500),paymentMethod,paymentStatus,paymentReference.trim(),normalizedCoupon,discount,subtotal,fee,total,String(req.body?.scheduledAt||""),String(Math.floor(1000+Math.random()*9000)));
   const add=db.prepare("INSERT INTO order_items (order_id,product_id,quantity,unit_price) VALUES (?,?,?,?)");
   for(const item of validItems){
     await add.run(result.lastInsertRowid,item.productId,item.quantity,item.unitPrice);
     await db.prepare("UPDATE products SET stock=stock-? WHERE id=?").run(item.quantity,item.productId);
   }
   const addStore=db.prepare("INSERT INTO order_store_status(order_id,store_id) VALUES (?,?)");
   for(const id of new Set(validItems.map(i=>i.storeId).filter(Boolean)))await addStore.run(result.lastInsertRowid,id);
   await db.prepare("INSERT INTO notifications(user_id,message) VALUES (?,?)").run(req.user.id,"Order #"+result.lastInsertRowid+" received.");
   return result.lastInsertRowid;
 });
 const id=await create();if(!id)return res.status(409).json({error:"This coupon was just used or is no longer available."});res.status(201).json({id,message:"Your request has been placed.",total,discount})
});
app.get("/api/orders/mine",auth,async (req,res)=>res.json(await db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC").all(req.user.id)));
app.get("/api/orders/:id",auth,async (req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isInteger(id))return res.status(400).json({error:"Invalid order ID."});
 const order=await db.prepare("SELECT * FROM orders WHERE id=? AND user_id=?").get(id,req.user.id);
 if(!order)return res.status(404).json({error:"Order not found."});
 order.items=await db.prepare("SELECT i.product_id,i.quantity,i.unit_price,p.name,p.image FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=?").all(id);
 order.rider_location=null;
 if(order.rider_id&&ACTIVE_RIDER_STATUSES.includes(order.status)){
   order.rider_location=await db.prepare("SELECT latitude,longitude,accuracy_m,updated_at FROM rider_locations WHERE order_id=? AND rider_id=? AND sharing=1 AND updated_at>=DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 60 SECOND)").get(id,order.rider_id)||null;
 }
 res.json(order);
});
app.patch("/api/orders/:id/cancel",auth,allow("customer"),async (req,res)=>{const o=await db.prepare("SELECT * FROM orders WHERE id=? AND user_id=?").get(Number(req.params.id),req.user.id);if(!o)return res.status(404).json({error:"Order not found."});if(o.status!=="Pending")return res.status(400).json({error:"Only pending orders can be cancelled."});await db.transaction(async ()=>{for(const item of await db.prepare("SELECT product_id,quantity FROM order_items WHERE order_id=?").all(o.id))await db.prepare("UPDATE products SET stock=stock+? WHERE id=?").run(item.quantity,item.product_id);await db.prepare("UPDATE orders SET status='Cancelled' WHERE id=?").run(o.id);await db.prepare("DELETE FROM rider_locations WHERE order_id=?").run(o.id);await db.prepare("INSERT INTO notifications(user_id,message) VALUES (?,?)").run(o.user_id,"Order #"+o.id+" was cancelled.")})();res.json({ok:true})});
app.get("/api/rider/orders",auth,allow("rider","admin"),async (req,res)=>{
 const itemSummary="(SELECT GROUP_CONCAT(CONCAT(p.name, ' x ', i.quantity) SEPARATOR ', ') FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=o.id) AS items_summary";
 const query=`SELECT o.*,u.name AS customer_name,${itemSummary} FROM orders o JOIN users u ON u.id=o.user_id WHERE o.status NOT IN ('Delivered','Cancelled','Rejected') AND ((o.rider_id IS NOT NULL AND o.rider_id=?) OR (o.rider_id IS NULL AND (o.status='Ready for Pickup' OR (o.status='Pending' AND NOT EXISTS (SELECT 1 FROM order_store_status oss WHERE oss.order_id=o.id))))) ORDER BY o.id ASC`;
 if(req.user.role==="admin")return res.json(await db.prepare(`SELECT o.*,u.name AS customer_name,${itemSummary} FROM orders o JOIN users u ON u.id=o.user_id WHERE o.status NOT IN ('Delivered','Cancelled','Rejected') ORDER BY o.id ASC`).all());
 const orders=await db.prepare(query).all(req.user.id);
 const rows=orders.map(order=>{const safeOrder={...order};delete safeOrder.delivery_pin;delete safeOrder.payment_reference;return safeOrder});
 res.json(rows);
});
app.get("/api/rider/history",auth,allow("rider"),async (req,res)=>{const rows=await db.prepare("SELECT id,type,pickup,destination,total,delivery_fee,status,created_at FROM orders WHERE rider_id=? AND status IN ('Delivered','Cancelled') ORDER BY id DESC").all(req.user.id);res.json({orders:rows,earnings:rows.filter(o=>o.status==='Delivered').reduce((sum,o)=>sum+o.delivery_fee,0)})});
app.patch("/api/rider/availability",auth,allow("rider"),async (req,res)=>{await db.prepare("UPDATE users SET online=? WHERE id=?").run(req.body?.online?1:0,req.user.id);res.json({ok:true})});
app.patch("/api/rider/orders/:id/accept",auth,allow("rider"),async (req,res)=>{const rider=await db.prepare("SELECT online FROM users WHERE id=?").get(req.user.id);if(!rider?.online)return res.status(409).json({error:"Go online before accepting a delivery."});const o=await db.prepare("SELECT o.* FROM orders o WHERE o.id=? AND o.rider_id IS NULL AND (o.status='Ready for Pickup' OR (o.status='Pending' AND NOT EXISTS (SELECT 1 FROM order_store_status oss WHERE oss.order_id=o.id)))").get(Number(req.params.id));if(!o)return res.status(409).json({error:"This request is no longer available."});await db.prepare("UPDATE orders SET rider_id=?,status='Accepted' WHERE id=?").run(req.user.id,o.id);await db.prepare("INSERT INTO notifications(user_id,message) VALUES (?,?)").run(o.user_id,"A rider accepted order #"+o.id+".");res.json({ok:true})});
app.post("/api/rider/orders/:id/location-sharing",auth,allow("rider"),async (req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isInteger(id)||id<1)return res.status(400).json({error:"Invalid order ID."});
 const order=await findActiveRiderOrder(id,req.user.id);
 if(!order)return res.status(409).json({error:"Only your active deliveries can share live location."});
 await db.prepare("INSERT INTO rider_locations(order_id,rider_id,sharing) VALUES (?,?,1) ON DUPLICATE KEY UPDATE rider_id=VALUES(rider_id),latitude=NULL,longitude=NULL,accuracy_m=NULL,sharing=1,started_at=CURRENT_TIMESTAMP,updated_at=NULL").run(id,req.user.id);
 res.json({ok:true});
});
app.patch("/api/rider/orders/:id/location",auth,allow("rider"),async (req,res)=>{
 const id=Number(req.params.id),{latitude,longitude,accuracy}=req.body||{};
 if(!Number.isInteger(id)||id<1||typeof latitude!=="number"||!Number.isFinite(latitude)||latitude< -90||latitude>90||typeof longitude!=="number"||!Number.isFinite(longitude)||longitude< -180||longitude>180||typeof accuracy!=="number"||!Number.isFinite(accuracy)||accuracy<0||accuracy>100000)
   return res.status(400).json({error:"A valid GPS location and accuracy are required."});
 const order=await findActiveRiderOrder(id,req.user.id);
 if(!order)return res.status(409).json({error:"Only your active deliveries can share live location."});
 const result=await db.prepare("UPDATE rider_locations SET latitude=?,longitude=?,accuracy_m=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND rider_id=? AND sharing=1").run(latitude,longitude,accuracy,id,req.user.id);
 if(!result.changes)return res.status(409).json({error:"Start live location sharing for this delivery first."});
 res.json({ok:true});
});
app.delete("/api/rider/orders/:id/location-sharing",auth,allow("rider"),async (req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isInteger(id)||id<1)return res.status(400).json({error:"Invalid order ID."});
 await db.prepare("UPDATE rider_locations SET sharing=0,latitude=NULL,longitude=NULL,accuracy_m=NULL,updated_at=NULL WHERE order_id=? AND rider_id=?").run(id,req.user.id);
 res.json({ok:true});
});
app.patch("/api/rider/orders/:id/status",auth,allow("rider","admin"),async (req,res)=>{
 const allowed=["Accepted","Picked Up","On the Way","Delivered","Cancelled"],status=req.body?.status;
 if(!allowed.includes(status))return res.status(400).json({error:"Invalid status."});
 const order=await db.prepare("SELECT * FROM orders WHERE id=?").get(Number(req.params.id));
 if(!order)return res.status(404).json({error:"Order not found."});
 if(req.user.role==="rider"&&order.rider_id!==req.user.id)return res.status(403).json({error:"This delivery is not assigned to you."});
 if(req.user.role==="rider"){const next={Accepted:["Picked Up","Cancelled"],"Picked Up":["On the Way","Cancelled"],"On the Way":["Delivered","Cancelled"]};if(!next[order.status]?.includes(status))return res.status(409).json({error:"Move the delivery through its next status."})}
 if(status==="Delivered"&&req.body?.pin!==order.delivery_pin)return res.status(400).json({error:"Enter the customer's delivery PIN."});
  const paymentStatus=status==="Delivered"&&["Cash on Delivery","Cash to Rider"].includes(order.payment_method)?"Collected":order.payment_status;
  await db.prepare("UPDATE orders SET status=?,rider_id=?,payment_status=? WHERE id=?").run(status,req.user.id,paymentStatus,order.id);
  if(["Delivered","Cancelled"].includes(status))await db.prepare("DELETE FROM rider_locations WHERE order_id=?").run(order.id);
  await db.prepare("INSERT INTO notifications(user_id,message) VALUES (?,?)").run(order.user_id,"Order #"+order.id+" status updated to "+status+".");res.json({ok:true})
});
app.get("/api/merchant/store",auth,allow("merchant"),async (req,res)=>res.json(await db.prepare("SELECT * FROM stores WHERE owner_id=?").get(req.user.id)));
app.patch("/api/merchant/store",auth,allow("merchant"),async (req,res)=>{
 const name=String(req.body?.name||"").trim(),description=String(req.body?.description||"").trim();
 if(!name||name.length>100||description.length>500)return res.status(400).json({error:"Enter a store name (up to 100 characters) and description (up to 500 characters)."});
 await db.prepare("UPDATE stores SET name=?,description=? WHERE owner_id=?").run(name,description,req.user.id);res.json({ok:true})
});
app.get("/api/merchant/products",auth,allow("merchant"),async (req,res)=>res.json(await db.prepare("SELECT p.* FROM products p JOIN stores s ON s.id=p.store_id WHERE s.owner_id=? ORDER BY p.id DESC").all(req.user.id)));
app.post("/api/merchant/products",auth,allow("merchant"),async (req,res)=>{const{name,category,description="",price,stock=0}=req.body||{};const store=await db.prepare("SELECT * FROM stores WHERE owner_id=?").get(req.user.id);if(!store?.approved)return res.status(403).json({error:"Your store needs admin approval before it can sell."});const amount=Number(price),quantity=Number(stock);if(typeof name!=="string"||typeof category!=="string"||!name.trim()||!category.trim()||!Number.isFinite(amount)||amount<=0||!Number.isInteger(quantity)||quantity<0)return res.status(400).json({error:"Enter product details, valid price, and stock."});const out=await db.prepare("INSERT INTO products(name,category,description,price,stock,store_id) VALUES (?,?,?,?,?,?)").run(name.trim(),category.trim(),String(description).slice(0,500),amount,quantity,store.id);res.status(201).json({id:out.lastInsertRowid})});
app.patch("/api/merchant/products/:id",auth,allow("merchant"),async (req,res)=>{const productId=Number(req.params.id);if(!Number.isInteger(productId))return res.status(400).json({error:"Invalid product ID."});const p=await db.prepare("SELECT p.* FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=? AND s.owner_id=?").get(productId,req.user.id);if(!p)return res.status(404).json({error:"Product not found."});const b=req.body||{},name=String(b.name??p.name).trim(),category=String(b.category??p.category).trim(),price=Number(b.price??p.price),stock=Number(b.stock??p.stock);if(!name||!category||!Number.isFinite(price)||price<=0||!Number.isInteger(stock)||stock<0)return res.status(400).json({error:"Enter a name, category, valid price, and whole-number stock."});await db.prepare("UPDATE products SET name=?,category=?,description=?,price=?,stock=? WHERE id=?").run(name.slice(0,100),category.slice(0,80),String(b.description??p.description).slice(0,500),price,stock,p.id);res.json({ok:true})});
app.delete("/api/merchant/products/:id",auth,allow("merchant"),async (req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isInteger(id))return res.status(400).json({error:"Invalid product ID."});
 const result=await db.prepare("UPDATE products SET active=0 WHERE id=? AND store_id=(SELECT id FROM stores WHERE owner_id=?) AND active=1").run(id,req.user.id);
 if(!result.changes)return res.status(404).json({error:"Product not found or already removed."});
 res.json({ok:true});
});
app.get("/api/merchant/orders",auth,allow("merchant"),async (req,res)=>{
 const query="SELECT DISTINCT o.*,oss.status AS merchant_status,u.name AS customer_name,(SELECT GROUP_CONCAT(CONCAT(p.name, ' x ', i.quantity) SEPARATOR ', ') FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=o.id AND p.store_id=s.id) AS items_summary FROM orders o JOIN users u ON u.id=o.user_id JOIN order_store_status oss ON oss.order_id=o.id JOIN stores s ON s.id=oss.store_id WHERE s.owner_id=? ORDER BY o.id DESC";
 const rows=await db.prepare(query).all(req.user.id);
 const orders=rows.map(order=>{const safeOrder={...order};delete safeOrder.delivery_pin;delete safeOrder.payment_reference;return safeOrder});
 res.json(orders);
});
app.get("/api/merchant/summary",auth,allow("merchant"),async (req,res)=>{
 const orders=await db.prepare("SELECT COUNT(DISTINCT o.id) AS count,COALESCE(SUM(i.quantity*i.unit_price),0) AS sales FROM orders o JOIN order_store_status oss ON oss.order_id=o.id JOIN stores s ON s.id=oss.store_id LEFT JOIN order_items i ON i.order_id=o.id JOIN products p ON p.id=i.product_id AND p.store_id=s.id WHERE s.owner_id=? AND o.status NOT IN ('Cancelled','Rejected')").get(req.user.id);
 const productCount=await db.prepare("SELECT COUNT(*) AS count FROM products p JOIN stores s ON s.id=p.store_id WHERE s.owner_id=? AND p.active=1").get(req.user.id);
 const commissionSetting=await db.prepare("SELECT value FROM platform_settings WHERE key='merchant_commission_percent'").get();
 const products=productCount.count;
 const commission=Number(commissionSetting?.value||10);
 res.json({orders:orders.count,sales:orders.sales,estimatedCommission:orders.sales*commission/100,products,commissionPercent:commission});
});
app.patch("/api/merchant/orders/:id/status",auth,allow("merchant"),async (req,res)=>{const order=await db.prepare("SELECT o.*,oss.status AS merchant_status,oss.store_id FROM orders o JOIN order_store_status oss ON oss.order_id=o.id JOIN stores s ON s.id=oss.store_id WHERE o.id=? AND s.owner_id=?").get(Number(req.params.id),req.user.id);if(!order)return res.status(404).json({error:"Order not found."});if(order.status==="Rejected"||order.status==="Cancelled")return res.status(409).json({error:"This order is already closed."});const transitions={Pending:["Accepted","Rejected"],Accepted:["Preparing","Rejected"],Preparing:["Ready for Pickup"]};if(!transitions[order.merchant_status]?.includes(req.body?.status))return res.status(400).json({error:"That store status change is not allowed."});await db.transaction(async ()=>{await db.prepare("UPDATE order_store_status SET status=? WHERE order_id=? AND store_id=?").run(req.body.status,order.id,order.store_id);if(req.body.status==="Rejected"){for(const item of await db.prepare("SELECT product_id,quantity FROM order_items WHERE order_id=?").all(order.id))await db.prepare("UPDATE products SET stock=stock+? WHERE id=?").run(item.quantity,item.product_id);await db.prepare("UPDATE orders SET status='Rejected' WHERE id=?").run(order.id)}else{const remainingResult=await db.prepare("SELECT COUNT(*) AS count FROM order_store_status WHERE order_id=? AND status<>'Ready for Pickup'").get(order.id);await db.prepare("UPDATE orders SET status=? WHERE id=?").run(remainingResult.count===0?"Ready for Pickup":"Preparing",order.id)}await db.prepare("INSERT INTO notifications(user_id,message) VALUES (?,?)").run(order.user_id,"Order #"+order.id+" store status: "+req.body.status+".")})();res.json({ok:true})});
app.get("/api/admin/orders",auth,allow("admin"),async (_,res)=>res.json(await db.prepare("SELECT o.*,u.name AS customer_name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC").all()));
app.get("/api/admin/summary",auth,allow("admin"),async (_,res)=>{
 const orders=await db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN status NOT IN ('Cancelled','Rejected') THEN total ELSE 0 END),0) AS sales FROM orders").get();
 const userCount=await db.prepare("SELECT COUNT(*) AS count FROM users").get();
 const riderCount=await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='rider'").get();
 const merchantCount=await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='merchant'").get();
 const customerCount=await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='customer'").get();
 const pendingStoreCount=await db.prepare("SELECT COUNT(*) AS count FROM stores WHERE approved=0").get();
 const statuses=await db.prepare("SELECT status,COUNT(*) AS count FROM orders GROUP BY status").all();
 const users=userCount.count,riders=riderCount.count,merchants=merchantCount.count,customers=customerCount.count,pendingStores=pendingStoreCount.count;
 res.json({orders:orders.count,sales:orders.sales,users,riders,merchants,customers,pendingStores,statuses})
});
app.patch("/api/admin/settings",auth,allow("admin"),async (req,res)=>{
 const allowed={shopping_delivery_fee:{min:0,max:10000},service_delivery_fee:{min:0,max:10000},merchant_commission_percent:{min:0,max:50}};
 const entries=Object.entries(req.body||{});
 if(!entries.length||entries.some(([key,value])=>!Object.hasOwn(allowed,key)||!Number.isFinite(Number(value))||Number(value)<allowed[key].min||Number(value)>allowed[key].max))
   return res.status(400).json({error:"Settings must contain supported numeric values within their allowed ranges."});
 const update=db.prepare("INSERT INTO platform_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
 const save=db.transaction(async ()=>{for(const [key,value] of entries)await update.run(key,String(Number(value)))});
 await save();
 const rows=await db.prepare("SELECT key,value FROM platform_settings").all();
 res.json(Object.fromEntries(rows.map(row=>[row.key,Number(row.value)])));
});
app.get("/api/admin/support",auth,allow("admin"),async (_,res)=>res.json(await db.prepare("SELECT t.*,u.name AS customer_name,u.email FROM support_tickets t JOIN users u ON u.id=t.user_id ORDER BY t.updated_at DESC,t.id DESC").all()));
app.get("/api/admin/payments",auth,allow("admin"),async (_,res)=>res.json(await db.prepare("SELECT o.id,o.user_id,u.name AS customer_name,o.payment_method,o.payment_status,o.payment_reference,o.total,o.created_at FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC").all()));
app.patch("/api/admin/payments/:id",auth,allow("admin"),async (req,res)=>{
 const id=Number(req.params.id),status=String(req.body?.status||"");
 if(!Number.isInteger(id)||!["Paid","Rejected"].includes(status))return res.status(400).json({error:"Choose a valid payment status."});
 const order=await db.prepare("SELECT * FROM orders WHERE id=?").get(id);
 if(!order)return res.status(404).json({error:"Payment record not found."});
 if(!order.payment_method.includes("manual confirmation"))return res.status(409).json({error:"Only manually confirmed online payments can be reviewed here."});
 if(order.payment_status!=="Awaiting Manual Confirmation")return res.status(409).json({error:"This payment has already been reviewed."});
 if(status==="Paid"&&!order.payment_reference.trim())return res.status(400).json({error:"A payment reference is required before confirming payment."});
 await db.prepare("UPDATE orders SET payment_status=? WHERE id=?").run(status,id);
 await db.prepare("INSERT INTO notifications(user_id,message) VALUES (?,?)").run(order.user_id,"Payment for order #"+id+" marked "+status.toLowerCase()+".");
 res.json({ok:true});
});
app.get("/api/admin/users",auth,allow("admin"),async (_,res)=>res.json(await db.prepare("SELECT id,name,email,role,verified,online,suspended,created_at FROM users WHERE role<>'admin' ORDER BY id DESC").all()));
app.get("/api/admin/products",auth,allow("admin"),async (_,res)=>res.json(await db.prepare("SELECT p.*,s.name AS store_name FROM products p LEFT JOIN stores s ON s.id=p.store_id ORDER BY p.id DESC").all()));
app.patch("/api/admin/products/:id",auth,allow("admin"),async (req,res)=>{
 const id=Number(req.params.id),active=req.body?.active;
 if(!Number.isInteger(id)||typeof active!=="boolean")return res.status(400).json({error:"Choose whether the product should be visible."});
 const result=await db.prepare("UPDATE products SET active=? WHERE id=?").run(active?1:0,id);
 if(!result.changes)return res.status(404).json({error:"Product not found."});
 res.json({ok:true});
});
app.patch("/api/admin/users/:id",auth,allow("admin"),async (req,res)=>{
 const id=Number(req.params.id),{role,verified,suspended}=req.body||{};
 if(!Number.isInteger(id)||id<1||!["customer","rider","merchant"].includes(role)||![0,1].includes(Number(verified))||typeof suspended!=="boolean")return res.status(400).json({error:"Invalid account settings."});
 const target=await db.prepare("SELECT role FROM users WHERE id=?").get(id);
 if(!target||target.role==="admin")return res.status(404).json({error:"User not found."});
 await db.prepare("UPDATE users SET role=?,verified=?,suspended=? WHERE id=?").run(role,Number(verified),suspended?1:0,id);
 res.json({ok:true})
});
app.get("/api/admin/stores",auth,allow("admin"),async (_,res)=>res.json(await db.prepare("SELECT s.*,u.email FROM stores s JOIN users u ON u.id=s.owner_id ORDER BY s.id DESC").all()));
app.patch("/api/admin/stores/:id/approve",auth,allow("admin"),async (req,res)=>{await db.prepare("UPDATE stores SET approved=? WHERE id=?").run(req.body?.approved?1:0,Number(req.params.id));res.json({ok:true})});
app.use((err,req,res,next)=>{console.error(err);if(res.headersSent)return next(err);res.status(500).json({error:"Something went wrong. Please try again."})});
async function start() {
  await initialize();
  await seedData();
  const cleanupRiderLocations=()=>db.prepare("DELETE FROM rider_locations WHERE (updated_at IS NOT NULL AND updated_at<DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 5 MINUTE)) OR (updated_at IS NULL AND started_at<DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 5 MINUTE))").run().catch((error)=>console.error("Rider location cleanup failed:",error));
  await cleanupRiderLocations();
  const cleanupTimer=setInterval(cleanupRiderLocations,60*1000);
  cleanupTimer.unref();
  app.listen(PORT,()=>console.log("ShopEase API listening on http://localhost:"+PORT));
}
start().catch((error)=>{
  console.error("ShopEase API startup failed:",error);
  process.exitCode=1;
});

