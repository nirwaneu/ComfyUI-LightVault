import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Comfy.SmartGallery",
    async setup() {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = new URL("./gallery.css", import.meta.url).href;
        document.head.appendChild(link);

        let currentPage = 1;
        let currentType = "output";
        let currentFilter = "all";
        let currentModel = "all";
        let currentSort = "newest";
        let isFavOnly = false;
        let thumbSize = 120;
        
        let isSelectMode = false;
        let selectedFiles = new Set();
        let currentFileList = [];
        let currentDetailIndex = -1;
        let activeTags = [];

        const getPillColor = (tag) => {
            const colors = {
                "FLUX": "#6366f1", "WAN": "#06b6d4", "KREA": "#f59e0b",
                "ANIMA": "#ec4899", "PONY": "#10b981", "SDXL": "#3b82f6", "OTHER": "#64748b"
            };
            return colors[tag.toUpperCase()] || "#3b82f6";
        };

        app.extensionManager?.registerSidebarTab?.({
            id: "smart-gallery",
            icon: "pi pi-images",
            title: "LightVault",
            tooltip: "LightVault Media Gallery",
            type: "custom",
            render: (el) => {
                el.innerHTML = `
                    <div class="sg-container">
                        <div class="sg-header">
                            <div class="sg-tabs">
                                <button id="sg-tab-out" class="sg-btn active">Output</button>
                                <button id="sg-tab-in" class="sg-btn">Input</button>
                                <button id="sg-fav-toggle" class="sg-btn-icon" title="Toggle Favorites">☆</button>
                                <button id="sg-select-toggle" class="sg-btn-sm" title="Batch Select">Select</button>
                                <button id="sg-refresh" class="sg-btn-icon" title="Refresh">🔄</button>
                            </div>
                            <div class="sg-controls-row">
                                <select id="sg-filter-type">
                                    <option value="all">All Media</option>
                                    <option value="images">Images</option>
                                    <option value="videos">Videos</option>
                                </select>
                                <select id="sg-filter-model">
                                    <option value="all">All Models</option>
                                    <option value="FLUX">FLUX</option>
                                    <option value="KREA">KREA</option>
                                    <option value="WAN">WAN</option>
                                    <option value="ANIMA">ANIMA</option>
                                    <option value="PONY">PONY</option>
                                    <option value="SDXL">SDXL</option>
                                </select>
                            </div>
                            <div class="sg-controls-row">
                                <select id="sg-sort">
                                    <option value="newest">Newest First</option>
                                    <option value="oldest">Oldest First</option>
                                    <option value="name">Name A-Z</option>
                                </select>
                                <input type="range" id="sg-size-slider" min="80" max="250" value="${thumbSize}">
                            </div>
                        </div>

                        <div id="sg-batch-bar" class="sg-batch-bar sg-hidden">
                            <span id="sg-selected-count">0 selected</span>
                            <button id="sg-batch-delete-btn" class="sg-btn-danger-sm">Delete Selected</button>
                        </div>

                        <div id="sg-grid" class="sg-grid" style="--thumb-size: ${thumbSize}px;"></div>

                        <div class="sg-footer">
                            <button id="sg-prev-page" class="sg-btn">◀</button>
                            <span id="sg-page-info">1 / 1</span>
                            <button id="sg-next-page" class="sg-btn">▶</button>
                        </div>
                    </div>
                    
                    <!-- Modal Details -->
                    <div id="sg-modal" class="sg-modal sg-hidden">
                        <div class="sg-modal-content">
                            <button id="sg-close-modal" class="sg-close-btn">&times;</button>
                            
                            <div class="sg-modal-body">
                                <div id="sg-preview-container" class="sg-preview-box">
                                    <button id="sg-nav-left" class="sg-nav-overlay sg-nav-left">◀</button>
                                    <div id="sg-media-render"></div>
                                    <button id="sg-nav-right" class="sg-nav-overlay sg-nav-right">▶</button>
                                </div>

                                <div class="sg-details-box">
                                    <div class="sg-detail-header">
                                        <div class="sg-title-fav-row">
                                            <h3 id="sg-detail-filename">File Details</h3>
                                            <button id="sg-modal-fav-btn" class="sg-fav-star">☆</button>
                                        </div>
                                        <div class="sg-tags-wrapper">
                                            <div id="sg-tags-list" class="sg-tags-list"></div>
                                            <input type="text" id="sg-add-tag-input" placeholder="+ Add tag..." />
                                        </div>
                                    </div>

                                    <div class="sg-info-grid">
                                        <div class="sg-info-item"><span>Date</span><strong id="sg-detail-date"></strong></div>
                                        <div class="sg-info-item"><span>Size</span><strong id="sg-detail-size"></strong></div>
                                        <div class="sg-info-item full"><span>Model</span><strong id="sg-detail-model"></strong></div>
                                        <div class="sg-info-item full"><span>LoRAs</span><strong id="sg-detail-loras"></strong></div>
                                    </div>
                                    
                                    <div class="sg-prompt-card">
                                        <div class="sg-prompt-header">
                                            <span>Positive Prompt</span>
                                            <button id="sg-copy-pos" class="sg-btn-copy">Copy</button>
                                        </div>
                                        <textarea id="sg-pos-text" readonly></textarea>
                                    </div>

                                    <div class="sg-prompt-card">
                                        <div class="sg-prompt-header">
                                            <span>Negative Prompt</span>
                                            <button id="sg-copy-neg" class="sg-btn-copy">Copy</button>
                                        </div>
                                        <textarea id="sg-neg-text" readonly></textarea>
                                    </div>

                                    <div class="sg-action-bar">
                                        <button id="sg-load-workflow" class="sg-btn-action primary">🚀 Load Workflow (New Tab)</button>
                                        <a id="sg-download-btn" class="sg-btn-action secondary" download>💾 Download</a>
                                        <button id="sg-single-delete-btn" class="sg-btn-action danger">🗑️ Delete</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                const grid = el.querySelector("#sg-grid");
                const pageInfo = el.querySelector("#sg-page-info");
                const modal = el.querySelector("#sg-modal");
                const batchBar = el.querySelector("#sg-batch-bar");
                const selectedCountLabel = el.querySelector("#sg-selected-count");

                const updateBatchBar = () => {
                    selectedCountLabel.textContent = `${selectedFiles.size} selected`;
                };

                const loadFiles = async () => {
                    grid.innerHTML = "<div class='sg-loading'>Loading...</div>";
                    const res = await fetch(`/smart_gallery/files?type=${currentType}&filter=${currentFilter}&model=${currentModel}&favorites=${isFavOnly}&sort=${currentSort}&page=${currentPage}&limit=20`);
                    const data = await res.json();
                    
                    grid.innerHTML = "";
                    currentFileList = data.files;
                    pageInfo.textContent = `${data.current_page} / ${data.total_pages}`;
                    
                    data.files.forEach((file, index) => {
                        const card = document.createElement("div");
                        card.className = "sg-card";
                        
                        const fileUrl = `/view?filename=${encodeURIComponent(file.rel_path)}&type=${file.type}`;
                        const mainTag = file.tags[0] || "OTHER";
                        const isChecked = selectedFiles.has(file.rel_path);

                        card.innerHTML = `
                            <div class="sg-thumb-wrapper">
                                ${isSelectMode ? `<input type="checkbox" class="sg-select-check" ${isChecked ? "checked" : ""} />` : ""}
                                <button class="sg-card-fav ${file.is_fav ? 'active' : ''}">${file.is_fav ? '★' : '☆'}</button>
                                <span class="sg-card-pill" style="background:${getPillColor(mainTag)}">${mainTag}</span>
                                ${file.is_video ? 
                                    `<video src="${fileUrl}#t=0.1" preload="metadata" muted></video><div class="sg-play-icon">▶</div>` : 
                                    `<img src="${fileUrl}" loading="lazy" />`
                                }
                                <button class="sg-menu-btn">⋮</button>
                                <div class="sg-dropdown sg-hidden">
                                    <div class="sg-dropdown-item sg-action-open">Open / Details</div>
                                    <div class="sg-dropdown-item sg-action-copy">Copy Path</div>
                                    <a class="sg-dropdown-item" href="${fileUrl}" download="${file.filename}">Download</a>
                                    <div class="sg-dropdown-item sg-action-delete danger-text">Delete File</div>
                                </div>
                            </div>
                            <div class="sg-card-title">${file.filename}</div>
                        `;

                        if (file.is_video) {
                            const video = card.querySelector("video");
                            card.addEventListener("mouseenter", () => video.play());
                            card.addEventListener("mouseleave", () => { video.pause(); video.currentTime = 0; });
                        }

                        // Favorite Star Toggle Click
                        const favBtn = card.querySelector(".sg-card-fav");
                        favBtn.onclick = async (e) => {
                            e.stopPropagation();
                            const r = await fetch("/smart_gallery/toggle_fav", {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ filename: file.rel_path })
                            });
                            const favRes = await r.json();
                            file.is_fav = favRes.is_fav;
                            favBtn.textContent = favRes.is_fav ? '★' : '☆';
                            favBtn.classList.toggle("active", favRes.is_fav);
                        };

                        // Checkbox Select Handler
                        if (isSelectMode) {
                            const check = card.querySelector(".sg-select-check");
                            check.onclick = (e) => {
                                e.stopPropagation();
                                if (check.checked) selectedFiles.add(file.rel_path);
                                else selectedFiles.delete(file.rel_path);
                                updateBatchBar();
                            };
                        }

                        // Open Details Event
                        card.querySelector(".sg-thumb-wrapper").addEventListener("click", (e) => {
                            if (e.target.classList.contains("sg-menu-btn") || e.target.classList.contains("sg-card-fav") || e.target.classList.contains("sg-select-check") || e.target.closest(".sg-dropdown")) return;
                            openDetails(index);
                        });

                        // Menu Titik Tiga Handlers
                        const menuBtn = card.querySelector(".sg-menu-btn");
                        const dropdown = card.querySelector(".sg-dropdown");

                        menuBtn.onclick = (e) => {
                            e.stopPropagation();
                            document.querySelectorAll(".sg-dropdown").forEach(d => { if(d !== dropdown) d.classList.add("sg-hidden"); });
                            dropdown.classList.toggle("sg-hidden");
                        };

                        card.querySelector(".sg-action-open").onclick = (e) => { e.stopPropagation(); dropdown.classList.add("sg-hidden"); openDetails(index); };
                        card.querySelector(".sg-action-copy").onclick = (e) => { e.stopPropagation(); dropdown.classList.add("sg-hidden"); navigator.clipboard.writeText(file.rel_path); };
                        
                        card.querySelector(".sg-action-delete").onclick = async (e) => {
                            e.stopPropagation(); dropdown.classList.add("sg-hidden");
                            if (confirm(`Are you sure you want to delete ${file.filename}?`)) {
                                await fetch("/smart_gallery/delete_files", {
                                    method: "POST", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ filenames: [file.rel_path], type: currentType })
                                });
                                loadFiles();
                            }
                        };

                        grid.appendChild(card);
                    });
                };

                // Header Controls Handlers
                el.querySelector("#sg-tab-out").onclick = (e) => { el.querySelector("#sg-tab-in").classList.remove("active"); e.target.classList.add("active"); currentType = "output"; currentPage = 1; loadFiles(); };
                el.querySelector("#sg-tab-in").onclick = (e) => { el.querySelector("#sg-tab-out").classList.remove("active"); e.target.classList.add("active"); currentType = "input"; currentPage = 1; loadFiles(); };
                
                const favToggleBtn = el.querySelector("#sg-fav-toggle");
                favToggleBtn.onclick = () => {
                    isFavOnly = !isFavOnly;
                    favToggleBtn.textContent = isFavOnly ? '★' : '☆';
                    favToggleBtn.classList.toggle("active-star", isFavOnly);
                    currentPage = 1; loadFiles();
                };

                const selectToggleBtn = el.querySelector("#sg-select-toggle");
                selectToggleBtn.onclick = () => {
                    isSelectMode = !isSelectMode;
                    selectToggleBtn.classList.toggle("active", isSelectMode);
                    batchBar.classList.toggle("sg-hidden", !isSelectMode);
                    if (!isSelectMode) selectedFiles.clear();
                    updateBatchBar();
                    loadFiles();
                };

                el.querySelector("#sg-batch-delete-btn").onclick = async () => {
                    if (selectedFiles.size === 0) return;
                    if (confirm(`Delete ${selectedFiles.size} selected file(s)?`)) {
                        await fetch("/smart_gallery/delete_files", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ filenames: Array.from(selectedFiles), type: currentType })
                        });
                        selectedFiles.clear();
                        updateBatchBar();
                        loadFiles();
                    }
                };

                el.querySelector("#sg-refresh").onclick = () => loadFiles();
                el.querySelector("#sg-filter-type").onchange = (e) => { currentFilter = e.target.value; currentPage = 1; loadFiles(); };
                el.querySelector("#sg-filter-model").onchange = (e) => { currentModel = e.target.value; currentPage = 1; loadFiles(); };
                el.querySelector("#sg-sort").onchange = (e) => { currentSort = e.target.value; currentPage = 1; loadFiles(); };
                el.querySelector("#sg-size-slider").oninput = (e) => grid.style.setProperty("--thumb-size", `${e.target.value}px`);
                el.querySelector("#sg-prev-page").onclick = () => { if (currentPage > 1) { currentPage--; loadFiles(); } };
                el.querySelector("#sg-next-page").onclick = () => { currentPage++; loadFiles(); };

                // Modal Handlers
                el.querySelector("#sg-close-modal").onclick = () => modal.classList.add("sg-hidden");
                el.querySelector("#sg-nav-left").onclick = () => { if (currentDetailIndex > 0) openDetails(currentDetailIndex - 1); };
                el.querySelector("#sg-nav-right").onclick = () => { if (currentDetailIndex < currentFileList.length - 1) openDetails(currentDetailIndex + 1); };

                const openDetails = async (index) => {
                    currentDetailIndex = index;
                    const file = currentFileList[index];
                    const url = `/view?filename=${encodeURIComponent(file.rel_path)}&type=${file.type}`;

                    const res = await fetch(`/smart_gallery/details?filename=${encodeURIComponent(file.rel_path)}&type=${file.type}`);
                    const data = await res.json();

                    const renderArea = el.querySelector("#sg-media-render");
                    if (file.is_video) {
                        renderArea.innerHTML = `<video src="${url}" controls autoplay loop></video>`;
                    } else {
                        renderArea.innerHTML = `<img src="${url}" />`;
                    }

                    // Modal Fav Star Button
                    const modalFavBtn = el.querySelector("#sg-modal-fav-btn");
                    modalFavBtn.textContent = data.is_fav ? '★' : '☆';
                    modalFavBtn.onclick = async () => {
                        const r = await fetch("/smart_gallery/toggle_fav", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ filename: file.rel_path })
                        });
                        const favRes = await r.json();
                        modalFavBtn.textContent = favRes.is_fav ? '★' : '☆';
                        file.is_fav = favRes.is_fav;
                    };

                    el.querySelector("#sg-detail-filename").textContent = file.filename;
                    el.querySelector("#sg-detail-date").textContent = data.mtime;
                    el.querySelector("#sg-detail-size").textContent = `${data.size_mb} MB`;
                    el.querySelector("#sg-detail-model").textContent = data.summary.model;
                    el.querySelector("#sg-detail-loras").textContent = data.summary.loras.join(", ") || "None";
                    
                    const posText = el.querySelector("#sg-pos-text");
                    const negText = el.querySelector("#sg-neg-text");
                    posText.value = data.summary.positive || "No positive prompt metadata";
                    negText.value = data.summary.negative || "No negative prompt metadata";

                    el.querySelector("#sg-copy-pos").onclick = () => navigator.clipboard.writeText(posText.value);
                    el.querySelector("#sg-copy-neg").onclick = () => navigator.clipboard.writeText(negText.value);

                    const dlBtn = el.querySelector("#sg-download-btn");
                    dlBtn.href = url; dlBtn.download = file.filename;

                    el.querySelector("#sg-single-delete-btn").onclick = async () => {
                        if (confirm(`Delete ${file.filename}?`)) {
                            await fetch("/smart_gallery/delete_files", {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ filenames: [file.rel_path], type: currentType })
                            });
                            modal.classList.add("sg-hidden");
                            loadFiles();
                        }
                    };

                    const loadBtn = el.querySelector("#sg-load-workflow");
                    if (data.has_workflow) {
                        loadBtn.disabled = false;
                        loadBtn.onclick = async () => {
                            if (app.graphManager && app.graphManager.addGraph) {
                                const newGraph = app.graphManager.addGraph({ name: file.filename });
                                app.graphManager.setActiveGraph(newGraph);
                            }
                            await app.loadGraphData(data.workflow);
                            modal.classList.add("sg-hidden");
                        };
                    } else {
                        loadBtn.disabled = true;
                    }

                    modal.classList.remove("sg-hidden");
                };

                loadFiles();
            }
        });
    }
});