const svgNamespace = "http://www.w3.org/2000/svg";
const cookiePath = new URL(".", window.location.href).pathname;
const maxCookieLength = 3500;
const weekInSeconds = 7 * 24 * 60 * 60;

export function byId(id) {
  return document.getElementById(id);
}

export function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function icon(name) {
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(svgNamespace, "use");
  use.setAttribute("href", "assets/icons.svg#" + name);
  svg.append(use);
  return svg;
}

export function showStatus(element, message = "", kind = "") {
  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle("status--restored", kind === "restored");
  element.classList.toggle("status--error", kind === "error");
}

export function showCount(element, text) {
  element.textContent = text;
  element.hidden = false;
}

export function normalizeText(text) {
  return String(text ?? "").trim().toLocaleLowerCase("ru").replace(/ё/g, "е");
}

export function matchesQuery(query, ...fields) {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  const text = normalizeText(fields.join(" "));
  return words.every(word => text.includes(word));
}

export function readCookie(name) {
  const prefix = name + "=";
  const cookie = document.cookie.split(";").map(part => part.trim())
    .find(part => part.startsWith(prefix));
  if (!cookie) return null;

  try {
    const bytes = Uint8Array.from(atob(cookie.slice(prefix.length)), char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function writeCookie(name, data) {
  const json = JSON.stringify(data);
  // Base64 хранит кириллицу компактнее процентного кодирования.
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > maxCookieLength * 0.75) return false;
  const value = btoa(String.fromCharCode(...bytes));
  if (value.length > maxCookieLength) return false;

  document.cookie = name + "=" + value + "; Max-Age=" + weekInSeconds
    + "; Path=" + cookiePath + "; SameSite=Lax";
  return true;
}

export function clearCookie(name) {
  document.cookie = name + "=; Max-Age=0; Path=" + cookiePath + "; SameSite=Lax";
}

export function saveSearch(name, filters, items, total, page = 1) {
  const snapshot = { ...filters, items: items.slice(), total, page };
  while (!writeCookie(name, snapshot)) {
    if (!snapshot.items.length) {
      clearCookie(name);
      return;
    }
    snapshot.items.pop();
  }
}

export function restoreSearch(name, form) {
  const saved = readCookie(name);
  if (!saved || typeof saved.query !== "string" || !Array.isArray(saved.items)
      || !Number.isInteger(saved.total) || saved.total < saved.items.length) {
    return null;
  }
  if (!Array.from(form.elements.sort.options).some(option => option.value === saved.sort)) {
    return null;
  }
  if (saved.items.some(item => !item || typeof item.id !== "string")) return null;

  form.elements.query.value = saved.query;
  form.elements.sort.value = saved.sort;
  return saved;
}

export function searchFilters(form) {
  return { query: form.elements.query.value.trim(), sort: form.elements.sort.value };
}

export function bindSearch(form, search) {
  let timer;
  const submit = () => {
    clearTimeout(timer);
    search(searchFilters(form));
  };
  form.addEventListener("submit", event => {
    event.preventDefault();
    submit();
  });
  form.elements.sort.addEventListener("change", submit);
  form.elements.query.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(submit, 280);
  });
}

export function formatNewsDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value + "T12:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}
