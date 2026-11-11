import { loadResults } from "./api.js";
import { bindSearch, byId, node, restoreSearch, saveSearch, searchFilters, showCount, showStatus } from "./shared.js";

const cookieName = "lab6_nicknames";
const pageSize = 10;

class NicknameSearch {
  constructor() {
    this.form = byId("nickname-form");
    this.list = byId("nickname-list");
    this.more = byId("load-more");
    this.footer = byId("nickname-footer");
    this.status = byId("nickname-status");
    this.count = byId("nickname-count");
    this.selection = byId("nickname-selected");
    this.items = [];
    this.total = 0;
    this.selectedId = null;
    this.request = null;

    bindSearch(this.form, filters => this.load(filters));
    this.more.addEventListener("click", () => this.load(this.filters, true));
    this.list.addEventListener("click", event => {
      const button = event.target.closest("[data-nickname]");
      if (button) this.select(button.dataset.nickname);
    });

    const saved = restoreSearch(cookieName, this.form);
    this.filters = searchFilters(this.form);
    if (saved) {
      this.items = saved.items;
      this.total = saved.total;
      this.appendRows(saved.items, true, 0);
      this.renderSummary();
      showStatus(this.status, "Результаты последнего поиска восстановлены из cookies.", "restored");
    } else {
      this.load(this.filters);
    }
  }

  async load(filters, append = false) {
    this.request?.abort();
    const controller = new AbortController();
    this.request = controller;
    this.more.disabled = true;
    this.list.setAttribute("aria-busy", "true");
    showStatus(this.status, append ? "Дозагружаем никнеймы…" : "Загружаем никнеймы…");

    const offset = append ? this.items.length : 0;
    try {
      const result = await loadResults("nickname", filters, offset, pageSize, controller.signal);
      if (controller.signal.aborted) return;
      if (!append) {
        this.items = [];
        this.selectedId = null;
        this.selection.hidden = true;
        this.list.replaceChildren();
      }
      this.filters = filters;
      this.items.push(...result.items);
      this.total = result.total;
      this.appendRows(result.items, false, offset);
      this.renderSummary();
      saveSearch(cookieName, this.filters, this.items, this.total);
      const cachedRows = this.list.querySelector(".from-cookie");
      showStatus(this.status, cachedRows ? "Зелёным отмечены результаты из cookies." : "", cachedRows ? "restored" : "");
    } catch (error) {
      if (error.name !== "AbortError") showStatus(this.status, error.message, "error");
    } finally {
      if (this.request === controller) {
        this.request = null;
        this.more.disabled = false;
        this.list.setAttribute("aria-busy", "false");
      }
    }
  }

  appendRows(items, restored, offset) {
    const rows = items.map((item, index) => {
      const row = node("li", "nickname-row");
      if (restored) row.classList.add("from-cookie");
      const initials = String(item.name).split(/\s+/).slice(0, 2)
        .map(part => part.charAt(0).toLocaleUpperCase("ru")).join("");
      const avatar = node("span", "avatar", initials);
      avatar.dataset.tone = String((index + offset) % 4);
      avatar.setAttribute("aria-hidden", "true");

      const info = node("div", "nickname-info");
      info.append(node("p", "nickname-name", item.name));
      if (item.category) info.append(node("p", "nickname-category", item.category));
      const button = node("button", "button button--outline button--small", "Выбрать");
      button.type = "button";
      button.dataset.nickname = item.id;
      button.setAttribute("aria-label", "Выбрать " + item.name);
      button.setAttribute("aria-pressed", "false");
      row.append(avatar, info, button);
      return row;
    });
    this.list.append(...rows);
  }

  renderSummary() {
    showCount(this.count, "Показано " + this.items.length + " из " + this.total);
    this.footer.hidden = this.items.length >= this.total;
    if (!this.items.length) {
      this.list.replaceChildren(node("li", "empty-state", "Ничего не найдено. Попробуй другие слова."));
    }
  }

  select(id) {
    const item = this.items.find(entry => entry.id === id);
    if (!item) return;
    this.selectedId = item.id;
    this.selection.hidden = false;
    this.selection.textContent = "Выбран никнейм " + item.name;
    for (const button of this.list.querySelectorAll("[data-nickname]")) {
      const selected = button.dataset.nickname === this.selectedId;
      button.setAttribute("aria-pressed", String(selected));
      button.textContent = selected ? "Выбран" : "Выбрать";
      button.closest("li").classList.toggle("nickname-row--selected", selected);
    }
  }
}

new NicknameSearch();
