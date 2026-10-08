# 发布指南

`extension/manifest.json` 的 `version` 是唯一版本来源。标签必须为 `v` 加上该版本，例如版本 `1.0.1` 对应标签 `v1.0.1`。

## 本地验证与打包

需要 Node.js 22 和 Python 3.9 或更新版本，无需安装第三方依赖。在仓库根目录运行：

```sh
python3 -m unittest discover -s tests -v
node --test tests/*.test.mjs
for file in extension/background.js extension/pages/*.js extension/utils/*.js; do
  node --check "$file"
done
python3 scripts/package.py
```

安装包输出到 `dist/`，包含：

- `image-collector-<版本>.zip`：对应版本的安装包。
- `image-collector.zip`：相同内容的固定文件名，供最新版下载链接使用。
- `SHA256SUMS.txt`：两个安装包的 SHA-256 校验值。

ZIP 根目录直接包含 `manifest.json`，解压后即可加载。打包脚本只允许插件运行文件和 MIT 许可证进入安装包；意外文件及符号链接会使打包失败，系统 `.DS_Store` 会被跳过。

如新增插件运行文件，请同步更新 `scripts/package.py` 的白名单。

## 发布新版本

1. 更新 `extension/manifest.json` 中的版本，使用数字版本，例如 `1.0.1`。
2. 完成本地验证，提交代码，再创建对应的版本标签：

```sh
git add extension/manifest.json
git commit -m "发布 1.0.1 版本"
git tag -a v1.0.1 -m "发布 v1.0.1"
git push origin main
git push origin v1.0.1
```

命令中的版本需替换为待发布版本；其他改动也应在打标签前提交。

GitHub Actions 会校验代码、测试打包脚本，并核对版本标签。全部通过后自动创建 Release、生成更新记录并上传安装包和校验文件，无需配置个人访问令牌。

## 触发方式

| 触发方式 | 结果 |
| --- | --- |
| 推送 `main` 或向 `main` 提交 PR | 校验并生成 Actions Artifact，不发布 Release。 |
| 推送 `v*` 标签 | 校验版本一致后发布 Release。 |
| 在 Actions 中手动运行，选择分支 | 校验并生成 Artifact。 |
| 在 Actions 中手动运行，选择版本标签 | 发布或更新该标签的 Release。 |

Artifact 保留 30 天。重跑已发布标签会替换该 Release 的附件，保留已有发布说明；新版本应使用新标签。

固定最新版下载链接：

[image-collector.zip](https://github.com/fangxiaoxingit/image-collection-chrome/releases/latest/download/image-collector.zip)
