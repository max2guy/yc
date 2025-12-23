// ==========================================
// 연천장로교회 청년부 기도 네트워크 (Final)
// ==========================================

// 1. 기본 설정 및 서비스 워커 (앱 설치 지원)
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

// UI 핸들러: 메뉴 및 팝업 닫기
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

// 사용자 세션 관리
let mySessionId = localStorage.getItem('mySessionId');
if (!mySessionId) {
    mySessionId = 'user_' + Date.now();
    localStorage.setItem('mySessionId', mySessionId);
}

// 3. 변수 및 상태 관리
let isAdmin = false;
let isFirstRender = true;
let readStatus = {}; 
let newMemberIds = new Set();
let globalNodes = [];
let simulation = null;
const loadTime = Date.now();
let unreadChatKeys = new Set();
let touchStartTime = 0;
let touchStartX = 0;
let touchStartY = 0;
let isTouchMove = false;
let dragStartX = 0;
let dragStartY = 0;
let isDragAction = false;
const brightColors = ["#FFCDD2", "#F8BBD0", "#E1BEE7", "#D1C4E9", "#C5CAE9", "#BBDEFB", "#B3E5FC", "#B2EBF2", "#B2DFDB", "#C8E6C9", "#DCEDC8", "#F0F4C3", "#FFF9C4", "#FFECB3", "#FFE0B2", "#FFCCBC", "#D7CCC8", "#F5F5F5", "#CFD8DC"];

// 4. Firebase 리스너 (접속자 수 등)
onlineRef.on('value', (snapshot) => {
    if (snapshot.val()) { 
        const con = presenceRef.push();
        con.onDisconnect().remove();
        con.set(true);
    }
});
presenceRef.on('value', (snapshot) => { 
    const count = snapshot.numChildren() || 0;
    document.getElementById('online-count').innerText = `${count}명 접속 중`;
});

const bannedWords = ["욕설", "비속어", "시발", "씨발", "개새끼", "병신", "지랄", "존나", "졸라", "미친", "성매매", "섹스", "야동", "조건만남", "주식", "코인", "비트코인", "투자", "리딩방", "수익", "바보", "멍청이"];
function containsBannedWords(text) { return bannedWords.some(word => text.includes(word)); }

// 관리자 인증 상태 감지
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

// 데이터 로드
let centerNode = { id: "center", name: "연천장로교회\n청년부\n함께 기도해요", type: "root", icon: "✝️", color: "#FFF8E1" };
let members = [];
let isDataLoaded = false;

function loadData() {
    setTimeout(() => {
        document.getElementById('loading').classList.add('hide');
        if (!isDataLoaded) { updateGraph(); fetchWeather(); }
    }, 3000);

    Promise.all([membersRef.once('value'), centerNodeRef.once('value')])
    .then(([mSnap, cSnap]) => {
        const mData = mSnap.val();
        const cData = cSnap.val();
        
        if (mData) {
            members = Object.keys(mData).map(key => ({ firebaseKey: key, ...mData[key] }));
        }

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

// 실시간 데이터 동기화
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

// 5. D3 시각화 (업데이트된 디자인 적용)
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

// ★ 그래프 업데이트 함수 (선 디자인 및 타이밍 수정됨) ★
function updateGraph() {
    globalNodes = [centerNode, ...members];
    const links = members.map(m => ({ source: centerNode.id, target: m.id }));

    // 1. 패턴(이미지) 업데이트
    const patterns = defs.selectAll("pattern").data(members, d => d.id);
    patterns.enter().append("pattern")
        .attr("id", d => "img-" + d.id).attr("width", 1).attr("height", 1).attr("patternContentUnits", "objectBoundingBox")
        .append("image").attr("x", 0).attr("y", 0).attr("width", 1).attr("height", 1).attr("preserveAspectRatio", "xMidYMid slice").attr("xlink:href", d => d.photoUrl);
    patterns.select("image").attr("xlink:href", d => d.photoUrl);
    patterns.exit().remove();

    // 2. 선(Link) 업데이트
    link = linkGroup.selectAll("line").data(links, d => d.target.id || d.target);
    link.exit().remove();
    
    // [디자인 수정] 1.5px 두께, 은은한 흰색, 지연 효과
    const linkEnter = link.enter().append("line")
        .attr("stroke", "#FFFFFF")      // 흰색 빛
        .attr("stroke-width", 1.5)      // 얇고 세련되게
        .style("opacity", 0)            // 처음엔 투명하게 시작
        .style("filter", "drop-shadow(0 1px 2px rgba(0,0,0,0.2))");
    
    // [애니메이션] 얼굴이 다 나온 뒤에 스르륵 나타남
    linkEnter.transition()
        .delay(800)                     
        .duration(1500)                 
        .style("opacity", 0.6);         // 60% 밝기로 은은하게
    
    link = linkEnter.merge(link);

    // 3. 노드(얼굴) 업데이트
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
                const delay = textDelay;
                const dur = isFirstRender ? 800 : 500;
                circle.transition().delay(delay).duration(dur).ease(d3.easeElasticOut.amplitude(3)).attr("r", r);
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
                rectEl.style("display", "block")
                    .attr("x", -w / 2).attr("y", textY - 10).attr("width", w).attr("height", 20)
                    .transition().delay(textDelay).duration(500).style("opacity", 1);
            } else {
                rectEl.style("display", "none");
            }
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
            } else {
                badge.style("opacity", 0);
            }
        }
    });
}

