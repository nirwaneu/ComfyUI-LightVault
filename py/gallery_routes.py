import os
import json
import time
from aiohttp import web
from server import PromptServer
import folder_paths

from .metadata_parser import parse_png_metadata, extract_summary_from_prompt

NODE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAGS_FILE = os.path.join(NODE_DIR, "model_tags.json")
CUSTOM_TAGS_FILE = os.path.join(NODE_DIR, "custom_file_tags.json")
FAVORITES_FILE = os.path.join(NODE_DIR, "favorites.json")

def load_json_file(fpath):
    if os.path.exists(fpath):
        try:
            with open(fpath, 'r') as f:
                return json.load(f)
        except: pass
    return {} if "tags" in fpath else []

def save_json_file(fpath, data):
    try:
        with open(fpath, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[LightVault] Error saving JSON: {e}")

@PromptServer.instance.routes.get("/smart_gallery/files")
async def get_gallery_files(request):
    folder_type = request.rel_url.query.get("type", "output")
    file_filter = request.rel_url.query.get("filter", "all")
    model_filter = request.rel_url.query.get("model", "all").upper()
    fav_only = request.rel_url.query.get("favorites", "false") == "true"
    sort_by = request.rel_url.query.get("sort", "newest")
    page = int(request.rel_url.query.get("page", 1))
    limit = int(request.rel_url.query.get("limit", 20))
    
    target_dir = folder_paths.get_output_directory() if folder_type == "output" else folder_paths.get_input_directory()
    
    if not os.path.exists(target_dir):
        return web.json_response({"files": [], "total_pages": 1, "page": 1})
        
    tags_config = load_json_file(TAGS_FILE)
    custom_file_tags = load_json_file(CUSTOM_TAGS_FILE)
    favorites_list = load_json_file(FAVORITES_FILE)
    
    valid_img_exts = ('.png', '.jpg', '.jpeg', '.webp')
    valid_vid_exts = ('.mp4', '.webm', '.mkv')
    all_files = []

    # Deep Scanning Subfolders via os.walk
    for root, dirs, files in os.walk(target_dir):
        for fname in files:
            ext = os.path.splitext(fname)[1].lower()
            is_img = ext in valid_img_exts
            is_vid = ext in valid_vid_exts
            
            if not (is_img or is_vid):
                continue
                
            if file_filter == "images" and not is_img:
                continue
            if file_filter == "videos" and not is_vid:
                continue
                
            fpath = os.path.join(root, fname)
            rel_path = os.path.relpath(fpath, target_dir).replace("\\", "/")
            
            # Check Favorites Filter
            is_fav = rel_path in favorites_list or fname in favorites_list
            if fav_only and not is_fav:
                continue

            mtime = os.path.getmtime(fpath)
            size = os.path.getsize(fpath)
            
            file_tags = custom_file_tags.get(rel_path, custom_file_tags.get(fname, []))
            if not file_tags:
                fname_lower = fname.lower()
                for tag, keywords in tags_config.items():
                    if any(kw.lower() in fname_lower for kw in keywords):
                        file_tags.append(tag)
                        break
                if not file_tags:
                    file_tags.append("OTHER")
                    
            if model_filter != "ALL" and model_filter not in [t.upper() for t in file_tags]:
                continue
            
            all_files.append({
                "filename": fname,
                "rel_path": rel_path,
                "type": folder_type,
                "is_video": is_vid,
                "mtime": mtime,
                "size": size,
                "ext": ext,
                "tags": file_tags,
                "is_fav": is_fav
            })
        
    if sort_by == "newest":
        all_files.sort(key=lambda x: x["mtime"], reverse=True)
    elif sort_by == "oldest":
        all_files.sort(key=lambda x: x["mtime"], reverse=False)
    elif sort_by == "name":
        all_files.sort(key=lambda x: x["filename"].lower())
    
    total_files = len(all_files)
    total_pages = max(1, (total_files + limit - 1) // limit)
    start_idx = (page - 1) * limit
    paginated_files = all_files[start_idx:start_idx + limit]
    
    return web.json_response({
        "files": paginated_files,
        "total_pages": total_pages,
        "current_page": page,
        "total_files": total_files
    })

@PromptServer.instance.routes.get("/smart_gallery/details")
async def get_file_details(request):
    rel_path = request.rel_url.query.get("filename", "")
    folder_type = request.rel_url.query.get("type", "output")
    
    target_dir = folder_paths.get_output_directory() if folder_type == "output" else folder_paths.get_input_directory()
    fpath = os.path.join(target_dir, rel_path)
    
    if not os.path.exists(fpath):
        return web.json_response({"error": "File not found"}, status=404)
        
    tags_config = load_json_file(TAGS_FILE)
    custom_file_tags = load_json_file(CUSTOM_TAGS_FILE)
    favorites_list = load_json_file(FAVORITES_FILE)
    
    prompt_data, workflow_data = parse_png_metadata(fpath)
    summary = extract_summary_from_prompt(prompt_data, tags_config)
    
    tags = custom_file_tags.get(rel_path, custom_file_tags.get(os.path.basename(rel_path), []))
    if not tags:
        if summary["detected_tag"] != "OTHER":
            tags.append(summary["detected_tag"])
        else:
            fname_lower = rel_path.lower()
            for tag, keywords in tags_config.items():
                if any(kw.lower() in fname_lower for kw in keywords):
                    tags.append(tag)
                    break
            if not tags:
                tags.append("OTHER")

    return web.json_response({
        "filename": os.path.basename(rel_path),
        "rel_path": rel_path,
        "has_workflow": workflow_data is not None or prompt_data is not None,
        "workflow": workflow_data or prompt_data,
        "summary": summary,
        "tags": tags,
        "is_fav": rel_path in favorites_list or os.path.basename(rel_path) in favorites_list,
        "mtime": time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(os.path.getmtime(fpath))),
        "size_mb": round(os.path.getsize(fpath) / (1024 * 1024), 2)
    })

@PromptServer.instance.routes.post("/smart_gallery/toggle_fav")
async def toggle_fav(request):
    data = await request.json()
    rel_path = data.get("filename")
    favorites_list = load_json_file(FAVORITES_FILE)
    
    if rel_path in favorites_list:
        favorites_list.remove(rel_path)
        is_fav = False
    else:
        favorites_list.append(rel_path)
        is_fav = True
        
    save_json_file(FAVORITES_FILE, favorites_list)
    return web.json_response({"status": "success", "is_fav": is_fav})

@PromptServer.instance.routes.post("/smart_gallery/delete_files")
async def delete_files(request):
    data = await request.json()
    rel_paths = data.get("filenames", [])
    folder_type = data.get("type", "output")
    target_dir = folder_paths.get_output_directory() if folder_type == "output" else folder_paths.get_input_directory()
    
    deleted_count = 0
    for rel_path in rel_paths:
        fpath = os.path.join(target_dir, rel_path)
        if os.path.exists(fpath):
            try:
                os.remove(fpath)
                deleted_count += 1
            except Exception as e:
                print(f"[LightVault] Delete error on {fpath}: {e}")
                
    return web.json_response({"status": "success", "deleted_count": deleted_count})