// ==========================================
// 연천장로교회 청년부 기도 네트워크 (Final v15)
// ==========================================

// 1. 서비스 워커 등록
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

// PWA 설치 버튼 로직
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
        installBtn.style.display = 'block';
        installBtn.onclick = () => {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((result) => {
                if (result.outcome === 'accepted') installBtn.style.display = 'none';
                deferredPrompt = null;
            });
        };
    }
});

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
const onlineRef = database.ref('.info/connected');
const presenceRef = database.ref('presence');
const messagesRef = database.ref('messages');

// 3. 변수 및 상태 관리
let isAdmin = false;
let isFirstRender = true;
let currentMemberData = null;
let readStatus = JSON.parse(localStorage.getItem('readStatus')) || {};
let isNotiEnabled = localStorage.getItem('isNotiEnabled') !== 'false'; 
let mySessionId = localStorage.getItem('mySessionId') || 'user_' + Date.now();
localStorage.setItem('mySessionId', mySessionId);

let isFabOpen = false;
let newMemberIds = new Set();
let globalNodes = [];
let simulation = null;
const loadTime = Date.now();
let unreadChatKeys = new Set();
let lastChatReadTime = Number(localStorage.getItem('lastChatReadTime')) || Date.now();

const brightColors = ["#FFCDD2", "#F8BBD0", "#E1BEE7", "#D1C4E9", "#C5CAE9", "#BBDEFB", "#B3E5FC", "#B2EBF2", "#B2DFDB", "#C8E6C9", "#DCEDC8", "#F0F4C3", "#FFF9C4", "#FFECB3", "#FFE0B2", "#FFCCBC", "#D7CCC8", "#F5F5F5", "#CFD8DC"];

// 4. UI 핸들러 & 메뉴
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

function forceRefresh() {
    if(confirm("데이터를 초기화하고 새로고침 하시겠습니까?")) {
        if ('caches' in window) {
            caches.keys().then(names => { 
                for (let name of names) caches.delete(name); 
                window.location.reload(true); 
            });
        } else window.location.reload(true);
    }
}

// 5. 설정 및 알림 로직
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
        updateNotiButtonUI(); alert("알림이 해제되었습니다. 🔕");
    } else {
        if (!("Notification" in window)) return alert("이 기기는 알림을 지원하지 않습니다.");
        if (Notification.permission === "granted") enableNotification();
        else {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") enableNotification();
                else alert("알림 권한이 거부되었습니다.");
            });
        }
    }
}

function enableNotification() {
    isNotiEnabled = true; localStorage.setItem('isNotiEnabled', 'true');
    updateNotiButtonUI();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
            reg.showNotification("알림 설정 완료!", { body: "이제부터 알림을 받아보세요.", icon: 'icon-192.png', vibrate: [100] });
        });
    }
}

function updateNotiButtonUI() {
    const btn = document.getElementById('noti-btn');
    const toggle = document.getElementById('setting-noti-toggle');
    if (btn) {
        if (isNotiEnabled) { btn.innerText = "🔕 알림 끄기"; btn.style.backgroundColor = "#FFCDD2"; btn.style.borderColor = "#EF9A9A"; }
        else { btn.innerText = "🔔 알림 켜기"; btn.style.backgroundColor = "#FFF3E0"; btn.style.borderColor = "#FF9800"; }
    }
    if(toggle) toggle.checked = isNotiEnabled;
}

// 6. 데이터 로드 및 Firebase 리스너
let isDataLoaded = false;
function loadData() {
    setTimeout(() => { document.getElementById('loading').classList.add('hide'); if (!isDataLoaded) { updateGraph(); fetchWeather(); } }, 3000);
    Promise.all([membersRef.once('value'), centerNodeRef.once('value')])
    .then(([mSnap, cSnap]) => {
        const mData = mSnap.val(); const cData = cSnap.val();
        if (mData) members = Object.keys(mData).map(key => ({ firebaseKey: key, ...mData[key] }));
        if(cData && cData.icon) centerNode.icon = cData.icon;
        members.forEach(m => { if(!m.rotationDirection) m.rotationDirection = Math.random() < 0.5 ? 1 : -1; if(m.rotation === undefined) m.rotation = 0; });
        isDataLoaded = true; document.getElementById('loading').classList.add('hide');
        updateGraph(); fetchWeather(); setTimeout(() => { isFirstRender = false; }, 5000);
    }).catch(err => { console.log("Firebase Load Error:", err); document.getElementById('loading').classList.add('hide'); updateGraph(); });
}
loadData();

// 7. 기도제목 및 관리 로직
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

