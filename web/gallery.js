import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "Comfy.SmartGallery",
    async setup() {
        // Build CSS dynamically or load from CSS file
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = new URL("./gallery.css", import.meta.url).href;
        document.head.appendChild(link);

        // State
        let currentPage = 1;
        let currentType = "output";
        let currentFilter = "all";
        let thumbSize = 120;

        // Register Tab in Sidebar
        app.extensionManager?.registerSidebarTab?.({
            id: "smart-gallery",
            icon: "pi pi-images",
            title: "Smart Gallery",
            tooltip: "Smart Gallery Output/Input",
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
                            <div class="sg-controls">
                                <select id="sg-filter-type">
                                    <option value="all">All</option>
                                    <option value="images">Images</option>
                                    <option value="videos">Videos</option>
                                </select>
                                <input type="range" id="sg-size-slider" min="80" max="250" value="${thumbSize}">
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
                            <button id="sg-close-modal" class="sg-close">&times;</button>
                            <div class="sg-modal-body">
                                <div id="sg-preview-container" class="sg-preview-box"></div>
                                <div class="sg-details-box">
                                    <h3 id="sg-detail-filename">File Details</h3>
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
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                // Bind Events
                const grid = el.querySelector("#sg-grid");
                const slider = el.querySelector("#sg-size-slider");
                const pageInfo = el.querySelector("#sg-page-info");

                const loadFiles = async () => {
                    grid.innerHTML = "<div class='sg-loading'>Loading...</div>";
                    const res = await fetch(`/smart_gallery/files?type=${currentType}&filter=${currentFilter}&page=${currentPage}&limit=20`);
                    const data = await res.json();
                    
                    grid.innerHTML = "";
                    pageInfo.textContent = `${data.current_page} / ${data.total_pages}`;
                    
                    data.files.forEach(file => {
                        const card = document.createElement("div");
                        card.className = "sg-card";
                        
                        const fileUrl = `/view?filename=${encodeURIComponent(file.filename)}&type=${file.type}`;
                        
                        if (file.is_video) {
                            card.innerHTML = `
                                <div class="sg-thumb-wrapper">
                                    <video src="${fileUrl}#t=0.1" preload="metadata" muted></video>
                                    <div class="sg-play-icon">▶</div>
                                </div>
                                <div class="sg-card-title">${file.filename}</div>
                            `;
                            const video = card.querySelector("video");
                            card.addEventListener("mouseenter", () => video.play());
                            card.addEventListener("mouseleave", () => { video.pause(); video.currentTime = 0; });
                        } else {
                            card.innerHTML = `
                                <div class="sg-thumb-wrapper">
                                    <img src="${fileUrl}" loading="lazy" />
                                </div>
                                <div class="sg-card-title">${file.filename}</div>
                            `;
                        }

                        // Open Details Modal on Click
                        card.addEventListener("click", () => openDetails(file.filename, file.type, fileUrl, file.is_video));
                        grid.appendChild(card);
                    });
                };

                // Event Listeners
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
                el.querySelector("#sg-filter-type").onchange = (e) => {
                    currentFilter = e.target.value; currentPage = 1; loadFiles();
                };
                slider.oninput = (e) => {
                    grid.style.setProperty("--thumb-size", `${e.target.value}px`);
                };
                el.querySelector("#sg-prev-page").onclick = () => {
                    if (currentPage > 1) { currentPage--; loadFiles(); }
                };
                el.querySelector("#sg-next-page").onclick = () => {
                    currentPage++; loadFiles();
                };

                // Details Modal Handler
                const modal = el.querySelector("#sg-modal");
                el.querySelector("#sg-close-modal").onclick = () => modal.classList.add("sg-hidden");

                const openDetails = async (filename, type, url, isVideo) => {
                    const res = await fetch(`/smart_gallery/details?filename=${encodeURIComponent(filename)}&type=${type}`);
                    const data = await res.json();

                    const previewBox = el.querySelector("#sg-preview-container");
                    if (isVideo) {
                        previewBox.innerHTML = `<video src="${url}" controls autoplay loop></video>`;
                    } else {
                        previewBox.innerHTML = `<img src="${url}" />`;
                    }

                    el.querySelector("#sg-detail-filename").textContent = filename;
                    el.querySelector("#sg-detail-date").textContent = data.mtime;
                    el.querySelector("#sg-detail-size").textContent = data.size_mb;
                    el.querySelector("#sg-detail-model").textContent = data.summary.model;
                    el.querySelector("#sg-detail-loras").textContent = data.summary.loras.join(", ") || "None";
                    el.querySelector("#sg-pos-text").value = data.summary.positive || "No positive prompt metadata";
                    el.querySelector("#sg-neg-text").value = data.summary.negative || "No negative prompt metadata";

                    const loadBtn = el.querySelector("#sg-load-workflow");
                    if (data.has_workflow) {
                        loadBtn.disabled = false;
                        loadBtn.onclick = async () => {
                            // Load to NEW TAB (GraphManager API)
                            if (app.graphManager && app.graphManager.addGraph) {
                                const newGraph = app.graphManager.addGraph({ name: filename });
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

                // Initial Load
                loadFiles();
            }
        });
    }
});