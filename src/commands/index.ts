import { Context } from 'koishi'
import { subscribeCommand } from './subscribe'
import { unsubscribeCommand } from './unsubscribe'
import { listCommand } from './list'
import { typesCommand } from './types'
import { PluginConfig } from '..'

export function applyCommands(ctx: Context, config: PluginConfig) {
    subscribeCommand(ctx, config)
    unsubscribeCommand(ctx, config)
    listCommand(ctx, config)
    typesCommand(ctx)
}
