import { Context } from 'koishi'
import { subscribeCommand } from './subscribe'
import { unsubscribeCommand } from './unsubscribe'
import { listCommand } from './list'
import { resetSubscribeCommand } from './reset-subscribe'

export function applyCommands(ctx: Context) {
  subscribeCommand(ctx)
  unsubscribeCommand(ctx)
  listCommand(ctx)
  resetSubscribeCommand(ctx)
}
