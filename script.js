// ==========================================
// 연천장로교회 청년부 기도 네트워크
// (기능: UI 최적화 + 스켈레톤 + 푸시알림 + 핀 고정 + 답글 삭제)
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

// [PWA 설치 배너 로직]
let deferredPrompt;
const installBanner = document.getElementById('install-banner');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // 앱 접속 5초 후 설치 배너 노출
    setTimeout(() => {
        if(installBanner) installBanner.classList.add('show');
    }, 5000);
});

if(document.getElementById('btn-install-app')) {
    document.getElementById('btn-install-app').addEventListener('click', () => {
        if (installBanner) installBanner.classList.remove('show');
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((result) => {
                deferredPrompt = null;
            });
        }
    });
}

if(document.getElementById('btn-close-install')) {
    document.getElementById('btn-close-install').addEventListener('click', () => {
        if (installBanner) installBanner.classList.remove('show');
    });
}

// UI 핸들러 (플로팅 메뉴)
let isFabOpen = false;
function toggleFabMenu() {
    isFabOpen = !isFabOpen;
    const container = document.getElementById('menu-container');
    if(isFabOpen) container.classList.add('menu-open');
    else container.classList.remove('menu-open');
}
document.body.addEventListener('click', (e) => {
    if(isFabOpen && !e.target.closest('#menu-container')) { toggleFabMenu(); }
});

function forceRefresh() {
    if(confirm("화면을 강제로 새로고침 하시겠습니까?\n(캐시된 데이터를 모두 삭제합니다)")) {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
                for(let registration of registrations) registration.unregister();
            });
        }
        if ('caches' in window) {
            caches.keys().then(function(names) {
                for (let name of names) caches.delete(name);
                window.location.reload(true);
            });
        } else { window.location.reload(true); }
    }
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
const onlineRef = database.ref('.info/connected');
const presenceRef = database.ref('presence');
const messagesRef = database.ref('messages');

// ==========================================
// [푸시 알림 설정] VAPID 키 입력 필요
// ==========================================
const messaging = firebase.messaging();

// TODO: Firebase 콘솔 > 프로젝트 설정 > 클라우드 메시징 > 웹 구성 > "키 쌍 생성" 후 아래에 붙여넣기
const VAPID_KEY = "BPR31FIgOf9laREssQekHeXWL_8QsFg-LxvRmGUjBEBlsuTwTJxW8RN62QfB4Gk0rDaz9jXdByi8P0CuBA7ew0U"; 

async function requestPushPermission() {
    try {
        if (!VAPID_KEY || VAPID_KEY.includes("여기에")) {
            console.log("VAPID 키가 설정되지 않았습니다.");
            return;
        }
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('알림 권한 허용됨');
            const registration = await navigator.serviceWorker.ready;
            const token = await messaging.getToken({ 
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: registration 
            });

            if (token && currentMemberData) {
                console.log('FCM Token:', token);
                // 내 프로필에 토큰 저장
                membersRef.child(currentMemberData.firebaseKey).update({ fcmToken: token });
            }
        }
    } catch (err) {
        console.log('푸시 권한 요청 실패:', err);
    }
}

let mySessionId = localStorage.getItem('mySessionId');
if (!mySessionId) {
    mySessionId = 'user_' + Date.now();
    localStorage.setItem('mySessionId', mySessionId);
}

// 3. 변수 및 상태
let isAdmin = false;
let isFirstRender = true;
let readStatus = {}; 
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

// 마지막 채팅 읽은 시간
let lastChatReadTime = Number(localStorage.getItem('lastChatReadTime')) || Date.now();

// 로컬 알림 권한 요청 (앱 실행 시)
function checkNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "denied" && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
}
checkNotificationPermission();

function setAppBadge(count) {
    if ('setAppBadge' in navigator) {
        if (count > 0) navigator.setAppBadge(count).catch(e=>console.log(e));
        else navigator.clearAppBadge().catch(e=>console.log(e));
    }
}

async function getMyIp() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (e) { return '알수없음'; }
}

onlineRef.on('value', async (snapshot) => {
    if (snapshot.val()) { 
        const myIp = await getMyIp();
        const con = presenceRef.push();
        con.onDisconnect().remove();
        con.set({ ip: myIp, time: Date.now(), device: navigator.userAgent });
    }
});

presenceRef.on('value', (snapshot) => { 
    const count = snapshot.numChildren() || 0;
    document.getElementById('online-count').innerText = `${count}명 접속 중`;
    document.querySelector('.online-counter').onclick = showConnectedUsers;
});

