chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (message.type === "download-url") {
    chrome.downloads.download(
      {
        url: message.url,
        filename: message.filename || undefined,
        saveAs: Boolean(message.saveAs)
      },
      (downloadId) => {
        const error = chrome.runtime.lastError;
        sendResponse({
          ok: !error,
          downloadId,
          error: error ? error.message : undefined
        });
      }
    );
    return true;
  }

  if (message.type === "translate-prompts") {
    translatePrompts(message.lines)
      .then((lines) => sendResponse({ ok: true, lines }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "翻译失败" }));
    return true;
  }

  return false;
});

async function translatePrompts(lines) {
  const items = Array.isArray(lines) ? lines : [];
  const output = [];
  for (const line of items) {
    const text = String(line || "");
    if (!text.trim()) {
      output.push(text);
      continue;
    }
    output.push(await translateLine(text));
  }
  return output;
}

async function translateLine(text) {
  const chunks = splitForTranslation(text);
  if (chunks.length > 1) {
    const translated = [];
    for (const chunk of chunks) {
      translated.push(await translateLine(chunk));
    }
    return translated.join(" ");
  }
  const params = new URLSearchParams({
    q: text,
    langpair: "zh-CN|en"
  });
  const response = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`);
  if (!response.ok) throw new Error(`翻译接口不可用：${response.status}`);
  const data = await response.json();
  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error("翻译接口没有返回结果");
  return String(translated).trim();
}

function splitForTranslation(text) {
  const maxBytes = 460;
  if (new TextEncoder().encode(text).length <= maxBytes) return [text];
  const parts = String(text)
    .split(/([。！？；;，,])/)
    .reduce((items, part, index, source) => {
      if (index % 2 === 0) items.push(`${part}${source[index + 1] || ""}`.trim());
      return items;
    }, [])
    .filter(Boolean);
  const chunks = [];
  let current = "";
  for (const part of parts.length ? parts : [text]) {
    const next = [current, part].filter(Boolean).join(" ");
    if (new TextEncoder().encode(next).length <= maxBytes) {
      current = next;
    } else {
      if (current) chunks.push(current);
      current = part;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