function calculateRadius(d) { if (d.type === 'root') return 80; return sizeScale(getTotalPrayerCount(d)); }
function getTotalPrayerCount(d) { if (d.type === 'root') return 0; let t = d.prayers ? d.prayers.length : 0; if(d.prayers) d.prayers.forEach(p => {if(p.replies) t+=p.replies.length}); return t; }
function getRandomColor() { return brightColors[Math.floor(Math.random()*brightColors.length)]; }

function dragstarted(event) { 
    isDragAction = false;
    dragStartX = event.x; dragStartY = event.y;
    if (!event.active) simulation.alphaTarget(0.3).restart(); 
    event.subject.fx = event.subject.x; event.subject.fy = event.subject.y; 
}
function dragged(event) { 
    const dx = event.x - dragStartX; const dy = event.y - dragStartY;
    if (dx*dx + dy*dy > 25) isDragAction = true;
    event.subject.fx = event.x; event.subject.fy = event.y; 
}
function dragended(event) { 
    if (!event.active) simulation.alphaTarget(0); 
    event.subject.fx = null; event.subject.fy = null; 
}

window.addEventListener("resize", () => { const w = window.innerWidth; const h = window.innerHeight; svg.attr("width", w).attr("height", h); simulation.force("center", d3.forceCenter(w/2, h/2)); simulation.alpha(0.5).restart(); resizeWeatherCanvas(); });

// 6. UI 및 기능 핸들러
let currentMemberData = null;
function toggleCampPopup() { document.getElementById('camp-popup').classList.toggle('active'); }

function toggleChatPopup() { 
    const el = document.getElementById('chat-popup'); 
    el.classList.toggle('active'); 
    if(el.classList.contains('active')) {
        document.getElementById('chat-badge').classList.remove('active');
        unreadChatKeys.clear(); 
        setTimeout(() => document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight, 100);
    }
}

