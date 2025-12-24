// ==========================================
// 연천장로교회 청년부 기도 네트워크 (Final v14)
// ==========================================

// 1. 서비스 워커 및 초기 설정 (기존 로직 유지)
// ...

// 2. 기도제목 렌더링 (핵심 수정 사항)
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

        // 1. [헤더] 날짜/고정 | 더보기
        const header = createSafeElement("div", "prayer-header");
        const headerLeft = createSafeElement("div");
        headerLeft.style.display = "flex"; headerLeft.style.alignItems = "center"; headerLeft.style.gap = "8px";

        const pinBtn = createSafeElement("button", "text-btn", p.isPinned ? "📌 해제" : "📍 고정");
        pinBtn.onclick = () => togglePin(i);
        pinBtn.style.color = p.isPinned ? "#E65100" : "#aaa";
        headerLeft.appendChild(pinBtn);
        headerLeft.appendChild(createSafeElement("span", "", p.date));

        // 더보기 버튼 메뉴
        const moreWrapper = document.createElement("div");
        moreWrapper.style.position = "relative";
        const moreBtn = createSafeElement("button", "more-btn", "···");
        const optionsMenu = createSafeElement("div", "more-options");
        optionsMenu.id = `opt-${i}`;

        const optEdit = createSafeElement("button", "opt-btn", "📝 수정");
        optEdit.onclick = (e) => { e.stopPropagation(); editPrayer(i); optionsMenu.classList.remove('active'); };
        
        const optDelLabel = isAdmin ? "🗑️ 강제삭제" : "🗑️ 삭제";
        const optDel = createSafeElement("button", "opt-btn del-opt", optDelLabel);
        optDel.onclick = (e) => { e.stopPropagation(); isAdmin ? adminDeletePrayer(i) : deletePrayer(i); optionsMenu.classList.remove('active'); };

        optionsMenu.appendChild(optEdit); optionsMenu.appendChild(optDel);
        moreBtn.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.more-options').forEach(el => { if(el.id !== `opt-${i}`) el.classList.remove('active'); });
            optionsMenu.classList.toggle('active');
        };

        moreWrapper.appendChild(moreBtn); moreWrapper.appendChild(optionsMenu);
        header.appendChild(headerLeft); header.appendChild(moreWrapper);

        // 2. [본문] 및 [하단]
        const actionGroup = createSafeElement("div", "action-group");
        const replyBtn = createSafeElement("button", "text-btn", "💬 답글");
        replyBtn.onclick = () => addReply(i);
        actionGroup.appendChild(replyBtn);

        div.appendChild(header); 
        div.appendChild(createSafeElement("div", "prayer-content", p.content)); 
        div.appendChild(actionGroup);

        // 답글 렌더링 생략 (기존 로직 유지)
        // ...
        list.appendChild(div);
    });
}

// 3. 설정 및 관리자 로직 (기존 로직 유지)
// ...
