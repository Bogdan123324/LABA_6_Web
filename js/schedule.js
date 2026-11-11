import { byId, clearCookie, icon, matchesQuery, node, readCookie, showCount, showStatus, writeCookie } from "./shared.js";

const cookieName = "lab6_schedule";
const weekdays = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const dayMilliseconds = 24 * 60 * 60 * 1000;

function academicWeek(date, settings) {
  // Расчёт по календарным датам исключает погрешность при смене часового пояса.
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const startOfYear = year => {
    const start = new Date(Date.UTC(year, settings.month - 1, settings.day));
    const daysFromMonday = (start.getUTCDay() + 6) % 7;
    return start.getTime() - daysFromMonday * dayMilliseconds;
  };

  let start = startOfYear(date.getFullYear());
  if (today < start) start = startOfYear(date.getFullYear() - 1);
  const number = Math.floor((today - start) / (7 * dayMilliseconds)) + 1;
  const upper = (number % 2 === 1) === (settings.firstWeek === "upper");
  return { number, type: upper ? "upper" : "lower" };
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось загрузить " + path + ".");
  return response.json();
}

function option(value, label) {
  const item = node("option", "", label);
  item.value = value;
  return item;
}

function chooseOption(select, value, fallback) {
  const valid = Array.from(select.options).some(item => item.value === value);
  select.value = valid ? value : fallback;
}

function classroom(value) {
  if (!value) return "Уточняется";
  return /^\d/.test(value) ? "Ауд. " + value : value;
}

class SchedulePage {
  constructor() {
    this.form = byId("schedule-form");
    this.query = byId("schedule-query");
    this.course = byId("schedule-course");
    this.group = byId("schedule-group");
    this.day = byId("schedule-day");
    this.list = byId("schedule-list");
    this.heading = byId("schedule-heading");
    this.status = byId("schedule-status");
    this.count = byId("schedule-count");
    this.init();
  }

  async init() {
    showStatus(this.status, "Загружаем расписание…");
    try {
      const [schedule, bells] = await Promise.all([
        fetchJson("data/schedule.json"),
        fetchJson("data/bells.json")
      ]);
      this.groups = new Map(schedule.groups.map(group => [group.id, group]));
      this.bells = new Map(bells.map(bell => [bell.slot, bell]));
      this.lessons = schedule.lessons;

      const today = new Date();
      this.todayDay = today.getDay() || 7;
      this.week = academicWeek(today, schedule.academicYear);
      this.renderDate(today);

      const courses = [...new Set(schedule.groups.map(group => group.course))].sort((a, b) => a - b);
      this.course.append(...courses.map(course => option(String(course), course + " курс")));
      this.day.options[0].textContent = "Сегодня · " + weekdays[this.todayDay - 1];
      this.day.append(...weekdays.map((label, index) => option(String(index + 1), label)));

      const group = this.groups.get(schedule.defaultGroup);
      this.defaults = { query: "", course: group ? String(group.course) : "all", group: group?.id ?? "all", day: "today" };
      const saved = readCookie(cookieName);
      this.applyFilters({ ...this.defaults, ...saved });
      if (saved) {
        for (const field of this.form.querySelectorAll(".field")) field.classList.add("field--restored");
      }

      for (const control of this.form.elements) control.disabled = false;
      this.bindFilters();
      this.render();
    } catch (error) {
      showStatus(this.status, "Расписание не загрузилось. Проверь файлы в папке data.", "error");
    }
  }

  renderDate(date) {
    const time = byId("today-date");
    time.textContent = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    time.dateTime = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
    byId("week-parity").textContent = this.week.type === "upper" ? "Верхняя неделя" : "Нижняя неделя";
    byId("week-number").textContent = this.week.number + "-я учебная неделя";
    byId("week-card").hidden = false;
  }

