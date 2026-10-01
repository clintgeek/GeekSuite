/**
 * Where a character of a <textarea> sits on screen, in viewport pixels:
 * `{ top, left, height }` of the caret before `index`. A textarea has no API
 * for this, so a hidden mirror div copies its box and text styles, holds the
 * text up to `index`, and a marker span is measured. Used to float the [[
 * picker next to the caret on desktop (on a phone it docks above the
 * keyboard instead).
 */
const COPIED = [
    'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight', 'fontFamily',
    'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize',
];

export function caretRect(textarea, index) {
    if (!textarea || typeof window === 'undefined') return null;
    const style = window.getComputedStyle(textarea);
    const mirror = document.createElement('div');
    for (const prop of COPIED) mirror.style[prop] = style[prop];
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.top = '0';
    mirror.style.left = '-9999px';
    mirror.textContent = textarea.value.slice(0, index);
    const marker = document.createElement('span');
    marker.textContent = textarea.value.slice(index, index + 1) || '.';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4 || 20;
    const box = textarea.getBoundingClientRect();
    const rect = {
        top: box.top + marker.offsetTop - textarea.scrollTop,
        left: box.left + marker.offsetLeft - textarea.scrollLeft,
        height: lineHeight,
    };
    document.body.removeChild(mirror);
    return rect;
}
