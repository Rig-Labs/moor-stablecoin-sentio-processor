import type { String, Int, BigInt, Float, ID, Bytes, Timestamp, Boolean } from '@sentio/sdk/store'
import { Entity, Required, One, Many, Column, ListColumn, AbstractEntity } from '@sentio/sdk/store'
import { BigDecimal } from '@sentio/bigdecimal'
import { DatabaseSchema } from '@sentio/sdk'


@Entity("UserBasic")
export class UserTrove extends AbstractEntity {

    @Required
    @Column("ID")
    id: ID

    @Required
    @Column("String")
    address: String

    @Required
    @Column("String")
    assetId: String

    @Required
    @Column("Int")
    timestamp: Int

    @Required
    @Column("BigInt")
    total_collateral: BigInt

    @Required
    @Column("BigInt")
    total_collateral_USD: BigInt

    @Required
    @Column("BigInt")
    total_debt: BigInt
    constructor(data: Partial<UserTrove>) { super() }
}

@Entity("PositionSnapshot")
export class PositionSnapshot extends AbstractEntity {

    @Required
    @Column("ID")
    id: ID

    @Required
    @Column("Int")
    timestamp: Int

    @Required
    @Column("String")
    blockDate: String

    @Required
    @Column("Int")
    chainId: Int

    @Required
    @Column("String")
    poolAddress: String

    @Required
    @Column("String")
    underlyingTokenAddress: String

    @Required
    @Column("String")
    underlyingTokenSymbol: String

    @Required
    @Column("String")
    userAddress: String

    @Required
    @Column("BigInt")
    suppliedAmount: BigInt

    @Required
    @Column("BigDecimal")
    suppliedAmountNormalized: BigDecimal

    @Column("BigDecimal")
    suppliedAmountUsd?: BigDecimal

    @Required
    @Column("BigInt")
    borrowedAmount: BigInt

    @Required
    @Column("BigDecimal")
    borrowedAmountNormalized: BigDecimal

    @Column("BigDecimal")
    borrowedAmountUsd?: BigDecimal

    @Required
    @Column("BigInt")
    collateralAmount: BigInt

    @Required
    @Column("BigDecimal")
    collateralAmountNormalized: BigDecimal

    @Column("BigDecimal")
    collateralAmountUsd?: BigDecimal
    constructor(data: Partial<PositionSnapshot>) { super() }
}




const source = `
# User base asset state
type UserTrove @entity {
    id: ID!
    address: String!
    assetId: String!
    timestamp: Int!
    total_collateral: BigInt!
    total_collateral_USD: BigInt!
    total_debt: BigInt!
}

# positon snapshot
type PositionSnapshot @entity {
    id: ID!
    timestamp: Int!
    blockDate: String!
    chainId: Int!
    poolAddress: String!
    underlyingTokenAddress: String!
    underlyingTokenSymbol: String!
    userAddress: String!
    suppliedAmount: BigInt!
    suppliedAmountNormalized: BigDecimal!
    suppliedAmountUsd: BigDecimal
    borrowedAmount: BigInt!
    borrowedAmountNormalized: BigDecimal!
    borrowedAmountUsd: BigDecimal
    collateralAmount: BigInt!
    collateralAmountNormalized: BigDecimal!
    collateralAmountUsd: BigDecimal
}`
DatabaseSchema.register({
    source,
    entities: {
        "UserTrove": UserTrove,
        "PositionSnapshot": PositionSnapshot,
    }
})