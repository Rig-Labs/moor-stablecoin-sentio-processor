import { LogLevel } from '@sentio/sdk'
import { FuelNetwork } from '@sentio/sdk/fuel'
import { GLOBAL_CONFIG } from '@sentio/runtime';
import { BigDecimal } from '@sentio/sdk';
import { getPriceBySymbol } from '@sentio/sdk/utils';
import { BorrowerOperationsContractProcessor } from './types/fuel/BorrowerOperationsContractProcessor.js'
import { PositionSnapshot, UserTrove } from './schema/store.js'
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

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
    ctx.eventLogger.emit('troveOpened', {
      user: String(log.data.user),
      asset_id: String(log.data.asset_id),
      collateral: String(log.data.collateral),
      debt: String(log.data.debt),
      timestamp: String(timestamp)
    })
    // OBL note: here I will save a user trove
  })
  .onLogCloseTroveEvent(async (log, ctx) => {
    let timestamp = ctx.block?.time

    ctx.eventLogger.emit('troveClosed', {
      user: String(log.data.user),
      asset_id: String(log.data.asset_id),
      collateral: String(log.data.collateral),
      debt: String(log.data.debt),
      timestamp: String(timestamp)
    })
    // OBL note: here I will save a user trove
  })
  .onLogAdjustTroveEvent(async (log, ctx) => {
    let timestamp = ctx.block?.time
    ctx.eventLogger.emit('troveAdjusted', {
      user: String(log.data.user),
      asset_id: String(log.data.asset_id),
      collateral_change: String(log.data.collateral_change),
      is_debt_increase: String(log.data.is_debt_increase),
      debt_change: String(log.data.debt_change),
      timestamp: String(timestamp),
      total_collateral: String(log.data.total_collateral),
      total_debt: String(log.data.total_debt)
    })
    // OBL note: here I will save a user trove
  }).onTimeInterval(async (_, ctx) => {
    const START_TIME = dayjs(ctx.timestamp.getTime()).utc();
    const START_TIME_UNIX = START_TIME.unix();
    const START_TIME_FORMATED = START_TIME.format('YYYY-MM-DD HH:00:00');

    //OBL note: here we should loop through each trove and create a position snapshot for each


    const newPositionSnapshotId = `${user}_${collateral}`;
    const newPositionSnapshot = new PositionSnapshot({
      id: newPositionSnapshotId,
      timestamp: START_TIME_UNIX,
      blockDate: START_TIME_FORMATED,
      chainId: chainId,
      poolAddress: userBasic.contractAddress,
      underlyingTokenAddress: underlyingTokenAddress,
      underlyingTokenSymbol: appConfig.assets[underlyingTokenAddress],
      userAddress: userBasic.address,
      suppliedAmount: suppliedAmount,
      suppliedAmountNormalized: suppliedAmountNormalized,
      suppliedAmountUsd: suppliedAmountNormalized.times(basePrice),
      borrowedAmount: borrowedAmount,
      borrowedAmountNormalized: borrowedAmountNormalized,
      borrowedAmountUsd: borrowedAmountNormalized.times(basePrice),
      collateralAmount: 0n,
      collateralAmountNormalized: BigDecimal(0),
      collateralAmountUsd: BigDecimal(0),
    });

    await ctx.store.upsert(newPositionSnapshot);
  },
    60,
    60
  );