function showConnectedUsers() {
    if (!isAdmin) return;
    presenceRef.once('value').then(snap => {
        const data = snap.val();
        const existing = document.getElementById('kick-modal');
        if(existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'kick-modal';
        modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:9999;display:flex;justify-content:center;align-items:center;animation:fadeIn 0.2s;";
        let content = `<div style="background:white;width:85%;max-width:350px;border-radius:15px;padding:20px;max-height:70vh;overflow-y:auto;box-shadow:0 10px 25px rgba(0,0,0,0.5);">`;
        content += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:2px solid #FFAB91;padding-bottom:10px;"><h3 style="margin:0;color:#5D4037;">👮 접속자 관리</h3><button onclick="document.getElementById('kick-modal').remove()" style="border:none;background:none;font-size:1.5rem;cursor:pointer;">&times;</button></div>`;
        if (!data) content += `<p style="text-align:center;color:#888;">현재 접속자가 없습니다.</p>`;
        else {
            Object.entries(data).forEach(([key, user]) => {
                let info = "정보 없음";
                if(user && user.ip) {
                    let device = "기타 기기";
                    if (user.device.includes("iPhone")) device = "아이폰";
                    else if (user.device.includes("Android")) device = "갤럭시/안드로이드";
                    else if (user.device.includes("Windows")) device = "윈도우 PC";
                    else if (user.device.includes("Mac")) device = "맥(Mac)";
                    const time = new Date(user.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    info = `<b>${device}</b><br><span style="font-size:0.8rem;color:#888;">${user.ip} / ${time}</span>`;
                }
                content += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px dashed #eee;"><div style="font-size:0.9rem;color:#333;line-height:1.4;">${info}</div><button onclick="kickUser('${key}')" style="background:#FF5252;color:white;border:none;padding:6px 12px;border-radius:20px;cursor:pointer;font-weight:bold;font-size:0.8rem;box-shadow:0 2px 5px rgba(0,0,0,0.2);">Kick 👢</button></div>`;
            });
        }
        content += `</div>`;
        modal.innerHTML = content;
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        document.body.appendChild(modal);
    });
}

function kickUser(key) {
    if(confirm("이 접속자를 강제로 내보내시겠습니까?")) {
        presenceRef.child(key).remove().then(() => {
            alert("성공적으로 퇴장시켰습니다.");
            document.getElementById('kick-modal').remove();
            setTimeout(showConnectedUsers, 500);
        });
    }
}

const bannedWords = ["욕설", "비속어", "시발", "씨발", "개새끼", "병신", "지랄", "존나", "졸라", "미친", "성매매", "섹스", "야동", "조건만남", "주식", "코인", "비트코인", "투자", "리딩방", "수익", "바보", "멍청이"];
function containsBannedWords(text) { return bannedWords.some(word => text.includes(word)); }

firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        isAdmin = true;
        document.getElementById('body').classList.add('admin-mode');
        document.getElementById('admin-trigger').classList.add('active');
    } else {
        isAdmin = false;
        document.getElementById('body').classList.remove('admin-mode');
        document.getElementById('admin-trigger').classList.remove('active');
    }
});

let centerNode = { id: "center", name: "연천장로교회\n청년부\n함께 기도해요", type: "root", icon: "✝️", color: "#FFF8E1" };
let members = [];
let isDataLoaded = false;

// 데이터 로딩 (3초 딜레이 제거됨)
function loadData() {
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

        isDataLoaded = true;
        document.getElementById('loading').classList.add('hide');
        updateGraph(); 
        fetchWeather();
        setTimeout(() => { isFirstRender = false; }, 5000);
    })
    .catch(err => {
        console.log("Firebase Load Error:", err);
        document.getElementById('loading').classList.add('hide'); 
        updateGraph(); 
    });
}
loadData();

membersRef.on('child_added', (snap) => {
    if(!isDataLoaded) return;
    const val = snap.val();
    if(!members.find(m => m.firebaseKey === snap.key)) {
        const newMember = { ...val, firebaseKey: snap.key, rotation: 0, rotationDirection: 1 };
        members.push(newMember);
        if (!isFirstRender) newMemberIds.add(newMember.id);
        updateGraph();
    }
});

membersRef.on('child_changed', (snap) => {
    if(!isDataLoaded) return;
    const val = snap.val();
    const idx = members.findIndex(m => m.firebaseKey === snap.key);
    if(idx !== -1) {
        const old = members[idx];
        Object.assign(members[idx], { 
            ...val, 
            firebaseKey: snap.key, 
            x: old.x, y: old.y, vx: old.vx, vy: old.vy, 
            rotation: old.rotation, 
            rotationDirection: old.rotationDirection 
        });
        updateNodeVisuals(); 
        if(currentMemberData && currentMemberData.firebaseKey === snap.key) {
            currentMemberData = members[idx];
            // 데이터 변경 시 기도카드 다시 렌더링
            renderPrayers();
        }
    }
});

membersRef.on('child_removed', (snap) => {
    if(!isDataLoaded) return;
    const idx = members.findIndex(m => m.firebaseKey === snap.key);
    if(idx !== -1) {
        members.splice(idx, 1);
        updateGraph();
        if(currentMemberData && currentMemberData.firebaseKey === snap.key) closePrayerPopup();
    }
});

