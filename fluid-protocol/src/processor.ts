import { LogLevel } from '@sentio/sdk'
import { FuelNetwork } from '@sentio/sdk/fuel'
import { GLOBAL_CONFIG } from '@sentio/runtime'
import { BigDecimal } from '@sentio/sdk'
import { getPriceBySymbol } from '@sentio/sdk/utils'
import { BorrowerOperationsContractProcessor } from './types/fuel/BorrowerOperationsContractProcessor.js'
import { TroveManagerContractProcessor } from './types/fuel/TroveManagerContractProcessor.js'
import {
  PositionSnapshot,
  UserTrove,
  PoolSnapshot,
  Pool,
} from './schema/store.js'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
dayjs.extend(utc)

const ASSET_DECIMALS = BigInt(BigDecimal(10).pow(9).toNumber())
const ASSET_DECIMALS_BIGDECIMAL = BigDecimal(10).pow(9)

const USDM_ASSET_ID =
  '0x7efed96e7d5cc9bd6e96005ab85331ddf8b0a944cafd28012c6e674ccbce5a54'

const assets: { [key: string]: string } = {
  '0x03d707fef3a33c0b643cb8bef53d239e2561e307dac841f8ba7f0ac62d4fd8d1': 'ETH',
  '0xa5041f8b3e1ae962cb0b3fff8a882a17fe135db7d0b7b94c964049c69ba2ed42': 'FUEL',
  '0x22a4c76edce873781e94a33627170656a507e1badf906fabdbdfaa3b5165a38c':
    'STFUEL',
}

// asset id : trove manager
const troveManagers: { [key: string]: string } = {
  // ETH
  '0x03d707fef3a33c0b643cb8bef53d239e2561e307dac841f8ba7f0ac62d4fd8d1':
    '0x4fa56ee8ec817b31818407ba08c1a20c9d70cf0d245ce644d2ede713a50b4d58',
  // FUEL
  '0xa5041f8b3e1ae962cb0b3fff8a882a17fe135db7d0b7b94c964049c69ba2ed42':
    '0xc944cfeb826b3a62b648fe81e397256cc24364367089febcb40a96bb454f8b70',
  // STFUEL
  '0x978cae387eb0de30314aabbd109f6a7a2b0ead20d8d2157ca1956a131b05ca46': '',
}

