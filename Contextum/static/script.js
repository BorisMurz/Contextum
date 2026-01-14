document.addEventListener("DOMContentLoaded", function() {
  // Элементы
  const tabs = {
    get: document.getElementById("tab-get"),
    analysis: document.getElementById("tab-analysis"),
    ygpt: document.getElementById("tab-ygpt")
  };
  const contents = {
    get: document.getElementById("tab-get-content"),
    analysis: document.getElementById("tab-analysis-content"),
    ygpt: document.getElementById("tab-ygpt-content")
  };

  // VK
  const vk = {
    token: document.getElementById("access_token"),
    domain: document.getElementById("domain"),
    count: document.getElementById("count"),
    btn: document.getElementById("fetch-btn"),
    toggle: document.getElementById("toggle-password")
  };

  // Ollama ✅ ИСПРАВЛЕНО: показываются ВСЕ сообщения пользователя
  const ollama = {
    temp: document.getElementById("temperature"),
    tempVal: document.getElementById("temp-value"),
    role: document.getElementById("role"),
    chat: document.getElementById("chat"),
    msg: document.getElementById("user-msg"),
    btn: document.getElementById("send-btn")
  };

  // YandexGPT
  const ygpt = {
    temp: document.getElementById("ygpt-temperature"),
    tempVal: document.getElementById("ygpt-temp-value"),
    key: document.getElementById("ygpt-api-key"),
    keyToggle: document.getElementById("ygpt-toggle-password"),
    folder: document.getElementById("ygpt-folder-id"),
    role: document.getElementById("ygpt-role"),
    chat: document.getElementById("ygpt-chat"),
    msg: document.getElementById("ygpt-user-msg"),
    btn: document.getElementById("ygpt-send-btn")
  };

  // Modal
  const modal = document.getElementById("modal");
  const modalText = document.getElementById("modal-text");
  const modalClose = document.getElementById("modal-close");

  let currentFile = window.CURRENT_CONTEXT_FILE || "";
  let ollamaDialog = false;
  let ollamaLoader = null;
  let ygptLoader = null;

  // Утилиты
  function showModal(text) {
    modalText.textContent = text;
    modal.classList.remove("hidden");
  }
  modalClose.onclick = () => modal.classList.add("hidden");

  function activateTab(name) {
    Object.keys(tabs).forEach(t => {
      tabs[t]?.classList.remove("active");
      contents[t]?.classList.add("hidden");
    });
    tabs[name]?.classList.add("active");
    contents[name]?.classList.remove("hidden");
  }

  // Вкладки
  Object.keys(tabs).forEach(name => tabs[name]?.addEventListener("click", () => activateTab(name)));

  // VK
  vk.toggle.onclick = () => {
    const type = vk.token.type === "password" ? "text" : "password";
    vk.token.type = type;
    vk.toggle.textContent = type === "password" ? "Показать" : "Скрыть";
  };

  function checkVkBtn() {
    const valid = vk.token.value.trim() && 
                  vk.domain.value.trim() && 
                  parseInt(vk.count.value || 0) >= 1 && 
                  parseInt(vk.count.value || 0) <= 100;
    
    vk.btn.disabled = !valid;
    vk.btn.classList.toggle("bg-cyan-600", valid);
    vk.btn.classList.toggle("bg-slate-700/70", !valid);
    vk.btn.classList.toggle("text-white", valid);
    vk.btn.classList.toggle("text-slate-300", !valid);
  }

  vk.token.oninput = (e) => {
    e.target.value = e.target.value.replace(/[А-Яа-яЁё]/g, "");
    checkVkBtn();
  };
  vk.domain.oninput = (e) => {
    e.target.value = e.target.value.replace(/[^a-zA-Z0-9_-]/g, "");
    checkVkBtn();
  };
  vk.count.oninput = (e) => {
    e.target.value = e.target.value.replace(/\D/g, "");
    checkVkBtn();
  };

  vk.btn.onclick = async () => {
    const data = {
      access_token: vk.token.value.trim(),
      domain: vk.domain.value.trim(),
      count: parseInt(vk.count.value)
    };

    vk.btn.disabled = true;
    vk.btn.textContent = "...";

    try {
      const res = await fetch("/api/get_vk_data", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(data)
      });
      const result = await res.json();

      if (result.ok) {
        currentFile = result.filename;
        activateTab("analysis");
        showModal("✅ Данные получены!");
      } else {
        throw new Error(result.message);
      }
    } catch (e) {
      showModal(`❌ ${e.message}`);
    } finally {
      vk.btn.disabled = false;
      vk.btn.textContent = "Получить данные";
      checkVkBtn();
    }
  };

  // ✅ Универсальная функция для добавления сообщений
  function addOllamaMsg(author, text, tokens = null) {
    const div = document.createElement("div");
    div.className = author === "user" ? "flex justify-end mb-3" : "flex justify-start mb-3";
    
    const bubble = document.createElement("div");
    bubble.className = author === "user" 
      ? "max-w-[85%] rounded-2xl rounded-tr-sm bg-emerald-600 text-white px-4 py-3 text-sm leading-relaxed shadow-lg"
      : "max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-800/90 text-slate-100 px-4 py-3 text-sm leading-relaxed shadow-lg border border-slate-700/50";
    
    bubble.textContent = text;
    div.appendChild(bubble);
    
    // Счетчик слов для bot ответов
    if (author === "bot" && tokens) {
      const tokenBadge = document.createElement("div");
      tokenBadge.className = "text-xs text-slate-400 mt-1 opacity-80 flex items-center gap-1";
      tokenBadge.innerHTML = `💭 ~${Math.round(tokens/4)} слов`;
      div.appendChild(tokenBadge);
    }
    
    ollama.chat.appendChild(div);
    ollama.chat.scrollTop = ollama.chat.scrollHeight;
  }

  // Ollama события
  ollama.temp.oninput = () => ollama.tempVal.textContent = ollama.temp.value;

  function showOllamaLoader() {
    if (ollamaLoader) return;
    ollamaLoader = document.createElement("div");
    ollamaLoader.className = "flex justify-start mb-3";
    const bubble = document.createElement("div");
    bubble.className = "inline-flex items-center space-x-2 rounded-2xl rounded-tl-sm bg-slate-800/90 text-slate-400 px-5 py-3 text-sm animate-pulse shadow-lg border border-slate-700/50";
    bubble.innerHTML = "🤖 Анализирую...";
    ollamaLoader.appendChild(bubble);
    ollama.chat.appendChild(ollamaLoader);
    ollama.chat.scrollTop = ollama.chat.scrollHeight;
  }

  function hideOllamaLoader() {
    if (ollamaLoader?.parentNode) {
      ollamaLoader.parentNode.removeChild(ollamaLoader);
    }
    ollamaLoader = null;
  }

  function checkOllamaBtn() {
    const valid = ollama.role.value.trim() && currentFile;
    ollama.btn.disabled = !valid;
    ollama.btn.classList.toggle("bg-emerald-600", valid);
    ollama.btn.classList.toggle("bg-slate-700/70", !valid);
    ollama.btn.classList.toggle("text-white", valid);
    ollama.btn.classList.toggle("text-slate-300", !valid);
    ollama.btn.textContent = ollamaDialog ? "Отправить" : "Начать диалог";
  }

  ollama.role.oninput = checkOllamaBtn;

  // ✅ КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: обработчик кнопки Ollama
  ollama.btn.onclick = async () => {
    const userMsg = ollama.msg.value.trim();
    if (!userMsg && ollamaDialog) return; // Не отправлять пустые сообщения в диалоге

    const data = {
      role: ollama.role.value.trim(),
      temperature: parseFloat(ollama.temp.value),
      filename: currentFile,
      message: userMsg
    };

    // ✅ Показываем сообщение пользователя ПЕРЕД отправкой
    if (userMsg) {
      addOllamaMsg("user", userMsg);
      ollama.msg.value = "";
    }

    // Обновляем текст кнопки
    if (!ollamaDialog) {
      ollama.btn.textContent = "...";
    }
    
    showOllamaLoader();
    ollama.btn.disabled = true;

    try {
      const endpoint = ollamaDialog ? "/api/chat" : "/api/start_dialog";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      
      const result = await res.json();
      hideOllamaLoader();

      if (result.ok) {
        addOllamaMsg("bot", result.answer, result.tokens);
        ollamaDialog = true;
      } else {
        throw new Error(result.message);
      }
    } catch (e) {
      hideOllamaLoader();
      addOllamaMsg("bot", `❌ ${e.message}`);
    } finally {
      ollama.btn.disabled = false;
      checkOllamaBtn();
    }
  };

  ollama.msg.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ollama.btn.click();
    }
  };

  // YandexGPT (без изменений)
  ygpt.temp.oninput = () => ygpt.tempVal.textContent = ygpt.temp.value;

  ygpt.keyToggle.onclick = () => {
    const type = ygpt.key.type === "password" ? "text" : "password";
    ygpt.key.type = type;
    ygpt.keyToggle.textContent = type === "password" ? "Показать" : "Скрыть";
  };

  function addYgptMsg(author, text) {
    const div = document.createElement("div");
    div.className = author === "user" ? "flex justify-end mb-3" : "flex justify-start mb-3";
    const bubble = document.createElement("div");
    bubble.className = author === "user" 
      ? "max-w-[85%] rounded-2xl rounded-tr-sm bg-emerald-600 text-white px-4 py-3 text-sm leading-relaxed shadow-lg"
      : "max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-800/90 text-slate-100 px-4 py-3 text-sm leading-relaxed shadow-lg border border-slate-700/50";
    bubble.textContent = text;
    div.appendChild(bubble);
    ygpt.chat.appendChild(div);
    ygpt.chat.scrollTop = ygpt.chat.scrollHeight;
  }

  function showYgptLoader() {
    if (ygptLoader) return;
    ygptLoader = document.createElement("div");
    ygptLoader.className = "flex justify-start mb-3";
    const bubble = document.createElement("div");
    bubble.className = "inline-flex items-center space-x-2 rounded-2xl rounded-tl-sm bg-slate-800/90 text-slate-400 px-5 py-3 text-sm animate-pulse shadow-lg border border-slate-700/50";
    bubble.innerHTML = "🤖 Анализирую...";
    ygptLoader.appendChild(bubble);
    ygpt.chat.appendChild(ygptLoader);
    ygpt.chat.scrollTop = ygpt.chat.scrollHeight;
  }

  function hideYgptLoader() {
    if (ygptLoader?.parentNode) {
      ygptLoader.parentNode.removeChild(ygptLoader);
    }
    ygptLoader = null;
  }

  function checkYgptBtn() {
    const valid = ygpt.key.value.trim() && ygpt.folder.value.trim() && currentFile;
    ygpt.btn.disabled = !valid;
    ygpt.btn.classList.toggle("bg-emerald-600", valid);
    ygpt.btn.classList.toggle("bg-slate-700/70", !valid);
    ygpt.btn.classList.toggle("text-white", valid);
    ygpt.btn.classList.toggle("text-slate-300", !valid);
  }

  ygpt.key.oninput = (e) => {
    e.target.value = e.target.value.replace(/[^a-zA-Z0-9_-]/g, "");
    checkYgptBtn();
  };
  ygpt.folder.oninput = (e) => {
    e.target.value = e.target.value.replace(/[^a-zA-Z0-9_-]/g, "");
    checkYgptBtn();
  };
  ygpt.role.oninput = checkYgptBtn;

  ygpt.btn.onclick = async () => {
    const data = {
      api_key: ygpt.key.value.trim(),
      folder_id: ygpt.folder.value.trim(),
      role: ygpt.role.value.trim(),
      message: ygpt.msg.value.trim(),
      temperature: parseFloat(ygpt.temp.value)
    };

    addYgptMsg("user", data.message);
    ygpt.msg.value = "";
    ygpt.btn.disabled = true;
    ygpt.btn.textContent = "…";
    showYgptLoader();

    try {
      const res = await fetch("/api/ygpt_chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = await res.json();

      hideYgptLoader();
      if (result.ok) {
        addYgptMsg("bot", result.answer);
      } else {
        throw new Error(result.message);
      }
    } catch (e) {
      hideYgptLoader();
      addYgptMsg("bot", `❌ ${e.message}`);
    } finally {
      ygpt.btn.disabled = false;
      ygpt.btn.textContent = "Отправить";
      checkYgptBtn();
    }
  };

  ygpt.msg.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ygpt.btn.click();
    }
  };

  // Инициализация
  checkVkBtn();
  checkOllamaBtn();
  checkYgptBtn();
  
  if (window.CURRENT_CONTEXT_FILE) {
    currentFile = window.CURRENT_CONTEXT_FILE;
    checkOllamaBtn();
    checkYgptBtn();
  }
  
  console.log("✅ Контекстум готов!");
});
