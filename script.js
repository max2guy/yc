// ==========================================
// 연천장로교회 청년부 기도 네트워크 (Final v17)
// Part 1: 초기 설정 및 알림/설정 로직
// ==========================================

// 1. 서비스 워커 등록 및 업데이트 감지
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function(registration) {
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // 새 버전 발견 시 토스트 알림 표시
                    const updateToast = document.getElementById('update-toast');
                    if(updateToast) updateToast.classList.add('show');
                }
            });
        });
    }, function(err) { console.log('SW 등록 실패: ', err); });
}

// 2. Firebase 설정 및 초기화
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

// 3. 전역 변수 및 상태 관리
let isAdmin = false;
let isFirstRender = true;
let isDataLoaded = false;
let currentMemberData = null;
let members = [];
let globalNodes = [];
let simulation = null;

// 로컬 저장소 데이터 불러오기
let readStatus = JSON.parse(localStorage.getItem('readStatus')) || {};
let isNotiEnabled = localStorage.getItem('isNotiEnabled') !== 'false'; 
let mySessionId = localStorage.getItem('mySessionId') || 'user_' + Date.now();
localStorage.setItem('mySessionId', mySessionId);

let isFabOpen = false;
let newMemberIds = new Set();
let lastChatReadTime = Number(localStorage.getItem('lastChatReadTime')) || Date.now();
let unreadChatKeys = new Set();

const brightColors = ["#FFCDD2", "#F8BBD0", "#E1BEE7", "#D1C4E9", "#C5CAE9", "#BBDEFB", "#B3E5FC", "#B2EBF2", "#B2DFDB", "#C8E6C9", "#DCEDC8", "#F0F4C3", "#FFF9C4", "#FFECB3", "#FFE0B2", "#FFCCBC", "#D7CCC8", "#F5F5F5", "#CFD8DC"];

// 4. 설정창(모달) 및 스위치 제어 로직
function openSettingsModal() {
    const notiToggle = document.getElementById('setting-noti-toggle');
    const adminToggle = document.getElementById('setting-admin-toggle');
    
    // 알림 스위치 상태 동기화
    if (notiToggle) {
        notiToggle.checked = (isNotiEnabled && Notification.permission === "granted");
    }
    // 관리자 스위치 상태 동기화
    if (adminToggle) {
        adminToggle.checked = isAdmin;
    }

    document.getElementById('settings-modal').classList.add('active');
    if(isFabOpen) toggleFabMenu();
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.remove('active');
}

// 설정창 내 알림 스위치 조작
function handleNotiToggle(checkbox) {
    if (checkbox.checked) {
        if (!("Notification" in window)) {
            alert("알림을 지원하지 않는 기기입니다.");
            checkbox.checked = false;
            return;
        }
        Notification.requestPermission().then(permission => {
            if (permission === "granted") enableNotification();
            else {
                alert("알림 권한이 거부되었습니다. 휴대폰 설정에서 권한을 허용해주세요.");
                checkbox.checked = false;
            }
        });
    } else {
        isNotiEnabled = false;
        localStorage.setItem('isNotiEnabled', 'false');
        updateNotiButtonUI();
        alert("알림이 해제되었습니다. 🔕");
    }
}

// 설정창 내 관리자 스위치 조작
function handleAdminToggle(checkbox) {
    if (checkbox.checked) {
        checkbox.checked = false; // 인증 성공 전까지는 꺼둠
        openAdminModal(); 
    } else {
        if (confirm("관리자 모드를 해제하시겠습니까?")) {
            firebase.auth().signOut().then(() => {
                isAdmin = false;
                document.getElementById('body').classList.remove('admin-mode');
                alert("해제되었습니다.");
            });
        } else {
            checkbox.checked = true;
        }
    }
}

// 채팅창 내부 알림 버튼용 토글
function toggleNotification() {
    if (isNotiEnabled) {
        isNotiEnabled = false;
        localStorage.setItem('isNotiEnabled', 'false');
        updateNotiButtonUI();
        alert("알림이 해제되었습니다. 🔕");
    } else {
        if (!("Notification" in window)) return alert("이 기기는 알림을 지원하지 않습니다.");
        Notification.requestPermission().then(p => {
            if (p === "granted") enableNotification();
            else alert("알림 권한이 필요합니다.");
        });
    }
}

