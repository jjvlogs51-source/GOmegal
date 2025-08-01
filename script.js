// 1. Initialize Firebase (Create project at https://firebase.google.com/)
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

// 2. WebRTC setup
const servers = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
let peerConnection, localStream, remoteStream;
let myId = Math.random().toString(36).substring(2, 9);
let currentChat = null;

// Elements
const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const connectBtn = document.getElementById("connectBtn");
const stopBtn = document.getElementById("stopBtn");
const interestsInput = document.getElementById("interestsInput");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

sendBtn.onclick = sendMessage;
connectBtn.onclick = connect;
stopBtn.onclick = stopChat;

// Setup local video
async function setupMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
}

// Connect to a stranger with interests
async function connect() {
  await setupMedia();
  connectBtn.disabled = true;
  chatBox.innerHTML += `<div>🔎 Searching for a stranger...</div>`;

  const interests = interestsInput.value.split(",").map(i => i.trim().toLowerCase()).filter(Boolean);

  // Find match in Firebase
  const usersRef = db.ref("users");
  usersRef.once("value", async (snapshot) => {
    let users = snapshot.val() || {};
    let strangerId = Object.keys(users).find(uid => 
      uid !== myId && !users[uid].connected && users[uid].interests.some(i => interests.includes(i))
    );
    if (strangerId) {
      startCall(strangerId);
    } else {
      // No match, register self
      await usersRef.child(myId).set({ connected: false, interests });
      listenForCall();
    }
  });
}

// Start a call
async function startCall(strangerId) {
  chatBox.innerHTML += `<div>✅ Connected to a stranger!</div>`;
  stopBtn.disabled = false;

  peerConnection = new RTCPeerConnection(servers);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  peerConnection.ontrack = (e) => e.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));

  const chatRef = db.ref("calls/" + myId);
  peerConnection.onicecandidate = (e) => e.candidate && chatRef.push({ type: "candidate", candidate: e.candidate });

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  db.ref("calls/" + strangerId).push({ type: "offer", offer, from: myId });

  listenForMessages(strangerId);
  currentChat = strangerId;
}

// Listen for incoming calls
function listenForCall() {
  db.ref("calls/" + myId).on("child_added", async (snap) => {
    const data = snap.val();
    if (data.type === "offer") {
      acceptCall(data.from, data.offer);
    } else if (data.type === "candidate" && peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  });
}

// Accept call
async function acceptCall(strangerId, offer) {
  chatBox.innerHTML += `<div>✅ Stranger connected!</div>`;
  stopBtn.disabled = false;

  peerConnection = new RTCPeerConnection(servers);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  peerConnection.ontrack = (e) => e.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
  peerConnection.onicecandidate = (e) => e.candidate && db.ref("calls/" + strangerId).push({ type: "candidate", candidate: e.candidate });

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  db.ref("calls/" + strangerId).push({ type: "answer", answer });
  listenForMessages(strangerId);
  currentChat = strangerId;
}

// Listen for answer
db.ref("calls/" + myId).on("child_added", async (snap) => {
  const data = snap.val();
  if (data.type === "answer" && peerConnection) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  }
  if (data.type === "candidate" && peerConnection) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

// Messaging
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

// Stop chat
function stopChat() {
  location.reload();
}
