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
        let thumbSize = 120;
        
        let currentFileList = [];
        let currentDetailIndex = -1;

        const getPillColor = (tag) => {
            const colors = {
                "FLUX": "#8b5cf6",
                "WAN": "#06b6d4",
                "KREA": "#f59e0b",
                "ANIMA": "#ec4899",
                "PONY": "#10b981",
                "SDXL": "#3b82f6",
                "OTHER": "#6b7280"
            };
            return colors[tag] || "#3b82f6";
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
                                <button id="sg-refresh" class="sg-btn-icon" title="Refresh/Rescan">🔄</button>
                            </div>
                            <div class="sg-controls-row">
                                <select id="sg-filter-type" title="Media Type">
                                    <option value="all">All Media</option>
                                    <option value="images">Images</option>
                                    <option value="videos">Videos</option>
                                </select>
                                <select id="sg-filter-model" title="Model Tag">
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
                                <select id="sg-sort" title="Sort By">
                                    <option value="newest">Newest First</option>
                                    <option value="oldest">Oldest First</option>
                                    <option value="name">Name A-Z</option>
                                </select>
                                <input type="range" id="sg-size-slider" min="80" max="250" value="${thumbSize}" title="Thumbnail Size">
                            </div>
                        </div>

                        <div id="sg-grid" class="sg-grid" style="--thumb-size: ${thumbSize}px;"></div>

                        <div class="sg-footer">
                            <button id="sg-prev-page" class="sg-btn">◀</button>
                            <span id="sg-page-info">1 / 1</span>
                            <button id="sg-next-page" class="sg-btn">▶</button>
                        </div>
                    </div>
                    
                    <!-- Modal Details View -->
                    <div id="sg-modal" class="sg-modal sg-hidden">
                        <div class="sg-modal-content">
                            <button id="sg-close-modal" class="sg-close-btn">&times;</button>
                            
                            <!-- Prev & Next Overlay Buttons -->
                            <button id="sg-nav-left" class="sg-nav-btn sg-nav-left">◀</button>
                            <button id="sg-nav-right" class="sg-nav-btn sg-nav-right">▶</button>

                            <div class="sg-modal-body">
                                <div id="sg-preview-container" class="sg-preview-box"></div>
                                <div class="sg-details-box">
                                    <div class="sg-title-row">
                                        <h3 id="sg-detail-filename">File Details</h3>
                                        <span id="sg-detail-pill" class="sg-pill">TAG</span>
                                    </div>
                                    <p><strong>Date:</strong> <span id="sg-detail-date"></span></p>
                                    <p><strong>Size:</strong> <span id="sg-detail-size"></span> MB</p>
                                    <p><strong>Model:</strong> <span id="sg-detail-model"></span></p>
                                    <p><strong>LoRAs:</strong> <span id="sg-detail-loras"></span></p>
                                    
                                    <div class="sg-prompt-box">
                                        <div class="sg-prompt-header">
                                            <span>Positive Prompt:</span>
                                            <button id="sg-copy-pos" class="sg-btn-sm">Copy</button>
                                        </div>
                                        <textarea id="sg-pos-text" readonly></textarea>
                                    </div>

                                    <div class="sg-prompt-box">
                                        <div class="sg-prompt-header">
                                            <span>Negative Prompt:</span>
                                            <button id="sg-copy-neg" class="sg-btn-sm">Copy</button>
                                        </div>
                                        <textarea id="sg-neg-text" readonly></textarea>
                                    </div>

                                    <div class="sg-action-buttons">
                                        <button id="sg-load-workflow" class="sg-btn-primary">Load Workflow (New Tab)</button>
                                        <a id="sg-download-btn" class="sg-btn" download>Download File</a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                const grid = el.querySelector("#sg-grid");
                const slider = el.querySelector("#sg-size-slider");
                const pageInfo = el.querySelector("#sg-page-info");
                const modal = el.querySelector("#sg-modal");

                const loadFiles = async () => {
                    grid.innerHTML = "<div class='sg-loading'>Loading...</div>";
                    const res = await fetch(`/smart_gallery/files?type=${currentType}&filter=${currentFilter}&model=${currentModel}&sort=${currentSort}&page=${currentPage}&limit=20`);
                    const data = await res.json();
                    
                    grid.innerHTML = "";
                    currentFileList = data.files;
                    pageInfo.textContent = `${data.current_page} / ${data.total_pages}`;
                    
                    data.files.forEach((file, index) => {
                        const card = document.createElement("div");
                        card.className = "sg-card";
                        
                        const fileUrl = `/view?filename=${encodeURIComponent(file.filename)}&type=${file.type}`;
                        const pillColor = getPillColor(file.tag);

                        card.innerHTML = `
                            <div class="sg-thumb-wrapper">
                                <span class="sg-card-pill" style="background:${pillColor}">${file.tag}</span>
                                ${file.is_video ? 
                                    `<video src="${fileUrl}#t=0.1" preload="metadata" muted></video><div class="sg-play-icon">▶</div>` : 
                                    `<img src="${fileUrl}" loading="lazy" />`
                                }
                                <!-- Menu Titik Tiga (⋮) -->
                                <button class="sg-menu-btn" title="Options">⋮</button>
                                <div class="sg-dropdown sg-hidden">
                                    <div class="sg-dropdown-item sg-action-open">Open / Details</div>
                                    <div class="sg-dropdown-item sg-action-copy">Copy Path</div>
                                    <a class="sg-dropdown-item" href="${fileUrl}" download="${file.filename}">Download</a>
                                </div>
                            </div>
                            <div class="sg-card-title">${file.filename}</div>
                        `;

                        if (file.is_video) {
                            const video = card.querySelector("video");
                            card.addEventListener("mouseenter", () => video.play());
                            card.addEventListener("mouseleave", () => { video.pause(); video.currentTime = 0; });
                        }

                        // Open Details Event
                        card.querySelector(".sg-thumb-wrapper").addEventListener("click", (e) => {
                            if (e.target.classList.contains("sg-menu-btn") || e.target.closest(".sg-dropdown")) return;
                            openDetails(index);
                        });

                        // Menu Titik Tiga Toggle & Events
                        const menuBtn = card.querySelector(".sg-menu-btn");
                        const dropdown = card.querySelector(".sg-dropdown");

                        menuBtn.onclick = (e) => {
                            e.stopPropagation();
                            document.querySelectorAll(".sg-dropdown").forEach(d => { if(d !== dropdown) d.classList.add("sg-hidden"); });
                            dropdown.classList.toggle("sg-hidden");
                        };

                        card.querySelector(".sg-action-open").onclick = (e) => {
                            e.stopPropagation();
                            dropdown.classList.add("sg-hidden");
                            openDetails(index);
                        };

                        card.querySelector(".sg-action-copy").onclick = (e) => {
                            e.stopPropagation();
                            dropdown.classList.add("sg-hidden");
                            navigator.clipboard.writeText(file.filename);
                            alert("Filename copied to clipboard!");
                        };

                        grid.appendChild(card);
                    });
                };

                // Close Dropdown when clicking outside
                document.addEventListener("click", () => {
                    document.querySelectorAll(".sg-dropdown").forEach(d => d.classList.add("sg-hidden"));
                });

                // Filter & Controls Event Handling
                el.querySelector("#sg-tab-out").onclick = (e) => {
                    el.querySelector("#sg-tab-in").classList.remove("active");
                    e.target.classList.add("active");
                    currentType = "output"; currentPage = 1; loadFiles();
                };
                el.querySelector("#sg-tab-in").onclick = (e) => {
                    el.querySelector("#sg-tab-out").classList.remove("active");
                    e.target.classList.add("active");
                    currentType = "input"; currentPage = 1; loadFiles();
                };
                el.querySelector("#sg-refresh").onclick = () => loadFiles();
                el.querySelector("#sg-filter-type").onchange = (e) => { currentFilter = e.target.value; currentPage = 1; loadFiles(); };
                el.querySelector("#sg-filter-model").onchange = (e) => { currentModel = e.target.value; currentPage = 1; loadFiles(); };
                el.querySelector("#sg-sort").onchange = (e) => { currentSort = e.target.value; currentPage = 1; loadFiles(); };
                slider.oninput = (e) => grid.style.setProperty("--thumb-size", `${e.target.value}px`);
                el.querySelector("#sg-prev-page").onclick = () => { if (currentPage > 1) { currentPage--; loadFiles(); } };
                el.querySelector("#sg-next-page").onclick = () => { currentPage++; loadFiles(); };

                // Details Modal Event Handling
                el.querySelector("#sg-close-modal").onclick = () => modal.classList.add("sg-hidden");

                el.querySelector("#sg-nav-left").onclick = () => {
                    if (currentDetailIndex > 0) openDetails(currentDetailIndex - 1);
                };
                el.querySelector("#sg-nav-right").onclick = () => {
                    if (currentDetailIndex < currentFileList.length - 1) openDetails(currentDetailIndex + 1);
                };

                const openDetails = async (index) => {
                    currentDetailIndex = index;
                    const file = currentFileList[index];
                    const url = `/view?filename=${encodeURIComponent(file.filename)}&type=${file.type}`;

                    const res = await fetch(`/smart_gallery/details?filename=${encodeURIComponent(file.filename)}&type=${file.type}`);
                    const data = await res.json();

                    const previewBox = el.querySelector("#sg-preview-container");
                    if (file.is_video) {
                        previewBox.innerHTML = `<video src="${url}" controls autoplay loop></video>`;
                    } else {
                        previewBox.innerHTML = `<img src="${url}" />`;
                    }

                    const tagPill = el.querySelector("#sg-detail-pill");
                    tagPill.textContent = data.summary.detected_tag;
                    tagPill.style.background = getPillColor(data.summary.detected_tag);

                    el.querySelector("#sg-detail-filename").textContent = file.filename;
                    el.querySelector("#sg-detail-date").textContent = data.mtime;
                    el.querySelector("#sg-detail-size").textContent = data.size_mb;
                    el.querySelector("#sg-detail-model").textContent = data.summary.model;
                    el.querySelector("#sg-detail-loras").textContent = data.summary.loras.join(", ") || "None";
                    
                    const posText = el.querySelector("#sg-pos-text");
                    const negText = el.querySelector("#sg-neg-text");
                    posText.value = data.summary.positive || "No positive prompt metadata";
                    negText.value = data.summary.negative || "No negative prompt metadata";

                    // Copy Buttons
                    el.querySelector("#sg-copy-pos").onclick = () => navigator.clipboard.writeText(posText.value);
                    el.querySelector("#sg-copy-neg").onclick = () => navigator.clipboard.writeText(negText.value);

                    // Download Button
                    const dlBtn = el.querySelector("#sg-download-btn");
                    dlBtn.href = url;
                    dlBtn.download = file.filename;

                    // Load Workflow Button
                    const loadBtn = el.querySelector("#sg-load-workflow");
                    if (data.has_workflow) {
                        loadBtn.disabled = false;
                        loadBtn.innerText = "Load Workflow (New Tab)";
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
                        loadBtn.innerText = "No Workflow Available";
                    }

                    modal.classList.remove("sg-hidden");
                };

                loadFiles();
            }
        });
    }
});