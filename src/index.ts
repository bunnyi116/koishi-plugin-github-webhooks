import { Context, Schema } from 'koishi'
import { applyDatabase } from './database'
import { applyCommands } from './commands'
import { setupWebhookServer } from './webhooks'

export const name = 'github-webhooks'
export const inject = { required: ['database', 'server'] }

/**
 * 仓库配置
 */
export interface RepositoryConfig {
  repo: string
  secret: string
  enableWatch: boolean
  enableUnknownEvent: boolean
}

/**
 * 插件配置
 */
export interface PluginConfig {
  path: string
  allowUnknownRepositoryPush: boolean
  repositories: RepositoryConfig[]
}

/**
 * 插件配置
 */
export const Config: Schema<PluginConfig> = Schema.object({
  path: Schema.string()
    .default(`/github/webhooks`)
    .description(`填写示例: github -> 仓库 -> webhook<br>
      koishi公网地址(github能主动访问到的地址) -> <http://localhost:5140><br>
      github-repo-webhook地址完整示例 -> <http://localhost:5140/github/webhooks>`),

  allowUnknownRepositoryPush: Schema.boolean()
    .default(false)
    .description(`是否允许未配置的仓库推送事件, 开启后如果有未知仓库推送事件, 插件将会处理该事件, 否者插件将会忽略该事件推送`),

  // 启用事件类型
  repositories: Schema.array(
    Schema.object({
      repo: Schema.string()
        .required()
        .description(`预设仓库全名，例如 owner/repo`),

      secret: Schema.string()
        .required()
        .role('secret')
        .description(`该仓库对应的 Webhook secret`),

      enableWatch: Schema.boolean()
        .default(false)
        .description('是否启用 Watch 事件推送'),

      enableUnknownEvent: Schema.boolean()
        .default(false)
        .description('是否推送未知事件消息'),
    })
  ).description(`监听的仓库列表，每个仓库必须配置 secret 用于安全校验, 避免伪造推送`).default([]),
})

export function apply(ctx: Context, config: PluginConfig) {
  applyDatabase(ctx);
  applyCommands(ctx, config)
  setupWebhookServer(ctx, config)
}
