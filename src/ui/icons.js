/*
 * 图标模块
 * -----------------------------------------------------------
 * 面板与顶栏用到的内联 SVG（内联而非外链：userscript 不宜引入额外请求；
 * 颜色用 currentColor，随按钮文字色变化）。
 *
 * 三个图标分别用于：面板关闭按钮、统计明细展开/收起按钮、卡比遮罩与顶栏入口。
 */

/**
 * 返回面板关闭按钮的 X 图标 SVG（配合 CSS 的圆形底色，颜色用 currentColor）。
 * @returns {string} SVG字符串。
 */
function getCloseIconSVG() {
  return `
      <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
          <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" fill="none" />
      </svg>
  `;
}

/**
 * 返回面板统计明细「展开/收起」按钮的箭头图标 SVG（收起时朝下，展开时由 CSS 旋转 180°）。
 * @returns {string} SVG字符串。
 */
function getChevronIconSVG() {
  return `
      <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
          <path d="M6 9 L12 15 L18 9" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
  `;
}

/**
 * 返回卡比图标的SVG代码。
 * @returns {string} SVG字符串。
 */
function getKirbySVG() {
  return `
      <svg width="35" height="35" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"  >
          <ellipse cx="70" cy="160" rx="30" ry="15" fill="#cc3333" />
          <ellipse cx="130" cy="160" rx="30" ry="15" fill="#cc3333" />
          <ellipse cx="50" cy="120" rx="20" ry="20" fill="#ffb6c1" />
          <ellipse cx="150" cy="120" rx="20" ry="20" fill="#ffb6c1" />
          <circle cx="100" cy="110" r="60" fill="#ffb6c1" />
          <ellipse cx="80" cy="90" rx="10" ry="22" fill="blue" />
          <ellipse cx="80" cy="88" rx="10" ry="15" fill="black" />
          <ellipse cx="80" cy="82" rx="8" ry="12" fill="#ffffff" />
          <ellipse cx="80" cy="90" rx="10" ry="22" fill="#00000000" stroke="#000000" strokeWidth="4" />
          <ellipse cx="120" cy="90" rx="10" ry="22" fill="blue" />
          <ellipse cx="120" cy="88" rx="10" ry="15" fill="black" />
          <ellipse cx="120" cy="82" rx="8" ry="12" fill="#ffffff" />
          <ellipse cx="120" cy="90" rx="10" ry="22" fill="#00000000" stroke="#000000" strokeWidth="4" />
          <ellipse cx="60" cy="110" rx="8" ry="5" fill="#ff4466" />
          <ellipse cx="140" cy="110" rx="8" ry="5" fill="#ff4466" />
          <path d="M 90 118 Q 100 125, 110 118" stroke="black" strokeWidth="3" fill="transparent" />
      </svg>
  `;
}
