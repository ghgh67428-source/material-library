const byId = (id) => document.getElementById(id);
const categories = byId('categories');
const locations = byId('locations');
const categoryToggle = byId('category-toggle');
const search = byId('search');
const type = byId('type');
const sceneFilter = byId('plant-scene-filter');
const plantSubcategories = byId('plant-subcategories');
const color = byId('color');
const finish = byId('finish');
const caseOnly = byId('case-only');
const clear = byId('clear');
const cards = byId('cards');
const state = byId('state');
const stateAction = byId('state-action');
const detail = byId('detail');
const mobile = matchMedia('(max-width: 760px)');
const more = byId('more');
const materialViews = byId('material-views');
const isPlants = new URLSearchParams(location.search).get('section') === 'plants';
const itemLabel = isPlants ? '植物' : '材质';
const allLabel = isPlants ? '全部条目' : '全部材质';
const dataPath = isPlants ? './data/plants.json?v=2' : './data/materials.json';
const pageSize = 24;

let entries = [];
let plantIndex = new Map();
let plantGroups = new Map();
let visibleCount = pageSize;
let selectedCategory = '';
let selectedPlantSubtype = '';
let selectedLocation = '';
let selectedView = 'application';

if (isPlants) {
  document.title = '植物检索 · 检索库';
  document.body.classList.add('plant-section');
  byId('materials-section').removeAttribute('aria-current');
  byId('plants-section').setAttribute('aria-current', 'page');
  byId('page-title').textContent = '植物检索';
  byId('page-description').textContent = '从乔木、灌木、草本等大类开始，再按细分类别或场景查找。';
  byId('category-title').textContent = byId('category-toggle-label').textContent = '植物分类';
  categories.setAttribute('aria-label', '植物分类');
  byId('results-title').textContent = allLabel;
  byId('current-category').textContent = '· ' + allLabel;
  byId('state-message').textContent = '正在加载植物…';
  search.placeholder = '搜索玉兰、肉质植物、落叶…';
  search.setAttribute('aria-label', '搜索植物');
  for (const id of ['location-panel', 'color', 'finish', 'case-filter', 'material-view-panel']) byId(id).hidden = true;
  byId('uses-title').textContent = '景观应用';
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function filterButton(className, value, label) {
  const button = element('button', className, label);
  button.type = 'button';
  button.value = value;
  return button;
}

function categoryButton(name, swatch, count) {
  const button = filterButton('category', name);
  const dot = element('span', 'category-dot');
  dot.setAttribute('aria-hidden', 'true');
  if (swatch) dot.style.setProperty('--dot', swatch);
  button.append(dot, element('span', '', name || allLabel), element('span', 'category-count', count));
  return button;
}

function setOptions(select, label, values) {
  const unique = [...new Set(values)];
  select.replaceChildren(new Option(label, ''), ...unique.map((value) => new Option(value, value)));
}

function updateTypes() {
  if (isPlants) {
    selectedPlantSubtype = '';
    const subtypes = plantGroups.get(selectedCategory)?.subcategories || [];
    plantSubcategories.hidden = subtypes.length < 2;
    plantSubcategories.replaceChildren();
    if (!plantSubcategories.hidden) {
      plantSubcategories.append(filterButton('plant-subtype', '', '全部' + selectedCategory),
        ...subtypes.map((name) => filterButton('plant-subtype', name, name)));
    }
    return;
  }
  type.hidden = !selectedCategory;
  const types = entries.filter((item) => item.category === selectedCategory).map((item) => item.type);
  setOptions(type, '全部二级分类', types);
}

function updatePressed(group, value) {
  for (const button of group.children) button.setAttribute('aria-pressed', String(button.value === value));
}

function imagePath(path) {
  return './' + path.replace(/^\//, '');
}

function plantImageLabel(photo) {
  if (photo?.relation === 'species-reference') return '原种参考图';
  if (photo?.relation === 'specimen') return '标本照片';
  if (photo?.relation === 'render') return '低模预览';
  return '植物照片';
}

function sample(item, lazy = false) {
  const wrap = element('span', 'sample');
  const img = element('img');
  img.alt = '';
  if (!lazy) {
    const label = isPlants ? plantImageLabel(item.photo) : '材质样本';
    const subject = item.photo?.relation === 'species-reference' ? item.photo.taxon : item.name;
    img.alt = subject + label;
  }
  img.decoding = 'async';
  if (lazy) img.loading = 'lazy';
  img.addEventListener('error', () => wrap.replaceChildren(element('span', '', '样本图暂缺')), { once: true });
  img.src = imagePath(lazy ? item.thumbnail || item.image : item.image);
  wrap.append(img);
  return wrap;
}

function definition(label, value) {
  const row = element('div');
  row.append(element('dt', '', label), element('dd', '', value));
  return row;
}

function detailImage(item) {
  const imageLink = byId('detail-image');
  imageLink.href = imagePath(item.image);
  imageLink.replaceChildren(sample(item), element('span', 'sample-action', '查看大图 ↗'));
}

function focusViewport(photo, focus, lazy = false) {
  const wrap = element('span', 'focus-viewport');
  const img = element('img');
  img.alt = focus.location;
  img.decoding = 'async';
  if (lazy) img.loading = 'lazy';
  // The viewport changes framing only; links retain the complete source photograph.
  const width = Math.min(focus.width, 1, (4 / 3) * photo.height / photo.width);
  const height = width * photo.width / photo.height / (4 / 3);
  const x = Math.max(0, Math.min(1 - width, focus.center[0] - width / 2));
  const y = Math.max(0, Math.min(1 - height, focus.center[1] - height / 2));
  Object.assign(img.style, {
    width: `${100 / width}%`, height: `${100 / height}%`,
    left: `${-100 * x / width}%`, top: `${-100 * y / height}%`,
  });
  let triedFullImage = !lazy || photo.thumbnail === photo.image;
  img.addEventListener('error', () => {
    if (!triedFullImage) {
      triedFullImage = true;
      img.src = imagePath(photo.image);
      return;
    }
    wrap.replaceChildren(element('span', 'photo-error', '图片加载失败，请刷新页面重试'));
  });
  img.src = imagePath(lazy ? photo.thumbnail : photo.image);
  wrap.append(img);
  return wrap;
}

function applicationSample(item) {
  const app = item.application;
  const wrap = element('span', 'application-sample');
  wrap.append(focusViewport(app.photos[0], app.focus, true));
  wrap.append(element('span', 'photo-subject', app.focus.location));
  return wrap;
}

function showMaterialImages(item, view) {
  const app = item.application;
  const useApplication = Boolean(app && view === 'application');
  detail.classList.toggle('application-detail', useApplication);
  byId('detail-image').hidden = useApplication;
  const gallery = byId('application-gallery');
  const observation = byId('application-observation');
  gallery.hidden = observation.hidden = !useApplication;
  gallery.replaceChildren();
  const controls = byId('detail-views');
  controls.hidden = !app;
  controls.replaceChildren();
  if (app) {
    const applicationButton = filterButton('', 'application', '材料与部位');
    controls.append(applicationButton);
    applicationButton.addEventListener('click', () => showMaterialImages(item, 'application'));
    if (item.textureAvailable !== false) {
      const textureButton = filterButton('', 'texture', '纹理样本');
      controls.append(textureButton);
      textureButton.addEventListener('click', () => showMaterialImages(item, 'texture'));
    }
    updatePressed(controls, useApplication ? 'application' : 'texture');
  }
  const credit = byId('image-credit');
  if (useApplication) {
    gallery.classList.remove('single');
    const views = [
      {photo: app.photos[0], focused: true, title: '材料与做法'},
      {photo: app.photos[1] || app.photos[0], focused: false, title: '使用位置'},
    ];
    for (const {photo, focused, title} of views) {
      const figure = element('figure', 'application-photo');
      const link = externalLink('', imagePath(photo.image));
      link.setAttribute('aria-label', photo.caption + '，查看完整大图');
      if (focused) link.append(focusViewport(photo, app.focus));
      else {
        const img = element('img');
        img.src = imagePath(photo.image);
        img.alt = photo.caption;
        img.decoding = 'async';
        link.append(img);
      }
      figure.append(element('h3', 'photo-view-title', title), link,
        element('figcaption', '', (focused ? app.focus.location : photo.caption) + ' · 摄影 © ' + photo.credit));
      gallery.append(figure);
    }
    observation.replaceChildren(element('strong', '', '完成效果：'), app.focus.effect + '。' + (app.note ? ' ' + app.note : ''));
    credit.replaceChildren(element('span', 'application-relation', app.relation), ' · ',
      externalLink(app.project, app.url), ' · 来源：谷德设计网');
  } else {
    detailImage(item);
    credit.textContent = item.imageKind || '材质样本';
    if (/^https?:\/\//i.test(item.imageSource || '')) {
      if (credit.textContent) credit.append(' · ');
      credit.append(externalLink('查看图片来源', item.imageSource));
    }
    if (!app) credit.append(' · 暂未配应用实景');
  }
}

function externalLink(label, url) {
  const link = element('a', '', label);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function combinationImages(item) {
  const picture = element('span', 'combination');
  for (const id of item.components) picture.append(sample(plantIndex.get(id), true));
  return picture;
}

function appendPhotoCredit(container, photo) {
  container.append(externalLink(photo.credit, photo.url), ' · ',
    externalLink(photo.license, photo.licenseUrl), ' · 已缩放并转为 WebP');
}

function showDetail(item) {
  byId('detail-title').textContent = item.name;
  byId('detail-category').textContent = item.category + ' / ' + item.type;
  byId('detail-figure').hidden = false;
  byId('properties').hidden = false;
  showMaterialImages(item, selectedView === 'texture' ? 'texture' : 'application');
  byId('properties').replaceChildren(definition('颜色', item.color), definition('表面效果', item.finish));
  byId('uses').replaceChildren(...Object.entries(item.uses).map(([label, value]) => definition(label, value)));
  const caseSection = byId('case-section');
  caseSection.hidden = !item.caseStudy;
  if (item.caseStudy) {
    const project = byId('case-link');
    project.href = item.caseStudy.url;
    project.textContent = `${item.caseStudy.name} · ${item.caseStudy.year} 年报道`;
    byId('case-context').textContent = item.caseStudy.context;
  }
  const note = byId('note');
  note.textContent = item.note || '';
  note.hidden = !item.note;
  detail.showModal();
}

function showPlant(item) {
  byId('detail-title').textContent = item.name;
  byId('detail-category').textContent = plantGroups.get(item.group).subcategories.length > 1
    ? item.group + ' / ' + item.category : item.group;
  const properties = byId('properties');
  properties.hidden = !item.scientificName && !item.components;
  properties.replaceChildren();
  if (item.scientificName) properties.append(definition('学名', item.scientificName));
  if (item.components) {
    const names = item.components.map((id) => plantIndex.get(id).name).join('、');
    properties.append(definition('组合植物', names));
  }
  byId('uses').replaceChildren(definition(item.scene, item.description));
  const figure = byId('detail-figure');
  figure.hidden = !item.image && !item.components;
  const credit = byId('image-credit');
  if (item.components) {
    const imageLink = byId('detail-image');
    imageLink.removeAttribute('href');
    imageLink.replaceChildren(combinationImages(item));
    credit.replaceChildren();
    for (const id of item.components) {
      const part = plantIndex.get(id);
      const row = element('span', 'combination-credit', part.name + ' · ');
      appendPhotoCredit(row, part.photo);
      credit.append(row);
    }
  } else if (item.image) {
    detailImage(item);
    const photo = item.photo;
    credit.textContent = plantImageLabel(photo);
    if (photo?.relation === 'species-reference') credit.append(` · ${photo.taxon}`);
    if (photo) {
      credit.append(' · ');
      appendPhotoCredit(credit, photo);
    }
  }
  const source = byId('plant-source');
  source.hidden = !item.scientificName;
  if (item.scientificName) {
    const taxon = item.scientificName.split(" '")[0];
    source.href = 'https://powo.science.kew.org/results?q=' + encodeURIComponent(taxon);
  }
  detail.showModal();
}

function plantCard(item) {
  const card = filterButton('card plant-card', item.id);
  card.setAttribute('aria-haspopup', 'dialog');
  const body = element('span', 'card-body');
  const label = element('span', 'card-type', plantGroups.get(item.group).subcategories.length > 1 ? item.category : item.group);
  const arrow = element('span', 'card-arrow', '↗');
  arrow.setAttribute('aria-hidden', 'true');
  label.append(arrow);
  body.append(label, element('span', 'card-name', item.name));
  if (item.scientificName) body.append(element('i', 'plant-scientific', item.scientificName));
  body.append(element('span', 'plant-scene', item.scene));
  if (item.components) card.append(combinationImages(item));
  else if (item.image) card.append(sample(item, true));
  if (item.photo && item.photo.relation !== 'exact') body.append(element('span', 'plant-reference', plantImageLabel(item.photo)));
  card.append(body);
  card.addEventListener('click', () => showPlant(item));
  return card;
}

function materialCard(item) {
  const useApplication = selectedView !== 'texture' && item.application;
  const card = filterButton('card' + (useApplication ? ' application-card' : ''), item.id);
  card.setAttribute('aria-haspopup', 'dialog');
  const body = element('span', 'card-body');
  const category = element('span', 'card-type', item.type);
  const arrow = element('span', 'card-arrow', '↗');
  arrow.setAttribute('aria-hidden', 'true');
  category.append(arrow);
  const tags = element('span', 'tags');
  tags.append(...Object.keys(item.uses).map((name) => element('span', 'tag', name)));
  body.append(category, element('span', 'card-name', item.name));
  if (useApplication) {
    const facts = element('span', 'material-facts');
    for (const [label, value] of [['部位', item.application.focus.location], ['效果', item.application.focus.effect]]) {
      const row = element('span');
      row.append(element('span', 'fact-label', label), element('span', 'fact-value', value));
      facts.append(row);
    }
    body.append(facts);
    body.append(element('span', 'card-case', item.application.project));
    body.append(element('span', 'card-credit', item.application.relation + ' · 摄影 © ' +
      [...new Set(item.application.photos.map((photo) => photo.credit))].join(' / ')));
  } else {
    body.append(tags);
    body.append(element('span', 'card-image-kind', item.imageKind || '材质样本'));
    if (item.caseStudy) body.append(element('span', 'card-case', item.caseStudy.name));
  }
  card.append(useApplication ? applicationSample(item) : sample(item, true), body);
  card.addEventListener('click', () => showDetail(item));
  return card;
}

function showState(message, action, handler) {
  byId('state-message').textContent = message;
  state.hidden = false;
  stateAction.textContent = action;
  stateAction.hidden = !action;
  stateAction.onclick = handler;
}

function render(append = false) {
  if (!append) visibleCount = pageSize;
  const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = entries.filter((item) =>
    (isPlants || selectedView !== 'application' || item.application) &&
    (isPlants || selectedView !== 'texture' || item.textureAvailable !== false) &&
    (!selectedCategory || (item.group || item.category) === selectedCategory) &&
    (!selectedPlantSubtype || item.category === selectedPlantSubtype) &&
    (!type.value || item.type === type.value) &&
    (!selectedLocation || (isPlants ? item.scene === selectedLocation : Object.hasOwn(item.uses, selectedLocation))) &&
    (!color.value || item.color === color.value) &&
    (!finish.value || item.finish === finish.value) &&
    (!caseOnly.checked || item.caseStudy) &&
    words.every((word) => item.searchText.includes(word))
  );
  clear.disabled = ![search.value, selectedCategory, selectedPlantSubtype, type.value, selectedLocation, color.value, finish.value, caseOnly.checked].some(Boolean);
  updatePressed(categories, selectedCategory);
  updatePressed(plantSubcategories, selectedPlantSubtype);
  updatePressed(locations, selectedLocation);
  byId('current-category').textContent = '· ' + (selectedCategory || allLabel);
  byId('results-title').textContent = selectedPlantSubtype || type.value || selectedCategory ||
    (!isPlants && selectedView === 'application' ? '应用实景' : allLabel);
  byId('result-count').textContent = results.length + (isPlants ? ' 条记录' : ' 项材质');
  if (!isPlants) {
    const base = entries.filter((item) => selectedView === 'application' ? item.application :
      selectedView === 'texture' ? item.textureAvailable !== false : true);
    for (const button of categories.children) {
      button.querySelector('.category-count').textContent = button.value
        ? base.filter((item) => item.category === button.value).length : base.length;
    }
    updatePressed(materialViews, selectedView);
    cards.classList.toggle('application-grid', selectedView !== 'texture');
    byId('case-filter').hidden = selectedView === 'application';
    const withApplication = entries.filter((item) => item.application).length;
    byId('view-description').textContent = selectedView === 'application'
      ? `${withApplication} 项材质 · 主图聚焦材料构件，详情对照使用位置与完整原图。其余条目见「全部材质」。`
      : selectedView === 'texture' ? '纹理用于辨认肌理；生成示意与真实样本均标明来源。'
      : `${entries.length} 项材质，已配实景的条目优先展示实景，其余保留材质样本。`;
  }
  if (append) {
    const newCards = results.slice(visibleCount - pageSize, visibleCount).map(plantCard);
    cards.append(...newCards);
    newCards[0]?.focus();
  } else {
    cards.replaceChildren(...(isPlants ? results.slice(0, visibleCount).map(plantCard) : results.map(materialCard)));
  }
  more.hidden = !isPlants || results.length <= visibleCount;
  more.textContent = `加载更多（已显示 ${visibleCount} / ${results.length}）`;
  state.hidden = results.length > 0;
  if (!state.hidden) showState('没有符合条件的记录。', '清除筛选', clearFilters);
}

function clearFilters() {
  selectedCategory = '';
  selectedLocation = '';
  search.value = color.value = finish.value = sceneFilter.value = '';
  caseOnly.checked = false;
  updateTypes();
  render();
  search.focus();
}

function bindFilters() {
  materialViews.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    selectedView = button.value;
    caseOnly.checked = false;
    render();
  });
  categoryToggle.addEventListener('click', () => {
    const expanded = categoryToggle.getAttribute('aria-expanded') === 'true';
    categoryToggle.setAttribute('aria-expanded', String(!expanded));
  });
  categories.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (selectedCategory !== button.value) {
      selectedCategory = button.value;
      updateTypes();
      render();
    }
    if (mobile.matches) {
      categoryToggle.focus();
      categoryToggle.setAttribute('aria-expanded', 'false');
    }
  });
  locations.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    selectedLocation = button.value;
    render();
  });
  plantSubcategories.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    selectedPlantSubtype = button.value;
    render();
  });
  search.addEventListener('input', () => render());
  sceneFilter.addEventListener('change', () => {
    selectedLocation = sceneFilter.value;
    render();
  });
  for (const control of [type, color, finish, caseOnly]) control.addEventListener('change', () => render());
  clear.addEventListener('click', clearFilters);
  more.addEventListener('click', () => {
    visibleCount += pageSize;
    render(true);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || detail.open) return;
    if (event.target.closest('input, textarea, select, [contenteditable]')) return;
    event.preventDefault();
    search.focus();
  });
}