// D3 시각화
const width = window.innerWidth;
const height = window.innerHeight;
const svg = d3.select("#visualization").append("svg").attr("width", width).attr("height", height);
const defs = svg.append("defs");
const g = svg.append("g");
svg.call(d3.zoom().scaleExtent([0.1, 4]).on("zoom", (event) => { g.attr("transform", event.transform); }));

const linkGroup = g.append("g").attr("class", "links");
const nodeGroup = g.append("g").attr("class", "nodes");
const sizeScale = d3.scaleSqrt().domain([0, 15]).range([28, 60]).clamp(true);

simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id(d => d.id).distance(140))
    .force("charge", d3.forceManyBody().strength(-400))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(d => calculateRadius(d) + 30));

let link, node;

function updateGraph() {
    globalNodes = [centerNode, ...members];
    const links = members.map(m => ({ source: centerNode.id, target: m.id }));

    const patterns = defs.selectAll("pattern").data(members, d => d.id);
    patterns.enter().append("pattern")
        .attr("id", d => "img-" + d.id).attr("width", 1).attr("height", 1).attr("patternContentUnits", "objectBoundingBox")
        .append("image").attr("x", 0).attr("y", 0).attr("width", 1).attr("height", 1).attr("preserveAspectRatio", "xMidYMid slice").attr("xlink:href", d => d.photoUrl);
    patterns.select("image").attr("xlink:href", d => d.photoUrl);
    patterns.exit().remove();

    link = linkGroup.selectAll("line").data(links, d => d.target.id || d.target);
    link.exit().remove();
    
    const linkEnter = link.enter().append("line")
        .attr("stroke", "#FFFFFF")
        .attr("stroke-width", 0.8)
        .style("opacity", 0)
        .style("filter", "drop-shadow(0 0.5px 1px rgba(0,0,0,0.15))");
    
    linkEnter.transition().delay(800).duration(1500).style("opacity", 0.5);
    link = linkEnter.merge(link);

    node = nodeGroup.selectAll("g").data(globalNodes, d => d.id);
    node.exit().remove();

    const nodeEnter = node.enter().append("g")
        .attr("cursor", "pointer")
        .style("pointer-events", "all")
        .on("touchstart", function(event, d) {
            event.stopPropagation();
            touchStartTime = Date.now();
            touchStartX = event.touches[0].clientX;
            touchStartY = event.touches[0].clientY;
            isTouchMove = false;
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
        })
        .on("touchmove", function(event, d) {
            if (event.touches.length > 0) {
                const dx = event.touches[0].clientX - touchStartX;
                const dy = event.touches[0].clientY - touchStartY;
                if (Math.sqrt(dx*dx + dy*dy) > 10) isTouchMove = true;
                d.fx = event.touches[0].clientX; 
                d.fy = event.touches[0].clientY;
            }
        })
        .on("touchend", function(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
            const duration = Date.now() - touchStartTime;
            if (duration < 500 && !isTouchMove && d.type === 'member') {
                event.preventDefault(); 
                openPrayerPopup(d);
            }
        })
        .on("click", function(event, d) {
            event.stopPropagation();
            if (!isDragAction && d.type === 'member') openPrayerPopup(d);
        })
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

    nodeEnter.append("circle").attr("stroke-width", 0).attr("r", 0)
        .style("pointer-events", "all")
        .style("will-change", "transform, filter")
        .style("-webkit-filter", d => {
            if (d.type === 'root') return "drop-shadow(0 0 15px #FFD54F)";
            return "drop-shadow(0 2px 4px rgba(0,0,0,0.1))";
        });

    nodeEnter.append("rect").attr("rx", 10).attr("ry", 10).attr("fill", "rgba(255, 255, 255, 0.7)").style("opacity", 0).style("pointer-events", "none");
    nodeEnter.append("text").attr("text-anchor", "middle").attr("dominant-baseline", "middle").attr("font-weight", "bold").style("pointer-events", "none").style("opacity", 0);
    const badge = nodeEnter.append("g").attr("class", "node-badge").style("opacity", 0).style("pointer-events", "none");
    badge.append("circle").attr("r", 9).attr("cx", 0).attr("cy", 0).attr("fill", "#FF5252").attr("stroke", "#fff").attr("stroke-width", 2);
    badge.append("text").attr("x", 0).attr("y", 0).attr("dy", "0.35em").attr("text-anchor", "middle").attr("fill", "white").style("font-size", "11px").style("font-weight", "bold");

    node = nodeEnter.merge(node);
    node.style("pointer-events", "all");

    updateNodeVisuals();
    simulation.nodes(globalNodes); simulation.force("link").links(links); simulation.alpha(1).restart();
}

