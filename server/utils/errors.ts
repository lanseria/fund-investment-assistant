// server/utils/errors.ts

export class HoldingExistsError extends Error {
  constructor(code: string) {
    super(`您已持有该基金(代码: ${code})，请勿重复添加。`)
    this.name = 'HoldingExistsError'
  }
}

export class FundNotFoundError extends Error {
  constructor(code: string) {
    super(`未在系统中找到基金代码为 '${code}' 的信息。`)
    this.name = 'FundNotFoundError'
  }
}

export class HoldingNotFoundError extends Error {
  constructor(code: string) {
    super(`您未持有基金代码为 '${code}' 的持仓记录。`)
    this.name = 'HoldingNotFoundError'
  }
}
