// ==========================================
// 연천장로교회 청년부 기도 네트워크
// (기능: 인트로 + 안전장치 + 아이콘 + 접근성 + 배경음악 + 이스터에그 텍스트 수정)
// ==========================================

// 1. 서비스 워커
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

// [PWA 배너]
let deferredPrompt;
const installBanner = document.getElementById('install-banner');
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    setTimeout(() => { if(installBanner) installBanner.classList.add('show'); }, 5000);
});
if(document.getElementById('btn-install-app')) {
    document.getElementById('btn-install-app').addEventListener('click', () => {
        if (installBanner) installBanner.classList.remove('show');
        if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.then(() => { deferredPrompt = null; }); }
    });
}
if(document.getElementById('btn-close-install')) {
    document.getElementById('btn-close-install').addEventListener('click', () => { if(installBanner) installBanner.classList.remove('show'); });
}

// UI 핸들러
let isFabOpen = false;
function toggleFabMenu() {
    isFabOpen = !isFabOpen;
    const container = document.getElementById('menu-container');
    if(isFabOpen) container.classList.add('menu-open');
    else container.classList.remove('menu-open');
}
document.body.addEventListener('click', (e) => { if(isFabOpen && !e.target.closest('#menu-container')) toggleFabMenu(); });

function forceRefresh() {
    if(confirm("화면을 강제로 새로고침 하시겠습니까?\n(캐시된 데이터를 모두 삭제합니다)")) {
        if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistrations().then(function(registrations) { for(let r of registrations) r.unregister(); }); }
        if ('caches' in window) { caches.keys().then(function(names) { for (let name of names) caches.delete(name); window.location.reload(true); }); } 
        else { window.location.reload(true); }
    }
}

function openSettingsModal() { if(isFabOpen) toggleFabMenu(); document.getElementById('settings-modal').classList.add('active'); }
function closeSettingsModal() { document.getElementById('settings-modal').classList.remove('active'); }

// 2. Firebase
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

let mySessionId = localStorage.getItem('mySessionId');
if (!mySessionId) { mySessionId = 'user_' + Date.now(); localStorage.setItem('mySessionId', mySessionId); }

// 3. 변수
let isAdmin = false;
let isFirstRender = true;
let readStatus = JSON.parse(localStorage.getItem('prayerReadStatus')) || {};
let newMemberIds = new Set();
let globalNodes = [];
let simulation = null;
let unreadChatKeys = new Set();
let touchStartTime = 0;
let touchStartX = 0;
let touchStartY = 0;
let isTouchMove = false;
let dragStartX = 0;
let dragStartY = 0;
let isDragAction = false;
const brightColors = ["#FFCDD2", "#F8BBD0", "#E1BEE7", "#D1C4E9", "#C5CAE9", "#BBDEFB", "#B3E5FC", "#B2EBF2", "#B2DFDB", "#C8E6C9", "#DCEDC8", "#F0F4C3", "#FFF9C4", "#FFECB3", "#FFE0B2", "#FFCCBC", "#D7CCC8", "#F5F5F5", "#CFD8DC"];
let lastChatReadTime = Number(localStorage.getItem('lastChatReadTime')) || Date.now();
let cropper = null;

function checkNotificationPermission() { if (!("Notification" in window)) return; if (Notification.permission !== "denied" && Notification.permission !== "granted") Notification.requestPermission(); }
checkNotificationPermission();

function setAppBadge(count) { if ('setAppBadge' in navigator) { if (count > 0) navigator.setAppBadge(count).catch(e=>{}); else navigator.clearAppBadge().catch(e=>{}); } }

async function getMyIp() { try { const res = await fetch('https://api.ipify.org?format=json'); const data = await res.json(); return data.ip; } catch (e) { return '알수없음'; } }

onlineRef.on('value', async (snapshot) => { if (snapshot.val()) { const myIp = await getMyIp(); const con = presenceRef.push(); con.onDisconnect().remove(); con.set({ ip: myIp, time: Date.now(), device: navigator.userAgent }); } });
presenceRef.on('value', (snapshot) => { 
    const count = snapshot.numChildren() || 0; 
    document.getElementById('online-count').innerText = `${count}명 접속 중`; 
});

// [이스터에그] 변수 및 함수
let eggClickCount = 0;
let eggTimer = null;
let isHeartRain = false;
const originalCenterName = "연천장로교회\n청년부\n함께 기도해요"; 

function handleOnlineCounterClick() {
    if (isAdmin) { showConnectedUsers(); return; }

    eggClickCount++;
    if (eggTimer) clearTimeout(eggTimer);
    
    // 모바일 터치 위해 1.5초로 여유 있게
    eggTimer = setTimeout(() => { eggClickCount = 0; }, 1500); 

    if (eggClickCount >= 5) {
        eggClickCount = 0;
        triggerHeartRain();
    }
}

