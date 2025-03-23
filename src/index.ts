import { Context, Schema } from 'koishi'
import { applyDatabase } from './database'
import { applyCommands } from './commands'
import { setupWebhookServer } from './webhooks'

export const name = 'github-webhooks'
export const inject = { required: ['database', 'server'] }

export interface RepositoryConfig {
  repo: string
  secret: string
}

export interface PluginConfig {
  path: string  
  enableWatch: boolean
  enableUnknownEvent: boolean
  repositories: RepositoryConfig[]
}

export const Config: Schema<PluginConfig> = Schema.object({
  path: Schema.string()
    .default(`/github/webhooks`)
    .description(`Github Webhook 路由路径<br>
      仓库 webhook 填写示例： <br>
      koishi 公网地址: <http://localhost:5140> (github能主动访问到的地址) <br>
      完整示例: <http://localhost:5140/github/webhooks>`),

  enableWatch: Schema.boolean()
    .default(false)
    .description('是否启用 Watch 事件推送'),

  enableUnknownEvent: Schema.boolean()
    .default(false)
    .description('是否推送未知事件消息'),

  repositories: Schema.array(
    Schema.object({
      repo: Schema.string()
        .required()
        .description(`预设仓库全名，例如 owner/repo`),

      secret: Schema.string()
        .required()
        .description(`该仓库对应的 Webhook secret`),
    })
  ).description(`允许监听的仓库列表，每个仓库必须配置 secret`).default([]),
})

export function apply(ctx: Context, config: PluginConfig) {
  applyDatabase(ctx);
  applyCommands(ctx, config)
  setupWebhookServer(ctx, config)
}
