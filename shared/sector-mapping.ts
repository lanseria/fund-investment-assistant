/**
 * 板块名称映射表
 * 用于映射本地字典(value) 与 第三方平台(如东方财富、同花顺)上的板块名称
 * 外层 key 对应系统字典表中的 value
 */
export const SECTOR_PLATFORM_MAPPING: Record<string, { eastMoney: string[], tongHuaShun: string[] }> = {
  // --- 能源与资源 ---
  oil_gas_resources: {
    eastMoney: ['油气及炼化工程', '油服工程', '油田服务', '燃气Ⅲ', '燃气Ⅱ', '油气开采Ⅲ', '油气开采Ⅱ', '石油石化', '炼化及贸易', '炼油化工', '油品石化贸易'],
    tongHuaShun: ['油气开采及服务', '燃气', '石油加工贸易'],
  },
  coal: {
    eastMoney: ['煤炭', '动力煤', '焦煤', '焦炭Ⅲ', '焦炭Ⅱ', '煤炭开采', '煤化工'],
    tongHuaShun: ['煤炭开采加工'],
  },
  nonferrous_metals: {
    eastMoney: ['有色金属', '工业金属', '铜', '铝', '铅锌', '镍', '锡', '锑', '磁性材料', '能源金属', '锂', '钴', '小金属', '钨', '钼', '金属新材料'],
    tongHuaShun: ['工业金属', '能源金属', '小金属', '金属新材料'],
  },
  precious_metals: {
    eastMoney: ['贵金属', '黄金'],
    tongHuaShun: ['贵金属'],
  },
  silver: {
    eastMoney: ['白银'],
    tongHuaShun: [],
  },

  // --- 化工与材料 ---
  chemicals: {
    eastMoney: ['基础化工', '化学原料', '化学制品', '农化制品', '农药', '无机盐', '纯碱', '钛白粉', '化学纤维', '合成树脂', '塑料', '橡胶', '聚氨酯', '氟化工', '氯碱'],
    tongHuaShun: ['化学原料', '化学制品', '农化制品', '化学纤维', '非金属材料'],
  },

  // --- 硬科技与半导体 ---
  semiconductors: {
    eastMoney: ['半导体', '集成电路制造', '集成电路封测'],
    tongHuaShun: ['半导体'],
  },
  semiconductor_equipment: {
    eastMoney: ['半导体设备', '光伏加工设备', '锂电专用设备'],
    tongHuaShun: [],
  },
  chip_design: {
    eastMoney: ['半导体芯片设计', '模拟芯片设计', '数字芯片设计'],
    tongHuaShun: [],
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
    eastMoney: ['消费电子', '消费电子零部件及组装', '品牌消费电子', '光学光电子', '面板', 'LED'],
    tongHuaShun: ['消费电子', '光学光电子'],
  },

  // --- 通信与 AI ---
  communications: {
    eastMoney: ['通信', '通信设备', '通信服务', '电信运营商', '通信网络设备及器件', '通信线缆及配套', '通信终端及配件'],
    tongHuaShun: ['通信设备', '通信服务'],
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
    eastMoney: ['AI应用', '营销代理', '广告营销'],
    tongHuaShun: [],
  },
  software_services: {
    eastMoney: ['软件服务', '软件开发', 'IT服务Ⅲ', 'IT服务Ⅱ', '垂直应用软件', '横向通用软件'],
    tongHuaShun: ['软件开发', 'IT服务'],
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
    eastMoney: ['电网设备', '电网自动化设备', '输变电设备', '配电设备', '线缆部件及其他', '电工仪器仪表'],
    tongHuaShun: ['电网设备'],
  },
  motor_manufacturing: {
    eastMoney: ['电机制造', '电机Ⅲ', '电机Ⅱ'],
    tongHuaShun: ['电机'],
  },
  humanoid_robots: {
    eastMoney: ['人形机器人', '机器人', '自动化设备'],
    tongHuaShun: ['自动化设备'],
  },
  construction_machinery: {
    eastMoney: ['工程机械', '工程机械整机', '工程机械器件'],
    tongHuaShun: ['工程机械'],
  },
  photovoltaics: {
    eastMoney: ['光伏', '光伏设备', '光伏主材', '光伏辅材', '光伏电池组件', '逆变器', '硅料硅片'],
    tongHuaShun: ['光伏设备'],
  },
  batteries: {
    eastMoney: ['电池', '锂电池', '蓄电池及其他电池', '电池化学品'],
    tongHuaShun: ['电池'],
  },
  solid_state_battery: {
    eastMoney: ['固态电池'],
    tongHuaShun: [],
  },
  new_energy: {
    eastMoney: ['新能源', '风电设备', '风电零部件', '风电整机', '储能', '燃料电池'],
    tongHuaShun: ['风电设备'],
  },
  controlled_nuclear_fusion: {
    eastMoney: ['可控核聚变'],
    tongHuaShun: [],
  },

  // --- 大金融与地产 ---
  banks: {
    eastMoney: ['银行', '银行Ⅱ', '国有大型银行Ⅲ', '股份制银行Ⅲ', '城商行Ⅲ', '农商行Ⅲ'],
    tongHuaShun: ['银行'],
  },
  securities: {
    eastMoney: ['证券', '证券Ⅲ', '证券Ⅱ'],
    tongHuaShun: ['证券'],
  },
  real_estate: {
    eastMoney: ['房地产', '房地产开发', '住宅开发', '商业地产', '房地产服务', '物业管理', '房产租赁经纪'],
    tongHuaShun: ['房地产'],
  },

  // --- 大消费与医疗 ---
  consumer: {
    eastMoney: ['消费', '家用电器', '白色家电', '黑色家电', '小家电', '厨卫电器', '食品加工', '饮料乳品', '调味发酵品Ⅱ', '休闲食品', '服装家纺', '纺织服饰', '美容护理', '化妆品'],
    tongHuaShun: ['食品加工制造', '饮料制造', '家用电器', '白色家电', '黑色家电', '小家电', '厨卫电器', '美容护理', '服装家纺'],
  },
  new_retail: {
    eastMoney: ['新零售', '商贸零售', '一般零售', '百货', '超市', '互联网电商', '跨境电商'],
    tongHuaShun: ['零售', '互联网电商'],
  },
  baijiu_concept: {
    eastMoney: ['白酒', '白酒Ⅲ', '白酒Ⅱ'],
    tongHuaShun: ['白酒'],
  },
  pharmaceuticals: {
    eastMoney: ['医药', '医药生物', '医药商业', '化学制药', '中药Ⅲ', '中药Ⅱ', '生物制品', '医疗器械', '医疗服务', '医疗设备'],
    tongHuaShun: ['医药商业', '化学制药', '中药', '生物制品', '医疗器械', '医疗服务'],
  },
  ip_economy: {
    eastMoney: ['IP经济', '文化用品', '娱乐用品', '文娱用品'],
    tongHuaShun: [],
  },
  gaming: {
    eastMoney: ['游戏', '游戏Ⅲ', '游戏Ⅱ'],
    tongHuaShun: ['游戏'],
  },
  media: {
    eastMoney: ['传媒', '视频媒体', '数字媒体', '影视院线', '出版', '广告媒体'],
    tongHuaShun: ['文化传媒', '影视院线'],
  },

  // --- 军工与航天 ---
  defense_military: {
    eastMoney: ['军工', '国防军工', '军工电子Ⅲ', '军工电子Ⅱ', '地面兵装Ⅲ', '地面兵装Ⅱ', '航海装备Ⅲ', '航海装备Ⅱ'],
    tongHuaShun: ['军工装备', '军工电子'],
  },
  aerospace: {
    eastMoney: ['航天', '航空装备Ⅲ', '航空装备Ⅱ', '航天装备Ⅲ', '航天装备Ⅱ'],
    tongHuaShun: ['机场航运'],
  },

  // --- 其它 ---
  power_generation: {
    eastMoney: ['电力', '火力发电', '水力发电', '风力发电', '核力发电', '光伏发电', '电能综合服务'],
    tongHuaShun: ['电力'],
  },
  carbon_neutrality: {
    eastMoney: ['碳中和', '环保', '环境治理', '大气治理', '固废治理', '水务及水治理'],
    tongHuaShun: ['环境治理', '环保设备'],
  },
  shanghai_composite: { eastMoney: ['上证指数'], tongHuaShun: [] },
  star_market_50: { eastMoney: ['科创50'], tongHuaShun: [] },
  beijing_exchange_50: { eastMoney: ['北证50'], tongHuaShun: [] },
  dual_innovation_50: { eastMoney: ['双创50'], tongHuaShun: [] },
  hk_technology: { eastMoney: ['港股科技'], tongHuaShun: [] },
}
