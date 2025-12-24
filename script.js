// ==========================================
// 연천장로교회 청년부 기도 네트워크 (v20 Integrated)
// ==========================================

// 1. Firebase 초기화
const firebaseConfig = {
    apiKey: "AIzaSyAF-L1RGBMb_uZBR4a3Aj0OVFu_KjccWZQ",
    authDomain: "ycprayer-7eac2.firebaseapp.com",
    databaseURL: "https://ycprayer-7eac2-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ycprayer-7eac2",
    storageBucket: "ycprayer-7eac2.firebasestorage.app",
    messagingSenderId: "308314713888",
    appId: "1:308314713888:web:dc52dc7ba1ac7b76153145",
    measurementId: "G-XGEMDBQG2J"
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const membersRef = database.ref('members');
const centerNodeRef = database.ref('centerNode');
const messagesRef = database.ref('messages');
const onlineRef = database.ref('.info/connected');
const presenceRef = database.ref('presence');

// 2. 전역 변수
let isAdmin = false;
let isDataLoaded = false;
let currentMemberData = null;
let members = [];
let simulation = null;
let isFabOpen = false;
let mySessionId = localStorage.getItem('mySessionId') || 'user_' + Date.now();
localStorage.setItem('mySessionId', mySessionId);
let isNotiEnabled = localStorage.getItem('isNotiEnabled') !== 'false';
const width = window.innerWidth, height = window.innerHeight;

// 3. UI 제어 함수
function toggleFabMenu() {
    isFabOpen = !isFabOpen;
    const container = document.getElementById('menu-container');
    if(isFabOpen) container.classList.add('menu-open');
    else container.classList.remove('menu-open');
}

document.body.addEventListener('click', (e) => {
    if(isFabOpen && !e.target.closest('#menu-container')) toggleFabMenu();
    if(!e.target.closest('.more-btn')) {
        document.querySelectorAll('.more-options').forEach(el => el.classList.remove('active'));
    }
});

function openSettingsModal() {
    document.getElementById('settings-modal').classList.add('active');
    const noti = document.getElementById('setting-noti-toggle');
    const admin = document.getElementById('setting-admin-toggle');
    if(noti) noti.checked = isNotiEnabled;
    if(admin) admin.checked = isAdmin;
}
function closeSettingsModal() { document.getElementById('settings-modal').classList.remove('active'); }

function handleNotiToggle(cb) {
    if(cb.checked) {
        Notification.requestPermission().then(p => {
            if(p==="granted") { isNotiEnabled=true; localStorage.setItem('isNotiEnabled','true'); }
            else { alert("권한 거부됨"); cb.checked=false; }
        });
    } else {
        isNotiEnabled=false; localStorage.setItem('isNotiEnabled','false');
    }
}

function handleAdminToggle(cb) {
    if(cb.checked) { cb.checked=false; document.getElementById('admin-modal').classList.add('active'); }
    else { isAdmin=false; alert("관리자 해제됨"); }
}

function checkAdmin() {
    const pw = document.getElementById('admin-pw').value;
    firebase.auth().signInWithEmailAndPassword("admin@church.com", pw).then(() => {
        isAdmin=true; 
        document.getElementById('admin-modal').classList.remove('active');
        document.getElementById('setting-admin-toggle').checked=true;
        alert("관리자 인증 완료");
        if(currentMemberData) renderPrayers();
    }).catch(() => alert("비밀번호 오류"));
}

function forceRefresh() {
    if(confirm("새로고침 하시겠습니까?")) {
        caches.keys().then(names => { for(let n of names) caches.delete(n); });
        location.reload(true);
    }
}

// 4. D3 시각화 엔진
const svg = d3.select("#visualization").append("svg").attr("width", width).attr("height", height);
const g = svg.append("g");
svg.call(d3.zoom().scaleExtent([0.1,4]).on("zoom", e => g.attr("transform", e.transform)));

const linkGroup = g.append("g").attr("class", "links");
const nodeGroup = g.append("g").attr("class", "nodes");
let centerNode = { id:"center", name:"연천장로교회\n청년부", type:"root" };

function initSimulation() {
    simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(d=>d.id).distance(140))
        .force("charge", d3.forceManyBody().strength(-400))
        .force("center", d3.forceCenter(width/2, height/2))
        .force("collide", d3.forceCollide().radius(50));
}

function updateGraph() {
    const nodes = [centerNode, ...members];
    const links = members.map(m => ({source:"center", target:m.id}));

    let link = linkGroup.selectAll("line").data(links);
    link.exit().remove();
    link = link.enter().append("line").attr("stroke","#fff").attr("stroke-width",2).merge(link);

    let node = nodeGroup.selectAll("g").data(nodes, d=>d.id);
    node.exit().remove();
    
    const nodeEnter = node.enter().append("g").on("click", (e,d) => { if(d.type!=='root') openPrayerPopup(d); });
    nodeEnter.append("circle").attr("r", d=>d.type==='root'?70:40).attr("fill", d=>d.color||"#fff").attr("stroke","#fff").attr("stroke-width",2);
    nodeEnter.append("text").attr("text-anchor","middle").attr("dy",".3em").style("font-weight","bold").style("font-size","12px");
    
    node = nodeEnter.merge(node);
    node.select("text").text(d=>d.name);
    node.select("circle").attr("fill", d=>d.color||"#FFF3E0");

    if(!simulation) initSimulation();
    simulation.nodes(nodes).on("tick", () => {
        link.attr("x1",d=>d.source.x).attr("y1",d=>d.source.y).attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);
        node.attr("transform", d=>`translate(${d.x},${d.y})`);
    });
    simulation.force("link").links(links);
    simulation.alpha(1).restart();
}