for (const troveManagerAsset in troveManagers) {
  TroveManagerContractProcessor.bind({
    address: troveManagers[troveManagerAsset],
    chainId: FuelNetwork.TEST_NET,
  })
    .onLogRedemptionEvent(async (log, ctx) => {
      let timestamp = ctx.block?.time
      let assetPrice = await getPriceBySymbol(
        assets[troveManagerAsset],
        ctx.timestamp
      )
      if (!assetPrice) {
        assetPrice = 0
        //throw new Error(`No price found for ${String(troveManagerAsset)} at ${ctx.timestamp}`);
      }
      ctx.eventLogger.emit('troveRedeemed', {
        user: String(log.data.borrower.Address?.bits),
        asset_id: String(troveManagerAsset),
        collateral: String(log.data.collateral_amount),
        debt: String(log.data.usdm_amount),
        timestamp: String(timestamp),
      })
      const userTroveId = `${String(log.data.borrower.Address?.bits)}_${String(
        troveManagerAsset
      )}`
      let userTrove = (await ctx.store.get(UserTrove, userTroveId)) as UserTrove
      if (userTrove) {
        userTrove.total_collateral = userTrove.total_collateral.minus(
          BigDecimal(String(log.data.collateral_amount)).div(
            ASSET_DECIMALS_BIGDECIMAL
          )
        )
        userTrove.total_collateral_USD = userTrove.total_collateral_USD.minus(
          BigDecimal(String(log.data.collateral_amount))
            .div(ASSET_DECIMALS_BIGDECIMAL)
            .times(BigDecimal(assetPrice))
        )
        userTrove.total_debt = userTrove.total_debt.minus(
          BigDecimal(String(log.data.usdm_amount)).div(
            ASSET_DECIMALS_BIGDECIMAL
          )
        )
        // redemption fee is 1% of the collateral amount
        userTrove.redemptionFeesUsd = userTrove.redemptionFeesUsd.plus(
          BigDecimal(String(log.data.collateral_amount))
            .div(ASSET_DECIMALS_BIGDECIMAL)
            .times(BigDecimal(assetPrice))
            .times(BigDecimal(0.01))
        )
        await ctx.store.upsert(userTrove)
      }
    })
    .onLogTroveFullLiquidationEvent(async (log, ctx) => {
      let timestamp = ctx.block?.time
      ctx.eventLogger.emit('troveFullyLiquidated', {
        user: String(log.data.borrower.Address?.bits),
        asset_id: String(troveManagerAsset),
        collateral: String(log.data.collateral),
        debt: String(log.data.debt),
        timestamp: String(timestamp),
      })
      const userTroveId = `${String(log.data.borrower.Address?.bits)}_${String(
        troveManagerAsset
      )}`
      let userTrove = (await ctx.store.get(UserTrove, userTroveId)) as UserTrove
      if (userTrove) {
        const initialCollateralUSD = userTrove.total_collateral_USD
        userTrove.total_collateral = BigDecimal(String(0))
        userTrove.total_collateral_USD = BigDecimal(String(0))
        userTrove.total_debt = BigDecimal(String(0))
        // liquidation fee is 10% of the collateral amount, here it is the full collateral amount before the liquidation
        userTrove.liquidationFeesUsd = userTrove.liquidationFeesUsd.plus(
          initialCollateralUSD.times(BigDecimal(0.1))
        )
        await ctx.store.upsert(userTrove)
      }
    })
    .onLogTrovePartialLiquidationEvent(async (log, ctx) => {
      let assetPrice = await getPriceBySymbol(
        assets[troveManagerAsset],
        ctx.timestamp
      )
      if (!assetPrice) {
        assetPrice = 0
        //throw new Error(`No price found for ${String(troveManagerAsset)} at ${ctx.timestamp}`);
      }
      let timestamp = ctx.block?.time
      ctx.eventLogger.emit('trovePartiallyLiquidated', {
        user: String(log.data.borrower.Address?.bits),
        asset_id: String(troveManagerAsset),
        collateral: String(log.data.remaining_collateral),
        debt: String(log.data.remaining_debt),
        timestamp: String(timestamp),
      })
      const userTroveId = `${String(log.data.borrower.Address?.bits)}_${String(
        troveManagerAsset
      )}`
      let userTrove = (await ctx.store.get(UserTrove, userTroveId)) as UserTrove
      if (userTrove) {
        const initialCollateralUSD = userTrove.total_collateral_USD
        userTrove.total_collateral = BigDecimal(
          String(log.data.remaining_collateral)
        ).div(ASSET_DECIMALS_BIGDECIMAL)
        userTrove.total_collateral_USD = BigDecimal(
          String(log.data.remaining_collateral)
        )
          .div(ASSET_DECIMALS_BIGDECIMAL)
          .times(BigDecimal(assetPrice))
        userTrove.total_debt = BigDecimal(String(log.data.remaining_debt)).div(
          ASSET_DECIMALS_BIGDECIMAL
        )
        // liquidation fee is 10% of the collateral amount, for partial liquidation here it is the initial collateral - remaining collateral to get the change in collateral
        userTrove.liquidationFeesUsd = userTrove.liquidationFeesUsd.plus(
          initialCollateralUSD
            .minus(userTrove.total_collateral_USD)
            .times(BigDecimal(0.1))
        )
        await ctx.store.upsert(userTrove)
      }
    })
}

