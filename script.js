// ===================== FIREBASE SETUP =====================
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ===================== GLOBALS =====================
const servers = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
let peerConnection, localStream, remoteStream;
let myId = Math.random().toString(36).substring(2, 9);
let currentChat = null;

// DOM Elements
const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const connectBtn = document.getElementById("connectBtn");
const stopBtn = document.getElementById("stopBtn");
const interestsInput = document.getElementById("interestsInput");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

// ===================== EVENT HANDLERS =====================
sendBtn.addEventListener("click", sendMessage);
connectBtn.addEventListener("click", async () => {
  connectBtn.disabled = true;
  stopBtn.disabled = false;

  // 🔥 ASK FOR CAMERA/MIC IMMEDIATELY ON CLICK
  await setupMedia();

  chatBox.innerHTML += `<div>🔎 Searching for a stranger...</div>`;
  connect(); // Proceed to matchmaking AFTER permission granted
});
stopBtn.addEventListener("click", stopChat);
messageInput.addEventListener("keypress", e => { if (e.key === "Enter") sendMessage(); });

// ===================== MEDIA SETUP =====================
async function setupMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch (err) {
    alert("❌ Camera and microphone access are required to use GOmegle.");
    console.error(err);
  }
}

// ===================== CONNECT TO STRANGER =====================
async function connect() {
  const interests = interestsInput.value
    .split(",")
    .map(i => i.trim().toLowerCase())
    .filter(Boolean);

  const usersRef = db.ref("users");

  usersRef.once("value", async (snapshot) => {
    const users = snapshot.val() || {};
    let strangerId = Object.keys(users).find(uid =>
      uid !== myId && !users[uid].connected &&
      users[uid].interests.some(i => interests.includes(i))
    );

    if (strangerId) {
      startCall(strangerId);
    } else {
      await usersRef.child(myId).set({ connected: false, interests });
      listenForCall();
    }
  });
}

// ===================== START CALL =====================
async function startCall(strangerId) {
  chatBox.innerHTML += `<div>✅ Connected to a stranger!</div>`;
  currentChat = strangerId;

  peerConnection = new RTCPeerConnection(servers);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  peerConnection.ontrack = (event) => event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) db.ref("calls/" + strangerId).push({ type: "candidate", candidate: event.candidate });
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  db.ref("calls/" + strangerId).push({ type: "offer", offer, from: myId });

  listenForMessages(strangerId);
}

// ===================== LISTEN FOR CALL =====================
function listenForCall() {
  db.ref("calls/" + myId).on("child_added", async (snap) => {
    const data = snap.val();

    if (data.type === "offer") acceptCall(data.from, data.offer);
    if (data.type === "candidate" && peerConnection)
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  });
}

// ===================== ACCEPT CALL =====================
async function acceptCall(strangerId, offer) {
  chatBox.innerHTML += `<div>✅ Stranger connected!</div>`;
  currentChat = strangerId;

  peerConnection = new RTCPeerConnection(servers);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  peerConnection.ontrack = (event) => event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));

  peerConnection.onicecandidate = (event) => {
    if (event.candidate)
      db.ref("calls/" + strangerId).push({ type: "candidate", candidate: event.candidate });
  };

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  db.ref("calls/" + strangerId).push({ type: "answer", answer });

  listenForMessages(strangerId);
}

// ===================== HANDLE ANSWER =====================
db.ref("calls/" + myId).on("child_added", async (snap) => {
  const data = snap.val();
  if (data.type === "answer" && peerConnection) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  }
  if (data.type === "candidate" && peerConnection) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

// ===================== MESSAGING =====================
function listenForMessages(strangerId) {
  db.ref("messages/" + strangerId).on("child_added", (snap) => {
    const { text, from } = snap.val();
    if (from !== myId) chatBox.innerHTML += `<div><b>Stranger:</b> ${text}</div>`;
  });
}

function sendMessage() {
  const msg = messageInput.value.trim();
  if (!msg || !currentChat) return;
  chatBox.innerHTML += `<div><b>You:</b> ${msg}</div>`;
  db.ref("messages/" + currentChat).push({ text: msg, from: myId });
  messageInput.value = "";
}

// ===================== STOP CHAT =====================
function stopChat() {
  location.reload(); // Full reset
}
