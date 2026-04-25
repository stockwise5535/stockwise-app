// ── Language detection ─────────────────────────────────────
// Auto-detect: browser language → fallback to 'en'
// Japan timezone (Asia/Tokyo) or ja language → 'ja'
export function detectLang() {
  const nav = navigator.language || navigator.languages?.[0] || 'en'
  if (nav.startsWith('ja')) return 'ja'
  // Also detect by timezone
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz === 'Asia/Tokyo') return 'ja'
  } catch (_) {}
  return 'en'
}

// ── Translations ───────────────────────────────────────────
export const TRANSLATIONS = {

  // ── Nav / Global ──────────────────────────────────────────
  loading:        { ja:'読み込み中…',                en:'Loading…' },
  logout:         { ja:'ログアウト',                  en:'Sign out' },
  upgrade:        { ja:'Pro へアップグレード',         en:'Upgrade to Pro' },
  inventoryValue: { ja:'在庫総額',                    en:'Inventory value' },
  pro:            { ja:'PRO',                         en:'PRO' },

  // ── Tabs ──────────────────────────────────────────────────
  tab_dashboard:   { ja:'ダッシュボード',   en:'Dashboard'    },
  tab_inventory:   { ja:'在庫管理',         en:'Inventory'    },
  tab_lt_pipeline: { ja:'LT Pipeline',      en:'LT Pipeline'  },
  tab_ssn:         { ja:'SSN 追跡',         en:'SSN Tracking' },
  tab_movements:   { ja:'入出庫履歴',       en:'Movements'    },

  // ── Status labels ──────────────────────────────────────────
  status_critical:  { ja:'アラート',   en:'Alert'     },
  status_warning:   { ja:'要注意',     en:'Warning'   },
  status_healthy:   { ja:'適正',       en:'Healthy'   },
  status_overstock: { ja:'過剰在庫',   en:'Overstock' },
  status_nodata:    { ja:'データなし', en:'No Data'   },

  // ── SSN status ────────────────────────────────────────────
  ssn_booked:     { ja:'予約済',   en:'Booked'     },
  ssn_in_transit: { ja:'輸送中',   en:'In Transit' },
  ssn_customs:    { ja:'通関中',   en:'Customs'    },
  ssn_arrived:    { ja:'着荷',     en:'Arrived'    },
  ssn_cancelled:  { ja:'キャンセル',en:'Cancelled'  },

  // ── KPI labels ────────────────────────────────────────────
  kpi_total_stock:    { ja:'総在庫数量',         en:'Total Stock Units' },
  kpi_alert:          { ja:'アラート (7日未満)',  en:'Alert (<7 days)'   },
  kpi_reorder:        { ja:'今すぐ発注',          en:'Reorder Now'       },
  kpi_in_transit:     { ja:'輸送中 (SSN)',        en:'In Transit (SSN)'  },
  kpi_overstock:      { ja:'過剰在庫 (45日超)',   en:'Overstock (>45d)'  },
  kpi_none:           { ja:'なし',                en:'None'              },
  kpi_reorder_sub:    { ja:'発注点割れ',           en:'Below reorder point'},
  kpi_in_transit_sub: { ja:'units in transit',    en:'units in transit'  },
  kpi_overstock_sub:  { ja:'在庫過多',             en:'Excess inventory'  },
  kpi_all_ok:         { ja:'全SKUが発注点以上です', en:'All SKUs above reorder point' },

  // ── Dashboard ─────────────────────────────────────────────
  alert_banner:      { ja:'アラート:',            en:'Alert:' },
  today_actions:     { ja:'⚡ 本日のアクション',  en:'⚡ Today\'s Actions' },
  heatmap:           { ja:'▦ 在庫ヒートマップ',   en:'▦ Inventory Heatmap' },
  order_now:         { ja:'今すぐ発注',            en:'Reorder Now' },
  days_left:         { ja:'残',                    en:'' },
  days_unit:         { ja:'日',                    en:'d left' },
  no_usage_data:     { ja:'使用量データなし',      en:'No usage data' },
  add_sku_first:     { ja:'在庫管理タブからSKUを追加してください', en:'Add SKUs from the Inventory tab' },

  // ── Heatmap columns ───────────────────────────────────────
  col_superset:   { ja:'Superset',   en:'Superset'   },
  col_subset:     { ja:'Subset',     en:'Subset'     },
  col_sku:        { ja:'SKU名',      en:'SKU Name'   },
  col_stock:      { ja:'在庫数',     en:'Stock'      },
  col_daily:      { ja:'日使用量',   en:'Daily Use'  },
  col_lt:         { ja:'LT(日)',     en:'LT (days)'  },
  col_days_left:  { ja:'残日数',     en:'Days Left'  },
  col_rp:         { ja:'発注点',     en:'Reorder Pt' },
  col_ss:         { ja:'安全在庫',   en:'Safety Stk' },
  col_status:     { ja:'ステータス', en:'Status'     },
  col_supplier:   { ja:'仕入先',     en:'Supplier'   },
  col_category:   { ja:'カテゴリ',   en:'Category'   },
  col_unit_cost:  { ja:'単価',       en:'Unit Cost'  },
  col_moq:        { ja:'MOQ',        en:'MOQ'        },
  col_gap:        { ja:'Gap',        en:'Gap'        },
  col_ship_qty:   { ja:'出荷数',     en:'Ship Qty'   },
  col_arr_qty:    { ja:'到着数',     en:'Arrival Qty'},
  col_ship_date:  { ja:'出荷日',     en:'Ship Date'  },
  col_eta:        { ja:'ETA',        en:'ETA'        },
  col_vessel:     { ja:'船名',       en:'Vessel'     },
  col_bl:         { ja:'B/L番号',    en:'B/L No.'    },
  col_confidence: { ja:'信頼度',     en:'Confidence' },
  col_date:       { ja:'日付',       en:'Date'       },
  col_qty:        { ja:'数量',       en:'Qty'        },
  col_type:       { ja:'種別',       en:'Type'       },
  col_ref:        { ja:'参照番号',   en:'Reference'  },
  col_week:       { ja:'週',         en:'Week'       },
  col_proj_stock: { ja:'予測在庫',   en:'Proj. Stock' },
  col_inbound:    { ja:'入荷',       en:'Inbound'    },
  col_wos:        { ja:'WOS (週)',   en:'WOS (wks)'  },
  col_coverage:   { ja:'カバレッジ', en:'Coverage'   },

  // ── Inventory ─────────────────────────────────────────────
  add_sku:        { ja:'+ SKU追加',      en:'+ Add SKU'      },
  import_csv:     { ja:'↑ CSVインポート',en:'↑ Import CSV'   },
  csv_hint:       { ja:'CSV: name, superset, subset, stock_qty, daily_usage, lead_time[, safety_stock, moq, unit_cost, supplier]',
                    en:'CSV: name, superset, subset, stock_qty, daily_usage, lead_time[, safety_stock, moq, unit_cost, supplier]' },
  edit:           { ja:'編集',   en:'Edit'   },
  delete:         { ja:'削除',   en:'Delete' },
  no_skus:        { ja:'まだSKUがありません。「SKU追加」ボタンから追加してください。', en:'No SKUs yet. Click "+ Add SKU" to get started.' },
  other:          { ja:'その他', en:'Other'  },
  confirm_delete_sku: { ja:'このSKUと関連SSNを削除しますか？', en:'Delete this SKU and all related SSNs?' },

  // ── Inventory sub-headers ─────────────────────────────────
  inv_col_name:     { ja:'SKU名',  en:'SKU Name' },
  inv_col_stock:    { ja:'在庫数', en:'Stock'    },
  inv_col_daily:    { ja:'日使用量',en:'Daily Use'},
  inv_col_lt:       { ja:'LT',     en:'LT'       },
  inv_col_days:     { ja:'残日数', en:'Days Left' },
  inv_col_rp:       { ja:'発注点', en:'Reorder Pt'},
  inv_col_gap:      { ja:'Gap',    en:'Gap'      },
  inv_col_status:   { ja:'ステータス',en:'Status' },

  // ── LT Pipeline ───────────────────────────────────────────
  lt_select_sku:    { ja:'← 上からSKUを選択してください', en:'← Select a SKU above' },
  lt_panel_title:   { ja:'⏱ 12週 LT Pipeline',          en:'⏱ 12-Week LT Pipeline' },
  lt_add_ssn:       { ja:'+ SSN追加',                    en:'+ Add SSN'             },
  lt_ssn_for:       { ja:'🔢 入荷予定 (SSN)',             en:'🔢 Inbound SSNs'       },
  lt_cur_stock:     { ja:'現在庫',   en:'Current Stock' },
  lt_daily:         { ja:'日使用量', en:'Daily Usage'   },
  lt_lt:            { ja:'LT',       en:'Lead Time'     },
  lt_rp:            { ja:'発注点',   en:'Reorder Point' },
  lt_ss:            { ja:'安全在庫', en:'Safety Stock'  },
  lt_days:          { ja:'残日数',   en:'Days Left'     },
  lt_days_suffix:   { ja:'日',       en:'d'             },

  // ── SSN Tracking ──────────────────────────────────────────
  ssn_add:          { ja:'+ SSN追加',       en:'+ Add SSN'       },
  ssn_import:       { ja:'↑ CSVインポート', en:'↑ Import CSV'    },
  ssn_template:     { ja:'↓ テンプレート',  en:'↓ Template'      },
  ssn_all:          { ja:'全て',            en:'All'             },
  ssn_no_skus:      { ja:'SKUがありません', en:'No SKUs yet'     },
  ssn_empty:        { ja:'SSNがありません', en:'No SSNs yet'     },
  ssn_panel:        { ja:'🔢 SSN一覧',      en:'🔢 SSN List'      },
  ssn_items_suffix: { ja:'件',              en:''                },
  confirm_delete_ssn: { ja:'削除?', en:'Delete?' },

  // ── Movements ─────────────────────────────────────────────
  move_add:         { ja:'+ 入出庫記録',  en:'+ Log Movement'  },
  move_panel:       { ja:'↕ 入出庫履歴', en:'↕ Movement History' },
  move_empty:       { ja:'履歴がありません', en:'No movements yet' },
  move_suffix:      { ja:'件',           en:''                  },
  move_type_sale:       { ja:'SALE',       en:'SALE'       },
  move_type_inbound:    { ja:'INBOUND',    en:'INBOUND'    },
  move_type_adjustment: { ja:'ADJUSTMENT', en:'ADJUSTMENT' },
  move_type_return:     { ja:'RETURN',     en:'RETURN'     },

  // ── Pro banner ────────────────────────────────────────────
  pro_lock_icon:    { ja:'🔒',                                          en:'🔒'                                                    },
  pro_lock_title:   { ja:'この機能はPro限定です',                        en:'Pro Feature'                                           },
  pro_lock_desc:    { ja:'SSN追跡・入出庫履歴はStockWise Proでご利用いただけます', en:'SSN Tracking & Movements require StockWise Pro' },
  pro_upgrade_btn:  { ja:'Proにアップグレード → $149/月',               en:'Upgrade to Pro → $149/mo'                             },

  // ── Modals — SKU ──────────────────────────────────────────
  modal_add_sku:    { ja:'SKU追加',                   en:'Add SKU'              },
  modal_edit_sku:   { ja:'編集',                       en:'Edit'                 },
  modal_ss_title:   { ja:'📦 Superset / Subset 設定', en:'📦 Superset / Subset'  },
  modal_ss_hint:    { ja:'例: Superset=イヤホン / Subset=A社 イヤホンA', en:'e.g. Superset=Earbuds / Subset=Supplier A Model A' },
  modal_superset:   { ja:'SUPERSET',                   en:'SUPERSET'             },
  modal_subset:     { ja:'SUBSET',                     en:'SUBSET'               },
  modal_sku_name:   { ja:'SKU名',                      en:'SKU Name'             },
  modal_supplier:   { ja:'仕入先',                     en:'Supplier'             },
  modal_category:   { ja:'カテゴリ',                   en:'Category'             },
  modal_stock_qty:  { ja:'在庫数量',                   en:'Stock Qty'            },
  modal_daily:      { ja:'1日使用量',                  en:'Daily Usage'          },
  modal_lead_time:  { ja:'リードタイム(日)',            en:'Lead Time (days)'     },
  modal_safety:     { ja:'安全在庫 (自動計算可)',       en:'Safety Stock (auto)'  },
  modal_moq:        { ja:'MOQ',                        en:'MOQ'                  },
  modal_unit_cost:  { ja:'単価 ($)',                   en:'Unit Cost ($)'        },
  modal_rp_preview: { ja:'発注点',                     en:'Reorder Point'        },
  modal_ss_preview: { ja:'安全在庫',                   en:'Safety Stock'         },
  modal_unit:       { ja:'個',                         en:'units'                },
  modal_per_day:    { ja:'個/日',                      en:'units/day'            },
  modal_save:       { ja:'保存中…',                    en:'Saving…'              },
  modal_add_btn:    { ja:'追加',                       en:'Add'                  },
  modal_save_btn:   { ja:'保存',                       en:'Save'                 },
  modal_cancel:     { ja:'キャンセル',                 en:'Cancel'               },
  ph_superset:      { ja:'例: イヤホン',               en:'e.g. Earbuds'         },
  ph_subset:        { ja:'例: A社 イヤホンA',          en:'e.g. Supplier A Model A' },
  ph_sku_name:      { ja:'例: A社 イヤホンA Pro',      en:'e.g. Earbuds Pro A'   },
  ph_supplier:      { ja:'Supplier-A',                  en:'Supplier-A'           },
  ph_category:      { ja:'Audio',                       en:'Audio'                },
  ph_daily:         { ja:'個/日',                       en:'units/day'            },
  ph_lead_time:     { ja:'14',                          en:'14'                   },
  ph_moq:           { ja:'最小発注量',                  en:'Min order qty'        },
  ph_unit_cost:     { ja:'28.50',                       en:'28.50'                },
  auto_prefix:      { ja:'自動: ',                      en:'auto: '               },

  // ── Modals — SSN ──────────────────────────────────────────
  modal_add_ssn:    { ja:'SSN追加 — 入荷予定登録', en:'Add SSN — Register Inbound'  },
  modal_edit_ssn:   { ja:'SSN編集',                en:'Edit SSN'                    },
  ssn_tip:          { ja:'💡 サプライヤーから出荷通知を受けたら、出荷・到着数量と日付を登録してください',
                      en:'💡 Register ship/arrival quantities and dates when you receive an advance shipping notice.' },
  modal_ssn_sku:    { ja:'SKU',                    en:'SKU'                         },
  ssn_select:       { ja:'選択してください…',       en:'Select SKU…'                 },
  modal_ship_qty:   { ja:'出荷数量',               en:'Ship Qty'                    },
  modal_arr_qty:    { ja:'到着数量',               en:'Arrival Qty'                 },
  modal_ship_date:  { ja:'出荷日',                 en:'Ship Date'                   },
  modal_eta:        { ja:'ETA (到着予定日)',        en:'ETA (Arrival Date)'          },
  modal_status:     { ja:'ステータス',             en:'Status'                      },
  modal_confidence: { ja:'信頼度 (0〜1)',           en:'Confidence (0–1)'            },
  modal_vessel:     { ja:'船名',                   en:'Vessel'                      },
  modal_bl:         { ja:'B/L番号',               en:'B/L Number'                  },
  modal_origin:     { ja:'出発港',                 en:'Origin Port'                 },
  modal_dest:       { ja:'到着港',                 en:'Destination Port'            },
  modal_add_ssn_btn:{ ja:'登録',                  en:'Register'                    },
  ph_ship_qty:      { ja:'個',                     en:'units'                       },
  ph_arr_qty:       { ja:'個 (未入力=出荷数)',     en:'units (default = ship qty)'  },
  ph_vessel:        { ja:'EVER GRACE',              en:'EVER GRACE'                  },
  ph_bl:            { ja:'BL240501',                en:'BL240501'                    },
  ph_origin:        { ja:'Shenzhen',                en:'Shenzhen'                    },
  ph_dest:          { ja:'Los Angeles',             en:'Los Angeles'                 },

  // ── Modals — Movement ─────────────────────────────────────
  modal_move_title: { ja:'入出庫記録',                      en:'Log Movement'                   },
  modal_move_date:  { ja:'日付',                            en:'Date'                           },
  modal_move_sku:   { ja:'SKU',                             en:'SKU'                            },
  modal_move_qty:   { ja:'数量 (入庫=正 / 出庫=負)',        en:'Qty (+ inbound / − outbound)'   },
  modal_move_type:  { ja:'種別',                            en:'Type'                           },
  modal_move_ref:   { ja:'参照番号 (任意)',                 en:'Reference (optional)'           },
  ph_qty:           { ja:'+100 または -20',                en:'+100 or -20'                    },
  ph_ref:           { ja:'ORD-1234',                        en:'ORD-1234'                       },
  ph_move_sku:      { ja:'選択してください…',               en:'Select SKU…'                    },
  modal_save_move:  { ja:'保存',                            en:'Save'                           },

  // ── Login page ────────────────────────────────────────────
  login_tagline:    { ja:'在庫意思決定支援システム',         en:'Inventory Decision Support'     },
  login_email:      { ja:'メールアドレス',                  en:'Email'                          },
  login_password:   { ja:'パスワード',                      en:'Password'                       },
  login_ph_email:   { ja:'you@company.com',                 en:'you@company.com'                },
  login_ph_pass:    { ja:'8文字以上',                       en:'8+ characters'                  },
  login_submit_in:  { ja:'ログイン',                        en:'Log in'                         },
  login_submit_up:  { ja:'アカウント作成',                   en:'Create account'                 },
  login_processing: { ja:'処理中…',                         en:'Please wait…'                   },
  login_no_account: { ja:'アカウントなし？',                 en:'No account?'                    },
  login_free_reg:   { ja:'無料登録',                        en:'Sign up free'                   },
  login_have_acct:  { ja:'登録済み？',                      en:'Have an account?'               },
  login_signin:     { ja:'ログイン',                        en:'Log in'                         },
  login_confirm:    { ja:'メールを確認してからログインしてください。', en:'Check your email to confirm, then log in.' },

  // ── Pricing modal ─────────────────────────────────────────
  pricing_title:      { ja:'プランを選択',              en:'Choose your plan'                     },
  pricing_trial:      { ja:'14日間無料トライアル · いつでもキャンセル可', en:'14-day free trial · Cancel anytime' },
  pricing_compare:    { ja:'StockWise = 在庫管理 + LT予測 + SSN手動入力　|　StockWise Pro = + 3PL・自社輸送会社 連携',
                        en:'StockWise = Inventory + LT Pipeline + Manual SSN  |  StockWise Pro = + 3PL / Logistics integration' },
  pricing_start:      { ja:'無料で試す',                en:'Start Free Trial'                     },
  pricing_processing: { ja:'処理中…',                   en:'Redirecting…'                         },
  pricing_mo:         { ja:'/月',                       en:'/mo'                                  },
  plan_basic_desc:    { ja:'小規模EC・小売向け',         en:'For small e-commerce & retail'        },
  plan_pro_desc:      { ja:'3PL・自社輸送会社を使う企業向け', en:'For businesses with 3PL & own logistics' },
  plan_rec:           { ja:'おすすめ',                  en:'RECOMMENDED'                          },
  // plan features
  pf_sku_basic:       { ja:'SKU 50品目まで (Superset/Subset)', en:'Up to 50 SKUs (Superset/Subset)'    },
  pf_dashboard:       { ja:'ダッシュボード・ヒートマップ',       en:'Dashboard & Heatmap'                 },
  pf_lt:              { ja:'LTパイプライン (12週予測)',          en:'LT Pipeline (12-week forecast)'      },
  pf_csv:             { ja:'CSVインポート',                      en:'CSV Import'                          },
  pf_ssn_manual:      { ja:'SSN追跡 (手動入力)',                 en:'SSN Tracking (manual)'               },
  pf_3pl:             { ja:'3PL / 倉庫会社 連携',               en:'3PL / Warehouse Integration'         },
  pf_logistics:       { ja:'自社輸送会社 連携',                  en:'Own Logistics Integration'           },
  pf_api:             { ja:'API / EDI 自動取込',                 en:'API / EDI Auto-Import'               },
  pf_sku_pro:         { ja:'SKU 無制限 (Superset/Subset)',        en:'Unlimited SKUs (Superset/Subset)'   },
  pf_all_basic:       { ja:'StockWise 全機能',                   en:'Everything in StockWise'             },
  pf_ssn_pro:         { ja:'SSN追跡 (サプライヤー連携)',          en:'SSN Tracking (supplier integration)' },
  pf_movements:       { ja:'入出庫履歴',                         en:'Movement History'                    },
  pf_slack:           { ja:'Slack通知',                          en:'Slack Notifications'                 },
  pf_users:           { ja:'複数ユーザー (10名)',                 en:'Up to 10 Users'                      },
  pf_support:         { ja:'優先サポート',                        en:'Priority Support'                    },

  // ── CSV alerts ────────────────────────────────────────────
  csv_no_rows:     { ja:'有効な行がありません',             en:'No valid rows found'                    },
  csv_success:     { ja:'件インポート完了',                 en:' items imported successfully'            },
  csv_error:       { ja:'エラー: ',                         en:'Error: '                                 },
  ssn_csv_success: { ja:'件のSSNを登録しました',            en:' SSN records registered'                 },
  ssn_csv_error:   { ja:'有効な行がありません。subsetがSKUと一致しているか確認してください',
                     en:'No valid rows. Check that subset matches an existing SKU name.' },

  // ── Errors ────────────────────────────────────────────────
  err_sku_name:    { ja:'SKU名は必須です',             en:'SKU name is required'              },
  err_ssn_req:     { ja:'SKUとETA日付は必須です',      en:'SKU and ETA date are required'     },
  err_move_req:    { ja:'SKUと数量を入力してください', en:'Please enter SKU and quantity'     },
  err_price_id:    { ja:'Stripe Price ID未設定: ',     en:'Stripe Price ID not set: '         },
  err_checkout:    { ja:'Checkout失敗',                en:'Checkout failed'                   },

  // ── Lang switcher ─────────────────────────────────────────
  lang_switch:     { ja:'EN',  en:'JP'  },
  lang_label:      { ja:'English', en:'日本語' },
}

// ── Hook / helper ──────────────────────────────────────────
export function t(key, lang) {
  const entry = TRANSLATIONS[key]
  if (!entry) return key
  return entry[lang] ?? entry['en'] ?? key
}
