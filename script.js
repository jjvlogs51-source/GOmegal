// Firebase Config (create your own project at https://firebase.google.com/)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let myId = Math.random().toString(36).substring(2, 9);
let chatRef = db.ref("chats");
let connectedUser = null;

// Elements
const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const connectBtn = document.getElementById("connectBtn");

connectBtn.addEventListener("click", connectToStranger);
sendBtn.addEventListener("click", sendMessage);

function connectToStranger() {
  chatBox.innerHTML += `<div>Looking for a stranger...</div>`;
  chatRef.once("value", (snapshot) => {
    let users = snapshot.val() || {};
    let strangerId = Object.keys(users).find(uid => uid !== myId && !users[uid].connected);
    if (strangerId) {
      // Connect to stranger
      connectedUser = strangerId;
      chatRef.child(myId).set({ connected: connectedUser });
      chatRef.child(strangerId).update({ connected: myId });
      chatBox.innerHTML += `<div>Connected to stranger!</div>`;
    } else {
      chatRef.child(myId).set({ connected: false });
    }
  });
}

// Listen for messages
chatRef.on("child_changed", (snap) => {
  if (snap.key === myId && snap.val().message) {
    chatBox.innerHTML += `<div><b>Stranger:</b> ${snap.val().message}</div>`;
  }
});

function sendMessage() {
  if (!connectedUser) return;
  const msg = messageInput.value.trim();
  if (!msg) return;
  chatBox.innerHTML += `<div><b>You:</b> ${msg}</div>`;
  chatRef.child(connectedUser).update({ message: msg });
  messageInput.value = "";
}
