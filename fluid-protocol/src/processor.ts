import { LogLevel } from '@sentio/sdk'
import { FuelNetwork } from '@sentio/sdk/fuel'

import { BorrowerOperationsContractProcessor } from './types/fuel/BorrowerOperationsContractProcessor.js'

BorrowerOperationsContractProcessor.bind({
  address: '0xfFCDa9Bb2A36DF1D1B469A4e6c4799BDf44a7A5E7288FE89901C7bd8f08A2B19',//'fuel1llx6nwe2xm036x6xnf8xc3uehh6y57j7w2y0azvsr3aa3uy29vvstlyk37',
  chainId: FuelNetwork.TEST_NET
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
/* .onLogFoo(async (log, ctx) => {
   // you can also call ctx.contract.functions.complex(...)
   ctx.meter.Counter('fooLogged').add(1, { baz: String(log.data.baz) })
 })*/
