import { LogLevel } from '@sentio/sdk'
import { FuelNetwork } from '@sentio/sdk/fuel'
import { GLOBAL_CONFIG } from '@sentio/runtime';
import { BigDecimal } from '@sentio/sdk';
import { getPriceBySymbol } from '@sentio/sdk/utils';
import { BorrowerOperationsContractProcessor } from './types/fuel/BorrowerOperationsContractProcessor.js'
import { PositionSnapshot, UserTrove, PoolSnapshot } from './schema/store.js'
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
dayjs.extend(utc);

const assets: { [key: string]: string } = {
  '0xafd219f513317b1750783c6581f55530d6cf189a5863fd18bd1b3ffcec1714b4': 'METH',
  '0xbae80f7fb8aa6b90d9b01ef726ec847cc4f59419c4d5f2ea88fec785d1b0e849': 'RSETH',
  '0x239ed6e12b7ce4089ee245244e3bf906999a6429c2a9a445a1e1faf56914a4ab': 'WEETH',
  '0x91b3559edb2619cde8ffb2aa7b3c3be97efd794ea46700db7092abeee62281b0': 'EZETH',
  '0x1a7815cc9f75db5c24a5b0814bfb706bb9fe485333e98254015de8f48f84c67b': 'WSTETH',
  '0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07': 'ETH'
}

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
      user: String(log.data.user.Address?.bits),
      asset_id: String(log.data.asset_id.bits),
      collateral: String(log.data.collateral),
      debt: String(log.data.debt),
      timestamp: String(timestamp)
    })
    const userTroveId = `${String(log.data.user.Address?.bits)}_${String(log.data.asset_id.bits)}`;
    const userTrove = new UserTrove({
      id: userTroveId,
      address: String(log.data.user.Address?.bits),
      assetId: String(log.data.asset_id.bits),
      timestamp: dayjs(ctx.timestamp.getTime()).utc().unix(),
      total_collateral: BigInt(String(log.data.collateral)),
      total_collateral_USD: BigInt(String(log.data.collateral)),
      total_debt: BigInt(String(log.data.debt))
    });

    await ctx.store.upsert(userTrove);
  })
  .onLogCloseTroveEvent(async (log, ctx) => {
    let timestamp = ctx.block?.time

    ctx.eventLogger.emit('troveClosed', {
      user: String(log.data.user.Address?.bits),
      asset_id: String(log.data.asset_id.bits),
      collateral: String(log.data.collateral),
      debt: String(log.data.debt),
      timestamp: String(timestamp)
    })

    const userTroveId = `${String(log.data.user.Address?.bits)}_${String(log.data.asset_id.bits)}`;
    let userTrove = await ctx.store.get(UserTrove, userTroveId) as UserTrove;
    if (userTrove) {
      userTrove.total_collateral = BigInt(String(log.data.collateral));
      userTrove.total_collateral_USD = BigInt(String(log.data.collateral));
      userTrove.total_debt = BigInt(String(log.data.debt));
      await ctx.store.upsert(userTrove);
    }
  })
  .onLogAdjustTroveEvent(async (log, ctx) => {
    let timestamp = ctx.block?.time
    ctx.eventLogger.emit('troveAdjusted', {
      user: String(log.data.user.Address?.bits),
      asset_id: String(log.data.asset_id.bits),
      collateral_change: String(log.data.collateral_change),
      is_debt_increase: String(log.data.is_debt_increase),
      debt_change: String(log.data.debt_change),
      timestamp: String(timestamp),
      total_collateral: String(log.data.total_collateral),
      total_debt: String(log.data.total_debt)
    })

    const userTroveId = `${String(log.data.user.Address?.bits)}_${String(log.data.asset_id.bits)}`;
    let userTrove = await ctx.store.get(UserTrove, userTroveId) as UserTrove;
    if (userTrove) {
      userTrove.total_collateral = BigInt(String(log.data.total_collateral));
      userTrove.total_collateral_USD = BigInt(String(log.data.total_collateral));
      userTrove.total_debt = BigInt(String(log.data.total_debt));
      await ctx.store.upsert(userTrove);
    }
  }).onTimeInterval(async (_, ctx) => {
    const START_TIME = dayjs(ctx.timestamp.getTime()).utc();
    const START_TIME_UNIX = START_TIME.unix();
    const START_TIME_FORMATED = START_TIME.format('YYYY-MM-DD HH:00:00');

    const userTroves = await ctx.store.list(UserTrove) as UserTrove[];

    let totalTroveData: { [key: string]: { [key: string]: any } } = {
      '0xafd219f513317b1750783c6581f55530d6cf189a5863fd18bd1b3ffcec1714b4': {
        symbol: 'METH',
        total_collateral: BigInt(0),
        total_collateral_USD: BigInt(0),
        total_debt: BigInt(0)
      },
      '0xbae80f7fb8aa6b90d9b01ef726ec847cc4f59419c4d5f2ea88fec785d1b0e849': {
        symbol: 'RSETH',
        total_collateral: BigInt(0),
        total_collateral_USD: BigInt(0),
        total_debt: BigInt(0)
      },
      '0x239ed6e12b7ce4089ee245244e3bf906999a6429c2a9a445a1e1faf56914a4ab': {
        symbol: 'WEETH',
        total_collateral: BigInt(0),
        total_collateral_USD: BigInt(0),
        total_debt: BigInt(0)
      },
      '0x91b3559edb2619cde8ffb2aa7b3c3be97efd794ea46700db7092abeee62281b0': {
        symbol: 'EZETH',
        total_collateral: BigInt(0),
        total_collateral_USD: BigInt(0),
        total_debt: BigInt(0)
      },
      '0x1a7815cc9f75db5c24a5b0814bfb706bb9fe485333e98254015de8f48f84c67b': {
        symbol: 'WSTETH',
        total_collateral: BigInt(0),
        total_collateral_USD: BigInt(0),
        total_debt: BigInt(0)
      },
      '0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07': {
        symbol: 'ETH',
        total_collateral: BigInt(0),
        total_collateral_USD: BigInt(0),
        total_debt: BigInt(0)
      }
    };

    for (const userTrove of userTroves as UserTrove[]) {
      const assetPrice = await getPriceBySymbol(assets[userTrove.assetId], ctx.timestamp);
      if (!assetPrice) {
        throw new Error(`No price found for ${String(userTrove.assetId)} at ${ctx.timestamp}`);
      }
      const newPositionSnapshotId = `${userTrove.address}_${userTrove.assetId}_${START_TIME_FORMATED}`;
      const newPositionSnapshot = new PositionSnapshot({
        id: newPositionSnapshotId,
        timestamp: START_TIME_UNIX,
        blockDate: START_TIME_FORMATED,
        chainId: 9889,
        poolAddress: userTrove.assetId,
        underlyingTokenAddress: userTrove.assetId,
        underlyingTokenSymbol: assets[userTrove.assetId] || "NA",
        userAddress: userTrove.address,
        suppliedAmount: userTrove.total_collateral,
        suppliedAmountUsd: BigDecimal(userTrove.total_collateral.toString()).times(BigDecimal(assetPrice)),
        borrowedAmount: userTrove.total_debt,
        borrowedAmountUsd: BigDecimal(userTrove.total_debt.toString()).times(BigDecimal(assetPrice)),
        collateralAmount: 0n, //Following convention from swaylend they put collateral as supply and leave collateral empty...
        collateralAmountUsd: BigDecimal(0),
      });

      totalTroveData[userTrove.assetId].total_collateral += userTrove.total_collateral;
      totalTroveData[userTrove.assetId].total_collateral_USD += userTrove.total_collateral_USD;
      totalTroveData[userTrove.assetId].total_debt += userTrove.total_debt;

      await ctx.store.upsert(newPositionSnapshot);
    }

    for (const troveData in totalTroveData) {
      const newPoolSnapshotId = `${troveData}_${START_TIME_FORMATED}`;
      const newPoolSnapshot = new PoolSnapshot({
        id: newPoolSnapshotId,
        timestamp: START_TIME_UNIX,
        blockDate: START_TIME_FORMATED,
        chainId: 9889,
        poolAddress: String(troveData),
        underlyingTokenAddress: String(troveData),
        underlyingTokenSymbol: String(totalTroveData[troveData].symbol),
        underlyingTokenPriceUsd: BigDecimal(0), // need to add this
        availableAmount: BigInt(0), // unlimited amount available
        availableAmountUsd: BigDecimal(0), // same
        suppliedAmount: BigInt(totalTroveData[troveData].total_collateral),
        suppliedAmountUsd: BigDecimal(totalTroveData[troveData].total_collateral_USD),
        collateralAmount: BigInt(totalTroveData[troveData].total_collateral),
        collateralAmountUsd: BigDecimal(totalTroveData[troveData].total_collateral_USD),
        collateralFactor: BigDecimal(0), //?
        supplyIndex: BigDecimal(0), //?
        supplyApr: BigDecimal(0), //no APR, fixed fee model
        borrowedAmount: BigInt(totalTroveData[troveData].total_debt),
        borrowedAmountUsd: BigDecimal(totalTroveData[troveData].total_debt_USD),
        borrowIndex: BigDecimal(0), //?
        borrowApr: BigDecimal(0), //no APR, fixed fee model
        totalFeesUsd: BigDecimal(0), // for the purpose of fuel points program we don't need to index this
        userFeesUsd: BigDecimal(0), // for the purpose of fuel points program we don't need to index this
        protocolFeesUsd: BigDecimal(0) // for the purpose of fuel points program we don't need to index this
      })
      await ctx.store.upsert(newPoolSnapshot);
    }
  },
    60,
    60
  );