function updateNodeVisuals() {
    if(!node) return;
    node.each(function(d) {
        const el = d3.select(this);
        const r = calculateRadius(d);
        const circle = el.select("circle");
        const textDelay = isFirstRender ? (d.id === 'center' ? 0 : 800 + (globalNodes.indexOf(d) * 80)) : 0;
        
        if (circle.attr("r") == 0) {
            const dur = isFirstRender ? 800 : 500;
            circle.transition().delay(textDelay).duration(dur).ease(d3.easeElasticOut.amplitude(3)).attr("r", r);
        } else {
            circle.transition().duration(500).attr("r", r);
        }

        const fillUrl = (d.photoUrl && d.type !== 'root') ? `url(#img-${d.id})` : (d.type === "root" ? "#FFF8E1" : d.color);
        let filterStr = "drop-shadow(0 2px 4px rgba(0,0,0,0.1))";
        if (d.type === 'root') filterStr = "drop-shadow(0 0 15px #FFD54F)";
        else {
            const count = getTotalPrayerCount(d);
            if (count > 0) filterStr = `drop-shadow(0 0 ${Math.min(count*3, 30)}px rgba(255,87,34,${0.5+(count/20)}))`;
        }

        circle.attr("fill", fillUrl)
                .style("opacity", 1) 
                .style("filter", filterStr)
                .style("-webkit-filter", filterStr)
                .attr("stroke", d => (d.type !== 'root' && getTotalPrayerCount(d) > 0) ? "#FF7043" : "#fff")
                .attr("stroke-width", d => (d.type !== 'root' && getTotalPrayerCount(d) > 0) ? 3 : 2);

        const textEl = el.select("text");
        const rectEl = el.select("rect");
        textEl.text(null);
        
        let textY = 0;
        if (d.type === 'root') {
            textEl.append("tspan").text(d.icon).attr("x", 0).attr("dy", "-1.2em").attr("font-size", "2.8rem");
            d.name.split("\n").forEach((l, i) => textEl.append("tspan").text(l).attr("x", 0).attr("dy", i===0?"4.0em":"1.3em").attr("font-size", "14px"));
            rectEl.style("display", "none");
            textEl.transition().delay(textDelay).duration(800).style("opacity", 1);
        } else {
            if (d.photoUrl) textY = r + 15;
            textEl.attr("y", textY).text(d.name).attr("font-size", "12px");
            const bbox = textEl.node().getBBox(); 
            const w = bbox.width > 0 ? bbox.width + 16 : d.name.length * 12 + 16;
            
            if (d.photoUrl) {
                rectEl.style("display", "block").attr("x", -w / 2).attr("y", textY - 10).attr("width", w).attr("height", 20).transition().delay(textDelay).duration(500).style("opacity", 1);
            } else { rectEl.style("display", "none"); }
            textEl.transition().delay(textDelay).duration(800).style("opacity", 1);
        }

        if (d.type !== 'root') {
            const total = getTotalPrayerCount(d);
            const read = readStatus[d.id] || 0;
            const unread = Math.max(0, total - read);
            const isNew = newMemberIds.has(d.id);
            const badge = el.select(".node-badge");
            const bx = r * 0.707 + 5, by = -(r * 0.707 + 5);
            
            if (unread > 0 || isNew) {
                badge.style("display", "block");
                badge.select("circle").attr("fill", unread > 0 ? "#FF5252" : "#FF9800");
                badge.select("text").text(unread > 0 ? unread : "N");
                badge.transition().delay(textDelay + 400).duration(200).attr("transform", `translate(${bx}, ${by})`).style("opacity", 1);
            } else { badge.style("opacity", 0); }
        }
    });
}

function calculateRadius(d) { if (d.type === 'root') return 80; return sizeScale(getTotalPrayerCount(d)); }
function getTotalPrayerCount(d) { if (d.type === 'root') return 0; let t = d.prayers ? d.prayers.length : 0; if(d.prayers) d.prayers.forEach(p => {if(p.replies) t+=p.replies.length}); return t; }
function getRandomColor() { return brightColors[Math.floor(Math.random()*brightColors.length)]; }
function dragstarted(event) { isDragAction = false; dragStartX = event.x; dragStartY = event.y; if (!event.active) simulation.alphaTarget(0.3).restart(); event.subject.fx = event.subject.x; event.subject.fy = event.subject.y; }
function dragged(event) { const dx = event.x - dragStartX; const dy = event.y - dragStartY; if (dx*dx + dy*dy > 25) isDragAction = true; event.subject.fx = event.x; event.subject.fy = event.y; }
function dragended(event) { if (!event.active) simulation.alphaTarget(0); event.subject.fx = null; event.subject.fy = null; }

window.addEventListener("resize", () => { const w = window.innerWidth; const h = window.innerHeight; svg.attr("width", w).attr("height", h); simulation.force("center", d3.forceCenter(w/2, h/2)); simulation.alpha(0.5).restart(); resizeWeatherCanvas(); });

// UI 핸들러
let currentMemberData = null;
function toggleCampPopup() { document.getElementById('camp-popup').classList.toggle('active'); }