BorrowerOperationsContractProcessor.bind({
  address: '0x783c5e5ea9a84350cfced8e217049a9f0ad70b11aaf42fc9ed9fd671bb401f97',
  chainId: FuelNetwork.TEST_NET,
})
  .onTransaction(
    async (tx, ctx) => {
      ctx.eventLogger.emit('transaction', {
        distinctId: tx.id,
        message: 'Transaction processed',
        properties: {
          fee: tx.fee.toNumber(),
        },
        severity: tx.status === 'success' ? LogLevel.INFO : LogLevel.ERROR,
      })
    },
    { includeFailed: true }
  )
  .onLogOpenTroveEvent(async (log, ctx) => {
    let assetPrice = await getPriceBySymbol(
      assets[log.data.asset_id.bits],
      ctx.timestamp
    )
    if (!assetPrice) {
      assetPrice = 0
      //throw new Error(`No price found for ${String(log.data.asset_id.bits)} at ${ctx.timestamp}`);
    }
    let timestamp = ctx.block?.time
    ctx.eventLogger.emit('troveOpened', {
      user: String(log.data.user.Address?.bits),
      asset_id: String(log.data.asset_id.bits),
      collateral: String(log.data.collateral),
      debt: String(log.data.debt),
      timestamp: String(timestamp),
    })
    const userTroveId = `${String(log.data.user.Address?.bits)}_${String(
      log.data.asset_id.bits
    )}`
    // 0.5% borrow fee on USDM
    const userTrove = new UserTrove({
      id: userTroveId,
      address: String(log.data.user.Address?.bits),
      assetId: String(log.data.asset_id.bits),
      timestamp: dayjs(ctx.timestamp.getTime()).utc().unix(),
      total_collateral: BigDecimal(String(log.data.collateral)).div(
        ASSET_DECIMALS_BIGDECIMAL
      ),
      total_collateral_USD: BigDecimal(String(log.data.collateral))
        .div(ASSET_DECIMALS_BIGDECIMAL)
        .times(BigDecimal(assetPrice)),
      total_debt: BigDecimal(String(log.data.debt)).div(
        ASSET_DECIMALS_BIGDECIMAL
      ),
      liquidationFeesUsd: BigDecimal(0),
      redemptionFeesUsd: BigDecimal(0),
      borrowFeesUsd: BigDecimal(String(log.data.debt))
        .div(ASSET_DECIMALS_BIGDECIMAL)
        .times(BigDecimal(0.005)),
    })

    await ctx.store.upsert(userTrove)
  })
  .onLogCloseTroveEvent(async (log, ctx) => {
    let assetPrice = await getPriceBySymbol(
      assets[log.data.asset_id.bits],
      ctx.timestamp
    )
    if (!assetPrice) {
      assetPrice = 0
      //throw new Error(`No price found for ${String(log.data.asset_id.bits)} at ${ctx.timestamp}`);
    }
    let timestamp = ctx.block?.time
    ctx.eventLogger.emit('troveClosed', {
      user: String(log.data.user.Address?.bits),
      asset_id: String(log.data.asset_id.bits),
      collateral: String(log.data.collateral),
      debt: String(log.data.debt),
      timestamp: String(timestamp),
    })
    const userTroveId = `${String(log.data.user.Address?.bits)}_${String(
      log.data.asset_id.bits
    )}`
    let userTrove = (await ctx.store.get(UserTrove, userTroveId)) as UserTrove
    if (userTrove) {
      userTrove.total_collateral = BigDecimal(0)
      userTrove.total_collateral_USD = BigDecimal(0)
      userTrove.total_debt = BigDecimal(0)
      await ctx.store.upsert(userTrove)
    }
  })
  .onLogAdjustTroveEvent(async (log, ctx) => {
    let assetPrice = await getPriceBySymbol(
      assets[log.data.asset_id.bits],
      ctx.timestamp
    )
    if (!assetPrice) {
      assetPrice = 0
      //throw new Error(`No price found for ${String(log.data.asset_id.bits)} at ${ctx.timestamp}`);
    }
    let timestamp = ctx.block?.time
    ctx.eventLogger.emit('troveAdjusted', {
      user: String(log.data.user.Address?.bits),
      asset_id: String(log.data.asset_id.bits),
      collateral_change: String(log.data.collateral_change),
      is_debt_increase: String(log.data.is_debt_increase),
      debt_change: String(log.data.debt_change),
      timestamp: String(timestamp),
      total_collateral: String(log.data.total_collateral),
      total_debt: String(log.data.total_debt),
    })
    const userTroveId = `${String(log.data.user.Address?.bits)}_${String(
      log.data.asset_id.bits
    )}`
    let userTrove = (await ctx.store.get(UserTrove, userTroveId)) as UserTrove
    if (userTrove) {
      const initialDebt = userTrove.total_debt
      userTrove.total_collateral = BigDecimal(
        String(log.data.total_collateral)
      ).div(ASSET_DECIMALS_BIGDECIMAL)
      userTrove.total_collateral_USD = BigDecimal(
        String(log.data.total_collateral)
      )
        .div(ASSET_DECIMALS_BIGDECIMAL)
        .times(BigDecimal(assetPrice))
      userTrove.total_debt = BigDecimal(String(log.data.total_debt)).div(
        ASSET_DECIMALS_BIGDECIMAL
      )
      // borrow fee if more USDM is borrowed
      if (initialDebt < userTrove.total_debt) {
        userTrove.borrowFeesUsd = userTrove.borrowFeesUsd.plus(
          userTrove.total_debt.minus(initialDebt).times(BigDecimal(0.005))
        )
      }
      await ctx.store.upsert(userTrove)
    }
  })
  .onTimeInterval(
    async (_, ctx) => {
      const START_TIME = dayjs(ctx.timestamp.getTime()).utc()
      const START_TIME_UNIX = START_TIME.unix()
      const START_TIME_FORMATED = START_TIME.format('YYYY-MM-DD HH:00:00')

      for (const asset in troveManagers) {
        const poolId = `${String(troveManagers[asset])}`
        let pool = (await ctx.store.get(Pool, poolId)) as Pool
        if (!pool) {
          pool = new Pool({
            id: String(troveManagers[asset]),
            timestamp: START_TIME_UNIX,
            creation_block_number: Number(ctx.transaction?.blockNumber),
            chainId: 9889,
            underlying_token_address: String(asset),
            underlying_token_symbol: assets[asset],
            receipt_token_address: String(''),
            receipt_token_symbol: String(''),
            pool_address: String(troveManagers[asset]),
            pool_type: 'cdp',
          })
          await ctx.store.upsert(pool)
        }
      }

      const userTroves = (await ctx.store.list(UserTrove)) as UserTrove[]

      const assetData = [
        {
          symbol: 'ETH',
          assetId:
            '0x03d707fef3a33c0b643cb8bef53d239e2561e307dac841f8ba7f0ac62d4fd8d1',
        },
        {
          symbol: 'FUEL',
          assetId:
            '0xa5041f8b3e1ae962cb0b3fff8a882a17fe135db7d0b7b94c964049c69ba2ed42',
        },
        {
          symbol: 'STFUEL',
          assetId:
            '0x22a4c76edce873781e94a33627170656a507e1badf906fabdbdfaa3b5165a38c',
        },
      ]

      let totalTroveData: { [key: string]: { [key: string]: any } } = {}
      assetData.map((asset) => {
        totalTroveData[asset.assetId] = {
          symbol: asset.symbol,
          total_collateral: BigDecimal(0),
          total_collateral_USD: BigDecimal(0),
          total_debt: BigDecimal(0),
          borrowFeesUsd: BigDecimal(0),
          liquidationFeesUsd: BigDecimal(0),
          redemptionFeesUsd: BigDecimal(0),
        }
      })

      for (const userTrove of userTroves as UserTrove[]) {
        let assetPrice = await getPriceBySymbol(
          assets[userTrove.assetId],
          ctx.timestamp
        )
        if (!assetPrice) {
          assetPrice = 0
          // throw new Error(`No price found for ${String(userTrove.assetId)} at ${ctx.timestamp}`);
        }
        const newPositionSnapshotCollateralId = `${userTrove.address}_${userTrove.assetId}_${START_TIME_FORMATED}_collateral`
        const newPositionSnapshotCollateral = new PositionSnapshot({
          id: newPositionSnapshotCollateralId,
          timestamp: START_TIME_UNIX,
          blockDate: START_TIME_FORMATED,
          chainId: 9889,
          poolAddress: userTrove.assetId,
          underlyingTokenAddress: userTrove.assetId,
          underlyingTokenSymbol: assets[userTrove.assetId] || 'NA',
          userAddress: userTrove.address,
          suppliedAmount: userTrove.total_collateral,
          suppliedAmountUsd: BigDecimal(
            userTrove.total_collateral.toString()
          ).times(BigDecimal(assetPrice)),
          borrowed_amount_usd: BigDecimal(0),
          borrowed_amount: BigDecimal(0),
          collateralAmount: userTrove.total_collateral,
          collateralAmountUsd: BigDecimal(
            userTrove.total_collateral.toString()
          ).times(BigDecimal(assetPrice)),
        })
        const newPositionSnapshotDebtId = `${userTrove.address}_${userTrove.assetId}_${START_TIME_FORMATED}_debt`
        const newPositionSnapshotDebt = new PositionSnapshot({
          id: newPositionSnapshotDebtId,
          timestamp: START_TIME_UNIX,
          blockDate: START_TIME_FORMATED,
          chainId: 9889,
          poolAddress: userTrove.assetId,
          underlyingTokenAddress: USDM_ASSET_ID,
          underlyingTokenSymbol: 'USDM',
          userAddress: userTrove.address,
          suppliedAmount: BigDecimal(0),
          suppliedAmountUsd: BigDecimal(0),
          borrowed_amount_usd: BigDecimal(userTrove.total_debt),
          borrowed_amount: userTrove.total_debt,
          collateralAmount: BigDecimal(0),
          collateralAmountUsd: BigDecimal(0),
        })

        totalTroveData[userTrove.assetId].total_collateral = totalTroveData[
          userTrove.assetId
        ].total_collateral.plus(userTrove.total_collateral)
        totalTroveData[userTrove.assetId].total_collateral_USD = totalTroveData[
          userTrove.assetId
        ].total_collateral_USD.plus(
          BigDecimal(userTrove.total_collateral.toString()).times(
            BigDecimal(assetPrice)
          )
        )
        totalTroveData[userTrove.assetId].total_debt = totalTroveData[
          userTrove.assetId
        ].total_debt.plus(userTrove.total_debt)
        totalTroveData[userTrove.assetId].borrowFeesUsd = totalTroveData[
          userTrove.assetId
        ].borrowFeesUsd.plus(userTrove.borrowFeesUsd)
        totalTroveData[userTrove.assetId].liquidationFeesUsd = totalTroveData[
          userTrove.assetId
        ].liquidationFeesUsd.plus(userTrove.liquidationFeesUsd)
        totalTroveData[userTrove.assetId].redemptionFeesUsd = totalTroveData[
          userTrove.assetId
        ].redemptionFeesUsd.plus(userTrove.redemptionFeesUsd)

        await ctx.store.upsert(newPositionSnapshotCollateral)
        await ctx.store.upsert(newPositionSnapshotDebt)
      }

      for (const troveData in totalTroveData) {
        let assetPrice = await getPriceBySymbol(
          assets[troveData],
          ctx.timestamp
        )
        if (!assetPrice) {
          assetPrice = 0
          // throw new Error(`No price found for ${String(assets[troveData])} at ${ctx.timestamp}`);
        }
        const newPoolSnapshotCollateralId = `${troveData}_${START_TIME_FORMATED}_collateral`
        const newPoolSnapshotCollateral = new PoolSnapshot({
          id: newPoolSnapshotCollateralId,
          timestamp: START_TIME_UNIX,
          blockDate: START_TIME_FORMATED,
          chainId: 9889,
          poolAddress: String(troveData),
          underlyingTokenAddress: String(troveData),
          underlyingTokenSymbol: String(totalTroveData[troveData].symbol),
          underlyingTokenPriceUsd: BigDecimal(assetPrice), // need to add this
          availableAmount: BigDecimal(0), // unlimited amount available
          availableAmountUsd: BigDecimal(0), // same
          suppliedAmount: BigDecimal(
            totalTroveData[troveData].total_collateral
          ),
          suppliedAmountUsd: BigDecimal(
            totalTroveData[troveData].total_collateral_USD
          ),
          collateralAmount: BigDecimal(
            totalTroveData[troveData].total_collateral
          ),
          collateralAmountUsd: BigDecimal(
            totalTroveData[troveData].total_collateral_USD
          ),
          collateralFactor: BigDecimal(0), //?
          supplyIndex: BigDecimal(0), //?
          supplyApr: BigDecimal(0), //no APR, fixed fee model
          borrowed_amount_usd: BigDecimal(0),
          borrowed_amount: BigDecimal(0),
          borrowIndex: BigDecimal(0), //?
          borrowApr: BigDecimal(0), //no APR, fixed fee model
          totalFeesUsd: totalTroveData[troveData].liquidationFeesUsd.plus(
            totalTroveData[troveData].redemptionFeesUsd
          ),
          userFeesUsd: totalTroveData[troveData].liquidationFeesUsd.plus(
            totalTroveData[troveData].redemptionFeesUsd
          ),
          protocolFeesUsd: BigDecimal(0),
        })
        const newPoolSnapshotDebtId = `${troveData}_${START_TIME_FORMATED}_debt`
        const newPoolSnapshotDebt = new PoolSnapshot({
          id: newPoolSnapshotDebtId,
          timestamp: START_TIME_UNIX,
          blockDate: START_TIME_FORMATED,
          chainId: 9889,
          poolAddress: String(troveData),
          underlyingTokenAddress: String(USDM_ASSET_ID),
          underlyingTokenSymbol: String('USDM'),
          underlyingTokenPriceUsd: BigDecimal(1), // need to add this
          availableAmount: BigDecimal(0), // unlimited amount available
          availableAmountUsd: BigDecimal(0), // same
          suppliedAmount: BigDecimal(0),
          suppliedAmountUsd: BigDecimal(0),
          collateralAmount: BigDecimal(0),
          collateralAmountUsd: BigDecimal(0),
          collateralFactor: BigDecimal(0), //?
          supplyIndex: BigDecimal(0), //?
          supplyApr: BigDecimal(0), //no APR, fixed fee model
          borrowed_amount_usd: BigDecimal(totalTroveData[troveData].total_debt),
          borrowed_amount: BigDecimal(totalTroveData[troveData].total_debt),
          borrowIndex: BigDecimal(0), //?
          borrowApr: BigDecimal(0), //no APR, fixed fee model
          totalFeesUsd: totalTroveData[troveData].borrowFeesUsd,
          userFeesUsd: totalTroveData[troveData].borrowFeesUsd,
          protocolFeesUsd: BigDecimal(0),
        })
        await ctx.store.upsert(newPoolSnapshotCollateral)
        await ctx.store.upsert(newPoolSnapshotDebt)
      }
    },
    60,
    60
  )
