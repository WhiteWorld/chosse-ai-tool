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
  const compareBtn = document.getElementById("compareBtn");

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

    listContainer.innerHTML = sorted.map((tool) => {
      const categoriesText = (tool.categoryIds || []).map((id) => toolsByCategory.get(id)).filter(Boolean);
      const checked = selected.has(tool.slug) ? "checked" : "";
      return `
        <div class="card">
          <div class="toolbar">
            <h3><a href="detail.html?slug=${tool.slug}">${tool.name}</a></h3>
            <label>
              <input type="checkbox" data-slug="${tool.slug}" ${checked} />
              对比
            </label>
          </div>
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
      compareBtn.disabled = selected.size < 2;
    }
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
    renderList();
  });

  searchInput.addEventListener("input", renderList);
  categorySelect.addEventListener("change", renderList);
  priceSelect.addEventListener("change", renderList);
  platformSelect.addEventListener("change", renderList);
  sortSelect.addEventListener("change", renderList);
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

  setHtml("compareTitle", `对比 ${selected.length} 个工具`);

  if (selected.length === 0) {
    setHtml("compareTable", "<p>未选择工具</p>");
    return;
  }

  const rows = fields.map((field) => {
    const labelMap = {
      priceModel: "价格模式",
      features: "功能点",
      platforms: "平台",
      audiences: "适用人群",
      trialUrl: "试用入口"
    };
    const label = labelMap[field] || field;
    const cells = selected.map((tool) => {
      const value = tool[field];
      if (field === "trialUrl") {
        return value ? `<a href="${value}" target="_blank" rel="noreferrer">试用</a>` : "-";
      }
      return Array.isArray(value) ? value.join("、") : (value || "-");
    });
    return `<tr><th>${label}</th>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
  });

  const header = `<tr><th>工具</th>${selected.map((tool) => `<th>${tool.name}</th>`).join("")}</tr>`;
  setHtml("compareTable", `<table class="compare-table">${header}${rows.join("")}</table>`);
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