function enableNotification() {
    isNotiEnabled = true;
    localStorage.setItem('isNotiEnabled', 'true');
    updateNotiButtonUI();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
            reg.showNotification("알림 설정 완료!", {
                body: "이제 새로운 메시지 알림을 받습니다.",
                icon: 'icon-192.png',
                vibrate: [100]
            });
        });
    }
}

function updateNotiButtonUI() {
    const btn = document.getElementById('noti-btn');
    if (btn) {
        btn.innerText = isNotiEnabled ? "🔕 알림 끄기" : "🔔 알림 켜기";
        btn.style.backgroundColor = isNotiEnabled ? "#FFCDD2" : "#FFF3E0";
    }
}

function forceRefresh() {
    if(confirm("데이터를 초기화하고 화면을 새로고침 하시겠습니까?\n(알림이 안 올 때 효과적입니다)")) {
        if ('caches' in window) {
            caches.keys().then(names => {
                for (let name of names) caches.delete(name);
                window.location.reload(true);
            });
        } else { window.location.reload(true); }
    }
}
// ==========================================
// Part 2: 기도제목 렌더링 및 기능 로직
// ==========================================

// 5. 기도제목 리스트 출력 (더보기 메뉴 적용)
function renderPrayers() {
    const list = document.getElementById("prayer-list"); 
    if (!list) return;
    list.innerHTML = "";
    
    if(!currentMemberData || !currentMemberData.prayers) { 
        list.innerHTML = "<p style='text-align:center; margin-top:20px; color:#888;'>기도제목을 나눠주세요!</p>"; 
        return; 
    }

    // 데이터 복사 및 정렬 (고정된 글 우선)
    const displayList = currentMemberData.prayers.map((p, index) => ({
        ...p,
        originalIndex: index
    }));

    displayList.sort((a, b) => {
        return (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
    });

    displayList.forEach((p) => {
        const i = p.originalIndex;
        const div = createSafeElement("div", "prayer-card");
        if (p.isPinned) div.classList.add("pinned");

        // --- 상단 헤더 (고정핀 + 날짜 + 더보기 버튼) ---
        const header = createSafeElement("div", "prayer-header");
        
        const headerLeft = createSafeElement("div");
        headerLeft.style.display = "flex";
        headerLeft.style.alignItems = "center";
        headerLeft.style.gap = "8px";

        if (p.isPinned) {
            const pinIcon = createSafeElement("span", "pinned-icon", "📌");
            headerLeft.appendChild(pinIcon);
        }

        const dateSpan = createSafeElement("span", "", p.date);
        headerLeft.appendChild(dateSpan);

        // 더보기(···) 메뉴 래퍼
        const moreWrapper = document.createElement("div");
        moreWrapper.style.position = "relative";
        
        const moreBtn = createSafeElement("button", "more-btn", "···");
        
        const optionsMenu = createSafeElement("div", "more-options");
        optionsMenu.id = `opt-${i}`;

        // 메뉴 항목 1: 고정/해제
        const optPin = createSafeElement("button", "opt-btn", p.isPinned ? "📍 고정 해제" : "📌 상단 고정");
        optPin.onclick = (e) => { e.stopPropagation(); togglePin(i); optionsMenu.classList.remove('active'); };

        // 메뉴 항목 2: 수정
        const optEdit = createSafeElement("button", "opt-btn", "📝 수정하기");
        optEdit.onclick = (e) => { e.stopPropagation(); editPrayer(i); optionsMenu.classList.remove('active'); };

        // 메뉴 항목 3: 삭제
        const optDelLabel = isAdmin ? "🗑️ 강제 삭제" : "🗑️ 삭제하기";
        const optDel = createSafeElement("button", "opt-btn del-opt", optDelLabel);
        optDel.onclick = (e) => { e.stopPropagation(); deletePrayer(i); optionsMenu.classList.remove('active'); };

        optionsMenu.appendChild(optPin);
        optionsMenu.appendChild(optEdit);
        optionsMenu.appendChild(optDel);
        
        moreBtn.onclick = (e) => {
            e.stopPropagation();
            // 다른 열려있는 메뉴 모두 닫기
            document.querySelectorAll('.more-options').forEach(el => {
                if(el.id !== `opt-${i}`) el.classList.remove('active');
            });
            optionsMenu.classList.toggle('active');
        };

        moreWrapper.appendChild(moreBtn);
        moreWrapper.appendChild(optionsMenu);

        header.appendChild(headerLeft);
        header.appendChild(moreWrapper);

        // --- 본문 및 하단 액션 ---
        const content = createSafeElement("div", "prayer-content", p.content);
        const actionGroup = createSafeElement("div", "action-group");
        
        const replyBtn = createSafeElement("button", "text-btn", "💬 답글 달기");
        replyBtn.onclick = () => addReply(i);
        
        actionGroup.appendChild(replyBtn);
        
        div.appendChild(header); 
        div.appendChild(content); 
        div.appendChild(actionGroup);

        // --- 답글 리스트 ---
        if (p.replies) {
            const replySection = createSafeElement("div", "reply-section");
            p.replies.forEach((r, rIdx) => { 
                const rItem = createSafeElement("div", "reply-item");
                
                const rText = createSafeElement("span", "", "💬 " + r.content);
                rText.style.flex = "1";
                
                // 답글 삭제 버튼 (X)
                const rDelBtn = document.createElement("button");
                rDelBtn.innerHTML = "&times;";
                rDelBtn.style.cssText = "border:none; background:none; color:#aaa; cursor:pointer; font-size:1.2rem; padding:0 5px;";
                rDelBtn.onclick = () => deleteReply(i, rIdx);
                
                rItem.appendChild(rText);
                rItem.appendChild(rDelBtn);
                replySection.appendChild(rItem); 
            });
            div.appendChild(replySection);
        }
        list.appendChild(div);
    });
}

// 6. 데이터 조작 함수 (Firebase 동기화)
function syncPrayers() {
    if (!currentMemberData) return;
    membersRef.child(currentMemberData.firebaseKey).update({
        prayers: currentMemberData.prayers || []
    }).then(() => {
        renderPrayers();
    });
}

function addPrayer() {
    const v = document.getElementById("new-prayer").value.trim();
    if(!v) return;
    if(containsBannedWords(v)) return alert("부적절한 단어가 포함되어 있습니다.");
    
    const p = currentMemberData.prayers || [];
    p.unshift({
        content: v, 
        date: new Date().toISOString().split('T')[0],
        isPinned: false
    });
    
    membersRef.child(currentMemberData.firebaseKey).update({ prayers: p });
    document.getElementById("new-prayer").value = "";
}

function editPrayer(i) {
    const v = prompt("내용 수정:", currentMemberData.prayers[i].content);
    if(v && v.trim()) {
        if(containsBannedWords(v)) return alert("부적절한 단어 포함");
        currentMemberData.prayers[i].content = v.trim();
        syncPrayers();
    }
}

function deletePrayer(i) {
    const msg = isAdmin ? "[관리자] 이 기도제목을 강제로 삭제하시겠습니까?" : "정말 삭제하시겠습니까?";
    if(confirm(msg)) {
        currentMemberData.prayers.splice(i, 1);
        syncPrayers();
    }
}

function togglePin(index) {
    const currentState = currentMemberData.prayers[index].isPinned || false;
    currentMemberData.prayers[index].isPinned = !currentState;
    syncPrayers();
}

function addReply(i) {
    const v = prompt("답글 내용을 입력하세요:");
    if(v && v.trim()) {
        if(containsBannedWords(v)) return alert("부적절한 단어 포함");
        if(!currentMemberData.prayers[i].replies) currentMemberData.prayers[i].replies = [];
        currentMemberData.prayers[i].replies.push({ content: v.trim() });
        syncPrayers();
    }
}

function deleteReply(pIdx, rIdx) {
    if(confirm("이 답글을 삭제하시겠습니까?")) {
        currentMemberData.prayers[pIdx].replies.splice(rIdx, 1);
        syncPrayers();
    }
}

function createSafeElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
}
// ==========================================
// Part 3: 시각화 엔진 및 실시간 소통 로직
// ==========================================