function toggleChatPopup() { 
    const el = document.getElementById('chat-popup'); 
    el.classList.toggle('active'); 
    if(el.classList.contains('active')) {
        document.getElementById('chat-badge').classList.remove('active');
        unreadChatKeys.clear(); 
        setAppBadge(0);

        lastChatReadTime = Date.now();
        localStorage.setItem('lastChatReadTime', lastChatReadTime);
        
        checkNotificationPermission();

        setTimeout(() => document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight, 100);
    }
}

// [UI 최적화] 스켈레톤 로딩 + 아이콘 UI + 말풍선 댓글
function openPrayerPopup(data) {
    currentMemberData = data;
    newMemberIds.delete(data.id);
    readStatus[data.id] = getTotalPrayerCount(data); 
    updateNodeVisuals(); 
    
    document.getElementById("panel-name").innerText = data.name;
    document.getElementById("current-color-display").style.backgroundColor = data.color;
    document.getElementById("prayer-popup").classList.add('active'); 
    
    // 1. 스켈레톤 UI (로딩 효과) 표시
    const list = document.getElementById("prayer-list");
    list.innerHTML = `
        <div class="skeleton-card">
            <div class="skeleton sk-text-sm"></div>
            <div class="skeleton sk-text"></div>
            <div class="skeleton sk-text" style="width: 60%"></div>
            <div class="skeleton sk-block"></div>
        </div>
        <div class="skeleton-card">
            <div class="skeleton sk-text-sm"></div>
            <div class="skeleton sk-block"></div>
        </div>
    `;

    // 2. 푸시 권한 요청 시도 (프로필 열 때 자연스럽게)
    requestPushPermission();

    // 3. 실제 데이터 렌더링 (아주 짧은 딜레이 후 교체)
    requestAnimationFrame(() => {
        setTimeout(() => {
            renderPrayers();
        }, 150); 
    });
}

function closePrayerPopup() { document.getElementById("prayer-popup").classList.remove('active'); currentMemberData = null; }

function openColorModal() {
    const grid = document.getElementById('color-grid');
    grid.innerHTML = '';
    brightColors.forEach(c => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = c;
        swatch.onclick = () => selectColor(c);
        grid.appendChild(swatch);
    });
    document.getElementById('color-modal').classList.add('active');
}
function closeColorModal() { document.getElementById('color-modal').classList.remove('active'); }
function selectColor(color) { updateMemberColor(color); document.getElementById("current-color-display").style.backgroundColor = color; closeColorModal(); }
function toggleAdminMode() { if(isAdmin) { firebase.auth().signOut().then(() => alert("관리자 모드 해제")); } else openAdminModal(); }
function openAdminModal() { document.getElementById('admin-modal').classList.add('active'); document.getElementById('admin-pw').focus(); }
function closeAdminModal(e) { if(e.target.id === 'admin-modal') document.getElementById('admin-modal').classList.remove('active'); }

function checkAdmin() { 
    const inputPw = document.getElementById('admin-pw').value;
    const adminEmail = "admin@church.com"; 
    firebase.auth().signInWithEmailAndPassword(adminEmail, inputPw)
    .then(() => {
        document.getElementById('admin-modal').classList.remove('active');
        alert("관리자 모드 활성! 환영합니다.");
        document.getElementById('admin-pw').value=""; 
        if(currentMemberData) renderPrayers();
    })
    .catch((error) => { alert("비밀번호가 틀렸습니다."); console.error(error); });
}

function addNewMember() { const n = prompt("이름:"); if(n && n.trim()) { if(containsBannedWords(n)) return alert("부적절한 이름"); membersRef.push({id:`member_${Date.now()}`, name:n.trim(), type:"member", color:getRandomColor(), prayers:[], rotation:0, rotationDirection:1}); } }
function updateMemberColor(v) { if(currentMemberData) membersRef.child(currentMemberData.firebaseKey).update({color: v}); }
function deleteMember() { if(currentMemberData && confirm("삭제하시겠습니까?")) { membersRef.child(currentMemberData.firebaseKey).remove(); closePrayerPopup(); }}

let tempProfileImage = "";
function editProfile() {
    if (!currentMemberData) return;
    document.getElementById('edit-profile-name').value = currentMemberData.name;
    const currentImg = currentMemberData.photoUrl || "https://via.placeholder.com/150?text=No+Image";
    document.getElementById('edit-profile-preview').src = currentImg;
    tempProfileImage = currentMemberData.photoUrl || "";
    document.getElementById('profile-edit-modal').classList.add('active');
}
function closeProfileEditModal() { document.getElementById('profile-edit-modal').classList.remove('active'); }
function handleProfileFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function(e) {
        const img = new Image();
        img.src = e.target.result;
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const Size = 300; 
            canvas.width = Size; canvas.height = Size;
            let sx, sy, sWidth, sHeight;
            if (img.width > img.height) { sHeight = img.height; sWidth = img.height; sx = (img.width - img.height) / 2; sy = 0; }
            else { sWidth = img.width; sHeight = img.width; sx = 0; sy = (img.height - img.width) / 2; }
            ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, Size, Size);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            document.getElementById('edit-profile-preview').src = dataUrl;
            tempProfileImage = dataUrl;
        };
    };
}
function saveProfileChanges() {
    if (!currentMemberData) return;
    const newName = document.getElementById('edit-profile-name').value.trim();
    if (!newName) return alert("이름을 입력해주세요.");
    if (containsBannedWords(newName)) return alert("부적절한 이름입니다.");
    const updates = { name: newName, photoUrl: tempProfileImage };
    membersRef.child(currentMemberData.firebaseKey).update(updates).then(() => {
        document.getElementById("panel-name").innerText = newName;
        closeProfileEditModal();
    });
}

