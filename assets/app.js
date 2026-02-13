const page = document.body.dataset.page;

const toText = (value) => {
  if (Array.isArray(value)) {
    return value.join("、");
  }
  return value || "";
};

const unique = (items) => Array.from(new Set(items));

const fetchData = async () => {
  const response = await fetch("./mvp_tools.json");
  if (!response.ok) {
    throw new Error("无法读取数据文件");
  }
  return response.json();
};

const buildToolMap = (tools) => {
  const map = new Map();
  tools.forEach((tool) => map.set(tool.slug, tool));
  return map;
};

const renderChips = (items) => {
  if (!items || items.length === 0) {
    return "";
  }
  return items.map((item) => `<span class="chip">${item}</span>`).join("");
};

const setText = (id, value) => {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
};

const setHtml = (id, value) => {
  const el = document.getElementById(id);
  if (el) {
    el.innerHTML = value;
  }
};

const getQuery = () => {
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries(params.entries());
};

const buildSummary = (tool, categoryMap) => {
  if (tool.summary) {
    return tool.summary;
  }
  const categories = (tool.categoryIds || []).map((id) => categoryMap.get(id)).filter(Boolean);
  const tags = tool.tags || [];
  if (categories.length > 0 && tags.length > 0) {
    return `${categories[0]} · ${tags[0]}`;
  }
  if (categories.length > 0) {
    return categories[0];
  }
  if (tags.length > 0) {
    return tags[0];
  }
  if (tool.features && tool.features.length > 0) {
    return tool.features[0];
  }
  return "通用 AI 工具";
};

