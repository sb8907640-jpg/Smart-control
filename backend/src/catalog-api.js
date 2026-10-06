const crypto = require("node:crypto");

function installCatalogRoutes(app, { db, requireAuth }) {
  const firestoreCollection = (name) => db.collection(name);
  const now = () => Date.now();

  const requireUser = (req, res, next) => {
    if (!req.user?.uid) return res.status(401).json({ error: "Authentication required." });
    req.catalogUid = req.user.uid;
    next();
  };

  const requireAdmin = (req, res, next) => {
    if (req.user?.admin !== true && !["SUPER_ADMIN","OWNER","ADMIN"].includes(String(req.user?.role || "").toUpperCase())) {
      return res.status(403).json({ error: "Administrator access required." });
    }
    next();
  };

  const audit = async (uid, action, resource, metadata = {}) => {
    await firestoreCollection("auditLogs").add({
      userId: uid, action, resource, metadata, createdAt: now()
    });
  };

  const add = async (collection, data) => {
    const ref = await firestoreCollection(collection).add({ ...data, createdAt: now(), updatedAt: now() });
    return ref.id;
  };

  const list = async (collection, uid, limit = 100) => {
    const snap = await firestoreCollection(collection).where("userId", "==", uid).limit(limit).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  };

  const requireConsent = async (req, res, next) => {
    try {
      const snap = await firestoreCollection("consentLogs").where("userId", "==", req.catalogUid).where("granted", "==", true).limit(1).get();
      if (snap.empty) return res.status(403).json({ error: "Active user consent is required." });
      req.consentId = snap.docs[0].id;
      next();
    } catch (e) { next(e); }
  };

  const getSession = async (sessionId, uid) => {
    const snap = await firestoreCollection("mediaSessions").doc(sessionId).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (data.controllerUid !== uid && data.targetDeviceId !== uid) return null;
    return { id: snap.id, ...data };
  };

  const requireActiveSession = async (req, res, next) => {
    try {
      const sessionId = String(req.body?.sessionId || req.query?.sessionId || "").trim();
      if (!sessionId) return res.status(400).json({ error: "sessionId is required." });
      const session = await getSession(sessionId, req.catalogUid);
      if (!session || session.status !== "ACTIVE" || session.consentGranted !== true) {
        return res.status(403).json({ error: "Active user-approved session and consent are required." });
      }
      req.mediaSession = session;
      req.sessionId = sessionId;
      next();
    } catch (e) { next(e); }
  };

  app.use("/api", requireAuth);
  app.use("/api", requireUser);

  app.get("/api/link/status", async (req,res,next) => {
    try {
      const snap = await firestoreCollection("devices").where("controllerUid","==",req.catalogUid).limit(100).get();
      res.json({ active: !snap.empty, devices: snap.docs.map(d=>({id:d.id,...d.data()})) });
    } catch(e){next(e);}
  });

  app.get("/api/link/history", async (req,res,next) => {
    try { res.json({ links: await list("connectionLogs", req.catalogUid) }); } catch(e){next(e);}
  });

  app.post("/api/link/generate", async (req,res,next) => {
    try {
      const code=crypto.randomBytes(8).toString("base64url").slice(0,11).toUpperCase();
      const expiresAt=now()+10*60*1000;
      await firestoreCollection("pairingCodes").doc(code).set({ownerUid:req.catalogUid,status:"PENDING",createdAt:now(),expiresAt});
      await audit(req.catalogUid,"LINK_CODE_GENERATED","pairingCode",{code});
      res.status(201).json({code,expiresAt});
    } catch(e){next(e);}
  });

  app.post("/api/link/join", async (req,res,next) => {
    try {
      const code=String(req.body?.code||"").trim().toUpperCase();
      if(!code) return res.status(400).json({error:"Pairing code is required."});
      const ref=firestoreCollection("pairingCodes").doc(code);
      const snap=await ref.get(); const data=snap.exists?snap.data():null;
      if(!data||data.status!=="PENDING"||Number(data.expiresAt)<now()) return res.status(404).json({error:"Pairing code is invalid or expired."});
      await ref.set({clientUid:req.catalogUid,status:"PAIRED",pairedAt:now()},{merge:true});
      await firestoreCollection("devices").doc(req.catalogUid).set({controllerUid:data.ownerUid,pairingActive:true,updatedAt:now()},{merge:true});
      await audit(req.catalogUid,"LINK_JOINED","pairingCode",{code});
      res.json({ok:true,ownerUid:data.ownerUid});
    }catch(e){next(e);}
  });

  app.post("/api/link/share", async(req,res,next)=>{
    try{
      const link=String(req.body?.link||"").trim();
      if(!link||link.length>2048)return res.status(400).json({error:"Valid link is required."});
      const id=await add("sharedLinks",{userId:req.catalogUid,link});
      await audit(req.catalogUid,"LINK_SHARED","link",{id});
      res.status(201).json({ok:true,id});
    }catch(e){next(e);}
  });

  app.post("/api/connect", async(req,res,next)=>{
    try{
      const deviceId=String(req.body?.deviceId||"").trim();
      if(!deviceId)return res.status(400).json({error:"deviceId is required."});
      const id=await add("connections",{userId:req.catalogUid,deviceId,status:"CONNECTED",connectedAt:now(),lastSeenAt:now()});
      await firestoreCollection("devices").doc(deviceId).set({controllerUid:req.catalogUid,connectionId:id,connectionStatus:"CONNECTED",lastSeenAt:now(),updatedAt:now()},{merge:true});
      await audit(req.catalogUid,"CONNECTED","device",{deviceId,connectionId:id});
      res.status(201).json({ok:true,status:"CONNECTED",deviceId,connectionId:id});
    }catch(e){next(e);}
  });

  app.post("/api/disconnect", async(req,res,next)=>{
    try{
      const deviceId=String(req.body?.deviceId||"").trim();
      if(!deviceId)return res.status(400).json({error:"deviceId is required."});
      const snap=await firestoreCollection("connections").where("userId","==",req.catalogUid).where("deviceId","==",deviceId).limit(1).get();
      if(!snap.empty) await snap.docs[0].ref.set({status:"DISCONNECTED",disconnectedAt:now(),updatedAt:now()},{merge:true});
      await firestoreCollection("devices").doc(deviceId).set({connectionStatus:"DISCONNECTED",updatedAt:now()},{merge:true});
      await audit(req.catalogUid,"DISCONNECTED","device",{deviceId});
      res.json({ok:true,status:"DISCONNECTED",deviceId});
    }catch(e){next(e);}
  });

  app.post("/api/reconnect", async(req,res,next)=>{
    try{
      const deviceId=String(req.body?.deviceId||"").trim();
      if(!deviceId)return res.status(400).json({error:"deviceId is required."});
      const id=await add("reconnectQueue",{userId:req.catalogUid,deviceId,status:"QUEUED",attemptCount:0,nextAttemptAt:now()});
      await firestoreCollection("devices").doc(deviceId).set({connectionStatus:"RECONNECTING",reconnectQueuedAt:now(),updatedAt:now()},{merge:true});
      await audit(req.catalogUid,"RECONNECT_QUEUED","device",{deviceId,reconnectId:id});
      res.status(202).json({ok:true,status:"QUEUED",deviceId,reconnectId:id});
    }catch(e){next(e);}
  });

  app.get("/api/devices/:id", async(req,res,next)=>{
    try{
      const snap=await firestoreCollection("devices").doc(req.params.id).get();
      if(!snap.exists)return res.status(404).json({error:"Device not found."});
      const d=snap.data()||{};
      if(d.userId!==req.catalogUid&&d.controllerUid!==req.catalogUid)return res.status(404).json({error:"Device not found."});
      res.json({device:{id:snap.id,...d}});
    }catch(e){next(e);}
  });

  app.get("/api/permissions", async(req,res,next)=>{try{res.json({permissions:await list("permissionGrants",req.catalogUid)});}catch(e){next(e);}});
  app.get("/api/permissions/:id", async(req,res,next)=>{try{const s=await firestoreCollection("permissionGrants").doc(req.params.id).get();if(!s.exists||s.data()?.userId!==req.catalogUid)return res.status(404).json({error:"Permission record not found."});res.json({permission:{id:s.id,...s.data()}});}catch(e){next(e);}});
  app.get("/api/permissions/status", async(req,res,next)=>{try{const permissions=await list("permissionGrants",req.catalogUid);res.json({status:permissions.some(p=>p.granted)?"PARTIAL":"CONSENT_REQUIRED",permissions});}catch(e){next(e);}});
  app.get("/api/permissions/logs", async(req,res,next)=>{try{res.json({logs:await list("permissionRequests",req.catalogUid)});}catch(e){next(e);}});

  app.post("/api/permissions/request", async(req,res,next)=>{
    try{const permission=String(req.body?.permission||"").trim();if(!permission)return res.status(400).json({error:"permission is required."});const id=await add("permissionRequests",{userId:req.catalogUid,permission,status:"REQUESTED",requestedAt:now()});await audit(req.catalogUid,"PERMISSION_REQUESTED","permission",{permission,id});res.status(201).json({ok:true,id,status:"REQUESTED"});}catch(e){next(e);}
  });
  app.post("/api/permissions/grant", requireConsent, async(req,res,next)=>{
    try{const permission=String(req.body?.permission||"").trim();if(!permission)return res.status(400).json({error:"permission is required."});const id=await add("permissionGrants",{userId:req.catalogUid,permission,granted:true,source:"USER_CONFIRMATION",consentId:req.consentId,grantedAt:now()});await audit(req.catalogUid,"PERMISSION_GRANTED","permission",{permission,id});res.status(201).json({ok:true,id,status:"GRANTED"});}catch(e){next(e);}
  });
  app.post("/api/permissions/revoke", async(req,res,next)=>{
    try{const permission=String(req.body?.permission||"").trim();if(!permission)return res.status(400).json({error:"permission is required."});const id=await add("permissionGrants",{userId:req.catalogUid,permission,granted:false,source:"USER_REVOCATION",revokedAt:now()});await audit(req.catalogUid,"PERMISSION_REVOKED","permission",{permission,id});res.status(201).json({ok:true,id,status:"REVOKED"});}catch(e){next(e);}
  });
  app.post("/api/permissions/allow-all", requireConsent, async(req,res,next)=>{
    try{const features=["LOCATION","NOTIFICATIONS","BATTERY_NETWORK","CAMERA","MICROPHONE","GALLERY","SCREEN_SHARE","SCREEN_RECORDING","TOUCH_CONTROL","KEYBOARD_INPUT","APP_INSTALL_UNINSTALL","FILE_TRANSFER","CLIPBOARD_SYNC","FILES_ACCESS","CONTACTS","SMS","CALL_LOGS","APP_USAGE","SOS_ALERTS"];const batch=db.batch();for(const permission of features){const ref=firestoreCollection("permissionRequests").doc();batch.set(ref,{userId:req.catalogUid,permission,status:"REQUESTED",createdAt:now(),manualSystemConfirmationRequired:true});}await batch.commit();const id=await add("permissionFlows",{userId:req.catalogUid,type:"ALLOW_ALL",status:"USER_CONFIRMATION_REQUIRED",featureCount:features.length});await audit(req.catalogUid,"PERMISSION_ALLOW_ALL_REQUESTED","permissions",{id,featureCount:features.length});res.status(202).json({ok:true,id,status:"USER_CONFIRMATION_REQUIRED",count:features.length});}catch(e){next(e);}
  });

  app.post("/api/consent/save", async(req,res,next)=>{
    try{const scope=Array.isArray(req.body?.scope)?req.body.scope.map(String).slice(0,100):[];if(!scope.length)return res.status(400).json({error:"Consent scope is required."});const consentId=crypto.randomUUID();await firestoreCollection("consentLogs").doc(consentId).set({userId:req.catalogUid,scope,granted:true,version:String(req.body?.version||"current"),createdAt:now(),consentId});await audit(req.catalogUid,"CONSENT_SAVED","consent",{consentId});res.status(201).json({ok:true,consentId});}catch(e){next(e);}
  });
  app.post("/api/consent/verify", async(req,res,next)=>{
    try{const id=String(req.body?.consentId||"");if(!id)return res.json({valid:false});const s=await firestoreCollection("consentLogs").doc(id).get();const d=s.exists?s.data():{};res.json({valid:s.exists&&d.userId===req.catalogUid&&d.granted===true});}catch(e){next(e);}
  });
  app.get("/api/consent/history", async(req,res,next)=>{try{res.json({consents:await list("consentLogs",req.catalogUid)});}catch(e){next(e);}});
  app.get("/api/consent/export", async(req,res,next)=>{try{res.json({consents:await list("consentLogs",req.catalogUid,500)});}catch(e){next(e);}});

  const readSession = async (req,res,next) => {
    try{const sessionId=String(req.query?.sessionId||"").trim();if(!sessionId)return res.status(400).json({error:"sessionId is required."});const session=await getSession(sessionId,req.catalogUid);if(!session)return res.status(404).json({error:"Session not found."});res.json({session});}catch(e){next(e);}
  };
  app.get("/api/control/status",readSession);
  app.get("/api/control/live",readSession);
  app.get("/api/control/history",async(req,res,next)=>{try{res.json({logs:await list("controlLogs",req.catalogUid)});}catch(e){next(e);}});
  app.get("/api/control/logs",async(req,res,next)=>{try{res.json({logs:await list("controlLogs",req.catalogUid)});}catch(e){next(e);}});

  const commandRoutes=[
    ["/api/control/touch","TOUCH"],["/api/control/keyboard","KEYBOARD"],["/api/control/app/install","APP_INSTALL"],["/api/control/app/uninstall","APP_UNINSTALL"],
    ["/api/control/file/transfer","FILE_TRANSFER"],["/api/control/clipboard","CLIPBOARD"],["/api/control/screen/share","SCREEN_SHARE"],["/api/control/screen/record","SCREEN_RECORD"],
    ["/api/control/camera","CAMERA"],["/api/control/mic","MIC"],["/api/control/p2p/start","P2P_START"],["/api/control/p2p/stop","P2P_STOP"]
  ];
  for(const [path,type] of commandRoutes){
    app.post(path,requireConsent,requireActiveSession,async(req,res,next)=>{
      try{const commandId=await add("remoteCommands",{controllerUid:req.catalogUid,userId:req.catalogUid,deviceId:req.mediaSession.targetDeviceId||null,sessionId:req.sessionId,commandType:type,payload:req.body?.payload||{},status:"QUEUED",consentId:req.consentId});await audit(req.catalogUid,"REMOTE_COMMAND_QUEUED","remoteCommand",{commandId,type,sessionId:req.sessionId});res.status(202).json({ok:true,accepted:true,commandId,status:"QUEUED"});}catch(e){next(e);}
    });
  }

  const dataRoutes=[
    ["/api/data/location","locationData"],["/api/data/contacts","contacts"],["/api/data/sms","smsLogs"],["/api/data/call-logs","callLogs"],
    ["/api/data/files","filesAccess"],["/api/data/gallery","galleryData"],["/api/data/app-usage","appUsage"],["/api/data/battery","batteryInfo"]
  ];
  for(const [path,collection] of dataRoutes){
    app.get(path,requireConsent,async(req,res,next)=>{try{const data=await list(collection,req.catalogUid);await audit(req.catalogUid,"DATA_READ",collection);res.json({data});}catch(e){next(e);}});
  }
  app.post("/api/data/download",requireConsent,async(req,res,next)=>{try{const id=await add("dataDownloads",{userId:req.catalogUid,scope:req.body?.scope||{},status:"REQUESTED",consentId:req.consentId});await audit(req.catalogUid,"DATA_DOWNLOAD_REQUESTED","dataDownload",{id});res.status(201).json({id,status:"REQUESTED"});}catch(e){next(e);}});
  app.post("/api/data/share",requireConsent,async(req,res,next)=>{try{const id=await add("dataShares",{userId:req.catalogUid,scope:req.body?.scope||{},status:"REQUESTED",consentId:req.consentId});await audit(req.catalogUid,"DATA_SHARE_REQUESTED","dataShare",{id});res.status(201).json({id,status:"REQUESTED"});}catch(e){next(e);}});

  app.get("/api/plans",async(req,res,next)=>{try{const s=await firestoreCollection("plans").where("enabled","==",true).limit(100).get();res.json({plans:s.docs.map(d=>({id:d.id,...d.data()}))});}catch(e){next(e);}});
  app.get("/api/plans/:id",async(req,res,next)=>{try{const s=await firestoreCollection("plans").doc(req.params.id).get();if(!s.exists)return res.status(404).json({error:"Plan not found."});res.json({plan:{id:s.id,...s.data()}});}catch(e){next(e);}});
  app.post("/api/subscribe",async(req,res,next)=>{try{const planId=String(req.body?.planId||"").trim();if(!planId)return res.status(400).json({error:"planId is required."});const p=await firestoreCollection("plans").doc(planId).get();if(!p.exists||p.data()?.enabled!==true)return res.status(404).json({error:"Plan not found."});const id=await add("subscriptions",{userId:req.catalogUid,planId,status:"PENDING_PAYMENT"});await audit(req.catalogUid,"SUBSCRIPTION_CREATED","subscription",{id,planId});res.status(201).json({id,status:"PENDING_PAYMENT",planId});}catch(e){next(e);}});
  app.post("/api/payment/initiate",async(req,res,next)=>{try{const subscriptionId=String(req.body?.subscriptionId||"");const amountMinor=Number(req.body?.amountMinor||0);if(!subscriptionId||!Number.isFinite(amountMinor)||amountMinor<0)return res.status(400).json({error:"subscriptionId and valid amountMinor are required."});const id=await add("payments",{userId:req.catalogUid,subscriptionId,amountMinor,currency:"INR",provider:String(req.body?.provider||"UNSPECIFIED"),status:"INITIATED"});await audit(req.catalogUid,"PAYMENT_INITIATED","payment",{id});res.status(201).json({paymentId:id,status:"INITIATED"});}catch(e){next(e);}});
  app.post("/api/payment/verify",async(req,res,next)=>{try{const id=String(req.body?.paymentId||"");if(!id)return res.status(400).json({error:"paymentId is required."});const ref=firestoreCollection("payments").doc(id);const s=await ref.get();if(!s.exists||s.data()?.userId!==req.catalogUid)return res.status(404).json({error:"Payment not found."});await ref.set({status:"VERIFIED",verifiedAt:now(),updatedAt:now()},{merge:true});await audit(req.catalogUid,"PAYMENT_VERIFIED","payment",{id});res.json({paymentId:id,status:"VERIFIED"});}catch(e){next(e);}});
  app.post("/api/emi/apply",async(req,res,next)=>{try{const paymentId=String(req.body?.paymentId||"");const installmentCount=Number(req.body?.installmentCount||0);if(!paymentId||!Number.isInteger(installmentCount)||installmentCount<1||installmentCount>60)return res.status(400).json({error:"paymentId and installmentCount 1-60 are required."});const id=await add("emiApplications",{userId:req.catalogUid,paymentId,installmentCount,status:"PENDING_REVIEW"});await audit(req.catalogUid,"EMI_APPLICATION_CREATED","emi",{id});res.status(201).json({id,status:"PENDING_REVIEW"});}catch(e){next(e);}});
  app.get("/api/subscription/status",async(req,res,next)=>{try{const s=await firestoreCollection("subscriptions").where("userId","==",req.catalogUid).limit(20).get();res.json({subscriptions:s.docs.map(d=>({id:d.id,...d.data()}))});}catch(e){next(e);}});
  app.get("/api/payment/history",async(req,res,next)=>{try{res.json({payments:await list("payments",req.catalogUid)});}catch(e){next(e);}});

  app.post("/api/sos/trigger",async(req,res,next)=>{try{const id=await add("sosAlerts",{userId:req.catalogUid,status:"TRIGGERED",message:String(req.body?.message||"").slice(0,500),latitude:req.body?.latitude??null,longitude:req.body?.longitude??null,triggeredAt:now()});await audit(req.catalogUid,"SOS_TRIGGERED","sos",{id});res.status(201).json({id,status:"TRIGGERED"});}catch(e){next(e);}});
  app.post("/api/sos/cancel",async(req,res,next)=>{try{const id=String(req.body?.alertId||"");if(!id)return res.status(400).json({error:"alertId is required."});const ref=firestoreCollection("sosAlerts").doc(id);const s=await ref.get();if(!s.exists||s.data()?.userId!==req.catalogUid)return res.status(404).json({error:"SOS alert not found."});await ref.set({status:"CANCELLED",cancelledAt:now(),updatedAt:now()},{merge:true});await audit(req.catalogUid,"SOS_CANCELLED","sos",{id});res.json({id,status:"CANCELLED"});}catch(e){next(e);}});
  app.get("/api/sos/history",async(req,res,next)=>{try{res.json({alerts:await list("sosAlerts",req.catalogUid)});}catch(e){next(e);}});
  app.post("/api/system/sync",async(req,res,next)=>{try{const id=await add("syncRequests",{userId:req.catalogUid,status:"REQUESTED",scope:req.body?.scope||null});await audit(req.catalogUid,"SYSTEM_SYNC_REQUESTED","sync",{id});res.status(201).json({id,status:"REQUESTED"});}catch(e){next(e);}});

  app.get("/api/admin/users",requireAdmin,async(req,res,next)=>{try{const s=await firestoreCollection("users").limit(500).get();res.json({users:s.docs.map(d=>({id:d.id,...d.data()}))});}catch(e){next(e);}});
  app.get("/api/admin/devices",requireAdmin,async(req,res,next)=>{try{const s=await firestoreCollection("devices").limit(500).get();res.json({devices:s.docs.map(d=>({id:d.id,...d.data()}))});}catch(e){next(e);}});
  app.get("/api/admin/plans",requireAdmin,async(req,res,next)=>{try{const s=await firestoreCollection("plans").limit(500).get();res.json({plans:s.docs.map(d=>({id:d.id,...d.data()}))});}catch(e){next(e);}});
  app.get("/api/admin/subscriptions",requireAdmin,async(req,res,next)=>{try{const s=await firestoreCollection("subscriptions").limit(500).get();res.json({subscriptions:s.docs.map(d=>({id:d.id,...d.data()}))});}catch(e){next(e);}});
  app.get("/api/admin/analytics",requireAdmin,async(req,res,next)=>{try{const [u,d,c]=await Promise.all([firestoreCollection("users").count().get(),firestoreCollection("devices").count().get(),firestoreCollection("connections").count().get()]);res.json({analytics:{users:u.data().count,devices:d.data().count,connections:c.data().count,generatedAt:now()}});}catch(e){next(e);}});
  app.get("/api/admin/logs",requireAdmin,async(req,res,next)=>{try{const s=await firestoreCollection("auditLogs").limit(500).get();res.json({logs:s.docs.map(d=>({id:d.id,...d.data()}))});}catch(e){next(e);}});
  app.get("/api/admin/support/tickets",requireAdmin,async(req,res,next)=>{try{const s=await firestoreCollection("supportTickets").limit(500).get();res.json({tickets:s.docs.map(d=>({id:d.id,...d.data()}))});}catch(e){next(e);}});
  app.post("/api/admin/free-access/grant",requireAdmin,async(req,res,next)=>{try{const userId=String(req.body?.userId||"");if(!userId)return res.status(400).json({error:"userId is required."});const id=await add("freeAccessGrants",{userId,grantedBy:req.catalogUid,reason:String(req.body?.reason||"").slice(0,500),status:"ACTIVE",startsAt:now(),endsAt:req.body?.endsAt||null});await audit(req.catalogUid,"FREE_ACCESS_GRANTED","freeAccessGrant",{id,userId});res.status(201).json({id,status:"ACTIVE"});}catch(e){next(e);}});
  app.post("/api/admin/free-access/edit",requireAdmin,async(req,res,next)=>{try{const id=String(req.body?.grantId||"");if(!id)return res.status(400).json({error:"grantId is required."});await firestoreCollection("freeAccessGrants").doc(id).set({updatedAt:now(),reason:String(req.body?.reason||"").slice(0,500),endsAt:req.body?.endsAt||null},{merge:true});await audit(req.catalogUid,"FREE_ACCESS_EDITED","freeAccessGrant",{id});res.json({id,status:"UPDATED"});}catch(e){next(e);}});
  app.post("/api/admin/free-access/revoke",requireAdmin,async(req,res,next)=>{try{const id=String(req.body?.grantId||"");if(!id)return res.status(400).json({error:"grantId is required."});await firestoreCollection("freeAccessGrants").doc(id).set({status:"REVOKED",revokedAt:now(),updatedAt:now()},{merge:true});await audit(req.catalogUid,"FREE_ACCESS_REVOKED","freeAccessGrant",{id});res.json({id,status:"REVOKED"});}catch(e){next(e);}});
  app.post("/api/admin/user/ban",requireAdmin,async(req,res,next)=>{try{const uid=String(req.body?.userId||"");if(!uid)return res.status(400).json({error:"userId is required."});await firestoreCollection("users").doc(uid).set({status:"BANNED",bannedAt:now(),bannedBy:req.catalogUid},{merge:true});await audit(req.catalogUid,"USER_BANNED","user",{uid});res.json({userId:uid,status:"BANNED"});}catch(e){next(e);}});
  app.post("/api/admin/user/unban",requireAdmin,async(req,res,next)=>{try{const uid=String(req.body?.userId||"");if(!uid)return res.status(400).json({error:"userId is required."});await firestoreCollection("users").doc(uid).set({status:"ACTIVE",unbannedAt:now(),unbannedBy:req.catalogUid},{merge:true});await audit(req.catalogUid,"USER_UNBANNED","user",{uid});res.json({userId:uid,status:"ACTIVE"});}catch(e){next(e);}});
  app.post("/api/admin/system/config",requireAdmin,async(req,res,next)=>{try{const values=req.body?.values;if(!values||typeof values!=="object"||Array.isArray(values))return res.status(400).json({error:"values object is required."});await firestoreCollection("systemConfig").doc("current").set({values,updatedAt:now(),updatedBy:req.catalogUid},{merge:true});await audit(req.catalogUid,"SYSTEM_CONFIG_UPDATED","systemConfig");res.json({ok:true,status:"UPDATED"});}catch(e){next(e);}});
  app.post("/api/admin/login",requireAdmin,async(req,res)=>res.json({ok:true,uid:req.catalogUid,admin:true}));

  app.post("/api/support/whatsapp/initiate",async(req,res,next)=>{try{const id=await add("whatsappSessions",{userId:req.catalogUid,status:"REQUESTED"});await audit(req.catalogUid,"WHATSAPP_SUPPORT_INITIATED","whatsapp",{id});res.status(201).json({id,status:"REQUESTED"});}catch(e){next(e);}});
  app.get("/api/support/whatsapp/status",async(req,res,next)=>{try{const s=await firestoreCollection("whatsappSessions").where("userId","==",req.catalogUid).limit(1).get();res.json({status:s.empty?"NOT_CONNECTED":s.docs[0].data().status,id:s.empty?null:s.docs[0].id});}catch(e){next(e);}});
  app.post("/api/support/ticket/create",async(req,res,next)=>{try{const subject=String(req.body?.subject||"").trim();const body=String(req.body?.body||"").trim();if(!subject||!body)return res.status(400).json({error:"subject and body are required."});const id=await add("supportTickets",{userId:req.catalogUid,subject,body,status:"OPEN",priority:String(req.body?.priority||"NORMAL")});await audit(req.catalogUid,"SUPPORT_TICKET_CREATED","supportTicket",{id});res.status(201).json({ticketId:id,status:"OPEN"});}catch(e){next(e);}});
}

module.exports={installCatalogRoutes};
