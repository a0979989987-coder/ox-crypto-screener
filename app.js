const state = {
  symbol: "ETHUSDT",
  timeframe: "15m",
  tier: "T3",
  theme: "dark",
  btcScore: 67,
  altScore: 82,
  alertHigh: false,
  alertLow: false,
};

const symbolMockData = {
  BTCUSDT: {
    label: "BTC",
    price: 116420.32,
    change: 1.82,
    volume: "7.8B",
  },
  ETHUSDT: {
    label: "ETH",
    price: 2628.08,
    change: 5.60,
    volume: "2.5B",
  },
};

const rankingData = {
  T1: [
    { symbol: "BTC", score: 58, volume: "7.8B", change: 1.82 },
    { symbol: "ETH", score: 62, volume: "2.5B", change: 5.60 },
    { symbol: "SOL", score: 64, volume: "1.2B", change: 8.42 },
  ],
  T2: [
    { symbol: "SUI", score: 67, volume: "462M", change: 12.40 },
    { symbol: "WIF", score: 65, volume: "228M", change: 6.23 },
    { symbol: "ENA", score: 63, volume: "310M", change: 4.81 },
  ],
  T3: [
    { symbol: "AR", score: 71, volume: "12M", change: 37.95 },
    { symbol: "KR200", score: 66, volume: "5.17M", change: -0.51 },
    { symbol: "G", score: 71, volume: "92.55M", change: 18.89 },
    { symbol: "AKE", score: 82, volume: "65M", change: 151.89 },
    { symbol: "STRK", score: 69, volume: "16.23M", change: 32.86 },
  ],
};

const candlesData = [
  [12,33,"g"],[18,27,"r"],[14,36,"g"],[10,24,"r"],[18,56,"g"],
  [28,68,"g"],[35,74,"g"],[42,80,"g"],[50,83,"g"],[59,88,"g"],
  [71,91,"g"],[68,86,"r"],[63,81,"r"],[57,78,"g"],[60,82,"g"],
  [51,74,"r"],[46,69,"r"],[48,73,"g"],[54,76,"g"],[50,72,"r"],
  [55,78,"g"],[59,80,"g"],[54,75,"r"],[58,78,"g"],[56,77,"r"],
  [57,79,"g"],
];

function formatPrice(value) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getStrengthText(score) {
  if (score < 25) return "弱";
  if (score < 50) return "偏弱";
  if (score < 75) return "中強";
  return "強";
}

function scoreToRotation(score) {
  return -90 + (Math.max(0, Math.min(100, score)) / 100) * 180;
}

function renderCandles() {
  const wrap = document.getElementById("candles");
  wrap.innerHTML = "";

  candlesData.forEach((item, index) => {
    const [low, high, direction] = item;
    const candle = document.createElement("span");
    candle.className = `candle ${direction}`;

    const bottom = (index < 5 ? 15 : 22) + Math.sin(index * 0.7) * 7;
    const wickHeight = Math.max(15, high - low);
    const bodyHeight = Math.max(10, (high - low) * 0.48);

    candle.innerHTML = `
      <i style="bottom:${bottom}%;height:${wickHeight}%"></i>
      <b style="bottom:${bottom + 7}%;height:${bodyHeight}%"></b>
    `;

    wrap.appendChild(candle);
  });
}

function renderMarket() {
  const data = symbolMockData[state.symbol];
  const changeNode = document.getElementById("marketChange");

  document.getElementById("marketSymbol").textContent =
    `${state.symbol} · Bitget 永續`;

  document.getElementById("marketPrice").textContent =
    formatPrice(data.price);

  document.getElementById("chartPrice").textContent =
    formatPrice(data.price);

  document.getElementById("chartTitle").textContent =
    `${state.symbol} 永續合約`;

  document.getElementById("marketVolume").textContent =
    data.volume;

  changeNode.textContent =
    `${data.change >= 0 ? "+" : ""}${data.change.toFixed(2)}%`;

  changeNode.classList.toggle("up", data.change >= 0);
  changeNode.classList.toggle("down", data.change < 0);
}

function renderTimeframeLevels() {
  const tf = state.timeframe;

  document.getElementById("currentTimeframe").textContent = tf;

  const highLabel = document.getElementById("highLabel");
  const lowLabel = document.getElementById("lowLabel");
  const highBtn = document.getElementById("highAlertBtn");
  const lowBtn = document.getElementById("lowAlertBtn");

  if (["1m", "5m", "15m"].includes(tf)) {
    highLabel.textContent = "4H 前高 2,667.24　🔔";
    lowLabel.textContent = "1D 前低 2,512.60　🔔";

    highBtn.textContent = "🔔 4H 前高";
    lowBtn.textContent = "🔔 1D 前低";
    return;
  }

  highLabel.textContent = `${tf} 前高 2,667.24　🔔`;
  lowLabel.textContent = `${tf} 前低 2,512.60　🔔`;

  highBtn.textContent = `🔔 ${tf} 前高`;
  lowBtn.textContent = `🔔 ${tf} 前低`;
}

