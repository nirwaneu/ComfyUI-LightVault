import json
import os
import struct

def parse_png_metadata(file_path):
    prompt_data = None
    workflow_data = None
    
    try:
        with open(file_path, 'rb') as f:
            # Check PNG Signature
            if f.read(8) != b'\x89PNG\r\n\x1a\n':
                return None, None
            
            while True:
                chunk_len_bytes = f.read(4)
                if not chunk_len_bytes or len(chunk_len_bytes) < 4:
                    break
                chunk_len = struct.unpack('>I', chunk_len_bytes)[0]
                chunk_type = f.read(4).decode('ascii', errors='ignore')
                chunk_data = f.read(chunk_len)
                f.read(4)  # Skip CRC
                
                if chunk_type == 'tEXt':
                    parts = chunk_data.split(b'\x00', 1)
                    if len(parts) == 2:
                        key = parts[0].decode('utf-8', errors='ignore')
                        val = parts[1].decode('utf-8', errors='ignore')
                        if key == 'prompt':
                            try: prompt_data = json.loads(val)
                            except: pass
                        elif key == 'workflow':
                            try: workflow_data = json.loads(val)
                            except: pass
                elif chunk_type == 'IEND':
                    break
    except Exception as e:
        print(f"[SmartGallery] Error parsing PNG: {e}")
        
    return prompt_data, workflow_data

def extract_summary_from_prompt(prompt_json, tags_config):
    if not prompt_json or not isinstance(prompt_json, dict):
        return {"positive": "", "negative": "", "model": "Unknown", "loras": [], "detected_tag": "OTHER"}
    
    positive = ""
    negative = ""
    model_name = ""
    loras = []
    
    for node_id, node in prompt_json.items():
        class_type = node.get("class_type", "")
        inputs = node.get("inputs", {})
        
        # Checkpoint Model
        if "CheckpointLoader" in class_type or "UNETLoader" in class_type:
            if "ckpt_name" in inputs:
                model_name = str(inputs["ckpt_name"])
            elif "unet_name" in inputs:
                model_name = str(inputs["unet_name"])
                
        # Prompts
        if class_type in ["CLIPTextEncode", "BNK_CLIPTextEncodeAdvanced"]:
            text = inputs.get("text", "")
            if isinstance(text, str) and text.strip():
                if "negative" in str(node_id).lower() or "neg" in str(node_id).lower():
                    negative += text + "\n"
                else:
                    positive += text + "\n"
                    
        # LoRAs
        if "LoraLoader" in class_type:
            lora_name = inputs.get("lora_name", "")
            strength = inputs.get("strength_model", 1.0)
            if lora_name:
                loras.append(f"{lora_name} ({strength})")

    # Detect Tag Keyword
    detected_tag = "OTHER"
    model_lower = model_name.lower()
    for tag, keywords in tags_config.items():
        if any(kw.lower() in model_lower for kw in keywords):
            detected_tag = tag
            break
            
    return {
        "positive": positive.strip(),
        "negative": negative.strip(),
        "model": model_name or "N/A",
        "loras": loras,
        "detected_tag": detected_tag
    }