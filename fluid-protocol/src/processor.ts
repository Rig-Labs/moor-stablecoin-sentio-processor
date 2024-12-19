import { LogLevel } from '@sentio/sdk'
import { FuelNetwork } from '@sentio/sdk/fuel'
import { GLOBAL_CONFIG } from '@sentio/runtime';
import { BigDecimal } from '@sentio/sdk';
import { getPriceBySymbol } from '@sentio/sdk/utils';
import { BorrowerOperationsContractProcessor } from './types/fuel/BorrowerOperationsContractProcessor.js'
import { TroveManagerContractProcessor } from './types/fuel/TroveManagerContractProcessor.js'
import { PositionSnapshot, UserTrove, PoolSnapshot, Pool } from './schema/store.js'
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
dayjs.extend(utc);

const ASSET_DECIMALS = BigInt(BigDecimal(10).pow(9).toNumber());
const ASSET_DECIMALS_BIGDECIMAL = BigDecimal(10).pow(9);

const USDF_ASSET_ID = '0x33a6d90877f12c7954cca6d65587c25e9214c7bed2231c188981c7114c1bdb78';

const assets: { [key: string]: string } = {
  '0xafd219f513317b1750783c6581f55530d6cf189a5863fd18bd1b3ffcec1714b4': 'METH',
  '0xbae80f7fb8aa6b90d9b01ef726ec847cc4f59419c4d5f2ea88fec785d1b0e849': 'RSETH',
  '0x239ed6e12b7ce4089ee245244e3bf906999a6429c2a9a445a1e1faf56914a4ab': 'WEETH',
  '0x91b3559edb2619cde8ffb2aa7b3c3be97efd794ea46700db7092abeee62281b0': 'EZETH',
  '0x1a7815cc9f75db5c24a5b0814bfb706bb9fe485333e98254015de8f48f84c67b': 'WSTETH',
  '0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07': 'ETH'
}

// asset id : trove manager
const troveManagers: { [key: string]: string } = {
  '0xafd219f513317b1750783c6581f55530d6cf189a5863fd18bd1b3ffcec1714b4': '0xbf4f95ed50406883cbebc24d77373b680c08d221b7c2b8ec2cfa25ca5ae1a4da',
  '0xbae80f7fb8aa6b90d9b01ef726ec847cc4f59419c4d5f2ea88fec785d1b0e849': '0x27c09effd480db99bf4282e7c75cf6e351394899ea5a892d01dcb3755eb9e465',
  '0x239ed6e12b7ce4089ee245244e3bf906999a6429c2a9a445a1e1faf56914a4ab': '0x2d21530dc1541f41b5d52d8827f253c7e5e2a279d7a163b73e6603023ae66f7c',
  '0x91b3559edb2619cde8ffb2aa7b3c3be97efd794ea46700db7092abeee62281b0': '0x49b7038d24cce22e3334364bec11bb46cf2c8d26c375a0d2e37a6b4b82bf9882',
  '0x1a7815cc9f75db5c24a5b0814bfb706bb9fe485333e98254015de8f48f84c67b': '0xffc850dbd9caa2522a805e433f12b984c046721f811d9075533b71bdeaa801bd',
  '0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07': '0x9b5d22616252053eebfddad7289b66ad6d9f24237d05ac249084c432d52eccfd'
}

