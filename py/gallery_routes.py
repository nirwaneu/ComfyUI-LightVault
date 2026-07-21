import os
import json
import time
from aiohttp import web
from server import PromptServer
import folder_paths

from .metadata_parser import parse_png_metadata, extract_summary_from_prompt

NODE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAGS_FILE = os.path.join(NODE_DIR, "model_tags.json")
CACHE_FILE = os.path.join(NODE_DIR, "cache.json")

def load_tags_config():
    if os.path.exists(TAGS_FILE):
        try:
            with open(TAGS_FILE, 'r') as f:
                return json.load(f)
        except: pass
    return {}

@PromptServer.instance.routes.get("/smart_gallery/files")
async def get_gallery_files(request):
    folder_type = request.rel_url.query.get("type", "output")
    file_filter = request.rel_url.query.get("filter", "all") # all, images, videos
    page = int(request.rel_url.query.get("page", 1))
    limit = int(request.rel_url.query.get("limit", 24))
    
    target_dir = folder_paths.get_output_directory() if folder_type == "output" else folder_paths.get_input_directory()
    
    if not os.path.exists(target_dir):
        return web.json_response({"files": [], "total_pages": 1, "page": 1})
        
    tags_config = load_tags_config()
    all_files = []
    
    valid_img_exts = ('.png', '.jpg', '.jpeg', '.webp')
    valid_vid_exts = ('.mp4', '.webm', '.mkv')
    
    for fname in os.listdir(target_dir):
        ext = os.path.splitext(fname)[1].lower()
        is_img = ext in valid_img_exts
        is_vid = ext in valid_vid_exts
        
        if not (is_img or is_vid):
            continue
            
        if file_filter == "images" and not is_img:
            continue
        if file_filter == "videos" and not is_vid:
            continue
            
        fpath = os.path.join(target_dir, fname)
        mtime = os.path.getmtime(fpath)
        size = os.path.getsize(fpath)
        
        all_files.append({
            "filename": fname,
            "type": folder_type,
            "is_video": is_vid,
            "mtime": mtime,
            "size": size,
            "ext": ext
        })
        
    # Sort Newest First
    all_files.sort(key=lambda x: x["mtime"], reverse=True)
    
    # Pagination
    total_files = len(all_files)
    total_pages = max(1, (total_files + limit - 1) // limit)
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_files = all_files[start_idx:end_idx]
    
    return web.json_response({
        "files": paginated_files,
        "total_pages": total_pages,
        "current_page": page,
        "total_files": total_files
    })

@PromptServer.instance.routes.get("/smart_gallery/details")
async def get_file_details(request):
    filename = request.rel_url.query.get("filename", "")
    folder_type = request.rel_url.query.get("type", "output")
    
    target_dir = folder_paths.get_output_directory() if folder_type == "output" else folder_paths.get_input_directory()
    fpath = os.path.join(target_dir, filename)
    
    if not os.path.exists(fpath):
        return web.json_response({"error": "File not found"}, status=404)
        
    tags_config = load_tags_config()
    prompt_data, workflow_data = parse_png_metadata(fpath)
    summary = extract_summary_from_prompt(prompt_data, tags_config)
    
    return web.json_response({
        "filename": filename,
        "has_workflow": workflow_data is not None or prompt_data is not None,
        "workflow": workflow_data or prompt_data,
        "summary": summary,
        "mtime": time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(os.path.getmtime(fpath))),
        "size_mb": round(os.path.getsize(fpath) / (1024 * 1024), 2)
    })