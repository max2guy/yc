// ==========================================
// 연천장로교회 청년부 기도 네트워크 (Final v16)
// ==========================================

// 1. 서비스 워커 및 초기 설정
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function(registration) {
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    document.getElementById('update-toast').classList.add('show');
                }
            });
        });
    }, function(err) { console.log('SW Fail: ', err); });
}

// 2. Firebase 설정
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
const presenceRef = database.ref('presence');

// 3. 변수 및 상태
let isAdmin = false;
let isFirstRender = true;
let currentMemberData = null;
let members = [];
let isDataLoaded = false;
let simulation = null;
let readStatus = JSON.parse(localStorage.getItem('readStatus')) || {};
let isNotiEnabled = localStorage.getItem('isNotiEnabled') !== 'false'; 
let mySessionId = localStorage.getItem('mySessionId') || 'user_' + Date.now();
localStorage.setItem('mySessionId', mySessionId);
let lastChatReadTime = Number(localStorage.getItem('lastChatReadTime')) || Date.now();
let isFabOpen = false;
const brightColors = ["#FFCDD2", "#F8BBD0", "#E1BEE7", "#D1C4E9", "#C5CAE9", "#BBDEFB", "#B3E5FC", "#B2EBF2", "#B2DFDB", "#C8E6C9", "#DCEDC8", "#F0F4C3", "#FFF9C4", "#FFECB3", "#FFE0B2", "#FFCCBC", "#D7CCC8", "#F5F5F5", "#CFD8DC"];

// 4. UI 핸들러
function toggleFabMenu() {
    isFabOpen = !isFabOpen;
    const container = document.getElementById('menu-container');
    if(isFabOpen) container.classList.add('menu-open');
    else container.classList.remove('menu-open');
}

document.body.addEventListener('click', (e) => {
    if(isFabOpen && !e.target.closest('#menu-container')) { toggleFabMenu(); }
    if (!e.target.closest('.more-btn')) {
        document.querySelectorAll('.more-options').forEach(el => el.classList.remove('active'));
    }
});

function openSettingsModal() {
    document.getElementById('setting-noti-toggle').checked = (isNotiEnabled && Notification.permission === "granted");
    document.getElementById('setting-admin-toggle').checked = isAdmin;
    document.getElementById('settings-modal').classList.add('active');
    if(isFabOpen) toggleFabMenu();
}
function closeSettingsModal() { document.getElementById('settings-modal').classList.remove('active'); }

function handleNotiToggle(checkbox) {
    if (checkbox.checked) {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") enableNotification();
            else { alert("권한이 거부되었습니다."); checkbox.checked = false; }
        });
    } else {
        isNotiEnabled = false;
        localStorage.setItem('isNotiEnabled', 'false');
        updateNotiButtonUI();
        alert("알림이 해제되었습니다.");
    }
}

function handleAdminToggle(checkbox) {
    if (checkbox.checked) { checkbox.checked = false; openAdminModal(); }
    else {
        if (confirm("관리자 모드를 해제하시겠습니까?")) {
            firebase.auth().signOut().then(() => { isAdmin = false; alert("해제되었습니다."); });
        } else checkbox.checked = true;
    }
}

function toggleNotification() {
    if (isNotiEnabled) {
        isNotiEnabled = false; localStorage.setItem('isNotiEnabled', 'false');
        updateNotiButtonUI(); alert("알림 해제됨. 🔕");
    } else {
        Notification.requestPermission().then(p => { if(p==="granted") enableNotification(); else alert("권한 필요"); });
    }
}

function enableNotification() {
    isNotiEnabled = true; localStorage.setItem('isNotiEnabled', 'true');
    updateNotiButtonUI();
    if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then(reg => reg.showNotification("알림 설정됨!", {icon:'icon-192.png'}));
}

function updateNotiButtonUI() {
    const btn = document.getElementById('noti-btn');
    if (btn) btn.innerText = isNotiEnabled ? "🔕 알림 끄기" : "🔔 알림 켜기";
}

function forceRefresh() {
    if(confirm("데이터를 초기화하고 새로고침 하시겠습니까?")) {
        if ('caches' in window) {
            caches.keys().then(names => { for (let name of names) caches.delete(name); window.location.reload(true); });
        } else window.location.reload(true);
    }
}

