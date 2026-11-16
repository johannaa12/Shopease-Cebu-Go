import { useCallback, useEffect, useRef, useState } from "react";
import "./style.css";
import "./features.css";

const money = n => `${String.fromCharCode(8369)}${Number(n || 0).toFixed(2)}`;
const ACTIVE_TRIP_STATUSES = ["Accepted", "Picked Up", "On the Way"];
const categoryEmoji = category => ({
  All:"✨", Food:"🍱", Groceries:"🥭", Essentials:"🧺", Home:"🏠", Fashion:"👜",
  Beauty:"🧴", Electronics:"🔌", Sports:"🏃", Pets:"🐾", Baby:"🍼", Books:"📚"
}[category] || "🛍️");
function readStoredUser() {
  try { return JSON.parse(localStorage.getItem("sg_user") || sessionStorage.getItem("sg_user") || "null"); }
  catch { localStorage.removeItem("sg_user"); localStorage.removeItem("sg_token"); sessionStorage.removeItem("sg_user"); sessionStorage.removeItem("sg_token"); return null; }
}
function LiveLocationMap({ location, trail }) {
  const points = trail.length ? trail.slice(-20) : [location];
  const latitudes = points.map(point => Number(point.latitude));
  const longitudes = points.map(point => Number(point.longitude));
  const minLatitude = Math.min(...latitudes), maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes), maxLongitude = Math.max(...longitudes);
  const latitudeRange = maxLatitude - minLatitude, longitudeRange = maxLongitude - minLongitude;
  const plotted = points.map(point => ({
    x: 20 + (longitudeRange ? (Number(point.longitude) - minLongitude) / longitudeRange : 0.5) * 360,
    y: 20 + (latitudeRange ? (maxLatitude - Number(point.latitude)) / latitudeRange : 0.5) * 120
  }));
  const current = plotted[plotted.length - 1];
  const updatedAt = new Date(location.updated_at || Date.now());
  const updatedLabel = Number.isNaN(updatedAt.getTime()) ? "just now" : updatedAt.toLocaleTimeString();
  return <section className="live-location-card" aria-label="Live rider location">
    <div className="live-location-heading"><b><span className="live-location-pulse"/>Rider location is live</b><time dateTime={location.updated_at}>{updatedLabel}</time></div>
    <div className="live-location-map" role="img" aria-label={`Recent GPS trace with rider at ${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}`}>
      <svg viewBox="0 0 400 160" aria-hidden="true">
        <path className="live-map-streets" d="M0 32H400 M0 82H400 M0 132H400 M45 0V160 M125 0V160 M215 0V160 M305 0V160 M370 0V160"/>
        <path className="live-map-avenue" d="M-10 145L115 95L250 55L410 5"/>
        {plotted.length > 1 && <polyline className="live-map-trail" points={plotted.map(point => `${point.x},${point.y}`).join(" ")}/>}
        <circle className="live-map-marker" cx={current.x} cy={current.y} r="9"/>
      </svg>
      <span className="live-map-label">Recent GPS trace</span>
    </div>
    <div className="live-location-coordinates"><span>Latitude <b>{Number(location.latitude).toFixed(5)}</b></span><span>Longitude <b>{Number(location.longitude).toFixed(5)}</b></span><span>Accuracy <b>±{Math.round(Number(location.accuracy_m) || 0)} m</b></span></div>
    <small className="live-location-privacy">Only you can see this order’s location. The trace is kept on this device while tracking is open.</small>
  </section>;
}
function App() {
  const [token, setToken] = useState(localStorage.getItem("sg_token") || sessionStorage.getItem("sg_token") || "");
  const [user, setUser] = useState(readStoredUser);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState(() => user?.role === "rider" ? "Rider" : user?.role === "merchant" ? "Merchant" : user?.role === "admin" ? "Admin" : "Shop");
  const [menuOpen, setMenuOpen] = useState(false);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ firstName:"", lastName:"", email:"customer@shopease.local", phone:"", password:"password123", role:"customer" });
  const [authView, setAuthView] = useState("form");
  const [authRemember, setAuthRemember] = useState(true);
  const [authOtpChannel, setAuthOtpChannel] = useState("phone");
  const [otpPurpose, setOtpPurpose] = useState("login");
  const [otpChannel, setOtpChannel] = useState("email");
  const [otpContact, setOtpContact] = useState("");
  const [otpChallenge, setOtpChallenge] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpDemoCode, setOtpDemoCode] = useState("");
  const [otpVerificationId, setOtpVerificationId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checkout, setCheckout] = useState({ type:"Delivery", pickup:"Partner store / market", destination:"", notes:"", paymentMethod:"Cash on Delivery", paymentReference:"" });
  const [selectedCartIds, setSelectedCartIds] = useState({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [riderOrders, setRiderOrders] = useState([]);
  const [riderHistory, setRiderHistory] = useState({orders:[],earnings:0});
  const [sharingOrderId, setSharingOrderId] = useState(null);
  const [riderTrail, setRiderTrail] = useState([]);
  const locationWatchRef = useRef(null);
  const [adminSummary, setAdminSummary] = useState(null);
  const [sort, setSort] = useState("featured");
  const [favorites, setFavorites] = useState([]);
  const [riderOnline, setRiderOnline] = useState(false);
  const [merchantItems, setMerchantItems] = useState([]);
  const [merchantOrders, setMerchantOrders] = useState([]);
  const [merchantSummary, setMerchantSummary] = useState(null);
  const [store, setStore] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminProducts, setAdminProducts] = useState([]);
  const [adminStores, setAdminStores] = useState([]);
  const [profile, setProfile] = useState({name:"",phone:"",address:""});
  const [notifications, setNotifications] = useState([]);
  const [productForm, setProductForm] = useState({name:"",category:"Food",description:"",price:"",stock:"10"});
  const [settings, setSettings] = useState({shopping_delivery_fee:59,service_delivery_fee:69,merchant_commission_percent:10});
  const [supportTickets, setSupportTickets] = useState([]);
  const [adminTickets, setAdminTickets] = useState([]);
  const [adminPayments, setAdminPayments] = useState([]);
  const [adminCoupons, setAdminCoupons] = useState([]);
  const [supportForm, setSupportForm] = useState({subject:"",category:"General",message:""});
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponForm, setCouponForm] = useState({code:"",discountPercent:10,expiresAt:"",maxUses:0});
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productReviews, setProductReviews] = useState([]);
  const [orderDetail, setOrderDetail] = useState(null);
  const [infoPage, setInfoPage] = useState("About");

  const api = useCallback(async (path, options = {}) => {
    const res = await fetch(path, {
      ...options,
      headers: { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}), ...(options.headers || {}) }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 || data.code === "ACCOUNT_SUSPENDED") {
        setToken(""); setUser(null);
        localStorage.removeItem("sg_token"); localStorage.removeItem("sg_user");sessionStorage.removeItem("sg_token");sessionStorage.removeItem("sg_user");
      }
      throw new Error(data.error || "Request failed");
    }
    return data;
  }, [token]);
  const stopLocationSharing = useCallback(async (showMessage = false) => {
    const watching=locationWatchRef.current;
    if(!watching)return;
    if(navigator.geolocation)navigator.geolocation.clearWatch(watching.watchId);
    locationWatchRef.current=null;
    setSharingOrderId(null);
    try {
      await api(`/api/rider/orders/${watching.orderId}/location-sharing`,{method:"DELETE"});
      if(showMessage)setMessage("Live location sharing stopped.");
    } catch(e) { setMessage(e.message); }
  },[api]);
  const startLocationSharing = useCallback(async orderId => {
    if(!navigator.geolocation){setMessage("Location services are not available in this browser.");return;}
    if(locationWatchRef.current?.orderId===orderId)return;
    if(locationWatchRef.current)await stopLocationSharing(false);
    let sharingStarted=false;
    try {
      await api(`/api/rider/orders/${orderId}/location-sharing`,{method:"POST"});
      sharingStarted=true;
      const watchId=navigator.geolocation.watchPosition(({coords})=>{
        const watching=locationWatchRef.current,now=Date.now();
        if(!watching||watching.orderId!==orderId||now-watching.lastSentAt<10000)return;
        watching.lastSentAt=now;
        api(`/api/rider/orders/${orderId}/location`,{method:"PATCH",body:JSON.stringify({latitude:coords.latitude,longitude:coords.longitude,accuracy:coords.accuracy})})
          .catch(e=>setMessage(e.message));
      },error=>{
        const reason=error.code===1?"Location permission was denied.":error.code===3?"Location request timed out.":"Unable to determine your location.";
        void stopLocationSharing(false).finally(()=>setMessage(reason));
      },{enableHighAccuracy:true,timeout:15000,maximumAge:5000});
      locationWatchRef.current={watchId,orderId,lastSentAt:0};
      setSharingOrderId(orderId);
      setMessage(`Live location sharing started for order #${orderId}.`);
    } catch(e) {
      if(sharingStarted){
        try { await api(`/api/rider/orders/${orderId}/location-sharing`,{method:"DELETE"}); }
        catch(cleanupError) { console.error("Could not stop live location sharing after GPS setup failed:",cleanupError); }
      }
      setMessage(e.message);
    }
  },[api,stopLocationSharing]);
  const loadProducts = useCallback(async () => {
    try { setProducts(await api("/api/products")); } catch (e) { setMessage(e.message); }
  }, [api]);
  const loadOrders = useCallback(async () => {
    if (!token) return;
    try {
      if (user?.role === "rider") {
        const [active,history]=await Promise.all([api("/api/rider/orders"),api("/api/rider/history")]);
        setRiderOrders(active); setRiderHistory(history);
      }
      else if (user?.role === "admin") {
        setOrders(await api("/api/admin/orders"));
        setAdminSummary(await api("/api/admin/summary"));
        setAdminUsers(await api("/api/admin/users"));
        setAdminProducts(await api("/api/admin/products"));
        setAdminStores(await api("/api/admin/stores"));
        setAdminTickets(await api("/api/admin/support"));
        setAdminPayments(await api("/api/admin/payments"));
        setAdminCoupons(await api("/api/admin/coupons"));
      } else if (user?.role === "merchant") {
        const [items, info, merchantActivity, summary] = await Promise.all([api("/api/merchant/products"), api("/api/merchant/store"), api("/api/merchant/orders"), api("/api/merchant/summary")]);
        setMerchantItems(items); setStore(info); setMerchantOrders(merchantActivity); setMerchantSummary(summary);
      } else setOrders(await api("/api/orders/mine"));
    } catch (e) { setMessage(e.message); }
  }, [api, token, user?.role]);
  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => { api("/api/settings").then(setSettings).catch(e=>setMessage(e.message)); }, [api]);
  useEffect(() => { loadOrders(); }, [loadOrders]);
  useEffect(() => { if(token&&user?.role==="customer") api("/api/support").then(setSupportTickets).catch(e=>setMessage(e.message)); }, [api,token,user?.role]);
  useEffect(() => { if(token && user?.role === "customer") api("/api/favorites").then(setFavorites).catch(()=>{}); }, [api,token,user?.role]);
  useEffect(() => { if(token) api("/api/profile").then(p=>{setProfile(p);if(user?.role==="rider")setRiderOnline(Boolean(p.online));}).catch(()=>{}); }, [api,token,user?.role]);
  useEffect(() => { if(!token)return; const refresh=()=>{api("/api/notifications").then(setNotifications).catch(()=>{});loadOrders();}; refresh(); const timer=window.setInterval(refresh,15000); return ()=>window.clearInterval(timer); }, [api,loadOrders,token]);
  const trackingOrderId=orderDetail?.id;
  const trackingOrderStatus=orderDetail?.status;
  useEffect(() => {
    if(!trackingOrderId||!token||user?.role!=="customer"||["Delivered","Cancelled","Rejected"].includes(trackingOrderStatus))return;
    let active=true;
    const refresh=async()=>{
      try{
        const latest=await api(`/api/orders/${trackingOrderId}`);
        if(!active)return;
        setOrderDetail(current=>current?.id===latest.id?latest:current);
        if(latest.rider_location)setRiderTrail(current=>{
          const point={latitude:Number(latest.rider_location.latitude),longitude:Number(latest.rider_location.longitude)};
          const last=current[current.length-1];
          if(last&&last.latitude===point.latitude&&last.longitude===point.longitude)return current;
          return [...current,point].slice(-20);
        });
      }catch(e){if(active)setMessage(e.message);}
    };
    const timer=window.setInterval(refresh,8000);
    return ()=>{active=false;window.clearInterval(timer);};
  },[api,trackingOrderId,trackingOrderStatus,token,user?.role]);
  useEffect(()=>{
    const watching=locationWatchRef.current;
    if(!watching)return;
    const activeOrder=riderOrders.find(order=>Number(order.id)===Number(watching.orderId)&&ACTIVE_TRIP_STATUSES.includes(order.status));
    if(!token||user?.role!=="rider"||!activeOrder)void stopLocationSharing(false);
  },[riderOrders,stopLocationSharing,token,user?.role]);
  useEffect(()=>()=>{const watching=locationWatchRef.current;if(watching&&navigator.geolocation)navigator.geolocation.clearWatch(watching.watchId);},[]);
  const categories = ["All", ...new Set(products.map(p => p.category))];
  const featuredProducts = products.filter(p => p.featured).slice(0, 5);
  const visible = products.filter(p => (category === "All" || p.category === category) &&
    `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => sort === "price-low" ? a.price-b.price : sort === "price-high" ? b.price-a.price : sort === "rating" ? (b.rating||0)-(a.rating||0) : (b.featured||0)-(a.featured||0));
  const cartItems = products.filter(p => cart[p.id]).map(p => ({ ...p, quantity:cart[p.id] }));
  const selectedCartItems = cartItems.filter(p => selectedCartIds[p.id] !== false);
  const subtotal = selectedCartItems.reduce((sum, p) => sum + p.price * p.quantity, 0);
  const selectedCount = selectedCartItems.reduce((sum, p) => sum + p.quantity, 0);
  const allCartSelected = cartItems.length > 0 && selectedCartItems.length === cartItems.length;
  const count = Object.values(cart).reduce((a,b) => a+b, 0);
  const staffRole = ["rider", "merchant", "admin"].includes(user?.role);
  const dashboardTab = user?.role === "rider" ? "Rider" : user?.role === "merchant" ? "Merchant" : user?.role === "admin" ? "Admin" : "Shop";
  const deliveryProgress = ["Pending","Preparing","Ready for Pickup","Accepted","Picked Up","On the Way","Delivered"];
  const progressIndex = orderDetail ? deliveryProgress.indexOf(orderDetail.status) : -1;

  function saveSession(data) {
    setToken(data.token); setUser(data.user);
    localStorage.removeItem("sg_token");localStorage.removeItem("sg_user");sessionStorage.removeItem("sg_token");sessionStorage.removeItem("sg_user");
    const storage=authRemember?localStorage:sessionStorage;
    storage.setItem("sg_token",data.token);storage.setItem("sg_user",JSON.stringify(data.user));
    setTab(data.user.role === "customer" ? "Shop" : data.user.role === "rider" ? "Rider" : data.user.role === "merchant" ? "Merchant" : "Admin");
    setAuthView("form"); setMessage(`Welcome, ${data.user.name}!`);
  }
  async function authenticate(e) {
    e.preventDefault(); setMessage("");
    try {
      if(authMode==="register"){
        if(authForm.password!==confirmPassword){setMessage("Passwords do not match.");return;}
        const contact=authOtpChannel==="email"?authForm.email:authForm.phone;
        const result=await api("/api/auth/otp/send",{method:"POST",body:JSON.stringify({contact,purpose:"signup"})});
        setOtpPurpose("signup");setOtpChannel(authOtpChannel);setOtpContact(contact);setOtpChallenge(result.challengeId);setOtpCode("");setOtpDemoCode(result.demoCode||"");setAuthView("verify");setMessage(result.message||"Enter the verification code.");
        return;
      }
      const data=await api("/api/auth/login",{method:"POST",body:JSON.stringify({identifier:authForm.email,password:authForm.password})});
      saveSession(data);
    } catch (e) { setMessage(e.message); }
  }
  function toggleAuthMode() {
    const next = authMode === "login" ? "register" : "login";
    setAuthMode(next);
    setAuthView("form");
    setConfirmPassword("");
    setAuthForm(form => ({ ...form, firstName:"",lastName:"",phone:"",email: next === "register" ? "" : "customer@shopease.local",password: next === "register" ? "" : "password123",role:"customer" }));
  }
  function beginOtpFlow(purpose) {
    const contact=authForm.email;
    const channel=contact.includes("@")?"email":"phone";
    setOtpPurpose(purpose);setOtpChannel(channel);setOtpContact(contact);setOtpChallenge("");setOtpCode("");setOtpDemoCode("");setOtpVerificationId("");setAuthView("send");setMessage("");
  }
  async function sendOtp(e) {
    e.preventDefault();setMessage("");
    try {
      const result=await api("/api/auth/otp/send",{method:"POST",body:JSON.stringify({contact:otpContact,purpose:otpPurpose})});
      setOtpChallenge(result.challengeId||"");setOtpDemoCode(result.demoCode||"");setOtpCode("");setAuthView("verify");setMessage(result.message||"If an account matches, a code has been generated.");
    } catch(error) { setMessage(error.message); }
  }
  async function verifyOtp(e) {
    e.preventDefault();setMessage("");
    try {
      const verified=await api("/api/auth/otp/verify",{method:"POST",body:JSON.stringify({challengeId:otpChallenge,code:otpCode})});
      if(otpPurpose==="login"){saveSession(verified);return;}
      if(otpPurpose==="signup"){
        const registered=await api("/api/auth/register",{method:"POST",body:JSON.stringify({name:`${authForm.firstName.trim()} ${authForm.lastName.trim()}`,email:authForm.email,phone:authForm.phone,password:authForm.password,role:authForm.role,verificationId:verified.verificationId})});
        saveSession(registered);return;
      }
      setOtpVerificationId(verified.verificationId);setAuthView("reset");setMessage("Code verified. Choose a new password.");
    } catch(error) { setMessage(error.message); }
  }
  async function resetPassword(e) {
    e.preventDefault();setMessage("");
    if(newPassword!==newPasswordConfirm){setMessage("Passwords do not match.");return;}
    try {
      const result=await api("/api/auth/password/reset",{method:"POST",body:JSON.stringify({verificationId:otpVerificationId,password:newPassword})});
      setAuthView("form");setAuthMode("login");setNewPassword("");setNewPasswordConfirm("");setOtpCode("");setOtpVerificationId("");setMessage(result.message);
    } catch(error) { setMessage(error.message); }
  }
  async function toggleFavorite(id) {
    if(!token) { setTab("Account"); setMessage("Sign in to save favorites."); return; }
    try { const result=await api(`/api/favorites/${id}`,{method:"POST"}); setFavorites(old=>result.favorite?[...old,products.find(p=>p.id===id)]:old.filter(p=>p.id!==id)); }
    catch(e) { setMessage(e.message); }
  }
  async function saveReview(product) {
    if(!token) { setTab("Account"); return; }
    const rating=Number(window.prompt(`Rate ${product.name} from 1 to 5:`));
    if(!rating) return;
    const comment=window.prompt("Add a short review (optional):") || "";
    try { await api(`/api/products/${product.id}/reviews`,{method:"POST",body:JSON.stringify({rating,comment})}); await loadProducts(); setMessage("Thanks for reviewing this product."); }
    catch(e) { setMessage(e.message); }
  }
  async function openProduct(product) {
    try {
      const [details,reviews]=await Promise.all([api(`/api/products/${product.id}`),api(`/api/products/${product.id}/reviews`)]);
      setSelectedProduct(details); setProductReviews(reviews);
    } catch(e) { setMessage(e.message); }
  }
  async function openOrder(id) {
    try {
      const detail=await api(`/api/orders/${id}`);
      setOrderDetail(detail);
      setRiderTrail(detail.rider_location?[{latitude:Number(detail.rider_location.latitude),longitude:Number(detail.rider_location.longitude)}]:[]);
    }
    catch(e) { setMessage(e.message); }
  }
  async function submitSupport(e) {
    e.preventDefault();
    try {
      await api("/api/support",{method:"POST",body:JSON.stringify(supportForm)});
      setSupportForm({subject:"",category:"General",message:""});
      setSupportTickets(await api("/api/support"));
      setMessage("Your support request has been submitted.");
    } catch(e) { setMessage(e.message); }
  }
  async function updateSupportTicket(ticket) {
    const reply=window.prompt("Reply to this customer (optional):",ticket.admin_reply||"");
    if(reply===null)return;
    const status=window.prompt("Set status: Open, In Progress, or Resolved",ticket.status);
    if(status===null)return;
    try {
      await api(`/api/admin/support/${ticket.id}`,{method:"PATCH",body:JSON.stringify({status,adminReply:reply})});
      setAdminTickets(await api("/api/admin/support"));
      setMessage("Support ticket updated.");
    } catch(e) { setMessage(e.message); }
  }
  async function updateAdminPayment(payment,status) {
    try {
      await api(`/api/admin/payments/${payment.id}`,{method:"PATCH",body:JSON.stringify({status})});
      setAdminPayments(await api("/api/admin/payments"));
      setMessage(`Payment for order #${payment.id} marked ${status.toLowerCase()}.`);
    } catch(e) { setMessage(e.message); }
  }
  async function applyCoupon() {
    try {
      const result=await api("/api/coupons/validate",{method:"POST",body:JSON.stringify({code:couponInput,subtotal})});
      setAppliedCoupon(result); setMessage(`Coupon ${result.code} applied: ${money(result.discount)} off.`);
    } catch(e) { setAppliedCoupon(null); setMessage(e.message); }
  }
  async function createCoupon(e) {
    e.preventDefault();
    try {
      const expiresAt=couponForm.expiresAt?new Date(couponForm.expiresAt).toISOString():"";
      await api("/api/admin/coupons",{method:"POST",body:JSON.stringify({...couponForm,expiresAt})});
      setCouponForm({code:"",discountPercent:10,expiresAt:"",maxUses:0});
      setAdminCoupons(await api("/api/admin/coupons"));
      setMessage("Coupon created.");
    } catch(e) { setMessage(e.message); }
  }
  async function toggleCoupon(coupon) {
    try {
      await api(`/api/admin/coupons/${coupon.id}`,{method:"PATCH",body:JSON.stringify({active:!coupon.active})});
      setAdminCoupons(await api("/api/admin/coupons"));
    } catch(e) { setMessage(e.message); }
  }
  async function saveStore(e) {
    e.preventDefault();
    try {
      await api("/api/merchant/store",{method:"PATCH",body:JSON.stringify(store)});
      setStore(await api("/api/merchant/store"));
      setMessage("Store profile saved.");
    } catch(e) { setMessage(e.message); }
  }
  async function saveSettings(e) {
    e.preventDefault();
    try {
      setSettings(await api("/api/admin/settings",{method:"PATCH",body:JSON.stringify(settings)}));
      setMessage("Platform settings saved.");
    } catch(e) { setMessage(e.message); }
  }
  async function removeMerchantProduct(product) {
    if(!window.confirm(`Remove ${product.name} from your storefront?`))return;
    try {
      await api(`/api/merchant/products/${product.id}`,{method:"DELETE"});
      await loadOrders(); await loadProducts(); setMessage("Product removed from the storefront.");
    } catch(e) { setMessage(e.message); }
  }
  async function markNotificationRead(notification) {
    try {
      await api(`/api/notifications/${notification.id}/read`,{method:"PATCH"});
      setNotifications(current=>current.map(n=>n.id===notification.id?{...n,read:1}:n));
    } catch(e) { setMessage(e.message); }
  }
  function useCurrentLocation() {
    if(!navigator.geolocation){setMessage("Location services are not available in this browser.");return;}
    navigator.geolocation.getCurrentPosition(({coords})=>{
      setCheckout(current=>({...current,pickup:`${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`}));
      setMessage("Pickup coordinates added. Confirm the location before placing your request.");
    },error=>{
      setMessage(error.code===error.PERMISSION_DENIED?"Location permission was denied.":error.code===error.TIMEOUT?"Location request timed out.":"Unable to determine your location.");
    },{enableHighAccuracy:true,timeout:10000,maximumAge:60000});
  }
  function openRoute(order) {
    const url=`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(order.pickup)}&destination=${encodeURIComponent(order.destination)}`;
    window.open(url,"_blank","noopener,noreferrer");
  }
  async function logout() {
    if(!window.confirm("Are you sure you want to sign out?"))return;
    await stopLocationSharing(false);
    setToken(""); setUser(null); localStorage.removeItem("sg_token"); localStorage.removeItem("sg_user");sessionStorage.removeItem("sg_token");sessionStorage.removeItem("sg_user");
    setOrders([]); setRiderOrders([]); setTab("Shop"); setMessage("You have signed out.");
  }
  async function placeOrder(e) {
    e.preventDefault(); setMessage("");
    try {
      if(tab==="Cart"&&!selectedCartItems.length){setMessage("Select at least one item to continue.");return;}
      const result = await api("/api/orders", { method:"POST", body:JSON.stringify({
        ...checkout, type:tab==="Cart"?"Shopping":checkout.type, scheduledAt:checkout.scheduledAt, couponCode:tab==="Cart"?appliedCoupon?.code||"": "", items:tab==="Cart"?selectedCartItems.map(p => ({ productId:p.id, quantity:p.quantity })):[]
      }) });
      if(tab==="Cart") {
        const purchasedIds=new Set(selectedCartItems.map(p=>p.id));
        setCart(current=>Object.fromEntries(Object.entries(current).filter(([id])=>!purchasedIds.has(Number(id)))));
        setSelectedCartIds(current=>Object.fromEntries(Object.entries(current).filter(([id])=>!purchasedIds.has(Number(id)))));
        setCheckoutOpen(false);setAppliedCoupon(null);setCouponInput("");
      }
      setMessage(`Order #${result.id} placed successfully. Estimated total: ${money(result.total)}.`);
      setTab("Orders"); await loadOrders(); await loadProducts();
    } catch (e) { setMessage(e.message); }
  }
  async function updateStatus(id, status) {
    let pin;
    if(status==="Delivered") pin=window.prompt("Enter the customer's delivery PIN:");
    try { await api(`/api/rider/orders/${id}/status`, { method:"PATCH", body:JSON.stringify({status,pin}) }); await loadOrders(); }
    catch(e) { setMessage(e.message); }
  }
  async function cancelOrder(id) { try { await api(`/api/orders/${id}/cancel`,{method:"PATCH"}); await loadOrders(); setMessage("Order cancelled."); } catch(e) { setMessage(e.message); } }
  async function acceptOrder(id) { if(!riderOnline){setMessage("Go online before accepting a delivery.");return;} try { await api(`/api/rider/orders/${id}/accept`,{method:"PATCH"}); await loadOrders(); setMessage("Delivery accepted."); } catch(e) { setMessage(e.message); } }
  async function updateMerchantOrder(id,status) { try { await api(`/api/merchant/orders/${id}/status`,{method:"PATCH",body:JSON.stringify({status})}); await loadOrders(); } catch(e) { setMessage(e.message); } }
  async function setAvailability(online) { try { if(!online)await stopLocationSharing(false);await api("/api/rider/availability",{method:"PATCH",body:JSON.stringify({online})}); setRiderOnline(online); } catch(e) { setMessage(e.message); } }
  async function addMerchantProduct(e) { e.preventDefault(); try { await api("/api/merchant/products",{method:"POST",body:JSON.stringify(productForm)}); setProductForm({name:"",category:"Food",description:"",price:"",stock:"10"}); await loadOrders(); await loadProducts(); setMessage("Product added to your store."); } catch(e) { setMessage(e.message); } }
  async function editMerchantProduct(product) { const price=window.prompt("Set unit price in PHP:",String(product.price)); if(price===null)return; const stock=window.prompt("Set available stock:",String(product.stock)); if(stock===null)return; try { await api(`/api/merchant/products/${product.id}`,{method:"PATCH",body:JSON.stringify({price:Number(price),stock:Number(stock)})}); await loadOrders(); await loadProducts(); setMessage("Product inventory updated."); } catch(e) { setMessage(e.message); } }
  async function approveStore(id, approved) { try { await api(`/api/admin/stores/${id}/approve`,{method:"PATCH",body:JSON.stringify({approved})}); setAdminStores(await api("/api/admin/stores")); } catch(e) { setMessage(e.message); } }
  async function updateAdminUser(account, updates) {
    try {
      await api(`/api/admin/users/${account.id}`, {
        method:"PATCH",
        body:JSON.stringify({
          role:account.role,
          verified:Boolean(account.verified),
          suspended:Boolean(account.suspended),
          ...updates
        })
      });
      setAdminUsers(await api("/api/admin/users"));
    } catch(e) { setMessage(e.message); }
  }
  async function toggleAdminProduct(product) {
    try {
      await api(`/api/admin/products/${product.id}`,{method:"PATCH",body:JSON.stringify({active:!product.active})});
      setAdminProducts(await api("/api/admin/products"));
      await loadProducts();
    } catch(e) { setMessage(e.message); }
  }
  async function saveProfile(e) { e.preventDefault(); try { await api("/api/profile",{method:"PATCH",body:JSON.stringify(profile)}); setMessage("Profile saved."); } catch(e) { setMessage(e.message); } }
  function add(id) { const product=products.find(p=>p.id===id); if(!product)return; if((cart[id]||0)>=product.stock){setMessage("You have reached the available stock for this product.");return;} setCart(old=>({...old,[id]:(old[id]||0)+1}));setSelectedCartIds(current=>({...current,[id]:true}));setAppliedCoupon(null);setMessage(`${product.name} added to your cart.`); }
  function buyNow(id) {
    const product=products.find(p=>p.id===id);
    if(!product||product.stock<1){setMessage("This product is currently unavailable.");return;}
    setCart(current=>({...current,[id]:Math.max(current[id]||0,1)}));
    setSelectedCartIds({...Object.fromEntries(Object.keys(cart).map(itemId=>[itemId,false])),[id]:true});
    setAppliedCoupon(null);setCheckoutOpen(true);setSelectedProduct(null);setTab("Cart");
  }
  function toggleCartItem(id, selected) { setSelectedCartIds(current=>({...current,[id]:selected}));setAppliedCoupon(null); }
  function changeQty(id, qty) {
    const product=products.find(p=>p.id===id);
    if(product&&qty>product.stock){setMessage("You have reached the available stock for this product.");return;}
    setCart(old=>{const next={...old};if(qty<=0)delete next[id];else next[id]=qty;return next;});
    if(qty<=0)setSelectedCartIds(current=>{const next={...current};delete next[id];return next;});
    setAppliedCoupon(null);
  }

  return <div className="app">
    <header className={tab==="Shop"&&!staffRole?"topbar marketplace-topbar":"topbar"}>
      <a className="brand" href="#" onClick={e=>{e.preventDefault();setTab(staffRole?dashboardTab:"Shop")}}><span className="brandmark">S</span><span>ShopEase <b>Cebu Go</b><small>{staffRole?`${user.role.toUpperCase()} DASHBOARD`:"SHOP • SEND • GO"}</small></span></a>
      {tab==="Shop"&&!staffRole&&<label className="market-search"><span aria-hidden="true">⌕</span><input aria-label="Search Cebu local finds" placeholder="Search Cebu local finds..." value={search} onChange={e=>setSearch(e.target.value)}/><span aria-hidden="true">▢</span></label>}
      <button className="menu-toggle outline small" type="button" onClick={()=>setMenuOpen(open=>!open)} aria-expanded={menuOpen} aria-label={menuOpen?"Close navigation":"Open navigation"}>{menuOpen?"×":"☰"}</button>
      <nav className={menuOpen?"open":""}>{!staffRole&&["Shop","Delivery","Orders","Favorites","Support"].map(t=><button className={tab===t?"nav active":"nav"} key={t} onClick={()=>{setTab(t);setMenuOpen(false)}}>{t}</button>)}
        {user?.role==="rider" && <button className={tab==="Rider"?"nav active":"nav"} onClick={()=>{setTab("Rider");setMenuOpen(false)}}>Dashboard</button>}
        {user?.role==="merchant" && <button className={tab==="Merchant"?"nav active":"nav"} onClick={()=>{setTab("Merchant");setMenuOpen(false)}}>Dashboard</button>}
        {user?.role==="admin" && <button className={tab==="Admin"?"nav active":"nav"} onClick={()=>{setTab("Admin");setMenuOpen(false)}}>Dashboard</button>}
        {user&&<button className={tab==="Updates"?"nav active":"nav"} onClick={()=>{setTab("Updates");setMenuOpen(false)}}>Updates {notifications.some(n=>!n.read)&&<b>({notifications.filter(n=>!n.read).length})</b>}</button>}
        {user&&<button className={tab==="Profile"?"nav active mobile-only":"nav mobile-only"} onClick={()=>{setTab("Profile");setMenuOpen(false)}}>Profile</button>}
        {user&&<button className="nav mobile-only" onClick={()=>{logout();setMenuOpen(false)}}>Sign out</button>}
      </nav>
      <div className="account">{user ? <><span className="userchip">{user.name} · {user.role}</span><button className="outline small" onClick={logout}>Sign out</button></> : <button className="primary small" onClick={()=>setTab("Account")}>Sign in</button>}
        {user&&<button className="outline small" onClick={()=>setTab("Profile")}>Profile</button>}
        <button className="cartbtn" onClick={()=>setTab("Cart")}>🛒 Cart <b>{count}</b></button>
      </div>
    </header>

    <main className={staffRole?"dashboard-main":"storefront-main"}>
      {!staffRole&&tab==="Shop"&&<section className="marketplace-hero">
        <div className="marketplace-hero-copy"><span className="eyebrow">CEBU LOCAL SPOTLIGHT</span><h1>Good finds,<br/><em>delivered your way.</em></h1><p>Discover neighborhood favorites, fresh groceries, and everyday essentials from Cebu sellers.</p><div className="heroactions"><button className="market-primary" onClick={()=>{setCategory("All");document.getElementById("market-products")?.scrollIntoView({behavior:"smooth"})}}>Explore local picks <span>→</span></button><button className="market-light" onClick={()=>setTab("Delivery")}>Send a parcel</button></div><div className="marketplace-points"><span>✓ Local sellers</span><span>✓ Easy checkout</span><span>✓ Rider delivery</span></div></div>
        <div className="marketplace-art" aria-hidden="true"><div className="marketplace-sun"></div><span className="market-emoji market-mango">🥭</span><span className="market-emoji market-basket">🧺</span><span className="market-emoji market-bike">🛵</span><div className="art-label">A little Cebu, at your door</div></div>
      </section>}
      {!staffRole&&tab!=="Shop"&&tab!=="Account"&&<section className="hero">
        <div><span className="eyebrow">YOUR LOCAL CONVENIENCE PARTNER</span><h1>From local shops<br/><em>to your doorstep.</em></h1>
          <p>Shop Cebu favorites, send a parcel, or request a pasabuy. One easy place to get things moving.</p>
          <div className="heroactions"><button className="whitebtn" onClick={()=>setTab("Shop")}>Explore shops <span>→</span></button><button className="ghostbtn" onClick={()=>setTab("Delivery")}>Book a delivery</button></div>
          <div className="herofoot"><span>● Local finds</span><span>● Easy ordering</span><span>● Rider-powered</span></div>
        </div>
        <div className="heroart"><div className="sun"></div><div className="deliverycard"><span className="bike">🛵</span><div><b>Your order is on the way</b><small>Local delivery made simple</small></div><span className="check">✓</span></div><div className="floating f1">🥭 Fresh finds</div><div className="floating f2">📦 Send a parcel</div></div>
      </section>}

      {message && <div className="notice"><span>{message}</span><button onClick={()=>setMessage("")}>×</button></div>}

      {tab==="Shop" && <section className="section marketplace-section">
        <div className="marketplace-shortcuts"><span className="shortcut-heading">Explore by category</span><div className="category-shortcuts">{categories.map(c=><button key={c} className={category===c?"category-shortcut active":"category-shortcut"} onClick={()=>setCategory(c)}><span>{categoryEmoji(c)}</span><small>{c==="All"?"All finds":c}</small></button>)}<button className="category-shortcut" onClick={()=>setTab("Delivery")}><span>🛵</span><small>Delivery</small></button></div></div>
        <div className="marketplace-promos">
          <article className="market-promo promo-groceries"><div><span>CEBU MARKET FINDS</span><h3>Fresh picks<br/>for your table</h3><button onClick={()=>{setCategory("Groceries");document.getElementById("market-products")?.scrollIntoView({behavior:"smooth"})}}>Shop groceries →</button></div><span className="promo-art-emoji" aria-hidden="true">🥭</span></article>
          <article className="market-promo promo-pasabuy"><div><span>YOUR LIST, OUR RIDE</span><h3>Need a hand<br/>with errands?</h3><button onClick={()=>{setCheckout(current=>({...current,type:"Pasabuy"}));setTab("Delivery")}}>Try pasabuy →</button></div><span className="promo-art-emoji" aria-hidden="true">🛵</span></article>
          <article className="market-promo promo-pay"><div><span>CHECKOUT YOUR WAY</span><h3>Cash or<br/>e-wallet options</h3><p>GCash/Maya require manual confirmation.</p><button onClick={()=>setTab("Cart")}>View cart →</button></div><span className="promo-art-emoji" aria-hidden="true">💳</span></article>
        </div>
        {!search&&category==="All"&&featuredProducts.length>0&&<section className="featured-section" aria-labelledby="featured-heading">
          <div className="featured-heading"><div><span className="eyebrow">PICKS FROM LOCAL SELLERS</span><h2 id="featured-heading">Featured Cebu finds</h2></div><button className="textbtn" onClick={()=>{setSort("featured");document.getElementById("market-products")?.scrollIntoView({behavior:"smooth"})}}>Browse all products ↓</button></div>
          <div className="featured-products">{featuredProducts.map((p,i)=><article className={`featured-product pic${i%5}`} key={p.id}>
            <button className="featured-visual" onClick={()=>openProduct(p)} aria-label={`View ${p.name} details`}><span>{categoryEmoji(p.category)}</span><small>{p.category}</small></button>
            <div className="featured-info"><button className="featured-title" onClick={()=>openProduct(p)}>{p.name}</button><div><b>{money(p.price)}</b><button className="add small" onClick={()=>add(p.id)}>+ Add</button></div></div>
          </article>)}</div>
        </section>}
        <div className="sectionhead marketplace-sectionhead" id="market-products"><div><span className="eyebrow">DISCOVER SOMETHING GOOD</span><h2>Shop local favorites</h2><p>Everyday essentials and neighborhood favorites.</p></div></div>
        <label className="sortlabel">Sort products <select value={sort} onChange={e=>setSort(e.target.value)}><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="rating">Top rated</option></select></label>
        <div className="chips">{categories.map(c=><button key={c} className={category===c?"chip selected":"chip"} onClick={()=>setCategory(c)}>{c}</button>)}</div>
        {visible.length===0?<div className="empty">No products match that search. Try another keyword or category.</div>:<div className="products">{visible.map((p,i)=><article className="product" key={p.id}><div className={`productpic pic${i%5}`}><span>{categoryEmoji(p.category)}</span><small>{p.category} · {p.stock} available</small></div><div className="productbody"><h3><button className="product-title" onClick={()=>openProduct(p)}>{p.name}</button></h3><p>{p.description}</p>{p.store_name&&<small className="store-name">{p.store_name}</small>}<small className="rating">{p.rating?`★ ${p.rating} · ${p.review_count} reviews`:"No reviews yet"}</small><div className="productbottom"><b>{money(p.price)}</b><div><button className="textbtn" onClick={()=>toggleFavorite(p.id)} aria-label="Toggle favorite">{favorites.some(f=>f?.id===p.id)?"♥":"♡"}</button><button className="textbtn" onClick={()=>openProduct(p)}>Details</button><button className="textbtn" onClick={()=>saveReview(p)}>Review</button><button className="add" onClick={()=>add(p.id)}>+ Add</button></div></div></div></article>)}</div>}
      </section>}

      {tab==="Delivery" && <section className="section narrow"><span className="eyebrow">ON-DEMAND COURIER</span><h2>Book a delivery</h2><p>Send parcels or ask a rider to buy something for you.</p>
        <form className="panel formgrid" onSubmit={placeOrder}>
          <label>Service type<select value={checkout.type} onChange={e=>setCheckout({...checkout,type:e.target.value})}><option>Delivery</option><option>Pasabuy</option></select></label>
          <label>Pickup location<input required value={checkout.pickup} onChange={e=>setCheckout({...checkout,pickup:e.target.value})} placeholder="Where should the rider pick up?"/><button type="button" className="outline small" onClick={useCurrentLocation}>Use my current coordinates</button></label>
          <label>Delivery address<input required value={checkout.destination} onChange={e=>setCheckout({...checkout,destination:e.target.value})} placeholder="Where should we deliver?"/></label>
          <label>Instructions<textarea value={checkout.notes} onChange={e=>setCheckout({...checkout,notes:e.target.value})} placeholder="Parcel details, shopping list, contact notes..."/></label>
          <label>Schedule (optional)<input type="datetime-local" value={checkout.scheduledAt||""} onChange={e=>setCheckout({...checkout,scheduledAt:e.target.value})}/></label>
          <label>Payment method<select value={checkout.paymentMethod} onChange={e=>setCheckout({...checkout,paymentMethod:e.target.value})}><option>Cash on Delivery</option><option>GCash (manual confirmation)</option><option>Maya (manual confirmation)</option><option>Cash to Rider</option></select></label>
          {checkout.paymentMethod.includes("manual confirmation")&&<><label>Transaction reference<input maxLength="100" value={checkout.paymentReference} onChange={e=>setCheckout({...checkout,paymentReference:e.target.value})} placeholder="Optional until payment is made"/></label><small className="provider-note">GCash/Maya are not connected. Payment must be sent outside this demo and reviewed manually by an administrator. Never enter PINs or passwords.</small></>}
          <div className="fee"><span>Estimated service fee</span><b>{money(settings.service_delivery_fee)}</b><small>Current demo fee. Distance-based pricing is not configured.</small></div>
          <button className="primary wide" type="submit" disabled={!token}> {token?"Request a rider":"Sign in to book a delivery"} →</button>
        </form>
      </section>}

      {tab==="Cart" && <section className="section narrow"><span className="eyebrow">YOUR SHOPPING BAG</span><h2>Shopping cart</h2>
        {!cartItems.length?<div className="empty">Your cart is waiting for something good. <button className="textbtn" onClick={()=>setTab("Shop")}>Continue shopping →</button></div>:
        <div className="panel">
          <div className="cart-selection"><label className="cart-check"><input type="checkbox" checked={allCartSelected} onChange={e=>{setSelectedCartIds(Object.fromEntries(cartItems.map(p=>[p.id,e.target.checked])));setAppliedCoupon(null);}}/>Select all items</label><span>{selectedCount} selected</span></div>
          <div className="cartrows">{cartItems.map(p=><div className="cartrow" key={p.id}>
            <label className="cart-check cart-item-check"><input type="checkbox" checked={selectedCartIds[p.id]!==false} onChange={e=>toggleCartItem(p.id,e.target.checked)} aria-label={`Select ${p.name}`}/></label>
            <div className="cart-product"><b>{p.name}</b><small>{money(p.price)} each · {p.stock} available</small></div>
            <div className="qty"><button aria-label={`Decrease ${p.name} quantity`} onClick={()=>changeQty(p.id,p.quantity-1)}>−</button><b>{p.quantity}</b><button aria-label={`Increase ${p.name} quantity`} onClick={()=>changeQty(p.id,p.quantity+1)}>+</button></div>
            <b className="cart-line-total">{money(p.price*p.quantity)}</b>
          </div>)}</div>
          {!selectedCartItems.length?<div className="empty cart-empty-selection">Select at least one product to continue.</div>:<>
            <div className="coupon-box"><label>Discount code<input maxLength="30" value={couponInput} onChange={e=>setCouponInput(e.target.value.toUpperCase())} placeholder="Enter coupon code"/></label><div className="row-actions">{appliedCoupon?<><span className="status">{appliedCoupon.code} applied</span><button type="button" className="outline small" onClick={()=>setAppliedCoupon(null)}>Remove</button></>:<button type="button" className="outline small" disabled={!token||!couponInput.trim()} onClick={applyCoupon}>Apply code</button>}</div></div>
            <div className="totalrow"><span>Subtotal ({selectedCount} items)</span><b>{money(subtotal)}</b></div>{appliedCoupon&&<div className="totalrow"><span>Discount ({appliedCoupon.discountPercent}%)</span><b>−{money(appliedCoupon.discount)}</b></div>}<div className="totalrow"><span>Delivery fee</span><b>{money(settings.shopping_delivery_fee)}</b></div><div className="totalrow grand"><span>Total</span><b>{money(subtotal+Number(settings.shopping_delivery_fee||0)-Number(appliedCoupon?.discount||0))}</b></div>
            {!checkoutOpen?<button className="primary wide checkout-start" type="button" onClick={()=>token?setCheckoutOpen(true):setTab("Account")}>{token?`Proceed to checkout · ${selectedCount}`:"Sign in to continue"} →</button>:
              <form className="formgrid checkout" onSubmit={placeOrder}><h3>Shipping and payment</h3><label>Pickup location<input required value={checkout.pickup} onChange={e=>setCheckout({...checkout,pickup:e.target.value})}/></label><label>Delivery address<input required value={checkout.destination} onChange={e=>setCheckout({...checkout,destination:e.target.value})} placeholder="Complete delivery address"/></label><label>Payment method<select value={checkout.paymentMethod} onChange={e=>setCheckout({...checkout,paymentMethod:e.target.value})}><option>Cash on Delivery</option><option>GCash (manual confirmation)</option><option>Maya (manual confirmation)</option><option>Cash to Rider</option></select></label>{checkout.paymentMethod.includes("manual confirmation")&&<><label>Transaction reference<input maxLength="100" value={checkout.paymentReference} onChange={e=>setCheckout({...checkout,paymentReference:e.target.value})} placeholder="Optional until payment is made"/></label><small className="provider-note">No online payment API is connected. Never enter your PIN or password.</small></>}{token?<button className="primary wide">Place order · {money(subtotal+Number(settings.shopping_delivery_fee||0)-Number(appliedCoupon?.discount||0))}</button>:<button type="button" className="primary wide" onClick={()=>setTab("Account")}>Sign in to place order →</button>}</form>}
          </>}
        </div>}
      </section>}
      {tab === "Orders" && <section className="section">
        <span className="eyebrow">YOUR ACTIVITY</span>
        <h2>Order history</h2>
        {!user ? <div className="empty">Sign in to see your orders.</div> : orders.length === 0 ? <div className="empty">No orders yet. Your next delivery starts here.</div> : <div className="orders">{orders.map(o => <div className="order" key={o.id}><div><b>Order #{o.id} · {o.type}</b><small>{o.created_at}</small><small>{o.pickup} → {o.destination}</small>{o.scheduled_at && <small>Scheduled: {o.scheduled_at}</small>}<button className="textbtn" onClick={()=>openOrder(o.id)}>View details and tracking →</button></div><div className="orderend"><span className="status">{o.status}</span><b>{money(o.total)}</b>{o.status === "Pending" && <button className="outline small" onClick={() => cancelOrder(o.id)}>Cancel</button>}</div></div>)}</div>}
        <div className="section narrow" style={{ marginTop: 20 }}>
          <h3>Delivery handoff PINs</h3>
          <p>Share the PIN with your rider at the door to confirm delivery.</p>
          {orders.filter(o => o.status !== "Delivered" && o.status !== "Cancelled" && o.delivery_pin).map(o => <div className="panel" key={o.id}>Order #{o.id}: <b className="pin">{o.delivery_pin}</b></div>)}
        </div>
      </section>}

      {tab==="Favorites" && <section className="section">
        <span className="eyebrow">YOUR SAVED FINDS</span><h2>Favorites</h2>
        {!user?<div className="empty">Sign in to save and revisit favorite products. <button className="textbtn" onClick={()=>setTab("Account")}>Sign in →</button></div>:favorites.length===0?<div className="empty">No favorites yet. Tap the heart on a product to save it.</div>:<div className="products">{favorites.map(p=><article className="product" key={p.id}><div className="productpic"><span>{p.category==="Food"?"🍱":p.category==="Groceries"?"🥭":"🧺"}</span><small>{p.category} · {p.stock} available</small></div><div className="productbody"><h3>{p.name}</h3><p>{p.description}</p><div className="productbottom"><b>{money(p.price)}</b><div><button className="textbtn" onClick={()=>toggleFavorite(p.id)}>Remove</button><button className="add" onClick={()=>add(p.id)}>+ Add</button></div></div></div></article>)}</div>}
      </section>}

      {tab==="Support" && <section className="section narrow">
        <span className="eyebrow">WE’RE HERE TO HELP</span><h2>Customer support</h2>
        {!user?<div className="empty">Sign in to send a support request and follow its status.</div>:user.role!=="customer"?<div className="empty">Customer support requests are available from customer accounts.</div>:<>
          <form className="panel formgrid" onSubmit={submitSupport}>
            <label>Topic<select value={supportForm.category} onChange={e=>setSupportForm({...supportForm,category:e.target.value})}><option>General</option><option>Order</option><option>Payment</option><option>Delivery</option><option>Account</option></select></label>
            <label>Subject<input required minLength="3" maxLength="120" value={supportForm.subject} onChange={e=>setSupportForm({...supportForm,subject:e.target.value})}/></label>
            <label>How can we help?<textarea required minLength="5" maxLength="2000" value={supportForm.message} onChange={e=>setSupportForm({...supportForm,message:e.target.value})}/></label>
            <button className="primary wide">Send request</button>
          </form>
          <h3 className="subhead">Your requests</h3>
          {supportTickets.length===0?<div className="empty">You have no support requests.</div>:<div className="orders">{supportTickets.map(ticket=><div className="order" key={ticket.id}><div><b>#{ticket.id} · {ticket.subject}</b><small>{ticket.category} · {ticket.created_at}</small><small>{ticket.message}</small>{ticket.admin_reply&&<small className="support-reply">Support: {ticket.admin_reply}</small>}</div><div className="orderend"><span className="status">{ticket.status}</span></div></div>)}</div>}
        </>}
      </section>}

      {tab === "Rider" && <section className="section dashboard-section">
        <div className="dashboard-heading">
          <span className="eyebrow">RIDER WORKSPACE</span>
          <h2>Delivery requests</h2>
          <p>Manage incoming deliveries and track completed work.</p>
          <button className={riderOnline ? "primary" : "outline"} onClick={() => setAvailability(!riderOnline)}>{riderOnline ? "Online · accepting requests" : "Offline · go online"}</button>
        </div>
        {riderOrders.length === 0 ? <div className="empty">No active delivery requests right now.</div> : <div className="orders">{riderOrders.map(o => {
          const assignedToMe=Number(o.rider_id)===Number(user?.id);
          const canShareLocation=assignedToMe&&ACTIVE_TRIP_STATUSES.includes(o.status);
          const sharing=Number(sharingOrderId)===Number(o.id);
          return <div className="order" key={o.id}>
            <div><b>Order #{o.id} · {o.type}</b><small>Customer: {o.customer_name}</small>{o.items_summary&&<small>Items: {o.items_summary}</small>}<small>{o.pickup} → {o.destination}</small><small>{o.notes}</small>{assignedToMe&&<button type="button" className="outline small" onClick={()=>openRoute(o)}>Open route in Maps ↗</button>}{["Pending", "Ready for Pickup"].includes(o.status) && <button className="add" onClick={() => acceptOrder(o.id)}>Accept delivery</button>}
              {canShareLocation&&<button type="button" className={sharing?"outline small live-share-active":"outline small"} onClick={()=>sharing?stopLocationSharing(true):startLocationSharing(o.id)}>{sharing?"Stop live location sharing":"Share live location with customer"}</button>}
            </div>
            <div className="orderend"><span className="status">{o.status}</span><b>{money(o.total)}</b>{assignedToMe&&<select onChange={e=>updateStatus(o.id,e.target.value)} value={o.status}><option>Accepted</option><option>Picked Up</option><option>On the Way</option><option>Delivered</option><option>Cancelled</option></select>}</div>
          </div>;
        })}</div>}

        <h3 className="subhead">Delivery history</h3>
        <div className="stats">
          <div><small>Completed deliveries</small><b>{riderHistory.orders.filter(o => o.status === "Delivered").length}</b></div>
          <div><small>Estimated earnings</small><b>{money(riderHistory.earnings)}</b></div>
        </div>
        {riderHistory.orders.length === 0 ? <div className="empty">Completed deliveries will appear here.</div> : <div className="orders">{riderHistory.orders.map(o => <div className="order" key={o.id}><div><b>Order #{o.id} · {o.type}</b><small>{o.created_at}</small><small>{o.pickup} → {o.destination}</small></div><div className="orderend"><span className="status">{o.status}</span><b>{o.status === "Delivered" ? money(o.delivery_fee) : "—"}</b></div></div>)}</div>}
      </section>}

      {tab === "Admin" && <section className="section dashboard-section">
        <div className="dashboard-heading">
          <span className="eyebrow">OPERATIONS OVERVIEW</span>
          <h2>Admin dashboard</h2>
          <p>Monitor orders, users, riders, and merchant applications.</p>
        </div>
        {adminSummary && <><div className="stats"><div><small>Total orders</small><b>{adminSummary.orders}</b></div><div><small>Recorded sales</small><b>{money(adminSummary.sales)}</b></div><div><small>Customers</small><b>{adminSummary.customers}</b></div><div><small>Riders</small><b>{adminSummary.riders}</b></div><div><small>Merchants</small><b>{adminSummary.merchants}</b></div><div><small>Pending stores</small><b>{adminSummary.pendingStores}</b></div></div><div className="chips">{adminSummary.statuses.map(item=><span className="chip" key={item.status}>{item.status}: {item.count}</span>)}</div></>}

        <h3 className="subhead">All orders</h3>
        <div className="orders">{orders.map(o => <div className="order" key={o.id}><div><b>#{o.id} · {o.customer_name} · {o.type}</b><small>{o.pickup} → {o.destination}</small></div><div className="orderend"><span className="status">{o.status}</span><b>{money(o.total)}</b></div></div>)}</div>

        <h3 className="subhead">Product catalogue</h3>
        <div className="orders">{adminProducts.map(product=><div className="order" key={product.id}><div><b>{product.name}</b><small>{product.store_name||"Platform catalog"} · {product.category} · {product.stock} in stock</small></div><div className="orderend"><span className="status">{product.active?"Visible":"Hidden"}</span><button className="outline small" onClick={()=>toggleAdminProduct(product)}>{product.active?"Hide product":"Restore product"}</button></div></div>)}</div>

        <h3 className="subhead">Payment records</h3>
        {adminPayments.length===0?<div className="empty">No payment records yet.</div>:<div className="orders">{adminPayments.map(payment=><div className="order" key={payment.id}><div><b>Order #{payment.id} · {payment.customer_name}</b><small>{payment.payment_method} · {payment.payment_reference||"No reference submitted"}</small><small>{payment.created_at} · {money(payment.total)}</small></div><div className="orderend"><span className="status">{payment.payment_status}</span>{payment.payment_status==="Awaiting Manual Confirmation"&&<div className="row-actions"><button className="primary small" onClick={()=>updateAdminPayment(payment,"Paid")}>Confirm</button><button className="outline small" onClick={()=>updateAdminPayment(payment,"Rejected")}>Reject</button></div>}</div></div>)}</div>}

        <h3 className="subhead">Merchant applications</h3>
        <div className="orders">{adminStores.map(s => <div className="order" key={s.id}><div><b>{s.name}</b><small>{s.email}</small><small>{s.description}</small></div><button className={s.approved ? "outline small" : "primary small"} onClick={() => approveStore(s.id, !s.approved)}>{s.approved ? "Revoke approval" : "Approve store"}</button></div>)}</div>

        <h3 className="subhead">User accounts</h3>
        <div className="orders">{adminUsers.map(u => <div className="order" key={u.id}>
          <div><b>{u.name} · {u.role}</b><small>{u.email}</small><small>{u.suspended ? "Suspended" : u.role === "customer" ? "Active" : u.verified ? "Verified" : "Pending verification"}</small></div>
          <div className="orderend">
            {u.role !== "customer" && <button className={u.verified ? "outline small" : "primary small"} onClick={() => updateAdminUser(u, { verified:!u.verified })}>{u.verified ? "Unverify" : "Verify account"}</button>}
            <button className={u.suspended ? "primary small" : "outline small"} onClick={() => updateAdminUser(u, { suspended:!u.suspended })}>{u.suspended ? "Reactivate" : "Suspend"}</button>
          </div>
        </div>)}</div>

        <h3 className="subhead">Platform settings</h3>
        <form className="panel formgrid settings-grid" onSubmit={saveSettings}>
          <label>Shopping delivery fee (PHP)<input required type="number" min="0" max="10000" step="0.01" value={settings.shopping_delivery_fee} onChange={e=>setSettings({...settings,shopping_delivery_fee:Number(e.target.value)})}/></label>
          <label>Delivery / pasabuy service fee (PHP)<input required type="number" min="0" max="10000" step="0.01" value={settings.service_delivery_fee} onChange={e=>setSettings({...settings,service_delivery_fee:Number(e.target.value)})}/></label>
          <label>Merchant commission (%)<input required type="number" min="0" max="50" step="0.1" value={settings.merchant_commission_percent} onChange={e=>setSettings({...settings,merchant_commission_percent:Number(e.target.value)})}/></label>
          <small>Commission is recorded as a setting only; merchant payouts are not processed.</small>
          <button className="primary wide">Save settings</button>
        </form>

        <h3 className="subhead">Discount coupons</h3>
        <form className="panel formgrid settings-grid" onSubmit={createCoupon}>
          <label>Coupon code<input required minLength="3" maxLength="30" pattern="[A-Za-z0-9_-]+" value={couponForm.code} onChange={e=>setCouponForm({...couponForm,code:e.target.value.toUpperCase()})}/></label>
          <label>Discount (%)<input required type="number" min="1" max="100" step="1" value={couponForm.discountPercent} onChange={e=>setCouponForm({...couponForm,discountPercent:Number(e.target.value)})}/></label>
          <label>Expires (optional)<input type="datetime-local" value={couponForm.expiresAt} onChange={e=>setCouponForm({...couponForm,expiresAt:e.target.value})}/></label>
          <label>Maximum uses (0 = unlimited)<input required type="number" min="0" step="1" value={couponForm.maxUses} onChange={e=>setCouponForm({...couponForm,maxUses:Number(e.target.value)})}/></label>
          <button className="primary wide">Create coupon</button>
        </form>
        {adminCoupons.length===0?<div className="empty">No discount coupons created yet.</div>:<div className="orders">{adminCoupons.map(coupon=><div className="order" key={coupon.id}><div><b>{coupon.code} · {coupon.discount_percent}% off</b><small>{coupon.expires_at?`Expires ${coupon.expires_at}`:"No expiration"} · {coupon.uses_count}/{coupon.max_uses||"∞"} uses</small></div><div className="orderend"><span className="status">{coupon.active?"Active":"Inactive"}</span><button className="outline small" onClick={()=>toggleCoupon(coupon)}>{coupon.active?"Deactivate":"Activate"}</button></div></div>)}</div>}

        <h3 className="subhead">Customer support requests</h3>
        {adminTickets.length===0?<div className="empty">No customer support requests.</div>:<div className="orders">{adminTickets.map(ticket=><div className="order" key={ticket.id}><div><b>#{ticket.id} · {ticket.subject}</b><small>{ticket.customer_name} · {ticket.email} · {ticket.category}</small><small>{ticket.message}</small>{ticket.admin_reply&&<small>Reply: {ticket.admin_reply}</small>}</div><div className="orderend"><span className="status">{ticket.status}</span><button className="outline small" onClick={()=>updateSupportTicket(ticket)}>Update request</button></div></div>)}</div>}
      </section>}

      {tab === "Account" && <section className="auth-page"><div className="auth-card">
        {authView==="form"&&<><button type="button" className="auth-back" onClick={()=>setTab("Shop")} aria-label="Back to shop">‹</button><span className="eyebrow">SHOPEASE CEBU GO</span><h2>{authMode==="login"?"Sign In":"Sign Up"}</h2><p className="auth-intro">{authMode==="login"?"Log in to oversee your deliveries. Need to reset your password?":"Create an account to shop local finds and manage deliveries."}</p>
          {authMode==="login"?<form className="auth-form" onSubmit={authenticate}>
            <label>Phone Number or Email<input required autoComplete="username" value={authForm.email} onChange={e=>setAuthForm({...authForm,email:e.target.value})} placeholder="Phone number or email"/></label>
            <label>Password<input required autoComplete="current-password" type="password" value={authForm.password} onChange={e=>setAuthForm({...authForm,password:e.target.value})} placeholder="Enter password"/></label>
            <div className="auth-options"><label className="auth-remember"><input type="checkbox" checked={authRemember} onChange={e=>setAuthRemember(e.target.checked)}/>Remember me</label><button type="button" className="auth-link" onClick={()=>beginOtpFlow("reset")}>Forgot password?</button></div>
            <button className="auth-submit" type="submit">Log In</button>
            <div className="auth-divider"><span>OR</span></div>
            <button type="button" className="auth-secondary" onClick={()=>beginOtpFlow("login")}>Sign in with a one-time code</button>
            <p className="auth-switch">Haven’t any account? <button type="button" className="auth-link" onClick={toggleAuthMode}>Sign Up</button></p>
          </form>:<form className="auth-form" onSubmit={authenticate}>
            <div className="auth-segment" role="group" aria-label="Choose account type">
              <button type="button" aria-pressed={authForm.role==="customer"} className={authForm.role==="customer"?"active":""} onClick={()=>setAuthForm({...authForm,role:"customer"})}>Person</button>
              <button type="button" aria-pressed={authForm.role==="merchant"} className={authForm.role==="merchant"?"active":""} onClick={()=>setAuthForm({...authForm,role:"merchant"})}>Store</button>
              <button type="button" aria-pressed={authForm.role==="rider"} className={authForm.role==="rider"?"active":""} onClick={()=>setAuthForm({...authForm,role:"rider"})}>Rider</button>
            </div>
            <label>First Name<input required maxLength="50" autoComplete="given-name" value={authForm.firstName} onChange={e=>setAuthForm({...authForm,firstName:e.target.value})} placeholder="First name"/></label>
            <label>Last Name<input required maxLength="50" autoComplete="family-name" value={authForm.lastName} onChange={e=>setAuthForm({...authForm,lastName:e.target.value})} placeholder="Last name"/></label>
            <label>Email<input required type="email" autoComplete="email" value={authForm.email} onChange={e=>setAuthForm({...authForm,email:e.target.value})} placeholder="Email address"/></label>
            <label>Phone Number<input required type="tel" autoComplete="tel" value={authForm.phone} onChange={e=>setAuthForm({...authForm,phone:e.target.value})} placeholder="+63 9XX XXX XXXX"/></label>
            <label>Password<input required type="password" minLength="8" autoComplete="new-password" value={authForm.password} onChange={e=>setAuthForm({...authForm,password:e.target.value})} placeholder="At least 8 characters"/></label>
            <label>Confirm Password<input required type="password" minLength="8" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Re-enter password"/></label>
            <div className="auth-delivery"><span>Verify with</span><div className="auth-segment auth-segment-small" role="group" aria-label="OTP delivery method"><button type="button" aria-pressed={authOtpChannel==="phone"} className={authOtpChannel==="phone"?"active":""} onClick={()=>setAuthOtpChannel("phone")}>Phone</button><button type="button" aria-pressed={authOtpChannel==="email"} className={authOtpChannel==="email"?"active":""} onClick={()=>setAuthOtpChannel("email")}>Email</button></div></div>
            <label className="auth-remember"><input type="checkbox" checked={authRemember} onChange={e=>setAuthRemember(e.target.checked)}/>Remember me</label>
            <button className="auth-submit" type="submit">Continue with OTP</button>
            <p className="auth-switch">Already have an account? <button type="button" className="auth-link" onClick={toggleAuthMode}>Sign In</button></p>
          </form>}
          <div className="demo auth-demo"><b>Demo accounts</b><small>Customer: customer@shopease.local</small><small>Rider: rider@shopease.local</small><small>Merchant: merchant@shopease.local</small><small>Admin: admin@shopease.local</small><small>Password for all: password123</small></div>
        </>}
        {authView==="send"&&<><button type="button" className="auth-back" onClick={()=>setAuthView("form")} aria-label="Back to sign in">‹</button><span className="eyebrow">ACCOUNT VERIFICATION</span><h2>{otpPurpose==="reset"?"Reset Password":"Sign In with OTP"}</h2><p className="auth-intro">Choose where to receive your one-time code.</p><div className="auth-segment auth-segment-small" role="group" aria-label="OTP destination"><button type="button" aria-pressed={otpChannel==="phone"} className={otpChannel==="phone"?"active":""} onClick={()=>{setOtpChannel("phone");setOtpContact(otpPurpose==="login"?authForm.email:authForm.phone)}}>Phone</button><button type="button" aria-pressed={otpChannel==="email"} className={otpChannel==="email"?"active":""} onClick={()=>{setOtpChannel("email");setOtpContact(authForm.email)}}>Email</button></div><form className="auth-form" onSubmit={sendOtp}><label>{otpChannel==="phone"?"Phone Number":"Email"}<input required type={otpChannel==="phone"?"tel":"email"} autoComplete={otpChannel==="phone"?"tel":"email"} value={otpContact} onChange={e=>setOtpContact(e.target.value)} placeholder={otpChannel==="phone"?"+63 9XX XXX XXXX":"Email address"}/></label><button className="auth-submit" type="submit">Send OTP</button></form><p className="auth-switch"><button type="button" className="auth-link" onClick={()=>setAuthView("form")}>Back to Sign In</button></p></>}
        {authView==="verify"&&<><button type="button" className="auth-back" onClick={()=>setAuthView("send")} aria-label="Change OTP destination">‹</button><span className="eyebrow">OTP VERIFICATION</span><h2>Send OTP</h2><p className="auth-intro">Enter the 6-digit code for <b>{otpContact}</b>.</p>{otpDemoCode&&<div className="demo-otp"><b>Development demo code</b><span>{otpDemoCode}</span><small>No SMS or email was sent. Configure a provider for real delivery.</small></div>}<form className="auth-form" onSubmit={verifyOtp}><label>OTP Number<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" value={otpCode} onChange={e=>setOtpCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="OTP here"/></label><button className="auth-submit" type="submit" disabled={!otpChallenge||otpCode.length!==6}>Confirm</button></form><p className="auth-switch">Code expires in 10 minutes. <button type="button" className="auth-link" onClick={()=>setAuthView("send")}>Change contact</button></p></>}
        {authView==="reset"&&<><button type="button" className="auth-back" onClick={()=>setAuthView("form")} aria-label="Back to sign in">‹</button><span className="eyebrow">SECURE YOUR ACCOUNT</span><h2>Choose a new password</h2><p className="auth-intro">Your code was verified. Enter a password with at least 8 characters.</p><form className="auth-form" onSubmit={resetPassword}><label>New Password<input required type="password" minLength="8" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="New password"/></label><label>Confirm New Password<input required type="password" minLength="8" autoComplete="new-password" value={newPasswordConfirm} onChange={e=>setNewPasswordConfirm(e.target.value)} placeholder="Re-enter new password"/></label><button className="auth-submit" type="submit">Update Password</button></form></>}
      </div></section>}
      {tab === "Profile" && <section className="section narrow"><span className="eyebrow">YOUR ACCOUNT</span><h2>Profile details</h2><form className="panel formgrid" onSubmit={saveProfile}><label>Full name<input required value={profile.name || ""} onChange={e => setProfile({ ...profile, name: e.target.value })} /></label><label>Phone number<input value={profile.phone || ""} onChange={e => setProfile({ ...profile, phone: e.target.value })} /></label><label>Default address<textarea value={profile.address || ""} onChange={e => setProfile({ ...profile, address: e.target.value })} /></label><button className="primary wide">Save profile</button></form></section>}
      {tab === "Merchant" && <section className="section dashboard-section">
        <div className="dashboard-heading"><span className="eyebrow">MERCHANT WORKSPACE</span><h2>{store?.name || "Your store"}</h2><p>{store?.approved ? "Your store is approved. Manage your catalog and stock." : "Your merchant application is awaiting admin approval."}</p></div>
        <form className="panel formgrid store-profile" onSubmit={saveStore}>
          <h3>Store profile</h3>
          <label>Store name<input required maxLength="100" value={store?.name||""} onChange={e=>setStore({...store,name:e.target.value})}/></label>
          <label>Description<textarea maxLength="500" value={store?.description||""} onChange={e=>setStore({...store,description:e.target.value})}/></label>
          <button className="outline wide">Save store profile</button>
        </form>
        {merchantSummary&&<div className="stats"><div><small>Store orders</small><b>{merchantSummary.orders}</b></div><div><small>Recorded product sales</small><b>{money(merchantSummary.sales)}</b></div><div><small>Estimated commission</small><b>{money(merchantSummary.estimatedCommission)}</b></div><div><small>Active products</small><b>{merchantSummary.products}</b></div></div>}
        {store?.approved && <>
          <form className="panel formgrid" onSubmit={addMerchantProduct}><h3>Add a product</h3><label>Product name<input required value={productForm.name} onChange={e => setProductForm({ ...productForm, name: e.target.value })} /></label><label>Category<input required value={productForm.category} onChange={e => setProductForm({ ...productForm, category: e.target.value })} /></label><label>Description<textarea value={productForm.description} onChange={e => setProductForm({ ...productForm, description: e.target.value })} /></label><label>Price (PHP)<input required type="number" min="1" step="0.01" value={productForm.price} onChange={e => setProductForm({ ...productForm, price: e.target.value })} /></label><label>Stock<input required type="number" min="0" value={productForm.stock} onChange={e => setProductForm({ ...productForm, stock: e.target.value })} /></label><button className="primary wide">Add product</button></form>
          <h3 className="subhead">Inventory</h3>
          <div className="orders">{merchantItems.filter(p=>p.active).map(p => <div className="order" key={p.id}><div><b>{p.name}</b><small>{p.category} · {p.stock} in stock</small></div><div className="orderend"><b>{money(p.price)}</b><div className="row-actions"><button className="outline small" onClick={() => editMerchantProduct(p)}>Edit</button><button className="outline small" onClick={() => removeMerchantProduct(p)}>Remove</button></div></div></div>)}</div>
        </>}

        <h3 className="subhead">Incoming store orders</h3>
        {merchantOrders.length === 0 ? <div className="empty">No store orders yet.</div> : <div className="orders">{merchantOrders.map(o => <div className="order" key={o.id}><div><b>Order #{o.id} · {o.customer_name}</b>{o.items_summary&&<small>Items: {o.items_summary}</small>}<small>{o.pickup} → {o.destination}</small><small>{o.notes}</small></div><div className="orderend"><span className="status">{o.merchant_status}</span><select value={o.merchant_status} onChange={e => updateMerchantOrder(o.id, e.target.value)}><option>Pending</option><option>Accepted</option><option>Preparing</option><option>Ready for Pickup</option><option>Rejected</option></select></div></div>)}</div>}

      </section>}

      {tab === "Updates" && <section className="section narrow"><span className="eyebrow">ORDER AND ACCOUNT UPDATES</span><h2>Notifications</h2>{notifications.length === 0 ? <div className="empty">You are all caught up.</div> : <div className="orders">{notifications.map(n => <div className={n.read?"order":"order unread"} key={n.id}><div><b>{n.message}</b><small>{n.created_at}</small></div>{!n.read&&<button className="outline small" onClick={()=>markNotificationRead(n)}>Mark read</button>}</div>)}</div>}</section>}
      {tab === "Information" && <section className="section narrow info-page">
        <span className="eyebrow">SHOPEASE CEBU GO</span><h2>{infoPage}</h2>
        {infoPage==="About"&&<><p>ShopEase Cebu Go connects Cebu customers with local merchants and motorcycle delivery services through one convenient marketplace.</p><p>Browse local products, request parcel delivery, or use pasabuy for personal shopping.</p></>}
        {infoPage==="Contact"&&<><p>For order or account assistance, submit a request through Customer Support after signing in.</p><button className="primary" onClick={()=>setTab("Support")}>Open customer support</button><p className="provider-note">Live chat, phone support, email delivery, and SMS are not configured in this demo.</p></>}
        {infoPage==="Terms"&&<><h3>Using this demo</h3><p>This application is a development MVP. Orders, fees, notifications, and payment choices are recorded for demonstration; payment providers and real delivery operations are not connected.</p><h3>Payments and delivery</h3><p>Do not submit card details or sensitive personal information. Confirm actual service availability, prices, and delivery arrangements directly before relying on any transaction.</p><h3>Accounts</h3><p>You are responsible for keeping your sign-in credentials private. Administrators may suspend demo accounts and merchants require approval.</p></>}
        {infoPage==="Privacy"&&<><h3>Information stored by this MVP</h3><p>The local database stores account details, product reviews, delivery/order details, support messages, and notifications to demonstrate platform workflows. If a rider chooses to share GPS during an active trip, the latest coordinates are cleared when sharing stops, and stale location records are cleaned up after five minutes without an update.</p><h3>Data handling</h3><p>This development build does not provide production-grade privacy controls, retention schedules, account deletion, or a formal data-subject request process. Do not enter sensitive personal information.</p><p>Live GPS is shared only with the customer who owns the active order and is not sent to an external map provider. External analytics, advertising, payment, email, and SMS providers are not connected.</p></>}
      </section>}
    </main>
    {!staffRole&&<nav className="mobile-bottom-nav" aria-label="Quick navigation">{[["Shop","⌂","Home"],["Favorites","♡","Saved"],["Delivery","🛵","Deliver"],["Orders","▣","Orders"],[user?"Profile":"Account","♙","Me"]].map(([target,icon,label])=><button key={target} className={tab===target?"active":""} onClick={()=>setTab(target)}><span aria-hidden="true">{icon}</span><small>{label}</small></button>)}</nav>}
    {selectedProduct&&<div className="modal-backdrop" role="presentation" onClick={()=>setSelectedProduct(null)}><section className="modal panel" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="Close product details" onClick={()=>setSelectedProduct(null)}>×</button><span className="eyebrow">{selectedProduct.category}{selectedProduct.store_name?` · ${selectedProduct.store_name}`:""}</span><h2 id="product-dialog-title">{selectedProduct.name}</h2><p>{selectedProduct.description||"No additional product description."}</p><div className="detail-meta"><b>{money(selectedProduct.price)}</b><span>{selectedProduct.stock} in stock</span><span>{selectedProduct.rating?`★ ${selectedProduct.rating} (${selectedProduct.review_count} reviews)`:"No ratings yet"}</span></div><div className="row-actions"><button className="outline" onClick={()=>{add(selectedProduct.id);setSelectedProduct(null)}}>Add to cart</button><button className="primary" onClick={()=>buyNow(selectedProduct.id)}>Buy Now</button><button className="textbtn" onClick={()=>saveReview(selectedProduct)}>Write a review</button></div><h3 className="subhead">Customer reviews</h3>{productReviews.length===0?<div className="empty">No reviews yet.</div>:<div className="review-list">{productReviews.map(review=><article className="review-item" key={review.id}><b>{review.name} · {"★".repeat(review.rating)}</b><p>{review.comment||"No written comment."}</p><small>{review.created_at}</small></article>)}</div>}</section></div>}
    {orderDetail&&<div className="modal-backdrop" role="presentation" onClick={()=>setOrderDetail(null)}><section className="modal panel" role="dialog" aria-modal="true" aria-labelledby="order-dialog-title" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="Close order details" onClick={()=>setOrderDetail(null)}>×</button><span className="eyebrow">ORDER TRACKING</span><h2 id="order-dialog-title">Order #{orderDetail.id} · {orderDetail.type}</h2><span className="status">{orderDetail.status}</span><div className="tracking-list">{(orderDetail.status==="Cancelled"||orderDetail.status==="Rejected"?[orderDetail.status]:deliveryProgress).map((step,index)=><div className={`tracking-step ${progressIndex>=index?"complete":""}`} key={step}><span>{progressIndex>=index?"✓":index+1}</span><b>{step}</b></div>)}</div>{orderDetail.rider_id&&ACTIVE_TRIP_STATUSES.includes(orderDetail.status)&&<div className="live-tracking"><h3 className="subhead">Live driver location</h3>{orderDetail.rider_location?<LiveLocationMap location={orderDetail.rider_location} trail={riderTrail}/>:<div className="live-location-waiting"><span className="live-location-pulse"/>Waiting for your rider to share their current location.</div>}</div>}<div className="detail-meta"><span>Pickup: {orderDetail.pickup}</span><span>Delivery: {orderDetail.destination}</span><span>Payment: {orderDetail.payment_method} · {orderDetail.payment_status}</span>{orderDetail.payment_reference&&<span>Reference: {orderDetail.payment_reference}</span>}<span>Subtotal {money(orderDetail.subtotal)} · Fee {money(orderDetail.delivery_fee)} · Total {money(orderDetail.total)}</span></div>{orderDetail.notes&&<p>Instructions: {orderDetail.notes}</p>}{orderDetail.items?.length>0&&<><h3 className="subhead">Items</h3><div className="orders">{orderDetail.items.map(item=><div className="order" key={item.product_id}><b>{item.name} × {item.quantity}</b><span>{money(item.unit_price*item.quantity)}</span></div>)}</div></>}{orderDetail.delivery_pin&&orderDetail.status!=="Delivered"&&<p className="pin">Handoff PIN: {orderDetail.delivery_pin}</p>}</section></div>}
    <footer><div className="footerbrand">ShopEase <b>Cebu Go</b></div><p>Local shopping. Easy delivery. More time for what matters.</p><div className="footer-links">{["About","Contact","Terms","Privacy"].map(page=><button key={page} className="textbtn" onClick={()=>{setInfoPage(page);setTab("Information")}}>{page==="Privacy"?"Privacy policy":page==="Terms"?"Terms & conditions":page}</button>)}</div><small>Demo MVP • Cebu, Philippines • Payments and external notifications are not connected</small></footer>
  </div>;
}
export default App;







