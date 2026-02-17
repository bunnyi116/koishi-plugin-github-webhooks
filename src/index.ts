import { Context, Schema } from 'koishi'
import { applyDatabase } from './database'
import { applyCommands } from './commands'
import { setupEventListeners } from './event-listener'
import { Logger } from './logger'

export const name = 'github-webhooks'
export const reusable = false
export const filter = false

export const inject = {
  required: ['database']
}

export const usage = `
---

### 前置依赖：

本插件依赖 adapter-github 适配器接收事件

-> 请先安装并配置 adapter-github（推荐使用webhook）

然后开启本插件，在对应群组使用指令交互，即可进行订阅管理

---

### 关于指令：

使用 <code>指令名称 -h</code> 即可查看指令帮助，例如 <code>github.list -h</code>

---`

export interface PluginConfig {
  botId: string
  debug: boolean
}

export const Config: Schema<PluginConfig> = Schema.object({
  botId: Schema.string()
    .required()
    .description('指定要监听的 GitHub Bot ID（机器人账号名）<br>-> 必填项，用于指定处理哪个 adapter-github 实例的事件<br>-> 避免多实例重复推送'),
  debug: Schema.boolean()
    .default(false)
    .description('开启调试日志<br>-> 开启后会输出详细的事件处理日志')
}).description('配置说明')

export function apply(ctx: Context, config: PluginConfig) {
  // 初始化日志器
  const logger = new Logger(ctx, config)

  // 初始化数据库
  applyDatabase(ctx);

  // 注册指令
  applyCommands(ctx)

  // 监听 adapter-github 的事件
  setupEventListeners(ctx, config, logger)

  logger.debug(`已启动事件监听器，监听 Bot ID: ${config.botId}`)
}