for (const troveManagerAsset in troveManagers) {
  TroveManagerContractProcessor.bind({
    address: troveManagers[troveManagerAsset],
    chainId: FuelNetwork.MAIN_NET
  }).onLogRedemptionEvent(async (log, ctx) => {
    let timestamp = ctx.block?.time
    const assetPrice = await getPriceBySymbol(assets[troveManagerAsset], ctx.timestamp);
    if (!assetPrice) {
      throw new Error(`No price found for ${String(troveManagerAsset)} at ${ctx.timestamp}`);
    }
    ctx.eventLogger.emit('troveRedeemed', {
      user: String(log.data.borrower.Address?.bits),
      asset_id: String(troveManagerAsset),
      collateral: String(log.data.collateral_amount),
      debt: String(log.data.usdf_amount),
      timestamp: String(timestamp)
    })
    const userTroveId = `${String(log.data.borrower.Address?.bits)}_${String(troveManagerAsset)}`;
    let userTrove = await ctx.store.get(UserTrove, userTroveId) as UserTrove;
    if (userTrove) {
      userTrove.total_collateral = BigDecimal(String(log.data.collateral_amount)).div(ASSET_DECIMALS_BIGDECIMAL);
      userTrove.total_collateral_USD = BigDecimal(String(log.data.collateral_amount)).div(ASSET_DECIMALS_BIGDECIMAL).times(BigDecimal(assetPrice));
      userTrove.total_debt = BigDecimal(String(log.data.usdf_amount)).div(ASSET_DECIMALS_BIGDECIMAL);
      await ctx.store.upsert(userTrove);
    }
  }).onLogTroveFullLiquidationEvent(async (log, ctx) => {
    let timestamp = ctx.block?.time
    ctx.eventLogger.emit('troveFullyLiquidated', {
      user: String(log.data.borrower.Address?.bits),
      asset_id: String(troveManagerAsset),
      collateral: String(log.data.collateral),
      debt: String(log.data.debt),
      timestamp: String(timestamp)
    })
    const userTroveId = `${String(log.data.borrower.Address?.bits)}_${String(troveManagerAsset)}`;
    let userTrove = await ctx.store.get(UserTrove, userTroveId) as UserTrove;
    if (userTrove) {
      userTrove.total_collateral = BigDecimal(String(0));
      userTrove.total_collateral_USD = BigDecimal(String(0));
      userTrove.total_debt = BigDecimal(String(0));
      await ctx.store.upsert(userTrove);
    }
  }).onLogTrovePartialLiquidationEvent(async (log, ctx) => {
    const assetPrice = await getPriceBySymbol(assets[troveManagerAsset], ctx.timestamp);
    if (!assetPrice) {
      throw new Error(`No price found for ${String(troveManagerAsset)} at ${ctx.timestamp}`);
    }
    let timestamp = ctx.block?.time
    ctx.eventLogger.emit('trovePartiallyLiquidated', {
      user: String(log.data.borrower.Address?.bits),
      asset_id: String(troveManagerAsset),
      collateral: String(log.data.remaining_collateral),
      debt: String(log.data.remaining_debt),
      timestamp: String(timestamp)
    })
    const userTroveId = `${String(log.data.borrower.Address?.bits)}_${String(troveManagerAsset)}`;
    let userTrove = await ctx.store.get(UserTrove, userTroveId) as UserTrove;
    if (userTrove) {
      userTrove.total_collateral = BigDecimal(String(log.data.remaining_collateral)).div(ASSET_DECIMALS_BIGDECIMAL);
      userTrove.total_collateral_USD = BigDecimal(String(log.data.remaining_collateral)).div(ASSET_DECIMALS_BIGDECIMAL).times(BigDecimal(assetPrice));
      userTrove.total_debt = BigDecimal(String(log.data.remaining_debt)).div(ASSET_DECIMALS_BIGDECIMAL);
      await ctx.store.upsert(userTrove);
    }
  })
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
    const assetPrice = await getPriceBySymbol(assets[log.data.asset_id.bits], ctx.timestamp);
    if (!assetPrice) {
      throw new Error(`No price found for ${String(log.data.asset_id.bits)} at ${ctx.timestamp}`);
    }
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
      total_collateral: BigDecimal(String(log.data.collateral)).div(ASSET_DECIMALS_BIGDECIMAL),
      total_collateral_USD: BigDecimal(String(log.data.collateral)).div(ASSET_DECIMALS_BIGDECIMAL).times(BigDecimal(assetPrice)),
      total_debt: BigDecimal(String(log.data.debt)).div(ASSET_DECIMALS_BIGDECIMAL)
    });

    await ctx.store.upsert(userTrove);
  })
  .onLogCloseTroveEvent(async (log, ctx) => {
    const assetPrice = await getPriceBySymbol(assets[log.data.asset_id.bits], ctx.timestamp);
    if (!assetPrice) {
      throw new Error(`No price found for ${String(log.data.asset_id.bits)} at ${ctx.timestamp}`);
    }
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
      userTrove.total_collateral = BigDecimal(0);
      userTrove.total_collateral_USD = BigDecimal(0);
      userTrove.total_debt = BigDecimal(0);
      await ctx.store.upsert(userTrove);
    }
  })
  .onLogAdjustTroveEvent(async (log, ctx) => {
    const assetPrice = await getPriceBySymbol(assets[log.data.asset_id.bits], ctx.timestamp);
    if (!assetPrice) {
      throw new Error(`No price found for ${String(log.data.asset_id.bits)} at ${ctx.timestamp}`);
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
      total_debt: String(log.data.total_debt)
    })
    const userTroveId = `${String(log.data.user.Address?.bits)}_${String(log.data.asset_id.bits)}`;
    let userTrove = await ctx.store.get(UserTrove, userTroveId) as UserTrove;
    if (userTrove) {
      userTrove.total_collateral = BigDecimal(String(log.data.total_collateral)).div(ASSET_DECIMALS_BIGDECIMAL);
      userTrove.total_collateral_USD = BigDecimal(String(log.data.total_collateral)).div(ASSET_DECIMALS_BIGDECIMAL).times(BigDecimal(assetPrice));
      userTrove.total_debt = BigDecimal(String(log.data.total_debt)).div(ASSET_DECIMALS_BIGDECIMAL);
      await ctx.store.upsert(userTrove);
    }
  }).onTimeInterval(async (_, ctx) => {
    const START_TIME = dayjs(ctx.timestamp.getTime()).utc();
    const START_TIME_UNIX = START_TIME.unix();
    const START_TIME_FORMATED = START_TIME.format('YYYY-MM-DD HH:00:00');

    for (const asset in troveManagers) {
      const poolId = `${String(troveManagers[asset])}`;
      let pool = await ctx.store.get(Pool, poolId) as Pool;
      if (!pool) {
        pool = new Pool({
          id: String(troveManagers[asset]),
          timestamp: START_TIME_UNIX,
          creation_block_number: Number(ctx.transaction?.blockNumber),
          chainId: 9889,
          underlying_token_address: String(asset),
          underlying_token_symbol: assets[asset],
          receipt_token_address: String(""),
          receipt_token_symbol: String(""),
          pool_address: String(troveManagers[asset]),
          pool_type: 'cdp'
        });
        await ctx.store.upsert(pool);
      }
    }

    const userTroves = await ctx.store.list(UserTrove) as UserTrove[];

    let totalTroveData: { [key: string]: { [key: string]: any } } = {
      '0xafd219f513317b1750783c6581f55530d6cf189a5863fd18bd1b3ffcec1714b4': {
        symbol: 'METH',
        total_collateral: BigDecimal(0),
        total_collateral_USD: BigDecimal(0),
        total_debt: BigDecimal(0)
      },
      '0xbae80f7fb8aa6b90d9b01ef726ec847cc4f59419c4d5f2ea88fec785d1b0e849': {
        symbol: 'RSETH',
        total_collateral: BigDecimal(0),
        total_collateral_USD: BigDecimal(0),
        total_debt: BigDecimal(0)
      },
      '0x239ed6e12b7ce4089ee245244e3bf906999a6429c2a9a445a1e1faf56914a4ab': {
        symbol: 'WEETH',
        total_collateral: BigDecimal(0),
        total_collateral_USD: BigDecimal(0),
        total_debt: BigDecimal(0)
      },
      '0x91b3559edb2619cde8ffb2aa7b3c3be97efd794ea46700db7092abeee62281b0': {
        symbol: 'EZETH',
        total_collateral: BigDecimal(0),
        total_collateral_USD: BigDecimal(0),
        total_debt: BigDecimal(0)
      },
      '0x1a7815cc9f75db5c24a5b0814bfb706bb9fe485333e98254015de8f48f84c67b': {
        symbol: 'WSTETH',
        total_collateral: BigDecimal(0),
        total_collateral_USD: BigDecimal(0),
        total_debt: BigDecimal(0)
      },
      '0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07': {
        symbol: 'ETH',
        total_collateral: BigDecimal(0),
        total_collateral_USD: BigDecimal(0),
        total_debt: BigDecimal(0)
      }
    };

    for (const userTrove of userTroves as UserTrove[]) {
      const assetPrice = await getPriceBySymbol(assets[userTrove.assetId], ctx.timestamp);
      if (!assetPrice) {
        throw new Error(`No price found for ${String(userTrove.assetId)} at ${ctx.timestamp}`);
      }
      const newPositionSnapshotCollateralId = `${userTrove.address}_${userTrove.assetId}_${START_TIME_FORMATED}_collateral`;
      const newPositionSnapshotCollateral = new PositionSnapshot({
        id: newPositionSnapshotCollateralId,
        timestamp: START_TIME_UNIX,
        blockDate: START_TIME_FORMATED,
        chainId: 9889,
        poolAddress: userTrove.assetId,
        underlyingTokenAddress: userTrove.assetId,
        underlyingTokenSymbol: assets[userTrove.assetId] || "NA",
        userAddress: userTrove.address,
        suppliedAmount: userTrove.total_collateral,
        suppliedAmountUsd: BigDecimal(userTrove.total_collateral.toString()).times(BigDecimal(assetPrice)),
        borrowed_amount_usd: BigDecimal(0),
        borrowed_amount: BigDecimal(0),
        collateralAmount: userTrove.total_collateral,
        collateralAmountUsd: BigDecimal(userTrove.total_collateral.toString()).times(BigDecimal(assetPrice)),
      });
      const newPositionSnapshotDebtId = `${userTrove.address}_${userTrove.assetId}_${START_TIME_FORMATED}_debt`;
      const newPositionSnapshotDebt = new PositionSnapshot({
        id: newPositionSnapshotDebtId,
        timestamp: START_TIME_UNIX,
        blockDate: START_TIME_FORMATED,
        chainId: 9889,
        poolAddress: userTrove.assetId,
        underlyingTokenAddress: USDF_ASSET_ID,
        underlyingTokenSymbol: "USDF",
        userAddress: userTrove.address,
        suppliedAmount: BigDecimal(0),
        suppliedAmountUsd: BigDecimal(0),
        borrowed_amount_usd: BigDecimal(userTrove.total_debt),
        borrowed_amount: userTrove.total_debt,
        collateralAmount: BigDecimal(0),
        collateralAmountUsd: BigDecimal(0),
      });

      totalTroveData[userTrove.assetId].total_collateral = totalTroveData[userTrove.assetId].total_collateral.plus(userTrove.total_collateral);
      totalTroveData[userTrove.assetId].total_collateral_USD = totalTroveData[userTrove.assetId].total_collateral_USD.plus(BigDecimal(userTrove.total_collateral.toString()).times(BigDecimal(assetPrice)));
      totalTroveData[userTrove.assetId].total_debt = totalTroveData[userTrove.assetId].total_debt.plus(userTrove.total_debt);

      await ctx.store.upsert(newPositionSnapshotCollateral);
      await ctx.store.upsert(newPositionSnapshotDebt);
    }

    for (const troveData in totalTroveData) {
      const assetPrice = await getPriceBySymbol(assets[troveData], ctx.timestamp);
      if (!assetPrice) {
        throw new Error(`No price found for ${String(assets[troveData])} at ${ctx.timestamp}`);
      }
      const newPoolSnapshotCollateralId = `${troveData}_${START_TIME_FORMATED}_collateral`;
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
        suppliedAmount: BigDecimal(totalTroveData[troveData].total_collateral),
        suppliedAmountUsd: BigDecimal(totalTroveData[troveData].total_collateral_USD),
        collateralAmount: BigDecimal(totalTroveData[troveData].total_collateral),
        collateralAmountUsd: BigDecimal(totalTroveData[troveData].total_collateral_USD),
        collateralFactor: BigDecimal(0), //?
        supplyIndex: BigDecimal(0), //?
        supplyApr: BigDecimal(0), //no APR, fixed fee model
        borrowed_amount_usd: BigDecimal(0),
        borrowed_amount: BigDecimal(0),
        borrowIndex: BigDecimal(0), //?
        borrowApr: BigDecimal(0), //no APR, fixed fee model
        totalFeesUsd: BigDecimal(0), // for the purpose of fuel points program we don't need to index this
        userFeesUsd: BigDecimal(0), // for the purpose of fuel points program we don't need to index this
        protocolFeesUsd: BigDecimal(0) // for the purpose of fuel points program we don't need to index this
      })
      const newPoolSnapshotDebtId = `${troveData}_${START_TIME_FORMATED}_debt`;
      const newPoolSnapshotDebt = new PoolSnapshot({
        id: newPoolSnapshotDebtId,
        timestamp: START_TIME_UNIX,
        blockDate: START_TIME_FORMATED,
        chainId: 9889,
        poolAddress: String(troveData),
        underlyingTokenAddress: String(USDF_ASSET_ID),
        underlyingTokenSymbol: String("USDF"),
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
        totalFeesUsd: BigDecimal(0), // for the purpose of fuel points program we don't need to index this
        userFeesUsd: BigDecimal(0), // for the purpose of fuel points program we don't need to index this
        protocolFeesUsd: BigDecimal(0) // for the purpose of fuel points program we don't need to index this
      })
      await ctx.store.upsert(newPoolSnapshotCollateral);
      await ctx.store.upsert(newPoolSnapshotDebt);
    }
  },
    60,
    60
  );