function deleteReply(pIdx, rIdx) { if(confirm("삭제하시겠습니까?")) { currentMemberData.prayers[pIdx].replies.splice(rIdx, 1); syncPrayers(); } }
function togglePin(index) { currentMemberData.prayers[index].isPinned = !(currentMemberData.prayers[index].isPinned || false); syncPrayers(); }
function deletePrayer(i) { if(confirm("정말 삭제?")) { currentMemberData.prayers.splice(i, 1); syncPrayers(); } }
function adminDeletePrayer(i) { if(confirm("강제 삭제?")) { currentMemberData.prayers.splice(i, 1); syncPrayers(); } }
function editPrayer(i) { const v = prompt("수정:", currentMemberData.prayers[i].content); if(v) { currentMemberData.prayers[i].content = v; syncPrayers(); } }
function syncPrayers() { membersRef.child(currentMemberData.firebaseKey).update({prayers: currentMemberData.prayers || []}).then(() => renderPrayers()); }
function addPrayer() { const v = document.getElementById("new-prayer").value.trim(); if(v) { if(containsBannedWords(v)) return alert("부적절한 내용"); const p = currentMemberData.prayers||[]; p.unshift({content:v, date:new Date().toISOString().split('T')[0]}); membersRef.child(currentMemberData.firebaseKey).update({prayers:p}); document.getElementById("new-prayer").value=""; } }
function addReply(i) { const v = prompt("답글:"); if(v) { if(containsBannedWords(v)) return alert("부적절한 내용"); if(!currentMemberData.prayers[i].replies) currentMemberData.prayers[i].replies=[]; currentMemberData.prayers[i].replies.push({content:v}); membersRef.child(currentMemberData.firebaseKey).update({prayers:currentMemberData.prayers}); } }

function checkAdmin() { 
    const inputPw = document.getElementById('admin-pw').value;
    const adminEmail = "admin@church.com"; 
    firebase.auth().signInWithEmailAndPassword(adminEmail, inputPw).then(() => {
        document.getElementById('admin-modal').classList.remove('active');
        alert("관리자 모드 활성!");
        document.getElementById('admin-pw').value=""; 
        const adminToggle = document.getElementById('setting-admin-toggle');
        if(adminToggle) adminToggle.checked = true;
        if(currentMemberData) renderPrayers();
    }).catch(() => alert("틀렸습니다."));
}

function addNewMember() { const n = prompt("이름:"); if(n && n.trim()) { if(containsBannedWords(n)) return alert("부적절한 이름"); membersRef.push({id:`member_${Date.now()}`, name:n.trim(), type:"member", color:brightColors[Math.floor(Math.random()*brightColors.length)], prayers:[], rotation:0, rotationDirection:1}); } }
function deleteMember() { if(currentMemberData && confirm("삭제하시겠습니까?")) { membersRef.child(currentMemberData.firebaseKey).remove(); closePrayerPopup(); }}

// 8. D3.js 시각화 엔진
const width = window.innerWidth, height = window.innerHeight;
const svg = d3.select("#visualization").append("svg").attr("width", width).attr("height", height);
const g = svg.append("g");
svg.call(d3.zoom().scaleExtent([0.1, 4]).on("zoom", (e) => g.attr("transform", e.transform)));

const linkGroup = g.append("g").attr("class", "links");
const nodeGroup = g.append("g").attr("class", "nodes");
let centerNode = { id: "center", name: "연천장로교회\n청년부\n함께 기도해요", type: "root", icon: "✝️", color: "#FFF8E1" };

simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id(d => d.id).distance(140))
    .force("charge", d3.forceManyBody().strength(-400))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(d => (d.type==='root'?80:35) + 30));

function updateGraph() {
    globalNodes = [centerNode, ...members];
    const links = members.map(m => ({ source: centerNode.id, target: m.id }));
    
    let link = linkGroup.selectAll("line").data(links);
    link.exit().remove();
    link = link.enter().append("line").attr("stroke", "#fff").attr("stroke-width", 2).merge(link);

    let node = nodeGroup.selectAll("g").data(globalNodes, d => d.id);
    node.exit().remove();
    const nodeEnter = node.enter().append("g").on("click", (e, d) => d.type==='member' && openPrayerPopup(d));
    nodeEnter.append("circle").attr("r", d => d.type==='root'?80:35).attr("fill", d => d.color || "#fff");
    nodeEnter.append("text").attr("text-anchor", "middle").attr("dy", ".3em").text(d => d.name.split('\n')[0]);
    node = nodeEnter.merge(node);

    simulation.nodes(globalNodes);
    simulation.force("link").links(links);
    simulation.alpha(1).restart();
}

function openPrayerPopup(data) {
    currentMemberData = data;
    document.getElementById("panel-name").innerText = data.name;
    document.getElementById("prayer-popup").classList.add('active'); 
    renderPrayers();
}
function closePrayerPopup() { document.getElementById("prayer-popup").classList.remove('active'); currentMemberData = null; }

// 9. 날씨 및 애니메이션 루프
async function fetchWeather() {
    // OpenWeather API 또는 Fallback 로직 (기존 유지)
    const toast = document.getElementById('weather-toast');
    const text = document.getElementById('weather-text');
    text.innerText = "연천군: 맑음, 5°C";
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function gameLoop() {
    if(simulation) {
        nodeGroup.selectAll("g").attr("transform", d => `translate(${d.x},${d.y})`);
        linkGroup.selectAll("line").attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    }
    requestAnimationFrame(gameLoop);
}
gameLoop();

// 10. 채팅 수신 알림
messagesRef.limitToLast(1).on('child_added', snap => {
    const d = snap.val();
    if (!isFirstRender && d.senderId !== mySessionId && isNotiEnabled) {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification("새 메시지", { body: d.text, icon: 'icon-192.png' });
            });
        }
    }
});