// 7. D3.js 시각화 엔진 및 인터랙션
function initSimulation() {
    simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(d => d.id).distance(140))
        .force("charge", d3.forceManyBody().strength(-400))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(d => (d.type === 'root' ? 85 : 40) + 25));
}

function updateGraph() {
    if (!isDataLoaded) return;
    globalNodes = [centerNode, ...members];
    const links = members.map(m => ({ source: "center", target: m.id }));

    // 사진 패턴 업데이트
    const patterns = svg.select("defs").selectAll("pattern").data(members, d => d.id);
    const pEnter = patterns.enter().append("pattern")
        .attr("id", d => "img-" + d.id).attr("width", 1).attr("height", 1).attr("patternContentUnits", "objectBoundingBox");
    pEnter.append("image").attr("x", 0).attr("y", 0).attr("width", 1).attr("height", 1).attr("preserveAspectRatio", "xMidYMid slice");
    patterns.merge(pEnter).select("image").attr("xlink:href", d => d.photoUrl || "");
    patterns.exit().remove();

    // 선(Link) 업데이트
    let link = linkGroup.selectAll("line").data(links, d => d.target.id || d.target);
    link.exit().remove();
    link = link.enter().append("line")
        .attr("stroke", "#FFFFFF")
        .attr("stroke-width", 2.5)
        .style("opacity", 0.6)
        .merge(link);

    // 노드(Node) 업데이트
    let node = nodeGroup.selectAll("g").data(globalNodes, d => d.id);
    node.exit().remove();

    const nodeEnter = node.enter().append("g")
        .attr("cursor", "pointer")
        .on("click", (event, d) => { if (d.type !== 'root') openPrayerPopup(d); });

    nodeEnter.append("circle")
        .attr("r", d => d.type === 'root' ? 75 : 38)
        .attr("stroke", "#fff")
        .attr("stroke-width", 2.5)
        .style("filter", "drop-shadow(0 2px 5px rgba(0,0,0,0.1))");

    nodeEnter.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", ".35em")
        .style("font-weight", "bold")
        .style("fill", "#5D4037")
        .style("pointer-events", "none");

    node = nodeEnter.merge(node);
    node.select("circle").attr("fill", d => {
        if (d.type === 'root') return "#FFF8E1";
        return d.photoUrl ? `url(#img-${d.id})` : (d.color || "#ccc");
    });
    node.select("text").text(d => d.name.split('\n')[0]);

    if (!simulation) initSimulation();
    simulation.nodes(globalNodes).on("tick", () => {
        node.attr("transform", d => `translate(${d.x},${d.y})`);
        link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    });
    simulation.force("link").links(links);
    simulation.alpha(1).restart();
}

