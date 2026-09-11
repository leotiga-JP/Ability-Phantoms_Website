/* =====================================================================
   標準技能マスターデータ
   ---------------------------------------------------------------------
   このファイルは「ルールブックに掲載されている標準技能」を編集しやすくするために
   本体JavaScriptから分離しています。

   ここを変更しても、プレイヤーが作成したキャラクターの自由入力技能そのものは変更されません。
   公式技能を追加・削除・名称変更したい場合は、このファイルを編集してください。

   ルールブック上、基本技能は原則として初期値2、怪盗系技能には変装4・カモフラージュ2・
   演技2などの個別初期値が設定されています。また、回避は「1上げるのに2ポイント」という
   特殊なポイント消費です。
   ===================================================================== */

const STANDARD_SKILLS = [
  // ----- 基本技能：身体系 -----
  { id: "basic_kakuto", name: "格闘", category: "基本技能 / 身体系", baseValue: 2, pointCostPerValue: 1 },
  { id: "basic_nagamono", name: "長物武器", category: "基本技能 / 身体系", baseValue: 2, pointCostPerValue: 1 },
  { id: "basic_undo", name: "運動", category: "基本技能 / 身体系", baseValue: 2, pointCostPerValue: 1 },
  { id: "basic_sennyu", name: "潜入", category: "基本技能 / 身体系", baseValue: 2, pointCostPerValue: 1 },

  // ----- 基本技能：器用系 -----
  { id: "basic_totteki", name: "投擲", category: "基本技能 / 器用系", baseValue: 2, pointCostPerValue: 1 },
  { id: "basic_kaijou", name: "開錠", category: "基本技能 / 器用系", baseValue: 2, pointCostPerValue: 1 },
  { id: "basic_suri", name: "スリ", category: "基本技能 / 器用系", baseValue: 2, pointCostPerValue: 1 },
  { id: "basic_soushu", name: "操縦", category: "基本技能 / 器用系", baseValue: 2, pointCostPerValue: 1 },

  // ----- 基本技能：感覚系 -----
  { id: "basic_shageki", name: "射撃", category: "基本技能 / 感覚系", baseValue: 2, pointCostPerValue: 1 },
  { id: "basic_tansaku", name: "探索", category: "基本技能 / 感覚系", baseValue: 2, pointCostPerValue: 1 },
  { id: "basic_kanchi", name: "感知", category: "基本技能 / 感覚系", baseValue: 2, pointCostPerValue: 1 },
  { id: "basic_doshin", name: "読心術", category: "基本技能 / 感覚系", baseValue: 2, pointCostPerValue: 1 },

  // ----- 基本技能：知性系 -----
  { id: "basic_chishiki", name: "知識", category: "基本技能 / 知性系", baseValue: 2, pointCostPerValue: 1 },
  { id: "basic_hiraki", name: "閃き", category: "基本技能 / 知性系", baseValue: 2, pointCostPerValue: 1 },
  { id: "basic_computer", name: "コンピュータ", category: "基本技能 / 知性系", baseValue: 2, pointCostPerValue: 1 },
  { id: "basic_keikaku", name: "計画", category: "基本技能 / 知性系", baseValue: 2, pointCostPerValue: 1 },

  // ----- 基本技能：カリスマ系 -----
  { id: "basic_kosho", name: "交渉", category: "基本技能 / カリスマ系", baseValue: 2, pointCostPerValue: 1 },
  { id: "basic_miryoku", name: "魅了", category: "基本技能 / カリスマ系", baseValue: 2, pointCostPerValue: 1 },
  { id: "basic_koun", name: "幸運", category: "基本技能 / カリスマ系", baseValue: 2, pointCostPerValue: 1 },
  { id: "basic_appeal", name: "アピール", category: "基本技能 / カリスマ系", baseValue: 2, pointCostPerValue: 1 },

  // ----- 怪盗系技能 -----
  { id: "thief_hensou", name: "変装", category: "怪盗系技能", baseValue: 4, pointCostPerValue: 1 },
  { id: "thief_camouflage", name: "カモフラージュ", category: "怪盗系技能", baseValue: 2, pointCostPerValue: 1 },
  { id: "thief_engiphyo", name: "演技", category: "怪盗系技能", baseValue: 2, pointCostPerValue: 1 },
  { id: "thief_kaihi", name: "回避", category: "怪盗系技能", baseValue: 2, pointCostPerValue: 2, note: "技能値を1上げるのに2ポイント必要" },
  { id: "thief_oukyu", name: "応急手当", category: "怪盗系技能", baseValue: 2, pointCostPerValue: 1 },

  // ----- 職業専門技能 -----
  { id: "pro_hamono", name: "刃物", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
  { id: "pro_kaki", name: "火器", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
  { id: "pro_bujutsu", name: "武術「○○」", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
  { id: "pro_chiryo", name: "治療", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
  { id: "pro_seishin", name: "精神療法", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
  { id: "pro_tsuiseki", name: "追跡", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
  { id: "pro_jouhou", name: "情報収集", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
  { id: "pro_kantei", name: "鑑定", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
  { id: "pro_keiro", name: "経路知識", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
  { id: "pro_kankyouteki", name: "環境適応", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
  { id: "pro_suiei", name: "水泳", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
  { id: "pro_climbing", name: "クライミング", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
  { id: "pro_sports", name: "スポーツ「○○」", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
  { id: "pro_geijutsu", name: "芸術", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
  { id: "pro_ryori", name: "料理", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
  { id: "pro_mechanism", name: "メカニズム", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
  { id: "pro_senmon", name: "専門知識「○○」", category: "職業専門技能", baseValue: 0, pointCostPerValue: 1 },
];

/*
  初期状態で表示する技能の順序を変えたい場合は、上の配列の順番を変えるか、
  ここにIDの配列を作って並べ替える実装に変更してください。
*/
