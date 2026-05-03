const admin = require("firebase-admin");
const fs = require("fs");

const sa = JSON.parse(fs.readFileSync("./firebase-service-account.json"));

admin.initializeApp({ credential: admin.credential.cert(sa) });

const token = 'eJ0gX2jMGuPM1iXfNhNpIB:APA91bHzfyGK0SGjCgIAyNASZCpzXc3LCTfCCwWBzrn2G4EGE7Y_3RQ901Zb-moiKEJOPlcqbXN7XfZ8SJ0w70yWWgP-jKb8WNMrVvXXpEBb3J5FQ3HTZ_o';

admin.messaging().send({
  token: token,
  notification: { 
    title: "Test LightProject", 
    body: "Firebase marche !" 
  }
})
.then(r => console.log("✅ SUCCESS:", r))
.catch(e => console.error("❌ ERROR:", e.message));