function openPrayerPopup(data) {
    currentMemberData = data;
    newMemberIds.delete(data.id);
    readStatus[data.id] = getTotalPrayerCount(data); 
    updateNodeVisuals(); 
    document.getElementById("panel-name").innerText = data.name;
    document.getElementById("current-color-display").style.backgroundColor = data.color;
    document.getElementById("prayer-popup").classList.add('active'); 
    renderPrayers();
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
function selectColor(color) {
    updateMemberColor(color);
    document.getElementById("current-color-display").style.backgroundColor = color;
    closeColorModal();
}

// 관리자 인증 (Firebase Auth 사용)
function toggleAdminMode() { 
    if(isAdmin) { 
        firebase.auth().signOut().then(() => {
            alert("관리자 모드 해제");
        });
    } else openAdminModal(); 
}
function openAdminModal() { document.getElementById('admin-modal').classList.add('active'); document.getElementById('admin-pw').focus(); }
function closeAdminModal(e) { if(e.target.id === 'admin-modal') document.getElementById('admin-modal').classList.remove('active'); }

function checkAdmin() { 
    const inputPw = document.getElementById('admin-pw').value;
    const adminEmail = "admin@church.com"; // Firebase에 등록된 이메일
    
    firebase.auth().signInWithEmailAndPassword(adminEmail, inputPw)
    .then(() => {
        document.getElementById('admin-modal').classList.remove('active');
        alert("관리자 모드 활성! 환영합니다.");
        document.getElementById('admin-pw').value=""; 
        if(currentMemberData) renderPrayers();
    })
    .catch((error) => {
        alert("비밀번호가 틀렸습니다.");
        console.error(error);
    });
}

function addNewMember() { const n = prompt("이름:"); if(n && n.trim()) { if(containsBannedWords(n)) return alert("부적절한 이름"); membersRef.push({id:`member_${Date.now()}`, name:n.trim(), type:"member", color:getRandomColor(), prayers:[], rotation:0, rotationDirection:1}); } }
function updateMemberColor(v) { if(currentMemberData) membersRef.child(currentMemberData.firebaseKey).update({color: v}); }
function deleteMember() { if(currentMemberData && confirm("삭제하시겠습니까?")) { membersRef.child(currentMemberData.firebaseKey).remove(); closePrayerPopup(); }}
function editProfile() { 
    if (!currentMemberData) return;
    const newName = prompt("이름 수정:", currentMemberData.name);
    if (newName !== null) {
        const newPhoto = prompt("프로필 사진 URL (비워두면 기본):", currentMemberData.photoUrl || "");
        if (containsBannedWords(newName)) return alert("부적절한 단어");
        const updates = { name: newName.trim() };
        if (newPhoto !== null) updates.photoUrl = newPhoto.trim();
        membersRef.child(currentMemberData.firebaseKey).update(updates);
        document.getElementById("panel-name").innerText = newName.trim();
    }
}

// 헬퍼 함수
function createSafeElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
}

function renderPrayers() {
    const list = document.getElementById("prayer-list"); 
    list.innerHTML = "";
    
    if(!currentMemberData || !currentMemberData.prayers) { 
        list.innerHTML = "<p style='text-align:center; margin-top:20px;'>기도제목을 나눠주세요!</p>"; 
        return; 
    }

    currentMemberData.prayers.forEach((p, i) => {
        const div = createSafeElement("div", "prayer-card");
        const header = createSafeElement("div", "prayer-header");
        const dateSpan = createSafeElement("span", "", p.date);
        header.appendChild(dateSpan);
        const content = createSafeElement("div", "prayer-content", p.content);
        const actionGroup = createSafeElement("div", "action-group");
        
        let delBtnHtml = `<button class="text-btn" onclick="deletePrayer(${i})">삭제</button>`;
        if(isAdmin) delBtnHtml = `<button class="text-btn admin-delete-btn" onclick="adminDeletePrayer(${i})">강제삭제</button>`;
        
        actionGroup.innerHTML = `
            <button class="text-btn" onclick="editPrayer(${i})">수정</button>
            ${delBtnHtml}
            <button class="text-btn" onclick="addReply(${i})">답글</button>
        `;

        div.appendChild(header);
        div.appendChild(content);
        div.appendChild(actionGroup);

        if (p.replies) {
            const replySection = createSafeElement("div", "reply-section");
            p.replies.forEach(r => {
                const rItem = createSafeElement("div", "reply-item", "💬 " + r.content);
                replySection.appendChild(rItem);
            });
            div.appendChild(replySection);
        }
        list.appendChild(div);
    });
}