// 8. 실시간 소통방(채팅) 및 접속자 로직
function sendChatMessage() {
    const msgInput = document.getElementById("chat-msg");
    const text = msgInput.value.trim();
    if (!text) return;
    if (containsBannedWords(text)) return alert("부적절한 단어 포함");

    messagesRef.push({
        name: "익명",
        text: text,
        senderId: mySessionId,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    msgInput.value = "";
}

messagesRef.limitToLast(50).on('child_added', snap => {
    const d = snap.val();
    const chatBox = document.getElementById("chat-messages");
    if (!chatBox) return;

    const isMine = d.senderId === mySessionId;
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.alignItems = isMine ? "flex-end" : "flex-start";

    const bubble = document.createElement("div");
    bubble.innerText = d.text;
    bubble.style.cssText = `max-width: 80%; padding: 8px 12px; border-radius: 12px; margin: 4px 0; font-size: 0.95rem; line-height:1.4;`;
    bubble.style.backgroundColor = isMine ? "#FFCC80" : "#f1f1f1";
    bubble.style.color = isMine ? "#3E2723" : "#333";

    if (isAdmin) {
        bubble.onclick = () => confirm("삭제?") && messagesRef.child(snap.key).remove();
    }

    wrapper.appendChild(bubble);
    chatBox.appendChild(wrapper);
    chatBox.scrollTop = chatBox.scrollHeight;

    // 알림 처리
    if (!isFirstRender && !isMine && isNotiEnabled && document.hidden) {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification("💭 소통방 새 메시지", { body: d.text, icon: 'icon-192.png' });
            });
        }
    }
});

