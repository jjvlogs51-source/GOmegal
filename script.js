// ================== FIREBASE CONFIG ==================
const firebaseConfig = {
  apiKey: "AIzaSyBTUWFf5riABpR0vBfzRMSgSqd0gXaJMx0",
  authDomain: "gomegle-6fe5f.firebaseapp.com",
  databaseURL: "https://gomegle-6fe5f-default-rtdb.firebaseio.com",
  projectId: "gomegle-6fe5f",
  storageBucket: "gomegle-6fe5f.firebasestorage.app",
  messagingSenderId: "41008653138",
  appId: "1:41008653138:web:7ccb5c813bc8b9372a508b"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ================== GLOBALS ==================
const servers = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
let peerConnection, localStream, remoteStream;
let myId = Math.random().toString(36).substring(2, 9);
let currentChat = null;
let usersRef = db.ref("users");

// DOM Elements
const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const connectBtn = document.getElementById("connectBtn");
const skipBtn = document.getElementById("skipBtn");
const stopBtn = document.getElementById("stopBtn");
const interestsInput = document.getElementById("interestsInput");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

// ================== EVENT LISTENERS ==================
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", e => { if (e.key === "Enter") sendMessage(); });

connectBtn.addEventListener("click", async () => {
  connectBtn.disabled = true;
  skipBtn.disabled = false;
  stopBtn.disabled = false;
  await setupMedia();
  startMatching();
});

skipBtn.addEventListener("click", () => skip());
stopBtn.addEventListener("click", () => location.reload());

// ================== MEDIA ==================
async function setupMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch (err) {
    alert("❌ Camera/mic access is required!");
  }
}

// ================== MATCHING ==================
async function startMatching() {
  chatBox.innerHTML += `<div>🔎 Searching for a stranger...</div>`;
  const interests = interestsInput.value.split(",").map(i => i.trim().toLowerCase()).filter(Boolean);

  usersRef.once("value", async (snapshot) => {
    const users = snapshot.val() || {};
    let strangerId = Object.keys(users).find(uid =>
      uid !== myId && !users[uid].connected &&
      users[uid].interests.some(i => interests.includes(i))
    );
    if (strangerId) startCall(strangerId);
    else {
      await usersRef.child(myId).set({ connected: false, interests });
      listenForCall();
    }
  });
}

function skip() {
  endConnection();
  chatBox.innerHTML += `<div>⏭ Skipped. Searching again...</div>`;
  startMatching();
}

function endConnection() {
  if (peerConnection) peerConnection.close();
  peerConnection = null;
  remoteVideo.srcObject = null;
  currentChat = null;
}

// ================== CALL HANDLING ==================
async function startCall(strangerId) {
  chatBox.innerHTML += `<div>✅ Connected!</div>`;
  currentChat = strangerId;
  createPeer();

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  db.ref("calls/" + strangerId).push({ type: "offer", offer, from: myId });

  listenForMessages(strangerId);
}

function createPeer() {
  peerConnection = new RTCPeerConnection(servers);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  peerConnection.ontrack = e => e.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
  peerConnection.onicecandidate = e => e.candidate && db.ref("calls/" + currentChat).push({ type: "candidate", candidate: e.candidate });
}

function listenForCall() {
  db.ref("calls/" + myId).on("child_added", async (snap) => {
    const data = snap.val();
    if (data.type === "offer") acceptCall(data.from, data.offer);
    if (data.type === "candidate" && peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  });
}

async function acceptCall(strangerId, offer) {
  chatBox.innerHTML += `<div>✅ Stranger connected!</div>`;
  currentChat = strangerId;
  createPeer();
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  db.ref("calls/" + strangerId).push({ type: "answer", answer });
  listenForMessages(strangerId);
}

db.ref("calls/" + myId).on("child_added", async (snap) => {
  const data = snap.val();
  if (data.type === "answer" && peerConnection) await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  if (data.type === "candidate" && peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
});

// ================== MESSAGING ==================
function listenForMessages(strangerId) {
  db.ref("messages/" + strangerId).on("child_added", snap => {
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
