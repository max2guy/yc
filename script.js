// ==========================================
// 연천장로교회 청년부 기도 네트워크 (v12 Restored)
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

// 2. 변수 선언
let isAdmin = false;
let isDataLoaded = false;
let currentMemberData = null;
let members = [];
let simulation = null;
let isFabOpen = false;
let mySessionId = localStorage.getItem('mySessionId') || 'user_' + Date.now();
localStorage.setItem('mySessionId', mySessionId);
let isNotiEnabled = localStorage.getItem('isNotiEnabled') !== 'false';
const brightColors = ["#FFCDD2", "#F8BBD0", "#E1BEE7", "#D1C4E9", "#C5CAE9", "#BBDEFB", "#B3E5FC", "#B2EBF2", "#B2DFDB", "#C8E6C9", "#DCEDC8", "#F0F4C3", "#FFF9C4", "#FFECB3", "#FFE0B2", "#FFCCBC", "#D7CCC8", "#F5F5F5", "#CFD8DC"];

// 3. UI 및 메뉴 제어
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

// 4. D3 시각화 엔진
const width = window.innerWidth;
const height = window.innerHeight;
const svg = d3.select("#visualization").append("svg").attr("width", width).attr("height", height);
const g = svg.append("g");
const linkGroup = g.append("g").attr("class", "links");
const nodeGroup = g.append("g").attr("class", "nodes");
let centerNode = { id:"center", name:"연천장로교회\n청년부", type:"root" };

svg.call(d3.zoom().scaleExtent([0.1, 4]).on("zoom", (event) => {
    g.attr("transform", event.transform);
}));

function initSimulation() {
    simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(d => d.id).distance(130))
        .force("charge", d3.forceManyBody().strength(-350))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(50));
}

function updateGraph() {
    const nodes = [centerNode, ...members];
    const links = members.map(m => ({ source: "center", target: m.id }));

    // 링크(선) 그리기
    let link = linkGroup.selectAll("line").data(links);
    link.exit().remove();
    const linkEnter = link.enter().append("line").attr("stroke", "#fff").attr("stroke-width", 2).style("opacity", 0.6);
    link = linkEnter.merge(link);

    // 노드(원) 그리기
    let node = nodeGroup.selectAll("g").data(nodes, d => d.id);
    node.exit().remove();
    
    const nodeEnter = node.enter().append("g")
        .attr("cursor", "pointer")
        .on("click", (event, d) => {
            event.stopPropagation();
            if(d.type !== 'root') openPrayerPopup(d);
        });

    // 이미지 패턴 정의
    const defs = svg.select("defs").empty() ? svg.append("defs") : svg.select("defs");
    const patterns = defs.selectAll("pattern").data(members, d => d.id);
    const pEnter = patterns.enter().append("pattern")
        .attr("id", d => "img-" + d.id)
        .attr("width", 1).attr("height", 1)
        .attr("patternContentUnits", "objectBoundingBox");
    pEnter.append("image")
        .attr("x", 0).attr("y", 0)
        .attr("width", 1).attr("height", 1)
        .attr("preserveAspectRatio", "xMidYMid slice");
    patterns.merge(pEnter).select("image").attr("xlink:href", d => d.photoUrl || "");

    nodeEnter.append("circle")
        .attr("r", d => d.type === 'root' ? 70 : 40)
        .attr("stroke", "#fff")
        .attr("stroke-width", 2.5)
        .style("filter", "drop-shadow(0 2px 5px rgba(0,0,0,0.1))");

    nodeEnter.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", ".35em")
        .style("font-weight", "bold")
        .style("fill", "#5D4037")
        .style("font-size", "12px")
        .style("pointer-events", "none");

    node = nodeEnter.merge(node);
    
    node.select("circle").attr("fill", d => {
        if (d.type === 'root') return "#FFF8E1";
        return d.photoUrl ? `url(#img-${d.id})` : (d.color || "#ccc");
    });
    node.select("text").text(d => d.name.split('\n')[0]);

    if (!simulation) initSimulation();
    simulation.nodes(nodes).on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
        node
            .attr("transform", d => `translate(${d.x},${d.y})`);
    });
    simulation.force("link").links(links);
    simulation.alpha(1).restart();
}