function createSafeElement(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; }

// ==========================================
// [UI 최적화 핵심] 아이콘 버튼 + 카드 UI + 말풍선 댓글 + 댓글 삭제
// ==========================================
function renderPrayers() {
    const list = document.getElementById("prayer-list"); 
    list.innerHTML = "";
    
    if(!currentMemberData || !currentMemberData.prayers || currentMemberData.prayers.length === 0) { 
        list.innerHTML = `
            <div style="text-align:center; padding: 40px 20px; color:#aaa;">
                <div style="font-size:3rem; margin-bottom:10px; opacity:0.5;">🙏</div>
                <p>아직 기도제목이 없습니다.<br>가장 먼저 기도를 나눠주세요!</p>
            </div>`; 
        return; 
    }

    // 1. 정렬: 고정된 글(isPinned) 상단 배치
    const displayList = currentMemberData.prayers.map((p, index) => ({ ...p, originalIndex: index }));
    displayList.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

    // 2. 카드 렌더링
    displayList.forEach((p) => {
        const i = p.originalIndex;
        const div = createSafeElement("div", "prayer-card");
        if (p.isPinned) div.classList.add("pinned");

        // (1) 헤더 영역
        const header = createSafeElement("div", "prayer-header");
        const dateDiv = createSafeElement("div", "prayer-date");
        if(p.isPinned) dateDiv.innerHTML += `<span class="pinned-mark">📌</span>`;
        dateDiv.innerHTML += `<span>${p.date}</span>`;
        header.appendChild(dateDiv);
        
        // (2) 본문 영역
        const content = createSafeElement("div", "prayer-content", p.content);
        
        // (3) 액션 버튼 (SVG 아이콘)
        const actionGroup = createSafeElement("div", "action-group");
        
        const icons = {
            pin: '<svg viewBox="0 0 24 24"><path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/></svg>',
            edit: '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
            trash: '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
            reply: '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>'
        };

        let delBtnHtml = `<button class="icon-btn" onclick="deletePrayer(${i})" title="삭제">${icons.trash}</button>`;
        if(isAdmin) delBtnHtml = `<button class="icon-btn" style="color:#ef5350;" onclick="adminDeletePrayer(${i})" title="관리자 삭제">${icons.trash}</button>`;

        actionGroup.innerHTML = `
            <button class="icon-btn ${p.isPinned ? 'active' : ''}" onclick="togglePin(${i})" title="고정">${icons.pin}</button>
            <button class="icon-btn" onclick="editPrayer(${i})" title="수정">${icons.edit}</button>
            <button class="icon-btn" onclick="addReply(${i})" title="답글">${icons.reply}</button>
            ${delBtnHtml}
        `;

        div.appendChild(header);
        div.appendChild(content);
        div.appendChild(actionGroup);

        // (4) 댓글(답글) 영역 - 말풍선 + 삭제 버튼
        if (p.replies && p.replies.length > 0) {
            const replySection = createSafeElement("div", "reply-section");
            p.replies.forEach((r, rIndex) => { 
                const rItem = document.createElement("div");
                rItem.className = "reply-item";
                rItem.innerHTML = `
                    <span class="reply-icon">↳</span> 
                    <span style="flex-grow:1; word-break:break-all;">${r.content}</span>
                    <button class="reply-delete-btn" onclick="deleteReply(${i}, ${rIndex})">&times;</button>
                `;
                replySection.appendChild(rItem); 
            });
            div.appendChild(replySection);
        }

        list.appendChild(div);
    });
}

function togglePin(index) {
    if (!currentMemberData) return;
    const currentState = currentMemberData.prayers[index].isPinned || false;
    currentMemberData.prayers[index].isPinned = !currentState;

    membersRef.child(currentMemberData.firebaseKey).update({
        prayers: currentMemberData.prayers
    }).then(() => {
        renderPrayers();
    });
}