function triggerHeartRain() {
    isHeartRain = !isHeartRain; 
    if (isHeartRain) {
        createHearts(); 
        centerNode.icon = "💖";
        // [수정됨] 2줄로 변경
        centerNode.name = "사랑이 넘치는\n우리 청년부";
        updateGraph(); 
        
        showWeatherToast("이스터에그 발견! 🎁", "사랑이 가득하네요 🥰", 6000);
        wctx.clearRect(0,0,wc.width,wc.height);
    } else {
        fetchWeather(); 
        centerNode.icon = "✝️";
        centerNode.name = originalCenterName;
        updateGraph(); 

        showWeatherToast("일상 모드", "원래대로 돌아왔습니다.");
    }
    updateNodeVisuals();
}

function showConnectedUsers() {
    presenceRef.once('value').then(snap => {
        const data = snap.val();
        const existing = document.getElementById('kick-modal'); if(existing) existing.remove();
        const modal = document.createElement('div'); modal.id = 'kick-modal';
        modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:9999;display:flex;justify-content:center;align-items:center;animation:fadeIn 0.2s;";
        let content = `<div style="background:white;width:85%;max-width:350px;border-radius:15px;padding:20px;max-height:70vh;overflow-y:auto;box-shadow:0 10px 25px rgba(0,0,0,0.5);"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:2px solid #FFAB91;padding-bottom:10px;"><h3 style="margin:0;color:#5D4037;">👮 접속자 관리</h3><button onclick="document.getElementById('kick-modal').remove()" style="border:none;background:none;font-size:1.5rem;cursor:pointer;" aria-label="닫기">&times;</button></div>`;
        if (!data) content += `<p style="text-align:center;color:#888;">현재 접속자가 없습니다.</p>`;
        else {
            Object.entries(data).forEach(([key, user]) => {
                let info = "정보 없음";
                if(user && user.ip) {
                    let device = "기타 기기";
                    if (user.device.includes("iPhone")) device = "아이폰"; else if (user.device.includes("Android")) device = "갤럭시/안드로이드"; else if (user.device.includes("Windows")) device = "윈도우 PC"; else if (user.device.includes("Mac")) device = "맥(Mac)";
                    const time = new Date(user.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    info = `<b>${device}</b><br><span style="font-size:0.8rem;color:#888;">${user.ip} / ${time}</span>`;
                }
                content += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px dashed #eee;"><div style="font-size:0.9rem;color:#333;line-height:1.4;">${info}</div><button onclick="kickUser('${key}')" style="background:#FF5252;color:white;border:none;padding:6px 12px;border-radius:20px;cursor:pointer;font-weight:bold;font-size:0.8rem;box-shadow:0 2px 5px rgba(0,0,0,0.2);" aria-label="강제 퇴장">Kick 👢</button></div>`;
            });
        }
        content += `</div>`; modal.innerHTML = content; modal.onclick = (e) => { if(e.target === modal) modal.remove(); }; document.body.appendChild(modal);
    });
}
function kickUser(key) { if(confirm("강퇴하시겠습니까?")) { presenceRef.child(key).remove().then(() => { alert("강퇴 완료"); document.getElementById('kick-modal').remove(); setTimeout(showConnectedUsers, 500); }); } }

const bannedWords = ["욕설", "비속어", "시발", "씨발", "개새끼", "병신", "지랄", "존나", "졸라", "미친", "성매매", "섹스", "야동", "조건만남", "주식", "코인", "비트코인", "투자", "리딩방", "수익", "바보", "멍청이"];
function containsBannedWords(text) { return bannedWords.some(word => text.includes(word)); }

firebase.auth().onAuthStateChanged((user) => {
    if (user) { isAdmin = true; document.getElementById('body').classList.add('admin-mode'); } 
    else { isAdmin = false; document.getElementById('body').classList.remove('admin-mode'); }
});

let centerNode = { id: "center", name: "연천장로교회\n청년부\n함께 기도해요", type: "root", icon: "✝️", color: "#FFF8E1" };
let members = [];
let isDataLoaded = false;

// [중요] 입장 버튼 표시 함수 (타임아웃용)
function showEnterButton() {
    isDataLoaded = true;
    const spinner = document.getElementById('intro-loading-spinner');
    const btn = document.getElementById('enter-btn');
    if(spinner) spinner.style.display = 'none';
    if(btn) btn.style.display = 'inline-block';
}

function loadData() {
    setTimeout(() => { if(!isDataLoaded) showEnterButton(); }, 5000);

    Promise.all([membersRef.once('value'), centerNodeRef.once('value')])
    .then(([mSnap, cSnap]) => {
        const mData = mSnap.val();
        const cData = cSnap.val();
        if (mData) members = Object.keys(mData).map(key => ({ firebaseKey: key, ...mData[key] }));
        if(cData && cData.icon) centerNode.icon = cData.icon;
        
        members.forEach(m => {
            if(!m.rotationDirection) m.rotationDirection = Math.random() < 0.5 ? 1 : -1;
            if(m.rotation === undefined) m.rotation = 0;
        });

        showEnterButton();
        updateGraph(); 

        let totalUnread = 0;
        members.forEach(m => {
            const total = getTotalPrayerCount(m);
            const read = readStatus[m.id] || 0;
            if (total > read) totalUnread += (total - read);
        });

        fetchWeather();
        setTimeout(() => { isFirstRender = false; }, 5000);
    })
    .catch(err => {
        console.log("Error:", err);
        showEnterButton();
        updateGraph(); 
    });
}
loadData();

membersRef.on('child_added', (snap) => {
    if(!isDataLoaded) return;
    const val = snap.val();
    if(!members.find(m => m.firebaseKey === snap.key)) {
        members.push({ ...val, firebaseKey: snap.key, rotation: 0, rotationDirection: 1 });
        if (!isFirstRender) newMemberIds.add(val.id);
        updateGraph();
    }
});
membersRef.on('child_changed', (snap) => {
    if(!isDataLoaded) return;
    const idx = members.findIndex(m => m.firebaseKey === snap.key);
    if(idx !== -1) {
        const old = members[idx];
        Object.assign(members[idx], { ...snap.val(), firebaseKey: snap.key, x: old.x, y: old.y, vx: old.vx, vy: old.vy, rotation: old.rotation, rotationDirection: old.rotationDirection });
        updateNodeVisuals(); 
        if(currentMemberData && currentMemberData.firebaseKey === snap.key) { currentMemberData = members[idx]; renderPrayers(); }
    }
});
membersRef.on('child_removed', (snap) => {
    const idx = members.findIndex(m => m.firebaseKey === snap.key);
    if(idx !== -1) { members.splice(idx, 1); updateGraph(); if(currentMemberData && currentMemberData.firebaseKey === snap.key) closePrayerPopup(); }
});

// D3
const width = window.innerWidth;
const height = window.innerHeight;
const svg = d3.select("#visualization").append("svg").attr("width", width).attr("height", height);
const defs = svg.append("defs");
const g = svg.append("g");
svg.call(d3.zoom().scaleExtent([0.1, 4]).on("zoom", (event) => { g.attr("transform", event.transform); }));
const linkGroup = g.append("g").attr("class", "links");
const nodeGroup = g.append("g").attr("class", "nodes");
const sizeScale = d3.scaleSqrt().domain([0, 15]).range([28, 60]).clamp(true);
simulation = d3.forceSimulation().force("link", d3.forceLink().id(d => d.id).distance(140)).force("charge", d3.forceManyBody().strength(-400)).force("center", d3.forceCenter(width / 2, height / 2)).force("collide", d3.forceCollide().radius(d => calculateRadius(d) + 30));
let link, node;

function updateGraph() {
    globalNodes = [centerNode, ...members];
    const links = members.map(m => ({ source: centerNode.id, target: m.id }));
    const patterns = defs.selectAll("pattern").data(members, d => d.id);
    patterns.enter().append("pattern").attr("id", d => "img-" + d.id).attr("width", 1).attr("height", 1).attr("patternContentUnits", "objectBoundingBox").append("image").attr("x", 0).attr("y", 0).attr("width", 1).attr("height", 1).attr("preserveAspectRatio", "xMidYMid slice").attr("xlink:href", d => d.photoUrl);
    patterns.select("image").attr("xlink:href", d => d.photoUrl);
    patterns.exit().remove();

    link = linkGroup.selectAll("line").data(links, d => d.target.id || d.target);
    link.exit().remove();
    const linkEnter = link.enter().append("line").attr("stroke", "#FFFFFF").attr("stroke-width", 0.8).style("opacity", 0).style("filter", "drop-shadow(0 0.5px 1px rgba(0,0,0,0.15))");
    linkEnter.transition().delay(800).duration(1500).style("opacity", 0.5);
    link = linkEnter.merge(link);

    node = nodeGroup.selectAll("g").data(globalNodes, d => d.id);
    node.exit().remove();
    const nodeEnter = node.enter().append("g").attr("cursor", "pointer").style("pointer-events", "all")
        .on("touchstart", function(event, d) { event.stopPropagation(); touchStartTime = Date.now(); touchStartX = event.touches[0].clientX; touchStartY = event.touches[0].clientY; isTouchMove = false; if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("touchmove", function(event, d) { if (event.touches.length > 0) { const dx = event.touches[0].clientX - touchStartX; const dy = event.touches[0].clientY - touchStartY; if (Math.sqrt(dx*dx + dy*dy) > 10) isTouchMove = true; d.fx = event.touches[0].clientX; d.fy = event.touches[0].clientY; } })
        .on("touchend", function(event, d) { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; if ((Date.now() - touchStartTime < 500) && !isTouchMove && d.type === 'member') { event.preventDefault(); openPrayerPopup(d); } })
        .on("click", function(event, d) { event.stopPropagation(); if (!isDragAction && d.type === 'member') openPrayerPopup(d); })
        .call(d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended));

    nodeEnter.append("circle").attr("stroke-width", 0).attr("r", 0).style("pointer-events", "all");
    nodeEnter.append("rect").attr("rx", 10).attr("ry", 10).attr("fill", "rgba(255, 255, 255, 0.7)").style("opacity", 0).style("pointer-events", "none");
    nodeEnter.append("text").attr("text-anchor", "middle").attr("dominant-baseline", "middle").attr("font-weight", "bold").style("pointer-events", "none").style("opacity", 0);
    const badge = nodeEnter.append("g").attr("class", "node-badge").style("opacity", 0).style("pointer-events", "none");
    badge.append("circle").attr("r", 9).attr("cx", 0).attr("cy", 0).attr("fill", "#FF5252").attr("stroke", "#fff").attr("stroke-width", 2);
    badge.append("text").attr("x", 0).attr("y", 0).attr("dy", "0.35em").attr("text-anchor", "middle").attr("fill", "white").style("font-size", "11px").style("font-weight", "bold");
    node = nodeEnter.merge(node); node.style("pointer-events", "all");
    updateNodeVisuals(); simulation.nodes(globalNodes); simulation.force("link").links(links); simulation.alpha(1).restart();
}

function updateNodeVisuals() {
    if(!node) return;
    node.each(function(d) {
        const el = d3.select(this);
        const r = calculateRadius(d);
        const circle = el.select("circle");
        const textDelay = isFirstRender ? (d.id === 'center' ? 0 : 800 + (globalNodes.indexOf(d) * 80)) : 0;
        
        if (circle.attr("r") == 0) { const dur = isFirstRender ? 800 : 500; circle.transition().delay(textDelay).duration(dur).ease(d3.easeElasticOut.amplitude(3)).attr("r", r); } 
        else { circle.transition().duration(500).attr("r", r); }

        const fillUrl = (d.photoUrl && d.type !== 'root') ? `url(#img-${d.id})` : (d.type === "root" ? "#FFF8E1" : d.color);
        let filterStr = (d.type === 'root') ? "drop-shadow(0 0 15px #FFD54F)" : (getTotalPrayerCount(d) > 0 ? `drop-shadow(0 0 ${Math.min(getTotalPrayerCount(d)*3, 30)}px rgba(255,87,34,${0.5+(getTotalPrayerCount(d)/20)}))` : "drop-shadow(0 2px 4px rgba(0,0,0,0.1))");
        circle.attr("fill", fillUrl).style("opacity", 1).style("filter", filterStr).style("-webkit-filter", filterStr).attr("stroke", d => (d.type !== 'root' && getTotalPrayerCount(d) > 0) ? "#FF7043" : "#fff").attr("stroke-width", d => (d.type !== 'root' && getTotalPrayerCount(d) > 0) ? 3 : 2);

        const textEl = el.select("text"); const rectEl = el.select("rect"); textEl.text(null);
        let textY = 0;
        if (d.type === 'root') {
            textEl.append("tspan").text(d.icon).attr("x", 0).attr("dy", "-1.2em").attr("font-size", "2.8rem");
            d.name.split("\n").forEach((l, i) => textEl.append("tspan").text(l).attr("x", 0).attr("dy", i===0?"4.0em":"1.3em").attr("font-size", "14px"));
            rectEl.style("display", "none"); textEl.transition().delay(textDelay).duration(800).style("opacity", 1);
        } else {
            if (d.photoUrl) textY = r + 15;
            textEl.attr("y", textY).text(d.name).attr("font-size", "12px");
            const bbox = textEl.node().getBBox(); const w = bbox.width > 0 ? bbox.width + 16 : d.name.length * 12 + 16;
            if (d.photoUrl) { rectEl.style("display", "block").attr("x", -w / 2).attr("y", textY - 10).attr("width", w).attr("height", 20).transition().delay(textDelay).duration(500).style("opacity", 1); } else { rectEl.style("display", "none"); }
            textEl.transition().delay(textDelay).duration(800).style("opacity", 1);
        }

        if (d.type !== 'root') {
            const unread = Math.max(0, getTotalPrayerCount(d) - (readStatus[d.id] || 0));
            const isNew = newMemberIds.has(d.id);
            const badge = el.select(".node-badge");
            const bx = r * 0.707 + 5, by = -(r * 0.707 + 5);
            if (unread > 0 || isNew) {
                badge.style("display", "block"); badge.select("circle").attr("fill", unread > 0 ? "#FF5252" : "#FF9800"); badge.select("text").text(unread > 0 ? unread : "N");
                badge.transition().delay(textDelay + 400).duration(200).attr("transform", `translate(${bx}, ${by})`).style("opacity", 1);
            } else { badge.style("opacity", 0); }
        }
    });
}

function calculateRadius(d) { return (d.type === 'root') ? 80 : sizeScale(getTotalPrayerCount(d)); }
function getTotalPrayerCount(d) { if (d.type === 'root') return 0; let t = d.prayers ? d.prayers.length : 0; if(d.prayers) d.prayers.forEach(p => {if(p.replies) t+=p.replies.length}); return t; }
function getRandomColor() { return brightColors[Math.floor(Math.random()*brightColors.length)]; }
function dragstarted(event) { isDragAction = false; dragStartX = event.x; dragStartY = event.y; if (!event.active) simulation.alphaTarget(0.3).restart(); event.subject.fx = event.subject.x; event.subject.fy = event.subject.y; }
function dragged(event) { const dx = event.x - dragStartX; const dy = event.y - dragStartY; if (dx*dx + dy*dy > 25) isDragAction = true; event.subject.fx = event.x; event.subject.fy = event.y; }
function dragended(event) { if (!event.active) simulation.alphaTarget(0); event.subject.fx = null; event.subject.fy = null; }
window.addEventListener("resize", () => { const w = window.innerWidth; const h = window.innerHeight; svg.attr("width", w).attr("height", h); simulation.force("center", d3.forceCenter(w/2, h/2)); simulation.alpha(0.5).restart(); resizeWeatherCanvas(); });

// UI Funcs
function toggleCampPopup() { document.getElementById('camp-popup').classList.toggle('active'); }
function toggleChatPopup() { 
    const el = document.getElementById('chat-popup'); el.classList.toggle('active'); 
    if(el.classList.contains('active')) {
        document.getElementById('chat-badge').classList.remove('active'); unreadChatKeys.clear(); setAppBadge(0);
        lastChatReadTime = Date.now(); localStorage.setItem('lastChatReadTime', lastChatReadTime); checkNotificationPermission();
        setTimeout(() => document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight, 100);
    }
}
function openPrayerPopup(data) {
    currentMemberData = data; newMemberIds.delete(data.id);
    readStatus[data.id] = getTotalPrayerCount(data); localStorage.setItem('prayerReadStatus', JSON.stringify(readStatus));
    updateNodeVisuals(); 
    document.getElementById("panel-name").innerText = data.name; document.getElementById("current-color-display").style.backgroundColor = data.color;
    document.getElementById("prayer-popup").classList.add('active'); 
    document.getElementById("prayer-list").innerHTML = `<div class="skeleton-card"><div class="skeleton sk-text-sm"></div><div class="skeleton sk-text"></div><div class="skeleton sk-text" style="width: 60%"></div><div class="skeleton sk-block"></div></div>`;
    requestAnimationFrame(() => { setTimeout(() => { renderPrayers(); }, 150); });
}
function closePrayerPopup() { document.getElementById("prayer-popup").classList.remove('active'); currentMemberData = null; }
function openColorModal() { const grid = document.getElementById('color-grid'); grid.innerHTML = ''; brightColors.forEach(c => { const swatch = document.createElement('div'); swatch.className = 'color-swatch'; swatch.style.backgroundColor = c; swatch.onclick = () => selectColor(c); grid.appendChild(swatch); }); document.getElementById('color-modal').classList.add('active'); }
function closeColorModal() { document.getElementById('color-modal').classList.remove('active'); }
function selectColor(color) { updateMemberColor(color); document.getElementById("current-color-display").style.backgroundColor = color; closeColorModal(); }
function toggleAdminMode() { if(isAdmin) { firebase.auth().signOut().then(() => alert("관리자 모드 해제")); } else openAdminModal(); }
function openAdminModal() { document.getElementById('admin-modal').classList.add('active'); document.getElementById('admin-pw').focus(); }
function closeAdminModal(e) { if(e.target.id === 'admin-modal') document.getElementById('admin-modal').classList.remove('active'); }
function checkAdmin() { firebase.auth().signInWithEmailAndPassword("admin@church.com", document.getElementById('admin-pw').value).then(() => { document.getElementById('admin-modal').classList.remove('active'); alert("관리자 모드 활성!"); document.getElementById('admin-pw').value=""; if(currentMemberData) renderPrayers(); }).catch(() => alert("비밀번호 오류")); }
function addNewMember() { const n = prompt("이름:"); if(n && n.trim()) { if(containsBannedWords(n)) return alert("부적절한 이름"); membersRef.push({id:`member_${Date.now()}`, name:n.trim(), type:"member", color:getRandomColor(), prayers:[], rotation:0, rotationDirection:1}); } }
function updateMemberColor(v) { if(currentMemberData) membersRef.child(currentMemberData.firebaseKey).update({color: v}); }
function deleteMember() { if(currentMemberData && confirm("삭제하시겠습니까?")) { membersRef.child(currentMemberData.firebaseKey).remove(); closePrayerPopup(); }}

// Profile
function editProfile() { if (!currentMemberData) return; document.getElementById('edit-profile-name').value = currentMemberData.name; document.getElementById('profile-view-mode').style.display = 'flex'; document.getElementById('profile-edit-mode').style.display = 'none'; document.getElementById('edit-profile-preview').src = currentMemberData.photoUrl || ""; document.getElementById('profile-edit-modal').classList.add('active'); if (cropper) { cropper.destroy(); cropper = null; } }
function closeProfileEditModal() { document.getElementById('profile-edit-modal').classList.remove('active'); if (cropper) { cropper.destroy(); cropper = null; } }
function handleProfileFileSelect(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = function(e) { document.getElementById('profile-view-mode').style.display = 'none'; document.getElementById('profile-edit-mode').style.display = 'flex'; const imgElement = document.getElementById('cropper-target-img'); imgElement.src = e.target.result; if (cropper) cropper.destroy(); setTimeout(() => { cropper = new Cropper(imgElement, { aspectRatio: 1, viewMode: 1, dragMode: 'move', autoCropArea: 0.8 }); }, 100); }; }
function saveProfileChanges() { if (!currentMemberData) return; const newName = document.getElementById('edit-profile-name').value.trim(); if (!newName) return alert("이름 입력"); if (containsBannedWords(newName)) return alert("부적절 이름"); let finalImageUrl = tempProfileImage; if (cropper) { finalImageUrl = cropper.getCroppedCanvas({width: 300, height: 300}).toDataURL('image/jpeg', 0.8); } else { finalImageUrl = currentMemberData.photoUrl || ""; } membersRef.child(currentMemberData.firebaseKey).update({ name: newName, photoUrl: finalImageUrl }).then(() => { document.getElementById("panel-name").innerText = newName; closeProfileEditModal(); }); }

// Render Prayers (접근성 라벨 추가됨)
function createSafeElement(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; }
function renderPrayers() {
    const list = document.getElementById("prayer-list"); list.innerHTML = "";
    if(!currentMemberData || !currentMemberData.prayers || currentMemberData.prayers.length === 0) { list.innerHTML = `<div style="text-align:center; padding: 40px 20px; color:#aaa;"><div style="font-size:3rem; margin-bottom:10px; opacity:0.5;">🙏</div><p>아직 기도제목이 없습니다.</p></div>`; return; }
    const displayList = currentMemberData.prayers.map((p, index) => ({ ...p, originalIndex: index }));
    displayList.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

    displayList.forEach((p) => {
        const i = p.originalIndex;
        const div = createSafeElement("div", "prayer-card"); if (p.isPinned) div.classList.add("pinned");
        const header = createSafeElement("div", "prayer-header");
        const dateDiv = createSafeElement("div", "prayer-date"); if(p.isPinned) dateDiv.innerHTML += `<span class="pinned-mark">📌</span>`; dateDiv.innerHTML += `<span>${p.date}</span>`; header.appendChild(dateDiv);
        const content = createSafeElement("div", "prayer-content", p.content);
        const actionGroup = createSafeElement("div", "action-group");
        const amens = p.amens ? Object.keys(p.amens).length : 0; const iAmened = p.amens && p.amens[mySessionId];

        // [접근성 수정] 삭제 버튼에 라벨 추가
        let delBtnHtml = `<button class="icon-btn delete-btn" onclick="deletePrayer(${i})" title="삭제" aria-label="삭제하기"><span class="material-symbols-rounded">delete_forever</span></button>`;
        if(isAdmin) delBtnHtml = `<button class="icon-btn admin-delete-btn-icon" style="color:white; background:#ef5350;" onclick="adminDeletePrayer(${i})" title="관리자 삭제" aria-label="관리자 권한 삭제"><span class="material-symbols-rounded">delete_forever</span></button>`;

        // [접근성 수정] 고정, 수정, 답글 버튼에 라벨 추가
        actionGroup.innerHTML = `
            <button class="amen-btn ${iAmened ? 'active' : ''}" onclick="toggleAmen(${i})" aria-label="아멘 하기"><span>🙏</span><span>아멘 ${amens > 0 ? amens : ''}</span></button>
            <button class="icon-btn pin-btn ${p.isPinned ? 'active' : ''}" onclick="togglePin(${i})" title="고정" aria-label="상단 고정"><span class="material-symbols-rounded">push_pin</span></button>
            <button class="icon-btn edit-btn" onclick="editPrayer(${i})" title="수정" aria-label="내용 수정"><span class="material-symbols-rounded">edit</span></button>
            <button class="icon-btn reply-btn" onclick="addReply(${i})" title="답글" aria-label="답글 달기"><span class="material-symbols-rounded">chat_bubble</span></button>
            ${delBtnHtml}
        `;
        div.appendChild(header); div.appendChild(content); div.appendChild(actionGroup);

        if (p.replies && p.replies.length > 0) {
            const replySection = createSafeElement("div", "reply-section");
            p.replies.forEach((r, rIndex) => { 
                const rItem = document.createElement("div"); rItem.className = "reply-item";
                rItem.innerHTML = `<span class="reply-icon">↳</span><span style="flex-grow:1; word-break:break-all;">${r.content}</span><button class="reply-delete-btn" onclick="deleteReply(${i}, ${rIndex})" aria-label="답글 삭제">&times;</button>`;
                replySection.appendChild(rItem); 
            });
            div.appendChild(replySection);
        }
        list.appendChild(div);
    });
}

function toggleAmen(i) { if (!currentMemberData) return; const ref = firebase.database().ref(`members/${currentMemberData.firebaseKey}/prayers/${i}/amens`); if (currentMemberData.prayers[i].amens && currentMemberData.prayers[i].amens[mySessionId]) ref.child(mySessionId).remove(); else { ref.child(mySessionId).set(true); if(navigator.vibrate) navigator.vibrate(50); } }
function togglePin(i) { if (!currentMemberData) return; currentMemberData.prayers[i].isPinned = !currentMemberData.prayers[i].isPinned; membersRef.child(currentMemberData.firebaseKey).update({ prayers: currentMemberData.prayers }).then(() => renderPrayers()); }
function deleteReply(pi, ri) { if(!confirm("답글 삭제?")) return; currentMemberData.prayers[pi].replies.splice(ri, 1); membersRef.child(currentMemberData.firebaseKey).update({ prayers: currentMemberData.prayers }).then(() => renderPrayers()); }
function deletePrayer(i) { if(confirm("삭제?")) { currentMemberData.prayers.splice(i, 1); const d = currentMemberData.prayers.length>0?currentMemberData.prayers:[]; membersRef.child(currentMemberData.firebaseKey).update({prayers: d}); closePrayerPopup(); } }
function adminDeletePrayer(i) { if(confirm("관리자 삭제?")) { currentMemberData.prayers.splice(i,1); const d = currentMemberData.prayers.length>0?currentMemberData.prayers:[]; membersRef.child(currentMemberData.firebaseKey).update({prayers: d}); closePrayerPopup(); } }
function addPrayer() { const v = document.getElementById("new-prayer").value.trim(); if(v) { if(containsBannedWords(v)) return alert("부적절"); const p = currentMemberData.prayers||[]; p.unshift({content:v, date:new Date().toISOString().split('T')[0]}); membersRef.child(currentMemberData.firebaseKey).update({prayers:p}); document.getElementById("new-prayer").value=""; } }
function editPrayer(i) { const v = prompt("수정:", currentMemberData.prayers[i].content); if(v) { if(containsBannedWords(v)) return alert("부적절"); currentMemberData.prayers[i].content = v; membersRef.child(currentMemberData.firebaseKey).update({prayers:currentMemberData.prayers}); } }
function addReply(i) { const v = prompt("답글:"); if(v) { if(containsBannedWords(v)) return alert("부적절"); if(!currentMemberData.prayers[i].replies) currentMemberData.prayers[i].replies=[]; currentMemberData.prayers[i].replies.push({content:v}); membersRef.child(currentMemberData.firebaseKey).update({prayers:currentMemberData.prayers}); } }

function sendChatMessage() { const t = document.getElementById("chat-msg").value; if(t) { messagesRef.push({name:"익명", text:t, senderId:mySessionId, timestamp: firebase.database.ServerValue.TIMESTAMP}); document.getElementById("chat-msg").value=""; }}
function deleteChatMessage(k) { if(confirm("관리자 삭제?")) messagesRef.child(k).remove(); }
messagesRef.limitToLast(50).on('child_added', snap => {
    const d = snap.val(); if (d.timestamp > lastChatReadTime && d.senderId !== mySessionId) { unreadChatKeys.add(snap.key); if (!document.getElementById('chat-popup').classList.contains('active')) { document.getElementById('chat-badge').classList.add('active'); setAppBadge(unreadChatKeys.size); } }
    const isMine = d.senderId === mySessionId;
    const div = document.createElement("div"); div.className = "chat-bubble-wrapper"; div.setAttribute('data-key', snap.key); div.style.alignItems=isMine?"flex-end":"flex-start";
    const del = `<span class="admin-delete-chat" onclick="deleteChatMessage('${snap.key}')"> [삭제]</span>`;
    div.innerHTML = `${isMine?'':`<span class="chat-sender">${d.name}</span>`}<div style="display:flex;align-items:center;gap:5px">${isMine?del:''}<div class="chat-bubble ${isMine?'mine':'others'}">${d.text}</div>${!isMine?del:''}</div>`;
    document.getElementById("chat-messages").appendChild(div);
    setTimeout(() => document.getElementById("chat-messages").scrollTop = document.getElementById("chat-messages").scrollHeight, 100);
});
messagesRef.on('child_removed', snap => { const el = document.querySelector(`.chat-bubble-wrapper[data-key="${snap.key}"]`); if(el) el.remove(); });

// Intro & BGM
let player; let isMusicPlaying = false;
const tag = document.createElement('script'); tag.src = "https://www.youtube.com/iframe_api"; document.getElementsByTagName('script')[0].parentNode.insertBefore(tag, document.getElementsByTagName('script')[0]);
function onYouTubeIframeAPIReady() { player = new YT.Player('youtube-player', { height: '0', width: '0', videoId: '0wcxl81QclQ', playerVars: { 'autoplay': 0, 'loop': 1, 'playlist': '0wcxl81QclQ', 'controls': 0, 'showinfo': 0, 'modestbranding': 1, 'playsinline': 1 }, events: { 'onStateChange': onPlayerStateChange } }); }
function enterApp() { if (player && typeof player.playVideo === 'function') player.playVideo(); document.getElementById('intro-screen').classList.add('fade-out'); setTimeout(() => { document.getElementById('intro-screen').style.display = 'none'; showWeatherToast("환영합니다", "배경음악이 재생됩니다 🎵"); }, 800); }
function onPlayerStateChange(e) { const btn = document.getElementById('music-btn'); const icon = document.getElementById('music-icon'); if (e.data === YT.PlayerState.PLAYING) { isMusicPlaying = true; if(btn) btn.classList.add('music-playing'); if(icon) icon.innerText = "music_note"; } else { isMusicPlaying = false; if(btn) btn.classList.remove('music-playing'); if(icon) icon.innerText = "music_off"; } }
function toggleMusic() { if (!player) return; if (isMusicPlaying) { player.pauseVideo(); showWeatherToast("음악", "배경음악 끔 🔇"); } else { player.playVideo(); showWeatherToast("음악", "배경음악 켬 🎵"); } }

// Weather & Animation
const apiKey = "39d8b0517ec448eb742a1ee5e39c2bf3"; 
async function fetchWeather() { if (navigator.geolocation) { navigator.geolocation.getCurrentPosition(async (pos) => { try { const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&appid=${apiKey}&units=metric`); const d = await res.json(); applyWeather(d, true); } catch(e) { useFallbackWeather(); } }, () => useFallbackWeather()); } else { useFallbackWeather(); } }
async function useFallbackWeather() { try { const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=38.0964&longitude=127.0748&current_weather=true"); const d = await res.json(); applyWeather({name:"연천군", main:{temp:d.current_weather.temperature}, weather:[{id:convertMeteoCode(d.current_weather.weathercode)}]}, false); } catch(e){} }
function convertMeteoCode(c) { if(c>=50&&c<=69)return 500; if(c>=70&&c<=79)return 600; return 800; }
function applyWeather(d, r) { const t = Math.round(d.main.temp); if(r) { const h = new Date().getHours(); centerNode.icon = (h>6&&h<18)?"☀️":"🌙"; } const c = d.weather[0].id; if(c>=200&&c<600) { createRain(); centerNode.icon="🌧️"; } else if(c>=600&&c<700) { createSnow(); centerNode.icon="❄️"; } else if(c>800) centerNode.icon="☁️"; updateNodeVisuals(); showWeatherToast(d.name, `${t}°C`); }
function showWeatherToast(l, i, duration = 3000) { 
    const t = document.getElementById('weather-toast'); 
    document.getElementById('weather-text').innerHTML = `📍 ${l}<br>${i}`; 
    t.classList.add('show'); 
    setTimeout(() => t.classList.remove('show'), duration); 
}
const wc = document.getElementById('weather-canvas'); const wctx = wc.getContext('2d'); let wParts = [];
function resizeWeatherCanvas() { wc.width = window.innerWidth; wc.height = window.innerHeight; }
function createRain() { wParts=[]; for(let i=0;i<35;i++) wParts.push({x:Math.random()*wc.width, y:Math.random()*wc.height, s:3+Math.random()*4, l:7+Math.random()*8}); }
function createSnow() { wParts=[]; for(let i=0;i<35;i++) wParts.push({x:Math.random()*wc.width, y:Math.random()*wc.height, s:1+Math.random()*2, r:2+Math.random()*3}); }
// [이스터에그] 하트 생성 함수
function createHearts() { wParts=[]; for(let i=0;i<30;i++) wParts.push({x:Math.random()*wc.width, y:Math.random()*wc.height, s:2+Math.random()*2}); }

function openLightbox(src) { document.getElementById('lightbox-img').src=src; document.getElementById('lightbox').classList.add('active'); }
function closeLightbox() { document.getElementById('lightbox').classList.remove('active'); }
let lastTime = 0; const fpsInterval = 1000/60;
function gameLoop(time) {
    requestAnimationFrame(gameLoop); const elapsed = time - lastTime; if (elapsed < fpsInterval) return; lastTime = time - (elapsed % fpsInterval);
    if(node) { members.forEach(m => { m.rotation = (m.rotation||0) + (m.rotationDirection*0.1); if(m.rotation>360) m.rotation-=360; else if(m.rotation<-360) m.rotation+=360; }); node.attr("transform", d => `translate(${d.x},${d.y}) rotate(${d.rotation||0})`); if(link) link.attr("x1", d=>d.source.x).attr("y1", d=>d.source.y).attr("x2", d=>d.target.x).attr("y2", d=>d.target.y); }
    if(wParts.length>0) { 
        wctx.clearRect(0,0,wc.width,wc.height); 
        if(isHeartRain) {
            wctx.fillStyle = "#FF4081"; wctx.font = "20px serif";
            wParts.forEach(p => { wctx.fillText("💖", p.x, p.y); p.y+=p.s; if(p.y>wc.height) p.y=-20; });
        } else {
            wctx.fillStyle="rgba(255,255,255,0.8)"; wctx.strokeStyle="rgba(174,194,224,0.8)"; wctx.lineWidth=1;
            wParts.forEach(p => { if(centerNode.icon==="🌧️") { wctx.beginPath(); wctx.moveTo(p.x,p.y); wctx.lineTo(p.x,p.y+p.l); wctx.stroke(); p.y+=p.s; if(p.y>wc.height) p.y=-p.l; } else { wctx.beginPath(); wctx.moveTo(p.x,p.y); wctx.arc(p.x,p.y,p.r,0,Math.PI*2); wctx.fill(); p.y+=p.s; if(p.y>wc.height) p.y=-5; } });
        }
    }
}
resizeWeatherCanvas(); requestAnimationFrame(gameLoop);