messagesRef.on('child_removed', () => {
    const chatBox = document.getElementById("chat-messages");
    if(chatBox) { chatBox.innerHTML = ""; messagesRef.limitToLast(50).once('value', s => location.reload()); }
});

// 9. 날씨 애니메이션 로직
const wc = document.getElementById('weather-canvas');
const wctx = wc ? wc.getContext('2d') : null;
let wParts = [];

async function fetchWeather() {
    try {
        const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=38.09&longitude=127.07&current_weather=true");
        const d = await res.json();
        const temp = d.current_weather.temperature;
        document.getElementById('weather-text').innerHTML = `📍 연천군<br>현재 기온: ${temp}°C`;
        const toast = document.getElementById('weather-toast');
        if(toast) { toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }
    } catch(e) { console.log("날씨 로드 실패"); }
}

function gameLoop() {
    requestAnimationFrame(gameLoop);
    if (!wctx) return;
    wctx.clearRect(0, 0, wc.width, wc.height);
    // 날씨 입자 물리 연산 및 렌더링 (비/눈 등은 필요시 추가)
}

// 10. 초기화 실행
window.addEventListener('resize', () => {
    if(wc) { wc.width = window.innerWidth; wc.height = window.innerHeight; }
});
if(wc) { wc.width = window.innerWidth; wc.height = window.innerHeight; }
requestAnimationFrame(gameLoop);

function containsBannedWords(t) {
    const list = ["바보", "멍청이"]; // 예시 금지어
    return list.some(w => t.includes(w));
}

// 프로필 이미지 핸들러 등 기타 유틸리티 (필수)
function editProfile() {
    if (!currentMemberData) return;
    document.getElementById('edit-profile-name').value = currentMemberData.name;
    document.getElementById('edit-profile-preview').src = currentMemberData.photoUrl || "";
    document.getElementById('profile-edit-modal').classList.add('active');
}

function closeProfileEditModal() { document.getElementById('profile-edit-modal').classList.remove('active'); }

function saveProfileChanges() {
    const newName = document.getElementById('edit-profile-name').value.trim();
    if(!newName) return;
    membersRef.child(currentMemberData.firebaseKey).update({
        name: newName,
        photoUrl: document.getElementById('edit-profile-preview').src
    }).then(() => { location.reload(); });
}

function handleProfileFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => document.getElementById('edit-profile-preview').src = e.target.result;
    reader.readAsDataURL(file);
}

function checkAdmin() {
    const pw = document.getElementById('admin-pw').value;
    if(pw === "1004") { // 예시 비번
        isAdmin = true;
        document.getElementById('body').classList.add('admin-mode');
        document.getElementById('admin-modal').classList.remove('active');
        alert("인증 성공");
    } else { alert("비번 오류"); }
}

function openAdminModal() { document.getElementById('admin-modal').classList.add('active'); }
function closeAdminModal(e) { if(e.target.id === 'admin-modal') document.getElementById('admin-modal').classList.remove('active'); }
function addNewMember() {
    const n = prompt("이름?");
    if(n) membersRef.push({name:n, type:'member', color:brightColors[0], prayers:[]});
}

onlineRef.on('value', s => {
    if(s.val()) {
        const p = presenceRef.push();
        p.onDisconnect().remove();
        p.set(true);
    }
});
presenceRef.on('value', s => {
    document.getElementById('online-count').innerText = `${s.numChildren()}명 접속 중`;
});

// 끝