// [답글 삭제 함수]
function deleteReply(prayerIndex, replyIndex) {
    if(!confirm("이 답글을 삭제하시겠습니까?")) return;

    if (currentMemberData.prayers[prayerIndex].replies) {
        currentMemberData.prayers[prayerIndex].replies.splice(replyIndex, 1);
        membersRef.child(currentMemberData.firebaseKey).update({
            prayers: currentMemberData.prayers
        }).then(() => {
            renderPrayers();
        });
    }
}

function deletePrayer(i) { if(confirm("정말 삭제하시겠습니까?")) { currentMemberData.prayers.splice(i, 1); renderPrayers(); const updateData = currentMemberData.prayers.length > 0 ? currentMemberData.prayers : []; membersRef.child(currentMemberData.firebaseKey).update({prayers: updateData}); } }
function adminDeletePrayer(i) { if(confirm("관리자 권한으로 삭제하시겠습니까?")) { currentMemberData.prayers.splice(i,1); renderPrayers(); const updateData = currentMemberData.prayers.length > 0 ? currentMemberData.prayers : []; membersRef.child(currentMemberData.firebaseKey).update({prayers: updateData}); } }
function addPrayer() { const v = document.getElementById("new-prayer").value.trim(); if(v) { if(containsBannedWords(v)) return alert("부적절한 내용"); const p = currentMemberData.prayers||[]; p.unshift({content:v, date:new Date().toISOString().split('T')[0]}); membersRef.child(currentMemberData.firebaseKey).update({prayers:p}); document.getElementById("new-prayer").value=""; } }
function editPrayer(i) { const v = prompt("수정:", currentMemberData.prayers[i].content); if(v) { if(containsBannedWords(v)) return alert("부적절한 내용"); currentMemberData.prayers[i].content = v; membersRef.child(currentMemberData.firebaseKey).update({prayers:currentMemberData.prayers}); } }
function addReply(i) { const v = prompt("답글:"); if(v) { if(containsBannedWords(v)) return alert("부적절한 내용"); if(!currentMemberData.prayers[i].replies) currentMemberData.prayers[i].replies=[]; currentMemberData.prayers[i].replies.push({content:v}); membersRef.child(currentMemberData.firebaseKey).update({prayers:currentMemberData.prayers}); } }

function sendChatMessage() { const t = document.getElementById("chat-msg").value; if(t) { messagesRef.push({name:"익명", text:t, senderId:mySessionId, timestamp: firebase.database.ServerValue.TIMESTAMP}); document.getElementById("chat-msg").value=""; }}
function deleteChatMessage(k) { if(confirm("관리자 삭제?")) messagesRef.child(k).remove(); }

// ==========================================
// [수정됨] script.js 하단 채팅 수신 및 알림 로직
// ==========================================
messagesRef.limitToLast(50).on('child_added', snap => {
    const d = snap.val();
    
    // 메시지가 내가 보낸 게 아니고, 접속 이후에 온 것이라면
    if (d.timestamp > lastChatReadTime && d.senderId !== mySessionId) {
        unreadChatKeys.add(snap.key);
        const popup = document.getElementById('chat-popup');
        
        // 팝업이 닫혀있을 때만 알림
        if (!popup.classList.contains('active')) {
            // 1. 내부 빨간 점 배지
            document.getElementById('chat-badge').classList.add('active'); 
            // 2. 앱 아이콘 숫자 배지
            setAppBadge(unreadChatKeys.size); 
            
            // 3. [핵심 수정] 서비스 워커 알림 요청 (고유 태그 사용)
            if (document.hidden && Notification.permission === "granted" && 'serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(function(registration) {
                    registration.showNotification("새로운 기도/채팅 메시지", {
                        body: d.text,
                        icon: 'icon-192.png',
                        // [중요] 태그에 메시지 고유 키(snap.key)를 붙여서 매번 다른 알림으로 인식시킴
                        tag: 'msg-' + snap.key, 
                        vibrate: [200, 100, 200]
                    });
                });
            }
        }
    }

    const isMine = d.senderId === mySessionId;
    const div = document.createElement("div"); div.className = "chat-bubble-wrapper"; div.setAttribute('data-key', snap.key);
    div.style.display="flex"; div.style.flexDirection="column"; div.style.alignItems=isMine?"flex-end":"flex-start";
    const del = `<span class="admin-delete-chat" onclick="deleteChatMessage('${snap.key}')"> [삭제]</span>`;
    div.innerHTML = `${isMine?'':`<span class="chat-sender">${d.name}</span>`}<div style="display:flex;align-items:center;gap:5px">${isMine?del:''}<div class="chat-bubble ${isMine?'mine':'others'}">${d.text}</div>${!isMine?del:''}</div>`;
    document.getElementById("chat-messages").appendChild(div);
    setTimeout(() => document.getElementById("chat-messages").scrollTop = document.getElementById("chat-messages").scrollHeight, 100);
});

messagesRef.on('child_removed', snap => { 
    const el = document.querySelector(`.chat-bubble-wrapper[data-key="${snap.key}"]`); 
    if(el) el.remove(); 
    if(unreadChatKeys.has(snap.key)) { unreadChatKeys.delete(snap.key); if(unreadChatKeys.size === 0) { document.getElementById('chat-badge').classList.remove('active'); setAppBadge(0); } }
});

