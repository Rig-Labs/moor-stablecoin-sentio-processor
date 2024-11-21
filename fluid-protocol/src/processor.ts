import { LogLevel } from '@sentio/sdk'
import { FuelNetwork } from '@sentio/sdk/fuel'

import { BorrowerOperationsContractProcessor } from './types/fuel/BorrowerOperationsContractProcessor.js'



BorrowerOperationsContractProcessor.bind({
  address: '0x243F0cfD08D66f077c6ec3D41740c9931e40a9ce48cd06Aa60B8FC59E63C6eB9',
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