// [해결] 실시간 삭제 기능 개선 (Optimistic UI)
function deletePrayer(i) {
    if(confirm("정말 삭제하시겠습니까?")) {
        // 1. 화면에서 즉시 제거
        currentMemberData.prayers.splice(i, 1);
        renderPrayers(); 
        
        // 2. 서버에 업데이트
        const updateData = currentMemberData.prayers.length > 0 ? currentMemberData.prayers : [];
        membersRef.child(currentMemberData.firebaseKey).update({prayers: updateData});
    }
}

function adminDeletePrayer(i) { 
    if(confirm("관리자 권한으로 삭제하시겠습니까?")) { 
        currentMemberData.prayers.splice(i,1); 
        renderPrayers();
        const updateData = currentMemberData.prayers.length > 0 ? currentMemberData.prayers : [];
        membersRef.child(currentMemberData.firebaseKey).update({prayers: updateData}); 
    } 
}

function addPrayer() { const v = document.getElementById("new-prayer").value.trim(); if(v) { if(containsBannedWords(v)) return alert("부적절한 내용"); const p = currentMemberData.prayers||[]; p.unshift({content:v, date:new Date().toISOString().split('T')[0]}); membersRef.child(currentMemberData.firebaseKey).update({prayers:p}); document.getElementById("new-prayer").value=""; } }
function editPrayer(i) { const v = prompt("수정:", currentMemberData.prayers[i].content); if(v) { if(containsBannedWords(v)) return alert("부적절한 내용"); currentMemberData.prayers[i].content = v; membersRef.child(currentMemberData.firebaseKey).update({prayers:currentMemberData.prayers}); } }
function addReply(i) { const v = prompt("답글:"); if(v) { if(containsBannedWords(v)) return alert("부적절한 내용"); if(!currentMemberData.prayers[i].replies) currentMemberData.prayers[i].replies=[]; currentMemberData.prayers[i].replies.push({content:v}); membersRef.child(currentMemberData.firebaseKey).update({prayers:currentMemberData.prayers}); } }

function sendChatMessage() { const t = document.getElementById("chat-msg").value; if(t) { messagesRef.push({name:"익명", text:t, senderId:mySessionId, timestamp: firebase.database.ServerValue.TIMESTAMP}); document.getElementById("chat-msg").value=""; }}
function deleteChatMessage(k) { if(confirm("관리자 삭제?")) messagesRef.child(k).remove(); }

