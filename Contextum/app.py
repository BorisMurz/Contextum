import os
import datetime
import logging
from flask import Flask, render_template, request, jsonify
import requests
import openai
from httpx import Client  # ✅ Фикс proxies ошибки

app = Flask(__name__)

# Папка для txt файлов
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data", "generated_files")
os.makedirs(DATA_DIR, exist_ok=True)

# Логирование
logging.basicConfig(
    filename=os.path.join(BASE_DIR, "app.log"),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s: %(message)s"
)

VK_URL = "https://api.vk.com/method/wall.get"
VK_VERSION = "5.199"

def latest_txt_file() -> str | None:
    """Возвращает имя самого свежего txt-файла в DATA_DIR или None."""
    try:
        files = [
            f for f in os.listdir(DATA_DIR)
            if f.lower().endswith(".txt") and os.path.isfile(os.path.join(DATA_DIR, f))
        ]
        if not files:
            return None
        files.sort(key=lambda x: os.path.getmtime(os.path.join(DATA_DIR, x)), reverse=True)
        return files[0]
    except:
        return None

@app.route("/")
def index():
    current_file = latest_txt_file()
    return render_template("index.html", current_file=current_file)

@app.route("/api/get_vk_data", methods=["POST"])
def get_vk_data():
    payload = request.get_json(force=True)
    access_token = payload.get("access_token", "").strip()
    domain = payload.get("domain", "").strip()
    count = int(payload.get("count", 0))

    if not all([access_token, domain, count]):
        return jsonify({"ok": False, "status": 400, "message": "Missing required fields"}), 400

    logging.info(f"VK request: domain={domain}, count={count}")

    params = {
        "access_token": access_token,
        "v": VK_VERSION,
        "domain": domain,
        "count": min(count, 100)
    }

    try:
        resp = requests.get(VK_URL, params=params, timeout=15)
        
        if resp.status_code != 200:
            return jsonify({
                "ok": False,
                "status": resp.status_code,
                "message": f"VK API error: {resp.status_code}"
            }), 500

        data = resp.json()
        if "response" not in data or not data["response"].get("items"):
            return jsonify({
                "ok": False,
                "status": 500,
                "message": "Invalid VK response"
            }), 500

        items = data["response"]["items"]
        now_str = datetime.datetime.now().strftime("%d%m%Y_%H%M%S")
        filename = f"{domain}_{now_str}.txt"
        filepath = os.path.join(DATA_DIR, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            for idx, post in enumerate(items, 1):
                post_date_ts = post.get("date")
                date_str = datetime.datetime.fromtimestamp(post_date_ts).strftime("%d.%m.%Y") if post_date_ts else "[translate:Неизвестная дата]"
                f.write(f"Пост №{idx} от {date_str}\n\n")
                
                text = (post.get("text") or "").strip()
                if text:
                    f.write(text + "\n\n")
                
                attachments = post.get("attachments", [])
                for att in attachments:
                    if att.get("type") == "photo":
                        photo = att["photo"]
                        sizes = photo.get("sizes", [])
                        if sizes:
                            max_size = max(sizes, key=lambda s: s.get("width", 0) * s.get("height", 0))
                            url = max_size.get("url")
                            if url:
                                f.write(f"[Фото] {url}\n")
                
                f.write("\n" + "="*50 + "\n\n")

        logging.info(f"VK data saved: {filename}")
        return jsonify({"ok": True, "status": 200, "filename": filename})

    except Exception as e:
        logging.exception("VK error")
        return jsonify({"ok": False, "status": 500, "message": str(e)}), 500

@app.route("/api/start_dialog", methods=["POST"])
def start_dialog():
    return _ollama_chat("start", request)

@app.route("/api/chat", methods=["POST"])
def chat():
    return _ollama_chat("chat", request)

def _ollama_chat(mode, request_obj):
    payload = request_obj.get_json(force=True)
    role = payload.get("role", "").strip()
    temperature = float(payload.get("temperature", 0.5))
    filename = payload.get("filename") or latest_txt_file()
    user_message = payload.get("message", "").strip() if mode == "chat" else None

    if not filename or not os.path.isfile(os.path.join(DATA_DIR, filename)):
        return jsonify({"ok": False, "status": 404, "message": "No TXT file"}), 404

    try:
        with open(os.path.join(DATA_DIR, filename), "r", encoding="utf-8") as f:
            context = f.read()[:6000]
    except:
        return jsonify({"ok": False, "status": 500, "message": "Cannot read TXT file"}), 500

    prompt = f"Анализируй данные профессионально. Системная роль: {role}\n\nКонтекст постов VK:\n{context}\n\n"
    if mode == "start":
        prompt += f"Приветствуй пользователя как {role}"
    else:
        prompt += f"Анализируй данные профессионально. Вопрос пользователя: {user_message}\n\nОтветь как {role}"

    ollama_payload = {
        "model": "qwen2.5:3b",
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": 1024,  # ✅ Увеличено с 512 → 1024 токенов
            "num_ctx": 4096,      # ✅ Контекстное окно
            "repeat_penalty": 1.1 # ✅ Избежание повторов
        }
    }

    try:
        response = requests.post(
            "http://localhost:11434/api/generate",
            json=ollama_payload,
            headers={"Content-Type": "application/json"},
            timeout=180  # ✅ Увеличен таймаут для длинных ответов
        )

        if response.status_code != 200:
            return jsonify({
                "ok": False,
                "status": response.status_code,
                "message": f"Ollama error: {response.text[:100]}"
            }), 500

        result = response.json()
        answer = result.get("response", "[translate:No response]").strip()

        return jsonify({
            "ok": True,
            "status": 200,
            "answer": answer,
            "filename": filename,
            "tokens": result.get("prompt_eval_count", 0) + result.get("eval_count", 0)
        })

    except requests.exceptions.ConnectionError:
        return jsonify({
            "ok": False,
            "status": 503,
            "message": "Ollama not running. Run 'ollama serve'"
        }), 503
    except Exception as e:
        logging.exception("Ollama error")
        return jsonify({"ok": False, "status": 500, "message": str(e)}), 500