// 5. 기도제목 기능
function openPrayerPopup(d) {
    currentMemberData = d;
    document.getElementById('panel-name').innerText = d.name;
    document.getElementById('current-color-display').style.backgroundColor = d.color || "#ccc";
    document.getElementById('prayer-popup').classList.add('active');
    renderPrayers();
}
function closePrayerPopup() { document.getElementById('prayer-popup').classList.remove('active'); currentMemberData = null; }

function renderPrayers() {
    const list = document.getElementById('prayer-list');
    list.innerHTML = "";
    
    if (!currentMemberData || !currentMemberData.prayers || currentMemberData.prayers.length === 0) {
        list.innerHTML = "<div style='text-align:center; padding:20px; color:#999;'>기도제목을 나눠주세요 🙏</div>";
        return;
    }

    const prayers = currentMemberData.prayers.map((p, i) => ({ ...p, originalIndex: i }));
    prayers.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

    prayers.forEach(p => {
        const idx = p.originalIndex;
        const div = document.createElement('div');
        div.className = `prayer-card ${p.isPinned ? 'pinned' : ''}`;
        
        // 카드 헤더
        const header = document.createElement('div');
        header.className = 'prayer-header';
        const dateSpan = document.createElement('span');
        dateSpan.innerHTML = `${p.isPinned ? '📌 ' : ''}${p.date}`;
        
        const moreWrap = document.createElement('div');
        moreWrap.className = 'more-wrapper';
        const moreBtn = document.createElement('button');
        moreBtn.className = 'more-btn';
        moreBtn.innerText = '···';
        moreBtn.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.more-options').forEach(el => el.classList.remove('active'));
            document.getElementById(`opt-${idx}`).classList.add('active');
        };
        
        const opts = document.createElement('div');
        opts.className = 'more-options';
        opts.id = `opt-${idx}`;
        
        const btnPin = document.createElement('button');
        btnPin.className = 'opt-btn';
        btnPin.innerText = p.isPinned ? '📍 고정 해제' : '📌 상단 고정';
        btnPin.onclick = (e) => { e.stopPropagation(); togglePin(idx); };
        
        const btnEdit = document.createElement('button');
        btnEdit.className = 'opt-btn';
        btnEdit.innerText = '📝 수정';
        btnEdit.onclick = (e) => { e.stopPropagation(); editPrayer(idx); };
        
        const btnDel = document.createElement('button');
        btnDel.className = 'opt-btn';
        btnDel.style.color = 'red';
        btnDel.innerText = '🗑️ 삭제';
        btnDel.onclick = (e) => { e.stopPropagation(); deletePrayer(idx); };
        
        opts.append(btnPin, btnEdit, btnDel);
        moreWrap.append(moreBtn, opts);
        header.append(dateSpan, moreWrap);
        
        // 본문
        const content = document.createElement('div');
        content.className = 'prayer-content';
        content.innerText = p.content;
        
        // 답글 버튼
        const replyBtn = document.createElement('button');
        replyBtn.className = 'text-btn';
        replyBtn.innerText = '💬 답글 달기';
        replyBtn.onclick = () => addReply(idx);
        
        div.append(header, content, replyBtn);
        
        // 답글 목록
        if (p.replies) {
            const rSection = document.createElement('div');
            rSection.className = 'reply-section';
            p.replies.forEach((r, rIdx) => {
                const rItem = document.createElement('div');
                rItem.className = 'reply-item';
                rItem.innerHTML = `<span>💬 ${r.content}</span><span onclick="deleteReply(${idx}, ${rIdx})" style="cursor:pointer; color:#aaa;">&times;</span>`;
                rSection.appendChild(rItem);
            });
            div.appendChild(rSection);
        }
        
        list.appendChild(div);
    });
}

function sync() {
    membersRef.child(currentMemberData.firebaseKey).update({ prayers: currentMemberData.prayers || [] })
        .then(() => renderPrayers());
}

function addPrayer() {
    const input = document.getElementById('new-prayer');
    const val = input.value.trim();
    if (!val) return;
    
    if (!currentMemberData.prayers) currentMemberData.prayers = [];
    currentMemberData.prayers.unshift({
        content: val,
        date: new Date().toISOString().split('T')[0],
        isPinned: false
    });
    sync();
    input.value = "";
}

