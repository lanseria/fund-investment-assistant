/**
 * 板块名称映射表
 * 用于映射本地字典(value) 与 第三方平台(如东方财富、同花顺)上的板块名称
 * 外层 key 对应系统字典表中的 value
 */
export const SECTOR_PLATFORM_MAPPING: Record<string, { eastMoney: string[], tongHuaShun: string[] }> = {
  // --- 能源与资源 ---
  oil_gas_resources: {
    eastMoney: ['油气及炼化工程'],
    tongHuaShun: ['石油加工贸易'],
  },
  coal: {
    eastMoney: ['煤炭'],
    tongHuaShun: ['煤炭开采加工'],
  },
  nonferrous_metals: {
    eastMoney: ['有色金属'],
    tongHuaShun: ['工业金属'],
  },
  precious_metals: {
    eastMoney: ['贵金属'],
    tongHuaShun: ['贵金属'],
  },
  silver: {
    eastMoney: ['白银'],
    tongHuaShun: [],
  },

  // --- 化工与材料 ---
  chemicals: {
    eastMoney: ['基础化工'],
    tongHuaShun: ['化学原料'],
  },

  // --- 硬科技与半导体 ---
  semiconductors: {
    eastMoney: ['半导体'],
    tongHuaShun: ['半导体'],
  },
  semiconductor_equipment: {
    eastMoney: ['半导体设备'],
    tongHuaShun: ['半导体'],
  },
  chip_design: {
    eastMoney: ['半导体芯片设计'],
    tongHuaShun: ['半导体'],
  },
  memory_chips: {
    eastMoney: ['存储芯片'],
    tongHuaShun: [],
  },
  lithography_machine: {
    eastMoney: ['光刻机'],
    tongHuaShun: [],
  },
  consumer_electronics: {
    eastMoney: ['消费电子'],
    tongHuaShun: ['消费电子'],
  },

  // --- 通信与 AI ---
  communications: {
    eastMoney: ['通信'],
    tongHuaShun: ['通信设备'],
  },
  cpo_concept: {
    eastMoney: ['CPO概念'],
    tongHuaShun: [],
  },
  artificial_intelligence: {
    eastMoney: ['人工智能'],
    tongHuaShun: [],
  },
  ai_applications: {
    eastMoney: ['AI应用'],
    tongHuaShun: [],
  },
  software_services: {
    eastMoney: ['软件服务'],
    tongHuaShun: ['软件开发'],
  },
  cloud_services: {
    eastMoney: ['云服务'],
    tongHuaShun: [],
  },
  blockchain: {
    eastMoney: ['区块链'],
    tongHuaShun: [],
  },

  // --- 装备制造与新能源 ---
  power_grid_equipment: {
    eastMoney: ['电网设备'],
    tongHuaShun: ['电网设备'],
  },
  motor_manufacturing: {
    eastMoney: ['电机制造'],
    tongHuaShun: ['电机'],
  },
  humanoid_robots: {
    eastMoney: ['人形机器人'],
    tongHuaShun: ['自动化设备'],
  },
  construction_machinery: {
    eastMoney: ['工程机械'],
    tongHuaShun: ['工程机械'],
  },
  photovoltaics: {
    eastMoney: ['光伏'],
    tongHuaShun: ['光伏设备'],
  },
  batteries: {
    eastMoney: ['电池'],
    tongHuaShun: ['电池'],
  },
  solid_state_battery: {
    eastMoney: ['固态电池'],
    tongHuaShun: [],
  },
  new_energy: {
    eastMoney: ['新能源'],
    tongHuaShun: ['风电设备'],
  },
  controlled_nuclear_fusion: {
    eastMoney: ['可控核聚变'],
    tongHuaShun: [],
  },

  // --- 大金融与地产 ---
  banks: {
    eastMoney: ['银行'],
    tongHuaShun: ['银行'],
  },
  securities: {
    eastMoney: ['证券'],
    tongHuaShun: ['证券'],
  },
  real_estate: {
    eastMoney: ['房地产'],
    tongHuaShun: ['房地产'],
  },

  // --- 大消费与医疗 ---
  consumer: {
    eastMoney: ['消费'],
    tongHuaShun: ['食品加工制造'],
  },
  new_retail: {
    eastMoney: ['新零售'],
    tongHuaShun: ['零售'],
  },
  baijiu_concept: {
    eastMoney: ['白酒'],
    tongHuaShun: ['白酒'],
  },
  pharmaceuticals: {
    eastMoney: ['医药'],
    tongHuaShun: ['医药商业'],
  },
  ip_economy: {
    eastMoney: ['文化用品'],
    tongHuaShun: [],
  },
  gaming: {
    eastMoney: ['游戏'],
    tongHuaShun: ['游戏'],
  },
  media: {
    eastMoney: ['传媒'],
    tongHuaShun: ['文化传媒', '影视院线'],
  },

  // --- 军工与航天 ---
  defense_military: {
    eastMoney: ['军工'],
    tongHuaShun: ['军工装备'],
  },
  aerospace: {
    eastMoney: ['航天'],
    tongHuaShun: ['机场航运'],
  },

  // --- 其它 ---
  power_generation: {
    eastMoney: ['电力'],
    tongHuaShun: ['电力'],
  },
  carbon_neutrality: {
    eastMoney: ['碳中和'],
    tongHuaShun: ['环境治理'],
  },
  shanghai_composite: { eastMoney: ['上证指数'], tongHuaShun: [] },
  star_market_50: { eastMoney: ['科创50'], tongHuaShun: [] },
  beijing_exchange_50: { eastMoney: ['北证50'], tongHuaShun: [] },
  dual_innovation_50: { eastMoney: ['双创50'], tongHuaShun: [] },
  hk_technology: { eastMoney: ['港股科技'], tongHuaShun: [] },
}
