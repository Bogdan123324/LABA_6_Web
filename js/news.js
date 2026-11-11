import { loadNewsArticle, loadResults } from "./api.js";
import {
  bindSearch, byId, formatNewsDate, icon, node, restoreSearch,
  saveSearch, searchFilters, showCount, showStatus
} from "./shared.js";

const cookieName = "lab6_news";
const pageSize = 5;

function fillArticleMeta(element, article) {
  element.replaceChildren();
  if (article.category) element.append(node("span", "tag", article.category));
  if (article.date) {
    const date = node("time", "", formatNewsDate(article.date));
    if (/^\d{4}-\d{2}-\d{2}$/.test(article.date)) date.dateTime = article.date;
    element.append(date);
  }
}

class NewsPage {
  constructor() {
    this.form = byId("news-form");
    this.list = byId("news-list");
    this.status = byId("news-status");
    this.count = byId("news-count");
    this.pagination = byId("news-pagination");
    this.dialog = byId("news-dialog");
    this.articleTitle = byId("article-title");
    this.articleMeta = byId("article-meta");
    this.articleStatus = byId("article-status");
    this.articleBody = byId("article-body");
    this.page = 1;
    this.items = [];
    this.total = 0;
    this.request = null;
    this.detailRequest = null;

    bindSearch(this.form, filters => this.loadPage(filters, 1));
    this.pagination.addEventListener("click", event => {
      const button = event.target.closest("[data-page]");
      if (button) this.loadPage(this.filters, Number(button.dataset.page));
    });
    this.list.addEventListener("click", event => {
      const button = event.target.closest("[data-article]");
      if (button) this.openArticle(button.dataset.article);
    });
    this.dialog.addEventListener("close", () => {
      this.detailRequest?.abort();
      this.detailRequest = null;
    });

    const saved = restoreSearch(cookieName, this.form);
    this.filters = searchFilters(this.form);
    if (saved) {
      this.items = saved.items.slice(0, pageSize);
      this.total = saved.total;
      if (Number.isInteger(saved.page) && saved.page >= 1) {
        this.page = Math.min(saved.page, this.lastPage);
      }
      this.renderArticles(true);
      this.renderPagination();
      showStatus(this.status, "Результаты последнего поиска восстановлены из cookies.", "restored");
    }
    this.loadPage(this.filters, this.page, Boolean(saved));
  }

  get lastPage() {
    return Math.max(1, Math.ceil(this.total / pageSize));
  }

  async loadPage(filters, page, keepCached = false) {
    this.request?.abort();
    const controller = new AbortController();
    this.request = controller;
    this.list.setAttribute("aria-busy", "true");
    if (!keepCached) showStatus(this.status, "Загружаем новости…");

    try {
      let result = await loadResults("news", filters, (page - 1) * pageSize, pageSize, controller.signal);
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
      if (page > lastPage) {
        page = lastPage;
        result = await loadResults("news", filters, (page - 1) * pageSize, pageSize, controller.signal);
      }
      if (controller.signal.aborted) return;

      const matchesCache = keepCached && JSON.stringify(this.items) === JSON.stringify(result.items);
      this.items = result.items;
      this.total = result.total;
      this.filters = filters;
      this.page = page;
      if (!matchesCache) {
        this.renderArticles(false);
        showStatus(this.status);
      }
      this.renderPagination();
      saveSearch(cookieName, this.filters, this.items, this.total, this.page);
    } catch (error) {
      if (error.name === "AbortError") return;
      const message = keepCached ? "Показаны результаты из cookies. " + error.message : error.message;
      showStatus(this.status, message, "error");
    } finally {
      if (this.request === controller) {
        this.request = null;
        this.list.setAttribute("aria-busy", "false");
      }
    }
  }

  renderArticles(restored) {
    if (!this.items.length) {
      this.list.replaceChildren(node("p", "empty-state", "Подходящих новостей нет. Попробуй другие слова."));
      return;
    }

    const cards = this.items.map(article => {
      const card = node("article", restored ? "news-card from-cookie" : "news-card");
      const meta = node("div", "article-meta");
      fillArticleMeta(meta, article);
      const button = node("button", "button button--outline button--small", "Прочитать больше");
      button.type = "button";
      button.dataset.article = article.id;
      button.setAttribute("aria-label", "Прочитать больше — " + article.title);
      button.append(icon("right"));
      card.append(meta, node("h3", "", article.title), node("p", "news-summary", article.summary), button);
      return card;
    });
    this.list.replaceChildren(...cards);
  }

  renderPagination() {
    showCount(this.count, "Найдено " + this.total + " · Стр. " + this.page + " из " + this.lastPage);
    this.pagination.hidden = this.lastPage === 1;
    this.pagination.replaceChildren();
    if (this.lastPage === 1) return;

    const pageButton = (page, text, label, disabled = false) => {
      const button = node("button", "button button--outline", text);
      button.type = "button";
      button.dataset.page = String(page);
      button.setAttribute("aria-label", label);
      button.disabled = disabled;
      return button;
    };

    this.pagination.append(pageButton(this.page - 1, "‹", "Предыдущая страница", this.page === 1));
    const start = Math.max(1, Math.min(this.page - 2, this.lastPage - 4));
    const end = Math.min(start + 4, this.lastPage);
    for (let page = start; page <= end; page++) {
      const button = pageButton(page, page, "Страница " + page, page === this.page);
      if (page === this.page) button.setAttribute("aria-current", "page");
      this.pagination.append(button);
    }
    this.pagination.append(pageButton(this.page + 1, "›", "Следующая страница", this.page === this.lastPage));
  }

  async openArticle(id) {
    const preview = this.items.find(article => article.id === id);
    if (!preview) return;
    this.detailRequest?.abort();
    const controller = new AbortController();
    this.detailRequest = controller;

    this.articleTitle.textContent = preview.title;
    fillArticleMeta(this.articleMeta, preview);
    this.articleBody.replaceChildren();
    showStatus(this.articleStatus, "Загружаем полный текст…");
    this.dialog.showModal();

    try {
      const article = await loadNewsArticle(id, controller.signal);
      if (controller.signal.aborted) return;
      this.articleTitle.textContent = article.title;
      fillArticleMeta(this.articleMeta, article);
      const paragraphs = (article.text || article.summary).split(/\r?\n\s*\r?\n/).filter(Boolean);
      this.articleBody.replaceChildren(...paragraphs.map(text => node("p", "", text)));
      showStatus(this.articleStatus);
    } catch (error) {
      if (error.name !== "AbortError") showStatus(this.articleStatus, error.message, "error");
    }
  }
}

new NewsPage();
