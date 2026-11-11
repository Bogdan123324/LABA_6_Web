import { matchesQuery, normalizeText } from "./shared.js";

const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });

function postAjax(type, parameters, signal) {
  const url = new URL("ajax.php", document.baseURI);
  url.searchParams.set("type", type);
  const body = new URLSearchParams({ type, ...parameters });

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const abortError = () => new DOMException("Запрос отменён.", "AbortError");
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    request.open("POST", url);
    request.responseType = "json";
    request.timeout = 10000;
    request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
    request.onload = () => {
      const response = request.response;
      if (request.status < 200 || request.status >= 300 || response?.error) {
        reject(new Error(response?.error || "Сервер вернул ошибку " + request.status + "."));
      } else if (response === null) {
        reject(new Error("Сервер вернул данные в неверном формате."));
      } else {
        resolve(response);
      }
    };
    request.onerror = () => reject(new Error("Не удалось связаться с сервером. Проверь, что Apache запущен."));
    request.ontimeout = () => reject(new Error("Сервер отвечает слишком долго. Повтори запрос."));
    request.onabort = () => reject(abortError());
    request.onloadend = () => signal?.removeEventListener("abort", abort);
    signal?.addEventListener("abort", abort, { once: true });
    request.send(body.toString());
  });
}

function recordsFrom(response, type) {
  const records = Array.isArray(response)
    ? response
    : response?.items ?? response?.data ?? response?.[type] ?? response?.[type + "s"];
  if (!Array.isArray(records)) {
    throw new Error("Ожидался массив записей из ajax.php.");
  }
  return records;
}

function shortText(value, limit) {
  const text = String(value ?? "").trim();
  return text.length <= limit ? text : text.slice(0, limit - 1).trimEnd() + "…";
}

// Здесь сопоставляются имена полей из файла преподавателя и интерфейса.
function nicknameRecord(value, index) {
  const entry = typeof value === "string" ? { nickname: value } : (value ?? {});
  return {
    id: String(entry.id ?? index + 1),
    name: shortText(entry.nickname ?? entry.nick ?? entry.name ?? entry.login, 100),
    category: shortText(entry.category ?? entry.group, 50)
  };
}

function newsRecord(value, index) {
  const entry = value ?? {};
  const text = String(entry.text ?? entry.fullText ?? entry.full_text ?? entry.content ?? entry.body
    ?? entry.description ?? entry.summary ?? "").trim();
  return {
    id: String(entry.id ?? index + 1),
    title: shortText(entry.title ?? entry.name ?? entry.heading, 150),
    category: shortText(entry.category, 45),
    date: shortText(entry.date ?? entry.published_at, 40),
    summary: shortText(entry.summary ?? entry.preview ?? entry.short_text ?? entry.description ?? text, 190),
    text
  };
}

function compareRecords(first, second, sort) {
  const field = sort.startsWith("date-") ? "date" : "title";
  const firstValue = field === "date" ? first.date : (first.title ?? first.name);
  const secondValue = field === "date" ? second.date : (second.title ?? second.name);
  const order = sort.endsWith("-desc") ? -1 : 1;
  const result = collator.compare(normalizeText(firstValue), normalizeText(secondValue));
  return result * order || collator.compare(first.id, second.id);
}

function previewOf(record) {
  const { text, ...preview } = record;
  return preview;
}

export async function loadResults(type, filters, offset, limit, signal) {
  const payload = await postAjax(type, {
    action: "list",
    q: filters.query,
    sort: filters.sort,
    offset
  }, signal);
  const isNews = type === "news";
  const normalize = isNews ? newsRecord : nicknameRecord;
  const records = recordsFrom(payload, type).map(normalize)
    .filter(record => isNews ? record.title : record.name);

  if (Array.isArray(payload.items) && Number.isInteger(payload.total)) {
    return { items: records.map(previewOf), total: payload.total };
  }

  // Исходный ajax.php может вернуть весь массив по ключу type.
  const matching = records.filter(record => matchesQuery(
    filters.query, record.name, record.title, record.category, record.summary, record.text
  ));
  matching.sort((a, b) => compareRecords(a, b, filters.sort));
  return { items: matching.slice(offset, offset + limit).map(previewOf), total: matching.length };
}

export async function loadNewsArticle(id, signal) {
  const payload = await postAjax("news", { action: "detail", id }, signal);
  const article = payload.item
    ? newsRecord(payload.item, 0)
    : recordsFrom(payload, "news").map(newsRecord).find(record => record.id === id);
  if (!article?.title) throw new Error("Новость не найдена.");
  return article;
}