const apiKey = "39d8b0517ec448eb742a1ee5e39c2bf3"; 
async function fetchWeather() { if (navigator.geolocation) { navigator.geolocation.getCurrentPosition(async (position) => { try { const lat = position.coords.latitude; const lon = position.coords.longitude; const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`); const d = await res.json(); applyWeather(d, true); } catch(e) { useFallbackWeather(); } }, (err) => { useFallbackWeather(); }); } else { useFallbackWeather(); } }
async function useFallbackWeather() { try { const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=38.0964&longitude=127.0748&current_weather=true"); const d = await res.json(); const simulatedData = { name: "연천군 (기본)", main: { temp: d.current_weather.temperature }, weather: [{ id: convertMeteoCode(d.current_weather.weathercode) }], sys: { sunrise: 0, sunset: 0 }, dt: Date.now() / 1000 }; const hour = new Date().getHours(); const isDay = hour > 6 && hour < 18; centerNode.icon = isDay ? "☀️" : "🌙"; applyWeather(simulatedData, false); } catch(e){ showWeatherToast("날씨 정보 없음", ""); } }
function convertMeteoCode(code) { if (code >= 50 && code <= 69) return 500; if (code >= 70 && code <= 79) return 600; return 800; }
function applyWeather(d, isReal) { const temp = Math.round(d.main.temp); const location = d.name || "연천군"; let statusText = "맑음"; if (isReal) { const isDay = d.dt > d.sys.sunrise && d.dt < d.sys.sunset; centerNode.icon = isDay ? "☀️" : "🌙"; } const code = d.weather[0].id; if (code >= 200 && code < 600) { createRain(); centerNode.icon = "🌧️"; statusText = "비"; } else if (code >= 600 && code < 700) { createSnow(); centerNode.icon = "❄️"; statusText = "눈"; } else if (code > 800) { statusText = "흐림"; centerNode.icon = "☁️"; } updateNodeVisuals(); showWeatherToast(location, `${statusText}, ${temp}°C`); }
function showWeatherToast(loc, info) { const toast = document.getElementById('weather-toast'); const text = document.getElementById('weather-text'); text.innerHTML = `📍 ${loc}<br>${info}`; toast.classList.add('show'); setTimeout(() => { toast.classList.remove('show'); }, 3000); }
const wc = document.getElementById('weather-canvas'); const wctx = wc.getContext('2d'); let wParts = [];
function resizeWeatherCanvas() { wc.width = window.innerWidth; wc.height = window.innerHeight; }
function createRain() { wParts=[]; for(let i=0;i<35;i++) { wParts.push({ x: Math.random()*wc.width, y: Math.random()*wc.height, s: 3+Math.random()*4, l: 7+Math.random()*8 }); } }
function createSnow() { wParts=[]; for(let i=0;i<35;i++) { wParts.push({ x: Math.random()*wc.width, y: Math.random()*wc.height, s: 1+Math.random()*2, r: 2+Math.random()*3 }); } }
function openLightbox(src) { document.getElementById('lightbox-img').src=src; document.getElementById('lightbox').classList.add('active'); }
function closeLightbox() { document.getElementById('lightbox').classList.remove('active'); }

let lastTime = 0; const fpsInterval = 1000 / 60; 
function gameLoop(timestamp) {
    requestAnimationFrame(gameLoop);
    const elapsed = timestamp - lastTime;
    if (elapsed < fpsInterval) return;
    lastTime = timestamp - (elapsed % fpsInterval);
    if(node) {
        members.forEach(m => { m.rotation = (m.rotation || 0) + (m.rotationDirection * 0.1); if(m.rotation > 360) m.rotation -= 360; else if(m.rotation < -360) m.rotation += 360; });
        node.attr("transform", d => `translate(${d.x},${d.y}) rotate(${d.rotation || 0})`);
        if(link) { link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y); }
    }
    if (wParts.length > 0) {
        wctx.clearRect(0,0,wc.width,wc.height); wctx.fillStyle = "rgba(255,255,255,0.8)"; wctx.strokeStyle = "rgba(174,194,224,0.8)"; wctx.lineWidth=1;
        wParts.forEach(p => { if(centerNode.icon === "🌧️") { wctx.beginPath(); wctx.moveTo(p.x,p.y); wctx.lineTo(p.x,p.y+p.l); wctx.stroke(); p.y+=p.s; if(p.y>wc.height) p.y=-p.l; } else { wctx.beginPath(); wctx.moveTo(p.x,p.y); wctx.arc(p.x,p.y,p.r,0,Math.PI*2); wctx.fill(); p.y+=p.s; if(p.y>wc.height) p.y=-5; } });
    }
}
resizeWeatherCanvas();
requestAnimationFrame(gameLoop);