  bindFilters() {
    this.form.addEventListener("submit", event => event.preventDefault());
    this.query.addEventListener("input", () => this.filterChanged(this.query));
    this.form.addEventListener("change", event => {
      if (event.target === this.query) return;
      if (event.target === this.course) {
        const previous = this.group.value;
        this.fillGroups(previous);
        if (previous !== this.group.value) this.group.closest(".field").classList.remove("field--restored");
      }
      this.filterChanged(event.target);
    });
    this.form.addEventListener("reset", event => {
      event.preventDefault();
      clearCookie(cookieName);
      this.applyFilters(this.defaults);
      for (const field of this.form.querySelectorAll(".field--restored")) field.classList.remove("field--restored");
      this.render();
    });
  }

  applyFilters(filters) {
    this.query.value = typeof filters.query === "string" ? filters.query : "";
    chooseOption(this.course, filters.course, "all");
    this.fillGroups(filters.group);
    chooseOption(this.day, filters.day, "today");
  }

  fillGroups(selected) {
    const groups = [...this.groups.values()].filter(group =>
      this.course.value === "all" || String(group.course) === this.course.value
    );
    this.group.replaceChildren(option("all", "Все группы"), ...groups.map(group => option(group.id, group.label)));
    chooseOption(this.group, selected, "all");
  }

  readFilters() {
    return {
      query: this.query.value.trim(),
      course: this.course.value,
      group: this.group.value,
      day: this.day.value
    };
  }

  filterChanged(control) {
    control.closest(".field").classList.remove("field--restored");
    writeCookie(cookieName, this.readFilters());
    this.render();
  }

  render() {
    const filters = this.readFilters();
    const day = filters.day === "today" ? this.todayDay : Number(filters.day);
    const lessons = this.lessons.filter(lesson => {
      const group = this.groups.get(lesson.group);
      return group && lesson.day === day && (lesson.week === "all" || lesson.week === this.week.type)
        && (filters.course === "all" || String(group.course) === filters.course)
        && (filters.group === "all" || group.id === filters.group)
        && matchesQuery(filters.query, lesson.subject);
    }).sort((a, b) => a.slot - b.slot || a.group.localeCompare(b.group, "ru"));

    this.heading.textContent = (filters.day === "today" ? "Сегодня · " : "") + weekdays[day - 1];
    showCount(this.count, "Занятий " + lessons.length);
    const restored = this.form.querySelector(".field--restored");
    showStatus(this.status, restored ? "Зелёным отмечены фильтры, восстановленные из cookies." : "", restored ? "restored" : "");

    const rows = lessons.map(lesson => this.lessonRow(lesson));
    this.list.replaceChildren(...(rows.length ? rows : [node("p", "empty-state", "На этот день по выбранным фильтрам занятий нет.")]));
  }

  lessonRow(lesson) {
    const group = this.groups.get(lesson.group);
    const bell = this.bells.get(lesson.slot);
    const details = node("details", "lesson");
    const summary = node("summary");
    const clock = node("span", "lesson-clock", bell ? bell.start + "–" + bell.end : "Уточняется");
    clock.append(node("small", "", lesson.slot + "-я пара"));

    const main = node("span");
    const meta = node("span", "lesson-meta");
    meta.append(node("span", "tag", lesson.kind), node("span", "", group.label));
    main.append(node("span", "lesson-subject", lesson.subject), meta);

    const room = node("span", "lesson-room");
    room.append(icon("pin"), node("span", "", classroom(lesson.room)));
    const chevron = icon("down");
    chevron.classList.add("lesson-chevron");
    summary.append(clock, main, room, chevron);

    const body = node("div", "lesson-details");
    const facts = node("dl");
    const fields = [
      ["Преподаватель", lesson.teacher || "Уточняется"],
      ["Аудитория", classroom(lesson.room)],
      ["Группа и курс", group.label + " · " + group.course + " курс"]
    ];
    for (const [label, value] of fields) {
      const fact = node("div");
      fact.append(node("dt", "", label), node("dd", "", value));
      facts.append(fact);
    }
    body.append(facts);
    if (lesson.topic) body.append(node("p", "lesson-topic", lesson.topic));
    details.append(summary, body);
    return details;
  }
}

new SchedulePage();