function togglePin(i) {
    currentMemberData.prayers[i].isPinned = !currentMemberData.prayers[i].isPinned;
    sync();
}
function editPrayer(i) {
    const v = prompt("기도제목 수정:", currentMemberData.prayers[i].content);
    if (v) { currentMemberData.prayers[i].content = v; sync(); }
}
function deletePrayer(i) {
    if (confirm("정말 삭제하시겠습니까?")) { currentMemberData.prayers.splice(i, 1); sync(); }
}
function addReply(i) {
    const v = prompt("답글 입력:");
    if (v) {
        if (!currentMemberData.prayers[i].replies) currentMemberData.prayers[i].replies = [];
        currentMemberData.prayers[i].replies.push({ content: v });
        sync();
    }
}
function deleteReply(pIdx, rIdx) {
    if (confirm("답글 삭제?")) {
        currentMemberData.prayers[pIdx].replies.splice(rIdx, 1);
        sync();
    }
}

// 6. 데이터 로딩 (필수!)
function loadData() {
    setTimeout(() => document.getElementById('loading').classList.add('hide'), 2500);

    membersRef.on('value', snap => {
        const val = snap.val();
        if (val) {
            members = Object.keys(val).map(key => ({ firebaseKey: key, ...val[key] }));
            isDataLoaded = true;
            document.getElementById('loading').classList.add('hide');
            updateGraph();
        }
    });

    fetchWeather();
}

// 7. 날씨 & 채팅 & 기타
async function fetchWeather() {
    try {
        const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=38.09&longitude=127.07&current_weather=true");
        const data = await res.json();
        const code = data.current_weather.weathercode;
        document.getElementById('weather-text').innerText = `연천군 ${data.current_weather.temperature}°C`;
        
        // 캔버스 애니메이션
        const canvas = document.getElementById('weather-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        let particles = [];
        
        const isRain = code >= 51 && code <= 67;
        const isSnow = code >= 71 && code <= 86;
        
        if (isRain || isSnow) {
            for(let i=0; i<50; i++) particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                speed: Math.random() * 5 + 2,
                size: Math.random() * 2 + 1
            });
            
            function animate() {
                ctx.clearRect(0,0,canvas.width,canvas.height);
                ctx.fillStyle = isRain ? 'rgba(173,216,230,0.6)' : 'rgba(255,255,255,0.8)';
                particles.forEach(p => {
                    ctx.beginPath();
                    if(isRain) ctx.rect(p.x, p.y, 1, p.speed*2);
                    else ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
                    ctx.fill();
                    p.y += p.speed;
                    if(p.y > canvas.height) p.y = 0;
                });
                requestAnimationFrame(animate);
            }
            animate();
        }
    } catch(e) { console.log(e); }
}

function sendChatMessage() {
    const input = document.getElementById('chat-msg');
    const txt = input.value.trim();
    if(txt) {
        messagesRef.push({ text: txt, senderId: mySessionId });
        input.value = "";
    }
}
messagesRef.limitToLast(50).on('child_added', snap => {
    const d = snap.val();
    const div = document.createElement('div');
    const isMine = d.senderId === mySessionId;
    div.style.cssText = `padding:8px 12px; margin:5px; border-radius:15px; background:${isMine ? '#FFCC80' : '#f0f0f0'}; align-self:${isMine ? 'flex-end' : 'flex-start'}; max-width:80%;`;
    div.innerText = d.text;
    document.getElementById('chat-messages').appendChild(div);
});

function toggleChatPopup() { document.getElementById('chat-popup').classList.toggle('active'); }
function toggleCampPopup() { document.getElementById('camp-popup').classList.toggle('active'); }
function openSettingsModal() { 
    document.getElementById('settings-modal').classList.add('active'); 
    document.getElementById('setting-noti-toggle').checked = isNotiEnabled;
}
function closeSettingsModal() { document.getElementById('settings-modal').classList.remove('active'); }
function handleNotiToggle(cb) {
    if(cb.checked) {
        Notification.requestPermission().then(p => {
            if(p==="granted") { isNotiEnabled=true; localStorage.setItem('isNotiEnabled','true'); }
            else cb.checked=false;
        });
    } else {
        isNotiEnabled=false; localStorage.setItem('isNotiEnabled','false');
    }
}

// 8. 앱 실행
loadData();
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