// 5. 데이터 로드 로직
function loadData() {
    setTimeout(() => { document.getElementById('loading').classList.add('hide'); if (!isDataLoaded) { updateGraph(); fetchWeather(); } }, 3000);
    Promise.all([membersRef.once('value'), centerNodeRef.once('value')])
    .then(([mSnap, cSnap]) => {
        const mData = mSnap.val(); const cData = cSnap.val();
        if (mData) members = Object.keys(mData).map(key => ({ firebaseKey: key, ...mData[key] }));
        isDataLoaded = true; document.getElementById('loading').classList.add('hide');
        updateGraph(); fetchWeather(); isFirstRender = false;
    }).catch(err => { console.log("Load Error:", err); document.getElementById('loading').classList.add('hide'); updateGraph(); });
}
loadData();

// 6. D3 시각화 엔진
const width = window.innerWidth, height = window.innerHeight;
const svg = d3.select("#visualization").append("svg").attr("width", width).attr("height", height);
const g = svg.append("g");
svg.call(d3.zoom().scaleExtent([0.1, 4]).on("zoom", (e) => g.attr("transform", e.transform)));

const linkGroup = g.append("g").attr("class", "links");
const nodeGroup = g.append("g").attr("class", "nodes");
let centerNode = { id: "center", name: "연천장로교회\n청년부", type: "root", color: "#FFF8E1" };

simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id(d => d.id).distance(140))
    .force("charge", d3.forceManyBody().strength(-400))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(d => (d.type==='root'?80:35) + 30));

function updateGraph() {
    const nodes = [centerNode, ...members];
    const links = members.map(m => ({ source: "center", target: m.id }));
    
    let link = linkGroup.selectAll("line").data(links);
    link.exit().remove();
    link = link.enter().append("line").attr("stroke", "#fff").attr("stroke-width", 2).merge(link);

    let node = nodeGroup.selectAll("g").data(nodes, d => d.id);
    node.exit().remove();
    const nEnter = node.enter().append("g").on("click", (e, d) => d.type!=='root' && openPrayerPopup(d));
    nEnter.append("circle").attr("r", d => d.type==='root'?60:35).attr("fill", d => d.color || "#ccc").attr("stroke", "#fff").attr("stroke-width", 2);
    nEnter.append("text").text(d => d.name.split('\n')[0]).attr("text-anchor", "middle").attr("dy", ".35em").style("font-weight", "bold").style("font-size", "12px");
    node = nEnter.merge(node);

    simulation.nodes(nodes).on("tick", () => {
        node.attr("transform", d => `translate(${d.x},${d.y})`);
        link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    });
    simulation.force("link").links(links);
    simulation.alpha(1).restart();
}

// 7. 기도제목 로직 (··· 메뉴 포함)
function renderPrayers() {
    const list = document.getElementById("prayer-list"); 
    list.innerHTML = "";
    if(!currentMemberData || !currentMemberData.prayers) return;

    const displayList = currentMemberData.prayers.map((p, index) => ({ ...p, originalIndex: index }));
    displayList.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

    displayList.forEach((p) => {
        const i = p.originalIndex;
        const div = createSafeElement("div", "prayer-card");
        if (p.isPinned) div.classList.add("pinned");

        const header = createSafeElement("div", "prayer-header");
        const headerLeft = createSafeElement("div");
        headerLeft.style.display = "flex"; headerLeft.style.alignItems = "center"; headerLeft.style.gap = "8px";

        const pinBtn = createSafeElement("button", "text-btn", p.isPinned ? "📌 해제" : "📍 고정");
        pinBtn.onclick = () => togglePin(i);
        pinBtn.style.color = p.isPinned ? "#E65100" : "#aaa";
        headerLeft.appendChild(pinBtn);
        headerLeft.appendChild(createSafeElement("span", "", p.date));

        const moreWrapper = document.createElement("div");
        moreWrapper.style.position = "relative";
        const moreBtn = createSafeElement("button", "more-btn", "···");
        const optionsMenu = createSafeElement("div", "more-options");
        optionsMenu.id = `opt-${i}`;

        const optEdit = createSafeElement("button", "opt-btn", "📝 수정");
        optEdit.onclick = (e) => { e.stopPropagation(); editPrayer(i); optionsMenu.classList.remove('active'); };
        
        const optDel = createSafeElement("button", "opt-btn del-opt", isAdmin ? "🗑️ 강제삭제" : "🗑️ 삭제");
        optDel.onclick = (e) => { e.stopPropagation(); isAdmin ? adminDeletePrayer(i) : deletePrayer(i); optionsMenu.classList.remove('active'); };

        optionsMenu.appendChild(optEdit); optionsMenu.appendChild(optDel);
        moreBtn.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.more-options').forEach(el => el.id !== `opt-${i}` && el.classList.remove('active'));
            optionsMenu.classList.toggle('active');
        };

        moreWrapper.appendChild(moreBtn); moreWrapper.appendChild(optionsMenu);
        header.appendChild(headerLeft); header.appendChild(moreWrapper);

        const actionGroup = createSafeElement("div", "action-group");
        const replyBtn = createSafeElement("button", "text-btn", "💬 답글");
        replyBtn.onclick = () => addReply(i);
        actionGroup.appendChild(replyBtn);

        div.appendChild(header); 
        div.appendChild(createSafeElement("div", "prayer-content", p.content)); 
        div.appendChild(actionGroup);

        if (p.replies) {
            const replySection = createSafeElement("div", "reply-section");
            p.replies.forEach((r, rIdx) => {
                const rItem = createSafeElement("div", "reply-item");
                const delBtn = document.createElement("button");
                delBtn.innerHTML = "&times;"; delBtn.style.cssText = "border:none; background:none; color:#aaa; cursor:pointer; font-size:1.2rem; padding-left:10px;";
                delBtn.onclick = () => deleteReply(i, rIdx);
                rItem.appendChild(createSafeElement("span", "", "💬 " + r.content)); rItem.appendChild(delBtn);
                replySection.appendChild(rItem);
            });
            div.appendChild(replySection);
        }
        list.appendChild(div);
    });
}

