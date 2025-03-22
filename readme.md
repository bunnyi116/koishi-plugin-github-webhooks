# koishi-plugin-github-webhooks

[![npm](https://img.shields.io/npm/v/koishi-plugin-github-webhooks?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-github-webhooks)

支持订阅 github-webhook 推送消息给订阅者（支持多仓库配置）

**目前插件处于开发阶段，可能不稳定或存在BUG（包括数据库表名称、字段等）。**

当前支持的 Github 事件类型：
 - ⭐ star
 - 🚀 push
 - ⚙️ workflow_run
 - 📝 issues
 - 🔀 pull_request
 - 🏷️ release

使用方法：在 `github` 中的项目设置中添加中 `wenhook` 设置
 - Payload URL：`http://localhost:5140/github/webhooks` （http://localhost:5140换成你的Koishi公网地址，能让github-webhook访问到的地址，/github/webhooks是本插件的 path ）

 - Content type：`application/json`
 
 - 其他请自行设置