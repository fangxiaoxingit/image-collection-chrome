# ImageCollectionChrome

> 图片采集 Chrome 浏览器插件开发

## 简介

用户安装浏览器插件后，添加到右键菜单，在图片上右键菜单选中即可保存当前图片 URL 到缓存目录，然后用户点击插件图标，跳转打开已收集列表，顶部是工具栏，全选，全不选，批量下载（打包当前年月 2025-01 这种）已勾选图标；勾选的同时顶部显示勾选数量；

列表一行显示五个，名称显示 URL（可不显示全），但是点击名称跳转打开这张图片。

---

## 升级后的最终版需求文档

> 偏工程落地 + 原生 JS + UI 规范 + AI 可生成代码

**补充内容：**
- ✅ 原生 JS 架构（无 TS）
- ✅ 模块划分（方便 AI 生成代码）
- ✅ UI 结构 + CSS 规范
- ✅ 关键代码骨架（可直接让 AI 补全）
- ✅ Manifest V3 注意点（真实开发坑）

---

## 1. 技术选型（明确约束）

### 1.1 基础技术
- 原生 JavaScript（不使用 TS）
- HTML + CSS（不依赖框架）
- Chrome Extension Manifest V3

### 1.2 为什么不用 TS / 框架
- 降低复杂度
- 方便 AI 直接生成代码
- 插件体积更小
- 无需构建工具（vite / webpack）

### 1.3 Manifest V3 关键限制（必须知道）
- background 是 service worker（非持久）
- 不能操作 DOM
- 必须用 storage 做持久化

> � **提示**
> - service worker 无 DOM，需要额外方案处理 DOM ([Stack Overflow](https://stackoverflow.com))
> - MV3 强制更安全但限制更多 ([Chrome for Developers](https://developer.chrome.com))

---

## 2. 项目目录结构（推荐）

```
extension/
│
├── manifest.json
├── background.js
├── content.js（可选）
│
├── pages/
│   └── list.html
│   └── list.js
│   └── list.css
│
├── utils/
│   └── storage.js
│   └── download.js
│   └── hash.js
│
└── assets/
```

---

## 3. manifest.json（最小可用）

```json
{
  "manifest_version": 3,
  "name": "Image Collector",
  "version": "1.0.0",
  "permissions": [
    "contextMenus",
    "storage",
    "downloads"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_title": "Image Collector"
  }
}
```

---

## 4. 核心模块设计（AI 友好）

### 4.1 storage 模块

```javascript
// utils/storage.js

const KEY = 'image_list'

export async function getList() {
  const res = await chrome.storage.local.get(KEY)
  return res[KEY] || []
}

export async function setList(list) {
  return chrome.storage.local.set({ [KEY]: list })
}
```

### 4.2 数据结构

```javascript
{
  id: string,
  url: string,
  preview: string,
  createdAt: number,
  selected: false
}
```

### 4.3 右键采集（background.js）

```javascript
chrome.contextMenus.create({
  id: "save_image",
  title: "收集图片",
  contexts: ["image"]
})

chrome.contextMenus.onClicked.addListener(async (info) => {
  const url = info.srcUrl

  const list = await getList()

  // URL 去重
  if (list.some(i => i.url === url)) return

  list.unshift({
    id: Date.now().toString(),
    url,
    preview: url,
    createdAt: Date.now(),
    selected: false
  })

  await setList(list)
})
```

### 4.4 下载模块

```javascript
// utils/download.js

export async function downloadImage(url, filename) {
  return chrome.downloads.download({
    url,
    filename,
    saveAs: false
  })
}
```

> � downloads API 会自动带 cookie ([Chrome for Developers](https://developer.chrome.com))

### 4.5 批量下载（队列版）

```javascript
export async function batchDownload(list) {
  const queue = list.slice()

  const MAX = 3

  async function worker() {
    while (queue.length) {
      const item = queue.shift()
      await downloadImage(item.url, `2025-01/${Date.now()}.jpg`)
    }
  }

  await Promise.all(new Array(MAX).fill(0).map(worker))
}
```

### 4.6 hash 去重（可选）

```javascript
export async function hashImage(url) {
  const res = await fetch(url)
  const buffer = await res.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buffer)

  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
```

---

## 5. UI 设计（重点）

### 5.1 页面结构（list.html）

```html
<body>
  <div id="app">
    
    <!-- 工具栏 -->
    <div class="toolbar">
      <button id="selectAll">全选</button>
      <button id="unselectAll">全不选</button>
      <button id="download">下载</button>
      <button id="clear">清空</button>
      <span id="count"></span>
    </div>

    <!-- 列表 -->
    <div class="grid" id="list"></div>

  </div>
</body>
```

### 5.2 卡片结构

```html
<div class="card">
  <input type="checkbox" />
  <img />
  <div class="url"></div>
  <button class="delete">删除</button>
</div>
```

### 5.3 CSS 规范（核心）

```css
body {
  margin: 0;
  font-family: Arial;
}

.toolbar {
  display: flex;
  gap: 10px;
  padding: 10px;
  border-bottom: 1px solid #eee;
}

.grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  padding: 10px;
}

.card {
  border: 1px solid #eee;
  padding: 8px;
  position: relative;
}

.card img {
  width: 100%;
  height: 120px;
  object-fit: cover;
}

.url {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

### 5.4 UI 行为

#### 勾选

```javascript
checkbox.onchange = () => {
  item.selected = checkbox.checked
}
```

#### 删除

```javascript
btn.onclick = () => removeItem(item.id)
```

#### 清空

```javascript
if (confirm("确定清空？")) {
  setList([])
}
```

#### 打开图片

```javascript
url.onclick = () => window.open(item.url)
```

---

## 6. AI 生成代码策略（非常关键）

为了让 AI 更好生成代码，建议你：

### 6.1 每个模块独立描述

例如：

```
请帮我实现 storage.js：
- getList
- setList
- 使用 chrome.storage.local
```

### 6.2 UI 拆分任务

生成 list.html + list.css

要求：
- 5 列 grid
- 卡片结构

### 6.3 行为拆分

实现批量下载：
- 并发 3
- 使用 chrome.downloads

---

## 7. 开发阶段建议（非常实用）

### Phase 1（MVP）
- 右键采集
- 列表展示
- URL 去重
- 批量下载

### Phase 2
- 删除
- 清空
- 勾选计数
- UI 优化

### Phase 3
- hash 去重
- 下载状态
- 失败重试

---

## 8. 核心风险总结

> ⚠️ **1. 图片 URL 不稳定**
> - 可能是缩略图
> - 可能过期

> ⚠️ **2. MV3 限制**
> - worker 不持久
> - 无 DOM

> ⚠️ **3. 下载控制有限**
> - 浏览器可能弹窗
> - 用户设置不可控

---

## 9. 最终总结

这个版本已经具备：

- ✅ 完整工程结构
- ✅ 原生 JS 可直接开发
- ✅ UI 可直接生成
- ✅ AI 可拆任务实现
