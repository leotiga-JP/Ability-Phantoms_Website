/* =====================================================================
   Ability Phantoms キャラクター作成ツール - メインロジック
   ---------------------------------------------------------------------
   このファイルは「データをどう計算するか」「画面へどう表示するか」を担当します。

   ★ 自分で改造するときに特に見る場所
   1. createInitialCharacter()      → 初期データを変更
   2. calculateDerivedValues()       → HP/PP/INI等の計算式を変更
   3. calculateSkillFinalValue()     → 技能値計算を変更
   4. calculateAbilityTotals()       → 異能力コスト計算を変更
   5. buildCocofoliaData()           → ココフォリア出力を変更
   6. exportCharacterJson()          → 保存JSON形式を変更

   ルールブック由来の数値式は、これまでの要件定義に従っています。
   「完全自動」ではなく「自動計算＋ユーザーの直接編集」を基本方針にしています。
   ===================================================================== */

(() => {
  "use strict";

  // -------------------------------------------------------------------
  // 1. 初期データ
  // -------------------------------------------------------------------

  function uid(prefix = "id") {
    // 配列の各要素を区別するための簡易ID。
    // サーバーへ送信することはなく、このブラウザ内の一時識別子として使用します。
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function createStandardSkills() {
    // data.js に書いた標準技能を、キャラクター固有の入力データへ変換します。
    // ここでコピーを作ることで、あるキャラクターの編集が別キャラクターへ影響しません。
    return STANDARD_SKILLS.map(skill => ({
      id: uid("skill"),
      sourceId: skill.id,
      isCustom: false,
      name: skill.name,
      category: skill.category,
      baseValue: skill.baseValue,
      pointCostPerValue: skill.pointCostPerValue,
      occupationPoints: 0,
      freePoints: 0,
      otherModifier: 0,
      note: skill.note || ""
    }));
  }

  function createInitialCharacter() {
    return {
      // 保存JSONの形式を管理するための情報。
      format: "ability-phantoms-character",
      version: "1.0.0",

      meta: {
        // localStorageで複数キャラクターを区別するためのIDです。
        id: uid("character"),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },

      profile: {
        name: "新しいキャラクター",
        thiefName: "",
        age: "",
        gender: "",
        occupation: "",
        thiefGroup: "",
        playStyle: "",
        birthplace: "",
        appearance: "",
        personality: "",

        // 立ち絵・差分データ。
        // dataUrlにはアップロード画像をData URLとして保存します。
        // activeIdが、画面表示・PDF出力に使う現在選択中の差分です。
        portraits: {
          activeId: null,
          images: []
        }
      },

      stats: {
        body: 2,
        dexterity: 2,
        sense: 2,
        intelligence: 2,
        mind: 2,
        charisma: 2
      },

      derived: {
        // nullなら自動計算値を使用。数字が入っていればその値を優先します。
        hpOverride: null,
        ppOverride: null,
        initiativeOverride: null,
        criticalValue: ""
      },

      pointPools: {
        occupationOther: 0,
        abilityOther: 0,
        freeOther: 0
      },

      skills: createStandardSkills(),

      abilities: [],
      gadgets: [],
      items: [],

      notes: {
        background: "",
        memo: ""
      },

      cocofolia: {
        iconUrl: "",
        externalUrl: "",
        color: "#7c3aed",
        commands: ""
      }
    };
  }

  let character = createInitialCharacter();

  // -------------------------------------------------------------------
  // 第2段階：ブラウザ内永続保存（localStorage）
  // -------------------------------------------------------------------
  // localStorageには「キャラクターJSON」を文字列として保存します。
  // サーバーには送信しないため、GitHub Pagesだけでも利用できます。
  //
  // ★ 将来Supabaseへ移行する場合も、ここで扱うcharacterオブジェクトを
  //   そのままクラウド保存対象にしやすいよう、保存形式をJSON中心にします。
  const LOCAL_STORAGE_KEY = "ability-phantoms.characters.v2";
  const CURRENT_CHARACTER_KEY = "ability-phantoms.current-character.v2";
  let saveTimer = null;
  let isRestoringLocalData = false;

  function getStoredCharacters() {
    // 保存済みキャラクターを { [id]: character } として取得します。
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      console.error("localStorageの読み込みに失敗しました", error);
      return {};
    }
  }

  function saveStoredCharacters(characters) {
    // localStorageはQuotaExceededErrorが発生する可能性があるため、必ず例外処理します。
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(characters));
  }

  function updateAutoSaveStatus(type, message) {
    const element = $("#autoSaveStatus");
    if (!element) return;
    element.classList.remove("saved", "saving", "error");
    if (type) element.classList.add(type);
    element.textContent = message;
  }

  function getCharacterId() {
    if (!character.meta) character.meta = {};
    if (!character.meta.id) character.meta.id = uid("character");
    return character.meta.id;
  }

  function saveCurrentCharacterToLocalStorage() {
    if (isRestoringLocalData) return;

    try {
      const characters = getStoredCharacters();
      const id = getCharacterId();
      if (!character.meta.createdAt) character.meta.createdAt = new Date().toISOString();
      character.meta.updatedAt = new Date().toISOString();
      characters[id] = character;
      saveStoredCharacters(characters);
      localStorage.setItem(CURRENT_CHARACTER_KEY, id);
      updateAutoSaveStatus("saved", "● 自動保存済み");
      renderSavedCharacters();
    } catch (error) {
      console.error("localStorageへの保存に失敗しました", error);
      updateAutoSaveStatus("error", "● 自動保存失敗");
      alert("ブラウザ内保存に失敗しました。立ち絵や差分画像を減らすか、JSON保存を利用してください。\n\n" + error.message);
    }
  }

  function scheduleLocalSave() {
    // 文字入力のたびに保存せず、入力が少し落ち着いてから保存します。
    if (isRestoringLocalData) return;
    updateAutoSaveStatus("saving", "● 保存中...");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCurrentCharacterToLocalStorage, 500);
  }

  function renderSavedCharacters() {
    const container = $("#savedCharactersList");
    const count = $("#savedCharacterCount");
    if (!container) return;

    const characters = getStoredCharacters();
    const list = Object.values(characters).sort((a, b) =>
      new Date(b?.meta?.updatedAt || 0) - new Date(a?.meta?.updatedAt || 0)
    );

    count.textContent = String(list.length);
    container.innerHTML = list.length ? list.map(item => {
      const id = item?.meta?.id || "";
      const isActive = id === getCharacterId();
      const updated = item?.meta?.updatedAt ? new Date(item.meta.updatedAt).toLocaleString("ja-JP") : "日時不明";
      return `
        <button type="button" class="saved-character-item ${isActive ? "active" : ""}" data-load-character-id="${escapeHtml(id)}">
          <strong>${escapeHtml(item?.profile?.name || "無名のキャラクター")}</strong>
          <span class="saved-character-meta">${escapeHtml(updated)}</span>
        </button>`;
    }).join("") : '<p class="small-note">まだ保存済みキャラクターはありません。</p>';

    $$('[data-load-character-id]', container).forEach(button => {
      button.addEventListener("click", () => loadCharacterFromLocalStorage(button.dataset.loadCharacterId));
    });
  }

  function loadCharacterFromLocalStorage(id) {
    const characters = getStoredCharacters();
    const target = characters[id];
    if (!target) return;

    if (!confirm("現在のキャラクターを保存済みデータへ切り替えますか？\n現在の入力は自動保存されています。")) return;

    clearTimeout(saveTimer);
    isRestoringLocalData = true;
    character = normalizeImportedCharacter(JSON.parse(JSON.stringify(target)));
    localStorage.setItem(CURRENT_CHARACTER_KEY, id);
    pdfSavedSinceLastChange = false;
    isRestoringLocalData = false;
    renderAll();
    updateAutoSaveStatus("saved", "● 保存済みを読込");
    renderSavedCharacters();
  }

  function duplicateCurrentCharacter() {
    // 現在のキャラクターをコピーして、新しいIDを与えます。
    const copy = JSON.parse(JSON.stringify(character));
    copy.meta = copy.meta || {};
    copy.meta.id = uid("character");
    copy.meta.createdAt = new Date().toISOString();
    copy.meta.updatedAt = new Date().toISOString();
    copy.profile = copy.profile || {};
    copy.profile.name = `${copy.profile.name || "キャラクター"}（コピー）`;
    character = normalizeImportedCharacter(copy);
    saveCurrentCharacterToLocalStorage();
    renderAll();
  }

  function deleteCurrentCharacter() {
    const characters = getStoredCharacters();
    const id = getCharacterId();
    const name = character.profile?.name || "無名のキャラクター";
    if (!characters[id]) return;

    if (!confirm(`「${name}」をブラウザ内保存から削除しますか？\nこの操作は元に戻せません。`)) return;

    delete characters[id];
    saveStoredCharacters(characters);

    const next = Object.values(characters).sort((a, b) =>
      new Date(b?.meta?.updatedAt || 0) - new Date(a?.meta?.updatedAt || 0)
    )[0];

    if (next?.meta?.id) {
      character = normalizeImportedCharacter(JSON.parse(JSON.stringify(next)));
      localStorage.setItem(CURRENT_CHARACTER_KEY, next.meta.id);
    } else {
      character = createInitialCharacter();
      // 初期状態も保存して、次回アクセス時に復元できるようにします。
      saveCurrentCharacterToLocalStorage();
    }

    pdfSavedSinceLastChange = false;
    renderAll();
    renderSavedCharacters();
  }

  function clearCurrentCharacter() {
    if (!confirm("現在のキャラクターの入力内容を初期化しますか？\n保存済みデータも初期状態で上書きされます。")) return;
    clearTimeout(saveTimer);
    const oldMeta = character.meta ? { ...character.meta } : {};
    character = createInitialCharacter();
    character.meta.id = oldMeta.id || uid("character");
    character.meta.createdAt = oldMeta.createdAt || new Date().toISOString();
    character.profile.name = "新しいキャラクター";
    pdfSavedSinceLastChange = false;
    renderAll();
    saveCurrentCharacterToLocalStorage();
  }

  function restoreLocalStorageOnStartup() {
    // 「最後に編集していたキャラクター」を優先して復元します。
    const characters = getStoredCharacters();
    const currentId = localStorage.getItem(CURRENT_CHARACTER_KEY);
    let restored = currentId && characters[currentId] ? characters[currentId] : null;

    if (!restored) {
      const list = Object.values(characters).sort((a, b) =>
        new Date(b?.meta?.updatedAt || 0) - new Date(a?.meta?.updatedAt || 0)
      );
      restored = list[0] || null;
    }

    if (!restored) {
      character.meta = character.meta || {};
      getCharacterId();
      return false;
    }

    isRestoringLocalData = true;
    character = normalizeImportedCharacter(JSON.parse(JSON.stringify(restored)));
    isRestoringLocalData = false;
    return true;
  }

  // -------------------------------------------------------------------
  // PDF保存確認フラグ
  // -------------------------------------------------------------------
  // ユーザーが最後にPDF保存を行ったかを管理します。
  // 入力内容が変更されたら false に戻り、ページ離脱時にブラウザ標準の確認を出します。
  // ※ beforeunloadの文言はブラウザ側で固定表示されるため、任意の文章を表示できない
  //    ブラウザがあります。
  let pdfSavedSinceLastChange = false;

  function markPdfNeedsSaving() {
    pdfSavedSinceLastChange = false;
    // PDF保存フラグが変わる操作は、キャラクター内容の変更操作でもあります。
    scheduleLocalSave();
  }

  // -------------------------------------------------------------------
  // 2. 標準ダイス式
  // -------------------------------------------------------------------

  const STAT_RULES = {
    body: { label: "身体", formula: "1d6 + 1" },
    dexterity: { label: "器用", formula: "1d6 + 1" },
    sense: { label: "感覚", formula: "1d6 + 1" },
    intelligence: { label: "知性", formula: "1d6 + 1" },
    mind: { label: "精神", formula: "2d6" },
    charisma: { label: "カリスマ", formula: "1d6 + 1" }
  };

  function rollD6() {
    // 6面ダイスを1回振る。
    return Math.floor(Math.random() * 6) + 1;
  }

  function rollStat(key) {
    // PDFの標準作成方法に合わせて、精神だけ2d6、それ以外は1d6+1。
    if (key === "mind") return rollD6() + rollD6();
    return rollD6() + 1;
  }

  function rollAllStats() {
    Object.keys(STAT_RULES).forEach(key => {
      character.stats[key] = rollStat(key);
    });
    markPdfNeedsSaving();
    renderAll();
  }

  // -------------------------------------------------------------------
  // 3. 自動計算
  // -------------------------------------------------------------------

  function calculateDerivedValues() {
    const { body, dexterity, sense, intelligence, mind, charisma } = character.stats;

    // ルールブックの派生値計算。
    const calculatedHp = body + charisma + 3;
    const calculatedPp = 6 + mind;
    const calculatedInitiative = Math.ceil((body + intelligence) / 2);

    const hp = character.derived.hpOverride === null ? calculatedHp : Number(character.derived.hpOverride);
    const pp = character.derived.ppOverride === null ? calculatedPp : Number(character.derived.ppOverride);
    const initiative = character.derived.initiativeOverride === null
      ? calculatedInitiative
      : Number(character.derived.initiativeOverride);

    return {
      calculatedHp,
      calculatedPp,
      calculatedInitiative,
      hp,
      pp,
      initiative,
      criticalValue: character.derived.criticalValue
    };
  }

  function calculatePointPools() {
    const { dexterity, sense, intelligence, mind, charisma } = character.stats;

    // 基本ポイントはルールブックの式を自動計算。
    const occupationBase = dexterity + sense + 10;
    const abilityBase = dexterity + mind;
    const freeBase = Math.ceil((charisma + sense + intelligence) / 2);

    // プレイヤーが「その他」で追加した分を加算。
    const occupationTotal = occupationBase + toNumber(character.pointPools.occupationOther);
    const abilityTotal = abilityBase + toNumber(character.pointPools.abilityOther);
    const freeTotal = freeBase + toNumber(character.pointPools.freeOther);

    // 技能から職業P/フリーPの使用済みを集計。
    const occupationUsed = character.skills.reduce((sum, skill) => sum + toNumber(skill.occupationPoints), 0);
    const freeUsedBySkills = character.skills.reduce((sum, skill) => sum + toNumber(skill.freePoints), 0);

    // 異能力のポイント使用量。
    const abilityUsed = character.abilities.reduce((sum, ability) => sum + toNumber(ability.abilityPointsSpent), 0);
    const freeUsedByAbilities = character.abilities.reduce((sum, ability) => sum + toNumber(ability.freePointsSpent), 0);

    // 注意：フリーポイントをHP/PPに使うUIは今後追加可能です。
    // 現在は技能＋異能力への使用分だけを自動集計しています。
    const freeUsed = freeUsedBySkills + freeUsedByAbilities;

    return {
      occupation: { base: occupationBase, other: toNumber(character.pointPools.occupationOther), total: occupationTotal, used: occupationUsed, remaining: occupationTotal - occupationUsed },
      ability: { base: abilityBase, other: toNumber(character.pointPools.abilityOther), total: abilityTotal, used: abilityUsed, remaining: abilityTotal - abilityUsed },
      free: { base: freeBase, other: toNumber(character.pointPools.freeOther), total: freeTotal, used: freeUsed, remaining: freeTotal - freeUsed }
    };
  }

  function calculateSkillFinalValue(skill) {
    // 「何ポイントで技能値を1上げるか」を技能ごとに持たせています。
    // 通常は1、回避など特殊な技能は2という設計です。
    const occupation = toNumber(skill.occupationPoints);
    const free = toNumber(skill.freePoints);
    const other = toNumber(skill.otherModifier);
    const cost = Math.max(1, toNumber(skill.pointCostPerValue) || 1);

    // ポイントを「技能値上昇量」に変換。
    const occupationIncrease = Math.floor(occupation / cost);
    const freeIncrease = Math.floor(free / cost);

    return toNumber(skill.baseValue) + occupationIncrease + freeIncrease + other;
  }

  function calculateAbilityTotals(ability) {
    // 属性・拡張・制約の「取得コスト」「使用コスト」を全て合算します。
    // 異能力単位で計算するため、別の異能力へマイナスを移すことはできません。
    const components = [
      ...(ability.attributes || []),
      ...(ability.extensions || []),
      ...(ability.constraints || [])
    ];

    const acquisition = components.reduce((sum, row) => sum + toNumber(row.acquisitionCost), 0)
      + toNumber(ability.otherAcquisitionCost);
    const usage = components.reduce((sum, row) => sum + toNumber(row.usageCost), 0)
      + toNumber(ability.otherUsageCost);

    return { acquisition, usage };
  }

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  // -------------------------------------------------------------------
  // 4. DOMヘルパー
  // -------------------------------------------------------------------

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function escapeHtml(value) {
    // innerHTMLへ入れる文字列を安全に表示するための最低限のエスケープ。
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function bindInput(element, path) {
    // data-bind="profile.name" のような属性を使って、入力値をcharacterへ反映します。
    element.addEventListener("input", () => {
      setByPath(character, path, element.type === "number" ? numberOrNull(element.value) : element.value);
      refreshComputedOnly();
      // 第2段階：画面上部を含む全ての data-bind 入力をブラウザへ自動保存します。
      scheduleLocalSave();
    });
  }

  function numberOrNull(value) {
    if (value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function setByPath(root, path, value) {
    const keys = path.split(".");
    let cursor = root;
    for (let i = 0; i < keys.length - 1; i++) {
      cursor = cursor[keys[i]];
    }
    cursor[keys[keys.length - 1]] = value;
  }

  function getByPath(root, path) {
    return path.split(".").reduce((acc, key) => acc?.[key], root);
  }

  function syncBoundInputs(root = document) {
    // 画面に存在する全data-bind入力へ現在値を流し込みます。
    $$('[data-bind]', root).forEach(element => {
      const value = getByPath(character, element.dataset.bind);
      if (value === undefined) return;
      element.value = value ?? "";
      bindInput(element, element.dataset.bind);
    });
  }

  // -------------------------------------------------------------------
  // 5. 能力値UI
  // -------------------------------------------------------------------

  function renderStats() {
    const grid = $("#statsGrid");
    grid.innerHTML = Object.entries(STAT_RULES).map(([key, rule]) => `
      <article class="stat-card">
        <div class="stat-card-header">
          <strong>${escapeHtml(rule.label)}</strong>
          <span class="badge">${escapeHtml(rule.formula)}</span>
        </div>
        <p class="stat-formula">ダイス生成後も数値は直接編集できます。</p>
        <input type="number" data-stat-key="${key}" value="${escapeHtml(character.stats[key])}" />
        <div class="stat-actions">
          <button type="button" data-roll-stat="${key}">🎲 振る</button>
        </div>
      </article>
    `).join("");

    $$('[data-stat-key]', grid).forEach(input => {
      input.addEventListener("input", () => {
        character.stats[input.dataset.statKey] = numberOrNull(input.value) ?? 0;
        refreshComputedOnly();
        markPdfNeedsSaving();
      });
    });

    $$('[data-roll-stat]', grid).forEach(button => {
      button.addEventListener("click", () => {
        character.stats[button.dataset.rollStat] = rollStat(button.dataset.rollStat);
        renderAll();
      });
    });
  }

  // -------------------------------------------------------------------
  // 6. ポイントUI
  // -------------------------------------------------------------------

  function renderPoints() {
    const pools = calculatePointPools();
    const definitions = [
      { key: "occupation", label: "職業ポイント", otherPath: "pointPools.occupationOther", description: "技能への割り振りに使用" },
      { key: "ability", label: "異能力ポイント", otherPath: "pointPools.abilityOther", description: "異能力への割り振りに使用" },
      { key: "free", label: "フリーポイント", otherPath: "pointPools.freeOther", description: "技能・異能力などへ使用" }
    ];

    // ポイント管理も、全体を開閉でき、さらに各ポイント種別を個別に開閉できます。
    $("#pointsGrid").innerHTML = definitions.map(def => {
      const pool = pools[def.key];
      return `
        <details class="point-card collapse-details" data-collapse-id="point-${def.key}" open>
          <summary class="collapse-summary">
            <span class="collapse-summary-title">${def.label}</span>
          </summary>
          <div class="collapse-body">
            <p class="small-note">${def.description}</p>
            <div class="point-numbers">
              <div class="point-number"><small>基本値</small><strong>${pool.base}</strong></div>
              <div class="point-number"><small>その他</small><strong>${pool.other >= 0 ? "+" : ""}${pool.other}</strong></div>
              <div class="point-number"><small>合計</small><strong>${pool.total}</strong></div>
              <div class="point-number"><small>使用</small><strong>${pool.used}</strong></div>
              <div class="point-number"><small>残り</small><strong>${pool.remaining}</strong></div>
            </div>
            <label class="field point-input">
              <span>その他ポイント（手入力）</span>
              <input type="number" data-bind="${def.otherPath}" value="${pool.other}" />
            </label>
          </div>
        </details>
      `;
    }).join("");

    syncBoundInputs($("#pointsGrid"));
  }

  // -------------------------------------------------------------------
  // 7. 技能UI
  // -------------------------------------------------------------------

  function renderSkills() {
    const container = $("#skillsContainer");
    const grouped = new Map();
    character.skills.forEach((skill, index) => {
      if (!grouped.has(skill.category)) grouped.set(skill.category, []);
      grouped.get(skill.category).push({ skill, index });
    });

    // 技能は系統ごとに折りたためるようにします。
    // 「オリジナル技能」グループには、一覧のすぐ横で追加できるボタンを置きます。
    container.innerHTML = [...grouped.entries()].map(([category, rows], groupIndex) => `
      <details class="skill-group collapse-details" data-collapse-id="skill-group-${groupIndex}-${escapeHtml(category)}" open>
        <summary class="collapse-summary skill-group-summary">
          <span class="collapse-summary-title">${escapeHtml(category)}</span>
          ${category === "オリジナル技能" ? `<button type="button" class="mini-button summary-add-button" data-add-custom-skill>＋ 技能を追加</button>` : ""}
        </summary>
        <div class="collapse-body skill-group-body">
          <div class="table-scroll">
            <table class="skill-table">
              <thead>
                <tr>
                  <th>技能名</th>
                  <th>初期値</th>
                  <th>職業P</th>
                  <th>フリーP</th>
                  <th>その他</th>
                  <th>消費倍率</th>
                  <th>最終技能値</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(({ skill, index }) => `
                  <tr data-skill-index="${index}">
                    <td><input type="text" data-skill-field="name" value="${escapeHtml(skill.name)}" /></td>
                    <td><input type="number" data-skill-field="baseValue" value="${escapeHtml(skill.baseValue)}" /></td>
                    <td><input type="number" min="0" data-skill-field="occupationPoints" value="${escapeHtml(skill.occupationPoints)}" /></td>
                    <td><input type="number" min="0" data-skill-field="freePoints" value="${escapeHtml(skill.freePoints)}" /></td>
                    <td><input type="number" data-skill-field="otherModifier" value="${escapeHtml(skill.otherModifier)}" /></td>
                    <td><input type="number" min="1" data-skill-field="pointCostPerValue" value="${escapeHtml(skill.pointCostPerValue)}" /></td>
                    <td><strong>${calculateSkillFinalValue(skill)}</strong></td>
                    <td>${skill.isCustom ? `<button type="button" class="remove-button" data-remove-skill="${index}">削除</button>` : ""}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    `).join("");

    $$('[data-skill-index]', container).forEach(row => {
      const index = Number(row.dataset.skillIndex);
      $$('[data-skill-field]', row).forEach(input => {
        input.addEventListener("input", () => {
          const key = input.dataset.skillField;
          character.skills[index][key] = input.type === "number" ? numberOrNull(input.value) ?? 0 : input.value;
          refreshComputedOnly();
          scheduleLocalSave();
          const valueCell = row.querySelector("td:nth-last-child(2) strong");
          if (valueCell) valueCell.textContent = calculateSkillFinalValue(character.skills[index]);
        });
      });
    });

    $$('[data-add-custom-skill]', container).forEach(button => {
      button.addEventListener("click", event => {
        // summary内の追加ボタンなので、親detailsの開閉を起こさないようにします。
        event.preventDefault();
        event.stopPropagation();
        addCustomSkill();
      });
    });

    $$('[data-remove-skill]', container).forEach(button => {
      button.addEventListener("click", () => {
        character.skills.splice(Number(button.dataset.removeSkill), 1);
        markPdfNeedsSaving();
        renderAll();
      });
    });
  }

  function addCustomSkill() {

    markPdfNeedsSaving();
    character.skills.push({
      id: uid("skill"),
      sourceId: null,
      isCustom: true,
      name: "オリジナル技能",
      category: "オリジナル技能",
      baseValue: 0,
      pointCostPerValue: 1,
      occupationPoints: 0,
      freePoints: 0,
      otherModifier: 0,
      note: ""
    });
    renderAll();
  }

  // -------------------------------------------------------------------
  // 8. 異能力UI
  // -------------------------------------------------------------------

  function defaultAbility() {
    return {
      id: uid("ability"),
      name: "新しい異能力",
      description: "",
      abilityPointsSpent: 0,
      freePointsSpent: 0,
      level: 1,
      otherAcquisitionCost: 0,
      otherUsageCost: 0,
      isCore: false,
      origin: "",
      attributes: [],
      extensions: [],
      constraints: []
    };
  }

  function defaultComponent() {
    return {
      id: uid("component"),
      name: "",
      acquisitionCost: 0,
      usageCost: 0,
      description: ""
    };
  }

  function renderAbilities() {
    const container = $("#abilitiesContainer");
    container.innerHTML = character.abilities.map((ability, index) => {
      const totals = calculateAbilityTotals(ability);
      const collapseId = `ability-${ability.id || index}`;
      return `
        <details class="repeat-card collapse-details ability-card" data-collapse-id="${escapeHtml(collapseId)}" open>
          <summary class="collapse-summary ability-summary">
            <input
              type="text"
              class="ability-summary-name"
              data-ability-field="name"
              data-index="${index}"
              value="${escapeHtml(ability.name)}"
              aria-label="異能力名"
            />
            <label class="core-checkbox-wrap" title="コア異能力">
              <input type="checkbox" data-ability-field="isCore" data-index="${index}" ${ability.isCore ? "checked" : ""} />
              <span>コア</span>
            </label>
            <button type="button" class="remove-button" data-remove-ability="${index}">削除</button>
          </summary>

          <div class="collapse-body card-body">
            <div class="form-grid two-column">
              <label class="field">
                <span>異能力レベル</span>
                <input type="number" min="0" data-ability-field="level" data-index="${index}" value="${escapeHtml(ability.level)}" />
              </label>
              <label class="field">
                <span>異能力ポイント使用</span>
                <input type="number" min="0" data-ability-field="abilityPointsSpent" data-index="${index}" value="${escapeHtml(ability.abilityPointsSpent)}" />
              </label>
              <label class="field">
                <span>フリーポイント使用</span>
                <input type="number" min="0" data-ability-field="freePointsSpent" data-index="${index}" value="${escapeHtml(ability.freePointsSpent)}" />
              </label>
              <label class="field">
                <span>その他取得コスト</span>
                <input type="number" data-ability-field="otherAcquisitionCost" data-index="${index}" value="${escapeHtml(ability.otherAcquisitionCost)}" />
              </label>
              <label class="field">
                <span>その他使用コスト</span>
                <input type="number" data-ability-field="otherUsageCost" data-index="${index}" value="${escapeHtml(ability.otherUsageCost)}" />
              </label>
              <label class="field">
                <span>異能力のルーツ</span>
                <input type="text" data-ability-field="origin" data-index="${index}" value="${escapeHtml(ability.origin)}" placeholder="自由入力" />
              </label>
              <label class="field wide">
                <span>異能力の詳細</span>
                <textarea rows="4" data-ability-field="description" data-index="${index}">${escapeHtml(ability.description)}</textarea>
              </label>
            </div>

            ${renderComponentSection(ability, index, "attributes", "属性")}
            ${renderComponentSection(ability, index, "extensions", "能力の拡張")}
            ${renderComponentSection(ability, index, "constraints", "制約")}

            <div class="ability-total">
              <div class="total-chip"><small>取得コスト</small><strong>${totals.acquisition}</strong></div>
              <div class="total-chip"><small>使用コスト</small><strong>${totals.usage}</strong></div>
              <div class="total-chip"><small>コア</small><strong>${ability.isCore ? "YES" : "NO"}</strong></div>
              <div class="total-chip"><small>所持数カウント</small><strong>1</strong></div>
            </div>

            <!-- 長い異能力を続けて作成できるよう、カード下部にも追加ボタンを配置します。 -->
            <div class="inline-actions add-next-row">
              <button type="button" class="button secondary" data-add-ability-inline>＋ 異能力を追加</button>
            </div>
          </div>
        </details>
      `;
    }).join("");

    // 異能力カード内の入力。
    $$('[data-ability-field]', container).forEach(input => {
      input.addEventListener("input", handleAbilityFieldInput);
      input.addEventListener("change", handleAbilityFieldInput);
    });

    // summaryに配置した「コア」「異能力名」「削除」操作では、
    // 操作時にdetailsが意図せず開閉しないよう、元の開閉状態へ戻します。
    $$('.ability-summary', container).forEach(summary => {
      summary.addEventListener("click", event => {
        if (!event.target.closest("input, button, label")) return;
        event.stopPropagation();
        const details = summary.closest("details");
        const wasOpen = details?.open ?? true;
        window.setTimeout(() => {
          if (details) details.open = wasOpen;
        }, 0);
      });
    });

    $$('[data-remove-ability]', container).forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        character.abilities.splice(Number(button.dataset.removeAbility), 1);
        markPdfNeedsSaving();
        renderAll();
      });
    });

    // 属性/拡張/制約の入力イベント。
    $$('[data-component-field]', container).forEach(input => {
      input.addEventListener("input", handleComponentFieldInput);
    });

    $$('[data-add-component]', container).forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const ability = character.abilities[Number(button.dataset.abilityIndex)];
        ability[button.dataset.addComponent].push(defaultComponent());
        markPdfNeedsSaving();
        renderAll();
      });
    });

    $$('[data-remove-component]', container).forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const ability = character.abilities[Number(button.dataset.abilityIndex)];
        const collection = ability[button.dataset.collection];
        collection.splice(Number(button.dataset.componentIndex), 1);
        markPdfNeedsSaving();
        renderAll();
      });
    });

    $$('[data-add-ability-inline]', container).forEach(button => {
      button.addEventListener("click", () => addAbility());
    });
  }

  function renderComponentSection(ability, abilityIndex, collectionKey, label) {
    const abilityId = ability.id || abilityIndex;
    return `
      <details class="component-section collapse-details" data-collapse-id="component-${abilityId}-${collectionKey}" open>
        <summary class="collapse-summary component-section-summary">
          <span class="collapse-summary-title">${label}</span>
          <button type="button" class="mini-button summary-add-button" data-add-component="${collectionKey}" data-ability-index="${abilityIndex}">＋ 追加</button>
        </summary>
        <div class="collapse-body">
          <div class="ability-component-list">
            ${(ability[collectionKey] || []).map((component, index) => `
              <div class="component-row">
                <input type="text" placeholder="名称" data-component-field="name" data-collection="${collectionKey}" data-ability-index="${abilityIndex}" data-component-index="${index}" value="${escapeHtml(component.name)}" />
                <input type="number" placeholder="取得" data-component-field="acquisitionCost" data-collection="${collectionKey}" data-ability-index="${abilityIndex}" data-component-index="${index}" value="${escapeHtml(component.acquisitionCost)}" />
                <input type="number" placeholder="使用" data-component-field="usageCost" data-collection="${collectionKey}" data-ability-index="${abilityIndex}" data-component-index="${index}" value="${escapeHtml(component.usageCost)}" />
                <textarea rows="1" placeholder="説明" data-component-field="description" data-collection="${collectionKey}" data-ability-index="${abilityIndex}" data-component-index="${index}">${escapeHtml(component.description)}</textarea>
                <button type="button" class="remove-button" data-remove-component="1" data-collection="${collectionKey}" data-ability-index="${abilityIndex}" data-component-index="${index}">削除</button>
              </div>
            `).join("")}
          </div>
        </div>
      </details>
    `;
  }

  function handleAbilityFieldInput(event) {
    const input = event.currentTarget;
    const index = Number(input.dataset.index);
    const key = input.dataset.abilityField;

    if (input.type === "checkbox") {
      character.abilities[index][key] = input.checked;
    } else if (input.type === "number") {
      character.abilities[index][key] = numberOrNull(input.value) ?? 0;
    } else {
      character.abilities[index][key] = input.value;
    }
    refreshComputedOnly();
    // 異能力の編集内容も即時に保存予約します。
    scheduleLocalSave();
    const card = input.closest(".repeat-card");
    if (card) updateAbilityCardTotals(card, character.abilities[index]);
  }

  function handleComponentFieldInput(event) {
    const input = event.currentTarget;
    const abilityIndex = Number(input.dataset.abilityIndex);
    const componentIndex = Number(input.dataset.componentIndex);
    const collection = input.dataset.collection;
    const key = input.dataset.componentField;

    character.abilities[abilityIndex][collection][componentIndex][key] =
      input.type === "number" ? numberOrNull(input.value) ?? 0 : input.value;

    refreshComputedOnly();
    // 属性・拡張・制約などの構成要素も保存予約します。
    scheduleLocalSave();
    const card = input.closest(".repeat-card");
    if (card) updateAbilityCardTotals(card, character.abilities[abilityIndex]);
  }

  function addAbility() {

    character.abilities.push(defaultAbility());
    markPdfNeedsSaving();
    renderAll();
    document.getElementById("abilitiesSection").scrollIntoView({ behavior: "smooth" });
  }

  // -------------------------------------------------------------------
  // 9. 立ち絵・差分管理
  // -------------------------------------------------------------------

  function getActivePortrait() {
    const portraits = character.profile.portraits;
    if (!portraits || !Array.isArray(portraits.images)) return null;
    return portraits.images.find(image => image.id === portraits.activeId) || portraits.images[0] || null;
  }

  function renderPortraits() {
    const preview = $("#portraitPreview");
    const empty = $("#portraitEmpty");
    const variants = $("#portraitVariants");
    const removeButton = $("#removePortraitButton");
    const active = getActivePortrait();
    const portraits = character.profile.portraits || { activeId: null, images: [] };

    if (active) {
      preview.src = active.dataUrl;
      preview.alt = `${active.name}の立ち絵`;
      preview.classList.remove("hidden");
      empty.classList.add("hidden");
    } else {
      preview.removeAttribute("src");
      preview.classList.add("hidden");
      empty.classList.remove("hidden");
    }

    variants.innerHTML = portraits.images.map(image => `
      <button type="button" class="portrait-variant ${image.id === portraits.activeId ? "active" : ""}" data-portrait-id="${escapeHtml(image.id)}">
        <img src="${escapeHtml(image.dataUrl)}" alt="${escapeHtml(image.name)}" />
        <span>${escapeHtml(image.name)}</span>
      </button>
    `).join("");

    variants.querySelectorAll("[data-portrait-id]").forEach(button => {
      button.addEventListener("click", () => {
        character.profile.portraits.activeId = button.dataset.portraitId;
        markPdfNeedsSaving();
        renderPortraits();
      });
    });

    removeButton.disabled = !active;
  }

  function handlePortraitUpload(file) {
    if (!file) return;

    // Data URL方式はJSON単体で立ち絵を復元できる反面、画像が大きいと保存JSONも大きくなります。
    // 実用上は数MB程度の画像を推奨します。
    if (!file.type.startsWith("image/")) {
      alert("画像ファイルを選択してください。");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = {
        id: uid("portrait"),
        name: file.name.replace(/\.[^.]+$/, "") || "立ち絵",
        dataUrl: String(reader.result)
      };

      character.profile.portraits.images.push(image);
      character.profile.portraits.activeId = image.id;
      markPdfNeedsSaving();
      renderPortraits();
    };
    reader.readAsDataURL(file);
  }

  function removeActivePortrait() {
    const portraits = character.profile.portraits;
    const activeIndex = portraits.images.findIndex(image => image.id === portraits.activeId);
    if (activeIndex < 0) return;

    if (!confirm("現在選択中の立ち絵差分を削除しますか？")) return;

    portraits.images.splice(activeIndex, 1);
    portraits.activeId = portraits.images[0]?.id || null;
    markPdfNeedsSaving();
    renderPortraits();
  }

  // -------------------------------------------------------------------
  // 9. ガジェット/アイテムUI
  // ガジェット数に上限は設けません。
  // -------------------------------------------------------------------

  function addGadget() {

    character.gadgets.push({ id: uid("gadget"), name: "新しいガジェット", description: "", quantity: 1 });
    markPdfNeedsSaving();
    renderAll();
  }

  function addItem() {

    character.items.push({ id: uid("item"), name: "新しいアイテム", category: "", description: "", skill: "", diceBonus: 0, durability: "", quantity: 1 });
    markPdfNeedsSaving();
    renderAll();
  }

  function renderGadgetsAndItems() {
    // ガジェットに上限は設けません。
    // ガジェットとアイテムを別々に折りたたみ、その中の各項目も個別に折りたためます。
    $("#gadgetsContainer").innerHTML = `
      <details class="item-subsection collapse-details" data-collapse-id="gadget-list" open>
        <summary class="collapse-summary">
          <span class="collapse-summary-title">ガジェット</span>
        </summary>
        <div class="collapse-body">
          ${character.gadgets.map((item, index) => `
            <details class="repeat-card collapse-details item-card" data-collapse-id="gadget-${item.id || index}" open>
              <summary class="collapse-summary item-summary">
                <span class="collapse-summary-title">${escapeHtml(item.name || `ガジェット #${index + 1}`)}</span>
                <button type="button" class="remove-button" data-remove-gadget="${index}">削除</button>
              </summary>
              <div class="collapse-body card-body form-grid two-column">
                <label class="field"><span>名称</span><input data-gadget-field="name" data-index="${index}" value="${escapeHtml(item.name)}" /></label>
                <label class="field"><span>数量</span><input type="number" min="1" data-gadget-field="quantity" data-index="${index}" value="${escapeHtml(item.quantity)}" /></label>
                <label class="field wide"><span>説明</span><textarea rows="3" data-gadget-field="description" data-index="${index}">${escapeHtml(item.description)}</textarea></label>
              </div>
            </details>
          `).join("")}
          <div class="inline-actions add-next-row">
            <button type="button" class="button secondary" id="addGadgetInlineButton">＋ ガジェットを追加</button>
          </div>
        </div>
      </details>
    `;

    $("#itemsContainer").innerHTML = `
      <details class="item-subsection collapse-details" data-collapse-id="item-list" open>
        <summary class="collapse-summary">
          <span class="collapse-summary-title">アイテム</span>
        </summary>
        <div class="collapse-body">
          ${character.items.map((item, index) => `
            <details class="repeat-card collapse-details item-card" data-collapse-id="item-${item.id || index}" open>
              <summary class="collapse-summary item-summary">
                <span class="collapse-summary-title">${escapeHtml(item.name || `アイテム #${index + 1}`)}</span>
                <button type="button" class="remove-button" data-remove-item="${index}">削除</button>
              </summary>
              <div class="collapse-body card-body form-grid two-column">
                <label class="field"><span>名称</span><input data-item-field="name" data-index="${index}" value="${escapeHtml(item.name)}" /></label>
                <label class="field"><span>カテゴリ</span><input data-item-field="category" data-index="${index}" value="${escapeHtml(item.category)}" /></label>
                <label class="field"><span>使用技能</span><input data-item-field="skill" data-index="${index}" value="${escapeHtml(item.skill)}" /></label>
                <label class="field"><span>ダイスボーナス</span><input type="number" data-item-field="diceBonus" data-index="${index}" value="${escapeHtml(item.diceBonus)}" /></label>
                <label class="field"><span>耐久値</span><input data-item-field="durability" data-index="${index}" value="${escapeHtml(item.durability)}" /></label>
                <label class="field"><span>数量</span><input type="number" min="1" data-item-field="quantity" data-index="${index}" value="${escapeHtml(item.quantity)}" /></label>
                <label class="field wide"><span>説明・特殊効果</span><textarea rows="3" data-item-field="description" data-index="${index}">${escapeHtml(item.description)}</textarea></label>
              </div>
            </details>
          `).join("")}
          <div class="inline-actions add-next-row">
            <button type="button" class="button secondary" id="addItemInlineButton">＋ アイテムを追加</button>
          </div>
        </div>
      </details>
    `;

    const attachSummaryGuard = root => {
      root.querySelectorAll(".item-summary, .collapse-summary").forEach(summary => {
        summary.addEventListener("click", event => {
          if (!event.target.closest("button")) return;
          event.preventDefault();
          event.stopPropagation();
        });
      });
    };
    attachSummaryGuard($("#gadgetsContainer"));
    attachSummaryGuard($("#itemsContainer"));

    $$('[data-gadget-field]').forEach(input => {
      input.addEventListener("input", () => {
        const i = Number(input.dataset.index), k = input.dataset.gadgetField;
        character.gadgets[i][k] = input.type === "number" ? numberOrNull(input.value) ?? 0 : input.value;
        // 名称入力時は、折りたたみ状態でも何のガジェットか分かるよう見出しも更新します。
        if (k === "name") {
          const summaryTitle = input.closest(".item-card")?.querySelector(".collapse-summary-title");
          if (summaryTitle) summaryTitle.textContent = input.value || `ガジェット #${i + 1}`;
        }
        markPdfNeedsSaving();
      });
    });

    $$('[data-item-field]').forEach(input => {
      input.addEventListener("input", () => {
        const i = Number(input.dataset.index), k = input.dataset.itemField;
        character.items[i][k] = input.type === "number" ? numberOrNull(input.value) ?? 0 : input.value;
        // アイテム名も見出しへ即時反映します。
        if (k === "name") {
          const summaryTitle = input.closest(".item-card")?.querySelector(".collapse-summary-title");
          if (summaryTitle) summaryTitle.textContent = input.value || `アイテム #${i + 1}`;
        }
        markPdfNeedsSaving();
      });
    });

    $$('[data-remove-gadget]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      character.gadgets.splice(Number(button.dataset.removeGadget), 1);
      markPdfNeedsSaving();
      renderAll();
    }));
    $$('[data-remove-item]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      character.items.splice(Number(button.dataset.removeItem), 1);
      markPdfNeedsSaving();
      renderAll();
    }));

    $("#addGadgetInlineButton")?.addEventListener("click", addGadget);
    $("#addItemInlineButton")?.addEventListener("click", addItem);
  }

  // -------------------------------------------------------------------
  // 10. ココフォリア用チャットパレット
  // -------------------------------------------------------------------

  function generateDefaultCommands() {
    // ココフォリアのステータス/パラメータ参照は {ラベル} という形で利用できます。
    // ここでは「身体」「回避」などを例に、簡単な基本判定コマンドを作ります。
    // 実際のダイスボット構文は部屋で使用するダイスボット設定に依存するため、
    // この欄はプレイヤーが自由に編集できる設計です。
    const lines = [];
    const labels = [
      ["身体", "身体判定"],
      ["器用", "器用判定"],
      ["感覚", "感覚判定"],
      ["知性", "知性判定"],
      ["精神", "精神判定"],
      ["カリスマ", "カリスマ判定"]
    ];

    labels.forEach(([label, title]) => {
      lines.push(`2D6>={${label}} 【${title}】`);
    });

    character.skills.forEach(skill => {
      const value = calculateSkillFinalValue(skill);
      if (skill.name.trim()) lines.push(`2D6>=${value} 【${skill.name}】`);
    });

    character.abilities.forEach(ability => {
      const cost = calculateAbilityTotals(ability).usage;
      if (ability.name.trim()) lines.push(`# 異能力: ${ability.name} / 使用コスト ${cost}`);
    });

    return lines.join("\n");
  }

  function buildCocofoliaData() {
    const derived = calculateDerivedValues();
    const params = [
      ["身体", character.stats.body],
      ["器用", character.stats.dexterity],
      ["感覚", character.stats.sense],
      ["知性", character.stats.intelligence],
      ["カリスマ", character.stats.charisma],
      ["精神", character.stats.mind]
    ];

    return {
      kind: "character",
      data: {
        name: character.profile.name || "キャラクター名",
        memo: buildCharacterMemo(),
        initiative: derived.initiative,
        externalUrl: character.cocofolia.externalUrl || "",
        status: [
          { label: "HP", value: derived.hp, max: derived.hp },
          { label: "PP", value: derived.pp, max: derived.pp },
          { label: "イニシアチブ", value: derived.initiative, max: derived.initiative },
          { label: "クリティカル値", value: toNumber(character.derived.criticalValue), max: toNumber(character.derived.criticalValue) }
        ],
        params: params.map(([label, value]) => ({ label, value: String(value) })),
        iconUrl: character.cocofolia.iconUrl || null,
        faces: [],
        commands: character.cocofolia.commands || generateDefaultCommands(),
        color: character.cocofolia.color || "#7c3aed",
        secret: false,
        invisible: false,
        hideStatus: false
      }
    };
  }

  function buildCharacterMemo() {
    // ココフォリアのmemoへ入れるため、フレーバー情報を読みやすくまとめます。
    const lines = [];
    const p = character.profile;
    if (p.thiefName) lines.push(`怪盗名：${p.thiefName}`);
    if (p.occupation) lines.push(`職業：${p.occupation}`);
    if (p.thiefGroup) lines.push(`所属怪盗団：${p.thiefGroup}`);
    if (p.playStyle) lines.push(`プレイスタイル：${p.playStyle}`);
    if (p.age) lines.push(`年齢：${p.age}`);
    if (p.gender) lines.push(`性別：${p.gender}`);
    if (p.birthplace) lines.push(`出身：${p.birthplace}`);
    if (p.appearance) lines.push(`\n【外見】\n${p.appearance}`);
    if (p.personality) lines.push(`\n【性格】\n${p.personality}`);
    if (character.notes.background) lines.push(`\n【経歴】\n${character.notes.background}`);
    if (character.notes.memo) lines.push(`\n【メモ】\n${character.notes.memo}`);
    return lines.join("\n").trim();
  }

  function updateCocofoliaPreview() {
    $("#cocofoliaPreview").textContent = JSON.stringify(buildCocofoliaData(), null, 2);
  }

  // -------------------------------------------------------------------
  // 11. バリデーション/警告
  // -------------------------------------------------------------------

  function collectValidationMessages() {
    const messages = [];
    const pools = calculatePointPools();

    if (pools.occupation.remaining < 0) messages.push({ type: "warning", text: `職業ポイントが ${Math.abs(pools.occupation.remaining)} ポイント超過しています。` });
    if (pools.ability.remaining < 0) messages.push({ type: "warning", text: `異能力ポイントが ${Math.abs(pools.ability.remaining)} ポイント超過しています。` });
    if (pools.free.remaining < 0) messages.push({ type: "warning", text: `フリーポイントが ${Math.abs(pools.free.remaining)} ポイント超過しています。` });

    const basicOccupationSpent = character.skills
      .filter(skill => !skill.isCustom && skill.category.startsWith("基本技能"))
      .reduce((sum, skill) => sum + toNumber(skill.occupationPoints), 0);
    if (basicOccupationSpent > 6) {
      messages.push({ type: "warning", text: `基本技能へ振った職業ポイントが ${basicOccupationSpent} ポイントです。標準ルールの6ポイント上限を超えています。` });
    }

    if (character.abilities.length > 5) {
      messages.push({ type: "warning", text: `異能力の所持数が ${character.abilities.length} 個です。標準キャパシティ5を超えています。` });
    }

    const coreCount = character.abilities.filter(a => a.isCore).length;
    if (coreCount > 1) {
      messages.push({ type: "warning", text: `コア異能力が ${coreCount} 個設定されています。標準値1を超えています。` });
    }

    if (character.derived.criticalValue !== "") {
      const critical = toNumber(character.derived.criticalValue);
      if (critical < 1 || critical > 6) messages.push({ type: "warning", text: "クリティカル値は標準ルールでは1〜6です。" });
    }

    if (messages.length === 0) messages.push({ type: "ok", text: "現在、検出されたルール警告はありません。" });
    return messages;
  }

  function renderValidation() {
    const panel = $("#validationPanel");
    const messages = collectValidationMessages();
    panel.classList.remove("hidden");
    panel.innerHTML = `
      <strong>キャラクター作成チェック</strong>
      <ul class="validation-list">
        ${messages.map(message => `<li class="validation-${message.type}">${escapeHtml(message.text)}</li>`).join("")}
      </ul>
    `;
  }

  // -------------------------------------------------------------------
  // 12. JSON保存・読込
  // -------------------------------------------------------------------

  function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function sanitizeFilename(name) {
    return (name || "character").replace(/[\\/:*?"<>|]/g, "_").trim() || "character";
  }

  function exportCharacterJson() {
    // JSONは「人間が読める」「将来のUIから完全復元できる」を優先し、整形して出力します。
    const json = JSON.stringify(character, null, 2);
    downloadBlob(json, `${sanitizeFilename(character.profile.name)}.character.json`, "application/json;charset=utf-8");
  }

  function normalizeImportedCharacter(data) {
    // 古い/手編集されたJSONでもなるべく壊れないように不足プロパティを補います。
    const fresh = createInitialCharacter();
    const merged = deepMerge(fresh, data);

    // 旧バージョンで「skills」が無い場合は標準技能を再作成。
    if (!Array.isArray(merged.skills) || merged.skills.length === 0) merged.skills = createStandardSkills();

    // data.jsの更新で標準技能が追加された場合でも、既存キャラクターに不足分を自動追加します。
    // これにより、既存のlocalStorageやJSONを読み込んだ場合でも「幸運」「アピール」などの
    // 新しい標準技能が追加されます。既存技能の値は変更しません。
    const existingStandardSourceIds = new Set(
      merged.skills
        .filter(skill => !skill.isCustom && skill.sourceId)
        .map(skill => skill.sourceId)
    );
    STANDARD_SKILLS.forEach(skill => {
      if (!existingStandardSourceIds.has(skill.id)) {
        merged.skills.push({
          id: uid("skill"),
          sourceId: skill.id,
          isCustom: false,
          name: skill.name,
          category: skill.category,
          baseValue: skill.baseValue,
          pointCostPerValue: skill.pointCostPerValue,
          occupationPoints: 0,
          freePoints: 0,
          otherModifier: 0,
          note: ""
        });
      }
    });

    if (!Array.isArray(merged.abilities)) merged.abilities = [];
    if (!Array.isArray(merged.gadgets)) merged.gadgets = [];
    if (!Array.isArray(merged.items)) merged.items = [];

    // 旧バージョンのJSONには立ち絵情報が存在しないため、安全に初期化します。
    if (!merged.profile.portraits || typeof merged.profile.portraits !== "object") {
      merged.profile.portraits = { activeId: null, images: [] };
    }
    if (!Array.isArray(merged.profile.portraits.images)) merged.profile.portraits.images = [];
    if (!merged.profile.portraits.activeId && merged.profile.portraits.images[0]) {
      merged.profile.portraits.activeId = merged.profile.portraits.images[0].id;
    }

    merged.abilities = merged.abilities.map(ability => ({
      ...defaultAbility(),
      ...ability,
      attributes: Array.isArray(ability.attributes) ? ability.attributes : [],
      extensions: Array.isArray(ability.extensions) ? ability.extensions : [],
      constraints: Array.isArray(ability.constraints) ? ability.constraints : []
    }));

    return merged;
  }

  function deepMerge(base, override) {
    if (!override || typeof override !== "object") return base;
    if (Array.isArray(base)) return Array.isArray(override) ? override : base;

    const result = { ...base };
    Object.keys(override).forEach(key => {
      if (base[key] && typeof base[key] === "object" && !Array.isArray(base[key]) && override[key] && typeof override[key] === "object" && !Array.isArray(override[key])) {
        result[key] = deepMerge(base[key], override[key]);
      } else {
        result[key] = override[key];
      }
    });
    return result;
  }

  function handleJsonFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data?.kind === "character" && data?.data) {
          // ココフォリアJSONを誤って読み込んだ場合も、最低限プロフィールを取り込めます。
          character = createInitialCharacter();
          character.profile.name = data.data.name || "";
          character.derived.initiativeOverride = data.data.initiative ?? null;
          if (Array.isArray(data.data.params)) {
            data.data.params.forEach(param => {
              const map = { "身体": "body", "器用": "dexterity", "感覚": "sense", "知性": "intelligence", "カリスマ": "charisma", "精神": "mind" };
              if (map[param.label]) character.stats[map[param.label]] = toNumber(param.value);
            });
          }
        } else {
          character = normalizeImportedCharacter(data);
        }
        markPdfNeedsSaving();
        renderAll();
      } catch (error) {
        alert(`JSONの読み込みに失敗しました。\n${error.message}`);
      }
    };
    reader.readAsText(file, "utf-8");
  }

  // -------------------------------------------------------------------
  // 13. PDF出力
  // -------------------------------------------------------------------

  async function exportPdf() {
    // PDFには折りたたみ状態に関係なく「中身をすべて表示」します。
    // 現在の開閉状態は記録しておき、PDF生成後に元へ戻します。
    const collapseStates = captureCollapseStates();
    $$('details').forEach(details => { details.open = true; });

    // html2pdf.jsが存在すれば、WebシートをそのままPDF化します。
    // CDNを読み込めない環境では、ブラウザ標準の印刷ダイアログへフォールバックします。
    if (window.html2pdf) {
      const element = document.querySelector(".content");
      const options = {
        margin: [8, 8, 8, 8],
        filename: `${sanitizeFilename(character.profile.name)}.pdf`,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: { scale: 1.5, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] }
      };
      try {
        await window.html2pdf().set(options).from(element).save();
        pdfSavedSinceLastChange = true;
      } finally {
        restoreCollapseStates(collapseStates);
      }
      return;
    }

    // 印刷ダイアログ経由の保存はブラウザ側で結果を取得できないため、
    // ダイアログを開いた時点で確認済み扱いにします。
    try {
      pdfSavedSinceLastChange = true;
      window.print();
    } finally {
      restoreCollapseStates(collapseStates);
    }
  }

  // -------------------------------------------------------------------
  // 14. 画面全体再描画
  // -------------------------------------------------------------------
  // -------------------------------------------------------------------
  // 14. 入力中にフォームを作り直さず、計算結果だけを更新する
  // -------------------------------------------------------------------

  function updateAbilityCardTotals(card, ability) {
    const totals = calculateAbilityTotals(ability);
    const chips = card.querySelectorAll(".total-chip strong");
    if (chips[0]) chips[0].textContent = String(totals.acquisition);
    if (chips[1]) chips[1].textContent = String(totals.usage);
    if (chips[2]) chips[2].textContent = ability.isCore ? "YES" : "NO";
  }

  function refreshComputedOnly() {
    // 入力欄を再生成すると、文字入力中のカーソルが失われます。
    // そのため通常のタイピング中は「計算結果だけ」を更新します。
    const pools = calculatePointPools();
    const pointCards = $$(".point-card");
    const poolOrder = ["occupation", "ability", "free"];
    pointCards.forEach((card, index) => {
      const pool = pools[poolOrder[index]];
      if (!pool) return;
      const numbers = card.querySelectorAll(".point-number strong");
      if (numbers[0]) numbers[0].textContent = String(pool.base);
      if (numbers[1]) numbers[1].textContent = `${pool.other >= 0 ? "+" : ""}${pool.other}`;
      if (numbers[2]) numbers[2].textContent = String(pool.total);
      if (numbers[3]) numbers[3].textContent = String(pool.used);
      if (numbers[4]) numbers[4].textContent = String(pool.remaining);
    });

    // 異能力カードの取得/使用コストだけを再計算。
    character.abilities.forEach((ability, index) => {
      const cards = $$("#abilitiesContainer .repeat-card");
      if (cards[index]) updateAbilityCardTotals(cards[index], ability);
    });

    renderValidation();
    updateCocofoliaPreview();
  }


  function setupCollapseInteractiveGuards(root = document) {
    // summary内にあるボタン・入力欄を操作したとき、親detailsが意図せず開閉しないようにします。
    // data-guard-attachedで二重登録を防ぎます。
    $$('summary', root).forEach(summary => {
      if (summary.dataset.guardAttached === "1") return;
      summary.dataset.guardAttached = "1";

      summary.addEventListener("click", event => {
        const interactive = event.target.closest("button, input, label, select, textarea");
        if (!interactive) return;

        const details = summary.closest("details");
        const wasOpen = details?.open ?? true;
        // クリックイベントの標準動作でdetailsが開閉したあと、元の状態へ戻します。
        window.setTimeout(() => {
          if (details) details.open = wasOpen;
        }, 0);
      });
    });
  }

  function captureCollapseStates() {
    // 再描画でdetails要素が作り直されても、開閉状態をできるだけ維持します。
    const states = {};
    $$('[data-collapse-id]').forEach(element => {
      states[element.dataset.collapseId] = Boolean(element.open);
    });
    return states;
  }

  function restoreCollapseStates(states) {
    // 新しく追加されたdetailsには「open」属性の初期状態をそのまま使います。
    $$('[data-collapse-id]').forEach(element => {
      const id = element.dataset.collapseId;
      if (Object.prototype.hasOwnProperty.call(states, id)) {
        element.open = states[id];
      }
    });
  }

  function renderAll(sync = true) {
    const collapseStates = captureCollapseStates();

    renderStats();
    renderPoints();
    renderSkills();
    renderAbilities();
    renderGadgetsAndItems();
    renderPortraits();
    setupCollapseInteractiveGuards();
    renderValidation();
    updateCocofoliaPreview();

    if (sync) {
      syncBoundInputs(document);
    }

    // ココフォリアコマンドが空欄なら自動生成。
    if (!character.cocofolia.commands) {
      character.cocofolia.commands = generateDefaultCommands();
      const commandsInput = $("#cocofoliaCommands");
      if (commandsInput) commandsInput.value = character.cocofolia.commands;
    }

    updateCocofoliaPreview();
    restoreCollapseStates(collapseStates);
  }

  // -------------------------------------------------------------------
  // 15. イベント登録
  // -------------------------------------------------------------------

  function setupEvents() {
    // サイドメニュー：各セクションへスクロール。
    $$(".nav-button").forEach(button => {
      button.addEventListener("click", () => {
        $$(".nav-button").forEach(b => b.classList.remove("active"));
        button.classList.add("active");
        document.getElementById(button.dataset.target)?.scrollIntoView({ behavior: "smooth" });
      });
    });

    $("#rollAllStatsButton").addEventListener("click", rollAllStats);
    $("#addSkillButton").addEventListener("click", addCustomSkill);
    $("#addAbilityButton").addEventListener("click", addAbility);
    $("#addGadgetButton").addEventListener("click", addGadget);
    $("#addItemButton").addEventListener("click", addItem);

    $("#newCharacterButton").addEventListener("click", () => {
      if (!confirm("現在の入力内容を破棄して新規キャラクターを作成しますか？\n必要なら先にJSON保存してください。")) return;
      character = createInitialCharacter();
      markPdfNeedsSaving();
      renderAll();
      saveCurrentCharacterToLocalStorage();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    $("#clearCharacterButton").addEventListener("click", clearCurrentCharacter);
    $("#duplicateCharacterButton").addEventListener("click", duplicateCurrentCharacter);
    $("#deleteCharacterButton").addEventListener("click", deleteCurrentCharacter);

    $("#saveJsonButton").addEventListener("click", exportCharacterJson);
    $("#loadJsonInput").addEventListener("change", event => {
      const file = event.target.files?.[0];
      if (file) handleJsonFile(file);
      event.target.value = "";
    });

    $("#pdfButton").addEventListener("click", exportPdf);

    // 立ち絵・差分アップロード。
    $("#portraitUploadInput").addEventListener("change", event => {
      const file = event.target.files?.[0];
      if (file) handlePortraitUpload(file);
      event.target.value = "";
    });
    $("#removePortraitButton").addEventListener("click", removeActivePortrait);

    $("#cocofoliaButton").addEventListener("click", () => {
      const json = JSON.stringify(buildCocofoliaData(), null, 2);
      downloadBlob(json, `${sanitizeFilename(character.profile.name)}.cocofolia.json`, "application/json;charset=utf-8");
    });

    $("#copyCocofoliaButton").addEventListener("click", async () => {
      const json = JSON.stringify(buildCocofoliaData(), null, 2);
      try {
        await navigator.clipboard.writeText(json);
        alert("ココフォリアJSONをクリップボードへコピーしました。");
      } catch {
        prompt("コピーできない場合は、以下を手動でコピーしてください。", json);
      }
    });

    // 入力内容が変更されたら「PDF保存済み」状態を解除します。
    document.addEventListener("input", event => {
      if (event.target.matches("input:not([type=file]), textarea, select")) {
        markPdfNeedsSaving();
      }
    }, true);
    document.addEventListener("change", event => {
      if (event.target.matches("input:not([type=file]), textarea, select")) {
        markPdfNeedsSaving();
      }
    }, true);

    // ページ離脱・再読み込み時の確認。
    // ブラウザの仕様上、表示文言は各ブラウザが決定する場合があります。
    window.addEventListener("beforeunload", event => {
      if (pdfSavedSinceLastChange) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  // -------------------------------------------------------------------
  // 16. 起動
  // -------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", () => {
    // 起動時に、最後に編集していたキャラクターをlocalStorageから復元します。
    const restored = restoreLocalStorageOnStartup();

    // HTMLに直接書いているdata-bind入力の初期値を反映。
    syncBoundInputs(document);
    setupEvents();
    renderAll();
    renderSavedCharacters();

    if (restored) {
      updateAutoSaveStatus("saved", "● 自動保存から復元");
    } else {
      updateAutoSaveStatus("saved", "● ブラウザ内保存準備完了");
      // 初回アクセス時にもキャラクターIDだけは発行しておきます。
      saveCurrentCharacterToLocalStorage();
    }

    // 起動直後はまだユーザー変更がないため、離脱警告は一度解除します。
    pdfSavedSinceLastChange = true;
  });
})();