messagesRef.limitToLast(50).on('child_added', snap => {
    const d = snap.val();
    if (d.timestamp > loadTime && d.senderId !== mySessionId) {
        unreadChatKeys.add(snap.key);
        const popup = document.getElementById('chat-popup');
        if (!popup.classList.contains('active')) {
            document.getElementById('chat-badge').classList.add('active');
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
    if(unreadChatKeys.has(snap.key)) {
        unreadChatKeys.delete(snap.key);
        if(unreadChatKeys.size === 0) {
            document.getElementById('chat-badge').classList.remove('active');
        }
    }
});

// 7. 날씨 및 통합 렌더링 루프
const apiKey = "39d8b0517ec448eb742a1ee5e39c2bf3"; 

async function fetchWeather() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`);
                    const d = await res.json();
                    applyWeather(d, true);
                } catch(e) { useFallbackWeather(); }
            },
            (err) => { useFallbackWeather(); }
        );
    } else { useFallbackWeather(); }
}

async function useFallbackWeather() {
        try { 
        const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=38.0964&longitude=127.0748&current_weather=true");
        const d = await res.json();
        const simulatedData = {
            name: "연천군 (기본)",
            main: { temp: d.current_weather.temperature },
            weather: [{ id: convertMeteoCode(d.current_weather.weathercode) }],
            sys: { sunrise: 0, sunset: 0 },
            dt: Date.now() / 1000
        };
        const hour = new Date().getHours();
        const isDay = hour > 6 && hour < 18;
        centerNode.icon = isDay ? "☀️" : "🌙";
        applyWeather(simulatedData, false);
    } catch(e){ showWeatherToast("날씨 정보 없음", ""); }
}

function convertMeteoCode(code) {
    if (code >= 50 && code <= 69) return 500;
    if (code >= 70 && code <= 79) return 600; 
    return 800; 
}

function applyWeather(d, isReal) {
    const temp = Math.round(d.main.temp);
    const location = d.name || "연천군";
    let statusText = "맑음";

    if (isReal) {
        const isDay = d.dt > d.sys.sunrise && d.dt < d.sys.sunset;
        centerNode.icon = isDay ? "☀️" : "🌙";
    }
    
    const code = d.weather[0].id;
    if (code >= 200 && code < 600) { createRain(); centerNode.icon = "🌧️"; statusText = "비"; } 
    else if (code >= 600 && code < 700) { createSnow(); centerNode.icon = "❄️"; statusText = "눈"; } 
    else if (code > 800) { statusText = "흐림"; centerNode.icon = "☁️"; }

    updateNodeVisuals();
    showWeatherToast(location, `${statusText}, ${temp}°C`);
}

function showWeatherToast(loc, info) {
    const toast = document.getElementById('weather-toast');
    const text = document.getElementById('weather-text');
    text.innerHTML = `📍 ${loc}<br>${info}`;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

const wc = document.getElementById('weather-canvas'); const wctx = wc.getContext('2d'); let wParts = [];
function resizeWeatherCanvas() { wc.width = window.innerWidth; wc.height = window.innerHeight; }

function createRain() { 
    wParts=[]; 
    for(let i=0;i<35;i++) { wParts.push({ x: Math.random()*wc.width, y: Math.random()*wc.height, s: 3+Math.random()*4, l: 7+Math.random()*8 }); }
}
function createSnow() { 
    wParts=[]; 
    for(let i=0;i<35;i++) { wParts.push({ x: Math.random()*wc.width, y: Math.random()*wc.height, s: 1+Math.random()*2, r: 2+Math.random()*3 }); }
}

function openLightbox(src) { document.getElementById('lightbox-img').src=src; document.getElementById('lightbox').classList.add('active'); }
function closeLightbox() { document.getElementById('lightbox').classList.remove('active'); }

// 8. 통합 게임 루프
let lastTime = 0;
const fpsInterval = 1000 / 60; 

function gameLoop(timestamp) {
    requestAnimationFrame(gameLoop);

    const elapsed = timestamp - lastTime;
    if (elapsed < fpsInterval) return;

    lastTime = timestamp - (elapsed % fpsInterval);

    // 1. 회전 애니메이션
    if(node) {
        members.forEach(m => { 
            m.rotation = (m.rotation || 0) + (m.rotationDirection * 0.1); 
            if(m.rotation > 360) m.rotation -= 360; 
            else if(m.rotation < -360) m.rotation += 360; 
        });
        node.attr("transform", d => `translate(${d.x},${d.y}) rotate(${d.rotation || 0})`);
        
        // 선 업데이트
        if(link) {
            link.attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
        }
    }

    // 2. 날씨 애니메이션
    if (wParts.length > 0) {
        wctx.clearRect(0,0,wc.width,wc.height);
        wctx.fillStyle = "rgba(255,255,255,0.8)";
        wctx.strokeStyle = "rgba(174,194,224,0.8)";
        wctx.lineWidth=1;
        
        wParts.forEach(p => { 
            if(centerNode.icon === "🌧️") { // 비
                wctx.beginPath(); wctx.moveTo(p.x,p.y); wctx.lineTo(p.x,p.y+p.l); wctx.stroke(); 
                p.y+=p.s; if(p.y>wc.height) p.y=-p.l; 
            } else { // 눈
                wctx.beginPath(); wctx.moveTo(p.x,p.y); wctx.arc(p.x,p.y,p.r,0,Math.PI*2); wctx.fill(); 
                p.y+=p.s; if(p.y>wc.height) p.y=-5; 
            } 
        });
    }
}
resizeWeatherCanvas();
requestAnimationFrame(gameLoop);