// 5. 데이터 로딩 (핵심 복구)
function loadData() {
    setTimeout(() => document.getElementById('loading').classList.add('hide'), 3000); // 3초 안전장치
    
    membersRef.on('value', snap => {
        const val = snap.val();
        if(val) members = Object.keys(val).map(k => ({firebaseKey:k, ...val[k]}));
        isDataLoaded = true;
        document.getElementById('loading').classList.add('hide');
        updateGraph();
    });
    
    centerNodeRef.once('value', s => { if(s.val()) centerNode = {...centerNode, ...s.val()}; });
    fetchWeather();
}

// 6. 기도제목 및 기능 로직
function openPrayerPopup(d) {
    currentMemberData = d;
    document.getElementById('panel-name').innerText = d.name;
    document.getElementById('prayer-popup').classList.add('active');
    renderPrayers();
}
function closePrayerPopup() { document.getElementById('prayer-popup').classList.remove('active'); currentMemberData=null; }

function renderPrayers() {
    const list = document.getElementById('prayer-list');
    list.innerHTML = "";
    if(!currentMemberData || !currentMemberData.prayers) { list.innerHTML="<p style='text-align:center'>기도제목이 없습니다.</p>"; return; }
    
    const sorted = [...currentMemberData.prayers].map((p,i)=>({...p, idx:i})).sort((a,b)=>(b.isPinned?1:0)-(a.isPinned?1:0));
    
    sorted.forEach(p => {
        const div = document.createElement('div');
        div.className = `prayer-card ${p.isPinned?'pinned':''}`;
        
        let html = `
            <div class="prayer-header">
                <div>${p.isPinned?'📌 ':''}${p.date}</div>
                <div class="more-wrapper">
                    <button class="more-btn" onclick="toggleMore(${p.idx})">···</button>
                    <div id="opt-${p.idx}" class="more-options">
                        <button class="opt-btn" onclick="togglePin(${p.idx})">${p.isPinned?'📍 해제':'📌 고정'}</button>
                        <button class="opt-btn" onclick="editPrayer(${p.idx})">📝 수정</button>
                        <button class="opt-btn del-opt" onclick="deletePrayer(${p.idx})">🗑️ 삭제</button>
                    </div>
                </div>
            </div>
            <div class="prayer-content">${p.content}</div>
            <div style="border-top:1px solid #eee; padding-top:10px;">
                <button class="text-btn" onclick="addReply(${p.idx})">💬 답글</button>
            </div>
        `;
        
        if(p.replies) {
            html += `<div class="reply-section">`;
            p.replies.forEach((r, ri) => {
                html += `<div class="reply-item"><span>💬 ${r.content}</span><button onclick="deleteReply(${p.idx},${ri})">&times;</button></div>`;
            });
            html += `</div>`;
        }
        div.innerHTML = html;
        list.appendChild(div);
    });
}

// 전역 함수로 노출 (HTML onclick용)
window.toggleMore = (idx) => {
    document.querySelectorAll('.more-options').forEach(e => e.id !== `opt-${idx}` && e.classList.remove('active'));
    document.getElementById(`opt-${idx}`).classList.toggle('active');
};
window.togglePin = (i) => { currentMemberData.prayers[i].isPinned = !currentMemberData.prayers[i].isPinned; sync(); };
window.editPrayer = (i) => { const v=prompt("수정:", currentMemberData.prayers[i].content); if(v) { currentMemberData.prayers[i].content=v; sync(); } };
window.deletePrayer = (i) => { if(confirm("삭제?")) { currentMemberData.prayers.splice(i,1); sync(); } };
window.addReply = (i) => { const v=prompt("답글:"); if(v) { if(!currentMemberData.prayers[i].replies) currentMemberData.prayers[i].replies=[]; currentMemberData.prayers[i].replies.push({content:v}); sync(); } };
window.deleteReply = (pi, ri) => { if(confirm("삭제?")) { currentMemberData.prayers[pi].replies.splice(ri,1); sync(); } };
window.addPrayer = () => { 
    const v=document.getElementById('new-prayer').value; 
    if(v) { 
        if(!currentMemberData.prayers) currentMemberData.prayers=[]; 
        currentMemberData.prayers.unshift({content:v, date:new Date().toISOString().split('T')[0]}); 
        sync(); document.getElementById('new-prayer').value=""; 
    } 
};
window.deleteMember = () => { if(confirm("멤버 삭제?")) { membersRef.child(currentMemberData.firebaseKey).remove(); closePrayerPopup(); } };

function sync() { membersRef.child(currentMemberData.firebaseKey).update({prayers:currentMemberData.prayers||[]}).then(renderPrayers); }

// 7. 채팅 및 날씨
function toggleChatPopup() { document.getElementById('chat-popup').classList.toggle('active'); }
function sendChatMessage() {
    const v = document.getElementById('chat-msg').value;
    if(v) { messagesRef.push({text:v, senderId:mySessionId, timestamp:Date.now()}); document.getElementById('chat-msg').value=""; }
}
messagesRef.limitToLast(30).on('child_added', s => {
    const d=s.val();
    const div=document.createElement('div');
    div.style.cssText = `padding:8px; margin:5px; border-radius:10px; background:${d.senderId===mySessionId?'#FFE0B2':'#f1f1f1'}; align-self:${d.senderId===mySessionId?'flex-end':'flex-start'};`;
    div.innerText = d.text;
    document.getElementById('chat-messages').appendChild(div);
});

async function fetchWeather() {
    try {
        const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=38.09&longitude=127.07&current_weather=true");
        const data = await res.json();
        document.getElementById('weather-text').innerText = `연천군 ${data.current_weather.temperature}°C`;
    } catch(e) { console.log("Weather fail"); }
}

// 8. 앱 시작
loadData();

// Service Worker 등록
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