// 8. 보조 함수들
function createSafeElement(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; }
function deleteReply(pIdx, rIdx) { if(confirm("삭제하시겠습니까?")) { currentMemberData.prayers[pIdx].replies.splice(rIdx, 1); syncPrayers(); } }
function togglePin(index) { currentMemberData.prayers[index].isPinned = !(currentMemberData.prayers[index].isPinned || false); syncPrayers(); }
function deletePrayer(i) { if(confirm("정말 삭제?")) { currentMemberData.prayers.splice(i, 1); syncPrayers(); } }
function adminDeletePrayer(i) { if(confirm("강제 삭제?")) { currentMemberData.prayers.splice(i, 1); syncPrayers(); } }
function editPrayer(i) { const v = prompt("수정:", currentMemberData.prayers[i].content); if(v) { currentMemberData.prayers[i].content = v; syncPrayers(); } }
function syncPrayers() { membersRef.child(currentMemberData.firebaseKey).update({prayers: currentMemberData.prayers || []}).then(() => renderPrayers()); }
function addPrayer() { const v = document.getElementById("new-prayer").value.trim(); if(v) { if(containsBannedWords(v)) return alert("부적절한 내용"); const p = currentMemberData.prayers||[]; p.unshift({content:v, date:new Date().toISOString().split('T')[0]}); membersRef.child(currentMemberData.firebaseKey).update({prayers:p}).then(() => { document.getElementById("new-prayer").value=""; membersRef.once('value').then(s => { const data = s.val(); members = Object.keys(data).map(k => ({firebaseKey:k, ...data[k]})); currentMemberData = members.find(m => m.firebaseKey === currentMemberData.firebaseKey); renderPrayers(); }); }); } }
function addReply(i) { const v = prompt("답글:"); if(v) { if(!currentMemberData.prayers[i].replies) currentMemberData.prayers[i].replies = []; currentMemberData.prayers[i].replies.push({content:v}); syncPrayers(); } }

function openPrayerPopup(d) { currentMemberData = d; document.getElementById("panel-name").innerText = d.name; document.getElementById("prayer-popup").classList.add("active"); renderPrayers(); }
function closePrayerPopup() { document.getElementById("prayer-popup").classList.remove("active"); currentMemberData = null; }

function addNewMember() {
    const n = prompt("이름:");
    if(n) membersRef.push({id:"m_"+Date.now(), name:n, type:"member", color:brightColors[Math.floor(Math.random()*brightColors.length)], prayers:[]}).then(() => window.location.reload());
}

function checkAdmin() { 
    const inputPw = document.getElementById('admin-pw').value; const adminEmail = "admin@church.com"; 
    firebase.auth().signInWithEmailAndPassword(adminEmail, inputPw).then(() => {
        isAdmin = true; document.getElementById('admin-modal').classList.remove('active');
        alert("관리자 모드 활성!");
        if(currentMemberData) renderPrayers();
    }).catch(() => alert("틀렸습니다."));
}

function openAdminModal() { document.getElementById('admin-modal').classList.add('active'); }
function closeAdminModal(e) { if(e.target.id === 'admin-modal') document.getElementById('admin-modal').classList.remove('active'); }

async function fetchWeather() { document.getElementById('weather-text').innerText = "연천군: 맑음, 5°C"; }

const bannedWords = ["욕설", "비속어"];
function containsBannedWords(text) { return bannedWords.some(word => text.includes(word)); }

// 초기 실행
updateNotiButtonUI();