const renderIndex = (data) => {
  const tools = data.tools || [];
  const categories = data.categories || [];
  const toolsByCategory = new Map(categories.map((c) => [c.id, c.name]));

  const searchInput = document.getElementById("searchInput");
  const categorySelect = document.getElementById("categorySelect");
  const priceSelect = document.getElementById("priceSelect");
  const platformSelect = document.getElementById("platformSelect");
  const sortSelect = document.getElementById("sortSelect");
  const resetBtn = document.getElementById("resetBtn");
  const listContainer = document.getElementById("toolList");
  const countLabel = document.getElementById("countLabel");
  const selectedCount = document.getElementById("selectedCount");
  const compareBtn = document.getElementById("compareBtn");
  const loadMoreContainer = document.getElementById("loadMoreContainer");
  const loadMoreBtn = document.getElementById("loadMoreBtn");

  const priceModels = unique(tools.map((tool) => tool.priceModel).filter(Boolean));
  const platformOptions = unique(tools.flatMap((tool) => tool.platforms || []).filter(Boolean));
  categorySelect.innerHTML = `<option value="">全部分类</option>` + categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  priceSelect.innerHTML = `<option value="">全部价格</option>` + priceModels.map((p) => `<option value="${p}">${p}</option>`).join("");
  platformSelect.innerHTML = `<option value="">全部平台</option>` + platformOptions.map((p) => `<option value="${p}">${p}</option>`).join("");
  sortSelect.innerHTML = `
    <option value="updated_desc">更新时间</option>
    <option value="name_asc">名称 A-Z</option>
    <option value="price_asc">价格模式</option>
  `;

  const selected = new Set();
  const storageKey = "toolFilterState";
  const pageSize = 12;
  let currentPage = 1;

  const applySelectValue = (select, value, fallback = "") => {
    const options = Array.from(select.options).map((option) => option.value);
    select.value = options.includes(value) ? value : fallback;
  };

  const readStoredState = () => {
    const query = getQuery();
    const hasQuery = Object.keys(query).some((key) => ["q", "category", "price", "platform", "sort", "page"].includes(key));
    if (hasQuery) {
      return {
        q: query.q || "",
        category: query.category || "",
        price: query.price || "",
        platform: query.platform || "",
        sort: query.sort || "updated_desc",
        page: Number(query.page || 1)
      };
    }
    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      return { sort: "updated_desc", page: 1 };
    }
    try {
      const parsed = JSON.parse(saved);
      return {
        q: parsed.q || "",
        category: parsed.category || "",
        price: parsed.price || "",
        platform: parsed.platform || "",
        sort: parsed.sort || "updated_desc",
        page: Number(parsed.page || 1)
      };
    } catch {
      return { sort: "updated_desc", page: 1 };
    }
  };

  const persistState = () => {
    const state = {
      q: (searchInput.value || "").trim(),
      category: categorySelect.value,
      price: priceSelect.value,
      platform: platformSelect.value,
      sort: sortSelect.value,
      page: currentPage
    };
    localStorage.setItem(storageKey, JSON.stringify(state));
    const params = new URLSearchParams();
    if (state.q) params.set("q", state.q);
    if (state.category) params.set("category", state.category);
    if (state.price) params.set("price", state.price);
    if (state.platform) params.set("platform", state.platform);
    if (state.sort && state.sort !== "updated_desc") params.set("sort", state.sort);
    if (state.page && state.page > 1) params.set("page", String(state.page));
    const queryString = params.toString();
    const nextUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  };

  const storedState = readStoredState();
  searchInput.value = storedState.q || "";
  applySelectValue(categorySelect, storedState.category || "", "");
  applySelectValue(priceSelect, storedState.price || "", "");
  applySelectValue(platformSelect, storedState.platform || "", "");
  applySelectValue(sortSelect, storedState.sort || "updated_desc", "updated_desc");
  currentPage = Number.isFinite(storedState.page) && storedState.page > 0 ? storedState.page : 1;

  const renderList = () => {
    const keyword = (searchInput.value || "").trim().toLowerCase();
    const categoryId = categorySelect.value;
    const priceModel = priceSelect.value;
    const platform = platformSelect.value;
    const sortKey = sortSelect.value;

    const filtered = tools.filter((tool) => {
      const nameMatch = tool.name.toLowerCase().includes(keyword);
      const tagMatch = (tool.tags || []).some((t) => t.toLowerCase().includes(keyword));
      const matchKeyword = keyword ? nameMatch || tagMatch : true;
      const matchCategory = categoryId ? (tool.categoryIds || []).includes(categoryId) : true;
      const matchPrice = priceModel ? tool.priceModel === priceModel : true;
      const matchPlatform = platform ? (tool.platforms || []).includes(platform) : true;
      return matchKeyword && matchCategory && matchPrice && matchPlatform;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "name_asc") {
        return a.name.localeCompare(b.name, "zh-Hans-CN");
      }
      if (sortKey === "price_asc") {
        return (a.priceModel || "").localeCompare(b.priceModel || "");
      }
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });

    countLabel.textContent = `${sorted.length} 个工具`;
    selectedCount.textContent = `已选 ${selected.size}/3`;
    compareBtn.textContent = `对比所选 (${selected.size})`;

    if (sorted.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <h3>暂无匹配结果</h3>
          <p>请尝试清空筛选或更换关键词</p>
          <button id="emptyResetBtn" type="button">清空筛选</button>
        </div>
      `;
      compareBtn.disabled = selected.size < 2;
      loadMoreContainer.style.display = "none";
      persistState();
      return;
    }

    const visibleCount = Math.min(sorted.length, currentPage * pageSize);
    const visible = sorted.slice(0, visibleCount);

    listContainer.innerHTML = visible.map((tool) => {
      const categoriesText = (tool.categoryIds || []).map((id) => toolsByCategory.get(id)).filter(Boolean);
      const isSelected = selected.has(tool.slug);
      const checked = isSelected ? "checked" : "";
      const disabled = selected.size >= 3 && !isSelected;
      const disabledAttr = disabled ? "disabled" : "";
      const labelClass = disabled ? "compare-option disabled" : "compare-option";
      return `
        <div class="card">
          <div class="toolbar">
            <h3><a href="detail.html?slug=${tool.slug}">${tool.name}</a></h3>
            <label class="${labelClass}">
              <input type="checkbox" data-slug="${tool.slug}" ${checked} ${disabledAttr} />
              对比
            </label>
          </div>
          <p class="summary">${buildSummary(tool, toolsByCategory)}</p>
          <div class="chip-row">${renderChips(categoriesText)}</div>
          <div class="chip-row">${renderChips(tool.tags || [])}</div>
          <div class="meta">价格模式：${tool.priceModel || "未知"} | 平台：${toText(tool.platforms)}</div>
          <div class="meta">更新：${tool.updatedAt || "-"}</div>
          <div class="link-row">
            <a href="${tool.websiteUrl}" target="_blank" rel="noreferrer">官网</a>
            ${tool.pricingUrl ? `<a href="${tool.pricingUrl}" target="_blank" rel="noreferrer">定价</a>` : ""}
          </div>
        </div>
      `;
    }).join("");

    compareBtn.disabled = selected.size < 2;
    loadMoreContainer.style.display = sorted.length > visibleCount ? "block" : "none";
    loadMoreBtn.textContent = `加载更多 (${visibleCount}/${sorted.length})`;
    persistState();
  };

  listContainer.addEventListener("change", (event) => {
    const target = event.target;
    if (target && target.matches("input[type='checkbox']")) {
      const slug = target.dataset.slug;
      if (target.checked) {
        if (selected.size >= 3) {
          target.checked = false;
          return;
        }
        selected.add(slug);
      } else {
        selected.delete(slug);
      }
      selectedCount.textContent = `已选 ${selected.size}/3`;
      compareBtn.textContent = `对比所选 (${selected.size})`;
      compareBtn.disabled = selected.size < 2;
    }
  });

  listContainer.addEventListener("click", (event) => {
    const target = event.target;
    if (target && target.id === "emptyResetBtn") {
      searchInput.value = "";
      categorySelect.value = "";
      priceSelect.value = "";
      platformSelect.value = "";
      sortSelect.value = "updated_desc";
      currentPage = 1;
      renderList();
    }
  });

  loadMoreBtn.addEventListener("click", () => {
    currentPage += 1;
    renderList();
  });

  compareBtn.addEventListener("click", () => {
    const slugs = Array.from(selected.values()).join(",");
    window.location.href = `compare.html?slugs=${slugs}`;
  });

  resetBtn.addEventListener("click", () => {
    searchInput.value = "";
    categorySelect.value = "";
    priceSelect.value = "";
    platformSelect.value = "";
    sortSelect.value = "updated_desc";
    currentPage = 1;
    renderList();
  });

  searchInput.addEventListener("input", () => {
    currentPage = 1;
    renderList();
  });
  categorySelect.addEventListener("change", () => {
    currentPage = 1;
    renderList();
  });
  priceSelect.addEventListener("change", () => {
    currentPage = 1;
    renderList();
  });
  platformSelect.addEventListener("change", () => {
    currentPage = 1;
    renderList();
  });
  sortSelect.addEventListener("change", () => {
    currentPage = 1;
    renderList();
  });
  renderList();
};

const renderDetail = (data) => {
  const query = getQuery();
  const slug = query.slug;
  const tools = data.tools || [];
  const toolMap = buildToolMap(tools);
  const tool = toolMap.get(slug);
  const categories = data.categories || [];
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  if (!tool) {
    setText("detailTitle", "未找到该工具");
    return;
  }

  setText("detailTitle", tool.name);
  setText("detailSummary", buildSummary(tool, categoryMap));
  setText("detailPrice", tool.priceModel || "未知");
  setText("detailPlatforms", toText(tool.platforms));
  setText("detailAudiences", toText(tool.audiences));
  setText("detailUpdated", tool.updatedAt || "-");
  setHtml("detailTags", renderChips(tool.tags || []));
  setHtml("detailCategories", renderChips((tool.categoryIds || []).map((id) => categoryMap.get(id)).filter(Boolean)));
  setHtml("detailFeatures", (tool.features || []).map((f) => `<li>${f}</li>`).join(""));

  setHtml("detailLinks", `
    <a href="${tool.websiteUrl}" target="_blank" rel="noreferrer">官网</a>
    ${tool.pricingUrl ? `<a href="${tool.pricingUrl}" target="_blank" rel="noreferrer">定价</a>` : ""}
    ${tool.trialUrl ? `<a href="${tool.trialUrl}" target="_blank" rel="noreferrer">试用</a>` : ""}
  `);

  const related = tools.filter((item) => item.slug !== tool.slug && (item.categoryIds || []).some((id) => (tool.categoryIds || []).includes(id))).slice(0, 6);
  setHtml("detailRelated", related.map((item) => `<div class="card"><h3><a href="detail.html?slug=${item.slug}">${item.name}</a></h3><div class="chip-row">${renderChips(item.tags || [])}</div></div>`).join(""));
};

const renderCompare = (data) => {
  const query = getQuery();
  const slugs = (query.slugs || "").split(",").filter(Boolean);
  const tools = data.tools || [];
  const toolMap = buildToolMap(tools);
  const selected = slugs.map((slug) => toolMap.get(slug)).filter(Boolean);
  const fields = (data.comparisons && data.comparisons.fields && data.comparisons.fields.length > 0)
    ? data.comparisons.fields
    : ["priceModel", "features", "platforms", "audiences", "trialUrl"];
  const diffToggle = document.getElementById("diffToggle");

  setHtml("compareTitle", `对比 ${selected.length} 个工具`);

  if (selected.length === 0) {
    setHtml("compareTable", "<p>未选择工具</p>");
    return;
  }

  const renderTable = () => {
    const onlyDiff = diffToggle && diffToggle.checked;
    const rows = fields.map((field) => {
      const labelMap = {
        priceModel: "价格模式",
        features: "功能点",
        platforms: "平台",
        audiences: "适用人群",
        trialUrl: "试用入口"
      };
      const label = labelMap[field] || field;
      const values = selected.map((tool) => {
        const value = tool[field];
        const normalized = Array.isArray(value) ? value.join("、") : (value || "");
        return { value, normalized };
      });
      const isDifferent = new Set(values.map((item) => item.normalized)).size > 1;
      if (onlyDiff && !isDifferent) {
        return "";
      }
      const cells = values.map((item) => {
        if (field === "trialUrl") {
          const cellValue = item.value ? `<a href="${item.value}" target="_blank" rel="noreferrer">试用</a>` : "-";
          return `<td class="${isDifferent ? "diff-cell" : ""}">${cellValue}</td>`;
        }
        const cellValue = Array.isArray(item.value) ? item.value.join("、") : (item.value || "-");
        return `<td class="${isDifferent ? "diff-cell" : ""}">${cellValue}</td>`;
      });
      return `<tr><th>${label}</th>${cells.join("")}</tr>`;
    }).filter(Boolean);

    if (rows.length === 0) {
      setHtml("compareTable", "<p>暂无差异项</p>");
      return;
    }

    const header = `<tr><th>工具</th>${selected.map((tool) => `<th>${tool.name}</th>`).join("")}</tr>`;
    setHtml("compareTable", `<table class="compare-table">${header}${rows.join("")}</table>`);
  };

  if (diffToggle) {
    diffToggle.addEventListener("change", renderTable);
  }
  renderTable();
};

const main = async () => {
  try {
    const data = await fetchData();
    if (page === "index") {
      renderIndex(data);
    }
    if (page === "detail") {
      renderDetail(data);
    }
    if (page === "compare") {
      renderCompare(data);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "加载失败";
    setText("errorMessage", message);
  }
};

main();
