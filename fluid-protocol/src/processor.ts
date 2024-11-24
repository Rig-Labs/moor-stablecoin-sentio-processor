import { LogLevel } from '@sentio/sdk'
import { FuelNetwork } from '@sentio/sdk/fuel'

import { BorrowerOperationsContractProcessor } from './types/fuel/BorrowerOperationsContractProcessor.js'



BorrowerOperationsContractProcessor.bind({
  address: '0xeda02ae9cbe68183ee86a0b5e7a475215fbafc307e5e6506f970fa6dcc15d62e', //mainnet production 
  chainId: FuelNetwork.MAIN_NET
})
  .onTransaction(
    async (tx, ctx) => {
      ctx.eventLogger.emit('transaction', {
        distinctId: tx.id,
        message: 'Transaction processed',
        properties: {
          fee: tx.fee.toNumber()
        },
        severity: tx.status === 'success' ? LogLevel.INFO : LogLevel.ERROR
      })
    },
    { includeFailed: true }
  )
  .onLogOpenTroveEvent(async (log, ctx) => {
    let timestamp = ctx.block?.time
    // you can also call ctx.contract.functions.complex(...)
    ctx.eventLogger.emit('troveOpened', { user: String(log.data.user), asset_id: String(log.data.asset_id), collateral: String(log.data.collateral), debt: String(log.data.debt), timestamp: String(timestamp) })
  })
  .onLogCloseTroveEvent(async (log, ctx) => {
    let timestamp = ctx.block?.time
    // you can also call ctx.contract.functions.complex(...)
    ctx.eventLogger.emit('troveClosed', { user: String(log.data.user), asset_id: String(log.data.asset_id), collateral: String(log.data.collateral), debt: String(log.data.debt), timestamp: String(timestamp) })
  })