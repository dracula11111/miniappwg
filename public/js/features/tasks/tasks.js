// /js/features/tasks/tasks.js
// Заглушки: рендерит список тасков как на скрине. Кнопки ничего не делают.

(function () {
    const TASKS = [
      // One-time
      {
        section: "one",
        title: "Subscribe to Wild Gift",
        subtitle: "@wildgift_channel",
        reward: 200,
        icon: "/images/tasks/tg.png",
        iconBg: "#1f86ff",
        button: { type: "start", text: "Start" },
      },
      {
        section: "one",
        title: "Invite friend",
        reward: 250,
        icon: "/images/tasks/invite.png",
        iconBg: "#9b4dff",
        button: { type: "check", text: "Check" },
      },
  
      // Daily
      {
        section: "daily",
        title: "Top up 0.5 TON",
        subtitle: "or equivalent in Stars",
        reward: 300,
        icon: "/images/tasks/ton.png",
        iconBg: "#39b8ff",
        button: { type: "start", text: "Start" },
      },
      {
        section: "daily",
        title: "Lose once in game",
        subtitle: "Wheel / Cases / Crash",
        reward: 150,
        icon: "/images/tasks/game.png",
        iconBg: "#35d06a",
        button: { type: "start", text: "Start" },
      },
    ];
  
    // Функция для определения валюты пользователя
    function getUserCurrency() {
      // Проверяем localStorage
      const storedCurrency = localStorage.getItem('userCurrency');
      if (storedCurrency) {
        return storedCurrency; // 'stars' или 'ton'
      }
      
      // Проверяем глобальный объект (если есть)
      if (window.userProfile && window.userProfile.currency) {
        return window.userProfile.currency;
      }
      
      // По умолчанию Stars
      return 'stars';
    }
  
    function el(tag, className, text) {
      const n = document.createElement(tag);
      if (className) n.className = className;
      if (text !== undefined) n.textContent = text;
      return n;
    }
  
    function renderSectionHeader({ left, rightTimer }) {
      const head = el("div", "tsec");
  
      const leftEl = el("div", "tsec__left", left);
      head.appendChild(leftEl);
  
      if (rightTimer) {
        const right = el("div", "tsec__right");
        const clock = el("span", "tsec__clock", "🕒");
        const time = el("span", "tsec__time", rightTimer);
        right.append(clock, time);
        head.appendChild(right);
      }
  
      return head;
    }
  
    function renderTask(task) {
      const row = el("div", "trow");
      const currency = getUserCurrency();
  
      // icon
      const icon = el("div", "trow__icon");
      icon.style.setProperty("--icon-bg", task.iconBg || "#333");
  
      const img = document.createElement("img");
      img.className = "trow__iconImg";
      img.alt = "";
      img.loading = "lazy";
      img.src = task.icon;
  
      img.onerror = () => {
        img.remove();
        icon.appendChild(el("div", "trow__iconFallback", "✦"));
      };
  
      icon.appendChild(img);
  
      // meta
      const meta = el("div", "trow__meta");
      const title = el("div", "trow__title", task.title);
      meta.appendChild(title);
  
      if (task.subtitle) {
        meta.appendChild(el("div", "trow__sub", task.subtitle));
      }
  
      // reward - с поддержкой двух типов валюты
      const reward = el("div", "trow__reward");
      
      // Добавляем класс в зависимости от валюты
      if (currency === 'ton') {
        reward.classList.add("trow__reward--ton");
      } else {
        reward.classList.add("trow__reward--stars");
      }
      
      // Иконка валюты
      const rewardIcon = document.createElement("img");
      rewardIcon.className = "trow__rewardIcon";
      rewardIcon.alt = "";
      
      if (currency === 'ton') {
        rewardIcon.src = "/icons/tgTonWhite.svg";
      } else {
        rewardIcon.src = "/icons/tgStarsBlack.svg";
      }
      
      // Fallback если картинка не загрузится
      rewardIcon.onerror = () => {
        rewardIcon.remove();
        const fallbackIcon = el("span", "trow__rewardIconFallback", "✦");
        reward.insertBefore(fallbackIcon, reward.firstChild);
      };
      
      reward.appendChild(rewardIcon);
      reward.appendChild(el("span", "trow__rewardNum", String(task.reward)));
      meta.appendChild(reward);
  
      // button
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `tbtn tbtn--${task.button.type}`;
  
      if (task.button.type === "claimed") {
        btn.innerHTML = `${task.button.text} <span class="tbtn__check">✓</span>`;
      } else {
        btn.textContent = task.button.text;
      }
  
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        // заглушка
      });
  
      row.append(icon, meta, btn);
      return row;
    }
  
    function groupBySection(tasks) {
      const one = [];
      const daily = [];
      tasks.forEach((t) => (t.section === "daily" ? daily : one).push(t));
      return { one, daily };
    }
  
    function init() {
      const tasksPage = document.querySelector("#tasksPage");
      if (!tasksPage) return;
  
      const card = tasksPage.querySelector(".tasks-card");
      if (!card) return;
  
      // Перерисовываем содержимое карточки (заменяем твои sample task-row)
      card.innerHTML = "";
      card.classList.add("tasks-card--new");
  
      const { one, daily } = groupBySection(TASKS);
  
      // Рендерим One-time задания без заголовка секции
      one.forEach((t) => card.appendChild(renderTask(t)));
  
      card.appendChild(
        renderSectionHeader({
          left: `Daily · ${daily.length}`,
          rightTimer: "06:49:05", // заглушка
        })
      );
      daily.forEach((t) => card.appendChild(renderTask(t)));
    }
  
    document.addEventListener("DOMContentLoaded", init);
  })();