function renderRanking() {
  const list = document.getElementById("rankingList");
  const rows = rankingData[state.tier];

  list.innerHTML = rows.map((item, index) => `
    <div class="coin">
      <div class="coin-top">
        <span>#${index + 1}</span>
        <span class="coin-name">${item.symbol}</span>
        <span class="score">OX ${item.score}</span>
      </div>

      <div class="coin-meta">
        <span>24H ${item.volume} USDT</span>
        <span class="coin-change ${item.change >= 0 ? "up" : "down"}">
          ${item.change >= 0 ? "+" : ""}${item.change.toFixed(2)}%
        </span>
      </div>
    </div>
  `).join("");
}

function renderGauge(score, needleId, scoreId, labelId) {
  document.getElementById(scoreId).textContent = score;
  document.getElementById(labelId).textContent = getStrengthText(score);

  document.getElementById(needleId).style.transform =
    `translateX(-50%) rotate(${scoreToRotation(score)}deg)`;
}

function renderStrength() {
  renderGauge(
    state.btcScore,
    "btcNeedle",
    "btcScore",
    "btcStrengthText"
  );

  renderGauge(
    state.altScore,
    "altNeedle",
    "altScore",
    "altStrengthText"
  );
}

function switchPage(pageName) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.add("hidden");
  });

  document.getElementById(`page-${pageName}`).classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageName
    );
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setTheme(theme) {
  state.theme = theme;

  document.querySelectorAll(".theme-row button").forEach((button) => {
    button.classList.remove("active");
  });

  if (theme === "light") {
    document.documentElement.dataset.theme = "light";
    document.getElementById("lightThemeBtn").classList.add("active");
  } else {
    document.documentElement.dataset.theme = "dark";
    document.getElementById("darkThemeBtn").classList.add("active");
  }

  localStorage.setItem("ox-theme", theme);
}

function toggleAlert(type) {
  if (type === "high") {
    state.alertHigh = !state.alertHigh;
    document
      .getElementById("highAlertBtn")
      .classList.toggle("active", state.alertHigh);
  }

  if (type === "low") {
    state.alertLow = !state.alertLow;
    document
      .getElementById("lowAlertBtn")
      .classList.toggle("active", state.alertLow);
  }
}

async function toggleFullscreen() {
  const chartCard = document.getElementById("chartCard");

  try {
    if (!document.fullscreenElement) {
      await chartCard.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }

    // 實際接 Lightweight Charts / TradingView Lightweight Charts 時，
    // 在 fullscreenchange 後呼叫 chart.resize(width, height)。
  } catch (error) {
    console.error("Fullscreen failed:", error);
  }
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => {
      switchPage(button.dataset.page);
    });
  });

  document.querySelectorAll(".tf").forEach((button) => {
    button.addEventListener("click", () => {
      state.timeframe = button.dataset.tf;

      document.querySelectorAll(".tf").forEach((node) => {
        node.classList.remove("active");
      });

      button.classList.add("active");
      renderTimeframeLevels();
    });
  });

  document.querySelectorAll(".symbol-pill").forEach((button) => {
    button.addEventListener("click", () => {
      state.symbol = button.dataset.symbol;

      document.querySelectorAll(".symbol-pill").forEach((node) => {
        node.classList.remove("active");
      });

      button.classList.add("active");
      renderMarket();
    });
  });

  document.querySelectorAll(".rank-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      state.tier = button.dataset.tier;

      document.querySelectorAll(".rank-tabs button").forEach((node) => {
        node.classList.remove("active");
      });

      button.classList.add("active");
      renderRanking();
    });
  });

  document.querySelectorAll(".switch").forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.toggle("on");
    });
  });

  document.getElementById("highAlertBtn").addEventListener("click", () => {
    toggleAlert("high");
  });

  document.getElementById("lowAlertBtn").addEventListener("click", () => {
    toggleAlert("low");
  });

  document.getElementById("fullscreenBtn").addEventListener(
    "click",
    toggleFullscreen
  );

  document.getElementById("darkThemeBtn").addEventListener("click", () => {
    setTheme("dark");
  });

  document.getElementById("lightThemeBtn").addEventListener("click", () => {
    setTheme("light");
  });

  document.getElementById("systemThemeBtn").addEventListener("click", () => {
    const prefersLight =
      window.matchMedia("(prefers-color-scheme: light)").matches;

    setTheme(prefersLight ? "light" : "dark");

    document.querySelectorAll(".theme-row button").forEach((button) => {
      button.classList.remove("active");
    });

    document.getElementById("systemThemeBtn").classList.add("active");
  });

  document.getElementById("restartScanBtn").addEventListener("click", () => {
    const status = document.getElementById("scanStatus");

    status.textContent = "重新啟動中...";

    setTimeout(() => {
      status.textContent = "輪巡 0/600";
    }, 600);
  });

  // 為之後真正圖表 resize 保留
  window.addEventListener("resize", () => {
    requestAnimationFrame(() => {
      // chart.resize(...)
    });
  });

  window.addEventListener("orientationchange", () => {
    setTimeout(() => {
      // chart.resize(...)
    }, 250);
  });

  document.addEventListener("fullscreenchange", () => {
    setTimeout(() => {
      // chart.resize(...)
    }, 120);
  });
}

function init() {
  const savedTheme = localStorage.getItem("ox-theme");

  if (savedTheme === "light") {
    setTheme("light");
  } else {
    setTheme("dark");
  }

  renderCandles();
  renderMarket();
  renderTimeframeLevels();
  renderRanking();
  renderStrength();
  bindEvents();
}

init();