@app.route("/api/ygpt_chat", methods=["POST"])
def ygpt_chat():
    payload = request.get_json(force=True)
    api_key = payload.get("api_key", "").strip()
    folder_id = payload.get("folder_id", "").strip()
    user_message = payload.get("message", "").strip()
    temperature = float(payload.get("temperature", 0.5))
    role = payload.get("role", "").strip()  # ✅ Новая системная роль

    if not all([api_key, folder_id, user_message]):
        return jsonify({"ok": False, "status": 400, "message": "Missing required fields"}), 400

    filename = latest_txt_file()
    if not filename or not os.path.isfile(os.path.join(DATA_DIR, filename)):
        return jsonify({"ok": False, "status": 404, "message": "No TXT file"}), 404

    try:
        with open(os.path.join(DATA_DIR, filename), "r", encoding="utf-8") as f:
            vk_context = f.read()[:3000]
    except:
        return jsonify({"ok": False, "status": 500, "message": "Cannot read TXT file"}), 500

    # ✅ Системная роль из фронта + VK контекст
    sys_prompt = f"{role}\n\n" if role else ""
    sys_prompt += f"""Контекст постов VK:
{vk_context}

Анализируй данные профессионально"""

    try:
        client = Client(
            base_url="https://llm.api.cloud.yandex.net/v1",
            headers={"Authorization": f"Api-Key {api_key}"},
            timeout=30.0
        )
        
        response = client.post("/chat/completions", json={
            "model": f"gpt://{folder_id}/yandexgpt-lite",
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_message},
            ],
            "temperature": temperature,  # ✅ Температура из фронта
            "max_tokens": 1024,
        })
        
        client.close()
        result = response.json()
        answer = result["choices"][0]["message"]["content"].strip()
        
        logging.info(f"YandexGPT success: {len(answer)} chars, role={bool(role)}, temp={temperature}")
        
        return jsonify({
            "ok": True,
            "status": 200,
            "answer": answer,
            "filename": filename
        })
        
    except Exception as e:
        logging.exception("YandexGPT error")
        return jsonify({"ok": False, "status": 500, "message": str(e)}), 500

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