async function load() {
  try {
    const response = await fetch(dataPath, {cache: 'no-cache'});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    const groupBySubtype = new Map();
    if (isPlants) {
      plantIndex = new Map(data.plants.map((item) => [item.id, item]));
      plantGroups = new Map(data.categories.map((group) => [group.name, group]));
      for (const group of data.categories) {
        for (const subtype of group.subcategories) groupBySubtype.set(subtype, group.name);
      }
    }
    entries = isPlants ? data.plants.map((item) => ({
      ...item,
      group: groupBySubtype.get(item.category),
      searchText: [
        item.name, item.scientificName, ...(item.aliases || []), item.category, groupBySubtype.get(item.category), item.scene, item.description,
        ...(item.components || []).map((id) => plantIndex.get(id).name),
      ].join(' ').toLowerCase(),
    })) : data.materials.map((item) => ({
      ...item,
      searchText: [item.name, ...item.aliases, item.category, item.type, item.color, item.finish,
        ...Object.keys(item.uses), ...Object.values(item.uses), item.note,
        item.caseStudy?.name, item.caseStudy?.context, item.application?.project,
        item.application?.observation, item.application?.focus?.location, item.application?.focus?.effect].join(' ').toLowerCase(),
    }));
    const counts = new Map();
    for (const item of entries) {
      const category = item.group || item.category;
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    categories.replaceChildren(
      categoryButton('', null, entries.length),
      ...data.categories.map(({ name, swatch }) => categoryButton(name, swatch, counts.get(name) || 0))
    );
    if (isPlants) {
      setOptions(sceneFilter, '全部场景', data.scenes);
      sceneFilter.hidden = false;
    } else {
      locations.replaceChildren(
        filterButton('location', '', '全部部位'),
        ...data.locations.map((name) => filterButton('location', name, name))
      );
      setOptions(color, '全部颜色', entries.map((item) => item.color));
      setOptions(finish, '全部表面', entries.map((item) => item.finish));
    }
    render();
    bindFilters();
  } catch (error) {
    console.error(itemLabel + '数据加载失败', error);
    showState(`无法加载${itemLabel}数据。请重新加载。`, '重新加载', () => location.reload());
  }
}

load();
